/**
 * Ziraat Katılım resmî finansman hesaplama (Drupal AJAX).
 * Uç: /ajax/finansmanhesapla — Softtech tarzı anüite + KKDF/BSMV.
 */

const BASE_URL = "https://www.ziraatkatilim.com.tr";
const CALC_PATH = "/ajax/finansmanhesapla";
const VADE_PATH = "/ajax/get-vade";

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT?.trim() ||
  "KatilimFinansBot/1.0 (+https://github.com/yenererr/katilim_teknofest)";

const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 20_000);

/** Bizim ürün anahtarları → Ziraat eid (ürün seçenekleri). */
export const ZIRAAT_FINANSMAN_EID = {
  arsa_finansmani: "20539018",
  isyeri_finansmani: "20539017",
  konut_finansmani: "25961206",
  konut_finansmani_ikinci_el: "25961206",
  ihtiyac_finansmani: "64356288", // 1–24 ay varsayılan
  tasit_finansmani: "64445628", // 1–36 ay
  tasit_finansmani_ikinci_el: "64445628",
} as const;

export type ZiraatFinansmanTuru = keyof typeof ZIRAAT_FINANSMAN_EID;

export type ZiraatHesaplamaOpts = {
  financingType: ZiraatFinansmanTuru;
  amountTl: number;
  termMonths: number;
  /** Boş = banka oranı; dolu = kullanıcı oranı (yüzde) */
  profitRatePercent?: number | null;
};

export type ZiraatHesaplamaSonucu = {
  bankId: "ziraat-katilim";
  financingType: ZiraatFinansmanTuru;
  amountTl: number;
  termMonths: number;
  profitRatePercent: number | null;
  monthlyInstallmentTl: number | null;
  totalPaymentTl: number | null;
  appraisementFeeTl: number | null;
  mortgageReleaseFeeTl: number | null;
  sourceUrl: string;
  calculatedAt: string;
};

export class ZiraatKisitHatasi extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZiraatKisitHatasi";
  }
}

function parseTrNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const cleaned = s
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ziraat get-vade `ratio` alanı çoğu zaman yüzde×100 tamsayıdır (499 → %4,99).
 * Zaten yüzde ise (3.49, 4.99) olduğu gibi bırakılır.
 */
export function normalizeZiraatRatioPercent(
  raw: number | null | undefined,
): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  // Aylık kâr payı için makul üst sınır ~%25; üstü API ölçeği
  if (raw > 25) {
    return Math.round((raw / 100) * 10_000) / 10_000;
  }
  return raw;
}

export { parseTrNumber as parseZiraatTrNumber };

