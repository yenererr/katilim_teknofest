import rateLimit from "express-rate-limit";

/** Qdrant API uç noktaları için genel hız sınırı */
export const qdrantRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Çok fazla istek. Lütfen bir dakika sonra tekrar deneyin.",
  },
});

/** Arama uç noktası için daha sıkı limit */
export const qdrantSearchRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Arama istek limiti aşıldı. Lütfen bir dakika sonra tekrar deneyin.",
  },
});
