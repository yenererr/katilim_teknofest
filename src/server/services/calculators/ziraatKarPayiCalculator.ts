/**
 * Ziraat Katılım resmî kâr payı hesaplama (anasayfa aracı).
 * Uç: POST /ajax/karpayi-products?_wrapper_format=drupal_ajax
 */

import {
  fetchKarPayi,
  KAR_PAYI_BROWSER_UA,
  parseKarPayiNumber,
  resolveKarPayiTerm,
  type KarPayiHesaplamaOpts,
  type KarPayiHesaplamaSonucu,
  type KarPayiTermKey,
} from "./karPayiShared";

const BASE_URL = "https://www.ziraatkatilim.com.tr";
const SOURCE_URL = `${BASE_URL}/#tab-kar-payi-content`;
const CALC_PATH = "/ajax/karpayi-products?_wrapper_format=drupal_ajax";

/** Bizim vade anahtarı → Ziraat maturity_type option value */
const MATURITY_BY_TERM: Record<KarPayiTermKey, string> = {
  "1m": "2",
  "3m": "8",
  "6m": "11",
  "12m": "5",
  "12p": "5", // 1 yıl vadeli (esnek için ayrı gün alanı gerekir)
};

type DrupalAjaxCmd = {
  command?: string;
  selector?: string;
  data?: string;
  method?: string;
};

function pickInsert(
  cmds: DrupalAjaxCmd[],
  selector: string,
): string | null {
  const hit = cmds.find(
    (c) => c.command === "insert" && c.selector === selector && c.data != null,
  );
  return hit?.data != null ? String(hit.data) : null;
}

export async function hesaplaZiraatKarPayi(
  opts: KarPayiHesaplamaOpts,
  fetchImpl: typeof fetch = fetch,
): Promise<KarPayiHesaplamaSonucu> {
  const term = resolveKarPayiTerm(opts.term);
  const body = new URLSearchParams({
    karpayi_hesap_type: "5", // Katılma Hesabı
    karpayi_hesap_currency: "TRY",
    karpayi_hesap_anapara: String(Math.round(opts.amount)),
    karpayi_hesap_vade: "",
    karpayi_maturity_type: MATURITY_BY_TERM[term.key],
    _drupal_ajax: "1",
    "ajax_page_state[theme]": "zk",
    "ajax_page_state[theme_token]": "",
    "ajax_page_state[libraries]": "",
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
        Referer: `${BASE_URL}/`,
        Origin: BASE_URL,
      },
      body,
    },
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(
      `Ziraat Katılım kâr payı hesabı başarısız (HTTP ${res.status}).`,
    );
  }

  const cmds = (await res.json()) as DrupalAjaxCmd[];
  if (!Array.isArray(cmds)) {
    throw new Error("Ziraat Katılım beklenmeyen yanıt döndürdü.");
  }

  const netProfit = parseKarPayiNumber(pickInsert(cmds, ".kar-payi-net-gelir"));
  const grossProfit = parseKarPayiNumber(
    pickInsert(cmds, ".kar-payi-brut-gelir"),
  );
  const netRatePercent = parseKarPayiNumber(
    pickInsert(cmds, ".kar-payi-net-oran"),
  );
  const grossRatePercent = parseKarPayiNumber(
    pickInsert(cmds, ".kar-payi-brut-oran"),
  );

  if (netProfit == null && grossProfit == null) {
    throw new Error(
      "Ziraat Katılım bu koşullar için kâr payı hesabı sunmuyor.",
    );
  }

  return {
    bankId: "ziraat-katilim",
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
    grossRatePercent,
    netRatePercent,
    withholdingTaxPercent: null,
    shareCustomerPercent: null,
    sourceUrl: SOURCE_URL,
    calculatedAt: new Date().toISOString(),
  };
}
