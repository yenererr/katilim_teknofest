import { describe, expect, it } from "vitest";
import { kuralTabanliOzet } from "../kampanyaOzetle";
import type { ExtractedFinancialRecord } from "../../scraper/scraperTypes";

/**
 * Özet yalnızca ilgili kampanyanın kendi alanlarından üretilmelidir.
 * Eksik alan tamamlanmaz, başka kampanyadan bilgi sızmaz.
 */
const kayit = (o: Partial<ExtractedFinancialRecord>): ExtractedFinancialRecord => ({
  bankId: "turkiye-finans",
  sourceUrl: "https://ornek.test/kampanya",
  sourceCheckedAt: "2026-08-28T00:00:00.000Z",
  title: null,
  recordType: "campaign",
  category: "financing_campaign" as ExtractedFinancialRecord["category"],
  productName: null,
  productType: null,
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
  evidence: [],
  manualReviewRequired: false,
  ...o,
});

describe("kural tabanlı kampanya özeti", () => {
  it("yalnızca dolu alanlardan cümle kurar", () => {
    const o = kuralTabanliOzet(
      kayit({
        productName: "Sigortalı İhtiyaç Finansmanı (12 ay)",
        profitRate: 0.0415,
        ratePeriod: "monthly",
        minAmountTl: 50_001,
        maxAmountTl: 250_000,
        maxTermMonths: 12,
        minTermMonths: 12,
        campaignEnd: "2026-12-31",
      }),
    );
    expect(o.ozet).toContain("aylık %4,15");
    expect(o.ozet).toContain("12 aya kadar vade");
    expect(o.ozet).toContain("50.001 TL ile 250.000 TL");
    expect(o.ozet).toContain("31 Aralık 2026");
    expect(o.veriYetersiz).toBe(false);
  });

  it("boş alanlar hakkında cümle üretmez", () => {
    const o = kuralTabanliOzet(
      kayit({ productName: "Taşıt Kampanyası", profitRate: 0.031, ratePeriod: "monthly" }),
    );
    expect(o.ozet).toContain("%3,10");
    // Ödül, masraf, vade, tutar verilmedi — bunlardan hiç bahsedilmemeli.
    expect(o.ozet).not.toMatch(/ödül|tahsis|vade|tutar/i);
  });

  it("hiç yapılandırılmış alan yoksa veri yetersiz der, bilgi uydurmaz", () => {
    const o = kuralTabanliOzet(kayit({ productName: "Vade Farksız Kampanyası" }));
    expect(o.veriYetersiz).toBe(true);
    expect(o.kullanilanAlanlar).toHaveLength(0);
    expect(o.ozet).toContain("yapılandırılmış bilgi çıkarılamadı");
    expect(o.ozet).toContain("resmî sayfayı");
    expect(o.ozet).not.toMatch(/%\d/);
  });

  it("tahsis ücreti sıfırsa ücretsiz olduğunu belirtir", () => {
    const o = kuralTabanliOzet(
      kayit({ productName: "Masrafsız Finansman", allocationFeeValue: 0 }),
    );
    expect(o.ozet).toContain("Tahsis ücreti alınmamaktadır");
    expect(o.veriYetersiz).toBe(false);
  });

  it("ödül tutarını ve türünü aktarır", () => {
    const o = kuralTabanliOzet(
      kayit({
        productName: "ParafPara Kampanyası",
        rewardAmountTl: 3000,
        rewardType: "puan",
        campaignTheme: "shopping",
      }),
    );
    expect(o.ozet).toContain("3.000 TL puan");
    expect(o.ozet).toContain("alışveriş temalı");
  });

  it("kullanılan alanları şeffaflık için döndürür", () => {
    const o = kuralTabanliOzet(
      kayit({ productName: "Test", profitRate: 0.04, ratePeriod: "monthly", campaignEnd: "2026-12-31" }),
    );
    expect(o.kullanilanAlanlar).toContain("profitRate");
    expect(o.kullanilanAlanlar).toContain("campaignEnd");
    expect(o.kaynak).toBe("kural");
  });
});
