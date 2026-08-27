/**
 * Chatbot eşleşmelerini Vakıf / Ziraat / Kuveyt canlı motorlarıyla zenginleştirir.
 * Canlı uç başarısız olursa Softtech formülü (hesaplaOdemePlani) ile yedekler.
 */

import { BANKA_INDEKS } from "../../../data/piyasa";
import { hesaplaOdemePlani } from "../../../lib/odemePlani";
import {
  hesaplaVakifKatilim,
  VAKIF_FINANSMAN_KODLARI,
  type VakifFinansmanTuru,
} from "../calculators/vakifKatilimCalculator";
import {
  hesaplaZiraatKatilim,
  getZiraatUrunMeta,
  ZIRAAT_FINANSMAN_EID,
  type ZiraatFinansmanTuru,
} from "../calculators/ziraatKatilimCalculator";
import {
  hesaplaKuveytTurk,
  resolveKuveytProduct,
} from "../calculators/kuveytTurkCalculator";
import { listMemoryProducts } from "../postgres/store";
import type {
  FinancingConversationState,
  FinancingMatch,
  FinancingType,
} from "./finansmanTypes";

export type LiveEnrichResult = {
  matches: FinancingMatch[];
  liveBankIds: string[];
  warnings: string[];
};

function mapFinancingKey(type: FinancingType | null): string {
  if (!type) return "ihtiyac_finansmani";
  if (type === "vehicle") return "tasit_finansmani";
  if (type === "housing") return "konut_finansmani";
  if (type === "commercial") return "isyeri_finansmani";
  return "ihtiyac_finansmani";
}

function bankName(id: string): string {
  return BANKA_INDEKS[id]?.ad || id;
}

/**
 * Canlı uç kapalıyken doğrulanmış bellek/ilan oranını bul (yüzde, örn. 3.24).
 */
function memoryPublishedRatePercent(
  bankId: string,
  financingKey: string,
  termMonths: number,
): { ratePercent: number; sourceUrl: string } | null {
  const rows = listMemoryProducts({ primaryOnly: false });
  const scored: Array<{
    ratePercent: number;
    sourceUrl: string;
    termDist: number;
  }> = [];
  for (const row of rows) {
    if (row.bankId !== bankId) continue;
    const mapped =
      row.payload && typeof row.payload === "object"
        ? row.payload
        : row;
    const productType =
      mapped.productType ||
      (mapped.category === "vehicle_finance"
        ? "tasit_finansmani"
        : mapped.category === "housing_finance"
          ? "konut_finansmani"
          : mapped.category === "consumer_finance"
            ? "ihtiyac_finansmani"
            : null);
    if (productType !== financingKey) continue;
    const rate =
      typeof mapped.profitRate === "number"
        ? mapped.profitRate
        : typeof mapped.terimler?.kar_payi_orani?.deger === "number"
          ? mapped.terimler.kar_payi_orani.deger
          : null;
    if (rate == null || !(rate > 0)) continue;
    const minT = mapped.minTermMonths ?? mapped.terimler?.vade_ay?.min ?? null;
    const maxT = mapped.maxTermMonths ?? mapped.terimler?.vade_ay?.max ?? null;
    if (minT != null && termMonths < minT) continue;
    if (maxT != null && termMonths > maxT) continue;
    const mid =
      minT != null && maxT != null ? (minT + maxT) / 2 : termMonths;
    scored.push({
      ratePercent: rate <= 1 ? rate * 100 : rate,
      sourceUrl: String(mapped.sourceUrl || row.sourceUrl || ""),
      termDist: Math.abs(mid - termMonths),
    });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a.termDist - b.termDist);
  return { ratePercent: scored[0].ratePercent, sourceUrl: scored[0].sourceUrl };
}

function softtechLocal(opts: {
  bankId: string;
  financingKey: string;
  amountTl: number;
  termMonths: number;
  profitRatePercent: number;
  sourceUrl: string;
  label: string;
  feeTl?: number | null;
}): FinancingMatch | null {
  try {
    const plan = hesaplaOdemePlani({
      amountTl: opts.amountTl,
      termMonths: opts.termMonths,
      profitRatePercent: opts.profitRatePercent,
      financingType: opts.financingKey,
    });
    const now = new Date().toISOString();
    return {
      bankId: opts.bankId,
      bankName: bankName(opts.bankId),
      productId: `live-${opts.bankId}-${opts.financingKey}`,
      productName: `${bankName(opts.bankId)} — hesaplama`,
      financingType: opts.financingKey,
      requestedAmountTl: opts.amountTl,
      termMonths: opts.termMonths,
      profitRate: opts.profitRatePercent / 100,
      ratePeriod: "monthly",
      estimatedMonthlyPaymentTl: plan.taksitTutari,
      estimatedTotalPaymentTl: plan.odenecekToplamTutar,
      allocationFeeTl: opts.feeTl ?? plan.finansmanTahsisUcreti,
      customerCondition: null,
      campaignEnd: null,
      freshnessStatus: "fresh",
      sourceCheckedAt: now,
      sourceUrl: opts.sourceUrl,
      evidence: [
        `${opts.label}: aylık %${opts.profitRatePercent.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} ile Softtech uyumlu motor.`,
      ],
      calculationAvailable: true,
      calculationWarning: null,
    };
  } catch (err) {
    console.warn("[LiveCalc] softtechLocal", opts.bankId, err);
    return null;
  }
}

