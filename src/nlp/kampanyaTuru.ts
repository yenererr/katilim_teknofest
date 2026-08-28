import { asciiKatla } from './normalize';
import type { UrunTuru } from '../types';

/**
 * Şartname 5.4 — Kampanya Türünün Belirlenmesi.
 *
 * Şartnamedeki sekiz tür birebir karşılanır. Projede ayrıca `ContentCategory`
 * (scraper kategorisi) ve `CampaignTheme` (vitrin etiketi) enumları var; onlar
 * arayüz ve filtreleme için, bu alan ise şartname çıktısı için kullanılır.
 * Üçünü tek enuma indirmek yerine bu alan türetilmiş tek kaynak olarak durur.
 */
export type KampanyaTuru =
  | 'finansman_kampanyasi'
  | 'ihtiyac_finansmani_kampanyasi'
  | 'konut_finansmani_kampanyasi'
  | 'tasit_finansmani_kampanyasi'
  | 'kart_kampanyasi'
  | 'alisveris_puani_kampanyasi'
  | 'yeni_musteri_kampanyasi'
  | 'yatirim_urunu_kampanyasi';

export const KAMPANYA_TURU_ETIKET: Record<KampanyaTuru, string> = {
  finansman_kampanyasi: 'Finansman Kampanyası',
  ihtiyac_finansmani_kampanyasi: 'İhtiyaç Finansmanı Kampanyası',
  konut_finansmani_kampanyasi: 'Konut Finansmanı Kampanyası',
  tasit_finansmani_kampanyasi: 'Taşıt Finansmanı Kampanyası',
  kart_kampanyasi: 'Kart Kampanyası',
  alisveris_puani_kampanyasi: 'Alışveriş Puanı Kampanyası',
  yeni_musteri_kampanyasi: 'Yeni Müşteri Kampanyası',
  yatirim_urunu_kampanyasi: 'Yatırım Ürünü Kampanyası',
};

/**
 * Sınıflandırma sırası. Bir metin birden çok sinyal taşıyabilir
 * ("yeni müşterilere özel konut finansmanı"); ürün türü en ayırt edici
 * bilgi olduğu için önce o denenir, hedef kitle sinyali `targetSegments`
 * alanında ayrıca tutulduğu için burada kaybolmaz.
 */
const DESENLER: Array<{ tur: KampanyaTuru; desen: RegExp }> = [
  {
    tur: 'konut_finansmani_kampanyasi',
    desen: /(konut\s*finansman|konut\s*kredi|mortgage|ev\s*sahibi|gayrimenkul\s*finansman|yeni\s*ev)/,
  },
  {
    tur: 'tasit_finansmani_kampanyasi',
    desen: /(tasit\s*finansman|tasit\s*kredi|arac\s*finansman|otomobil\s*finansman|sifir\s*km|ikinci\s*el\s*arac)/,
  },
  {
    tur: 'yatirim_urunu_kampanyasi',
    desen:
      /(katilma\s*hesab|yatirim\s*(hesab|urun|fonu)|altin\s*(hesab|birikim)|kiymetli\s*maden|birikim\s*hesab|kar\s*payi\s*getiri|doviz\s*hesab)/,
  },
  {
    // Sadakat para birimi veya nakit iade geçen kampanya alışveriş puanı
    // kampanyasıdır; bunlar kartla yapılsa da ödül alışverişe bağlıdır.
    tur: 'alisveris_puani_kampanyasi',
    desen:
      /(alisveris\s*puani|parafpara|paraf\s*para|worldpuan|chip\s*para|maximil|bonus\s*(?:puan|kazan)|(?:puan|mil)\s*(?:kazan|hediye|verilecek)|nakit\s*iade|iade\s*kazan)/,
  },
  {
    tur: 'kart_kampanyasi',
    desen: /(kredi\s*karti|banka\s*karti|kart\s*kampanya|kartiniz|temassiz\s*odeme|kart\s*sahip)/,
  },
  {
    tur: 'ihtiyac_finansmani_kampanyasi',
    desen: /(ihtiyac\s*finansman|ihtiyac\s*kredi|tuketici\s*finansman|bireysel\s*finansman)/,
  },
  {
    tur: 'yeni_musteri_kampanyasi',
    desen: /(yeni\s*musteri|musterimiz\s*olmayan|ilk\s*kez\s*musteri|hos\s*geldin)/,
  },
];

/** Metnin genel bir finansman kampanyası olduğuna dair asgari sinyal. */
const FINANSMAN_SINYALI = /(finansman|kar\s*pay|vade|taksit|tahsis\s*ucret|dosya\s*masraf)/;

export type KampanyaTuruSonucu = {
  tur: KampanyaTuru | null;
  /** Eşleşen ifade — jüriye sınıflandırmanın gerekçesi gösterilebilsin diye */
  kanit: string | null;
};

/**
 * Kampanya türünü metin, başlık ve URL'den belirler. Hiçbir tür sinyali
 * yoksa `null` döner — kampanya olmayan sayfaya tür atanmaz.
 */
/**
 * Ürün listesi sayfalarını ayırmak için: konut, taşıt, ihtiyaç ve işyeri
 * finansmanının birlikte anıldığı sayfa tek bir ürünün kampanyası değil,
 * bankanın finansman kataloğudur. En baştaki eşleşmeye bakan sınıflandırıcı
 * böyle bir sayfayı yanlışlıkla "konut finansmanı kampanyası" sayardı.
 */
const URUN_AILELERI = [
  /konut\s*(finansman|kredi)/,
  /tasit\s*(finansman|kredi)/,
  /ihtiyac\s*(finansman|kredi)/,
  /(isyeri|ticari|kobi)\s*finansman/,
];

function urunKatalogMu(katlanmis: string): boolean {
  return URUN_AILELERI.filter((d) => d.test(katlanmis)).length >= 4;
}

export function kampanyaTuruBelirle(opts: {
  metin?: string | null;
  baslik?: string | null;
  url?: string | null;
}): KampanyaTuruSonucu {
  // Başlık ve URL kısa ve yüksek sinyalli; metnin başına eklenerek
  // gövdedeki dipnotların başlığı bastırması engellenir.
  const katlanmis = asciiKatla(
    [opts.baslik ?? '', opts.url ?? '', opts.metin ?? ''].join(' \n '),
  );

  if (urunKatalogMu(katlanmis)) {
    return { tur: 'finansman_kampanyasi', kanit: 'finansman ürün kataloğu' };
  }

  for (const { tur, desen } of DESENLER) {
    const eslesme = katlanmis.match(desen);
    if (eslesme) return { tur, kanit: eslesme[0] };
  }

  const genel = katlanmis.match(FINANSMAN_SINYALI);
  if (genel) return { tur: 'finansman_kampanyasi', kanit: genel[0] };

  return { tur: null, kanit: null };
}

/** Şartname kampanya türünü karşılaştırma katmanının `UrunTuru` koduna çevirir. */
export function kampanyaTurundenUrunTuru(tur: KampanyaTuru | null): UrunTuru | null {
  switch (tur) {
    case 'konut_finansmani_kampanyasi':
      return 'konut_finansmani';
    case 'tasit_finansmani_kampanyasi':
      return 'tasit_finansmani';
    case 'ihtiyac_finansmani_kampanyasi':
      return 'ihtiyac_finansmani';
    case 'kart_kampanyasi':
      return 'kart';
    case 'alisveris_puani_kampanyasi':
      return 'alisveris_puani';
    case 'yatirim_urunu_kampanyasi':
      return 'yatirim';
    default:
      return null;
  }
}
