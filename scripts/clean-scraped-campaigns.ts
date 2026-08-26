import fs from "fs";
import {
  dedupeCampaignRecords,
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
      return {
        ...c,
        title,
        productName: prettifyCampaignTitle(
          String(c.productName || c.title || ""),
        ),
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
const v = cleaned.filter((c) => c.bankId === "vakif-katilim");
console.log("vakif", v.length);
for (const c of v) console.log("-", c.title, c.sourceUrl);
