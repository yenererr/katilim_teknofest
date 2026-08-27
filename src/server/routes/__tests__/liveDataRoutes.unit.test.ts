import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

let memoryCampaigns: Array<Record<string, unknown>> = [];
const cachedCampaign = {
  id: "cache-campaign-1",
  bankId: "albaraka",
  title: "Cache Kampanyası",
  productName: "Cache Kampanyası",
  category: "card_campaign",
  campaignStatus: "active",
  campaignTheme: "card",
  sourceUrl: "https://www.albaraka.com.tr/tr/kampanyalar/detay/cache-kampanyasi",
  recordType: "campaign",
};

vi.mock("../../services/postgres/store", () => ({
  listMemoryCampaigns: vi.fn((filter?: { activeOnly?: boolean }) => {
    let rows = [...memoryCampaigns];
    if (filter?.activeOnly) {
      rows = rows.filter((r) => r.campaignStatus === "active");
    }
    return rows;
  }),
  listMemoryProducts: vi.fn(() => []),
  isPostgresConfigured: vi.fn(() => false),
  ensureSchema: vi.fn(async () => ({ ok: false, message: "no postgres" })),
  hydrateMemoryFromPostgres: vi.fn(async () => ({
    campaigns: 0,
    products: 0,
    message: "no postgres",
  })),
  pruneNonDisplayableCampaigns: vi.fn(() => ({ before: 0, after: 0, removed: 0 })),
  replaceMemoryCampaigns: vi.fn((rows: Array<Record<string, unknown>>) => {
    memoryCampaigns = rows;
    return { loaded: rows.length, skipped: 0 };
  }),
  persistCampaignMemoryCache: vi.fn(async () => ({ path: "cache", count: 0 })),
  loadCampaignMemoryCache: vi.fn(async () => {
    memoryCampaigns = [cachedCampaign];
    return { loaded: 1, skipped: 0, path: "cache" };
  }),
}));

vi.mock("../../services/scraper/orchestrator", () => ({
  getOfficialScrapeStates: vi.fn(() => []),
  getScrapeJob: vi.fn(() => null),
  listRecentJobs: vi.fn(() => []),
  runOfficialScrapeJob: vi.fn(async () => ({ jobId: "job", status: "queued" })),
}));

vi.mock("../../services/qdrant", () => ({
  getCollectionHealth: vi.fn(async () => ({ ok: true, message: "ok" })),
  isQdrantConfigured: vi.fn(() => false),
}));

vi.mock("../../services/scraper/bankSourceConfig", () => ({
  BANK_SOURCE_CONFIGS: [],
}));

describe("liveDataRoutes", () => {
  let server: Server | null = null;

  afterEach(() => {
    memoryCampaigns = [];
    if (server) {
      server.close();
      server = null;
    }
  });

  it("kampanya belleği boşsa disk cache fallback ile liste döner", async () => {
    const { createLiveDataRouter } = await import("../liveDataRoutes");
    const app = express();
    app.use("/api/live", createLiveDataRouter());

    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const port = (server!.address() as AddressInfo).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/live/campaigns`);
    const body = (await res.json()) as {
      source: string;
      cacheFallback: { loaded: number };
      cardAndDiscountCampaigns: Array<Record<string, unknown>>;
    };

    expect(res.ok).toBe(true);
    expect(body.source).toBe("cache");
    expect(body.cacheFallback.loaded).toBe(1);
    expect(body.cardAndDiscountCampaigns).toHaveLength(1);
    expect(body.cardAndDiscountCampaigns[0].title).toBe("Cache Kampanyası");
  });
});
