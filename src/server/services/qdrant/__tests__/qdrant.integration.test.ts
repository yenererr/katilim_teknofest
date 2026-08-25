/**
 * Integration tests — gerçek EVREN Qdrant / embedding uç noktalarına bağlanır.
 * Çalıştırmak için ortam değişkenleri ve ağ erişimi gerekir:
 *
 *   npm run test:integration
 *
 * CI'da varsayılan olarak atlanır.
 */
import { describe, expect, it } from "vitest";
import {
  checkQdrantHealth,
  ensureCollection,
  isQdrantConfigured,
  loadQdrantEnv,
} from "../index";

const runIntegration = process.env.RUN_QDRANT_INTEGRATION === "1";

describe.skipIf(!runIntegration)("Qdrant integration", () => {
  it("ortam değişkenlerini doğrular", () => {
    expect(isQdrantConfigured()).toBe(true);
    const cfg = loadQdrantEnv();
    expect(cfg.port).toBe(443);
    expect(cfg.prefix.length).toBeGreaterThan(0);
  });

  it("sağlık kontrolü başarılı olur", async () => {
    const health = await checkQdrantHealth();
    expect(health.ok).toBe(true);
  }, 60_000);

  it("koleksiyonu oluşturur veya doğrular", async () => {
    const result = await ensureCollection();
    expect(result.collection).toBe(
      process.env.QDRANT_COLLECTION || "katilim_finans_documents",
    );
  }, 120_000);
});
