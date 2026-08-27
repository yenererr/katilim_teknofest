/**
 * Dünya Katılım resmî kâr payı aracı (anasayfa).
 * Uç: POST /DividendEstimatedProfit?lang=tr
 */

import {
  fetchKarPayi,
  KAR_PAYI_BROWSER_UA,
  resolveKarPayiTerm,
  type KarPayiHesaplamaOpts,
  type KarPayiHesaplamaSonucu,
  type KarPayiTermKey,
} from "./karPayiShared";

const BASE_URL = "https://dunyakatilim.com.tr";
const SOURCE_URL = `${BASE_URL}/`;
const CALC_PATH = "/DividendEstimatedProfit?lang=tr";
const PRODUCT_CODE = "KTLMHSP";

const MATURITY_BY_TERM: Record<
  KarPayiTermKey,
  { maturityCode: string; maturityPeriodValue: number }
> = {
  "1m": {
    maturityCode: "FixedDepositAccount_AYLIK",
    maturityPeriodValue: 31,
  },
  "3m": {
    maturityCode: "FixedDepositAccount_3AYLIK",
    maturityPeriodValue: 91,
  },
  "6m": {
    maturityCode: "FixedDepositAccount_6AYLIK",
    maturityPeriodValue: 181,
  },
  "12m": {
    maturityCode: "KTLMHSP_1YILVADELI",
    maturityPeriodValue: 365,
  },
  "12p": {
    maturityCode: "KTLMHSP_1YILDANUZUNVADELI",
    maturityPeriodValue: 366,
  },
};

function mergeCookies(res: Response, prev = ""): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : String(headers.get("set-cookie") || "")
          .split(/,(?=[^;]+?=)/)
          .filter(Boolean);
  const map = new Map<string, string>();
  for (const c of prev
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)) {
    const eq = c.indexOf("=");
    if (eq > 0) map.set(c.slice(0, eq), c.slice(eq + 1));
  }
  for (const line of raw) {
    const first = line.split(";")[0] ?? "";
    const eq = first.indexOf("=");
    if (eq > 0) map.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

type DunyaJson = {
  result?: string;
  message?: string;
  grossProfitAmount?: number;
  netProfitAmount?: number;
  grossProfitRate?: number;
  netProfitRate?: number;
  productName?: string;
  unitValuePoolDefinition?: string;
};

export async function hesaplaDunyaKarPayi(
  opts: KarPayiHesaplamaOpts,
  fetchImpl: typeof fetch = fetch,
): Promise<KarPayiHesaplamaSonucu> {
  const term = resolveKarPayiTerm(opts.term);
  const maturity = MATURITY_BY_TERM[term.key];

  const home = await fetchKarPayi(
    BASE_URL + "/",
    {
      headers: {
        "User-Agent": KAR_PAYI_BROWSER_UA,
        Accept: "text/html",
      },
    },
    fetchImpl,
  );
  if (!home.ok) {
    throw new Error(`Dünya Katılım oturumu alınamadı (HTTP ${home.status}).`);
  }
  const cookies = mergeCookies(home);
  const html = await home.text();
  const token =
    html.match(
      /name="__RequestVerificationToken"[^>]*value="([^"]+)"/,
    )?.[1] ||
    html.match(
      /value="([^"]+)"[^>]*name="__RequestVerificationToken"/,
    )?.[1];
  if (!token) {
    throw new Error("Dünya Katılım doğrulama jetonu bulunamadı.");
  }

  const body = new URLSearchParams({
    balance: String(Math.round(opts.amount)),
    currencyCode: "TRY",
    maturityCode: maturity.maturityCode,
    maturityPeriodValue: String(maturity.maturityPeriodValue),
    productCode: PRODUCT_CODE,
    __RequestVerificationToken: token,
  });

  const res = await fetchKarPayi(
    `${BASE_URL}${CALC_PATH}`,
    {
      method: "POST",
      headers: {
        "User-Agent": KAR_PAYI_BROWSER_UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: SOURCE_URL,
        Origin: BASE_URL,
        Cookie: cookies,
      },
      body,
    },
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(`Dünya Katılım kâr payı hesabı başarısız (HTTP ${res.status}).`);
  }

  const json = (await res.json()) as DunyaJson;
  if (json.result !== "SUCCESS") {
    throw new Error(
      json.message || "Dünya Katılım bu koşullar için kâr payı hesabı sunmuyor.",
    );
  }

  const grossProfit =
    typeof json.grossProfitAmount === "number" ? json.grossProfitAmount : null;
  const netProfit =
    typeof json.netProfitAmount === "number" ? json.netProfitAmount : null;

  if (grossProfit == null && netProfit == null) {
    throw new Error("Dünya Katılım beklenmeyen yanıt döndürdü.");
  }

  return {
    bankId: "dunya-katilim",
    available: true,
    amount: opts.amount,
    currency: "TRY",
    termKey: term.key,
    termDays: term.days,
    termLabel: term.label,
    accountName: json.unitValuePoolDefinition
      ? `Standart Katılma Hesabı (${json.unitValuePoolDefinition})`
      : "Standart Katılma Hesabı",
    grossProfit,
    netProfit,
    totalAmount: netProfit != null ? opts.amount + netProfit : null,
    grossRatePercent:
      typeof json.grossProfitRate === "number" ? json.grossProfitRate : null,
    netRatePercent:
      typeof json.netProfitRate === "number" ? json.netProfitRate : null,
    withholdingTaxPercent: null,
    shareCustomerPercent: null,
    sourceUrl: SOURCE_URL,
    calculatedAt: new Date().toISOString(),
  };
}
