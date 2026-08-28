import { describe, expect, it } from "vitest";
import { BANK_SOURCE_CONFIGS } from "../bankSourceConfig";
import { classifyByUrlAndText } from "../adapters/baseAdapter";
import { ruleBasedExtractRecords } from "../evrenExtractor";
import { KAMPANYA_TURU_ETIKET } from "../../../../nlp/kampanyaTuru";

describe("şartname 5.1 — BDDK katılım bankası kapsamı", () => {
  it("11 aktif banka yapılandırmada tanımlı", () => {
    const aktif = BANK_SOURCE_CONFIGS.filter((b) => b.enabled);
    expect(aktif).toHaveLength(11);
    expect(aktif.map((b) => b.bankId)).toContain("iktisat-katilim");
  });

  it("İktisat Katılım resmî domain ile seed URL taşır", () => {
    const iktisat = BANK_SOURCE_CONFIGS.find((b) => b.bankId === "iktisat-katilim");
    expect(iktisat?.allowedDomains).toContain("www.iktisatkatilim.com.tr");
    expect(iktisat?.seedUrls[0]?.url).toMatch(/^https:\/\/www\.iktisatkatilim\.com\.tr/);
  });
});

describe("şartname 5.4 — scraper kategori sınıflandırması", () => {
  it("yeni müşteri kampanyasını ayırt eder", () => {
    expect(
      classifyByUrlAndText(
        "https://www.ornek.com.tr/kampanyalar/yeni-musteri",
        "Bankamıza yeni müşteri olanlara hoş geldin hediyesi.",
      ),
    ).toBe("new_customer_financing");
  });

  it("yatırım ürünü kampanyasını ayırt eder", () => {
    expect(
      classifyByUrlAndText(
        "https://www.ornek.com.tr/kampanyalar/katilma-hesabi",
        "Katılma hesabı açan müşterilerimize özel kâr payı getirisi.",
      ),
    ).toBe("investment_product");
  });
});

describe("şartname 5.3/5.4 — çıkarılan kayıt alanları", () => {
  const senaryoMetni =
    "Bankamıza yeni müşteri olanlara özel %1,89 kâr payı oranı ile 120 aya kadar " +
    "konut finansmanı fırsatı sunulmaktadır. Maaş müşterilerimize ek avantaj sağlanır. " +
    "Kampanya kapsamında 50.000 TL'ye kadar dosya masrafı alınmamaktadır.";

  it("hedef kitle, avantaj, masraf ve kampanya türünü birlikte yazar", () => {
    const [kayit] = ruleBasedExtractRecords({
      bankId: "ornek-banka",
      sourceUrl: "https://www.ornek.com.tr/kampanyalar/konut-finansmani",
      text: senaryoMetni,
      categoryHint: "housing_finance",
    });

    expect(kayit.targetSegments).toEqual(
      expect.arrayContaining(["yeni_musteri", "maas_musterisi"]),
    );
    expect(kayit.campaignType).toBe("konut_finansmani_kampanyasi");
    expect(kayit.campaignAdvantage).toBeTruthy();
    expect(kayit.feeStatus).toBe("Dosya masrafı yok");
    expect(kayit.productType).toBe("konut_finansmani");
    expect(kayit.profitRate).toBeCloseTo(0.0189, 4);
  });

  it("sekiz kampanya türünün tamamı etiketli", () => {
    expect(Object.keys(KAMPANYA_TURU_ETIKET)).toHaveLength(8);
  });
});
