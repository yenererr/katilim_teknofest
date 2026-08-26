import fs from "fs";
import {
  dedupeCampaignRecords,
  inferCampaignTheme,
  isCampaignListingUrl,
  isJunkCampaignTitle,
  prettifyCampaignTitle,
} from "../src/server/services/scraper/campaignNormalize";

const path = "data/scraped-campaigns.json";
const j = JSON.parse(fs.readFileSync(path, "utf8")) as {
  campaigns: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
};
const before = j.campaigns.length;
const cleaned = dedupeCampaignRecords(
  j.campaigns
    .filter((c) => !isCampaignListingUrl(String(c.sourceUrl || "")))
    .filter((c) => !isJunkCampaignTitle(String(c.title || c.productName || "")))
    .map((c) => {
      const title = prettifyCampaignTitle(
        String(c.title || c.productName || ""),
      );
      const productName = prettifyCampaignTitle(
        String(c.productName || c.title || ""),
      );
      return {
        ...c,
        title,
        productName,
        campaignTheme: inferCampaignTheme({
          title,
          productName,
          sourceUrl: String(c.sourceUrl || ""),
          category: String(c.category || ""),
        }),
      } as Record<string, unknown>;
    }),
) as Array<Record<string, unknown>>;
j.campaigns = cleaned;
j.meta = {
  ...(j.meta || {}),
  cleanedAt: new Date().toISOString(),
  before,
  after: cleaned.length,
};
fs.writeFileSync(path, JSON.stringify(j, null, 2));
console.log("before", before, "after", cleaned.length);
const themes: Record<string, number> = {};
for (const c of cleaned) {
  const t = String(c.campaignTheme || "general");
  themes[t] = (themes[t] || 0) + 1;
}
console.log("themes", themes);
const edu = cleaned.filter((c) => c.campaignTheme === "education");
console.log("education", edu.length);
for (const c of edu) console.log("-", c.bankId, c.title);
