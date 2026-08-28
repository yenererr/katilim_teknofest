/**
 * Albaraka Türk resmî finansman oranları.
 *
 * Banka, hesaplama aracındaki ürün listesini sayfanın kendi HTML'ine
 * `<option value='{...}'>` içinde JSON olarak gömüyor; oran, vade ve tutar
 * sınırları bu JSON'da bulunuyor. Bu yüzden ayrı bir hesaplama ucu çağırmaya
 * gerek yok — sayfa çekilip ilan edilen oran okunuyor.
 *
 * Taksit hesabı burada yapılmaz: oran, çağıran katmandaki Softtech uyumlu
 * ödeme planı motoruna verilir.
 */

import {
  fetchKarPayi,
  KAR_PAYI_BROWSER_UA,
} from "./karPayiShared";

const BASE_URL = "https://www.albaraka.com.tr";
export const ALBARAKA_FINANSMAN_URL = `${BASE_URL}/tr/hesaplama-araclari/finansman-hesaplama`;

/** Sayfadaki oran listesi sık değişmez; her soruda yeniden çekmemek için. */
const CACHE_TTL_MS = 30 * 60 * 1000;

export type AlbarakaFinansmanUrunu = {
  /** Bankanın ürün kodu: KONTKRD, TASKRED, IHTKRED, ARSAKRD */
  productCode: string;
  campaignName: string;
  /** Aylık kâr payı oranı, yüzde (3.04 = %3,04) */
  profitRatePercent: number;
  minTermMonths: number;
  maxTermMonths: number;
  maxAmountTl: number;
};

type Cache = { at: number; urunler: AlbarakaFinansmanUrunu[] };
let cache: Cache | null = null;

/** Bizim finansman anahtarımız → Albaraka ürün kodu */
const KOD_ESLEME: Record<string, string> = {
  konut_finansmani: "KONTKRD",
  konut_finansmani_ikinci_el: "KONTKRD",
  tasit_finansmani: "TASKRED",
  tasit_finansmani_ikinci_el: "TASKRED",
  ihtiyac_finansmani: "IHTKRED",
  isyeri_finansmani: "ARSAKRD",
  arsa_finansmani: "ARSAKRD",
};

export function albarakaDestekliMi(financingKey: string): boolean {
  return financingKey in KOD_ESLEME;
}

/** HTML öznitelik değerindeki varlık kaçışlarını çözer. */
function cozEntity(ham: string): string {
  return ham
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sayi(deger: unknown): number | null {
  const n = typeof deger === "string" ? Number(deger) : deger;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Sayfadaki ürün seçim kutusunu ayrıştırır. */
export function parseAlbarakaFinansmanUrunleri(
  html: string,
): AlbarakaFinansmanUrunu[] {
  const basla = html.indexOf("slcfinansmanTuru");
  if (basla < 0) return [];
  const bitis = html.indexOf("</select>", basla);
  const blok = html.slice(basla, bitis < 0 ? undefined : bitis);

  const urunler: AlbarakaFinansmanUrunu[] = [];
  for (const m of blok.matchAll(/value='([^']*)'/g)) {
    let veri: Record<string, unknown>;
    try {
      veri = JSON.parse(cozEntity(m[1])) as Record<string, unknown>;
    } catch {
      continue;
    }

    const oran = sayi(veri.profitRate);
    const kod = veri.ProductCode;
    // Oranı sıfır/boş gelen ürün karşılaştırmaya girmez.
    if (typeof kod !== "string" || oran == null || oran <= 0) continue;

    urunler.push({
      productCode: kod,
      campaignName: String(veri.CampaignName ?? "").trim(),
      profitRatePercent: oran,
      minTermMonths: Math.max(1, sayi(veri.MaturityMinValue) ?? 1),
      maxTermMonths: sayi(veri.MaturityMaxValue) ?? 0,
      maxAmountTl: sayi(veri.AmountMaxValue) ?? 0,
    });
  }
  return urunler;
}

async function urunleriGetir(
  fetchImpl: typeof fetch,
): Promise<AlbarakaFinansmanUrunu[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.urunler;

  const res = await fetchKarPayi(
    ALBARAKA_FINANSMAN_URL,
    {
      // Bankanın WAF'ı eksik başlıklı isteği reddediyor; tarayıcının
      // gönderdiği başlık kümesinin tamamı verilmezse gövde yerine
      // "Request Rejected" sayfası dönüyor.
      headers: {
        "User-Agent": KAR_PAYI_BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
    },
    fetchImpl,
  );
  if (!res.ok) {
    throw new Error(`Albaraka finansman sayfası ${res.status}`);
  }

  const html = await res.text();
  const urunler = parseAlbarakaFinansmanUrunleri(html);
  if (urunler.length === 0) {
    // WAF reddi HTTP 200 ile geldiği için durum kodundan anlaşılmıyor;
    // sessizce "oran yok" demek yerine hata olarak bildirilir.
    if (/Request Rejected/i.test(html)) {
      throw new Error("Albaraka finansman sayfası WAF tarafından reddedildi");
    }
    return [];
  }

  cache = { at: Date.now(), urunler };
  return urunler;
}

export type AlbarakaFinansmanOrani = {
  bankId: "albaraka";
  financingKey: string;
  profitRatePercent: number;
  productName: string;
  maxTermMonths: number;
  maxAmountTl: number;
  sourceUrl: string;
  fetchedAt: string;
};

/**
 * Verilen finansman türü ve vade için bankanın ilan ettiği oranı döndürür.
 * Aynı ürün kodunda birden çok kampanya varsa istenen vadeyi kapsayan ve
 * oranı en düşük olan seçilir — kullanıcı lehine olan ilan oranıdır.
 */
export async function getAlbarakaFinansmanOrani(
  financingKey: string,
  termMonths: number,
  amountTl?: number | null,
  fetchImpl: typeof fetch = fetch,
): Promise<AlbarakaFinansmanOrani | null> {
  const kod = KOD_ESLEME[financingKey];
  if (!kod) return null;

  const urunler = (await urunleriGetir(fetchImpl)).filter(
    (u) => u.productCode === kod,
  );
  if (urunler.length === 0) return null;

  const uygun = urunler.filter((u) => {
    if (termMonths < u.minTermMonths || termMonths > u.maxTermMonths) return false;
    // Tutar sınırını aşan ürünün oranı bu talep için geçerli değil.
    if (amountTl != null && u.maxAmountTl > 0 && amountTl > u.maxAmountTl) {
      return false;
    }
    return true;
  });
  // Hiçbir ürün talebe uymuyorsa ürün ailesinin geneli referans alınır;
  // oran aynı ailede vadeye göre değişmiyor.
  const havuz = uygun.length > 0 ? uygun : urunler;
  const secili = [...havuz].sort(
    (a, b) => a.profitRatePercent - b.profitRatePercent,
  )[0];

  return {
    bankId: "albaraka",
    financingKey,
    profitRatePercent: secili.profitRatePercent,
    productName: secili.campaignName,
    maxTermMonths: Math.max(...urunler.map((u) => u.maxTermMonths)),
    maxAmountTl: secili.maxAmountTl,
    sourceUrl: ALBARAKA_FINANSMAN_URL,
    fetchedAt: new Date().toISOString(),
  };
}

/** Testler arasında önbelleği temizler. */
export function resetAlbarakaFinansmanCacheForTests(): void {
  cache = null;
}
