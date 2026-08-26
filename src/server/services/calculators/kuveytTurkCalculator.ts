/**
 * Kuveyt Türk resmî finansman hesaplama API'si
 * (hesaplama-araclari/finansman-hesaplama — LoanCalculator).
 */

const BASE_URL = "https://www.kuveytturk.com.tr";
const CALC_PATH = "/ck0d84?30134915811C6D92B8F34A01FCF910EE";
const SOURCE_URL = `${BASE_URL}/hesaplama-araclari/finansman-hesaplama`;

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT?.trim() ||
  "KatilimFinansBot/1.0 (+https://github.com/yenererr/katilim_teknofest)";

const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 20_000);

/** Bizim tür → Kuveyt ProductCode (LoanCalculator settings). */
export const KUVEYT_FINANSMAN_KODLARI = {
  ihtiyac_finansmani: {
    code: "SAGLIKFINANSMANI",
    title: "İhtiyaç Finansmanı",
  },
  konut_finansmani: {
    code: "GMENKULKONUTYENI",
    title: "Konut Finansmanı",
  },
  konut_finansmani_ikinci_el: {
    code: "GMENKULKONUTYENI",
    title: "Konut Finansmanı",
  },
  isyeri_finansmani: {
    code: "GMENKULISYERIYENI",
    title: "İş Yeri Finansmanı",
  },
  arsa_finansmani: { code: "GMENKULARSA", title: "Arsa Finansmanı" },
  tasit_finansmani: {
    code: "ARACBINEKYENI",
    title: "Yeni Binek Araç Finansmanı",
  },
  tasit_finansmani_ikinci_el: {
    code: "ARACBINEK2EL",
    title: "2. El Binek Araç Finansmanı",
  },
} as const;

export type KuveytFinansmanTuru = keyof typeof KUVEYT_FINANSMAN_KODLARI;

export type KuveytHesaplamaOpts = {
  financingType: string;
  amountTl: number;
  termMonths: number;
  profitRatePercent?: number | null;
  /** 1 = tutardan, 2 = taksitten — Kuveyt p1 */
  calculateType?: "1" | "2";
};

export type KuveytHesaplamaSonucu = {
  bankId: "kuveyt-turk";
  financingType: string;
  amountTl: number;
  termMonths: number;
  profitRatePercent: number | null;
  monthlyInstallmentTl: number | null;
  totalPaymentTl: number | null;
  appraisementFeeTl: number | null;
  mortgageReleaseFeeTl: number | null;
  allocationFeeTl: number | null;
  sourceUrl: string;
  calculatedAt: string;
};

export class KuveytKisitHatasi extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KuveytKisitHatasi";
  }
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

export function resolveKuveytProduct(
  financingType: string,
): { code: string; title: string } | null {
  if (financingType in KUVEYT_FINANSMAN_KODLARI) {
    return KUVEYT_FINANSMAN_KODLARI[
      financingType as KuveytFinansmanTuru
    ];
  }
  return null;
}

export async function hesaplaKuveytTurk(
  opts: KuveytHesaplamaOpts,
  fetchImpl: typeof fetch = fetch,
): Promise<KuveytHesaplamaSonucu> {
  const product = resolveKuveytProduct(opts.financingType);
  if (!product) {
    throw new KuveytKisitHatasi(
      "Kuveyt Türk bu finansman türü için çevrim içi hesaplama sunmuyor.",
    );
  }

  const useBankRatio =
    opts.profitRatePercent == null ||
    !Number.isFinite(opts.profitRatePercent) ||
    opts.profitRatePercent <= 0;

  const body = {
    i: true,
    p1: opts.calculateType ?? "1",
    p2: Math.round(opts.amountTl),
    p3: opts.termMonths,
    p4: product.code,
    p5: product.code,
    p6: useBankRatio
      ? "0.00"
      : String(opts.profitRatePercent).replace(",", "."),
    p7: "",
    p8: product.title,
  };

  const res = await fetchWithTimeout(
    `${BASE_URL}${CALC_PATH}`,
    {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Bone-Language": "tr",
        Referer: SOURCE_URL,
        Origin: BASE_URL,
      },
      body: JSON.stringify(body),
    },
    fetchImpl,
  );

  if (!res.ok) {
    throw new Error(`Kuveyt Türk hesaplama hatası (HTTP ${res.status}).`);
  }

  const json = (await res.json()) as {
    Meta?: {
      ProfitRate?: number;
      InstallmentPayment?: number;
      TotalAmount?: number;
      SurveyFee?: number;
      HypothecFee?: number;
      AllocationAmount?: number;
      LoanAmount?: number;
    };
    message?: string;
    Message?: string;
  };

  const meta = json.Meta;
  if (!meta) {
    throw new KuveytKisitHatasi(
      json.message ||
        json.Message ||
        "Kuveyt Türk bu koşullar için hesaplama sunmuyor.",
    );
  }

  const oran = Number(meta.ProfitRate);
  const taksit = Number(meta.InstallmentPayment);
  if (!Number.isFinite(oran) || oran <= 0 || !Number.isFinite(taksit)) {
    throw new KuveytKisitHatasi(
      "Kuveyt Türk bu ürün için çevrim içi hesaplama sunmuyor; " +
        "koşulları bankadan teyit etmeniz gerekir.",
    );
  }

  return {
    bankId: "kuveyt-turk",
    financingType: opts.financingType,
    amountTl: opts.amountTl,
    termMonths: opts.termMonths,
    profitRatePercent: oran,
    monthlyInstallmentTl: taksit,
    totalPaymentTl: Number(meta.TotalAmount) || null,
    appraisementFeeTl: Number(meta.SurveyFee) || 0,
    mortgageReleaseFeeTl: Number(meta.HypothecFee) || 0,
    allocationFeeTl: Number(meta.AllocationAmount) || 0,
    sourceUrl: SOURCE_URL,
    calculatedAt: new Date().toISOString(),
  };
}
