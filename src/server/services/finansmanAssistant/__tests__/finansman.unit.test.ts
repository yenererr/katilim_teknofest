import { describe, it, expect, beforeEach } from "vitest";
import {
  parseTurkishAmount,
  parseTermMonths,
  parseFinancingType,
  parseProfitRatePercent,
  classifyTurn,
  mergeMessageIntoState,
  missingRequiredFields,
  createEmptyState,
  parseLimitInquiry,
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
import { VERIFIED_RESEARCH_RECORDS } from "../../verifiedResearch/records";
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
    expect(parseTurkishAmount("beş yüz bin tl")).toBe(500000);
    expect(parseTurkishAmount("Bes yuz bin TL ihtiyac")).toBe(500000);
    expect(parseTurkishAmount("iki milyon")).toBe(2000000);
    expect(parseTurkishAmount("yüz elli bin")).toBe(150000);
  });

  it("vade ve amaç çıkarır", () => {
    expect(parseTermMonths("24 ay istiyorum")).toBe(24);
    expect(parseTermMonths("24")).toBe(24);
    expect(parseTermMonths("36")).toBe(36);
    expect(parseFinancingType("ihtiyaç finansmanı")).toBe("consumer");
    expect(parseFinancingType("bir araç almak")).toBe("vehicle");
    expect(parseFinancingType("eğitim kampanyaları")).toBeNull();
    expect(parseFinancingType("eğitim finansmanı")).toBe("education");
    expect(parseFinancingType("ev alcam")).toBe("housing");
    expect(parseFinancingType("ev alacagım")).toBe("housing");
    expect(parseFinancingType("ev kredisi almak istiyorum")).toBe("housing");
    expect(parseFinancingType("ev")).toBe("housing");
    expect(parseFinancingType("konut")).toBe("housing");
    expect(classifyTurn("ev")).toBe("param_update");
    expect(classifyTurn("ev alacagım")).toBe("param_update");
    expect(classifyTurn("ev kredisi almak istiyorum en iyisi hangisi")).toBe(
      "param_update",
    );

    let housing = createEmptyState("housing-flow");
    housing = mergeMessageIntoState(
      housing,
      "ev kredisi almak istiyorum en iyisi hangisi",
    );
    expect(housing.financingType).toBe("housing");
    housing = mergeMessageIntoState(housing, "5 milyon 120 ay");
    expect(housing.requestedAmountTl).toBe(5_000_000);
    expect(housing.preferredTermMonths).toBe(120);
    expect(missingRequiredFields(housing)).toEqual([]);
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
    expect(classifyTurn("ziraat katılımın ne tür kmapnayalrı var")).toBe(
      "campaign_search",
    );
    expect(classifyTurn("hacca gideceğim")).toBe("ambiguous_purpose");
    expect(classifyTurn("hacca gitmek için özel bir şey var mı")).toBe(
      "campaign_search",
    );
    expect(classifyTurn("araba alcam")).toBe("param_update");
    expect(classifyTurn("ev alcam")).toBe("param_update");
    expect(parseFinancingType("ev alcam")).toBe("housing");
    expect(parseFinancingType("bisiklet alcam")).toBe("shopping");
    expect(classifyTurn("oğluma bisiklet alacağım")).toBe("param_update");
    expect(classifyTurn("bisiklet alcam")).toBe("param_update");
    expect(parseFinancingType("yemek yiyeceğim para lazım")).toBe("consumer");
    expect(classifyTurn("yemek yiyeceğim para lazım")).toBe("param_update");
    expect(classifyTurn("acil nakit lazım")).toBe("param_update");
    expect(classifyTurn("faturaları ödeyeceğim para lazım")).toBe("param_update");
    expect(classifyTurn("pardon 24 ay")).toBe("param_update");
    expect(classifyTurn("merhaba")).toBe("greeting");
    expect(classifyTurn("merhaba yardıma ihtiyacım var")).toBe("greeting");
    expect(classifyTurn("nasılsın")).toBe("greeting");
    expect(classifyTurn("Nasılsın?")).toBe("greeting");
    expect(classifyTurn("neler yapabilirsin")).toBe("greeting");
    expect(classifyTurn("Neler yapabilirsin?")).toBe("greeting");
    expect(classifyTurn("kimsin")).toBe("greeting");
    expect(classifyTurn("teşekkürler")).toBe("greeting");
    expect(classifyTurn("selamın aleykum")).toBe("greeting");
    expect(classifyTurn("selamün aleyküm")).toBe("greeting");
    expect(classifyTurn("aleyküm selam")).toBe("greeting");
    expect(classifyTurn("kar payı yatırmak istiyorum")).toBe("deposit_inquiry");
    expect(classifyTurn("ben para yatırmak istiyom faizını yicem")).toBe(
      "deposit_inquiry",
    );
    expect(classifyTurn("kampanya var mı bilgisayar alcam")).toBe(
      "campaign_search",
    );
    expect(classifyTurn("uçak bileti için kampanya ne var")).toBe(
      "campaign_search",
    );
    expect(classifyTurn("parayı geri ödemeyeceğim kötü biriyim")).toBe(
      "policy_refuse",
    );
    expect(classifyTurn("vade yok para verin geri vermicem")).toBe(
      "policy_refuse",
    );
    expect(classifyTurn("baska banka yok mu")).toBe("meta_question");
    expect(classifyTurn("niye hep aynı cevabı veriyorsun")).toBe("meta_question");
    expect(classifyTurn("albarakada oranlar ne")).toBe("bank_focus");
    expect(classifyTurn("ziraat katılım oranları ne")).toBe("bank_focus");
  });

  it("kaç banka var → listele takip eder", async () => {
    resetConversationsForTests();
    const sayi = await runFinansmanAssistantChat({
      message: "kaç tane katılım bankası var",
    });
    expect(sayi.assistantMessage).toMatch(/katılım bankası/i);
    expect(sayi.query.pendingFollowUp).toBe("banka_listesi");

    const liste = await runFinansmanAssistantChat({
      conversationId: sayi.conversationId,
      message: "listele",
    });
    expect(liste.assistantMessage).toMatch(/Kuveyt Türk|Albaraka|Vakıf/i);
    expect(liste.assistantMessage).not.toMatch(/Bu konuda yardımcı olamam/);
  });

  it("azami vade/tutar sorularını limit_inquiry sayar", () => {
    expect(classifyTurn("en fazla ne kadar oluyor")).toBe("limit_inquiry");
    expect(classifyTurn("en fazla kac ay oluyor")).toBe("limit_inquiry");
    expect(classifyTurn("en fazla kac aylik kredi alabiliyorum")).toBe(
      "limit_inquiry",
    );
    expect(parseLimitInquiry("en fazla ne kadar oluyor")).toBe("amount");
    expect(parseLimitInquiry("en fazla kac ay oluyor")).toBe("term");
  });

  it("nasılsın ve neler yapabilirsin anlamlı yanıt verir", async () => {
    resetConversationsForTests();
    const how = await runFinansmanAssistantChat({ message: "nasılsın" });
    expect(how.assistantMessage).toMatch(/[İiI]yiyim/);
    expect(how.exactMatches).toEqual([]);

    const caps = await runFinansmanAssistantChat({
      conversationId: how.conversationId,
      message: "neler yapabilirsin",
    });
    expect(caps.assistantMessage).toMatch(/Finansman karşılaştırma|karşılaştır/i);
    expect(caps.assistantMessage).toMatch(/Ödeme planı|ödeme planı/i);
  });

  it("konut bağlamında azami vade sorusuna yanıt verir", async () => {
    resetConversationsForTests();
    const first = await runFinansmanAssistantChat({
      message: "ev almak istiyorum",
    });
    expect(first.query.financingType).toBe("housing");
    expect(first.assistantMessage).not.toMatch(/yardımcı olamam/);

    const maxTerm = await runFinansmanAssistantChat({
      conversationId: first.conversationId,
      message: "en fazla kac ay oluyor",
    });
    expect(maxTerm.assistantMessage).not.toMatch(/yardımcı olamam/);
    expect(maxTerm.assistantMessage).toMatch(/vade|ay/i);
    expect(maxTerm.query.financingType).toBe("housing");

    const maxAmt = await runFinansmanAssistantChat({
      conversationId: first.conversationId,
      message: "en fazla ne kadar oluyor",
    });
    expect(maxAmt.assistantMessage).not.toMatch(/yardımcı olamam/);
    expect(maxAmt.assistantMessage).toMatch(/tutar|TL|milyon/i);
  });

  it("selamlaşma önceki aramayı yeniden çalıştırmaz", async () => {
    resetConversationsForTests();
    const first = await runFinansmanAssistantChat(
      { message: "200 bin TL ihtiyaç finansmanı, 24 ay." },
      {
        matchOverride: {
          state: createEmptyState("hi"),
          states: makeStates({ "kuveyt-turk": [makeProduct()] }),
          memoryProducts: [],
          memoryCampaigns: [],
        },
      },
    );
    const second = await runFinansmanAssistantChat({
      conversationId: first.conversationId,
      message: "merhaba yardıma ihtiyacım var",
    });
    expect(second.query.financingType).toBe("consumer");
    expect(second.query.preferredTermMonths).toBe(24);
    // Selamlaşma yeni bir arama tetiklememeli; önceki bağlam korunur.
    expect(second.assistantMessage).not.toMatch(/karşılaştırdım/);
    expect(second.assistantMessage.length).toBeGreaterThan(0);
    expect(second.exactMatches).toEqual([]);
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
    // Konu dışı mesaj RAG katmanına devredilir: finansman eşleştirme motoru
    // çalışmaz, önceki tür/vade korunur, yine de bir cevap üretilir.
    expect(second.exactMatches).toEqual([]);
    expect(second.flexibleMatches).toEqual([]);
    expect(second.assistantMessage.length).toBeGreaterThan(0);
    expect(second.assistantMessage).not.toMatch(/yalnızca katılım bankalarının/i);
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

  it("banka + amaç belirtilince samimi onayla tutar/vade sorar", async () => {
    const r = await runFinansmanAssistantChat({
      message: "ziraat bankasından ihtiyaç kredisi almak istiyorum",
    });
    expect(r.status).toBe("needs_information");
    expect(r.query.selectedBankIds).toContain("ziraat-katilim");
    expect(r.query.financingType).toBe("consumer");
    expect(r.assistantMessage).toMatch(/Anladım.*Ziraat Katılım/i);
    expect(r.assistantMessage).toMatch(/Ne kadar tutar ve kaç ay vade/i);
    expect(r.assistantMessage).not.toMatch(/Bu konuda yardımcı olamam/);
  });

  it("iyiyim teşekkür sohbetine nazik yanıt verir", async () => {
    const r = await runFinansmanAssistantChat({
      message: "ben de iyiyim teşkkür ederim",
    });
    expect(r.assistantMessage).toMatch(/sevindim|Rica ederim/i);
    expect(r.assistantMessage).not.toMatch(/yardımcı olamam/);
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

describe("doğrulanmış araştırma kayıtları", () => {
  it("Türkiye Finans resmi tablo kaydını ihtiyaç finansmanı teklifi olarak eşler", () => {
    const state = createEmptyState("verified-research");
    state.financingType = "consumer";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;

    const result = runFinancingMatchEngine({
      state,
      states: [],
      memoryProducts: VERIFIED_RESEARCH_RECORDS.filter(
        (r) => r.recordType === "product",
      ),
      memoryCampaigns: [],
    });

    expect(result.exactMatches).toHaveLength(1);
    expect(result.exactMatches[0].bankId).toBe("turkiye-finans");
    expect(result.exactMatches[0].productName).toBe(
      "Sigortalı İhtiyaç Finansmanı (24 ay)",
    );
    expect(result.exactMatches[0].profitRate).toBeCloseTo(0.0399);
    expect(result.exactMatches[0].allocationFeeTl).toBe(1000);
  });

  it("Vakıf Katılım taşıt 24 ay kaydını tam eşleşme olarak döner", () => {
    const state = createEmptyState("verified-vehicle");
    state.financingType = "vehicle";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;

    const result = runFinancingMatchEngine({
      state,
      states: [],
      memoryProducts: VERIFIED_RESEARCH_RECORDS.filter(
        (r) => r.recordType === "product",
      ),
      memoryCampaigns: [],
    });

    expect(result.hasVerifiedData).toBe(true);
    expect(result.exactMatches.length).toBeGreaterThanOrEqual(1);
    const vakif = result.exactMatches.find((m) => m.bankId === "vakif-katilim");
    expect(vakif).toBeTruthy();
    expect(vakif!.profitRate).toBeCloseTo(0.0324);
    expect(vakif!.estimatedMonthlyPaymentTl).not.toBeNull();
  });

  it("Oranı %3 yap parametre güncellemesi olarak sınıflanır", () => {
    expect(parseProfitRatePercent("Oranı %3 yap")).toBe(3);
    expect(classifyTurn("Oranı %3 yap")).toBe("param_update");
    const s = createEmptyState("rate-only");
    s.financingType = "vehicle";
    s.requestedAmountTl = 200000;
    s.preferredTermMonths = 24;
    const next = mergeMessageIntoState(s, "Oranı %3 yap");
    expect(next.customProfitRatePercent).toBe(3);
    expect(next.financingType).toBe("vehicle");
  });

  it("taşıt sorgusunda ihtiyaç yeni-müşteri kampanyalarını esnek alternatif olarak göstermez", () => {
    const state = createEmptyState("vehicle-no-ihtiyac-flex");
    state.financingType = "vehicle";
    state.requestedAmountTl = 200000;
    state.preferredTermMonths = 24;
    state.customerStatus = "unknown";

    const result = runFinancingMatchEngine({
      state,
      states: [],
      memoryProducts: [],
      memoryCampaigns: VERIFIED_RESEARCH_RECORDS.filter(
        (r) =>
          r.recordType === "campaign" ||
          r.category === "new_customer_financing",
      ),
    });

    expect(
      result.flexibleMatches.every(
        (f) =>
          !/ihtiya[cç]|pratik finansman|50\.000/i.test(f.campaignName) &&
          !/vade farks[iı]z.*140/i.test(f.campaignName),
      ),
    ).toBe(true);
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

  it("kampanya detayından koşul, bitiş tarihi ve taksit çıkarır", async () => {
    const { ruleBasedExtractRecords } = await import(
      "../../scraper/evrenExtractor"
    );
    const rows = ruleBasedExtractRecords({
      bankId: "albaraka",
      sourceUrl:
        "https://www.albaraka.com.tr/tr/kampanyalar/detay/vade-farksiz-kampanyasi",
      text:
        "Vade Farksız 140.000 TL’ye Varan Destek! " +
        "Şimdi Albaraka Mobil’den müşteri olanlar, %0 kâr payı ile 40.000 TL’ye kadar Pratik Finansman Kart kullanabilir. " +
        "100.000 TL’ye kadar seçili sektörlerde vade farksız 6 taksit fırsatı sunulur. " +
        "Kampanya 1 Ocak 2026 - 31 Aralık 2026 tarihlerinde geçerlidir.",
      categoryHint: "card_campaign",
    });
    expect(rows[0].campaignEnd).toBe("2026-12-31");
    expect(rows[0].conditions.length).toBeGreaterThan(0);
    expect(rows[0].installmentCount).toBe(6);
    expect(rows[0].maxAmountTl).toBe(140000);
    expect(rows[0].evidence.some((e) => e.field === "summary")).toBe(true);
  });

  it("MCC kodundaki AYAK ifadesini vade ayı sanmaz", async () => {
    const { ruleBasedExtractRecords } = await import(
      "../../scraper/evrenExtractor"
    );
    const rows = ruleBasedExtractRecords({
      bankId: "albaraka",
      sourceUrl:
        "https://www.albaraka.com.tr/tr/kampanyalar/detay/saglik-harcamalarina-vade-farksiz-6-taksit-kampanyasi1-2",
      text:
        "Kampanya, 8049-AYAK RAHATSIZLIKLARI UZMANLARI olan üye iş yerlerinde geçerlidir. " +
        "TROY kredi kartlarınız ile yapacağınız 1.000 TL-100.000 TL arası sağlık harcamalarınıza vade farksız 6 taksit fırsatı.",
      categoryHint: "card_campaign",
    });

    expect(rows[0].maxTermMonths).toBe(6);
    expect(rows[0].installmentCount).toBe(6);
  });
});
