/**
 * Türkiye Finans bireysel kâr payı aracı.
 * Oranlar: GET FrontEndService.svc/GetKarPayiHesaplama/{currencyTypeId}/Bireysel
 * Tutar hesabı bankanın web aracındaki formülle yapılır (anapara × yıllık brüt × gün / 36500 − stopaj).
 */

import {
  fetchKarPayi,
  KAR_PAYI_BROWSER_UA,
  resolveKarPayiTerm,
  type KarPayiHesaplamaOpts,
  type KarPayiHesaplamaSonucu,
  type KarPayiTermKey,
} from "./karPayiShared";

const BASE_URL = "https://www.turkiyefinans.com.tr";
const SOURCE_URL = `${BASE_URL}/tr-tr/hesaplama-araclari/sayfalar/kar-payi-hesap-makinesi.aspx`;
const SERVICE_PATH =
  "/_vti_bin/TurkiyeFinansServices/FrontEndService.svc/GetKarPayiHesaplama/0/Bireysel";

/** Bankanın UI vadelerine hizalı gün (1 ay bandı min 32). */
const DAYS_BY_TERM: Record<KarPayiTermKey, number> = {
  "1m": 32,
  "3m": 91,
  "6m": 180,
  "12m": 364,
  "12p": 366,
};

type TfRow = {
  AnnuallyGrossRatio?: string;
  NetRatio?: string;
  ProfitRate?: string;
  MinimumDueDay?: number;
  MaximumDueDay?: number;
  MinimumAmount?: number;
  MaximumAmount?: number;
  Currency?: string;
  CurrencyTypeId?: number;
};

function tfStoppage(days: number): number {
  if (days <= 180) return 0.175;
  if (days <= 364) return 0.15;
  return 0.1;
}

function parseProfitShare(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const customer = Number(String(m[1]).replace(",", "."));
  return Number.isFinite(customer) ? customer : null;
}

export async function hesaplaTurkiyeFinansKarPayi(
  opts: KarPayiHesaplamaOpts,
  fetchImpl: typeof fetch = fetch,
): Promise<KarPayiHesaplamaSonucu> {
  const term = resolveKarPayiTerm(opts.term);
  const days = DAYS_BY_TERM[term.key];

  const res = await fetchKarPayi(
    `${BASE_URL}${SERVICE_PATH}`,
    {
      headers: {
        "User-Agent": KAR_PAYI_BROWSER_UA,
        Accept: "application/json",
        Referer: SOURCE_URL,
      },
    },
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(
      `Türkiye Finans kâr payı oranları alınamadı (HTTP ${res.status}).`,
    );
  }

  const json = (await res.json()) as {
    GetKarPayiHesaplamaResult?: {
      Data?: TfRow[] | null;
      Message?: string | null;
      Result?: number;
    };
  };
  const rows = json.GetKarPayiHesaplamaResult?.Data;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      json.GetKarPayiHesaplamaResult?.Message ||
        "Türkiye Finans kâr payı verisi boş döndü.",
    );
  }

  const row = rows.find(
    (r) =>
      days >= Number(r.MinimumDueDay) &&
      days <= Number(r.MaximumDueDay) &&
      opts.amount >= Number(r.MinimumAmount ?? 0) &&
      opts.amount <= Number(r.MaximumAmount ?? Number.POSITIVE_INFINITY),
  );
  if (!row) {
    throw new Error(
      "Türkiye Finans bu tutar/vade için kâr payı oranı yayınlamıyor.",
    );
  }

  const annualGross = Number(row.AnnuallyGrossRatio);
  if (!Number.isFinite(annualGross)) {
    throw new Error("Türkiye Finans yıllık brüt oran okunamadı.");
  }

  const stop = tfStoppage(days);
  const grossProfit = (opts.amount * annualGross * days) / 36500;
  const netProfit = grossProfit - grossProfit * stop;
  const netRatePercent = annualGross * (1 - stop);

  return {
    bankId: "turkiye-finans",
    available: true,
    amount: opts.amount,
    currency: "TRY",
    termKey: term.key,
    termDays: days,
    termLabel: term.label,
    accountName: "Bireysel Katılma Hesabı",
    grossProfit: Math.round(grossProfit * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    totalAmount: Math.round((opts.amount + netProfit) * 100) / 100,
    grossRatePercent: Math.round(annualGross * 1e6) / 1e6,
    netRatePercent: Math.round(netRatePercent * 1e6) / 1e6,
    withholdingTaxPercent: stop * 100,
    shareCustomerPercent: parseProfitShare(row.ProfitRate),
    sourceUrl: SOURCE_URL,
    calculatedAt: new Date().toISOString(),
  };
}
