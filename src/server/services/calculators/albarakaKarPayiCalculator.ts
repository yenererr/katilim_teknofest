/**
 * Albaraka Türk resmî kâr payı hesaplama aracı.
 * Uç: GET /plugins/getProfitShareCalculate
 */

import {
  fetchKarPayi,
  KAR_PAYI_BROWSER_UA,
  parseKarPayiNumber,
  parseWithholdingPercent,
  resolveKarPayiTerm,
  type KarPayiHesaplamaOpts,
  type KarPayiHesaplamaSonucu,
} from "./karPayiShared";

const BASE_URL = "https://www.albaraka.com.tr";
const SOURCE_URL = `${BASE_URL}/tr/hesaplama-araclari/kar-payi-hesaplama`;
const CALC_PATH = "/plugins/getProfitShareCalculate";
const LANG_ID = "bf2689d9-071e-4a20-9450-b1dbdd39778f";

type AlbarakaData = {
  GrossProfit?: string;
  GrossRate?: string;
  NetProfit?: string;
  InvestedAmountPlusNetProfit?: string;
  NetRate?: string;
  IncomeTax?: string;
};

export async function hesaplaAlbarakaKarPayi(
  opts: KarPayiHesaplamaOpts,
  fetchImpl: typeof fetch = fetch,
): Promise<KarPayiHesaplamaSonucu> {
  const term = resolveKarPayiTerm(opts.term);
  const qs = new URLSearchParams({
    langId: LANG_ID,
    language: "tr",
    Slug: "kar-payi-hesaplama",
    DepositedAmount: String(Math.round(opts.amount)),
    Currency: "TRY",
    Maturity: term.key === "12p" ? String(term.days) : String(term.months),
    Period: term.key === "12p" ? "DAY" : "MONTH",
    Type: "KTLMHSP",
  });

  const res = await fetchKarPayi(
    `${BASE_URL}${CALC_PATH}?${qs}`,
    {
      headers: {
        "User-Agent": KAR_PAYI_BROWSER_UA,
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: SOURCE_URL,
        "Accept-Language": "tr-TR,tr;q=0.9",
      },
    },
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(`Albaraka kâr payı hesabı başarısız (HTTP ${res.status}).`);
  }

  const json = (await res.json()) as {
    Result?: boolean;
    Data?: AlbarakaData;
    Error?: string | null;
  };
  if (!json.Result || !json.Data) {
    throw new Error(
      json.Error || "Albaraka bu koşullar için kâr payı hesabı sunmuyor.",
    );
  }

  const d = json.Data;
  return {
    bankId: "albaraka",
    available: true,
    amount: opts.amount,
    currency: "TRY",
    termKey: term.key,
    termDays: term.days,
    termLabel: term.label,
    accountName: "Katılma Hesabı",
    grossProfit: parseKarPayiNumber(d.GrossProfit),
    netProfit: parseKarPayiNumber(d.NetProfit),
    totalAmount: parseKarPayiNumber(d.InvestedAmountPlusNetProfit),
    grossRatePercent: parseKarPayiNumber(d.GrossRate),
    netRatePercent: parseKarPayiNumber(d.NetRate),
    withholdingTaxPercent: parseWithholdingPercent(d.IncomeTax),
    shareCustomerPercent: null,
    sourceUrl: SOURCE_URL,
    calculatedAt: new Date().toISOString(),
  };
}