function toMatch(opts: {
  bankId: string;
  financingKey: string;
  amountTl: number;
  termMonths: number;
  profitRatePercent: number;
  monthlyTl: number;
  totalTl: number | null;
  feeTl: number | null;
  sourceUrl: string;
  label: string;
}): FinancingMatch {
  const now = new Date().toISOString();
  return {
    bankId: opts.bankId,
    bankName: bankName(opts.bankId),
    productId: `live-${opts.bankId}-${opts.financingKey}`,
    productName: `${bankName(opts.bankId)} — canlı hesaplama`,
    financingType: opts.financingKey,
    requestedAmountTl: opts.amountTl,
    termMonths: opts.termMonths,
    profitRate: opts.profitRatePercent / 100,
    ratePeriod: "monthly",
    estimatedMonthlyPaymentTl: opts.monthlyTl,
    estimatedTotalPaymentTl: opts.totalTl ?? opts.monthlyTl * opts.termMonths,
    allocationFeeTl: opts.feeTl,
    customerCondition: null,
    campaignEnd: null,
    freshnessStatus: "fresh",
    sourceCheckedAt: now,
    sourceUrl: opts.sourceUrl,
    evidence: [
      `${opts.label}: bankanın kendi hesaplama aracından alınan güncel sonuç.`,
    ],
    calculationAvailable: true,
    calculationWarning: null,
  };
}

function mergeLive(
  existing: FinancingMatch[],
  live: FinancingMatch[],
): FinancingMatch[] {
  const byBank = new Map<string, FinancingMatch>();
  for (const m of existing) byBank.set(m.bankId, m);
  for (const m of live) {
    const prev = byBank.get(m.bankId);
    if (!prev) {
      byBank.set(m.bankId, m);
      continue;
    }
    // Canlı / hesaplanmış sonuç her zaman scrape “oran yok” satırının üzerine yazılır
    byBank.set(m.bankId, {
      ...prev,
      ...m,
      productId: prev.productId.startsWith("live-") ? m.productId : prev.productId,
      productName: m.calculationAvailable
        ? m.productName
        : prev.productName || m.productName,
      evidence: [
        ...prev.evidence.filter((e) => !/yeterli bilgi bulunmuyor/i.test(e)),
        ...m.evidence,
      ],
    });
  }

  const all = [...byBank.values()];
  const calculated = all.filter((m) => m.calculationAvailable);
  const rest = all.filter((m) => !m.calculationAvailable);
  const byPay = (a: FinancingMatch, b: FinancingMatch) => {
    const av = a.estimatedMonthlyPaymentTl;
    const bv = b.estimatedMonthlyPaymentTl;
    if (av == null && bv == null) return a.bankName.localeCompare(b.bankName, "tr");
    if (av == null) return 1;
    if (bv == null) return -1;
    return av - bv;
  };
  // Hesaplanmışlar önde; oranı olmayanlar sonda (veya gizlenebilir)
  return [...calculated.sort(byPay), ...rest.sort(byPay)];
}

