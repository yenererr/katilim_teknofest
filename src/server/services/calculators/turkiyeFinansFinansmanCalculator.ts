/**
 * Türkiye Finans resmî ihtiyaç finansmanı ("Finansör") oranları.
 *
 * Uç: GET /_vti_bin/TurkiyeFinansServices/FrontEndService.svc/GetFinansorItems
 * Yanıt, ürün paketlerini ve her paket için vadeye göre aylık kâr payı
 * oranlarını döndürür; ayrıca güncel KKDF/BSMV yüzdeleri de gelir.
 *
 * Konut ve taşıt finansmanı bu uçta yok — banka o oranları yayımlamıyor.
 * Bu yüzden yalnızca ihtiyaç finansmanı desteklenir; diğer türlerde `null`
 * dönülür ve üst katman "doğrulanmış veri yok" der.
 */

import { fetchKarPayi, KAR_PAYI_BROWSER_UA } from "./karPayiShared";

const BASE_URL = "https://www.turkiyefinans.com.tr";
const SERVICE_PATH =
  "/_vti_bin/TurkiyeFinansServices/FrontEndService.svc/GetFinansorItems";
export const TF_FINANSMAN_URL = `${BASE_URL}/tr-tr/hesaplama-araclari/Sayfalar/finansman-odeme-plani.aspx`;

const CACHE_TTL_MS = 30 * 60 * 1000;

export type TfFinansorPaketi = {
  packageId: number | null;
  title: string;
  maxAmountTl: number | null;
  /** Vade (ay) → aylık kâr payı oranı yüzdesi */
  ratesByTerm: Array<{ months: number; ratePercent: number }>;
};

type Cache = { at: number; paketler: TfFinansorPaketi[] };
let cache: Cache | null = null;

function sayi(deger: unknown): number | null {
  const n = typeof deger === "string" ? Number(deger) : deger;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Servis yanıtını paket listesine çevirir. */
export function parseFinansorYaniti(json: unknown): TfFinansorPaketi[] {
  const data = (json as any)?.GetFinansorItemsResult?.Data;
  const liste = data?.FinansorList;
  if (!Array.isArray(liste)) return [];

  const paketler: TfFinansorPaketi[] = [];
  for (const kalem of liste) {
    const oranlar: TfFinansorPaketi["ratesByTerm"] = [];
    for (const r of kalem?.MonthlyRates ?? []) {
      const ay = sayi(r?.Month);
      const oran = sayi(r?.Rate);
      if (ay == null || oran == null || oran <= 0) continue;
      // Servis oranı ondalık veriyor (0.0262); yüzdeye çevrilir.
      // 0.0266 * 100 kayan nokta artığı üretir (2.6599999999999997).
      oranlar.push({ months: ay, ratePercent: Number((oran * 100).toFixed(4)) });
    }
    if (oranlar.length === 0) continue;

    paketler.push({
      packageId: sayi(kalem?.FinansorPackage?.ID),
      title: String(kalem?.FinansorPackage?.Title ?? kalem?.Title ?? "Finansör"),
      maxAmountTl: sayi(kalem?.MaxValue),
      ratesByTerm: oranlar.sort((a, b) => a.months - b.months),
    });
  }
  return paketler;
}

async function paketleriGetir(
  fetchImpl: typeof fetch,
): Promise<TfFinansorPaketi[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.paketler;

  const res = await fetchKarPayi(
    `${BASE_URL}${SERVICE_PATH}`,
    {
      headers: {
        "User-Agent": KAR_PAYI_BROWSER_UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "tr-TR,tr;q=0.9",
      },
    },
    fetchImpl,
  );
  if (!res.ok) throw new Error(`Türkiye Finans Finansör ucu ${res.status}`);

  const paketler = parseFinansorYaniti(await res.json());
  if (paketler.length > 0) cache = { at: Date.now(), paketler };
  return paketler;
}

export type TfFinansmanOrani = {
  bankId: "turkiye-finans";
  financingKey: string;
  profitRatePercent: number;
  productName: string;
  /** Oranın ilan edildiği vade — istenen vade listede yoksa en yakını */
  matchedTermMonths: number;
  maxTermMonths: number;
  maxAmountTl: number | null;
  sourceUrl: string;
  fetchedAt: string;
};

/**
 * İhtiyaç finansmanı için bankanın ilan ettiği aylık oranı döndürür.
 * İstenen vade listede yoksa en yakın vadenin oranı kullanılır ve hangi
 * vadeye ait olduğu `matchedTermMonths` ile bildirilir.
 */
export async function getTurkiyeFinansFinansmanOrani(
  financingKey: string,
  termMonths: number,
  fetchImpl: typeof fetch = fetch,
): Promise<TfFinansmanOrani | null> {
  if (financingKey !== "ihtiyac_finansmani") return null;

  const paketler = await paketleriGetir(fetchImpl);
  // Standart paket genel amaçlıdır; yoksa oranı en düşük paket alınır.
  const standart =
    paketler.find((p) => /standart/i.test(p.title)) ??
    [...paketler].sort(
      (a, b) => a.ratesByTerm[0].ratePercent - b.ratesByTerm[0].ratePercent,
    )[0];
  if (!standart) return null;

  // Eşit uzaklıkta iki vade varsa uzun olan seçilir: uzun vadenin oranı
  // daha yüksek olduğu için maliyeti eksik göstermek yerine ihtiyatlı kalır.
  const enYakin = [...standart.ratesByTerm].sort((a, b) => {
    const fark = Math.abs(a.months - termMonths) - Math.abs(b.months - termMonths);
    return fark !== 0 ? fark : b.months - a.months;
  })[0];

  return {
    bankId: "turkiye-finans",
    financingKey,
    profitRatePercent: enYakin.ratePercent,
    productName: standart.title,
    matchedTermMonths: enYakin.months,
    maxTermMonths: standart.ratesByTerm[standart.ratesByTerm.length - 1].months,
    maxAmountTl: standart.maxAmountTl,
    sourceUrl: TF_FINANSMAN_URL,
    fetchedAt: new Date().toISOString(),
  };
}

/** Testler arasında önbelleği temizler. */
export function resetTfFinansmanCacheForTests(): void {
  cache = null;
}
