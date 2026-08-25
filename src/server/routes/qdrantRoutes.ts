import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/adminAuth";
import {
  qdrantRateLimiter,
  qdrantSearchRateLimiter,
} from "../middleware/rateLimit";
import {
  getCollectionHealth,
  getDocumentIndexer,
  getVectorSearchService,
  isQdrantConfigured,
  sanitizeErrorMessage,
  type IndexDocumentInput,
} from "../services/qdrant";

const documentTypeSchema = z.enum([
  "product",
  "campaign",
  "fee",
  "condition",
  "evidence",
]);

const campaignStatusSchema = z.enum(["active", "expired", "unknown"]);

const indexDocumentSchema = z.object({
  bankId: z.string().min(1).max(120),
  bankName: z.string().min(1).max(200),
  sourceId: z.string().min(1).max(120),
  sourceUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "sourceUrl http(s) olmalıdır.",
    }),
  documentType: documentTypeSchema,
  productType: z.string().max(120).optional(),
  productName: z.string().max(300).optional(),
  campaignStatus: campaignStatusSchema.optional(),
  title: z.string().max(300).optional(),
  evidenceText: z.string().max(5000).optional(),
  text: z.string().min(1).max(50_000),
  sourceCheckedAt: z.string().datetime({ offset: true }).or(z.string().min(10)),
  contentHash: z.string().min(8).max(128),
});

const indexBodySchema = z
  .object({
    mode: z.enum(["upsert", "replace"]).default("upsert"),
    sourceId: z.string().min(1).max(120).optional(),
    documents: z.array(indexDocumentSchema).min(1).max(50),
  })
  .superRefine((body, ctx) => {
    if (body.mode === "replace" && !body.sourceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "replace modunda sourceId zorunludur.",
        path: ["sourceId"],
      });
    }
    // Collection adı istemciden kabul edilmez
    if ("collection" in (body as object)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "collection alanı kabul edilmez.",
        path: ["collection"],
      });
    }
  });

const searchBodySchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).optional(),
  bankIds: z.array(z.string().min(1).max(120)).max(20).optional(),
  productTypes: z.array(z.string().min(1).max(120)).max(20).optional(),
  documentTypes: z.array(documentTypeSchema).max(10).optional(),
  activeOnly: z.boolean().optional(),
  scoreThreshold: z.number().min(0).max(1).optional(),
});

export function createQdrantRouter(): Router {
  const router = Router();

  router.use(qdrantRateLimiter);

  router.get("/health", async (_req, res) => {
    try {
      const health = await getCollectionHealth();
      const status = health.ok ? 200 : isQdrantConfigured() ? 503 : 200;
      res.status(status).json({
        ...health,
        // Gizli alanlar asla döndürülmez
      });
    } catch (err) {
      const message = sanitizeErrorMessage(
        err instanceof Error ? err.message : "Sağlık kontrolü başarısız.",
      );
      res.status(503).json({
        ok: false,
        configured: isQdrantConfigured(),
        collectionReady: false,
        message,
      });
    }
  });

  router.post("/index", requireAdmin, async (req, res) => {
    try {
      if (!isQdrantConfigured()) {
        return res.status(503).json({
          error:
            "Qdrant yapılandırılmamış. EVREN_QDRANT_* ortam değişkenlerini tanımlayın.",
        });
      }

      const parsed = indexBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Geçersiz istek gövdesi.",
          details: parsed.error.flatten(),
        });
      }

      const { mode, sourceId, documents } = parsed.data;
      const indexer = getDocumentIndexer();
      const docs = documents as IndexDocumentInput[];

      const result =
        mode === "replace" && sourceId
          ? await indexer.replaceSourceDocuments(sourceId, docs)
          : await indexer.indexDocuments(docs);

      return res.json({ ok: true, result });
    } catch (err) {
      const message = sanitizeErrorMessage(
        err instanceof Error ? err.message : "İndeksleme başarısız.",
      );
      console.error("[Qdrant] index hatası:", message);
      return res.status(500).json({ error: message });
    }
  });

  router.post("/search", qdrantSearchRateLimiter, async (req, res) => {
    try {
      if (!isQdrantConfigured()) {
        return res.status(503).json({
          error:
            "Qdrant yapılandırılmamış. EVREN_QDRANT_* ortam değişkenlerini tanımlayın.",
        });
      }

      const parsed = searchBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Geçersiz arama isteği.",
          details: parsed.error.flatten(),
        });
      }

      const search = getVectorSearchService();
      const results = await search.searchSimilarDocuments(parsed.data);
      return res.json({ ok: true, count: results.length, results });
    } catch (err) {
      const message = sanitizeErrorMessage(
        err instanceof Error ? err.message : "Arama başarısız.",
      );
      console.error("[Qdrant] search hatası:", message);
      return res.status(500).json({ error: message });
    }
  });

  router.delete("/source/:sourceId", requireAdmin, async (req, res) => {
    try {
      if (!isQdrantConfigured()) {
        return res.status(503).json({
          error:
            "Qdrant yapılandırılmamış. EVREN_QDRANT_* ortam değişkenlerini tanımlayın.",
        });
      }

      const sourceId = z
        .string()
        .min(1)
        .max(120)
        .safeParse(req.params.sourceId);
      if (!sourceId.success) {
        return res.status(400).json({ error: "Geçersiz sourceId." });
      }

      const indexer = getDocumentIndexer();
      const result = await indexer.deleteBySourceId(sourceId.data);
      return res.json({ ok: true, result });
    } catch (err) {
      const message = sanitizeErrorMessage(
        err instanceof Error ? err.message : "Silme başarısız.",
      );
      console.error("[Qdrant] delete hatası:", message);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
