import pg from "pg";
import { BANK_SOURCE_CONFIGS } from "../scraper/bankSourceConfig";
import type { ExtractedFinancialRecord } from "../scraper/scraperTypes";
import {
  dedupeCampaignRecords,
  inferCampaignTheme,
  isCampaignListingUrl,
  isJunkCampaignTitle,
  normalizeCampaignUrl,
  prettifyCampaignTitle,
} from "../scraper/campaignNormalize";
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
    await p.query(`
      CREATE TABLE IF NOT EXISTS banks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        bank_id TEXT NOT NULL REFERENCES banks(id),
        source_id TEXT,
        title TEXT,
        category TEXT NOT NULL,
        campaign_status TEXT NOT NULL DEFAULT 'unknown',
        campaign_start DATE,
        campaign_end DATE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        version INT NOT NULL DEFAULT 1,
        source_url TEXT NOT NULL,
        source_checked_at TIMESTAMPTZ,
        content_hash TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        bank_id TEXT NOT NULL REFERENCES banks(id),
        source_id TEXT,
        product_name TEXT,
        product_type TEXT,
        category TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        version INT NOT NULL DEFAULT 1,
        source_url TEXT NOT NULL,
        source_checked_at TIMESTAMPTZ,
        content_hash TEXT,
        extraction_method TEXT,
        model_alias TEXT,
        manual_review_required BOOLEAN DEFAULT FALSE,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_campaigns_bank_status
        ON campaigns(bank_id, campaign_status, is_active);
      CREATE INDEX IF NOT EXISTS idx_products_bank_active
        ON products(bank_id, is_active);
    `);
    for (const b of BANK_SOURCE_CONFIGS) {
      await p.query(
        `INSERT INTO banks (id, name, enabled) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, enabled = EXCLUDED.enabled`,
        [b.bankId, b.bankName, b.enabled],
      );
    }
    return { ok: true, message: "PostgreSQL bağlantısı ve şema hazır." };
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
  for (const raw of records) {
    if (raw.category === "irrelevant" || raw.category === "general_announcement") {
      continue;
    }
    let r: ExtractedFinancialRecord = raw;
    const isCampaign =
      r.recordType === "campaign" ||
      /kampanya/i.test(r.sourceUrl) ||
      [
        "financing_campaign",
        "card_campaign",
        "discount_campaign",
        "new_customer_financing",
      ].includes(r.category);
    const recordType = isCampaign ? "campaign" : r.recordType;

    if (recordType === "campaign") {
      if (isCampaignListingUrl(r.sourceUrl)) continue;
      const title = prettifyCampaignTitle(
        String(r.title || r.productName || ""),
      );
      if (isJunkCampaignTitle(title)) continue;
      const campaignTheme = inferCampaignTheme({
        title,
        productName: r.productName,
        sourceUrl: r.sourceUrl,
        category: r.category,
      });
      r = {
        ...r,
        title,
        productName: r.productName || title,
        campaignTheme,
      } as ExtractedFinancialRecord & { campaignTheme: string };
    }

    const id = crypto
      .createHash("sha1")
      .update(
        recordType === "campaign"
          ? `${r.bankId}|${normalizeCampaignUrl(r.sourceUrl)}|campaign`
          : `${r.bankId}|${r.sourceUrl}|${r.productName || r.title || ""}|${recordType}`,
      )
      .digest("hex")
      .slice(0, 24);

    const row = {
      id,
      ...r,
      recordType,
      isDemo: false,
      version: 1,
    };

    if (recordType === "campaign") {
      memoryCampaigns.set(id, row);
    } else {
      memoryProducts.set(id, row);
    }

    if (p) {
      try {
        if (recordType === "campaign") {
          await p.query(
            `INSERT INTO campaigns (id, bank_id, title, category, campaign_status, campaign_start, campaign_end, is_active, source_url, source_checked_at, content_hash, payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET
               campaign_status = EXCLUDED.campaign_status,
               title = EXCLUDED.title,
               category = EXCLUDED.category,
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
              JSON.stringify({ ...r, recordType }),
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
      } catch (err) {
        console.warn(
          "[postgres] upsert failed",
          r.bankId,
          recordType,
          err instanceof Error ? err.message : err,
        );
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
  return dedupeCampaignRecords(rows);
}

/** Postgres'teki kampanya/ürünleri bellek Map'ine yükler (rehber + matcher için). */
export async function hydrateMemoryFromPostgres(): Promise<{
  campaigns: number;
  products: number;
  message: string;
}> {
  const p = getPool();
  if (!p) {
    return {
      campaigns: memoryCampaigns.size,
      products: memoryProducts.size,
      message: "DATABASE_URL yok; bellek önbelleği değişmedi.",
    };
  }
  try {
    const camps = await p.query<{
      id: string;
      bank_id: string;
      title: string | null;
      category: string;
      campaign_status: string;
      campaign_start: string | null;
      campaign_end: string | null;
      source_url: string;
      source_checked_at: string | null;
      payload: Record<string, unknown> | string;
    }>(
      `SELECT id, bank_id, title, category, campaign_status, campaign_start,
              campaign_end, source_url, source_checked_at, payload
       FROM campaigns WHERE is_active = TRUE`,
    );
    for (const row of camps.rows) {
      const payload =
        typeof row.payload === "string"
          ? (JSON.parse(row.payload || "{}") as Record<string, unknown>)
          : row.payload || {};
      memoryCampaigns.set(row.id, {
        ...payload,
        id: row.id,
        bankId: row.bank_id,
        title: row.title || payload.title || payload.productName,
        productName: payload.productName || row.title,
        category: row.category,
        campaignStatus: row.campaign_status,
        campaignStart: row.campaign_start,
        campaignEnd: row.campaign_end,
        sourceUrl: row.source_url,
        sourceCheckedAt: row.source_checked_at,
        recordType: "campaign",
        campaignTheme:
          payload.campaignTheme ||
          inferCampaignTheme({
            title: String(row.title || payload.title || ""),
            productName: String(payload.productName || ""),
            sourceUrl: row.source_url,
            category: row.category,
          }),
      });
    }

    const prods = await p.query<{
      id: string;
      bank_id: string;
      product_name: string | null;
      product_type: string | null;
      category: string;
      source_url: string;
      source_checked_at: string | null;
      payload: Record<string, unknown> | string;
    }>(
      `SELECT id, bank_id, product_name, product_type, category,
              source_url, source_checked_at, payload
       FROM products WHERE is_active = TRUE`,
    );
    for (const row of prods.rows) {
      const payload =
        typeof row.payload === "string"
          ? (JSON.parse(row.payload || "{}") as Record<string, unknown>)
          : row.payload || {};
      memoryProducts.set(row.id, {
        ...payload,
        id: row.id,
        bankId: row.bank_id,
        productName: row.product_name || payload.productName,
        productType: row.product_type || payload.productType,
        category: row.category,
        sourceUrl: row.source_url,
        sourceCheckedAt: row.source_checked_at,
        recordType: "product",
      });
    }

    return {
      campaigns: camps.rows.length,
      products: prods.rows.length,
      message: `Belleğe yüklendi: ${camps.rows.length} kampanya, ${prods.rows.length} ürün.`,
    };
  } catch (err) {
    return {
      campaigns: memoryCampaigns.size,
      products: memoryProducts.size,
      message: err instanceof Error ? err.message : "hydrate failed",
    };
  }
}

/**
 * DB/bellek boşsa data/scraped-campaigns.json ile doldurur
 * (imajda veya çalışma dizininde dosya varsa).
 */
export async function seedCampaignsFromJsonIfEmpty(): Promise<{
  seeded: number;
  message: string;
}> {
  if (memoryCampaigns.size > 0) {
    return { seeded: 0, message: `Bellekte zaten ${memoryCampaigns.size} kampanya var.` };
  }
  const fs = await import("fs");
  const path = await import("path");
  const file = path.join(process.cwd(), "data", "scraped-campaigns.json");
  if (!fs.existsSync(file)) {
    return { seeded: 0, message: "scraped-campaigns.json yok." };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      campaigns?: ExtractedFinancialRecord[];
    };
    const rows = (raw.campaigns || []).filter(Boolean);
    if (!rows.length) {
      return { seeded: 0, message: "JSON boş." };
    }
    const n = await upsertExtractedRecords(rows);
    return { seeded: n, message: `JSON'dan ${n} kampanya yüklendi.` };
  } catch (err) {
    return {
      seeded: 0,
      message: err instanceof Error ? err.message : "JSON seed failed",
    };
  }
}

export async function countCampaignsInDb(): Promise<
  Array<{ bank_id: string; n: number }>
> {
  const p = getPool();
  if (!p) return [];
  try {
    const r = await p.query<{ bank_id: string; n: string }>(
      `SELECT bank_id, COUNT(*)::text AS n FROM campaigns GROUP BY bank_id ORDER BY bank_id`,
    );
    return r.rows.map((row) => ({ bank_id: row.bank_id, n: Number(row.n) }));
  } catch {
    return [];
  }
}
