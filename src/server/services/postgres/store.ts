import pg from "pg";
import { BANK_SOURCE_CONFIGS } from "../scraper/bankSourceConfig";
import type { ExtractedFinancialRecord } from "../scraper/scraperTypes";
import crypto from "crypto";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function isPostgresConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.DATABASE_URL?.trim());
}

export function getPool(): pg.Pool | null {
  if (!isPostgresConfigured()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function ensureSchema(): Promise<{ ok: boolean; message: string }> {
  const p = getPool();
  if (!p) {
    return {
      ok: false,
      message:
        "DATABASE_URL tanımlı değil. PostgreSQL kapalı; bellek/JSON önbellek kullanılacak.",
    };
  }
  try {
    // Minimal bootstrap — tam şema migrations/001_katilim_finans.sql ile uygulanmalı
    await p.query(`
      CREATE TABLE IF NOT EXISTS banks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    for (const b of BANK_SOURCE_CONFIGS) {
      await p.query(
        `INSERT INTO banks (id, name, enabled) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, enabled = EXCLUDED.enabled`,
        [b.bankId, b.bankName, b.enabled],
      );
    }
    return { ok: true, message: "PostgreSQL bağlantısı ve banks tablosu hazır." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "PostgreSQL hata",
    };
  }
}

/** Bellek içi yedek depo — DATABASE_URL yokken */
const memoryProducts = new Map<string, any>();
const memoryCampaigns = new Map<string, any>();
const memorySnapshots = new Map<string, { hash: string; text: string; at: string }>();

export function getMemorySnapshot(sourceKey: string) {
  return memorySnapshots.get(sourceKey) || null;
}

export function setMemorySnapshot(
  sourceKey: string,
  hash: string,
  text: string,
) {
  memorySnapshots.set(sourceKey, {
    hash,
    text,
    at: new Date().toISOString(),
  });
}

export async function upsertExtractedRecords(
  records: ExtractedFinancialRecord[],
): Promise<number> {
  const p = getPool();
  let count = 0;
  for (const r of records) {
    if (r.category === "irrelevant" || r.category === "general_announcement") {
      continue;
    }
    const id = crypto
      .createHash("sha1")
      .update(`${r.bankId}|${r.sourceUrl}|${r.productName || r.title || ""}|${r.recordType}`)
      .digest("hex")
      .slice(0, 24);

    const row = {
      id,
      ...r,
      isDemo: false,
      version: 1,
    };

    if (r.recordType === "campaign") {
      memoryCampaigns.set(id, row);
    } else {
      memoryProducts.set(id, row);
    }

    if (p) {
      try {
        if (r.recordType === "campaign") {
          await p.query(
            `INSERT INTO campaigns (id, bank_id, title, category, campaign_status, campaign_start, campaign_end, is_active, source_url, source_checked_at, content_hash, payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET
               campaign_status = EXCLUDED.campaign_status,
               payload = EXCLUDED.payload,
               source_checked_at = EXCLUDED.source_checked_at,
               version = campaigns.version + 1`,
            [
              id,
              r.bankId,
              r.title || r.productName,
              r.category,
              r.campaignStatus,
              r.campaignStart,
              r.campaignEnd,
              r.sourceUrl,
              r.sourceCheckedAt,
              null,
              JSON.stringify(r),
            ],
          );
        } else {
          await p.query(
            `INSERT INTO products (id, bank_id, product_name, product_type, category, is_active, source_url, source_checked_at, payload)
             VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8)
             ON CONFLICT (id) DO UPDATE SET
               payload = EXCLUDED.payload,
               source_checked_at = EXCLUDED.source_checked_at,
               version = products.version + 1,
               is_active = TRUE`,
            [
              id,
              r.bankId,
              r.productName,
              r.productType,
              r.category,
              r.sourceUrl,
              r.sourceCheckedAt,
              JSON.stringify(r),
            ],
          );
        }
      } catch {
        // Tablo yoksa bellek kaydı yeterli
      }
    }
    count += 1;
  }
  return count;
}

export function listMemoryProducts(filter?: {
  bankId?: string;
  primaryOnly?: boolean;
}) {
  let rows = [...memoryProducts.values()];
  if (filter?.bankId) rows = rows.filter((r) => r.bankId === filter.bankId);
  if (filter?.primaryOnly) {
    rows = rows.filter((r) =>
      [
        "housing_finance",
        "vehicle_finance",
        "consumer_finance",
        "shopping_finance",
        "commercial_finance",
        "financing_campaign",
        "financing_fee",
        "new_customer_financing",
        "profit_share_rate",
        "participation_account",
      ].includes(r.category),
    );
  }
  return rows;
}

export function listMemoryCampaigns(filter?: { bankId?: string; activeOnly?: boolean }) {
  let rows = [...memoryCampaigns.values()];
  if (filter?.bankId) rows = rows.filter((r) => r.bankId === filter.bankId);
  if (filter?.activeOnly) {
    rows = rows.filter((r) => r.campaignStatus === "active");
  }
  return rows;
}
