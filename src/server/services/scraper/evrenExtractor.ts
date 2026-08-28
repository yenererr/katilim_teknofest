import { z } from "zod";
import { callEvrenChat } from "../evren/evrenChat";
import type {
  ContentCategory,
  ExtractedFinancialRecord,
} from "../scraper/scraperTypes";
import { isPrimaryFinanceCategory } from "../scraper/bankSourceConfig";
import { asciiKatla, sayiCoz } from "../../../nlp/normalize";
import { kuralTabanliCikar, type KuralCikarimi } from "../../../nlp/extract";
import { kampanyaTuruBelirle } from "../../../nlp/kampanyaTuru";

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

function cleanSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function meaningfulSentences(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(cleanSnippet)
    .filter((s) => s.length >= 35 && s.length <= 320)
    .filter((s) => !/^(menü|menu|anasayfa|arama|giriş|giris)$/i.test(s));
}

function isLowInfoCampaignSentence(sentence: string): boolean {
  const folded = asciiKatla(sentence);
  if (/\d{1,2}[./-]\d{1,2}[./-]20\d{2}.*\d{1,2}[./-]\d{1,2}[./-]20\d{2}.*musteri\s+ol/.test(folded)) {
    return true;
  }
  const stripped = folded
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/g, " ")
    .replace(/\b\d{1,2}\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\s+20\d{2}\b/g, " ")
    .replace(/\bmusteri\s+ol\b/g, " ")
    .replace(/\b(kampanya|baslangic|bitis|tarihleri|gecerlidir)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return stripped.length < 18;
}

