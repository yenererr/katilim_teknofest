import { UrunTuru } from '../types';

/**
 * Katılım bankaları vitrin / katalog sabitleri.
 * Oran ve kampanya listeleri canlı scrape / banka hesaplama API’sinden gelir;
 * burada uydurma teklif veya kampanya tutulmaz.
 */

export const VERI_TARIHI = '27 Ağustos 2026';

export interface Banka {
  id: string;
  ad: string;
  /** Resmî logo yoksa kullanılan monogram ve marka rengi */
  kisa: string;
  renk: string;
  /** public/logos altındaki resmî logo dosyasının yolu (yoksa monograma düşülür) */
  logo?: string;
}

export const BANKALAR: Banka[] = [
  { id: 'adil-katilim', ad: 'Adil Katılım', kisa: 'AK', renk: '#047857', logo: '/logos/adil-katilim.png' },
  { id: 'albaraka', ad: 'Albaraka Türk', kisa: 'AT', renk: '#ea7317', logo: '/logos/albaraka.png' },
  { id: 'dunya-katilim', ad: 'Dünya Katılım', kisa: 'DK', renk: '#7c3aed', logo: '/logos/dunya-katilim.svg' },
  { id: 'hayat-finans', ad: 'Hayat Finans', kisa: 'HF', renk: '#068c5e', logo: '/logos/hayat-finans.png' },
  { id: 'iktisat-katilim', ad: 'İktisat Katılım', kisa: 'İK', renk: '#0f766e' },
  { id: 'kuveyt-turk', ad: 'Kuveyt Türk', kisa: 'KT', renk: '#0a7d55', logo: '/logos/kuveyt-turk.png' },
  { id: 'tom-katilim', ad: 'T.O.M. Katılım', kisa: 'TM', renk: '#763ac7', logo: '/logos/tom-katilim.svg' },
  { id: 'emlak-katilim', ad: 'Emlak Katılım', kisa: 'EK', renk: '#2563a5', logo: '/logos/emlak-katilim.png' },
  { id: 'turkiye-finans', ad: 'Türkiye Finans', kisa: 'TF', renk: '#0ea5a0', logo: '/logos/turkiye-finans.png' },
  { id: 'vakif-katilim', ad: 'Vakıf Katılım', kisa: 'VK', renk: '#1d4ed8', logo: '/logos/vakif-katilim.png' },
  { id: 'ziraat-katilim', ad: 'Ziraat Katılım', kisa: 'ZK', renk: '#b91c3c', logo: '/logos/ziraat-katilim.svg' },
];

export const BANKA_INDEKS: Record<string, Banka> = Object.fromEntries(
  BANKALAR.map((b) => [b.id, b]),
);

export type FinansmanTuru = Extract<
  UrunTuru,
  'konut_finansmani' | 'tasit_finansmani' | 'ihtiyac_finansmani'
>;

export const FINANSMAN_TURLERI: { key: FinansmanTuru; etiket: string }[] = [
  { key: 'konut_finansmani', etiket: 'Konut Finansmanı' },
  { key: 'tasit_finansmani', etiket: 'Taşıt Finansmanı' },
  { key: 'ihtiyac_finansmani', etiket: 'İhtiyaç Finansmanı' },
];

/**
 * Kullanıcıya sunulan ayrıntılı finansman seçenekleri.
 *
 * Bankaların kendi hesaplama araçları sıfır/2. el konut ve taşıt gibi
 * ayrımları ayrı ürün olarak sunuyor. Karşılaştırma tablomuz üç temel tür
 * üzerinden çalıştığı için her seçenek bir temel türe bağlanır; canlı
 * hesaplamada ise bankanın beklediği ayrıntılı tür gönderilir.
 */
export interface FinansmanSecenegi {
  /** Canlı hesaplama servislerine gönderilen ayrıntılı tür */
  key: string;
  etiket: string;
  /** Statik karşılaştırma tablosunda kullanılan temel tür */
  temelTur: FinansmanTuru;
}

export const FINANSMAN_SECENEKLERI: FinansmanSecenegi[] = [
  {
    key: 'ihtiyac_finansmani',
    etiket: 'İhtiyaç Finansmanı',
    temelTur: 'ihtiyac_finansmani',
  },
  {
    key: 'konut_finansmani',
    etiket: 'Sıfır Konut Finansmanı',
    temelTur: 'konut_finansmani',
  },
  {
    key: 'konut_finansmani_ikinci_el',
    etiket: '2. El Konut Finansmanı',
    temelTur: 'konut_finansmani',
  },
  {
    key: 'tasit_finansmani',
    etiket: 'Taşıt Finansmanı 0 km',
    temelTur: 'tasit_finansmani',
  },
  {
    key: 'tasit_finansmani_ikinci_el',
    etiket: 'Taşıt Finansmanı 2. El',
    temelTur: 'tasit_finansmani',
  },
  {
    key: 'isyeri_finansmani',
    etiket: 'İşyeri Finansmanı',
    temelTur: 'ihtiyac_finansmani',
  },
  {
    key: 'arsa_finansmani',
    etiket: 'Arsa Finansmanı',
    temelTur: 'konut_finansmani',
  },
];

export const VADELER: Record<FinansmanTuru, number[]> = {
  konut_finansmani: [60, 84, 120, 180, 240],
  tasit_finansmani: [12, 24, 36, 48],
  ihtiyac_finansmani: [3, 6, 12, 24, 36],
};

export const VARSAYILAN_TUTAR: Record<FinansmanTuru, number> = {
  konut_finansmani: 1_500_000,
  tasit_finansmani: 500_000,
  ihtiyac_finansmani: 200_000,
};

export interface FinansmanTeklifi {
  bankaId: string;
  /** Aylık kâr payı oranı (ondalık, 0.0379 = %3,79) */
  aylikKarPayi: number;
  /** Sabit tahsis ücreti (TL) */
  tahsisSabit?: number;
  /** Oransal tahsis ücreti (tutarın yüzdesi) */
  tahsisOran?: number;
  kampanyaliMi: boolean;
  /** Ürüne özel azami vade */
  azamiVade: number;
}

export const TEKLIFLER: Record<FinansmanTuru, FinansmanTeklifi[]> = {
  konut_finansmani: [],
  tasit_finansmani: [],
  ihtiyac_finansmani: [],
};

export type { UcretKalemi, FeeValue } from './verifiedFees';
export { VERIFIED_FEES as UCRETLER, getVerifiedFeeMatrix } from './verifiedFees';
export type KampanyaEtiketi = 'TAKSİT' | 'İNDİRİM' | 'YENİ MÜŞTERİ' | 'PUAN' | 'NAKİT İADE';

export interface Kampanya {
  id: string;
  bankaId: string;
  baslik: string;
  aciklama: string;
  bitis: string;
  etiket: KampanyaEtiketi;
  kategori: 'egitim' | 'market' | 'akaryakit' | 'saglik' | 'genel';
}

/** Statik mock kampanya yok — UI /api/live/campaigns kullanır. */
export const KAMPANYALAR: Kampanya[] = [];

export const POPULER_ARAMALAR = [
  '200.000 TL ihtiyaç finansmanı',
  'Konut finansmanı 1.000.000 TL',
  'Eğitim kampanyaları',
  'Kart kampanyaları',
];
