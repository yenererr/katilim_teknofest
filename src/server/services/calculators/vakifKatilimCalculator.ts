/**
 * Vakıf Katılım resmî finansman hesaplama servisi.
 *
 * Bankanın kendi sitesindeki hesaplama aracı (vakifkatilim.com.tr ana sayfa)
 * `/plugins/FinancingComputationExecute` ucunu çağırıyor. Uç, antiforgery
 * token'ı ve oturum çerezi istediği için önce ana sayfa çekilip oturum
 * kuruluyor; token/çerez ikilisi bir süre önbellekte tutuluyor.
 *
 * Dönen değerler bankanın ilan ettiği güncel oranlardır; burada kendi
 * hesaplamamızı yapmıyoruz.
 */

const BASE_URL = "https://www.vakifkatilim.com.tr";
const HOME_PATH = "/tr";
const CALC_PATH = "/plugins/FinancingComputationExecute";
const INSTALLMENTS_PATH = "/plugins/FinancingInstallment";

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT?.trim() ||
  "KatilimFinansBot/1.0 (+https://github.com/yenererr/katilim_teknofest)";

/** Oturum ömrü — token süresi dolduğunda yeniden kurulur. */
const SESSION_TTL_MS = 20 * 60 * 1000;
const REQUEST_TIMEOUT_MS = Number(process.env.SCRAPER_TIMEOUT_MS || 20_000);

/** Bizim ürün türlerimiz -> bankanın finansman kodu */
export const VAKIF_FINANSMAN_KODLARI = {
  ihtiyac_finansmani: "IF",
  konut_finansmani: "K",
  konut_finansmani_ikinci_el: "K2",
  tasit_finansmani: "BO",
  tasit_finansmani_ikinci_el: "BO2",
  isyeri_finansmani: "I",
  arsa_finansmani: "A",
} as const;

export type VakifFinansmanTuru = keyof typeof VAKIF_FINANSMAN_KODLARI;

export type VakifHesaplamaSonucu = {
  bankId: "vakif-katilim";
  financingType: VakifFinansmanTuru;
  amountTl: number;
  termMonths: number;
  /** Aylık kâr payı oranı, yüzde olarak (3.99 = %3,99) */
  profitRatePercent: number | null;
  monthlyInstallmentTl: number | null;
  totalPaymentTl: number | null;
  appraisementFeeTl: number | null;
  mortgageReleaseFeeTl: number | null;
  installmentLabel: string | null;
  sourceUrl: string;
  calculatedAt: string;
};

/** Bankanın kendi kurallarından gelen kısıt (limit, vade vb.) — arıza değil. */
export class VakifKisitHatasi extends Error {
  readonly kisit = true;
}

type Session = { token: string; langId: string; cookie: string; at: number };

let session: Session | null = null;