async function calcVakif(
  financingKey: string,
  amount: number,
  term: number,
  customRate: number | null | undefined,
): Promise<FinancingMatch | null> {
  if (!(financingKey in VAKIF_FINANSMAN_KODLARI)) return null;
  const tur = financingKey as VakifFinansmanTuru;
  try {
    const r = await hesaplaVakifKatilim({
      financingType: tur,
      amountTl: amount,
      termMonths: term,
      profitRatePercent: customRate,
      calculateType: "1",
    });
    if (r.monthlyInstallmentTl != null && r.profitRatePercent != null) {
      return toMatch({
        bankId: "vakif-katilim",
        financingKey,
        amountTl: amount,
        termMonths: term,
        profitRatePercent: r.profitRatePercent,
        monthlyTl: r.monthlyInstallmentTl,
        totalTl: r.totalPaymentTl,
        feeTl: r.appraisementFeeTl,
        sourceUrl: r.sourceUrl,
        label: "Vakıf Katılım canlı motor",
      });
    }
    if (r.profitRatePercent != null) {
      return softtechLocal({
        bankId: "vakif-katilim",
        financingKey,
        amountTl: amount,
        termMonths: term,
        profitRatePercent: r.profitRatePercent,
        sourceUrl: r.sourceUrl,
        label: "Vakıf Katılım (oran + yerel motor)",
        feeTl: r.appraisementFeeTl,
      });
    }
  } catch (err) {
    console.warn("[LiveCalc] vakif", err instanceof Error ? err.message : err);
  }
  // Özel oran varsa yerel Softtech
  if (customRate != null && customRate > 0) {
    return softtechLocal({
      bankId: "vakif-katilim",
      financingKey,
      amountTl: amount,
      termMonths: term,
      profitRatePercent: customRate,
      sourceUrl: "https://www.vakifkatilim.com.tr/tr",
      label: "Vakıf Katılım (özel oran + yerel motor)",
    });
  }
  const published = memoryPublishedRatePercent("vakif-katilim", financingKey, term);
  if (published) {
    return softtechLocal({
      bankId: "vakif-katilim",
      financingKey,
      amountTl: amount,
      termMonths: term,
      profitRatePercent: published.ratePercent,
      sourceUrl: published.sourceUrl || "https://www.vakifkatilim.com.tr/tr",
      label: "Vakıf Katılım (ilan oranı + Softtech motor)",
    });
  }
  return null;
}

async function calcZiraat(
  financingKey: string,
  amount: number,
  term: number,
  customRate: number | null | undefined,
): Promise<FinancingMatch | null> {
  if (!(financingKey in ZIRAAT_FINANSMAN_EID)) return null;
  const tur = financingKey as ZiraatFinansmanTuru;
  try {
    const r = await hesaplaZiraatKatilim({
      financingType: tur,
      amountTl: amount,
      termMonths: term,
      profitRatePercent: customRate,
    });
    if (r.monthlyInstallmentTl != null && r.profitRatePercent != null) {
      return toMatch({
        bankId: "ziraat-katilim",
        financingKey,
        amountTl: amount,
        termMonths: term,
        profitRatePercent: r.profitRatePercent,
        monthlyTl: r.monthlyInstallmentTl,
        totalTl: r.totalPaymentTl,
        feeTl: r.appraisementFeeTl,
        sourceUrl: r.sourceUrl,
        label: "Ziraat Katılım canlı motor",
      });
    }
  } catch (err) {
    console.warn("[LiveCalc] ziraat", err instanceof Error ? err.message : err);
  }

  // get-vade oranı + yerel Softtech (canlı HTML parse başarısız olsa bile)
  try {
    const meta = await getZiraatUrunMeta(tur, term, fetch, amount);
    const oran = customRate != null && customRate > 0 ? customRate : meta.ratio;
    if (oran != null && oran > 0) {
      return softtechLocal({
        bankId: "ziraat-katilim",
        financingKey,
        amountTl: amount,
        termMonths: term,
        profitRatePercent: oran,
        sourceUrl: "https://www.ziraatkatilim.com.tr/bireysel/finansman-urunleri",
        label: "Ziraat Katılım (ilan oranı + Softtech motor)",
      });
    }
  } catch (err) {
    console.warn("[LiveCalc] ziraat-meta", err instanceof Error ? err.message : err);
  }

  if (customRate != null && customRate > 0) {
    return softtechLocal({
      bankId: "ziraat-katilim",
      financingKey,
      amountTl: amount,
      termMonths: term,
      profitRatePercent: customRate,
      sourceUrl: "https://www.ziraatkatilim.com.tr/bireysel/finansman-urunleri",
      label: "Ziraat Katılım (özel oran + Softtech motor)",
    });
  }
  const published = memoryPublishedRatePercent("ziraat-katilim", financingKey, term);
  if (published) {
    return softtechLocal({
      bankId: "ziraat-katilim",
      financingKey,
      amountTl: amount,
      termMonths: term,
      profitRatePercent: published.ratePercent,
      sourceUrl:
        published.sourceUrl ||
        "https://www.ziraatkatilim.com.tr/bireysel/finansman-urunleri",
      label: "Ziraat Katılım (ilan oranı + Softtech motor)",
    });
  }
  return null;
}

