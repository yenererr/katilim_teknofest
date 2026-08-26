/**
 * data/scraped-campaigns.json → PostgreSQL campaigns tablosu.
 *
 *   DATABASE_URL=... npx tsx scripts/import-campaigns-to-db.ts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  countCampaignsInDb,
  ensureSchema,
  isPostgresConfigured,
  upsertExtractedRecords,
} from "../src/server/services/postgres/store";
import type { ExtractedFinancialRecord } from "../src/server/services/scraper/scraperTypes";

async function main() {
  if (!isPostgresConfigured()) {
    console.error("DATABASE_URL gerekli.");
    process.exit(1);
  }
  const schema = await ensureSchema();
  console.log(schema.message);
  if (!schema.ok) process.exit(1);

  const file = path.join(process.cwd(), "data", "scraped-campaigns.json");
  if (!fs.existsSync(file)) {
    console.error("Önce: npm run scrape:campaigns");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    campaigns: ExtractedFinancialRecord[];
  };
  const rows = (raw.campaigns || []).filter(Boolean);
  console.log(`İçe aktarılacak: ${rows.length} kampanya`);
  const n = await upsertExtractedRecords(rows);
  const counts = await countCampaignsInDb();
  console.log(`Upsert: ${n}`);
  console.log("DB sayıları:", counts);
  console.log(
    "Toplam:",
    counts.reduce((s, c) => s + c.n, 0),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
