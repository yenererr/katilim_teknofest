import { z } from "zod";
import { callEvrenChat, sanitizeEvrenError } from "../evren/evrenChat";
import type { RagAnswer, RagAnswerStatus, RagQueryPlan } from "./ragTypes";
import { RAG_SYSTEM_PROMPT } from "../../../lib/assistantPersona";

export { RAG_SYSTEM_PROMPT };
export const ragAnswerSchema = z.object({
  answer: z.string().min(1).max(8000),
  status: z.enum([
    "answered",
    "insufficient_data",
    "stale_data",
    "clarification_required",
    "unsupported",
  ]),
  // products ve citations backend verisinden doldurulur (answerValidator).
  // LLM göndermez; gönderirse yok sayılmadan önce şema geçerli kalsın diye opsiyoneldir.
  products: z
    .array(
      z.object({
        productId: z.string().optional(),
        bankName: z.string(),
        productName: z.string().optional(),
        verifiedFields: z.record(z.string(), z.unknown()).default({}),
        freshnessStatus: z.string(),
      }),
    )
    .default([]),
  citations: z
    .array(
      z.object({
        id: z.number().int().positive(),
        title: z.string().optional(),
        bankName: z.string(),
        sourceUrl: z.string(),
        sourceCheckedAt: z.string(),
        evidenceText: z.string(),
      }),
    )
    .default([]),
  warnings: z.array(z.string()).default([]),
  calculation: z
    .object({
      method: z.string(),
      inputs: z.record(z.string(), z.unknown()),
      result: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .optional(),
});

function parseJsonContent(raw: string): unknown {
  let clean = raw.trim();
  if (clean.startsWith("```json")) {
    clean = clean.replace(/^```json\s*/, "").replace(/```$/, "").trim();
  } else if (clean.startsWith("```")) {
    clean = clean.replace(/^```\s*/, "").replace(/```$/, "").trim();
  }
  return JSON.parse(clean);
}

export type GenerateAnswerResult = {
  answer: RagAnswer;
  modelAlias: string | null;
  llmDurationMs: number;
  fallbackUsed: boolean;
};

export async function generateRagAnswer(opts: {
  userMessage: string;
  plan: RagQueryPlan;
  contextText: string;
  dataAsOf: string;
  fetchImpl?: typeof fetch;
}): Promise<GenerateAnswerResult> {
  const t0 = Date.now();
  const ragTimeoutMs = Number(process.env.EVREN_RAG_TIMEOUT_MS || 25000);
  const userPrompt = [
    `Kullanıcı sorusu: ${opts.userMessage}`,
    `Sorgu niyeti: ${opts.plan.intent}`,
    `Veri zaman damgası (dataAsOf): ${opts.dataAsOf}`,
    opts.plan.clarificationQuestion
      ? `Eksik parametre notu: ${opts.plan.clarificationQuestion}`
      : "",
    "",
    opts.contextText,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const evren = await callEvrenChat({
      systemPrompt: RAG_SYSTEM_PROMPT,
      userPrompt,
      jsonMode: true,
      temperature: 0,
      // Model cevaptan önce uzun bir muhakeme çıktısı üretiyor; sınır dar
      // olduğunda bütçe muhakemede tükeniyor ve içerik boş dönüyordu
      // ("EVREN API boş yanıt döndürdü"), her soru hazır şablona düşüyordu.
      maxTokens: 4096,
      fetchImpl: opts.fetchImpl,
      timeoutMs: ragTimeoutMs,
    });

    if (!evren) {
      return {
        answer: safeFallback(
          "insufficient_data",
          "Şu an cevap üretemiyorum; dil modeli bağlantısı yapılandırılmamış.",
          opts.dataAsOf,
        ),
        modelAlias: null,
        llmDurationMs: Date.now() - t0,
        fallbackUsed: true,
      };
    }

    let parsed: unknown;
    try {
      parsed = parseJsonContent(evren.content);
    } catch {
      // Tek sınırlı düzeltme denemesi
      const fix = await callEvrenChat({
        systemPrompt:
          "Önceki çıktıyı geçerli JSON'a çevir. Yalnızca JSON döndür. Yeni finansal sayı uydurma.",
        userPrompt: evren.content.slice(0, 6000),
        jsonMode: true,
        temperature: 0,
        maxTokens: 1200,
        fetchImpl: opts.fetchImpl,
        timeoutMs: ragTimeoutMs,
      });
      if (!fix) throw new Error("JSON düzeltme başarısız");
      parsed = parseJsonContent(fix.content);
    }

    const validated = ragAnswerSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        answer: safeFallback(
          "insufficient_data",
          "Bu bilgiyi elimdeki kaynaklarla teyit edemedim, o yüzden tahmin yürütmüyorum.",
          opts.dataAsOf,
          ["LLM çıktısı şema doğrulamasından geçmedi."],
        ),
        modelAlias: evren.usedModel,
        llmDurationMs: Date.now() - t0,
        fallbackUsed: true,
      };
    }

    const data = validated.data;
    return {
      answer: {
        ...data,
        calculation: data.calculation ?? undefined,
        dataAsOf: opts.dataAsOf,
      },
      modelAlias: evren.usedModel,
      llmDurationMs: Date.now() - t0,
      fallbackUsed: false,
    };
  } catch (err) {
    const msg = sanitizeEvrenError(
      err instanceof Error ? err.message : "LLM hatası",
    );
    return {
      answer: safeFallback(
        "insufficient_data",
        "Bu bilgiyi elimdeki kaynaklarla teyit edemedim, o yüzden tahmin yürütmüyorum.",
        opts.dataAsOf,
        [msg],
      ),
      modelAlias: null,
      llmDurationMs: Date.now() - t0,
      fallbackUsed: true,
    };
  }
}

export function safeFallback(
  status: RagAnswerStatus,
  answer: string,
  dataAsOf: string,
  warnings: string[] = [],
): RagAnswer {
  return {
    answer,
    status,
    products: [],
    citations: [],
    warnings,
    dataAsOf,
  };
}
