import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/adminAuth";
import { qdrantRateLimiter } from "../middleware/rateLimit";
import {
  getOfficialScrapeStates,
  getScrapeJob,
  listRecentJobs,
  runOfficialScrapeJob,
} from "../services/scraper/orchestrator";
import { listMemoryCampaigns, listMemoryProducts, isPostgresConfigured, ensureSchema, hydrateMemoryFromPostgres, pruneNonDisplayableCampaigns, replaceMemoryCampaigns } from "../services/postgres/store";
import { getCollectionHealth, isQdrantConfigured } from "../services/qdrant";
import { BANK_SOURCE_CONFIGS } from "../services/scraper/bankSourceConfig";
import { getVerifiedFeeMatrix } from "../../data/verifiedFees";
import {
  convertWithTcmb,
  getTcmbFxRates,
  type FxCode,
  type FxCurrency,
} from "../services/tcmb/tcmbRates";

const FX_CODES = ["USD", "EUR", "GBP"] as const;

function parseFxCurrency(raw: unknown): FxCurrency | null {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (s === "TRY" || s === "TL") return "TRY";
  if ((FX_CODES as readonly string[]).includes(s)) return s as FxCode;
  return null;
}

export function createLiveDataRouter(): Router {
  const router = Router();
  router.use(qdrantRateLimiter);

  /** Doğrulanmış FAST / EFT / aidat matrisi — tahmin yok. */
  router.get("/fees", (_req, res) => {
    res.json(getVerifiedFeeMatrix());
  });

  /** TCMB günlük döviz kurları (USD / EUR / GBP). */
  router.get("/fx", async (_req, res) => {
    try {
      const snapshot = await getTcmbFxRates();
      return res.json(snapshot);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "TCMB kurları alınamadı.";
      console.warn("[live/fx]", message);
      return res.status(502).json({ error: message });
    }
  });

  /** TCMB kurlarıyla çeviri: ?amount=100000&from=TRY&to=USD */
  router.get("/fx/convert", async (req, res) => {
    const amount = Number(String(req.query.amount ?? "").replace(",", "."));
    const from = parseFxCurrency(req.query.from);
    const to = parseFxCurrency(req.query.to);
    if (!(amount > 0) || !from || !to) {
      return res.status(400).json({
        error: "amount, from ve to gerekli. Örnek: amount=100000&from=TRY&to=USD",
      });
    }
    try {
      const snapshot = await getTcmbFxRates();
      return res.json(convertWithTcmb(snapshot, amount, from, to));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Çeviri yapılamadı.";
      console.warn("[live/fx/convert]", message);
      return res.status(502).json({ error: message });
    }
  });

  router.get("/sources", (_req, res) => {
    res.json({
      enabled: process.env.SCRAPER_ENABLED !== "false",
      interval_minutes: Number(process.env.SCRAPER_INTERVAL_MINUTES || 30),
      banks: BANK_SOURCE_CONFIGS.map((b) => ({
        bankId: b.bankId,
        bankName: b.bankName,
        enabled: b.enabled,
        allowedDomains: b.allowedDomains,
        seedCount: b.seedUrls.length,
      })),
      runtime: getOfficialScrapeStates(),
    });
  });

  router.get("/products", (_req, res) => {
    const banks = getOfficialScrapeStates();
    const memory = listMemoryProducts({ primaryOnly: true });
    res.json({
      enabled: process.env.SCRAPER_ENABLED !== "false",
      updated_at: new Date().toISOString(),
      banks,
      products: banks.flatMap((bank) =>
        (bank.products || []).map((product, index) => ({
          id: `${bank.id}::${index}`,
          bankId: bank.id,
          bankName: bank.bankName,
          sourceUrls: bank.urls,
          lastExtractedAt: bank.lastExtractedAt,
          product,
          isDemo: false,
        })),
      ),
      structuredMemoryCount: memory.length,
      structuredProducts: memory,
    });
  });

  router.get("/campaigns", (_req, res) => {
    const campaigns = listMemoryCampaigns({ activeOnly: true });
    const cardLike = listMemoryCampaigns().filter((c) =>
      ["card_campaign", "discount_campaign"].includes(c.category),
    );
    res.json({
      financingCampaigns: campaigns.filter(
        (c) => !["card_campaign", "discount_campaign"].includes(c.category),
      ),
      cardAndDiscountCampaigns: cardLike,
      note: "Kart kampanyaları finansman karşılaştırmasına dahil edilmez. Kurumsal sayfalar elenir.",
    });
  });

  /** Belleği Postgres’ten yeniden yükle veya çöpü budar (local↔canlı eşitleme). */
  router.post("/campaigns/resync", requireAdmin, async (req, res) => {
    const body = z
      .object({
        fromUrl: z.string().url().optional(),
        pruneOnly: z.boolean().optional(),
      })
      .safeParse(req.body || {});
    if (!body.success) {
      return res.status(400).json({ error: "Geçersiz istek." });
    }

    if (body.data.pruneOnly) {
      const pruned = pruneNonDisplayableCampaigns();
      return res.json({
        mode: "prune",
        ...pruned,
        listed: listMemoryCampaigns({ activeOnly: true }).length,
      });
    }

    const remote =
      body.data.fromUrl ||
      process.env.LIVE_SYNC_URL ||
      process.env.APP_URL ||
      "";
    if (remote) {
      try {
        const base = remote.replace(/\/+$/, "");
        const r = await fetch(`${base}/api/live/campaigns`);
        if (!r.ok) {
          return res.status(502).json({
            error: `Uzak kampanya alınamadı: HTTP ${r.status}`,
            remote: base,
          });
        }
        const data = (await r.json()) as {
          financingCampaigns?: Array<Record<string, unknown>>;
          cardAndDiscountCampaigns?: Array<Record<string, unknown>>;
        };
        const rows = [
          ...(data.financingCampaigns || []),
          ...(data.cardAndDiscountCampaigns || []),
        ];
        const replaced = replaceMemoryCampaigns(rows);
        return res.json({
          mode: "remote",
          remote: base,
          ...replaced,
          listed: listMemoryCampaigns({ activeOnly: true }).length,
        });
      } catch (err) {
        // uzak yoksa Postgres hydrate dene
        console.warn(
          "[campaigns/resync] remote failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    const schema = await ensureSchema();
    if (!schema.ok) {
      const pruned = pruneNonDisplayableCampaigns();
      return res.status(503).json({
        error: "Postgres yok ve uzak sync başarısız; yalnızca prune yapıldı.",
        postgres: schema,
        prune: pruned,
        listed: listMemoryCampaigns({ activeOnly: true }).length,
      });
    }
    const hydrated = await hydrateMemoryFromPostgres();
    return res.json({
      mode: "postgres",
      ...hydrated,
      listed: listMemoryCampaigns({ activeOnly: true }).length,
    });
  });

  router.post("/refresh", requireAdmin, async (req, res) => {
    const body = z
      .object({
        force: z.boolean().optional(),
        bankIds: z.array(z.string()).max(10).optional(),
        campaignOnly: z.boolean().optional(),
        maxDetails: z.number().int().min(1).max(80).optional(),
      })
      .safeParse(req.body || {});
    if (!body.success) {
      return res.status(400).json({ error: "Geçersiz istek." });
    }
    const job = await runOfficialScrapeJob({
      force: body.data.force,
      bankIds: body.data.bankIds,
      campaignOnly: body.data.campaignOnly,
      maxDetails: body.data.maxDetails,
    });
    return res.status(202).json({ jobId: job.jobId, status: job.status });
  });

  router.get("/jobs/:jobId", (req, res) => {
    const job = getScrapeJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job bulunamadı." });
    return res.json(job);
  });

  router.get("/jobs", (_req, res) => {
    res.json({ jobs: listRecentJobs() });
  });

  router.get("/changes", (_req, res) => {
    const banks = getOfficialScrapeStates().filter(
      (b) => b.status === "guncellendi" || b.status === "hata",
    );
    res.json({
      updated_at: new Date().toISOString(),
      changes: banks.map((b) => ({
        bankId: b.id,
        bankName: b.bankName,
        status: b.status,
        lastChangedAt: b.lastChangedAt,
        error: b.error,
        sourceStatus: b.sourceStatus,
      })),
    });
  });

  return router;
}

export function createSystemRouter(): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    const pg = await ensureSchema();
    const hydrated = pg.ok ? await hydrateMemoryFromPostgres() : null;
    const qdrant = isQdrantConfigured()
      ? await getCollectionHealth()
      : { ok: false, message: "Qdrant yapılandırılmamış" };
    res.json({
      status: "ok",
      postgres: {
        configured: isPostgresConfigured(),
        ...pg,
        memory: hydrated,
        campaignsInMemory: listMemoryCampaigns().length,
      },
      qdrant,
      scraper: {
        enabled: process.env.SCRAPER_ENABLED !== "false",
        banks: BANK_SOURCE_CONFIGS.length,
      },
      allowDemoData: false,
    });
  });

  router.get("/metrics", (_req, res) => {
    res.json({
      note: "Ölçüm altyapısı hazır; altın test seti ile doldurulacak — sayı uydurulmaz.",
      metrics: [
        "field_precision",
        "field_recall",
        "field_f1",
        "numeric_accuracy",
        "date_accuracy",
        "evidence_accuracy",
        "json_schema_validity",
        "qdrant_recall_at_5",
        "ungrounded_claim_rate",
        "stale_detection_accuracy",
        "avg_scrape_ms",
        "avg_chat_ms",
        "fallback_rate",
        "manual_review_rate",
      ],
      values: null,
    });
  });

  return router;
}
