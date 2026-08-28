import { describe, expect, it, vi, beforeEach } from "vitest";
import { createEmptyState } from "../finansmanNlu";

vi.mock("../../calculators/vakifKatilimCalculator", () => ({
  VAKIF_FINANSMAN_KODLARI: {
    ihtiyac_finansmani: "1",
    tasit_finansmani: "2",
    konut_finansmani: "3",
    isyeri_finansmani: "4",
  },
  hesaplaVakifKatilim: vi.fn(async () => ({
    bankId: "vakif-katilim",
    financingType: "ihtiyac_finansmani",
    amountTl: 200000,
    termMonths: 24,
    calculateType: "1",
    profitRatePercent: 3.99,
    monthlyInstallmentTl: 10500.5,
    totalPaymentTl: 252012,
    appraisementFeeTl: 0,
    mortgageReleaseFeeTl: 0,
    installmentLabel: null,
    sourceUrl: "https://www.vakifkatilim.com.tr/tr",
    calculatedAt: new Date().toISOString(),
  })),
}));

vi.mock("../../calculators/albarakaFinansmanCalculator", () => ({
  ALBARAKA_FINANSMAN_URL: "https://www.albaraka.com.tr/tr/hesaplama-araclari/finansman-hesaplama",
  albarakaDestekliMi: (k: string) =>
    ["ihtiyac_finansmani", "konut_finansmani", "tasit_finansmani", "isyeri_finansmani"].includes(k),
  getAlbarakaFinansmanOrani: vi.fn(async () => ({
    bankId: "albaraka",
    financingKey: "ihtiyac_finansmani",
    profitRatePercent: 4.0,
    productName: "ENGELSİZ HAYAT FİNANSMANI",
    maxTermMonths: 36,
    maxAmountTl: 9999999,
    sourceUrl: "https://www.albaraka.com.tr/tr/hesaplama-araclari/finansman-hesaplama",
    fetchedAt: new Date().toISOString(),
  })),
}));

vi.mock("../../calculators/turkiyeFinansFinansmanCalculator", () => ({
  TF_FINANSMAN_URL:
    "https://www.turkiyefinans.com.tr/tr-tr/hesaplama-araclari/Sayfalar/finansman-odeme-plani.aspx",
  getTurkiyeFinansFinansmanOrani: vi.fn(async () => ({
    bankId: "turkiye-finans",
    financingKey: "ihtiyac_finansmani",
    profitRatePercent: 2.66,
    productName: "Standart Finansör",
    matchedTermMonths: 24,
    maxTermMonths: 36,
    maxAmountTl: 40000,
    sourceUrl:
      "https://www.turkiyefinans.com.tr/tr-tr/hesaplama-araclari/Sayfalar/finansman-odeme-plani.aspx",
    fetchedAt: new Date().toISOString(),
  })),
}));

vi.mock("../../calculators/ziraatKatilimCalculator", () => ({
  ZIRAAT_FINANSMAN_EID: {
    ihtiyac_finansmani: "1",
    tasit_finansmani: "2",
    konut_finansmani: "3",
    isyeri_finansmani: "4",
    arsa_finansmani: "5",
    konut_finansmani_ikinci_el: "3",
    tasit_finansmani_ikinci_el: "2",
  },
  getZiraatUrunMeta: vi.fn(async () => ({
    eid: "1",
    ratio: 4.99,
    maxAmount: 500000,
    maxTerm: 36,
  })),
  hesaplaZiraatKatilim: vi.fn(async () => ({
    bankId: "ziraat-katilim",
    financingType: "ihtiyac_finansmani",
    amountTl: 200000,
    termMonths: 24,
    profitRatePercent: 4.99,
    monthlyInstallmentTl: 11200,
    totalPaymentTl: 268800,
    appraisementFeeTl: null,
    mortgageReleaseFeeTl: null,
    sourceUrl: "https://www.ziraatkatilim.com.tr",
    calculatedAt: new Date().toISOString(),
  })),
}));

