import pg from "pg";
import { BANK_SOURCE_CONFIGS } from "../scraper/bankSourceConfig";
import type { ExtractedFinancialRecord } from "../scraper/scraperTypes";
import { VERIFIED_RESEARCH_RECORDS } from "../verifiedResearch/records";
import {
  dedupeCampaignRecords,
  inferCampaignTheme,
  isCampaignListingUrl,
  isDisplayableCampaign,
  isJunkCampaignTitle,
  normalizeCampaignUrl,
  prettifyCampaignTitle,
} from "../scraper/campaignNormalize";
import crypto from "crypto";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let postgresWritePausedUntil = 0;
let verifiedResearchSeeded = false;

function isTransientPostgresError(message: string): boolean {
  return /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout|getaddrinfo|Connection terminated/i.test(
    message,
  );
}

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
        "DATABASE_URL tanımlı değil. PostgreSQL kapalı; yalnızca canlı scrape belleği kullanılacak.",
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
        campaign_type TEXT,
        fee_status TEXT,
        target_segments TEXT[] NOT NULL DEFAULT '{}',
        reward_points NUMERIC,
        reward_point_unit TEXT,
        discount_rate NUMERIC,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
        campaign_type TEXT,
        fee_status TEXT,
        target_segments TEXT[] NOT NULL DEFAULT '{}',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_campaigns_bank_status
        ON campaigns(bank_id, campaign_status, is_active);
      CREATE INDEX IF NOT EXISTS idx_products_bank_active
        ON products(bank_id, is_active);
    `);

    // Tablolar daha eski bir sürümde oluşturulmuşsa CREATE TABLE IF NOT
    // EXISTS yeni kolonları eklemez. Şema sürüklenmesi bu yüzden sessizce
    // oluşuyordu (updated_at eksikliği temizlik sorgusunu bozmuştu).
    // migrations/002 ile aynı kolonlar burada da garanti altına alınır.
    await p.query(`
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_type TEXT;
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS fee_status TEXT;
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_segments TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reward_points NUMERIC;
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reward_point_unit TEXT;
      ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS discount_rate NUMERIC;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE products ADD COLUMN IF NOT EXISTS campaign_type TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS fee_status TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS target_segments TEXT[] NOT NULL DEFAULT '{}';
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
  let p = Date.now() < postgresWritePausedUntil ? null : getPool();
  let count = 0;
  for (const raw of records) {
    if (raw.category === "irrelevant" || raw.category === "general_announcement") {
      continue;
    }
    let r: ExtractedFinancialRecord = raw;
    const isCampaign =
      r.recordType !== "product" &&
      (r.recordType === "campaign" ||
        /kampanya/i.test(r.sourceUrl) ||
        [
          "financing_campaign",
          "card_campaign",
          "discount_campaign",
          "new_customer_financing",
          "investment_product",
        ].includes(r.category));
    const recordType = isCampaign ? "campaign" : r.recordType;

    if (recordType === "campaign") {
      if (isCampaignListingUrl(r.sourceUrl)) continue;
      if (!isDisplayableCampaign(r)) continue;
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
            `INSERT INTO campaigns (id, bank_id, title, category, campaign_status, campaign_start, campaign_end, is_active, source_url, source_checked_at, content_hash, campaign_type, fee_status, target_segments, reward_points, reward_point_unit, discount_rate, payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
             ON CONFLICT (id) DO UPDATE SET
               campaign_status = EXCLUDED.campaign_status,
               title = EXCLUDED.title,
               category = EXCLUDED.category,
               campaign_start = EXCLUDED.campaign_start,
               campaign_end = EXCLUDED.campaign_end,
               campaign_type = EXCLUDED.campaign_type,
               fee_status = EXCLUDED.fee_status,
               target_segments = EXCLUDED.target_segments,
               reward_points = EXCLUDED.reward_points,
               reward_point_unit = EXCLUDED.reward_point_unit,
               discount_rate = EXCLUDED.discount_rate,
               payload = EXCLUDED.payload,
               source_checked_at = EXCLUDED.source_checked_at,
               is_active = TRUE,
               updated_at = NOW(),
               version = campaigns.version + 1`,
            [
              id,
              r.bankId,
              r.title || r.productName,
              r.category,
              r.campaignStatus,
              isoTarih(r.campaignStart),
              isoTarih(r.campaignEnd),
              r.sourceUrl,
              r.sourceCheckedAt,
              null,
              r.campaignType ?? null,
              r.feeStatus ?? null,
              r.targetSegments ?? [],
              r.rewardPoints ?? null,
              r.rewardPointUnit ?? null,
              r.discountRate ?? null,
              JSON.stringify({ ...r, recordType }),
            ],
          );
        } else {
          await p.query(
            `INSERT INTO products (id, bank_id, product_name, product_type, category, is_active, source_url, source_checked_at, campaign_type, fee_status, target_segments, payload)
             VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET
               product_name = EXCLUDED.product_name,
               product_type = EXCLUDED.product_type,
               category = EXCLUDED.category,
               campaign_type = EXCLUDED.campaign_type,
               fee_status = EXCLUDED.fee_status,
               target_segments = EXCLUDED.target_segments,
               payload = EXCLUDED.payload,
               source_checked_at = EXCLUDED.source_checked_at,
               updated_at = NOW(),
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
              r.campaignType ?? null,
              r.feeStatus ?? null,
              r.targetSegments ?? [],
              JSON.stringify(r),
            ],
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          "[postgres] upsert failed",
          r.bankId,
          recordType,
          message,
        );
        if (isTransientPostgresError(message)) {
          postgresWritePausedUntil = Date.now() + 5 * 60 * 1000;
          p = null;
        }
      }
    }
    count += 1;
  }
  return count;
}

/**
 * DATE sütununa yalnızca geçerli ISO tarih yazılır.
 *
 * Çıkarım katmanı bu alanlara "Belirtilmemiş" gibi metinler de koyabiliyor;
 * bunlar doğrudan gönderilirse Postgres tüm upsert'ü reddeder ve o bankanın
 * bütün kayıtları kaybolur. Geçersiz değer sütunda null kalır, ham hâli
 * payload içinde saklanmaya devam eder.
 */
function isoTarih(deger: unknown): string | null {
  if (typeof deger !== "string") return null;
  const m = deger.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

export async function seedVerifiedResearchRecords(): Promise<{
  inserted: number;
  alreadySeeded: boolean;
}> {
  if (verifiedResearchSeeded) {
    return { inserted: 0, alreadySeeded: true };
  }
  const inserted = await upsertExtractedRecords(VERIFIED_RESEARCH_RECORDS);
  verifiedResearchSeeded = true;
  return { inserted, alreadySeeded: false };
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
  return dedupeCampaignRecords(rows.filter(isDisplayableCampaign));
}

/** Bellekteki gösterilemeyen kampanyaları siler (local/canlı eşitleme). */
export function pruneNonDisplayableCampaigns(): {
  before: number;
  after: number;
  removed: number;
} {
  const before = memoryCampaigns.size;
  for (const [id, row] of [...memoryCampaigns.entries()]) {
    if (!isDisplayableCampaign(row)) memoryCampaigns.delete(id);
  }
  const after = memoryCampaigns.size;
  return { before, after, removed: before - after };
}

/** Kampanya belleğini verilen satırlarla değiştirir (Postgres yokken canlı snapshot). */
export function replaceMemoryCampaigns(
  rows: Array<Record<string, unknown>>,
): { loaded: number; skipped: number } {
  memoryCampaigns.clear();
  let loaded = 0;
  let skipped = 0;
  for (const raw of rows) {
    const candidate = {
      ...raw,
      recordType: "campaign" as const,
      campaignStatus: raw.campaignStatus || "active",
    };
    if (!isDisplayableCampaign(candidate)) {
      skipped += 1;
      continue;
    }
    const id = String(
      raw.id ||
        crypto
          .createHash("sha1")
          .update(
            `${raw.bankId}|${normalizeCampaignUrl(String(raw.sourceUrl || ""))}|campaign`,
          )
          .digest("hex")
          .slice(0, 24),
    );
    memoryCampaigns.set(id, { ...candidate, id });
    loaded += 1;
  }
  return { loaded, skipped };
}

const CAMPAIGN_CACHE_PATH = pathJoinSafe(
  process.cwd(),
  "data",
  "campaign-memory-cache.json",
);

function pathJoinSafe(...parts: string[]): string {
  return parts.join("/").replace(/\\/g, "/");
}

export async function persistCampaignMemoryCache(
  rows?: Array<Record<string, unknown>>,
): Promise<{ path: string; count: number }> {
  const fs = await import("fs/promises");
  const list = rows ?? listMemoryCampaigns();
  await fs.mkdir(pathJoinSafe(process.cwd(), "data"), { recursive: true });
  await fs.writeFile(
    CAMPAIGN_CACHE_PATH,
    JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        campaigns: list,
      },
      null,
      2,
    ),
    "utf8",
  );
  return { path: CAMPAIGN_CACHE_PATH, count: list.length };
}

export async function loadCampaignMemoryCache(): Promise<{
  loaded: number;
  skipped: number;
  path: string;
}> {
  const fs = await import("fs/promises");
  try {
    const raw = await fs.readFile(CAMPAIGN_CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      campaigns?: Array<Record<string, unknown>>;
    };
    const rows = parsed.campaigns || [];
    const result = replaceMemoryCampaigns(rows);
    return { ...result, path: CAMPAIGN_CACHE_PATH };
  } catch {
    return { loaded: 0, skipped: 0, path: CAMPAIGN_CACHE_PATH };
  }
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
    // Önce bellek temizle — aksi halde eski local scrape çöpü kalır, canlıyla uyuşmaz
    memoryCampaigns.clear();
    memoryProducts.clear();

    // Çöpü DB’de pasifleştir, sonra aktifleri yükle
    try {
      await p.query(
        `UPDATE campaigns
         SET is_active = FALSE, updated_at = NOW()
         WHERE is_active = TRUE
           AND (
             source_url !~* 'kampanya'
             OR source_url ~* '(gizlilik|bize-ulasin|yatirimci|musteri-memnuniyet|katilim-bankaciligi|hakkimizda|kvkk|cerez|finansmanlar/|finansman-urunleri/|index\\.html|urunlerimiz|bilgi-toplumu|sozlesme|kisisel-veri|mobil-sube|iletisim|hesaplama-arac|icazet|default\\.aspx|urun-hizmet-ucret|\\.pdf)'
             OR source_url ~* '(biten-kampanyalar|kampanya-arsivi|finansman-kampanyalari\\.aspx|ticari-kampanyalar\\.aspx|/kampanyalar/?$)'
             OR (campaign_end IS NOT NULL AND campaign_end::date < CURRENT_DATE)
           )`,
      );
    } catch (err) {
      console.warn(
        "[postgres] junk campaign deactivate skipped:",
        err instanceof Error ? err.message : err,
      );
    }

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
      const candidate = {
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
        recordType: "campaign" as const,
        campaignTheme:
          payload.campaignTheme ||
          inferCampaignTheme({
            title: String(row.title || payload.title || ""),
            productName: String(payload.productName || ""),
            sourceUrl: row.source_url,
            category: row.category,
          }),
      };
      // Canlıdaki eski kurumsal/ürün URL’lerini belleğe alma
      if (!isDisplayableCampaign(candidate)) continue;
      memoryCampaigns.set(row.id, candidate);
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
      campaigns: memoryCampaigns.size,
      products: memoryProducts.size,
      message: `Bellek sıfırlandı ve Postgres’ten yüklendi: ${memoryCampaigns.size} kampanya, ${memoryProducts.size} ürün (DB aktif: ${camps.rows.length}).`,
    };
  } catch (err) {
    return {
      campaigns: memoryCampaigns.size,
      products: memoryProducts.size,
      message: err instanceof Error ? err.message : "hydrate failed",
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
