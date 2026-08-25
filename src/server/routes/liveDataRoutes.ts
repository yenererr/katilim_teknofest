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
import { listMemoryCampaigns, listMemoryProducts, isPostgresConfigured, ensureSchema } from "../services/postgres/store";
import { getCollectionHealth, isQdrantConfigured } from "../services/qdrant";
import { BANK_SOURCE_CONFIGS } from "../services/scraper/bankSourceConfig";

export function createLiveDataRouter(): Router {
  const router = Router();
  router.use(qdrantRateLimiter);

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
    const allowDemo = process.env.ALLOW_DEMO_DATA === "true";
    const banks = getOfficialScrapeStates();
    const memory = listMemoryProducts({ primaryOnly: true });
    res.json({
      enabled: process.env.SCRAPER_ENABLED !== "false",
      allowDemo,
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
      warning: allowDemo
        ? "ÖRNEK VERİ modu açık olabilir; canlı yanıtlarla karıştırmayın."
        : undefined,
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
      note: "Kart kampanyaları finansman karşılaştırmasına dahil edilmez.",
    });
  });

  router.post("/refresh", requireAdmin, async (req, res) => {
    const body = z
      .object({
        force: z.boolean().optional(),
        bankIds: z.array(z.string()).max(10).optional(),
      })
      .safeParse(req.body || {});
    if (!body.success) {
      return res.status(400).json({ error: "Geçersiz istek." });
    }
    const job = await runOfficialScrapeJob({
      force: body.data.force,
      bankIds: body.data.bankIds,
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
    const qdrant = isQdrantConfigured()
      ? await getCollectionHealth()
      : { ok: false, message: "Qdrant yapılandırılmamış" };
    res.json({
      status: "ok",
      postgres: {
        configured: isPostgresConfigured(),
        ...pg,
      },
      qdrant,
      scraper: {
        enabled: process.env.SCRAPER_ENABLED !== "false",
        banks: BANK_SOURCE_CONFIGS.length,
      },
      allowDemoData: process.env.ALLOW_DEMO_DATA === "true",
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
