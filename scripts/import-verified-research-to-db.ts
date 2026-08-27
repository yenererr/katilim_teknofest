import "dotenv/config";
import {
  countCampaignsInDb,
  ensureSchema,
  isPostgresConfigured,
  seedVerifiedResearchRecords,
} from "../src/server/services/postgres/store";
import { VERIFIED_RESEARCH_RECORDS } from "../src/server/services/verifiedResearch/records";

async function main() {
  if (!isPostgresConfigured()) {
    console.error("DATABASE_URL gerekli.");
    process.exit(1);
  }

  const schema = await ensureSchema();
  console.log(schema.message);
  if (!schema.ok) process.exit(1);

  const result = await seedVerifiedResearchRecords();
  const counts = await countCampaignsInDb();
  console.log(`Doğrulanmış araştırma kaydı: ${VERIFIED_RESEARCH_RECORDS.length}`);
  console.log(`Upsert: ${result.inserted}`);
  console.log("DB kampanya sayıları:", counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

