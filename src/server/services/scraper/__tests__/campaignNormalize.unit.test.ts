import { describe, expect, it } from "vitest";
import {
  dedupeCampaignRecords,
  isCampaignListingUrl,
  isJunkCampaignTitle,
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
    expect(isJunkCampaignTitle("Tamamla Kazan")).toBe(false);
  });

  it("slug başlığını güzelleştirir", () => {
    expect(prettifyCampaignTitle("tamamla kazan")).toBe("Tamamla Kazan");
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
});
