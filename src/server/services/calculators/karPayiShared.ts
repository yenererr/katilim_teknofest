/**
 * Katılma hesabı kâr payı hesaplama — ortak tipler ve sayı ayrıştırma.
 * Değerler bankaların resmî hesaplama araçlarından gelir; mock yok.
 */

export type KarPayiTermKey = "1m" | "3m" | "6m" | "12m" | "12p";

export type KarPayiCurrency = "TRY";

export const KAR_PAYI_VADELER: Array<{
  key: KarPayiTermKey;
  label: string;
  days: number;
  months: number;
}> = [
  { key: "1m", label: "1 Ay", days: 31, months: 1 },
  { key: "3m", label: "3 Ay", days: 91, months: 3 },
  { key: "6m", label: "6 Ay", days: 180, months: 6 },
  { key: "12m", label: "1 Yıl", days: 364, months: 12 },
  { key: "12p", label: "1 Yıl üzeri", days: 366, months: 13 },
];

export type KarPayiHesaplamaOpts = {
  amount: number;
  term: KarPayiTermKey;
  currency?: KarPayiCurrency;
};

export type KarPayiHesaplamaSonucu = {
  bankId: string;
  available: boolean;
  reason?: string;
  amount: number;
  currency: string;
  termKey: KarPayiTermKey;
  termDays: number;
  termLabel: string;
  accountName: string | null;
  grossProfit: number | null;
  netProfit: number | null;
  totalAmount: number | null;
  grossRatePercent: number | null;
  netRatePercent: number | null;
  withholdingTaxPercent: number | null;
  shareCustomerPercent: number | null;
  sourceUrl: string;
  calculatedAt: string;
};

export class KarPayiKisitHatasi extends Error {
  readonly kisit = true;
}

export const KAR_PAYI_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const KAR_PAYI_TIMEOUT_MS = Number(
  process.env.SCRAPER_TIMEOUT_MS || 20_000,
);

export function resolveKarPayiTerm(key: KarPayiTermKey) {
  const found = KAR_PAYI_VADELER.find((v) => v.key === key);
  if (!found) throw new KarPayiKisitHatasi("Geçersiz vade.");
  return found;
}

export function unavailableKarPayi(
  bankId: string,
  opts: KarPayiHesaplamaOpts,
  sourceUrl: string,
  reason: string,
): KarPayiHesaplamaSonucu {
  const term = resolveKarPayiTerm(opts.term);
  return {
    bankId,
    available: false,
    reason,
    amount: opts.amount,
    currency: opts.currency ?? "TRY",
    termKey: term.key,
    termDays: term.days,
    termLabel: term.label,
    accountName: null,
    grossProfit: null,
    netProfit: null,
    totalAmount: null,
    grossRatePercent: null,
    netRatePercent: null,
    withholdingTaxPercent: null,
    shareCustomerPercent: null,
    sourceUrl,
    calculatedAt: new Date().toISOString(),
  };
}

/** "2.675,16 TL" | "%31,50" | "% 32.185" | 26.44 */
export function parseKarPayiNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/%/g, "").replace(/[^\d.,-]/g, "").trim();
  if (!s || s === "-" || s === ".") return null;
  const n =
    s.includes(".") && s.includes(",")
      ? Number(s.replace(/\./g, "").replace(",", "."))
      : s.includes(",")
        ? Number(s.replace(",", "."))
        : Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Stopaj: "%17,5" veya Albaraka "% 0,175" (oran kesri). */
export function parseWithholdingPercent(raw: unknown): number | null {
  const n = parseKarPayiNumber(raw);
  if (n == null) return null;
  if (n > 0 && n < 1) return Math.round(n * 1000) / 10;
  return n;
}

export async function fetchKarPayi(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), KAR_PAYI_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
