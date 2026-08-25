import { describe, it, expect, beforeEach } from "vitest";
import {
  parseTurkishAmount,
  parseTermMonths,
  parseFinancingType,
  mergeMessageIntoState,
  missingRequiredFields,
  createEmptyState,
} from "../finansmanNlu";
import { calculateFinancingPayments } from "../finansmanCalculator";
import {
  isAllowedParticipationBank,
  runFinancingMatchEngine,
} from "../finansmanMatcher";
import {
  resetConversationsForTests,
  runFinansmanAssistantChat,
  sanitizeAssistantNumbers,
} from "../finansmanService";
import type { LiveBankState } from "../../liveData/liveDataBridge";

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    urun_adi: "İhtiyaç Finansmanı",
    urun_turu: "ihtiyac_finansmani",
    musteri_segmenti: [],
    kampanya_bitis: null,
    terimler: {
      kar_payi_orani: { deger: 0.029, periyot: "aylik" },
      vade_ay: { min: 12, max: 36 },
      tutar: { min: 10000, max: 500000 },
      tahsis_ucreti: { deger: 500 },
    },
    kanitlar: { kar_payi: "Aylık kâr payı oranı %2,90 olarak ilan edilmiştir." },
    _sourceUrl: "https://www.kuveytturk.com.tr/finansman",
    _campaignStatus: "active",
    ...overrides,
  };
}

function makeStates(productsByBank: Record<string, any[]>): LiveBankState[] {
  const names: Record<string, string> = {
    "kuveyt-turk": "Kuveyt Türk Katılım Bankası",
    "vakif-katilim": "Vakıf Katılım Bankası",
    "ziraat-katilim": "Ziraat Katılım Bankası",
    albaraka: "Albaraka Türk Katılım Bankası",
  };
  return Object.entries(productsByBank).map(([id, products]) => ({
    id,
    bankName: names[id] || id,
    urls: [`https://example.com/${id}`],
    status: "guncellendi" as const,
    contentHash: "abc",
    lastCheckedAt: new Date().toISOString(),
    lastChangedAt: new Date().toISOString(),
    lastExtractedAt: new Date().toISOString(),
    products,
    error: null,
  }));
}

describe("finansman NLU", () => {
  it("Türkçe tutarları normalize eder", () => {
    expect(parseTurkishAmount("200 bin")).toBe(200000);
    expect(parseTurkishAmount("200k")).toBe(200000);
    expect(parseTurkishAmount("200.000 TL")).toBe(200000);
    expect(parseTurkishAmount("200 bin TL")).toBe(200000);
    expect(parseTurkishAmount("0,2 milyon")).toBe(200000);
    expect(parseTurkishAmount("1 milyon")).toBe(1000000);
  });

  it("vade ve amaç çıkarır", () => {
    expect(parseTermMonths("24 ay istiyorum")).toBe(24);
    expect(parseTermMonths("24")).toBe(24);
    expect(parseTermMonths("36")).toBe(36);
    expect(parseFinancingType("ihtiyaç finansmanı")).toBe("consumer");
    expect(parseFinancingType("bir araç almak")).toBe("vehicle");
  });

  it("yalnızca 24 yazınca vade tamamlanır, tutar korunur", () => {
    let s = createEmptyState("vade-24");
    s = mergeMessageIntoState(s, "200.000 TL ihtiyaç finansmanı arıyorum");
    expect(s.requestedAmountTl).toBe(200000);
    expect(s.financingType).toBe("consumer");
    expect(s.preferredTermMonths).toBeNull();
    s = mergeMessageIntoState(s, "24");
    expect(s.preferredTermMonths).toBe(24);
    expect(s.requestedAmountTl).toBe(200000);
    expect(missingRequiredFields(s)).toEqual([]);
  });

  it("konu dışı ve belirsiz amaç sınıflandırılır", async () => {
    const { classifyTurn } = await import("../finansmanNlu");
    expect(classifyTurn("kek tarıfı ver")).toBe("unsupported");
    expect(classifyTurn("kampanya var mı")).toBe("campaign_search");
    expect(classifyTurn("hacca gideceğim")).toBe("ambiguous_purpose");
    expect(classifyTurn("araba alcam")).toBe("param_update");
    expect(classifyTurn("pardon 24 ay")).toBe("param_update");
  });

  it("konu dışı mesaj önceki türü bozmaz ve arama yapmaz", async () => {
    resetConversationsForTests();
    const first = await runFinansmanAssistantChat(
      { message: "200 bin TL ihtiyaç finansmanı, 24 ay." },
      {
        matchOverride: {
          state: createEmptyState("off"),
          states: makeStates({ "kuveyt-turk": [makeProduct()] }),
          memoryProducts: [],
          memoryCampaigns: [],
        },
      },
    );
    const second = await runFinansmanAssistantChat({
      conversationId: first.conversationId,
      message: "kek tarifi ver",
    });
    expect(second.query.financingType).toBe("consumer");
    expect(second.query.preferredTermMonths).toBe(24);
    expect(second.assistantMessage).toMatch(/yalnızca katılım bankalarının/i);
    expect(second.exactMatches).toEqual([]);
  });
});

