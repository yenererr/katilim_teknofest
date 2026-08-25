import { UrunTuru } from '../types';

/**
 * Katılım bankaları vitrin verisi.
 * Kaynak: bankaların kamuya açık ürün/ücret sayfalarından derlenen örnek set.
 * Oranlar temsilîdir; ekranda "güncel veri tarihi" ile birlikte gösterilir.
 */

export const VERI_TARIHI = '26 Mayıs 2026';

export interface Banka {
  id: string;
  ad: string;
  /** Logo yerine kullanılan monogram ve marka rengi */
  kisa: string;
  renk: string;
}

export const BANKALAR: Banka[] = [
  { id: 'kuveyt-turk', ad: 'Kuveyt Türk', kisa: 'KT', renk: '#0a7d55' },
  { id: 'vakif-katilim', ad: 'Vakıf Katılım', kisa: 'VK', renk: '#1d4ed8' },
  { id: 'ziraat-katilim', ad: 'Ziraat Katılım', kisa: 'ZK', renk: '#b91c3c' },
  { id: 'albaraka', ad: 'Albaraka Türk', kisa: 'AT', renk: '#ea7317' },
  { id: 'turkiye-finans', ad: 'Türkiye Finans', kisa: 'TF', renk: '#0ea5a0' },
  { id: 'emlak-katilim', ad: 'Emlak Katılım', kisa: 'EK', renk: '#2563a5' },
  { id: 'hayat-finans', ad: 'Hayat Finans', kisa: 'HF', renk: '#068c5e' },
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
  konut_finansmani: [
    { bankaId: 'kuveyt-turk', aylikKarPayi: 0.0205, tahsisSabit: 500, kampanyaliMi: true, azamiVade: 120 },
    { bankaId: 'vakif-katilim', aylikKarPayi: 0.0219, tahsisOran: 0.005, kampanyaliMi: true, azamiVade: 180 },
    { bankaId: 'ziraat-katilim', aylikKarPayi: 0.0224, tahsisSabit: 750, kampanyaliMi: false, azamiVade: 240 },
    { bankaId: 'emlak-katilim', aylikKarPayi: 0.0231, tahsisSabit: 1000, kampanyaliMi: true, azamiVade: 180 },
    { bankaId: 'albaraka', aylikKarPayi: 0.0238, tahsisOran: 0.0045, kampanyaliMi: false, azamiVade: 120 },
    { bankaId: 'turkiye-finans', aylikKarPayi: 0.0243, tahsisSabit: 900, kampanyaliMi: false, azamiVade: 120 },
  ],
  tasit_finansmani: [
    { bankaId: 'kuveyt-turk', aylikKarPayi: 0.0379, tahsisSabit: 2500, kampanyaliMi: true, azamiVade: 48 },
    { bankaId: 'vakif-katilim', aylikKarPayi: 0.0397, tahsisSabit: 2875, kampanyaliMi: true, azamiVade: 48 },
    { bankaId: 'ziraat-katilim', aylikKarPayi: 0.0412, tahsisSabit: 2500, kampanyaliMi: false, azamiVade: 36 },
    { bankaId: 'albaraka', aylikKarPayi: 0.0424, tahsisSabit: 3150, kampanyaliMi: true, azamiVade: 48 },
    { bankaId: 'turkiye-finans', aylikKarPayi: 0.0445, tahsisSabit: 2500, kampanyaliMi: false, azamiVade: 36 },
    { bankaId: 'emlak-katilim', aylikKarPayi: 0.0451, tahsisOran: 0.005, kampanyaliMi: false, azamiVade: 36 },
  ],
  ihtiyac_finansmani: [
    { bankaId: 'turkiye-finans', aylikKarPayi: 0.0389, kampanyaliMi: true, azamiVade: 36 },
    { bankaId: 'kuveyt-turk', aylikKarPayi: 0.0399, tahsisSabit: 750, kampanyaliMi: true, azamiVade: 36 },
    { bankaId: 'hayat-finans', aylikKarPayi: 0.0405, kampanyaliMi: true, azamiVade: 24 },
    { bankaId: 'vakif-katilim', aylikKarPayi: 0.0418, tahsisSabit: 1250, kampanyaliMi: false, azamiVade: 36 },
    { bankaId: 'ziraat-katilim', aylikKarPayi: 0.0429, tahsisSabit: 950, kampanyaliMi: false, azamiVade: 24 },
    { bankaId: 'albaraka', aylikKarPayi: 0.0442, tahsisOran: 0.004, kampanyaliMi: false, azamiVade: 36 },
  ],
};

export interface UcretKalemi {
  key: string;
  etiket: string;
  aciklama: string;
  /** bankaId -> ücret (TL). 0 = ücretsiz */
  degerler: Record<string, number>;
}

