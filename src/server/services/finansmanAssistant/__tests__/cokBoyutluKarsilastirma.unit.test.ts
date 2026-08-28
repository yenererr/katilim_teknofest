import { describe, it, expect, beforeAll } from "vitest";
import {
  cokBoyutluKarsilastir,
  cokBoyutluMesaj,
  bildirmeEki,
  type BankaAdayi,
} from "../../tools/cokBoyutluKarsilastirma";
import {
  bankaAdaylariniTopla,
  odulCikar,
  masrafMuafiyetiCikar,
} from "../bankaAdaylari";
import { bankaAlanMesaji, iyelikEki } from "../bankaAlanYaniti";
import { classifyTurn, parseSorulanAlanlar } from "../finansmanNlu";
import { upsertExtractedRecords } from "../../postgres/store";
import {
  resetConversationsForTests,
  runFinansmanAssistantChat,
} from "../finansmanService";

function aday(over: Partial<BankaAdayi> & { bankId: string; bankName: string }): BankaAdayi {
  return {
    aylikKarPayiOrani: null,
    azamiVadeAy: null,
    masrafTl: null,
    odulTl: null,
    ...over,
  };
}

describe("çok boyutlu karşılaştırma motoru", () => {
  it("her boyutta ayrı kazanan belirler (Senaryo-2)", () => {
    const sonuc = cokBoyutluKarsilastir([
      aday({
        bankId: "a",
        bankName: "A Bankası",
        aylikKarPayiOrani: 0.0189,
        azamiVadeAy: 120,
        masrafMuafiyetiTl: 50_000,
        odulTl: null,
      }),
      aday({
        bankId: "c",
        bankName: "C Bankası",
        aylikKarPayiOrani: 0.0187,
        azamiVadeAy: 96,
        masrafTl: 7_500,
        odulTl: 5_000,
        odulAciklamasi: "5.000 TL alışveriş kartı",
      }),
    ], { tutarTl: 40_000 });

    const bul = (b: string) => sonuc.boyutlar.find((x) => x.boyut === b)!;

    // Oranda C daha düşük → C kazanır
    expect(bul("kar_payi").kazananBankName).toBe("C Bankası");
    expect(bul("kar_payi").gerekce).toContain("%1,87");

    // Vadede A daha uzun → A kazanır
    expect(bul("vade").kazananBankName).toBe("A Bankası");
    expect(bul("vade").gerekce).toContain("120 ay");

    // Masrafta A muafiyetli (40.000 ≤ 50.000 → 0 TL) → A kazanır
    expect(bul("masraf").kazananBankName).toBe("A Bankası");
    expect(bul("masraf").gerekce).toContain("50.000 TL");

    // Ödülde yalnızca C'nin verisi var → üstünlük iddia edilmez
    expect(bul("odul").karsilastirilabilir).toBe(false);

    // Kazananlar farklı olduğu için genel kazanan yok
    expect(sonuc.genelKazananBankName).toBeNull();
  });

  it("senaryo formatında mesaj üretir", () => {
    const sonuc = cokBoyutluKarsilastir([
      aday({
        bankId: "a",
        bankName: "A Bankası",
        aylikKarPayiOrani: 0.0189,
        azamiVadeAy: 120,
      }),
      aday({
        bankId: "c",
        bankName: "C Bankası",
        aylikKarPayiOrani: 0.0187,
        azamiVadeAy: 96,
      }),
    ]);
    const mesaj = cokBoyutluMesaj(sonuc, { urunEtiketi: "Konut finansmanı" });

    expect(mesaj).toContain("farklı avantajlar sunmaktadır");
    expect(mesaj).toMatch(/Kâr payı oranı açısından C Bankası daha avantajlıdır/);
    expect(mesaj).toMatch(/Vade açısından A Bankası daha avantajlıdır/);
  });

  it("eksik veriyi sıfır/avantaj saymaz", () => {
    const sonuc = cokBoyutluKarsilastir([
      aday({ bankId: "a", bankName: "A", masrafTl: 5000 }),
      aday({ bankId: "b", bankName: "B" }), // masraf bilinmiyor
    ]);
    const masraf = sonuc.boyutlar.find((x) => x.boyut === "masraf")!;
    expect(masraf.karsilastirilabilir).toBe(false);
    expect(masraf.kazananBankName).toBeNull();
    expect(masraf.gerekce).toMatch(/üstünlük iddia edilmiyor/);
  });

  it("eşitliği ayrıca bildirir", () => {
    const sonuc = cokBoyutluKarsilastir([
      aday({ bankId: "a", bankName: "A", aylikKarPayiOrani: 0.02 }),
      aday({ bankId: "b", bankName: "B", aylikKarPayiOrani: 0.02 }),
    ]);
    const oran = sonuc.boyutlar.find((x) => x.boyut === "kar_payi")!;
    expect(oran.esit).toBe(true);
    expect(oran.gerekce).toMatch(/eşit/);
  });

  it("masraf gerekçesi tam cümle kurar", () => {
    const sonuc = cokBoyutluKarsilastir([
      aday({ bankId: "a", bankName: "A", masrafTl: 8625 }),
      aday({ bankId: "b", bankName: "B", masrafTl: 25000 }),
    ]);
    const masraf = sonuc.boyutlar.find((x) => x.boyut === "masraf")!;
    expect(masraf.gerekce).toBe(
      "Masraf avantajı açısından A öne çıkmaktadır çünkü tahsis ücreti 8.625 TL.",
    );
  });

  it("ürün etiketi yokken cümle büyük harfle başlar ve eşitliği ayrıca belirtir", () => {
    const sonuc = cokBoyutluKarsilastir([
      aday({
        bankId: "a",
        bankName: "A",
        aylikKarPayiOrani: 0.03,
        azamiVadeAy: 60,
      }),
      aday({
        bankId: "b",
        bankName: "B",
        aylikKarPayiOrani: 0.03,
        azamiVadeAy: 48,
      }),
    ]);
    const mesaj = cokBoyutluMesaj(sonuc);
    expect(mesaj.startsWith("Karşılaştırmada")).toBe(true);
    expect(mesaj).toMatch(/bazı boyutlarda iki taraf eşit/);
  });

  it("tek banka ile karşılaştırma yapmaz", () => {
    const sonuc = cokBoyutluKarsilastir([aday({ bankId: "a", bankName: "A" })]);
    expect(sonuc.boyutlar).toHaveLength(0);
    expect(sonuc.notlar[0]).toMatch(/en az iki banka/);
  });

  it("yıllık oranı aylığa çevirmeden karıştırmaz", () => {
    // aylikKarPayiOrani alanı zaten normalize edilmiş kabul edilir;
    // normalize edilemeyen kayıtlar null gelir ve karşılaştırmaya girmez.
    const sonuc = cokBoyutluKarsilastir([
      aday({ bankId: "a", bankName: "A", aylikKarPayiOrani: null }),
      aday({ bankId: "b", bankName: "B", aylikKarPayiOrani: 0.02 }),
    ]);
    expect(
      sonuc.boyutlar.find((x) => x.boyut === "kar_payi")!.karsilastirilabilir,
    ).toBe(false);
  });
});

