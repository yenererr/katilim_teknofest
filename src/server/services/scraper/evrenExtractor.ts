import { z } from "zod";
import { callEvrenChat } from "../evren/evrenChat";
import type {
  ContentCategory,
  ExtractedFinancialRecord,
} from "../scraper/scraperTypes";
import { isPrimaryFinanceCategory } from "../scraper/bankSourceConfig";
import { asciiKatla } from "../../../nlp/normalize";
import { kuralTabanliCikar } from "../../../nlp/extract";

const recordSchema = z.object({
  title: z.string().nullable().optional(),
  recordType: z.enum(["campaign", "product", "fee", "rate"]),
  category: z.string(),
  productName: z.string().nullable().optional(),
  productType: z.string().nullable().optional(),
  profitRate: z.number().nullable().optional(),
  ratePeriod: z.enum(["monthly", "annual", "unknown"]).nullable().optional(),
  minAmountTl: z.number().nullable().optional(),
  maxAmountTl: z.number().nullable().optional(),
  minTermMonths: z.number().nullable().optional(),
  maxTermMonths: z.number().nullable().optional(),
  installmentCount: z.number().nullable().optional(),
  allocationFeeValue: z.number().nullable().optional(),
  allocationFeeType: z.enum(["fixed", "percentage"]).nullable().optional(),
  rewardAmountTl: z.number().nullable().optional(),
  rewardType: z.string().nullable().optional(),
  campaignStart: z.string().nullable().optional(),
  campaignEnd: z.string().nullable().optional(),
  targetSegments: z.array(z.string()).optional(),
  participationMethod: z.string().nullable().optional(),
  conditions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  campaignStatus: z
    .enum(["active", "expired", "upcoming", "unknown"])
    .optional(),
  evidence: z
    .array(
      z.object({
        field: z.string(),
        text: z.string(),
        confidence: z.number(),
      }),
    )
    .optional(),
  manualReviewRequired: z.boolean().optional(),
});

const EXTRACT_SYSTEM = `Sen katılım bankacılığı bilgi çıkarım ajanısın.
Yalnızca verilen resmî sayfa metninden JSON üret.
Kaynakta olmayan alanı null bırak. Tahmin etme. Matematik yapma.
Faiz ile kâr payını birbirine dönüştürme.
İndirim yüzdesini kâr payı sanma. Kart kampanyasını finansman kampanyası sanma.
Katılma hesabı kâr paylaşımını finansman kullanım oranı sanma.
Her kritik alan için evidence metni ekle.
Yanıtı kısa tut: en fazla 5 kayıt. Yanıt: { "records": [ ... ] }`;

function verifyNumberInText(
  value: number | null | undefined,
  text: string,
): boolean {
  if (value == null) return true;
  const variants = [
    String(value),
    String(value).replace(".", ","),
    (value * 100).toFixed(2).replace(".", ","),
    `%${(value * 100).toFixed(2).replace(".", ",")}`,
  ];
  return variants.some((v) => text.includes(v));
}

function inferCategory(
  text: string,
  hint?: ContentCategory,
): ContentCategory {
  if (hint && hint !== "general_announcement" && hint !== "irrelevant") {
    return hint;
  }
  const t = asciiKatla(text);
  if (/konut|mortgage|gayrimenkul/.test(t)) return "housing_finance";
  if (/tasit|arac|otomobil|araba/.test(t)) return "vehicle_finance";
  if (/ticari|kobi|isletme/.test(t)) return "commercial_finance";
  if (/alisveris/.test(t)) return "shopping_finance";
  if (/ihtiyac|tuketici|bireysel finansman|finansman/.test(t)) {
    return "consumer_finance";
  }
  return hint || "general_announcement";
}

/**
 * EVREN başarısız olduğunda NLP kural katmanı ile yapılandırılmış kayıt üretir.
 * Kaynakta sinyal yoksa boş döner — uydurma yapmaz.
 */
export function ruleBasedExtractRecords(opts: {
  bankId: string;
  sourceUrl: string;
  text: string;
  categoryHint?: ContentCategory;
}): ExtractedFinancialRecord[] {
  const clipped = opts.text.slice(0, 20_000);
  const t = asciiKatla(clipped);
  const financeSignal =
    /finansman|kar\s*pay|kredi|vade|tahsis|konut|tasit|ihtiyac|kampanya/.test(
      t,
    );
  if (!financeSignal) return [];

  const kural = kuralTabanliCikar(clipped);
  const hasSignal =
    kural.kar_payi_orani.deger != null ||
    kural.vade_ay.max != null ||
    kural.vade_ay.min != null ||
    kural.tutar.max != null ||
    kural.tutar.min != null ||
    kural.tahsis_ucreti.deger != null;

  if (!hasSignal) return [];

  const category = inferCategory(clipped, opts.categoryHint);
  if (
    category === "irrelevant" ||
    category === "card_campaign" ||
    category === "discount_campaign" ||
    category === "insurance" ||
    category === "investment_product"
  ) {
    return [];
  }

  const evidence: ExtractedFinancialRecord["evidence"] = [];
  if (kural.kar_payi_orani.kanit) {
    evidence.push({
      field: "profitRate",
      text: kural.kar_payi_orani.kanit,
      confidence: kural.kar_payi_orani.guven,
    });
  }
  if (kural.vade_ay.kanit) {
    evidence.push({
      field: "term",
      text: kural.vade_ay.kanit,
      confidence: kural.vade_ay.guven,
    });
  }
  if (kural.tutar.kanit) {
    evidence.push({
      field: "amount",
      text: kural.tutar.kanit,
      confidence: kural.tutar.guven,
    });
  }

  const productName =
    category === "housing_finance"
      ? "Konut Finansmanı"
      : category === "vehicle_finance"
        ? "Taşıt Finansmanı"
        : category === "commercial_finance"
          ? "Ticari Finansman"
          : category === "shopping_finance"
            ? "Alışveriş Finansmanı"
            : "İhtiyaç Finansmanı";

  const ratePeriod =
    kural.kar_payi_orani.periyot === "aylik"
      ? ("monthly" as const)
      : kural.kar_payi_orani.periyot === "yillik"
        ? ("annual" as const)
        : ("unknown" as const);

  return [
    {
      bankId: opts.bankId,
      sourceUrl: opts.sourceUrl,
      sourceCheckedAt: new Date().toISOString(),
      title: productName,
      recordType: "product",
      category,
      productName,
      productType: null,
      profitRate: kural.kar_payi_orani.deger,
      ratePeriod,
      minAmountTl: kural.tutar.min,
      maxAmountTl: kural.tutar.max,
      minTermMonths: kural.vade_ay.min,
      maxTermMonths: kural.vade_ay.max,
      installmentCount: null,
      allocationFeeValue: kural.tahsis_ucreti.deger,
      allocationFeeType:
        kural.tahsis_ucreti.deger != null ? "fixed" : null,
      rewardAmountTl: null,
      rewardType: null,
      campaignStart: null,
      campaignEnd: null,
      targetSegments: [],
      participationMethod: null,
      conditions: [],
      exclusions: [],
      campaignStatus: "active",
      evidence,
      manualReviewRequired: true,
    },
  ];
}