export const UCRETLER: UcretKalemi[] = [
  {
    key: 'fast',
    etiket: 'FAST Ücreti',
    aciklama: '7/24 anlık para transferi, 7.500 TL altı işlemler.',
    degerler: {
      'kuveyt-turk': 0,
      'vakif-katilim': 0,
      'ziraat-katilim': 0,
      albaraka: 0,
      'turkiye-finans': 0,
      'emlak-katilim': 0,
      'hayat-finans': 0,
    },
  },
  {
    key: 'eft',
    etiket: 'EFT Ücreti',
    aciklama: 'Mobil/İnternet şubesinden başka bankaya havale.',
    degerler: {
      'kuveyt-turk': 0,
      'vakif-katilim': 0,
      'ziraat-katilim': 6.5,
      albaraka: 8,
      'turkiye-finans': 0,
      'emlak-katilim': 5,
      'hayat-finans': 0,
    },
  },
  {
    key: 'kart_aidat',
    etiket: 'Kart Yıllık Aidatı',
    aciklama: 'Bireysel kredi kartı yıllık üyelik ücreti.',
    degerler: {
      'kuveyt-turk': 750,
      'vakif-katilim': 690,
      'ziraat-katilim': 640,
      albaraka: 720,
      'turkiye-finans': 700,
      'emlak-katilim': 0,
      'hayat-finans': 0,
    },
  },
  {
    key: 'hesap_isletim',
    etiket: 'Hesap İşletim Ücreti',
    aciklama: 'Bireysel vadesiz TL hesap, yıllık.',
    degerler: {
      'kuveyt-turk': 0,
      'vakif-katilim': 0,
      'ziraat-katilim': 0,
      albaraka: 0,
      'turkiye-finans': 0,
      'emlak-katilim': 0,
      'hayat-finans': 0,
    },
  },
  {
    key: 'atm_nakit',
    etiket: 'Ortak ATM Nakit Çekim',
    aciklama: 'Başka banka ATM sinden nakit çekim, işlem başı.',
    degerler: {
      'kuveyt-turk': 25,
      'vakif-katilim': 22,
      'ziraat-katilim': 20,
      albaraka: 28,
      'turkiye-finans': 24,
      'emlak-katilim': 18,
      'hayat-finans': 0,
    },
  },
];

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

export const KAMPANYALAR: Kampanya[] = [
  {
    id: 'kt-egitim',
    bankaId: 'kuveyt-turk',
    etiket: 'TAKSİT',
    kategori: 'egitim',
    baslik: 'Eğitim Harcamalarına 5 Taksit',
    aciklama: '1.000 TL ve üzeri eğitim harcamalarına özel 5 taksit fırsatı.',
    bitis: '31 Mayıs 2026',
  },
  {
    id: 'vk-market',
    bankaId: 'vakif-katilim',
    etiket: 'İNDİRİM',
    kategori: 'market',
    baslik: 'Market Alışverişine %10 Nakit İade',
    aciklama: 'VKart ile yapılacak 1.000 TL ve üzeri market alışverişlerinde %10 nakit iade.',
    bitis: '15 Haziran 2026',
  },
  {
    id: 'kt-yeni',
    bankaId: 'kuveyt-turk',
    etiket: 'YENİ MÜŞTERİ',
    kategori: 'genel',
    baslik: 'Yeni Müşteriye 7.250 TL Ödül',
    aciklama: 'Mobil uygulamadan müşteri olanlara toplam 7.250 TL ye varan ödül.',
    bitis: '30 Haziran 2026',
  },
  {
    id: 'tf-akaryakit',
    bankaId: 'turkiye-finans',
    etiket: 'PUAN',
    kategori: 'akaryakit',
    baslik: 'Akaryakıtta 1.000 TL Puan',
    aciklama: 'Anlaşmalı istasyonlarda aylık 2.500 TL harcamaya 1.000 TL puan.',
    bitis: '31 Temmuz 2026',
  },
  {
    id: 'at-saglik',
    bankaId: 'albaraka',
    etiket: 'TAKSİT',
    kategori: 'saglik',
    baslik: 'Sağlık Harcamalarına 9 Taksit',
    aciklama: 'Özel hastane ve diş kliniklerinde 9 taksit imkânı.',
    bitis: '30 Eylül 2026',
  },
  {
    id: 'hf-nakit',
    bankaId: 'hayat-finans',
    etiket: 'NAKİT İADE',
    kategori: 'genel',
    baslik: 'Dijital Harcamalara %5 Nakit İade',
    aciklama: 'Abonelik ve dijital platform ödemelerinde aylık 300 TL ye kadar iade.',
    bitis: '31 Aralık 2026',
  },
];

export const POPULER_ARAMALAR = [
  '200.000 TL ihtiyaç finansmanı',
  'Konut finansmanı 1.000.000 TL',
  'Sağlıkta taksit kampanyaları',
  'Market cashback kampanyaları',
  'FAST ücreti hangi bankada ucuz?',
  'Kredi kartı aidatı olmayan kartlar',
];
