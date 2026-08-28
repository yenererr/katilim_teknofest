import { asciiKatla } from './normalize';

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
    tur: 'alisveris_puani_kampanyasi',
    desen: /(alisveris\s*puani|puan\s*kazan|mil\s*kazan|bonus\s*puan|chip\s*para|puan\s*hediye)/,
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

  for (const { tur, desen } of DESENLER) {
    const eslesme = katlanmis.match(desen);
    if (eslesme) return { tur, kanit: eslesme[0] };
  }

  const genel = katlanmis.match(FINANSMAN_SINYALI);
  if (genel) return { tur: 'finansman_kampanyasi', kanit: genel[0] };

  return { tur: null, kanit: null };
}