function datesIso(text: string): string[] {
  const out: string[] = [];
  const numericRe = /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g;
  let numeric: RegExpExecArray | null;
  while ((numeric = numericRe.exec(text)) !== null) {
    const day = numeric[1].padStart(2, "0");
    const month = numeric[2].padStart(2, "0");
    out.push(`${numeric[3]}-${month}-${day}`);
  }
  const months: Record<string, string> = {
    ocak: "01",
    subat: "02",
    mart: "03",
    nisan: "04",
    mayis: "05",
    haziran: "06",
    temmuz: "07",
    agustos: "08",
    eylul: "09",
    ekim: "10",
    kasim: "11",
    aralik: "12",
  };
  const folded = asciiKatla(text);
  const namedRe = /\b(\d{1,2})\s+(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\s+(20\d{2})\b/g;
  let named: RegExpExecArray | null;
  while ((named = namedRe.exec(folded)) !== null) {
    out.push(`${named[3]}-${months[named[2]]}-${named[1].padStart(2, "0")}`);
  }
  return [...new Set(out)];
}

function lastDateIso(text: string): string | null {
  const dates = datesIso(text);
  return dates.length ? dates[dates.length - 1] : null;
}

function largestTlAmount(text: string): number | null {
  const amounts = [...text.matchAll(/([\d.]+(?:,\d+)?)\s*(?:tl|₺)/giu)]
    .map((m) => sayiCoz(m[1]))
    .filter((n): n is number => n != null && n >= 1000);
  return amounts.length ? Math.max(...amounts) : null;
}

function extractCampaignDetails(text: string): {
  campaignEnd: string | null;
  conditions: string[];
  exclusions: string[];
  participationMethod: string | null;
  maxAmountTl: number | null;
  rewardAmountTl: number | null;
  rewardType: string | null;
  installmentCount: number | null;
  evidence: ExtractedFinancialRecord["evidence"];
} {
  const sentences = meaningfulSentences(text.slice(0, 20_000));
  const evidence: ExtractedFinancialRecord["evidence"] = [];
  const conditionSignals =
    /kampanya|geçerli|gecerli|yararlan|katıl|katil|başvur|basvur|harcama|alışveriş|alisveris|müşteri|musteri|mobil|internet|taksit|puan|iade|hediye|finansman|vade/i;
  const exclusionSignals =
    /hariç|haric|dahil değildir|dahil degildir|geçerli değildir|gecerli degildir|iptal|iade işlemi|iade islemi/i;

  const conditions = sentences
    .filter((s) => conditionSignals.test(s))
    .filter((s) => !isLowInfoCampaignSentence(s))
    .slice(0, 5);
  const exclusions = sentences
    .filter((s) => exclusionSignals.test(s))
    .slice(0, 3);

  const endSentence =
    sentences.find((s) => /son\s+(başvuru|basvuru|gün|gun|tarih)|kampanya\s+(bitiş|bitis)|tarihine\s+kadar|geçerlidir|gecerlidir/i.test(s)) ||
    "";
  const campaignEnd = lastDateIso(endSentence) || lastDateIso(text);
  if (campaignEnd && endSentence) {
    evidence.push({ field: "campaignEnd", text: endSentence, confidence: 0.75 });
  }

  const participation =
    sentences.find((s) => /mobil|internet\s+şube|internet\s+sube|başvur|basvur|hemen\s+katıl|hemen\s+katil/i.test(s)) ||
    null;
  const maxAmountTl = largestTlAmount(conditions.join(" "));

  const rewardSentence = sentences.find((s) =>
    /puan|bankkart\s*lira|worldpuan|nakit\s+iade|hediye|ödül|odul|indirim/i.test(s),
  );
  let rewardAmountTl: number | null = null;
  let rewardType: string | null = null;
  if (rewardSentence) {
    const rewardMatch = /([\d.]+(?:,\d+)?)\s*(?:tl|₺)/i.exec(rewardSentence);
    rewardAmountTl = rewardMatch ? sayiCoz(rewardMatch[1]) : null;
    const folded = asciiKatla(rewardSentence);
    rewardType = /puan|bankkart\s*lira|worldpuan/.test(folded)
      ? "puan"
      : /iade/.test(folded)
        ? "nakit_iade"
        : /indirim/.test(folded)
          ? "indirim"
          : rewardAmountTl != null
            ? "hediye"
            : null;
    evidence.push({ field: "reward", text: rewardSentence, confidence: 0.65 });
  }

  const installmentCandidates = sentences
    .map((s) => {
      const matches = [...s.matchAll(/\b(\d{1,2})\s*(?:aya\s+varan\s+)?taksit(?:li)?\b/giu)]
        .map((m) => Number(m[1]))
        .filter((n) => Number.isFinite(n) && n > 1 && n <= 60);
      return matches.length ? { sentence: s, value: Math.max(...matches) } : null;
    })
    .filter((v): v is { sentence: string; value: number } => Boolean(v));
  const installmentBest = installmentCandidates.sort((a, b) => b.value - a.value)[0] || null;
  const installmentSentence = installmentBest?.sentence || null;
  const installmentCount = installmentBest?.value || null;
  if (installmentSentence && installmentCount != null) {
    evidence.push({ field: "installment", text: installmentSentence, confidence: 0.8 });
  }

  if (conditions[0]) {
    evidence.push({ field: "summary", text: conditions[0], confidence: 0.7 });
  }

  return {
    campaignEnd,
    conditions,
    exclusions,
    participationMethod: participation,
    maxAmountTl,
    rewardAmountTl,
    rewardType,
    installmentCount,
    evidence,
  };
}


/**
 * NLP kural katmanının ürettiği ama kayda yazılmayan alanları tamamlar.
 *
 * Hem kural yolu hem EVREN yolu buradan geçer: dil modeli bir alanı
 * doldurduysa ona dokunulmaz, boş bıraktıysa deterministik çıkarım devreye
 * girer. Böylece model çıktısı bozulmadan şartnamedeki alan kapsamı tamamlanır.
 */
function nlpAlanlariniTamamla(
  record: ExtractedFinancialRecord,
  kural: KuralCikarimi,
  text: string,
): ExtractedFinancialRecord {
  const tur = kampanyaTuruBelirle({
    metin: text,
    baslik: record.title ?? record.productName,
    url: record.sourceUrl,
  });

  const evidence = [...record.evidence];
  const kanitEkle = (field: string, textValue: string | null, confidence: number) => {
    if (!textValue) return;
    if (evidence.some((e) => e.field === field)) return;
    evidence.push({ field, text: textValue, confidence });
  };

  kanitEkle("campaignAdvantage", kural.kampanya_avantaji.kanit, kural.kampanya_avantaji.guven);
  kanitEkle("targetSegments", kural.hedef_kitle.kanit, kural.hedef_kitle.guven);
  kanitEkle("discountRate", kural.indirim_orani.kanit, kural.indirim_orani.guven);
  kanitEkle("rewardPoints", kural.alisveris_puani.kanit, kural.alisveris_puani.guven);
  kanitEkle("campaignStart", kural.kampanya_baslangic.kanit, kural.kampanya_baslangic.guven);
  if (tur.kanit) kanitEkle("campaignType", tur.kanit, 0.75);

  return {
    ...record,
    productType: record.productType ?? urunTuruEtiketi(record.category),
    campaignAdvantage: record.campaignAdvantage ?? kural.kampanya_avantaji.ozet ?? null,
    feeStatus: record.feeStatus ?? kural.masraf_durumu,
    campaignType: record.campaignType ?? tur.tur,
    discountRate: record.discountRate ?? kural.indirim_orani.deger,
    rewardPoints: record.rewardPoints ?? kural.alisveris_puani.deger,
    rewardPointUnit: record.rewardPointUnit ?? kural.alisveris_puani.birim,
    campaignStart: record.campaignStart ?? kural.kampanya_baslangic.iso,
    minTermMonths: record.minTermMonths ?? kural.vade_ay.min,
    targetSegments:
      record.targetSegments.length > 0
        ? record.targetSegments
        : kural.hedef_kitle.deger ?? [],
    evidence,
  };
}

/** Şartnamedeki "Ürün Türü" sütunu — scraper kategorisinin okunabilir karşılığı. */
function urunTuruEtiketi(category: ContentCategory): string | null {
  switch (category) {
    case "housing_finance":
      return "Konut finansmanı";
    case "vehicle_finance":
      return "Taşıt finansmanı";
    case "consumer_finance":
      return "İhtiyaç finansmanı";
    case "shopping_finance":
      return "Alışveriş finansmanı";
    case "commercial_finance":
      return "Ticari finansman";
    case "participation_account":
      return "Katılma hesabı";
    case "card_campaign":
      return "Kart";
    case "investment_product":
      return "Yatırım ürünü";
    default:
      return null;
  }
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
    ) || /kampanya/i.test(opts.sourceUrl);
  if (!financeSignal) return [];

  const kural = kuralTabanliCikar(clipped);
  const hasSignal =
    kural.kar_payi_orani.deger != null ||
    kural.vade_ay.max != null ||
    kural.vade_ay.min != null ||
    kural.tutar.max != null ||
    kural.tutar.min != null ||
    kural.tahsis_ucreti.deger != null;

  const category = inferCategory(clipped, opts.categoryHint);
  const isCampaignPage =
    /kampanya/i.test(opts.sourceUrl) ||
    opts.categoryHint === "financing_campaign" ||
    opts.categoryHint === "card_campaign" ||
    opts.categoryHint === "discount_campaign" ||
    opts.categoryHint === "new_customer_financing";

  if (
    category === "irrelevant" ||
    (!isCampaignPage &&
      (category === "card_campaign" ||
        category === "discount_campaign" ||
        category === "insurance" ||
        category === "investment_product"))
  ) {
    return [];
  }

  // Kampanya sayfasında oran sinyali olmasa da başlık/tarih kaydı üret
  if (!hasSignal && !isCampaignPage) return [];

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
  const campaignDetails = isCampaignPage
    ? extractCampaignDetails(clipped)
    : {
        campaignEnd: null,
        conditions: [],
        exclusions: [],
        participationMethod: null,
        maxAmountTl: null,
        rewardAmountTl: null,
        rewardType: null,
        installmentCount: null,
        evidence: [],
      };
  evidence.push(...campaignDetails.evidence);

  const titleFromUrl = (() => {
    try {
      const path = new URL(opts.sourceUrl).pathname;
      const last = path.split("/").filter(Boolean).pop() || "";
      return decodeURIComponent(last)
        .replace(/[-_]+/g, " ")
        .replace(/\.html?$/i, "")
        .trim();
    } catch {
      return "";
    }
  })();

  const productName = isCampaignPage
    ? titleFromUrl
      ? titleFromUrl.replace(/\b\w/g, (c) => c.toLocaleUpperCase("tr-TR"))
      : "Kampanya"
    : category === "housing_finance"
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

  const campaignCategory =
    opts.categoryHint === "card_campaign"
      ? "card_campaign"
      : opts.categoryHint === "discount_campaign"
        ? "discount_campaign"
        : isCampaignPage
          ? "financing_campaign"
          : category;

  return [
    nlpAlanlariniTamamla({
      bankId: opts.bankId,
      sourceUrl: opts.sourceUrl,
      sourceCheckedAt: new Date().toISOString(),
      title: productName,
      recordType: isCampaignPage ? "campaign" : "product",
      category: campaignCategory,
      productName,
      productType: null,
      profitRate: kural.kar_payi_orani.deger,
      ratePeriod,
      minAmountTl: kural.tutar.min,
      maxAmountTl:
        kural.tutar.max != null && campaignDetails.maxAmountTl != null
          ? Math.max(kural.tutar.max, campaignDetails.maxAmountTl)
          : kural.tutar.max ?? campaignDetails.maxAmountTl,
      minTermMonths: kural.vade_ay.min,
      maxTermMonths:
        kural.vade_ay.max != null && campaignDetails.installmentCount != null
          ? Math.max(kural.vade_ay.max, campaignDetails.installmentCount)
          : kural.vade_ay.max ?? campaignDetails.installmentCount,
      installmentCount: campaignDetails.installmentCount,
      allocationFeeValue: kural.tahsis_ucreti.deger,
      allocationFeeType:
        kural.tahsis_ucreti.deger != null ? "fixed" : null,
      rewardAmountTl: campaignDetails.rewardAmountTl,
      rewardType: campaignDetails.rewardType,
      campaignStart: null,
      campaignEnd: campaignDetails.campaignEnd,
      targetSegments: [],
      participationMethod: campaignDetails.participationMethod,
      conditions: campaignDetails.conditions,
      exclusions: campaignDetails.exclusions,
      campaignStatus: "active",
      evidence,
      manualReviewRequired: !hasSignal && campaignDetails.conditions.length === 0,
    }, kural, clipped),
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
  // Modelin boş bıraktığı alanları tamamlamak için kural katmanı bir kez çalışır.
  const kural = kuralTabanliCikar(opts.text.slice(0, 20_000));

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

    out.push(nlpAlanlariniTamamla({
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
    }, kural, opts.text));
  }

  return out.filter((r) => r.category !== "irrelevant");
}