async function calcKuveyt(
  financingKey: string,
  amount: number,
  term: number,
  customRate: number | null | undefined,
): Promise<FinancingMatch | null> {
  if (!resolveKuveytProduct(financingKey)) return null;
  try {
    const r = await hesaplaKuveytTurk({
      financingType: financingKey,
      amountTl: amount,
      termMonths: term,
      profitRatePercent: customRate,
      calculateType: "1",
    });
    if (r.monthlyInstallmentTl != null && r.profitRatePercent != null) {
      return toMatch({
        bankId: "kuveyt-turk",
        financingKey,
        amountTl: amount,
        termMonths: term,
        profitRatePercent: r.profitRatePercent,
        monthlyTl: r.monthlyInstallmentTl,
        totalTl: r.totalPaymentTl,
        feeTl: r.allocationFeeTl,
        sourceUrl: r.sourceUrl,
        label: "Kuveyt Türk canlı motor",
      });
    }
  } catch (err) {
    console.warn("[LiveCalc] kuveyt", err instanceof Error ? err.message : err);
  }
  // Kuveyt BSMV farkı var; özel oranla yaklaşık Softtech yedek (bilinçli)
  if (customRate != null && customRate > 0) {
    const row = softtechLocal({
      bankId: "kuveyt-turk",
      financingKey,
      amountTl: amount,
      termMonths: term,
      profitRatePercent: customRate,
      sourceUrl: "https://www.kuveytturk.com.tr/hesaplama-araclari/finansman-hesaplama",
      label: "Kuveyt Türk (özel oran + yaklaşık motor)",
    });
    if (row) {
      row.calculationWarning =
        "Kuveyt Türk canlı ucuna ulaşılamadı; taksit Softtech formülüyle yaklaşık hesaplandı.";
    }
    return row;
  }
  const published = memoryPublishedRatePercent("kuveyt-turk", financingKey, term);
  if (published) {
    const row = softtechLocal({
      bankId: "kuveyt-turk",
      financingKey,
      amountTl: amount,
      termMonths: term,
      profitRatePercent: published.ratePercent,
      sourceUrl:
        published.sourceUrl ||
        "https://www.kuveytturk.com.tr/hesaplama-araclari/finansman-hesaplama",
      label: "Kuveyt Türk (ilan oranı + yaklaşık Softtech motor)",
    });
    if (row) {
      row.calculationWarning =
        "Kuveyt Türk canlı ucuna ulaşılamadı; ilan oranı Softtech formülüyle yaklaşık hesaplandı.";
    }
    return row;
  }
  return null;
}

/**
 * State’teki tutar/vade/tür ile canlı bankaları hesaplar; mevcut satırlara yazar.
 */
export async function enrichWithLiveCalculators(
  matches: FinancingMatch[],
  state: FinancingConversationState,
): Promise<LiveEnrichResult> {
  const amount = state.requestedAmountTl;
  const term = state.preferredTermMonths;
  const warnings: string[] = [];
  const liveBankIds: string[] = [];
  const liveRows: FinancingMatch[] = [];

  if (amount == null || term == null || amount <= 0 || term <= 0) {
    return { matches, liveBankIds, warnings };
  }

  const financingKey = mapFinancingKey(state.financingType);
  const customRate = state.customProfitRatePercent;
  const selectedBanks = new Set(state.selectedBankIds);
  const shouldUseBank = (bankId: string) =>
    selectedBanks.size === 0 || selectedBanks.has(bankId);

  const calculatorJobs: Array<Promise<FinancingMatch | null>> = [];
  if (shouldUseBank("vakif-katilim")) {
    calculatorJobs.push(calcVakif(financingKey, amount, term, customRate));
  }
  if (shouldUseBank("ziraat-katilim")) {
    calculatorJobs.push(calcZiraat(financingKey, amount, term, customRate));
  }
  if (shouldUseBank("kuveyt-turk")) {
    calculatorJobs.push(calcKuveyt(financingKey, amount, term, customRate));
  }

  if (calculatorJobs.length === 0) {
    return { matches, liveBankIds, warnings };
  }

  const results = await Promise.all(calculatorJobs);

  for (const row of results) {
    if (!row) continue;
    liveBankIds.push(row.bankId);
    liveRows.push(row);
  }

  if (liveRows.length === 0) {
    warnings.push(
      "Vakıf, Ziraat ve Kuveyt canlı hesaplama uçlarına şu an ulaşılamadı. Doğrulanmış ilan oranı varsa Softtech motoruyla taksit üretildi; yoksa “Oranı %3,99 yap” diyerek yerel motorla hesaplatabilirsiniz.",
    );
    return { matches, liveBankIds, warnings };
  }

  // Hesaplanmış satırlar varsa oranı olmayan scrape satırlarını listeden düşür
  // (kullanıcı “Teklif alınmalı” kalabalığı görmesin).
  // Softtech/ilan yedekleri de calculationAvailable=true olduğu için korunur.
  const merged = mergeLive(matches, liveRows);
  const onlyCalculated = merged.filter((m) => m.calculationAvailable);
  return {
    matches: onlyCalculated.length > 0 ? onlyCalculated : merged,
    liveBankIds,
    warnings,
  };
}