vi.mock("../../calculators/kuveytTurkCalculator", () => ({
  resolveKuveytProduct: () => ({ code: "SAGLIKFINANSMANI", title: "İhtiyaç" }),
  hesaplaKuveytTurk: vi.fn(async () => ({
    bankId: "kuveyt-turk",
    financingType: "ihtiyac_finansmani",
    amountTl: 200000,
    termMonths: 24,
    profitRatePercent: 4.01,
    monthlyInstallmentTl: 10800,
    totalPaymentTl: 259200,
    appraisementFeeTl: 0,
    mortgageReleaseFeeTl: 0,
    allocationFeeTl: 0,
    sourceUrl: "https://www.kuveytturk.com.tr",
    calculatedAt: new Date().toISOString(),
  })),
}));

describe("liveCalculatorEnrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scrape oranı olmasa da canlı oran kaynağı olan bankaları ekler", async () => {
    const { enrichWithLiveCalculators } = await import(
      "../liveCalculatorEnrichment"
    );
    const state = createEmptyState("live-test");
    state.financingType = "consumer";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;

    const out = await enrichWithLiveCalculators(
      [
        {
          bankId: "ziraat-katilim",
          bankName: "Ziraat Katılım",
          productId: "scraped-z",
          productName: "İhtiyaç",
          financingType: "ihtiyac_finansmani",
          requestedAmountTl: 200000,
          termMonths: 24,
          profitRate: null,
          ratePeriod: null,
          estimatedMonthlyPaymentTl: null,
          estimatedTotalPaymentTl: null,
          allocationFeeTl: null,
          rewardAmountTl: null,
          rewardDescription: null,
          customerCondition: null,
          campaignEnd: null,
          freshnessStatus: "fresh",
          sourceCheckedAt: new Date().toISOString(),
          sourceUrl: "https://example.com",
          evidence: ["Bankanın resmî kaynağında hesaplama için yeterli bilgi bulunmuyor."],
          calculationAvailable: false,
          calculationWarning:
            "Bankanın resmî kaynağında hesaplama için yeterli bilgi bulunmuyor.",
        },
      ],
      state,
    );

    expect(out.liveBankIds.sort()).toEqual(
      [
        "albaraka",
        "kuveyt-turk",
        "turkiye-finans",
        "vakif-katilim",
        "ziraat-katilim",
      ].sort(),
    );
    const ziraat = out.matches.find((m) => m.bankId === "ziraat-katilim");
    expect(ziraat?.calculationAvailable).toBe(true);
    expect(ziraat?.estimatedMonthlyPaymentTl).toBe(11200);
    expect(ziraat?.profitRate).toBeCloseTo(0.0499);
    expect(out.matches.every((m) => m.calculationAvailable)).toBe(true);
  });

  it("seçili banka varsa canlı hesaplayıcı yalnız o bankayı ekler", async () => {
    const { enrichWithLiveCalculators } = await import(
      "../liveCalculatorEnrichment"
    );
    const state = createEmptyState("live-selected-bank");
    state.financingType = "vehicle";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;
    state.selectedBankIds = ["ziraat-katilim"];

    const out = await enrichWithLiveCalculators([], state);

    expect(out.liveBankIds).toEqual(["ziraat-katilim"]);
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0].bankId).toBe("ziraat-katilim");
  });

  it("canlı API düşerse Ziraat meta oranı + Softtech ile doldurur", async () => {
    const { hesaplaZiraatKatilim } = await import(
      "../../calculators/ziraatKatilimCalculator"
    );
    vi.mocked(hesaplaZiraatKatilim).mockRejectedValueOnce(new Error("timeout"));

    const { enrichWithLiveCalculators } = await import(
      "../liveCalculatorEnrichment"
    );
    const state = createEmptyState("live-fallback");
    state.financingType = "consumer";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;

    const out = await enrichWithLiveCalculators([], state);
    const ziraat = out.matches.find((m) => m.bankId === "ziraat-katilim");
    expect(ziraat?.calculationAvailable).toBe(true);
    expect(ziraat?.estimatedMonthlyPaymentTl).toBeGreaterThan(0);
    expect(ziraat?.evidence.some((e) => /Softtech/i.test(e))).toBe(true);
  });
});
