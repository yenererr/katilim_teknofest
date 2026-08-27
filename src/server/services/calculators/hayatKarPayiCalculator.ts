/**
 * Hayat Finans resmî kâr payı aracı.
 * Uç: POST /api/integration/calculateprofitsharerate
 */

import {
  fetchKarPayi,
  KAR_PAYI_BROWSER_UA,
  resolveKarPayiTerm,
  type KarPayiHesaplamaOpts,
  type KarPayiHesaplamaSonucu,
} from "./karPayiShared";

const BASE_URL = "https://hayatfinans.com.tr";
const SOURCE_URL = `${BASE_URL}/hesaplar/katilma-hesabi`;
const CALC_PATH = "/api/integration/calculateprofitsharerate";

type HayatJson = {
  isSuccessful?: boolean;
  message?: string;
  data?: {
    grossProfitShare?: number;
    netProfitShare?: number;
    grossProfitShareYearly?: number;
    netProfitShareYearly?: number;
  } | null;
};

export async function hesaplaHayatKarPayi(
  opts: KarPayiHesaplamaOpts,
  fetchImpl: typeof fetch = fetch,
): Promise<KarPayiHesaplamaSonucu> {
  const term = resolveKarPayiTerm(opts.term);
  const res = await fetchKarPayi(
    `${BASE_URL}${CALC_PATH}`,
    {
      method: "POST",
      headers: {
        "User-Agent": KAR_PAYI_BROWSER_UA,
        Accept: "application/json",
        "Content-Type": "application/json",
        Culture: "tr-TR",
        Referer: SOURCE_URL,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        AccountType: 0, // Katılma Hesabı
        Maturity: 1, // gün
        ProductGroup: 2,
        Money: Math.round(opts.amount),
        FEC: 0, // TL
        MaturityTerm: term.days,
      }),
    },
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(`Hayat Finans kâr payı hesabı başarısız (HTTP ${res.status}).`);
  }

  const json = (await res.json()) as HayatJson;
  if (!json.isSuccessful || !json.data) {
    throw new Error(
      json.message || "Hayat Finans bu koşullar için kâr payı hesabı sunmuyor.",
    );
  }

  const d = json.data;
  const grossProfit =
    typeof d.grossProfitShare === "number" ? d.grossProfitShare : null;
  const netProfit =
    typeof d.netProfitShare === "number" ? d.netProfitShare : null;

  if (grossProfit == null && netProfit == null) {
    throw new Error("Hayat Finans beklenmeyen yanıt döndürdü.");
  }

  return {
    bankId: "hayat-finans",
    available: true,
    amount: opts.amount,
    currency: "TRY",
    termKey: term.key,
    termDays: term.days,
    termLabel: term.label,
    accountName: "Katılma Hesabı",
    grossProfit,
    netProfit,
    totalAmount: netProfit != null ? opts.amount + netProfit : null,
    grossRatePercent:
      typeof d.grossProfitShareYearly === "number"
        ? d.grossProfitShareYearly
        : null,
    netRatePercent:
      typeof d.netProfitShareYearly === "number"
        ? d.netProfitShareYearly
        : null,
    withholdingTaxPercent: null,
    shareCustomerPercent: null,
    sourceUrl: SOURCE_URL,
    calculatedAt: new Date().toISOString(),
  };
}
