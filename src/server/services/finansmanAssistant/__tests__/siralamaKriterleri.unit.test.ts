/**
 * Şartname 5.7'deki beş karşılaştırma kriterinin sıralamada gerçekten
 * uygulandığını doğrular. Özellikle "En Yüksek Ödül Miktarı" kriteri, tipte
 * tanımlı olmasına rağmen sortExact içinde ele alınmadığı için sessizce kâr
 * payına göre sıralıyordu; bu testler o regresyonu kalıcı olarak engelliyor.
 */

import { describe, expect, it } from "vitest";
import { sortExact } from "../finansmanMatcher";
import type { FinancingMatch } from "../finansmanTypes";

function eslesme(over: Partial<FinancingMatch>): FinancingMatch {
  return {
    bankId: "x",
    bankName: "X Bankası",
    productId: "p",
    productName: "Ürün",
    financingType: "ihtiyac_finansmani",
    requestedAmountTl: 100_000,
    termMonths: 24,
    profitRate: 0.03,
    ratePeriod: "monthly",
    estimatedMonthlyPaymentTl: 5000,
    estimatedTotalPaymentTl: 120_000,
    allocationFeeTl: 1000,
    rewardAmountTl: null,
    rewardDescription: null,
    customerCondition: null,
    campaignEnd: null,
    freshnessStatus: "fresh",
    sourceCheckedAt: new Date().toISOString(),
    sourceUrl: "https://example.com",
    evidence: [],
    calculationAvailable: true,
    calculationWarning: null,
    ...over,
  };
}

const A = eslesme({
  bankId: "a",
  profitRate: 0.0189,
  termMonths: 120,
  allocationFeeTl: 0,
  rewardAmountTl: null,
  estimatedTotalPaymentTl: 150_000,
});
const B = eslesme({
  bankId: "b",
  profitRate: 0.0195,
  termMonths: 120,
  allocationFeeTl: 2500,
  rewardAmountTl: 1000,
  estimatedTotalPaymentTl: 140_000,
});
const C = eslesme({
  bankId: "c",
  profitRate: 0.0187,
  termMonths: 96,
  allocationFeeTl: 5000,
  rewardAmountTl: 5000,
  estimatedTotalPaymentTl: 160_000,
});

describe("5.7 karşılaştırma kriterleri", () => {
  it("En Düşük Kâr Payı Oranı: C < A < B", () => {
    const s = sortExact([A, B, C], "lowest_profit_rate");
    expect(s.map((m) => m.bankId)).toEqual(["c", "a", "b"]);
  });

  it("En Uzun Vade: 120 aylıklar 96 aylığın önünde", () => {
    const s = sortExact([C, A, B], "longest_term");
    expect(s[s.length - 1].bankId).toBe("c");
    expect(s[0].termMonths).toBe(120);
  });

  it("En Düşük Masraf: A(0) < B(2500) < C(5000)", () => {
    const s = sortExact([C, B, A], "lowest_fee");
    expect(s.map((m) => m.bankId)).toEqual(["a", "b", "c"]);
  });

  it("En Yüksek Ödül Miktarı: C(5000) > B(1000) > A(veri yok)", () => {
    const s = sortExact([A, B, C], "highest_reward");
    expect(s.map((m) => m.bankId)).toEqual(["c", "b", "a"]);
  });

  it("En Düşük Toplam Ödeme: B < A < C", () => {
    const s = sortExact([C, A, B], "lowest_total_payment");
    expect(s.map((m) => m.bankId)).toEqual(["b", "a", "c"]);
  });

  it("ödül sıralaması kâr payı sıralamasından farklı sonuç üretir", () => {
    // Regresyon kilidi: highest_reward eksikken bu iki dizi aynı çıkıyordu.
    const odul = sortExact([A, B, C], "highest_reward").map((m) => m.bankId);
    const oran = sortExact([A, B, C], "lowest_profit_rate").map((m) => m.bankId);
    expect(odul).not.toEqual(oran);
  });

  it("ödül verisi olmayan kayıtlar listenin sonuna düşer, uydurulmaz", () => {
    const s = sortExact([A, eslesme({ bankId: "d" }), C], "highest_reward");
    expect(s[0].bankId).toBe("c");
    expect(s.slice(1).every((m) => m.rewardAmountTl == null)).toBe(true);
  });
});
