/**
 * Tüm katılım bankalarının kampanya sayfalarını tarar ve PostgreSQL'e yazar.
 *
 * Kullanım:
 *   npx tsx scripts/scrape-campaigns.ts
 *   npx tsx scripts/scrape-campaigns.ts --bank=ziraat-katilim,vakif-katilim
 *
 * Gereken: .env içinde EVREN_* (çıkarım) ve tercihen DATABASE_URL.
 * DATABASE_URL yoksa kayıtlar yalnızca süreç belleğinde raporlanır.
 */
import "dotenv/config";
import { runOfficialScrapeJob } from "../src/server/services/scraper/orchestrator";
import {
  countCampaignsInDb,
  ensureSchema,
  isPostgresConfigured,
  listMemoryCampaigns,
} from "../src/server/services/postgres/store";

function parseBanks(): string[] | undefined {
  const arg = process.argv.find((a) => a.startsWith("--bank="));
  if (!arg) return undefined;
  return arg
    .slice("--bank=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  // Kampanya taramasında 2 sn gecikme tüm detaylar için çok yavaş
  if (!process.env.SCRAPER_REQUEST_DELAY_MS) {
    process.env.SCRAPER_REQUEST_DELAY_MS = "500";
  }
  process.env.SCRAPER_USE_EVREN = "false";
  process.env.SCRAPER_RULES_ONLY = "1";
  process.env.SCRAPER_SKIP_INDEX = "1";

  console.log("PostgreSQL:", isPostgresConfigured() ? "açık" : "yok (yalnızca bellek)");
  const schema = await ensureSchema();
  console.log("Şema:", schema.message);

  const bankIds = parseBanks();
  console.log(
    "Kampanya scrape başlıyor…",
    bankIds?.length ? `bankalar=${bankIds.join(",")}` : "10 banka",
  );

  const job = await runOfficialScrapeJob({
    force: true,
    wait: true,
    campaignOnly: true,
    maxDetails: process.argv.includes("--deep") ? 30 : 12,
    bankIds,
  });

  const memory = listMemoryCampaigns();
  const byBank = memory.reduce<Record<string, number>>((acc, c) => {
    acc[c.bankId] = (acc[c.bankId] || 0) + 1;
    return acc;
  }, {});

  const dbCounts = await countCampaignsInDb();
  console.log("\n--- Özet ---");
  console.log("Job:", job.status, job.stats);
  console.log("Bellek kampanya:", memory.length, byBank);
  console.log("DB kampanya (banka):", dbCounts);
  if (!isPostgresConfigured()) {
    console.log(
      "\nUyarı: DATABASE_URL yok. Dokploy DB’ye yazmak için .env’e erişilebilir DATABASE_URL ekleyip scripti yeniden çalıştırın.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