/** "8.680,05 TL" -> 8680.05 | "3,99" -> 3.99 | boş -> null */
export function parseTrNumber(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const temiz = raw.replace(/[^\d.,-]/g, "").trim();
  if (!temiz) return null;
  const n = Number(temiz.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function cookieHeaderFrom(res: Response): string {
  // Node fetch tek satırda birleştirilmiş Set-Cookie döndürebilir;
  // yalnızca ad=değer çiftleri korunur.
  const raw =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie ===
    "function"
      ? (res.headers as { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie") || ""];

  return raw
    .filter(Boolean)
    .map((c) => c.split(";")[0].trim())
    .filter((c) => c.includes("="))
    .join("; ");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureSession(
  fetchImpl: typeof fetch = fetch,
  force = false,
): Promise<Session> {
  if (!force && session && Date.now() - session.at < SESSION_TTL_MS) {
    return session;
  }

  const res = await fetchWithTimeout(
    `${BASE_URL}${HOME_PATH}`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "tr-TR,tr;q=0.9",
      },
    },
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(`Vakıf Katılım oturumu kurulamadı (HTTP ${res.status}).`);
  }

  const html = await res.text();
  const token = html.match(
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/,
  )?.[1];
  const langId = html.match(/langId:\s*'([^']+)'/)?.[1];

  if (!token || !langId) {
    throw new Error(
      "Vakıf Katılım sayfasında doğrulama token'ı bulunamadı; sayfa yapısı değişmiş olabilir.",
    );
  }

  session = { token, langId, cookie: cookieHeaderFrom(res), at: Date.now() };
  return session;
}

async function postPlugin(
  path: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
  retry = true,
): Promise<Record<string, unknown>> {
  const s = await ensureSession(fetchImpl);
  const url = `${BASE_URL}${path}?${new URLSearchParams({
    langId: s.langId,
    language: "tr",
    ...params,
  })}`;

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: `${BASE_URL}${HOME_PATH}`,
        ...(s.cookie ? { Cookie: s.cookie } : {}),
      },
      body: new URLSearchParams({ __RequestVerificationToken: s.token }),
    },
    fetchImpl,
  );

  if (res.status === 400 || res.status === 403) {
    // Token süresi dolmuş olabilir — bir kez yeni oturumla denenir.
    if (retry) {
      await ensureSession(fetchImpl, true);
      return postPlugin(path, params, fetchImpl, false);
    }
    throw new Error(`Vakıf Katılım isteği reddedildi (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(`Vakıf Katılım hesaplama hatası (HTTP ${res.status}).`);
  }

  return (await res.json()) as Record<string, unknown>;
}

/** Bir finansman türü için bankanın sunduğu vade seçenekleri (ay). */
export async function getVakifVadeSecenekleri(
  financingType: VakifFinansmanTuru,
  fetchImpl: typeof fetch = fetch,
): Promise<number[]> {
  const json = await postPlugin(
    INSTALLMENTS_PATH,
    { financingType: VAKIF_FINANSMAN_KODLARI[financingType] },
    fetchImpl,
  );
  const list = (json.installments as Array<{ code?: number }> | undefined) || [];
  return list
    .map((i) => Number(i.code))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * Bankanın kendi hesaplama aracıyla aynı sonucu döndürür.
 * Oran alanı boş bırakılır; banka güncel ilan ettiği oranı uygular.
 */
export async function hesaplaVakifKatilim(
  opts: {
    financingType: VakifFinansmanTuru;
    amountTl: number;
    termMonths: number;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<VakifHesaplamaSonucu> {
  const json = await postPlugin(
    CALC_PATH,
    {
      financingType: VAKIF_FINANSMAN_KODLARI[opts.financingType],
      amount: String(Math.round(opts.amountTl)),
      numberOfInstallments: String(opts.termMonths),
      profitRate: "",
      calculateType: "1",
    },
    fetchImpl,
  );

  if (json.isErrorFriendly === true || json.errorMessage) {
    // Banka tarafından gelen açıklayıcı kısıt mesajı (ör. tutar üst sınırı).
    // Bu bir arıza değil; kullanıcıya olduğu gibi gösterilir.
    throw new VakifKisitHatasi(
      String(json.errorMessage || "Vakıf Katılım bu koşullar için hesaplama sunmuyor.")
        .trim(),
    );
  }

  const oran = parseTrNumber(json.profitRate);
  const taksit = parseTrNumber(json.installmentAmount);

  // Banka bazı ürünlerde hata döndürmeden boş alanlarla yanıt veriyor
  // (ör. taşıt 2. el, arsa). Bu durumda satır sessizce kaybolmasın:
  // kullanıcıya bu ürün için hesaplama sunulmadığı söylenir.
  if (oran == null && taksit == null) {
    throw new VakifKisitHatasi(
      "Vakıf Katılım bu ürün için çevrim içi hesaplama sunmuyor; " +
        "koşulları bankadan teyit etmeniz gerekir.",
    );
  }

  return {
    bankId: "vakif-katilim",
    financingType: opts.financingType,
    amountTl: opts.amountTl,
    termMonths: opts.termMonths,
    profitRatePercent: oran,
    monthlyInstallmentTl: taksit,
    totalPaymentTl: parseTrNumber(json.totalAmount),
    appraisementFeeTl: parseTrNumber(json.appraisementFee),
    mortgageReleaseFeeTl: parseTrNumber(json.mortgageReleaseFee),
    installmentLabel:
      typeof json.installmenLabelText === "string"
        ? json.installmenLabelText
        : null,
    sourceUrl: `${BASE_URL}${HOME_PATH}`,
    calculatedAt: new Date().toISOString(),
  };
}

/** Testler için oturum önbelleğini sıfırlar. */
export function resetVakifSessionForTests(): void {
  session = null;
}