import {
  isCampaignListingUrl,
  isJunkCampaignTitle,
  isLikelyCampaignUrl,
  normalizeCampaignUrl,
  prettifyCampaignTitle,
  inferCampaignTheme,
} from "./campaignNormalize";

export function stubCampaignFromUrl(opts: {
  bankId: string;
  sourceUrl: string;
  categoryHint?: ContentCategory;
  title?: string | null;
}): ExtractedFinancialRecord | null {
  if (isCampaignListingUrl(opts.sourceUrl)) return null;
  if (!isLikelyCampaignUrl(opts.sourceUrl)) return null;

  let title = opts.title?.trim() || "";
  if (!title) {
    try {
      const last = new URL(opts.sourceUrl).pathname
        .split("/")
        .filter(Boolean)
        .pop();
      title = decodeURIComponent(last || "")
        .replace(/[-_]+/g, " ")
        .replace(/\.html?$/i, "")
        .trim();
    } catch {
      title = "";
    }
  }
  title = prettifyCampaignTitle(title);
  if (isJunkCampaignTitle(title)) return null;

  const category: ContentCategory =
    opts.categoryHint === "card_campaign"
      ? "card_campaign"
      : opts.categoryHint === "discount_campaign"
        ? "discount_campaign"
        : /kart/i.test(opts.sourceUrl)
          ? "card_campaign"
          : "financing_campaign";

  return {
    bankId: opts.bankId,
    sourceUrl: opts.sourceUrl,
    sourceCheckedAt: new Date().toISOString(),
    title,
    recordType: "campaign",
    category,
    productName: title,
    productType: urunTuruEtiketi(category),
    profitRate: null,
    ratePeriod: null,
    minAmountTl: null,
    maxAmountTl: null,
    minTermMonths: null,
    maxTermMonths: null,
    installmentCount: null,
    allocationFeeValue: null,
    allocationFeeType: null,
    rewardAmountTl: null,
    rewardType: null,
    campaignStart: null,
    campaignEnd: null,
    targetSegments: [],
    participationMethod: null,
    conditions: [],
    exclusions: [],
    campaignStatus: "active",
    campaignTheme: inferCampaignTheme({
      title,
      productName: title,
      sourceUrl: opts.sourceUrl,
      category,
    }),
    campaignType: kampanyaTuruBelirle({ baslik: title, url: opts.sourceUrl }).tur,
    evidence: [
      {
        field: "title",
        text: `Resmî kampanya sayfası: ${opts.sourceUrl}`,
        confidence: 0.7,
      },
    ],
    manualReviewRequired: true,
  };
}

