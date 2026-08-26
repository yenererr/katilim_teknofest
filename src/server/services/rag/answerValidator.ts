import { citationTitle, extractCitationRefs } from "./citationService";
import type {
  ComparisonToolResult,
  RagAnswer,
  RetrievedChunk,
  StructuredProductHit,
} from "./ragTypes";
import { ALLOWED_BANK_DOMAINS } from "./ragTypes";

function isAllowedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return ALLOWED_BANK_DOMAINS.some(
      (d) => host === d || host.endsWith(`.${d}`),
    );
  } catch {
    return false;
  }
}

function collectKnownNumbers(
  products: StructuredProductHit[],
  comparison: ComparisonToolResult | null,
  chunks: RetrievedChunk[],
): Set<string> {
  const known = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      known.add(String(v));
      known.add((v * 100).toFixed(2));
      known.add(v.toFixed(4));
      known.add(v.toFixed(2));
    }
    if (typeof v === "string" && /\d/.test(v)) {
      const nums = v.match(/\d+([.,]\d+)?/g) || [];
      nums.forEach((n) => known.add(n.replace(",", ".")));
    }
  };

  for (const hit of products) {
    const t = (hit.product.terimler || {}) as Record<string, any>;
    add(t.kar_payi_orani?.deger);
    add(t.kar_payi_orani?.ham);
    add(t.vade_ay?.max);
    add(t.vade_ay?.min);
    add(t.tahsis_ucreti?.deger);
    add(t.tahsis_ucreti?.ham);
    add(t.odul?.deger);
    add(hit.product.kampanya_bitis);
  }
  if (comparison) {
    for (const r of comparison.ranked) {
      add(r.metricValue);
      add(r.metricDisplay);
    }
  }
  for (const c of chunks) {
    add(c.chunkText);
  }
  return known;
}

/**
 * LLM cevabını kullanıcıya vermeden önce doğrular.
 */
export function validateRagAnswer(opts: {
  answer: RagAnswer;
  chunks: RetrievedChunk[];
  products: StructuredProductHit[];
  comparison: ComparisonToolResult | null;
}): { ok: boolean; reasons: string[]; answer: RagAnswer } {
  const reasons: string[] = [];
  const citationIds = new Set(opts.chunks.map((c) => c.citationId));
  const refs = extractCitationRefs(opts.answer.answer);

  for (const id of refs) {
    if (!citationIds.has(id)) {
      reasons.push(`Geçersiz kaynak referansı: [KAYNAK ${id}]`);
    }
  }

  for (const c of opts.answer.citations) {
    if (c.sourceUrl && !isAllowedUrl(c.sourceUrl)) {
      reasons.push(`İzin verilmeyen kaynak URL: ${c.sourceUrl}`);
    }
    if (c.id && !citationIds.has(c.id) && opts.chunks.length > 0) {
      reasons.push(`Citations listesinde tanımsız id: ${c.id}`);
    }
  }

  // Demo bayrağı
  if (opts.products.some((p) => p.isDemo)) {
    reasons.push("Demo veri gerçek bilgi gibi kullanılamaz.");
  }
  if (/demo veri|örnek şablon gerçek banka/i.test(opts.answer.answer)) {
    // informational only
  }

  // Süresi dolmuş kampanyayı aktif gösterme
  if (/aktif kampanya/i.test(opts.answer.answer)) {
    const expiredMentioned = opts.products.some((p) => {
      const end = p.product.kampanya_bitis;
      if (!end) return false;
      const ts = Date.parse(String(end));
      return Number.isFinite(ts) && ts < Date.now();
    });
    if (expiredMentioned && !/süresi dolmuş|dolmuş kampanya|aktif değil/i.test(opts.answer.answer)) {
      reasons.push("Süresi dolmuş kampanya aktif gibi sunulmuş olabilir.");
    }
  }

  // Karşılaştırma uyumu
  if (opts.comparison?.comparable && opts.comparison.result.winnerBank) {
    const winner = String(opts.comparison.result.winnerBank);
    const metric = String(opts.comparison.result.winnerMetric || "");
    if (
      opts.answer.status === "answered" &&
      metric &&
      !opts.answer.answer.includes(winner) &&
      !JSON.stringify(opts.answer.products).includes(winner)
    ) {
      reasons.push("Karşılaştırma kazananı cevapta yer almıyor.");
    }
  }

  // Uydurma sayı tespiti (kaba): cevaptaki %x,xx kalıpları bilinenlerle kesişmeli
  const known = collectKnownNumbers(
    opts.products,
    opts.comparison,
    opts.chunks,
  );
  const percentClaims = opts.answer.answer.match(/%\s*\d+([.,]\d+)?/g) || [];
  for (const claim of percentClaims) {
    const num = claim.replace(/%\s*/, "").replace(",", ".");
    const ok =
      known.has(num) ||
      [...known].some((k) => k.includes(num) || num.includes(k));
    if (!ok && opts.products.length > 0) {
      reasons.push(`Kaynakta doğrulanamayan oran iddiası: ${claim}`);
    }
  }

  if (reasons.length) {
    return {
      ok: false,
      reasons,
      answer: {
        answer:
          "Bu bilgi mevcut kaynaklarla güvenilir şekilde doğrulanamadı.",
        status: "insufficient_data",
        products: [],
        citations: opts.chunks.length
          ? opts.chunks.slice(0, 3).map((c) => ({
              id: c.citationId,
              title: citationTitle(c.documentType, c.productName),
              bankName: c.bankName,
              sourceUrl: c.sourceUrl,
              sourceCheckedAt: c.sourceCheckedAt,
              evidenceText: c.chunkText.slice(0, 300),
            }))
          : [],
        warnings: reasons,
        dataAsOf: opts.answer.dataAsOf,
      },
    };
  }

  // Citations'ı backend chunks ile hizala (LLM URL uydurmasın)
  const syncedCitations = opts.chunks.map((c) => ({
    id: c.citationId,
    title: citationTitle(c.documentType, c.productName),
    bankName: c.bankName,
    sourceUrl: c.sourceUrl,
    sourceCheckedAt: c.sourceCheckedAt,
    evidenceText: c.chunkText.slice(0, 500),
  }));

  return {
    ok: true,
    reasons: [],
    answer: {
      ...opts.answer,
      citations: syncedCitations.length ? syncedCitations : opts.answer.citations,
    },
  };
}
