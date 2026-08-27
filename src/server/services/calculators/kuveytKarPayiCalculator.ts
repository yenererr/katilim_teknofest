/**
 * Kuveyt Türk resmî kâr payı hesaplama aracı (ProfitSharingCalculator).
 * Uç: POST /ck0d84?1E32FE5C30C44BF2B51A08D1756ADEEB
 */

import {
  fetchKarPayi,
  KAR_PAYI_BROWSER_UA,
  resolveKarPayiTerm,
  type KarPayiHesaplamaOpts,
  type KarPayiHesaplamaSonucu,
} from "./karPayiShared";

const BASE_URL = "https://www.kuveytturk.com.tr";
const SOURCE_URL = `${BASE_URL}/hesaplama-araclari/kar-payi-hesaplama`;
const CALC_PATH = "/ck0d84?1E32FE5C30C44BF2B51A08D1756ADEEB";

type KuveytBody = {
  ProductCode?: string;
  SegmentName?: string;
  ProfitShareRatio?: number;
  GrossProfitShare?: number;
  NetProfitShare?: number;
  GrossProfitShareYearly?: number;
  NetProfitShareYearly?: number;
  Message?: string;
  message?: string;
};

export async function hesaplaKuveytKarPayi(
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
        "X-Bone-Language": "TR",
        "X-Requested-With": "XMLHttpRequest",
        Referer: SOURCE_URL,
        Origin: BASE_URL,
      },
      body: JSON.stringify({
        i: true,
        p1: String(Math.round(opts.amount)),
        p2: "2",
        p3: String(term.days),
        p4: "0",
        p5: "",
        p9: "Katılma Hesabı",
        p10: true,
      }),
    },
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(`Kuveyt Türk kâr payı hesabı başarısız (HTTP ${res.status}).`);
  }

  const json = (await res.json()) as KuveytBody;
  const net = Number(json.NetProfitShare);
  const gross = Number(json.GrossProfitShare);
  if (!Number.isFinite(net) && !Number.isFinite(gross)) {
    throw new Error(
      json.Message ||
        json.message ||
        "Kuveyt Türk bu koşullar için kâr payı hesabı sunmuyor.",
    );
  }

  return {
    bankId: "kuveyt-turk",
    available: true,
    amount: opts.amount,
    currency: "TRY",
    termKey: term.key,
    termDays: term.days,
    termLabel: term.label,
    accountName: json.SegmentName ? String(json.SegmentName) : "Katılma Hesabı",
    grossProfit: Number.isFinite(gross) ? gross : null,
    netProfit: Number.isFinite(net) ? net : null,
    totalAmount: Number.isFinite(net) ? net + opts.amount : null,
    grossRatePercent: Number.isFinite(Number(json.GrossProfitShareYearly))
      ? Number(json.GrossProfitShareYearly)
      : null,
    netRatePercent: Number.isFinite(Number(json.NetProfitShareYearly))
      ? Number(json.NetProfitShareYearly)
      : null,
    withholdingTaxPercent: null,
    shareCustomerPercent: Number.isFinite(Number(json.ProfitShareRatio))
      ? Number(json.ProfitShareRatio)
      : null,
    sourceUrl: SOURCE_URL,
    calculatedAt: new Date().toISOString(),
  };
}