describe("Türkçe ek üretimi", () => {
  it("bildirme eki son rakama göre", () => {
    expect(bildirmeEki("%1,87")).toBe("'dir");
    expect(bildirmeEki("%2,03")).toBe("'tür");
    expect(bildirmeEki("%3,19")).toBe("'dur");
    expect(bildirmeEki("%2,90")).toBe("'dır");
  });

  it("ilgi eki banka adına göre", () => {
    expect(iyelikEki("Kuveyt Türk")).toBe("'ün");
    expect(iyelikEki("Vakıf Katılım")).toBe("'ın");
    expect(iyelikEki("Albaraka")).toBe("'nın");
    expect(iyelikEki("Türkiye Finans")).toBe("'ın");
  });
});

describe("metinden ödül ve masraf muafiyeti çıkarımı", () => {
  it("TL'li ödülü yakalar", () => {
    expect(odulCikar(["Kampanyada 5.000 TL alışveriş kartı hediye"])).toEqual({
      tl: 5000,
      aciklama: "5.000 TL alışveriş kartı",
    });
    expect(odulCikar(["2.500 TL'ye varan nakit iade fırsatı"]).tl).toBe(2500);
  });

  it("mil/puan ödülünü tutarsız olarak işaretler", () => {
    const r = odulCikar(["Yeni müşterilere 10.000 Mile varan fırsat"]);
    expect(r.tl).toBeNull();
    expect(r.aciklama).toMatch(/10\.000 Mil/i);
  });

  it("ödül yoksa null döner", () => {
    expect(odulCikar(["Konut finansmanı kampanyası"])).toEqual({
      tl: null,
      aciklama: null,
    });
  });

  it("masraf muafiyeti eşiğini yakalar", () => {
    expect(
      masrafMuafiyetiCikar(["50.000 TL'ye kadar dosya masrafı alınmamaktadır."]),
    ).toBe(50000);
    expect(
      masrafMuafiyetiCikar(["Dosya masrafı 100.000 TL'ye kadar alınmaz."]),
    ).toBe(100000);
    expect(masrafMuafiyetiCikar(["Tahsis ücreti binde 5'tir."])).toBeNull();
  });
});

