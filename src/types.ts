export type UrunTuru =
  | 'konut_finansmani'
  | 'tasit_finansmani'
  | 'ihtiyac_finansmani'
  | 'kart'
  | 'katilim_fonu'
  | 'yatirim'
  | 'alisveris_puani'
  | 'diger';

export type MusteriSegmenti =
  | 'yeni_musteri'
  | 'mevcut_musteri'
  | 'maas_musterisi'
  | 'emekli'
  | 'genc_ogrenci'
  | 'esnaf_kobi'
  | 'ticari_kurumsal'
  | 'kamu_calisani'
  | 'kurumsal'
  | 'kobi'
  | 'genc'
  | 'tumu';

export type KarPayiPeriyot = 'aylik' | 'yillik' | 'belirsiz';

export type TahsisUcretiTipi = 'sabit' | 'oransal' | 'yok' | 'belirsiz';

export interface TermDetail<T = number | null> {
  ham: string | null;
  deger?: T | null;
  min?: number | null;
  max?: number | null;
  periyot?: KarPayiPeriyot | null;
  tipi?: TahsisUcretiTipi | string | null;
  para_birimi?: 'TRY' | 'USD' | 'EUR' | 'XAU' | string | null;
  guven: number;
}

export interface KatilimUrunuTerimleri {
  kar_payi_orani: TermDetail<number>;
  vade_ay: TermDetail<null>;
  tahsis_ucreti: TermDetail<number>;
  tutar: TermDetail<null>;
  taksit_sayisi: TermDetail<number>;
  odul: TermDetail<number>;
}

export interface KatilimUrunu {
  urun_adi: string | null;
  urun_turu: UrunTuru;
  musteri_segmenti: MusteriSegmenti[];
  kampanya_baslangic: string | null;
  kampanya_bitis: string | null;
  terimler: KatilimUrunuTerimleri;
  kanitlar: Record<string, string>;
  terim_esleme_uygulandi: boolean;
  ortalama_guven: number;
  manuel_dogrulama_gerekli: boolean;
  notlar: string | null;
}

export interface ExtractionResponse {
  urunler: KatilimUrunu[];
  meta?: {
    duration_ms?: number;
    extracted_at?: string;
    conventional_terms_detected?: string[];
    provider?: string;
    requested_model?: string;
    used_model?: string | null;
    model_warning?: string | null;
  };
}

export interface LiveBankProduct {
  id: string;
  bankId: string;
  bankName: string;
  sourceUrls: string[];
  lastExtractedAt: string | null;
  product: KatilimUrunu;
}

export interface LiveBankState {
  id: string;
  bankName: string;
  urls: string[];
  status: 'beklemede' | 'degismedi' | 'guncellendi' | 'hata';
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastExtractedAt: string | null;
  products: KatilimUrunu[];
  error: string | null;
}

export interface LiveProductsResponse {
  enabled: boolean;
  running: boolean;
  updated_at: string;
  banks: LiveBankState[];
  products: LiveBankProduct[];
}