export async function extractFinancialRecordsFromText(opts: {
  bankId: string;
  sourceUrl: string;
  text: string;
  categoryHint?: ContentCategory;
}): Promise<ExtractedFinancialRecord[]> {
  const clipped = opts.text.slice(0, 8_000);
  if (clipped.length < 40) {
    if (/kampanya/i.test(opts.sourceUrl) || opts.categoryHint?.includes("campaign")) {
      const stub = stubCampaignFromUrl(opts);
      return stub ? [stub] : [];
    }
    return [];
  }

  const extractOpts = {
    bankId: opts.bankId,
    sourceUrl: opts.sourceUrl,
    text: clipped,
    categoryHint: opts.categoryHint,
  };

  const isCampaignContext =
    /kampanya/i.test(opts.sourceUrl) ||
    opts.categoryHint === "financing_campaign" ||
    opts.categoryHint === "card_campaign" ||
    opts.categoryHint === "discount_campaign" ||
    opts.categoryHint === "new_customer_financing" ||
    Boolean(opts.categoryHint?.includes("campaign"));

  // Kampanya / kural-only: EVREN hiç çağrılmaz
  if (
    process.env.SCRAPER_RULES_ONLY === "1" ||
    (isCampaignContext && process.env.SCRAPER_USE_EVREN !== "true")
  ) {
    const rules = ruleBasedExtractRecords(extractOpts);
    if (rules.length > 0) return rules;
    if (isCampaignContext) {
      const stub = stubCampaignFromUrl(opts);
      return stub ? [stub] : [];
    }
    return [];
  }

  try {
    const evren = await callEvrenChat({
      systemPrompt: EXTRACT_SYSTEM,
      userPrompt: `Banka: ${opts.bankId}\nURL: ${opts.sourceUrl}\nKategori ipucu: ${opts.categoryHint || "unknown"}\n\nMETİN:\n${clipped}`,
      temperature: 0,
      jsonMode: true,
      maxTokens: 4096,
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

  const rules = ruleBasedExtractRecords(extractOpts);
  if (rules.length > 0) return rules;
  if (isCampaignContext) {
    const stub = stubCampaignFromUrl(opts);
    return stub ? [stub] : [];
  }
  return [];
}

export { isPrimaryFinanceCategory };