describe("NLU: yeni niyetler", () => {
  it("iki banka + üstünlük sorusunu karşılaştırma sayar", () => {
    expect(classifyTurn("Kuveyt Türk mü daha avantajlı, Ziraat Katılım mı?")).toBe(
      "multi_bank_comparison",
    );
    expect(
      classifyTurn("Vakıf Katılım ile Albaraka arasındaki fark ne?"),
    ).toBe("multi_bank_comparison");
    expect(
      classifyTurn("Kuveyt Türk ve Türkiye Finans hangisi daha uygun"),
    ).toBe("multi_bank_comparison");
  });

  it("tek banka oran sorusu bank_focus kalır", () => {
    expect(classifyTurn("albarakada oranlar ne")).toBe("bank_focus");
    expect(classifyTurn("Kuveyt Türk'ün konut finansmanı oranı ne?")).toBe(
      "bank_focus",
    );
  });

  it("sorulan alanları ayırt eder", () => {
    expect(parseSorulanAlanlar("konut finansmanı oranı ne")).toContain("kar_payi");
    expect(parseSorulanAlanlar("kaç ay vade veriyor")).toContain("vade");
    expect(parseSorulanAlanlar("dosya masrafı var mı")).toContain("masraf");
    expect(parseSorulanAlanlar("hediye kartı veriyor mu")).toContain("odul");
  });
});