describe("hesaplama", () => {
  it("yeterli parametreyle aylık ödeme hesaplar", () => {
    const r = calculateFinancingPayments({
      principalTl: 200000,
      termMonths: 24,
      profitRate: 0.02,
      ratePeriod: "monthly",
      allocationFeeTl: 0,
    });
    expect(r.calculationAvailable).toBe(true);
    expect(r.estimatedMonthlyPaymentTl).not.toBeNull();
    expect(r.estimatedTotalPaymentTl).toBeGreaterThan(200000);
  });

  it("oran yoksa sayı uydurmaz", () => {
    const r = calculateFinancingPayments({
      principalTl: 200000,
      termMonths: 24,
      profitRate: null,
      ratePeriod: "monthly",
      allocationFeeTl: null,
    });
    expect(r.calculationAvailable).toBe(false);
    expect(r.estimatedMonthlyPaymentTl).toBeNull();
  });
});

describe("banka doğrulama", () => {
  it("Senaryo 9: konvansiyonel banka reddedilir", () => {
    expect(isAllowedParticipationBank("vakif-katilim", "Vakıf Katılım")).toBe(
      true,
    );
    expect(isAllowedParticipationBank("vakifbank", "VakıfBank")).toBe(false);
    expect(
      isAllowedParticipationBank("ziraat-katilim", "Ziraat Bankası"),
    ).toBe(false);
  });
});

describe("eşleştirme motoru", () => {
  const states = makeStates({
    "kuveyt-turk": [makeProduct()],
    "vakif-katilim": [
      makeProduct({
        urun_adi: "İhtiyaç Plus",
        terimler: {
          kar_payi_orani: { deger: 0.025, periyot: "aylik" },
          vade_ay: { min: 12, max: 36 },
          tutar: { min: 10000, max: 500000 },
          tahsis_ucreti: { deger: null },
        },
      }),
    ],
    "ziraat-katilim": [
      makeProduct({
        urun_adi: "Kampanyalı",
        terimler: {
          kar_payi_orani: { deger: 0.031, periyot: "aylik" },
          vade_ay: { min: 12, max: 24 },
          tutar: { min: 220000, max: 400000 },
          tahsis_ucreti: { deger: 0 },
        },
      }),
    ],
    albaraka: [
      makeProduct({
        urun_adi: "Süresi dolmuş",
        kampanya_bitis: "2020-01-01",
        _campaignStatus: "expired",
      }),
    ],
  });

  it("Senaryo 2+8: yalnızca uygun bankalar, doldurma yok", () => {
    const state = createEmptyState("t1");
    state.financingType = "consumer";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;

    const r = runFinancingMatchEngine({
      state,
      states,
      memoryProducts: [],
      memoryCampaigns: [],
      allowDemoData: false,
    });

    expect(r.exactMatches.length).toBe(2);
    expect(r.exactMatches.every((m) => m.bankId !== "albaraka")).toBe(true);
    expect(r.hasVerifiedData).toBe(true);
  });

  it("Senaryo 6: oran yoksa 0 değil, null", () => {
    const s = makeStates({
      "kuveyt-turk": [
        makeProduct({
          terimler: {
            kar_payi_orani: { deger: null, periyot: "belirsiz" },
            vade_ay: { min: 12, max: 36 },
            tutar: { min: 10000, max: 500000 },
            tahsis_ucreti: { deger: null },
          },
        }),
      ],
    });
    const state = createEmptyState("t6");
    state.financingType = "consumer";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;
    const r = runFinancingMatchEngine({
      state,
      states: s,
      memoryProducts: [],
      memoryCampaigns: [],
    });
    expect(r.exactMatches[0].profitRate).toBeNull();
    expect(r.exactMatches[0].calculationAvailable).toBe(false);
  });

  it("Senaryo 7: süresi dolmuş kampanya gösterilmez", () => {
    const state = createEmptyState("t7");
    state.financingType = "consumer";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;
    const r = runFinancingMatchEngine({
      state,
      states,
      memoryProducts: [],
      memoryCampaigns: [],
    });
    expect(r.exactMatches.some((m) => m.bankId === "albaraka")).toBe(false);
    expect(
      r.flexibleMatches.some((m) => m.bankId === "albaraka"),
    ).toBe(false);
  });

  it("Senaryo 4: tutar tavanı esnek yüksek alternatifleri keser", () => {
    const state = createEmptyState("t4");
    state.financingType = "consumer";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;
    state.amountCapStrict = true;
    state.amountFlexibilityPercent = 0;

    const r = runFinancingMatchEngine({
      state,
      states,
      memoryProducts: [],
      memoryCampaigns: [],
    });
    expect(
      r.flexibleMatches.every(
        (m) =>
          m.offeredAmountTl == null || m.offeredAmountTl <= 200000,
      ),
    ).toBe(true);
  });
});

