import crypto from "crypto";
import { buildRagContext } from "./contextBuilder";
import { generateRagAnswer, safeFallback } from "./answerGenerator";
import { validateRagAnswer } from "./answerValidator";
import { planQuery } from "./queryPlanner";
import { retrieveForPlan } from "./retriever";
import { freshnessLabel } from "./freshnessService";
import { compareProductsTool } from "../tools/compareProductsTool";
import { refreshSourcesForQuery } from "../tools/refreshSourceTool";
import type {
  ComparisonToolResult,
  FreshnessStatus,
  RagAnswer,
  RagChatResponse,
  RagObservability,
  RetrievedChunk,
} from "./ragTypes";

/** Kısa konuşma bağlamı — finansal değerleri yeniden kullanmaz */
const conversationMemory = new Map<
  string,
  Array<{ role: "user" | "assistant"; text: string; at: string }>
>();

function remember(conversationId: string, role: "user" | "assistant", text: string) {
  const list = conversationMemory.get(conversationId) || [];
  list.push({ role, text: text.slice(0, 500), at: new Date().toISOString() });
  conversationMemory.set(conversationId, list.slice(-6));
}

function priorContext(conversationId?: string): string {
  if (!conversationId) return "";
  const list = conversationMemory.get(conversationId) || [];
  if (!list.length) return "";
  return (
    "Önceki konuşma (yalnızca niyet bağlamı; finansal değerleri güncel sanma):\n" +
    list.map((m) => `${m.role}: ${m.text}`).join("\n")
  );
}

function toCitations(chunks: RetrievedChunk[]) {
  return chunks.slice(0, 8).map((c) => ({
    id: c.citationId,
    title: c.productName || `${c.bankName} — ${c.documentType}`,
    bankName: c.bankName,
    sourceUrl: c.sourceUrl,
    sourceCheckedAt: c.sourceCheckedAt,
    evidenceText: c.chunkText.slice(0, 500),
  }));
}

function buildDeterministicComparisonAnswer(opts: {
  chunks: RetrievedChunk[];
  comparison: ComparisonToolResult | null;
  dataAsOf: string;
  warnings: string[];
}): RagAnswer {
  const ranked = opts.comparison?.ranked || [];
  const best = ranked[0];
  const bestMetricMissing =
    !best || best.metricValue === null || best.metricDisplay === null;

  if (!ranked.length || bestMetricMissing) {
    return {
      answer:
        "36 ay vadeye ait doğrulanmış kâr payı oranı bulunamadı; bu nedenle en düşük oran karşılaştırılamadı.",
      status: "insufficient_data",
      products: [],
      citations: toCitations(opts.chunks),
      warnings: opts.warnings,
      dataAsOf: opts.dataAsOf,
    };
  }

  const top = ranked.slice(0, 3);
  const lines = top.map((r, i) => {
    const metric = r.metricDisplay || "Belirtilmemiş";
    return `${i + 1}. ${r.bankName} — ${r.productName} (${metric})`;
  });

  return {
    answer:
      `Karşılaştırmayı backend deterministik kriterleriyle yaptım.\n\n` +
      `En avantajlı görünen seçenek: ${best.bankName} — ${best.productName}` +
      (best.metricDisplay ? ` (${best.metricDisplay})` : "") +
      `.\n\n` +
      `İlk 3 doğrulanmış sonuç:\n${lines.join("\n")}`,
    status: "answered",
    products: top.map((r) => ({
      productId: r.productId,
      bankName: r.bankName,
      productName: r.productName,
      verifiedFields: {
        metricLabel: r.metricLabel,
        metricValue: r.metricValue,
        metricDisplay: r.metricDisplay,
      },
      freshnessStatus: "MIXED",
    })),
    citations: toCitations(opts.chunks),
    warnings: opts.warnings,
    calculation: opts.comparison
      ? {
          method: opts.comparison.method,
          inputs: opts.comparison.inputs,
          result: opts.comparison.result,
        }
      : undefined,
    dataAsOf: opts.dataAsOf,
  };
}

