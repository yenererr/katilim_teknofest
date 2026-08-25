import { assertAllowedFinalUrl, validateOfficialBankUrl } from "./urlGuard";
import type { ScrapedPage } from "./scraperTypes";

const DEFAULT_UA =
  process.env.SCRAPER_USER_AGENT || "KatilimFinansBot/1.0 (+https://localhost; official-source-only)";
const TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 20_000);
const MAX_RETRIES = Number(process.env.SCRAPER_MAX_RETRIES || 2);
const DELAY_MS = Number(process.env.SCRAPER_REQUEST_DELAY_MS || 2000);

const lastRequestByDomain = new Map<string, number>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttleDomain(hostname: string) {
  const last = lastRequestByDomain.get(hostname) || 0;
  const wait = DELAY_MS - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  lastRequestByDomain.set(hostname, Date.now());
}

/**
 * Güvenli sayfa indirme — yalnızca resmî katılım bankası domainleri.
 */
export async function fetchOfficialPage(
  url: string,
  bankId: string,
): Promise<ScrapedPage> {
  const initial = validateOfficialBankUrl(url, bankId);
  if (initial.ok === false) {
    throw new Error(initial.reason);
  }

  await throttleDomain(initial.hostname);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(initial.url.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": DEFAULT_UA,
          Accept: "text/html,application/xhtml+xml",
        },
      });

      const finalUrl = res.url || initial.url.toString();
      const finalCheck = assertAllowedFinalUrl(finalUrl, bankId);
      if (finalCheck.ok === false) {
        throw new Error(`Yönlendirme reddedildi: ${finalCheck.reason}`);
      }

      if (res.status === 429 || res.status === 503) {
        await sleep(750 * 2 ** attempt);
        continue;
      }

      if (res.status === 403) {
        const err = new Error(`Kaynak engellendi (HTTP 403): ${finalUrl}`);
        (err as Error & { code?: string }).code = "blocked";
        throw err;
      }

      if (res.status === 404) {
        const err = new Error(`Sayfa bulunamadı (HTTP 404): ${finalUrl}`);
        (err as Error & { code?: string }).code = "no_public_campaign_page";
        throw err;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${finalUrl}`);
      }

      const html = await res.text();
      return {
        requestedUrl: url,
        finalUrl,
        httpStatus: res.status,
        html,
        fetchedAt: new Date().toISOString(),
        fetchMethod: "fetch",
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const code = (err as { code?: string }).code;
      if (code === "blocked" || code === "no_public_campaign_page") throw lastError;
      if (attempt < MAX_RETRIES) await sleep(750 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("Sayfa indirilemedi.");
}
