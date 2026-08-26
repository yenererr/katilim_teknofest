/**
 * Chatbot eşleşmelerini Vakıf / Ziraat / Kuveyt canlı hesaplama motorlarıyla
 * zenginleştirir. Scrape’te oran olmasa bile taksit üretir.
 */

import { BANKA_INDEKS } from "../../../data/piyasa";
import { hesaplaVakifKatilim } from "../calculators/vakifKatilimCalculator";
import {
  hesaplaZiraatKatilim,
  ZIRAAT_FINANSMAN_EID,
  type ZiraatFinansmanTuru,
} from "../calculators/ziraatKatilimCalculator";
import {
  hesaplaKuveytTurk,
  resolveKuveytProduct,
} from "../calculators/kuveytTurkCalculator";
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
  // shopping / education / consumer / other → ihtiyaç
  return "ihtiyac_finansmani";
}

function bankName(id: string): string {
  return BANKA_INDEKS[id]?.ad || id;
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
    if (!prev || !prev.calculationAvailable) {
      byBank.set(m.bankId, prev ? { ...prev, ...m, productId: prev.productId, productName: prev.productName || m.productName, evidence: [...(prev.evidence || []), ...m.evidence] } : m);
    } else if (m.calculationAvailable) {
      // Canlı sonuç scrape oranının üzerine yazılır
      byBank.set(m.bankId, {
        ...prev,
        profitRate: m.profitRate,
        ratePeriod: m.ratePeriod,
        estimatedMonthlyPaymentTl: m.estimatedMonthlyPaymentTl,
        estimatedTotalPaymentTl: m.estimatedTotalPaymentTl,
        allocationFeeTl: m.allocationFeeTl ?? prev.allocationFeeTl,
        calculationAvailable: true,
        calculationWarning: null,
        freshnessStatus: "fresh",
        sourceCheckedAt: m.sourceCheckedAt,
        sourceUrl: m.sourceUrl || prev.sourceUrl,
        evidence: [
          ...prev.evidence.filter((e) => !/yeterli bilgi bulunmuyor/i.test(e)),
          ...m.evidence,
        ],
      });
    }
  }
  return [...byBank.values()].sort((a, b) => {
    const av = a.estimatedMonthlyPaymentTl;
    const bv = b.estimatedMonthlyPaymentTl;
    if (av == null && bv == null) return a.bankName.localeCompare(b.bankName, "tr");
    if (av == null) return 1;
    if (bv == null) return -1;
    return av - bv;
  });
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

  const jobs: Array<Promise<void>> = [];

  // Vakıf Katılım
  jobs.push(
    (async () => {
      try {
        const r = await hesaplaVakifKatilim({
          financingType: financingKey as Parameters<typeof hesaplaVakifKatilim>[0]["financingType"],
          amountTl: amount,
          termMonths: term,
          profitRatePercent: customRate,
          calculateType: "1",
        });
        if (r.monthlyInstallmentTl == null || r.profitRatePercent == null) return;
        liveBankIds.push("vakif-katilim");
        liveRows.push(
          toMatch({
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
          }),
        );
      } catch (err) {
        warnings.push(
          `Vakıf Katılım canlı hesaplama: ${err instanceof Error ? err.message : "başarısız"}`,
        );
      }
    })(),
  );

  // Ziraat Katılım
  if (financingKey in ZIRAAT_FINANSMAN_EID) {
    jobs.push(
      (async () => {
        try {
          const r = await hesaplaZiraatKatilim({
            financingType: financingKey as ZiraatFinansmanTuru,
            amountTl: amount,
            termMonths: term,
            profitRatePercent: customRate,
          });
          if (r.monthlyInstallmentTl == null || r.profitRatePercent == null) return;
          liveBankIds.push("ziraat-katilim");
          liveRows.push(
            toMatch({
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
            }),
          );
        } catch (err) {
          warnings.push(
            `Ziraat Katılım canlı hesaplama: ${err instanceof Error ? err.message : "başarısız"}`,
          );
        }
      })(),
    );
  }

  // Kuveyt Türk
  if (resolveKuveytProduct(financingKey)) {
    jobs.push(
      (async () => {
        try {
          const r = await hesaplaKuveytTurk({
            financingType: financingKey,
            amountTl: amount,
            termMonths: term,
            profitRatePercent: customRate,
            calculateType: "1",
          });
          if (r.monthlyInstallmentTl == null || r.profitRatePercent == null) return;
          liveBankIds.push("kuveyt-turk");
          liveRows.push(
            toMatch({
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
            }),
          );
        } catch (err) {
          warnings.push(
            `Kuveyt Türk canlı hesaplama: ${err instanceof Error ? err.message : "başarısız"}`,
          );
        }
      })(),
    );
  }

  await Promise.all(jobs);

  if (liveRows.length === 0) {
    return { matches, liveBankIds, warnings };
  }

  return {
    matches: mergeLive(matches, liveRows),
    liveBankIds,
    warnings,
  };
}