export async function runRagChat(opts: {
  message: string;
  conversationId?: string;
  forceRefresh?: boolean;
}): Promise<RagChatResponse> {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const plan = planQuery(opts.message);

  if (plan.intent === "unsupported") {
    return {
      requestId,
      answer:
        "Bu soru KatılımFinans Asistanı kapsamı dışında. Yatırım tavsiyesi vermem; yalnızca resmî kaynaklardan doğrulanmış ürün/kampanya bilgisi sunarım.",
      status: "unsupported",
      products: [],
      citations: [],
      warnings: [],
      dataAsOf: new Date().toISOString(),
    };
  }

  if (plan.clarificationQuestion && plan.intent === "comparison") {
    return {
      requestId,
      answer: plan.clarificationQuestion,
      status: "clarification_required",
      products: [],
      citations: [],
      warnings: ["Karşılaştırma için zorunlu parametre eksik."],
      dataAsOf: new Date().toISOString(),
    };
  }

  const refresh = plan.requiresFreshData
    ? await refreshSourcesForQuery({
        bankIds: plan.bankIds,
        force: opts.forceRefresh,
      })
    : {
        refreshed: [],
        skipped: [],
        freshnessByBank: {} as Record<string, FreshnessStatus>,
        warnings: [] as string[],
      };

  const retrieved = await retrieveForPlan(opts.message, plan);

  let comparison: ComparisonToolResult | null = null;
  if (plan.requiresCalculation && retrieved.products.length) {
    comparison = compareProductsTool(retrieved.products, plan, opts.message);
  }

  const freshnessValues = [
    ...retrieved.products.map((p) => p.freshness),
    ...retrieved.chunks.map((c) => c.freshness),
    ...Object.values(refresh.freshnessByBank),
  ];
  const overallFreshness: FreshnessStatus | "MIXED" = (() => {
    if (!freshnessValues.length) return "UNKNOWN";
    const uniq = new Set(freshnessValues);
    if (uniq.size === 1) return freshnessValues[0];
    return "MIXED";
  })();

  const dataAsOf =
    retrieved.products
      .map((p) => p.lastCheckedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || new Date().toISOString();

  // Karşılaştırma sorularında LLM'e gitmeden deterministik cevap ver (hız ve stabilite).
  if (comparison && (plan.intent === "comparison" || plan.intent === "calculation")) {
    const deterministic = buildDeterministicComparisonAnswer({
      chunks: retrieved.chunks,
      comparison,
      dataAsOf,
      warnings: [...refresh.warnings],
    });
    return {
      ...deterministic,
      requestId,
      observability: {
        request_id: requestId,
        intent: plan.intent,
        retrieval_duration_ms: retrieved.retrievalDurationMs,
        structured_query_duration_ms: retrieved.structuredDurationMs,
        llm_duration_ms: 0,
        total_duration_ms: Date.now() - started,
        retrieved_chunk_count: retrieved.chunks.length,
        used_source_count: deterministic.citations.length,
        freshness_status: overallFreshness,
        model_alias: null,
        fallback_used: false,
        validation_status: "skipped",
      },
    };
  }

  if (!retrieved.chunks.length && !retrieved.products.length) {
    const empty = safeFallback(
      "insufficient_data",
      "Resmî kaynakta doğrulanamadı. Canlı ürün veya vektör kaydı bulunamadı; veri henüz indekslenmemiş veya filtrelerle eşleşmedi.",
      dataAsOf,
      [
        ...refresh.warnings,
        freshnessLabel(
          overallFreshness === "MIXED" ? "STALE" : overallFreshness,
        ),
      ],
    );
    return { ...empty, requestId };
  }

  const { contextText } = buildRagContext({
    query: opts.message,
    chunks: retrieved.chunks,
    products: retrieved.products,
    comparison,
  });

  const prior = priorContext(opts.conversationId);
  const generated = await generateRagAnswer({
    userMessage: opts.message,
    plan,
    contextText: prior ? `${prior}\n\n${contextText}` : contextText,
    dataAsOf,
  });

  // Karşılaştırma metadata'sını backend sonucundan zorla
  if (comparison) {
    generated.answer.calculation = {
      method: comparison.method,
      inputs: comparison.inputs,
      result: comparison.result,
    };
    generated.answer.warnings = [
      ...new Set([
        ...generated.answer.warnings,
        ...comparison.warnings,
        ...refresh.warnings,
      ]),
    ];
  } else {
    generated.answer.warnings = [
      ...new Set([...generated.answer.warnings, ...refresh.warnings]),
    ];
  }

  if (overallFreshness === "STALE" || overallFreshness === "EXPIRED") {
    generated.answer.warnings.push(
      `Veri anlık değildir; son doğrulama zamanına aittir (${dataAsOf}). Güncellik: ${overallFreshness}.`,
    );
    if (generated.answer.status === "answered") {
      generated.answer.status = "stale_data";
    }
  }
  if (overallFreshness === "FAILED") {
    generated.answer.warnings.push(
      "Bazı kaynakların yenilemesi başarısız; eski veri güncelmiş gibi sunulmaz.",
    );
  }

  // Ürün tablosu LLM'den değil, doğrulanmış backend kayıtlarından doldurulur.
  // Böylece model bu veriyi yeniden üretmek zorunda kalmaz (gecikme) ve
  // alanlar kaynakla birebir aynı kalır.
  generated.answer.products = retrieved.products.map((p) => ({
    productId: p.productId,
    bankName: p.bankName,
    productName: [p.product.product_name, p.product.urun_adi].find(
      (v): v is string => typeof v === "string" && v.length > 0,
    ),
    verifiedFields: p.product,
    freshnessStatus: p.freshness,
  }));

  const validated = validateRagAnswer({
    answer: generated.answer,
    chunks: retrieved.chunks,
    products: retrieved.products,
    comparison,
  });

  let finalAnswer = validated.answer;
  finalAnswer.dataAsOf = dataAsOf;

  if (
    finalAnswer.status === "insufficient_data" &&
    retrieved.chunks.length > 0 &&
    !comparison
  ) {
    finalAnswer = {
      answer:
        "Resmî kaynaklarda ilgili içerikleri buldum ancak bu soruya net sayısal cevap üretecek düzeyde doğrulanmış yapılandırılmış veri henüz tamamlanmamış görünüyor. Aşağıdaki kaynakları inceleyebilir veya soruyu tutar/vade/banka belirterek daraltabilirsiniz.",
      status: "answered",
      products: retrieved.products.slice(0, 5).map((p) => ({
        productId: p.productId,
        bankName: p.bankName,
        productName: String((p.product as Record<string, unknown>).urun_adi || ""),
        verifiedFields: {},
        freshnessStatus: p.freshness,
      })),
      citations: toCitations(retrieved.chunks),
      warnings: [
        ...new Set([
          ...finalAnswer.warnings,
          "LLM yanıtı yeterli olmadığından deterministic kaynak özeti gösterildi.",
        ]),
      ],
      dataAsOf,
    };
  }

  if (opts.conversationId) {
    remember(opts.conversationId, "user", opts.message);
    remember(opts.conversationId, "assistant", finalAnswer.answer);
  }

  const observability: RagObservability = {
    request_id: requestId,
    intent: plan.intent,
    retrieval_duration_ms: retrieved.retrievalDurationMs,
    structured_query_duration_ms: retrieved.structuredDurationMs,
    llm_duration_ms: generated.llmDurationMs,
    total_duration_ms: Date.now() - started,
    retrieved_chunk_count: retrieved.chunks.length,
    used_source_count: finalAnswer.citations.length,
    freshness_status: overallFreshness,
    model_alias: generated.modelAlias,
    fallback_used: generated.fallbackUsed || !validated.ok,
    validation_status: validated.ok ? "passed" : "failed",
  };

  console.log(
    "[RAG]",
    JSON.stringify({
      ...observability,
      // kullanıcı mesajı ve anahtar yok
    }),
  );

  return {
    ...finalAnswer,
    requestId,
    observability,
  };
}
