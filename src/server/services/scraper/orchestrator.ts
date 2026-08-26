import crypto from "crypto";
import { BANK_SOURCE_CONFIGS } from "./bankSourceConfig";
import { getAdapter } from "./adapters";
import { fetchOfficialPage } from "./pageFetcher";
import { hashContent } from "./contentCleaner";
import { extractFinancialRecordsFromText } from "./evrenExtractor";
import {
  getMemorySnapshot,
  setMemorySnapshot,
  upsertExtractedRecords,
} from "../postgres/store";
import { buildIndexDocumentsFromScrape } from "../qdrant/scrapeIndexer";
import { getDocumentIndexer, isQdrantConfigured } from "../qdrant";
import type { SourceStatus } from "./scraperTypes";
import { registerLiveDataBridge } from "../liveData/liveDataBridge";

export type ScrapeJob = {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  bankFilter?: string[];
  force?: boolean;
  stats: Record<string, unknown>;
  error?: string;
  sourceStatuses: Record<string, SourceStatus>;
};

const jobs = new Map<string, ScrapeJob>();

export function getScrapeJob(jobId: string): ScrapeJob | undefined {
  return jobs.get(jobId);
}

export function listRecentJobs(limit = 20): ScrapeJob[] {
  return [...jobs.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

type BankRuntimeState = {
  id: string;
  bankName: string;
  urls: string[];
  status: "beklemede" | "degismedi" | "guncellendi" | "hata";
  contentHash: string | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastExtractedAt: string | null;
  products: any[];
  error: string | null;
  indexStatus?: string | null;
  indexError?: string | null;
  indexedAt?: string | null;
  sourceStatus?: SourceStatus;
};

const runtimeStates: Record<string, BankRuntimeState> = Object.fromEntries(
  BANK_SOURCE_CONFIGS.map((b) => [
    b.bankId,
    {
      id: b.bankId,
      bankName: b.bankName,
      urls: b.seedUrls.map((s) => s.url),
      status: "beklemede",
      contentHash: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastExtractedAt: null,
      products: [],
      error: null,
      sourceStatus: "pending",
    },
  ]),
);

export function getOfficialScrapeStates(): BankRuntimeState[] {
  return Object.values(runtimeStates);
}

function mapExtractedToKatilimProduct(r: any) {
  return {
    urun_adi: r.productName || r.title || "Ürün",
    urun_turu:
      r.category === "housing_finance"
        ? "konut_finansmani"
        : r.category === "vehicle_finance"
          ? "tasit_finansmani"
          : r.category === "consumer_finance"
            ? "ihtiyac_finansmani"
            : r.category === "shopping_finance"
              ? "alisveris_puani"
              : "diger",
    musteri_segmenti: r.targetSegments || [],
    kampanya_baslangic: r.campaignStart,
    kampanya_bitis: r.campaignEnd,
    terimler: {
      kar_payi_orani: {
        ham: r.profitRate != null ? String(r.profitRate) : null,
        deger: r.profitRate,
        periyot:
          r.ratePeriod === "monthly"
            ? "aylik"
            : r.ratePeriod === "annual"
              ? "yillik"
              : "belirsiz",
        guven: r.profitRate != null ? 0.85 : 0,
      },
      vade_ay: {
        ham: r.maxTermMonths != null ? `${r.maxTermMonths} ay` : null,
        min: r.minTermMonths,
        max: r.maxTermMonths,
        guven: r.maxTermMonths != null ? 0.85 : 0,
      },
      tahsis_ucreti: {
        ham: r.allocationFeeValue != null ? String(r.allocationFeeValue) : null,
        deger: r.allocationFeeValue,
        tipi: r.allocationFeeType === "fixed" ? "sabit" : r.allocationFeeType === "percentage" ? "oran" : "belirsiz",
        para_birimi: "TRY",
        guven: r.allocationFeeValue != null ? 0.8 : 0,
      },
      tutar: {
        ham: null,
        min: r.minAmountTl,
        max: r.maxAmountTl,
        para_birimi: "TRY",
        guven: r.maxAmountTl != null ? 0.8 : 0,
      },
      taksit_sayisi: {
        ham: null,
        deger: r.installmentCount,
        guven: r.installmentCount != null ? 0.8 : 0,
      },
      odul: {
        ham: null,
        deger: r.rewardAmountTl,
        tipi: r.rewardType,
        guven: r.rewardAmountTl != null ? 0.7 : 0,
      },
    },
    kanitlar: Object.fromEntries(
      (r.evidence || []).map((e: any) => [e.field, e.text]),
    ),
    terim_esleme_uygulandi: false,
    ortalama_guven: 0.8,
    manuel_dogrulama_gerekli: Boolean(r.manualReviewRequired),
    notlar: null,
    _category: r.category,
    _sourceUrl: r.sourceUrl,
    _campaignStatus: r.campaignStatus,
  };
}

async function scrapeOneBankOfficial(
  bankId: string,
  force: boolean,
  sourceStatuses: Record<string, SourceStatus>,
): Promise<void> {
  const config = BANK_SOURCE_CONFIGS.find((b) => b.bankId === bankId);
  if (!config || !config.enabled) return;
  const adapter = getAdapter(bankId);
  const now = new Date().toISOString();
  const state = runtimeStates[bankId];
  const allTexts: string[] = [];
  // Indeksleme sayfa bazlı yapılır: her parça kendi URL'sine atfedilsin.
  const scrapedPages: Array<{
    url: string;
    text: string;
    sourceType: string;
  }> = [];
  const discovered = new Set<string>();
  const records: any[] = [];
  let anyChanged = false;
  let lastError: string | null = null;

  for (const seed of config.seedUrls) {
    const sourceKey = `${bankId}::${seed.url}`;
    sourceStatuses[sourceKey] = "fetching";
    try {
      if (seed.sourceType === "discovery_only") {
        // varlık kontrolü — 404'te no_public işaretle, sürekli deneme yok (tek deneme)
      }

      const page = await fetchOfficialPage(seed.url, bankId);
      const doc = await adapter.extractMainContent(page);
      const normalizedHash = hashContent(doc.text);
      const prev = getMemorySnapshot(sourceKey);

      if (!force && prev?.hash === normalizedHash) {
        sourceStatuses[sourceKey] = "unchanged";
        allTexts.push(doc.text);
        scrapedPages.push({
          url: page.finalUrl,
          text: doc.text,
          sourceType: seed.sourceType,
        });
        continue;
      }

      sourceStatuses[sourceKey] = "changed";
      anyChanged = true;
      setMemorySnapshot(sourceKey, normalizedHash, doc.text);
      allTexts.push(doc.text);
      scrapedPages.push({
        url: page.finalUrl,
        text: doc.text,
        sourceType: seed.sourceType,
      });

      const details = await adapter.discoverDetailUrls(page);
      for (const d of details.slice(0, 8)) discovered.add(d);

      const category =
        adapter.classifyContent?.(doc, page.finalUrl) ||
        adapter.extractVisibleMetadata(doc).categoryHint ||
        "general_announcement";

      if (category === "irrelevant") {
        sourceStatuses[sourceKey] = "verified";
        continue;
      }

      sourceStatuses[sourceKey] = "extracting";
      const extracted = await extractFinancialRecordsFromText({
        bankId,
        sourceUrl: page.finalUrl,
        text: doc.text,
        categoryHint: category,
      });
      records.push(...extracted);
      await upsertExtractedRecords(extracted);
      sourceStatuses[sourceKey] = extracted.length ? "verified" : "parser_degraded";
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "no_public_campaign_page") {
        sourceStatuses[sourceKey] = "no_public_campaign_page";
      } else if (code === "blocked") {
        sourceStatuses[sourceKey] = "blocked";
      } else {
        sourceStatuses[sourceKey] = "failed";
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  // Keşfedilen detaylar (sınırlı)
  for (const detailUrl of [...discovered].slice(0, 5)) {
    const sourceKey = `${bankId}::${detailUrl}`;
    if (sourceStatuses[sourceKey]) continue;
    try {
      sourceStatuses[sourceKey] = "fetching";
      const page = await fetchOfficialPage(detailUrl, bankId);
      const doc = await adapter.extractMainContent(page);
      const normalizedHash = hashContent(doc.text);
      const prev = getMemorySnapshot(sourceKey);
      if (!force && prev?.hash === normalizedHash) {
        sourceStatuses[sourceKey] = "unchanged";
        continue;
      }
      anyChanged = true;
      setMemorySnapshot(sourceKey, normalizedHash, doc.text);
      allTexts.push(doc.text);
      scrapedPages.push({
        url: page.finalUrl,
        text: doc.text,
        sourceType: "detail",
      });
      const category =
        adapter.classifyContent?.(doc, page.finalUrl) || "financing_campaign";
      if (category === "irrelevant" || category === "card_campaign") {
        // kart kampanyası ayrı tutulur; finansman karşılaştırmasına karışmaz
        if (category === "card_campaign") {
          const extracted = await extractFinancialRecordsFromText({
            bankId,
            sourceUrl: page.finalUrl,
            text: doc.text,
            categoryHint: category,
          });
          await upsertExtractedRecords(extracted);
        }
        sourceStatuses[sourceKey] = "verified";
        continue;
      }
      const extracted = await extractFinancialRecordsFromText({
        bankId,
        sourceUrl: page.finalUrl,
        text: doc.text,
        categoryHint: category,
      });
      records.push(...extracted);
      await upsertExtractedRecords(extracted);
      sourceStatuses[sourceKey] = "verified";
    } catch {
      sourceStatuses[sourceKey] = "failed";
    }
  }

  const combined = allTexts.join("\n\n---\n\n").slice(0, 20_000);
  const contentHash = hashContent(combined || bankId);

  const products = records
    .filter((r) => r.category !== "card_campaign" && r.category !== "discount_campaign")
    .map(mapExtractedToKatilimProduct);

  if (isQdrantConfigured() && anyChanged && combined.length > 80) {
    try {
      const docs = buildIndexDocumentsFromScrape({
        bankId,
        bankName: config.bankName,
        sourceId: bankId,
        sourceUrls: config.seedUrls.map((s) => s.url),
        pages: scrapedPages,
        combinedText: combined,
        contentHash,
        sourceCheckedAt: now,
        products,
      });
      await getDocumentIndexer().replaceSourceDocuments(bankId, docs);
      state.indexStatus = "indekslendi";
      state.indexedAt = new Date().toISOString();
      state.indexError = null;
    } catch (err) {
      state.indexStatus = "hata";
      state.indexError = err instanceof Error ? err.message : "index error";
    }
  }

  runtimeStates[bankId] = {
    ...state,
    status:
      products.length || (state.products?.length && !lastError)
        ? anyChanged
          ? "guncellendi"
          : "degismedi"
        : lastError
          ? "hata"
          : anyChanged
            ? "guncellendi"
            : "degismedi",
    contentHash,
    lastCheckedAt: now,
    lastChangedAt: anyChanged ? now : state.lastChangedAt,
    lastExtractedAt: products.length ? now : state.lastExtractedAt,
    products: products.length ? products : state.products,
    // Kural katmanı ürün ürettiyse EVREN hatasını kullanıcıya engel etme
    error: products.length ? null : lastError,
    urls: config.seedUrls.map((s) => s.url),
    bankName: config.bankName,
  };
}

export async function runOfficialScrapeJob(opts: {
  bankIds?: string[];
  force?: boolean;
}): Promise<ScrapeJob> {
  const jobId = `refresh_${crypto.randomBytes(6).toString("hex")}`;
  const job: ScrapeJob = {
    jobId,
    status: "queued",
    startedAt: new Date().toISOString(),
    bankFilter: opts.bankIds,
    force: opts.force,
    stats: {},
    sourceStatuses: {},
  };
  jobs.set(jobId, job);

  // async run
  setTimeout(async () => {
    job.status = "running";
    const banks = (opts.bankIds?.length
      ? BANK_SOURCE_CONFIGS.filter((b) => opts.bankIds!.includes(b.bankId))
      : BANK_SOURCE_CONFIGS
    ).filter((b) => b.enabled);

    // jitter: bankaları sırayla işle (eşzamanlı domain=1 zaten fetcher'da)
    let ok = 0;
    let fail = 0;
    for (const bank of banks) {
      const jitter = Math.floor(Math.random() * 1500);
      await new Promise((r) => setTimeout(r, jitter));
      try {
        await scrapeOneBankOfficial(bank.bankId, Boolean(opts.force), job.sourceStatuses);
        ok += 1;
      } catch (err) {
        fail += 1;
        job.sourceStatuses[bank.bankId] = "failed";
        console.warn(
          "[OfficialScraper]",
          bank.bankId,
          err instanceof Error ? err.message.slice(0, 200) : err,
        );
      }
    }
    job.stats = { banksOk: ok, banksFail: fail };
    job.status = "completed";
    job.finishedAt = new Date().toISOString();
  }, 10);

  return job;
}

/** Canlı veri köprüsünü resmi scraper durumuna bağla */
export function bindOfficialScraperBridge(): void {
  registerLiveDataBridge({
    getStates: () => getOfficialScrapeStates(),
    refreshBanks: async ({ force, bankIds }) => {
      const job = await runOfficialScrapeJob({ force, bankIds });
      // kısa bekleme — tam job arka planda; mevcut state'i döndür
      await new Promise((r) => setTimeout(r, 50));
      void job;
      return getOfficialScrapeStates();
    },
  });
}
