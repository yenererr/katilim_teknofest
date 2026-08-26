import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { runRagChat } from "../services/rag/ragService";
import { sanitizeEvrenError } from "../services/evren/evrenChat";
import { runFinansmanAssistantChat } from "../services/finansmanAssistant";

const chatBodySchema = z.object({
  message: z.string().min(1).max(2000),
  conversationId: z.string().min(1).max(120).optional(),
  forceRefresh: z.boolean().optional(),
  selectedQuickReply: z.string().min(1).max(200).optional(),
  mode: z.enum(["rag", "finansman"]).optional(),
});

const chatRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Asistan istek limiti aşıldı. Lütfen bir dakika sonra tekrar deneyin.",
  },
});

export function createAssistantRouter(): Router {
  const router = Router();
  router.use(chatRateLimiter);

  router.post("/chat", async (req, res) => {
    try {
      const parsed = chatBodySchema.safeParse(req.body);
      if (parsed.success === false) {
        return res.status(400).json({
          error: "Geçersiz istek gövdesi.",
          details: parsed.error.flatten(),
        });
      }

      const body = parsed.data;

      // Finansman Asistanı modu — yapılandırılmış tablo yanıtı
      if (body.mode === "finansman") {
        const result = await runFinansmanAssistantChat({
          conversationId: body.conversationId,
          message: body.message,
          selectedQuickReply: body.selectedQuickReply,
          forceRefresh: body.forceRefresh,
        });
        return res.json(result);
      }

      const result = await runRagChat({
        message: body.message,
        conversationId: body.conversationId,
        forceRefresh: body.forceRefresh,
      });

      // İç sistem promptu / API anahtarı asla dönmez
      return res.json({
        answer: result.answer,
        status: result.status,
        products: result.products,
        citations: result.citations,
        warnings: result.warnings,
        calculation: result.calculation,
        dataAsOf: result.dataAsOf,
        requestId: result.requestId,
        observability: result.observability
          ? {
              intent: result.observability.intent,
              total_duration_ms: result.observability.total_duration_ms,
              retrieved_chunk_count: result.observability.retrieved_chunk_count,
              used_source_count: result.observability.used_source_count,
              freshness_status: result.observability.freshness_status,
              validation_status: result.observability.validation_status,
              fallback_used: result.observability.fallback_used,
              model_alias: result.observability.model_alias,
            }
          : undefined,
      });
    } catch (err) {
      const message = sanitizeEvrenError(
        err instanceof Error ? err.message : "Asistan yanıtı üretilemedi.",
      );
      console.error("[Assistant]", message);
      return res.status(500).json({
        error: "Şu an cevap veremedim. Biraz sonra tekrar dener misiniz?",
        detail: message,
      });
    }
  });

  /** Açık finansman endpoint’i (chat mode=finansman ile aynı sözleşme) */
  router.post("/finansman", async (req, res) => {
    try {
      const parsed = chatBodySchema.safeParse({
        ...req.body,
        mode: "finansman",
      });
      if (parsed.success === false) {
        return res.status(400).json({
          error: "Geçersiz istek gövdesi.",
          details: parsed.error.flatten(),
        });
      }
      const result = await runFinansmanAssistantChat({
        conversationId: parsed.data.conversationId,
        message: parsed.data.message,
        selectedQuickReply: parsed.data.selectedQuickReply,
        forceRefresh: parsed.data.forceRefresh,
      });
      return res.json(result);
    } catch (err) {
      const message = sanitizeEvrenError(
        err instanceof Error ? err.message : "Finansman asistanı yanıtı üretilemedi.",
      );
      console.error("[FinansmanAssistant]", message);
      return res.status(500).json({
        error:
          "Bazı banka kaynakları şu anda doğrulanamadığı için karşılaştırma tamamlanamadı.",
        detail: message,
      });
    }
  });

  return router;
}
