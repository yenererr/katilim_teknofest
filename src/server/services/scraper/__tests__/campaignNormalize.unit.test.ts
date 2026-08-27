import { describe, expect, it } from "vitest";
import {
  dedupeCampaignRecords,
  inferCampaignTheme,
  isCampaignListingUrl,
  isDisplayableCampaign,
  isJunkCampaignTitle,
  isLikelyCampaignUrl,
  parseCampaignThemeFromMessage,
  prettifyCampaignTitle,
} from "../campaignNormalize";

describe("campaignNormalize", () => {
  it("liste URL'sini ayırt eder", () => {
    expect(
      isCampaignListingUrl(
        "https://www.vakifkatilim.com.tr/tr/kendim-icin/kampanyalar",
      ),
    ).toBe(true);
    expect(
      isCampaignListingUrl(
        "https://www.vakifkatilim.com.tr/tr/kendim-icin/kampanyalar/detay/tamamla-kazan",
      ),
    ).toBe(false);
  });

  it("junk başlıkları eler", () => {
    expect(isJunkCampaignTitle("Kampanyalar")).toBe(true);
    expect(isJunkCampaignTitle("gizlilik ve guvenlik")).toBe(true);
    expect(isJunkCampaignTitle("Tamamla Kazan")).toBe(false);
  });

  it("kurumsal / ürün URL’lerini kampanya saymaz", () => {
    expect(
      isLikelyCampaignUrl("https://www.adilkatilim.com.tr/gizlilik-ve-guvenlik"),
    ).toBe(false);
    expect(
      isLikelyCampaignUrl(
        "https://www.kuveytturk.com.tr/kendim-icin/finansmanlar/konut-finansmanlari",
      ),
    ).toBe(false);
    expect(
      isLikelyCampaignUrl("https://tombank.com.tr/index.html"),
    ).toBe(false);
    expect(
      isLikelyCampaignUrl(
        "https://www.ziraatkatilim.com.tr/bireysel/finansman-urunleri/tasit-finansmani",
      ),
    ).toBe(false);
    expect(
      isLikelyCampaignUrl(
        "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/ticari-kampanyalar.aspx",
      ),
    ).toBe(false);
    expect(
      isLikelyCampaignUrl(
        "https://www.vakifkatilim.com.tr/tr/kendim-icin/kampanyalar/detay/tamamla-kazan",
      ),
    ).toBe(true);
    expect(
      isDisplayableCampaign({
        title: "gizlilik ve guvenlik",
        sourceUrl: "https://www.adilkatilim.com.tr/gizlilik-ve-guvenlik",
      }),
    ).toBe(false);
    expect(
      isDisplayableCampaign({
        title: "Süresi Dolmuş",
        sourceUrl:
          "https://www.albaraka.com.tr/tr/kampanyalar/detay/eski",
        campaignEnd: "2025-01-01",
      }),
    ).toBe(false);
  });

  it("slug başlığını güzelleştirir", () => {
    expect(prettifyCampaignTitle("tamamla kazan")).toBe("Tamamla Kazan");
  });

  it("mesajdan kampanya temasını çıkarır (finansman değil)", () => {
    expect(parseCampaignThemeFromMessage("eğitim kampanyaları")).toBe(
      "education",
    );
    expect(parseCampaignThemeFromMessage("kart kampanyası var mı")).toBe("card");
    expect(parseCampaignThemeFromMessage("200 bin eğitim finansmanı")).toBeNull();
    expect(parseCampaignThemeFromMessage("kırtasiye için var mı")).toBe(
      "education",
    );
    expect(
      parseCampaignThemeFromMessage("ev alcam kendime ne kampanyalar var"),
    ).toBe("housing");
    expect(
      parseCampaignThemeFromMessage("bilgisayarla alakalı kampanya var mı"),
    ).toBe("shopping");
    expect(parseCampaignThemeFromMessage("kampanya var mı bilgisayar alcam")).toBe(
      "shopping",
    );
  });

  it("başlıktan eğitim temasını çıkarır", () => {
    expect(
      inferCampaignTheme({
        title: "Biz Kart ile Okula Dönüş Kampanyası",
        category: "card_campaign",
      }),
    ).toBe("education");
  });

  it("aynı URL / case-farklı başlıkları tekilleştirir", () => {
    const out = dedupeCampaignRecords([
      {
        title: "Kampanyalar",
        sourceUrl: "https://www.vakifkatilim.com.tr/tr/kendim-icin/kampanyalar",
      },
      {
        title: "tamamla kazan",
        sourceUrl:
          "https://www.vakifkatilim.com.tr/tr/kendim-icin/kampanyalar/detay/tamamla-kazan",
      },
      {
        title: "Tamamla Kazan",
        sourceUrl:
          "https://www.vakifkatilim.com.tr/tr/kendim-icin/kampanyalar/detay/tamamla-kazan",
      },
      {
        title: "Vclub Dunyasi",
        sourceUrl:
          "https://www.vakifkatilim.com.tr/tr/kendim-icin/kampanyalar/detay/vclub",
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.title)).toContain("Tamamla Kazan");
  });

  it("aynı URL'de zengin detay kaydını boş stub'a tercih eder", () => {
    const sourceUrl =
      "https://www.albaraka.com.tr/tr/kampanyalar/detay/vade-farksiz-kampanyasi";
    const out = dedupeCampaignRecords([
      {
        title: "Vade Farksiz Kampanyasi",
        sourceUrl,
        evidence: [{ field: "title", text: sourceUrl }],
        manualReviewRequired: true,
      },
      {
        title: "Vade Farksiz Kampanyasi",
        sourceUrl,
        maxAmountTl: 140000,
        maxTermMonths: 6,
        campaignEnd: "2026-12-31",
        conditions: ["140.000 TL'ye kadar vade farksız destek."],
        evidence: [{ field: "summary", text: "140.000 TL'ye kadar vade farksız destek." }],
        manualReviewRequired: false,
      },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].maxAmountTl).toBe(140000);
    expect(out[0].manualReviewRequired).toBe(false);
  });
});
