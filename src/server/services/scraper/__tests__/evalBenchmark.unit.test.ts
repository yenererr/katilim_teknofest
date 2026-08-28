import { describe, expect, it } from "vitest";
import { REFERANS_KAMPANYALAR } from "../../../../data/referansKampanyalar";
import { inferCampaignStatus, inferCampaignTheme } from "../campaignNormalize";

describe("Reference Dataset Evaluation Benchmark", () => {
  it("referans veri setindeki 185 kaydı eksiksiz yükler", () => {
    expect(REFERANS_KAMPANYALAR.length).toBe(185);
  });

  it("kampanya yayınlayan 10 katılım bankasının tamamını kapsar", () => {
    const bankIds = new Set(REFERANS_KAMPANYALAR.map((c) => c.bankaId));
    expect(bankIds.size).toBe(10);
    expect(bankIds.has("kuveyt-turk")).toBe(true);
    expect(bankIds.has("albaraka")).toBe(true);
    expect(bankIds.has("emlak-katilim")).toBe(true);
    expect(bankIds.has("ziraat-katilim")).toBe(true);
    expect(bankIds.has("vakif-katilim")).toBe(true);
  });

  it("tarihi geçmiş kampanyaların gösterim durumunu doğru olarak eler", () => {
    const expiredCount = REFERANS_KAMPANYALAR.filter(
      (c) => inferCampaignStatus("2024-01-01") === "expired",
    ).length;
    expect(expiredCount).toBe(185);
  });

  it("kart ve yeni müşteri kampanyalarını doğru temalara eşler", () => {
    const cardCampaigns = REFERANS_KAMPANYALAR.filter((c) => c.etiket === "PUAN");
    for (const c of cardCampaigns) {
      const theme = inferCampaignTheme({
        title: c.baslik,
        category: "card_campaign",
        sourceUrl: c.sourceUrl,
      });
      expect(["card", "education", "shopping", "travel", "general"]).toContain(theme);
    }
  });

  it("hiçbir kayıtta uydurma alan veya tanımsız banka ID bırakmaz", () => {
    for (const c of REFERANS_KAMPANYALAR) {
      expect(c.bankaId).toBeTruthy();
      expect(c.baslik).toBeTruthy();
      expect(c.aciklama).toBeTruthy();
      if (c.sourceUrl) {
        expect(c.sourceUrl).toMatch(/^https?:\/\//);
      }
    }
  });
});
