/**
 * Vakıf Katılım resmî katılma hesabı kâr payı aracı.
 * Uç: /plugins/GrossAmountCalculationJson
 */

import { parseTrNumber, postVakifPlugin } from "./vakifKatilimCalculator";
import {
  parseKarPayiNumber,
  parseWithholdingPercent,
  resolveKarPayiTerm,
  type KarPayiHesaplamaOpts,
  type KarPayiHesaplamaSonucu,
} from "./karPayiShared";

const SOURCE_URL =
  "https://www.vakifkatilim.com.tr/tr/kendim-icin/hesaplar/katilma-hesaplari/katilma-hesabi";
const CALC_PATH = "/plugins/GrossAmountCalculationJson";

export async function hesaplaVakifKarPayi(
  opts: KarPayiHesaplamaOpts,
  fetchImpl: typeof fetch = fetch,
): Promise<KarPayiHesaplamaSonucu> {
  const term = resolveKarPayiTerm(opts.term);
  const json = await postVakifPlugin(
    CALC_PATH,
    {
      accountType: "KAH",
      currencyUnit: "0",
      principal: String(Math.round(opts.amount)),
      expiry: String(term.days),
    },
    fetchImpl,
  );

  const errorMessage = String(json.errorMessage ?? "").trim();
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const grossProfit = parseTrNumber(String(json.grossProfit ?? ""));
  const netProfit = parseTrNumber(String(json.netProfit ?? ""));

  return {
    bankId: "vakif-katilim",
    available: true,
    amount: opts.amount,
    currency: "TRY",
    termKey: term.key,
    termDays: term.days,
    termLabel: term.label,
    accountName: json.accountName ? String(json.accountName) : null,
    grossProfit,
    netProfit,
    totalAmount: netProfit != null ? netProfit + opts.amount : null,
    grossRatePercent: parseKarPayiNumber(json.grossRate),
    netRatePercent: parseKarPayiNumber(json.netRate),
    withholdingTaxPercent: parseWithholdingPercent(json.incomeTax),
    shareCustomerPercent: null,
    sourceUrl: SOURCE_URL,
    calculatedAt: new Date().toISOString(),
  };
}