function pickEid(
  financingType: ZiraatFinansmanTuru,
  termMonths: number,
  amountTl?: number,
): string {
  if (financingType === "ihtiyac_finansmani") {
    // 1–24 ay paketi ~250 bin TL üstünü kabul etmiyor; yüksek tutarda 1–36 paketi.
    if (amountTl != null && amountTl > 249_999 && termMonths <= 36) {
      return "64356287";
    }
    if (termMonths <= 12) return "64356289";
    if (termMonths <= 24) return "64356288";
    return "64356287"; // 1–36
  }
  if (
    financingType === "tasit_finansmani" ||
    financingType === "tasit_finansmani_ikinci_el"
  ) {
    if (termMonths <= 12) return "59244341";
    if (termMonths <= 24) return "65492134";
    if (termMonths <= 36) return "64445628";
    return "64445629"; // 1–48
  }
  return ZIRAAT_FINANSMAN_EID[financingType];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function extractOzetFromHtml(html: string): {
  amountTl: number | null;
  installmentTl: number | null;
  termMonths: number | null;
  profitRatePercent: number | null;
  totalPaymentTl: number | null;
} {
  // Özet satırı: tutar | taksit | vade | oran | toplam — HTML içinden metin
  const text = html
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

  const oran = text.match(/%\s*([\d.,]+)/);
  const tryMatch =
    text.match(
      /([\d.]+,\d{2})\s*TRY\s+([\d.]+,\d{2})\s*TRY\s+(\d+)\s*Ay\s+%\s*([\d.,]+)\s+([\d.]+,\d{2})\s*TRY/i,
    ) ||
    text.match(
      /([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(\d+)\s*Ay\s+%\s*([\d.,]+)\s+([\d.]+,\d{2})/i,
    );

  if (tryMatch) {
    return {
      amountTl: parseTrNumber(tryMatch[1]),
      installmentTl: parseTrNumber(tryMatch[2]),
      termMonths: Number(tryMatch[3]) || null,
      profitRatePercent: normalizeZiraatRatioPercent(parseTrNumber(tryMatch[4])),
      totalPaymentTl: parseTrNumber(tryMatch[5]),
    };
  }

  return {
    amountTl: null,
    installmentTl: null,
    termMonths: null,
    profitRatePercent: oran
      ? normalizeZiraatRatioPercent(parseTrNumber(oran[1]))
      : null,
    totalPaymentTl: null,
  };
}

/** Ürün için bankanın ilan ettiği oran ve vade aralığı. */
export async function getZiraatUrunMeta(
  financingType: ZiraatFinansmanTuru,
  termMonths: number,
  fetchImpl: typeof fetch = fetch,
  amountTl?: number,
): Promise<{ ratio: number | null; minAmount: number | null; maxAmount: number | null; range: number[] }> {
  const eid = pickEid(financingType, termMonths, amountTl);
  const res = await fetchWithTimeout(
    `${BASE_URL}${VADE_PATH}`,
    {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE_URL}/bireysel/finansman-urunleri/ihtiyac-finansmani`,
      },
      body: new URLSearchParams({ eid }),
    },
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(`Ziraat Katılım vade sorgusu başarısız (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as {
    status?: boolean;
    data?: {
      ratio?: string;
      minimum_amount?: string | number;
      maximum_amount?: string | number;
      range?: number[];
    };
  };
  const d = json.data || {};
  return {
    ratio: normalizeZiraatRatioPercent(
      parseTrNumber(d.ratio != null ? String(d.ratio) : null),
    ),
    minAmount:
      d.minimum_amount != null ? Number(String(d.minimum_amount).replace(",", ".")) : null,
    maxAmount:
      d.maximum_amount != null ? Number(String(d.maximum_amount).replace(",", ".")) : null,
    range: Array.isArray(d.range) ? d.range.map(Number).filter((n) => n > 0) : [],
  };
}

export async function hesaplaZiraatKatilim(
  opts: ZiraatHesaplamaOpts,
  fetchImpl: typeof fetch = fetch,
): Promise<ZiraatHesaplamaSonucu> {
  const eid = pickEid(opts.financingType, opts.termMonths, opts.amountTl);
  const useBankRatio =
    opts.profitRatePercent == null ||
    !Number.isFinite(opts.profitRatePercent) ||
    opts.profitRatePercent <= 0;

  // Vade / tutar kısıtı
  try {
    const meta = await getZiraatUrunMeta(
      opts.financingType,
      opts.termMonths,
      fetchImpl,
      opts.amountTl,
    );
    if (meta.range.length > 0 && !meta.range.includes(opts.termMonths)) {
      throw new ZiraatKisitHatasi(
        `Ziraat Katılım bu ürün için ${opts.termMonths} ay vade sunmuyor.`,
      );
    }
    if (meta.maxAmount != null && opts.amountTl > meta.maxAmount) {
      throw new ZiraatKisitHatasi(
        `Ziraat Katılım bu ürün için üst limit ${meta.maxAmount.toLocaleString("tr-TR")} TL.`,
      );
    }
    if (meta.minAmount != null && opts.amountTl < meta.minAmount) {
      throw new ZiraatKisitHatasi(
        `Ziraat Katılım bu ürün için alt limit ${meta.minAmount.toLocaleString("tr-TR")} TL.`,
      );
    }
  } catch (err) {
    if (err instanceof ZiraatKisitHatasi) throw err;
    // Meta alınamazsa hesaplamaya devam
  }

  const res = await fetchWithTimeout(
    `${BASE_URL}${CALC_PATH}`,
    {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE_URL}/bireysel/finansman-urunleri/ihtiyac-finansmani`,
      },
      body: new URLSearchParams({
        lang: "tr",
        finansman_is_bank_ratio: useBankRatio ? "true" : "false",
        finans_type: eid,
        finans_kar_orani: useBankRatio
          ? "0"
          : String(opts.profitRatePercent),
        finans_vade: String(opts.termMonths),
        finans_tutari: String(Math.round(opts.amountTl)),
      }),
    },
    fetchImpl,
  );

  if (!res.ok) {
    throw new Error(`Ziraat Katılım hesaplama hatası (HTTP ${res.status}).`);
  }

  const commands = (await res.json()) as Array<{
    command?: string;
    selector?: string;
    data?: string;
  }>;

  const insert = commands.find(
    (c) => c.command === "insert" && c.selector === "#odeme-plani" && c.data,
  );
  if (!insert?.data || insert.data.length < 50) {
    throw new ZiraatKisitHatasi(
      "Ziraat Katılım bu koşullar için hesaplama sunmuyor.",
    );
  }

  const ozet = extractOzetFromHtml(insert.data);
  if (ozet.installmentTl == null && ozet.profitRatePercent == null) {
    throw new ZiraatKisitHatasi(
      "Ziraat Katılım bu ürün için çevrim içi hesaplama sunmuyor.",
    );
  }

  return {
    bankId: "ziraat-katilim",
    financingType: opts.financingType,
    amountTl: opts.amountTl,
    termMonths: opts.termMonths,
    profitRatePercent: ozet.profitRatePercent,
    monthlyInstallmentTl: ozet.installmentTl,
    totalPaymentTl: ozet.totalPaymentTl,
    appraisementFeeTl: null,
    mortgageReleaseFeeTl: null,
    sourceUrl: `${BASE_URL}/bireysel/finansman-urunleri`,
    calculatedAt: new Date().toISOString(),
  };
}