function parseEvrenRecords(
  rawContent: string,
  opts: {
    bankId: string;
    sourceUrl: string;
    text: string;
    categoryHint?: ContentCategory;
  },
): ExtractedFinancialRecord[] {
  let parsed: unknown;
  try {
    let raw = rawContent.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```json?\s*/i, "").replace(/```$/, "").trim();
    }
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const recordsRaw = (parsed as { records?: unknown }).records;
  if (!Array.isArray(recordsRaw)) return [];

  const now = new Date().toISOString();
  const out: ExtractedFinancialRecord[] = [];

  for (const item of recordsRaw) {
    const v = recordSchema.safeParse(item);
    if (!v.success) continue;
    const r = v.data;
    const category = (r.category ||
      opts.categoryHint ||
      "general_announcement") as ContentCategory;

    if (category === "irrelevant") continue;

    let manual = Boolean(r.manualReviewRequired);
    if (r.profitRate != null && !verifyNumberInText(r.profitRate, opts.text)) {
      manual = true;
    }
    if (
      r.allocationFeeValue != null &&
      !verifyNumberInText(r.allocationFeeValue, opts.text)
    ) {
      manual = true;
    }

    out.push({
      bankId: opts.bankId,
      sourceUrl: opts.sourceUrl,
      sourceCheckedAt: now,
      title: r.title ?? null,
      recordType: r.recordType,
      category,
      productName: r.productName ?? null,
      productType: r.productType ?? null,
      profitRate: r.profitRate ?? null,
      ratePeriod: r.ratePeriod ?? null,
      minAmountTl: r.minAmountTl ?? null,
      maxAmountTl: r.maxAmountTl ?? null,
      minTermMonths: r.minTermMonths ?? null,
      maxTermMonths: r.maxTermMonths ?? null,
      installmentCount: r.installmentCount ?? null,
      allocationFeeValue: r.allocationFeeValue ?? null,
      allocationFeeType: r.allocationFeeType ?? null,
      rewardAmountTl: r.rewardAmountTl ?? null,
      rewardType: r.rewardType ?? null,
      campaignStart: r.campaignStart ?? null,
      campaignEnd: r.campaignEnd ?? null,
      targetSegments: r.targetSegments ?? [],
      participationMethod: r.participationMethod ?? null,
      conditions: r.conditions ?? [],
      exclusions: r.exclusions ?? [],
      campaignStatus: r.campaignStatus ?? "unknown",
      evidence: r.evidence ?? [],
      manualReviewRequired: manual,
    });
  }

  return out.filter((r) => r.category !== "irrelevant");
}

export async function extractFinancialRecordsFromText(opts: {
  bankId: string;
  sourceUrl: string;
  text: string;
  categoryHint?: ContentCategory;
}): Promise<ExtractedFinancialRecord[]> {
  const clipped = opts.text.slice(0, 8_000);
  if (clipped.length < 80) return [];

  const extractOpts = {
    bankId: opts.bankId,
    sourceUrl: opts.sourceUrl,
    text: clipped,
    categoryHint: opts.categoryHint,
  };

  try {
    const evren = await callEvrenChat({
      systemPrompt: EXTRACT_SYSTEM,
      userPrompt: `Banka: ${opts.bankId}\nURL: ${opts.sourceUrl}\nKategori ipucu: ${opts.categoryHint || "unknown"}\n\nMETİN:\n${clipped}`,
      temperature: 0,
      jsonMode: true,
      maxTokens: 2048,
    });

    if (evren?.content) {
      const fromLlm = parseEvrenRecords(evren.content, extractOpts);
      if (fromLlm.length > 0) return fromLlm;
    }
  } catch (err) {
    console.warn(
      `[Scraper] ${opts.bankId} EVREN çıkarımı başarısız, kural katmanına düşülüyor:`,
      err instanceof Error ? err.message : err,
    );
  }

  return ruleBasedExtractRecords(extractOpts);
}

export { isPrimaryFinanceCategory };