describe("aday toplama ve alan yanıtı (kazınmış veri)", () => {
  beforeAll(async () => {
    // Canlı motoru olmayan bankalar seçildi → test ağa çıkmaz.
    await upsertExtractedRecords([
      {
        bankId: "turkiye-finans",
        recordType: "product",
        category: "housing_finance",
        productType: "konut_finansmani",
        productName: "Konut Finansmanı Kampanyası",
        title: "Konut Finansmanı",
        sourceUrl: "https://www.turkiyefinans.com.tr/konut-test",
        sourceCheckedAt: new Date().toISOString(),
        profitRate: 0.0189,
        ratePeriod: "monthly",
        maxTermMonths: 120,
        allocationFeeType: null,
        allocationFeeValue: null,
        rewardAmountTl: null,
        campaignAdvantage: "50.000 TL'ye kadar dosya masrafı alınmamaktadır.",
        conditions: [],
        evidence: [{ field: "kar_payi_orani", text: "Kâr payı oranı %1,89.", confidence: 0.95 }],
      },
      {
        bankId: "albaraka",
        recordType: "product",
        category: "housing_finance",
        productType: "konut_finansmani",
        productName: "Albaraka Konut",
        title: "Albaraka Konut",
        sourceUrl: "https://www.albaraka.com.tr/konut-test",
        sourceCheckedAt: new Date().toISOString(),
        profitRate: 0.0187,
        ratePeriod: "monthly",
        maxTermMonths: 96,
        allocationFeeType: "fixed",
        allocationFeeValue: 7500,
        rewardAmountTl: null,
        campaignAdvantage: "Kampanyada 5.000 TL alışveriş kartı hediye edilir.",
        conditions: [],
        evidence: [{ field: "kar_payi_orani", text: "Kâr payı oranı %1,87.", confidence: 0.95 }],
      },
    ] as any);
  });

  it("kazınmış kayıttan aday üretir ve ödül/muafiyet çıkarır", async () => {
    const { adaylar } = await bankaAdaylariniTopla({
      bankIds: ["turkiye-finans", "albaraka"],
      financingType: "housing",
      canliKullan: false,
    });

    const tf = adaylar.find((a) => a.bankId === "turkiye-finans")!;
    const al = adaylar.find((a) => a.bankId === "albaraka")!;

    expect(tf.aylikKarPayiOrani).toBeCloseTo(0.0189, 5);
    expect(tf.azamiVadeAy).toBe(120);
    expect(tf.masrafMuafiyetiTl).toBe(50000);

    expect(al.aylikKarPayiOrani).toBeCloseTo(0.0187, 5);
    expect(al.odulTl).toBe(5000);
    expect(al.odulAciklamasi).toMatch(/5\.000 TL alışveriş kartı/);
  });

  it("Senaryo-1: tek banka alan yanıtı oran + vade cümlesi kurar", async () => {
    const { adaylar } = await bankaAdaylariniTopla({
      bankIds: ["turkiye-finans"],
      financingType: "housing",
      canliKullan: false,
    });
    const yanit = bankaAlanMesaji({
      aday: adaylar[0],
      urunEtiketi: "Konut finansmanı",
      alanlar: ["kar_payi", "vade"],
    });

    expect(yanit.cevaplandi).toBe(true);
    expect(yanit.mesaj).toMatch(/%1,89/);
    expect(yanit.mesaj).toMatch(/120 aya kadar/);
    expect(yanit.mesaj).toMatch(/Türkiye Finans'ın/);
  });

  it("Senaryo-2: uçtan uca çok boyutlu karşılaştırma yanıtı", async () => {
    resetConversationsForTests();
    const r = await runFinansmanAssistantChat({
      message:
        "Konut finansmanında Türkiye Finans mı daha avantajlı, Albaraka mı?",
      conversationId: "senaryo2",
    });

    expect(r.assistantMessage).toMatch(/Kâr payı oranı açısından Albaraka/);
    expect(r.assistantMessage).toMatch(/%1,87/);
    expect(r.assistantMessage).toMatch(/Vade açısından Türkiye Finans/);
    expect(r.assistantMessage).toMatch(/120 ay/);
    expect(r.status).toBe("results_ready");
  });

  it("temsili tutar muafiyet eşiğini aşarsa masrafı avantaj saymaz", async () => {
    // Konut varsayılanı 1.500.000 TL; 50.000 TL'lik muafiyet bu tutarda geçersiz.
    const { adaylar, tutarTl } = await bankaAdaylariniTopla({
      bankIds: ["turkiye-finans", "albaraka"],
      financingType: "housing",
      canliKullan: false,
    });
    expect(tutarTl).toBe(1_500_000);

    const sonuc = cokBoyutluKarsilastir(adaylar, { tutarTl });
    const masraf = sonuc.boyutlar.find((x) => x.boyut === "masraf")!;
    expect(masraf.karsilastirilabilir).toBe(false);
  });

  it("Senaryo-1 uçtan uca: tek banka oran sorusu tutar/vade sormadan cevaplanır", async () => {
    resetConversationsForTests();
    const r = await runFinansmanAssistantChat({
      message: "Türkiye Finans'ın konut finansmanı oranı ne?",
      conversationId: "senaryo1",
    });

    expect(r.status).toBe("results_ready");
    expect(r.assistantMessage).toMatch(/%1,89/);
    expect(r.assistantMessage).toMatch(/120 aya kadar/);
    // Eskiden "ne kadar tutar ve kaç ay vade" diye soruyordu
    expect(r.assistantMessage).not.toMatch(/kaç ay vade düşünüyorsunuz/i);
  });
});