describe("konuşma servisi", () => {
  beforeEach(() => {
    resetConversationsForTests();
  });

  it("Senaryo 1: tutar var, amaç+vade sorulur", async () => {
    const r = await runFinansmanAssistantChat({
      message: "200 bin TL’ye ihtiyacım var.",
    });
    expect(r.status).toBe("needs_information");
    expect(r.missingFields).toContain("financingType");
    expect(r.missingFields).toContain("preferredTermMonths");
    expect(r.missingFields).not.toContain("requestedAmountTl");
    expect(r.query.requestedAmountTl).toBe(200000);
  });

  it("Senaryo 2: tam bilgiyle sonuç", async () => {
    const states = makeStates({
      "kuveyt-turk": [makeProduct()],
      "vakif-katilim": [makeProduct({ urun_adi: "B" })],
      "ziraat-katilim": [makeProduct({ urun_adi: "C" })],
    });
    const r = await runFinansmanAssistantChat(
      { message: "200 bin TL ihtiyaç finansmanı, 24 ay." },
      { matchOverride: { state: createEmptyState("x"), states, memoryProducts: [], memoryCampaigns: [] } },
    );
    // matchOverride state is overwritten inside with merged state — good
    expect(["results_ready", "no_exact_match", "no_verified_data"]).toContain(
      r.status,
    );
    expect(r.missingFields).toEqual([]);
    expect(r.query.requestedAmountTl).toBe(200000);
    expect(r.query.preferredTermMonths).toBe(24);
    expect(r.query.financingType).toBe("consumer");
    expect(r.exactMatches.length).toBeGreaterThanOrEqual(1);
  });

  it("Senaryo 3: tutar güncellemesi state korur", async () => {
    const states = makeStates({
      "kuveyt-turk": [makeProduct()],
    });
    const first = await runFinansmanAssistantChat(
      { message: "200 bin TL ihtiyaç finansmanı, 24 ay." },
      {
        matchOverride: {
          state: createEmptyState("c3"),
          states,
          memoryProducts: [],
          memoryCampaigns: [],
        },
      },
    );
    const second = await runFinansmanAssistantChat(
      {
        conversationId: first.conversationId,
        message: "Tutarı 250 bin yap.",
      },
      {
        matchOverride: {
          state: createEmptyState("c3"),
          states,
          memoryProducts: [],
          memoryCampaigns: [],
        },
      },
    );
    expect(second.query.requestedAmountTl).toBe(250000);
    expect(second.query.financingType).toBe("consumer");
    expect(second.query.preferredTermMonths).toBe(24);
  });

  it("Senaryo 4 konuşma: 200 bini aşamam", async () => {
    const states = makeStates({
      "ziraat-katilim": [
        makeProduct({
          terimler: {
            kar_payi_orani: { deger: 0.03, periyot: "aylik" },
            vade_ay: { min: 12, max: 36 },
            tutar: { min: 220000, max: 400000 },
            tahsis_ucreti: { deger: 0 },
          },
        }),
      ],
      "kuveyt-turk": [makeProduct()],
    });
    const first = await runFinansmanAssistantChat(
      { message: "200 bin ihtiyaç 24 ay" },
      {
        matchOverride: {
          state: createEmptyState("c4"),
          states,
          memoryProducts: [],
          memoryCampaigns: [],
        },
      },
    );
    const second = await runFinansmanAssistantChat(
      {
        conversationId: first.conversationId,
        message: "200 bini aşamam.",
      },
      {
        matchOverride: {
          state: createEmptyState("c4"),
          states,
          memoryProducts: [],
          memoryCampaigns: [],
        },
      },
    );
    expect(second.query.amountCapStrict).toBe(true);
    expect(
      second.flexibleMatches.every(
        (m) => !m.offeredAmountTl || m.offeredAmountTl <= 200000,
      ),
    ).toBe(true);
  });

  it("Senaryo 5: yeni müşteri kampanyaları", async () => {
    const states = makeStates({
      "kuveyt-turk": [
        makeProduct({
          musteri_segmenti: ["yeni_musteri"],
          urun_adi: "Yeni müşteri ihtiyaç",
        }),
      ],
    });
    const r = await runFinansmanAssistantChat(
      { message: "Yeni müşteri kampanyalarını göster. 200 bin ihtiyaç 24 ay" },
      {
        matchOverride: {
          state: createEmptyState("c5"),
          states,
          memoryProducts: [],
          memoryCampaigns: [
            {
              id: "camp1",
              bankId: "kuveyt-turk",
              title: "Yeni müşteri fırsatı",
              campaignStatus: "active",
              targetSegments: ["yeni_musteri"],
              minAmountTl: 100000,
              maxTermMonths: 36,
              profitRate: 0.02,
              sourceUrl: "https://www.kuveytturk.com.tr/kampanya",
              sourceCheckedAt: new Date().toISOString(),
              evidence: [{ field: "seg", text: "Yeni müşterilere özel" }],
            },
          ],
        },
      },
    );
    expect(r.query.customerStatus).toBe("new");
  });

  it("Senaryo 10: LLM sayı doğrulayıcı engeller", () => {
    const cleaned = sanitizeAssistantNumbers(
      "Aylık ödeme 999999 TL olabilir, tutar 200000 TL",
      [200000],
    );
    expect(cleaned).toContain("200000");
    expect(cleaned).toContain("[doğrulanmamış tutar]");
  });
});

describe("merge follow-up", () => {
  it("eksik alan listesi doğru", () => {
    const s = createEmptyState("m");
    s.requestedAmountTl = 200000;
    expect(missingRequiredFields(s)).toEqual([
      "financingType",
      "preferredTermMonths",
    ]);
    const next = mergeMessageIntoState(s, "ihtiyaç 24 ay");
    expect(missingRequiredFields(next)).toEqual([]);
  });
});

describe("kural tabanlı scraper çıkarımı", () => {
  it("finansman sinyali üretir", async () => {
    const { ruleBasedExtractRecords } = await import(
      "../../scraper/evrenExtractor"
    );
    const rows = ruleBasedExtractRecords({
      bankId: "kuveyt-turk",
      sourceUrl: "https://www.kuveytturk.com.tr/finansman",
      text:
        "İhtiyaç finansmanında aylık kâr payı oranı %2,90'dan başlar. " +
        "36 aya kadar vade imkânı sunulur. 10.000 TL ile 500.000 TL arası tutarlar için geçerlidir.",
      categoryHint: "consumer_finance",
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].category).toBe("consumer_finance");
    expect(rows[0].profitRate).not.toBeNull();
  });
});
