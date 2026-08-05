import { asciiKatla, paraBirimiCoz, sayiCoz, yaziliSayiCoz, yuzdeCoz } from './normalize';
import { cumlelereBol, CumleSpan } from './segment';
import { olumsuzlukVarMi } from './lexicon';

/**
 * Kural tabanlı bilgi çıkarımı (birinci katman).
 *
 * Deterministik, milisaniyelik ve tekrarlanabilir. Kolay vakaları burada
 * çözüp dil modeline yalnızca varyasyonlu ifadeleri bırakmak hem gecikmeyi
 * hem maliyeti düşürür; ayrıca model çıktısını çapraz doğrulamak için
 * bağımsız bir referans sağlar.
 */

export interface KuralBulgusu<T = number> {
  deger: T | null;
  ham: string | null;
  /** Bulgunun dayandığı cümle */
  kanit: string | null;
  /** Kaynak metindeki karakter aralığı */
  baslangic: number | null;
  bitis: number | null;
  /** Kural katmanının kendi güveni */
  guven: number;
}

const bosBulgu = <T>(): KuralBulgusu<T> => ({
  deger: null,
  ham: null,
  kanit: null,
  baslangic: null,
  bitis: null,
  guven: 0,
});

/** Bir eşleşmeyi içeren cümleyi bulur. */
const kanitCumlesi = (cumleler: CumleSpan[], konum: number): CumleSpan | null =>
  cumleler.find((c) => konum >= c.baslangic && konum < c.bitis) ?? null;

/* ------------------------------------------------------------------ */
/* Kâr payı oranı                                                      */
/* ------------------------------------------------------------------ */

export interface OranBulgusu extends KuralBulgusu<number> {
  periyot: 'aylik' | 'yillik' | 'belirsiz';
}

const ORAN_DESENI = /(?:%\s*[\d.,]+)|(?:[\d.,]+\s*%)|(?:yüzde\s+[\d.,]+)/giu;

export const oranCikar = (metin: string): OranBulgusu => {
  const cumleler = cumlelereBol(metin);
  const katlanmis = asciiKatla(metin);
  ORAN_DESENI.lastIndex = 0;

  let eslesme: RegExpExecArray | null;
  while ((eslesme = ORAN_DESENI.exec(metin)) !== null) {
    const ham = eslesme[0];
    const deger = yuzdeCoz(ham);
    if (deger === null) continue;

    const cumle = kanitCumlesi(cumleler, eslesme.index);
    const baglam = asciiKatla(cumle?.metin ?? katlanmis);

    // Oranın kâr payına ait olduğunu doğrula — indirim, KDV vb. karışmasın
    const karPayiBaglami = /(kar\s*pay|faiz|oran)/.test(baglam);
    if (!karPayiBaglami) continue;

    let periyot: OranBulgusu['periyot'] = 'belirsiz';
    if (/\bayl[iı]k\b|\bay\s*bas[iı]na\b|\/\s*ay\b/.test(baglam)) periyot = 'aylik';
    else if (/\by[iı]ll[iı]k\b|\bsenelik\b|\byil\s*bas[iı]na\b/.test(baglam)) periyot = 'yillik';

    // Şartname kuralı: periyot belirsizse güven en fazla 0.5
    const guven = periyot === 'belirsiz' ? 0.5 : 0.9;

    return {
      deger,
      ham,
      periyot,
      kanit: cumle?.metin ?? null,
      baslangic: cumle?.baslangic ?? null,
      bitis: cumle?.bitis ?? null,
      guven,
    };
  }

  return { ...bosBulgu<number>(), periyot: 'belirsiz' };
};

/* ------------------------------------------------------------------ */
/* Vade                                                                */
/* ------------------------------------------------------------------ */

export interface VadeBulgusu extends KuralBulgusu<null> {
  min: number | null;
  max: number | null;
}

const VADE_DESENI = /(\d{1,3})\s*(?:-|–|ile|ila)?\s*(\d{1,3})?\s*(ay|yıl|yil|sene)/giu;

export const vadeCikar = (metin: string): VadeBulgusu => {
  const cumleler = cumlelereBol(metin);
  VADE_DESENI.lastIndex = 0;

  let eslesme: RegExpExecArray | null;
  while ((eslesme = VADE_DESENI.exec(metin)) !== null) {
    const ilk = Number.parseInt(eslesme[1], 10);
    const ikinci = eslesme[2] ? Number.parseInt(eslesme[2], 10) : null;
    const birim = asciiKatla(eslesme[3]);
    const carpan = birim === 'ay' ? 1 : 12; // vadeler her zaman ay cinsinden

    const cumle = kanitCumlesi(cumleler, eslesme.index);
    const baglam = asciiKatla(cumle?.metin ?? '');

    // Taksit sayısıyla karışmasın
    if (/taksit/.test(baglam) && !/vade/.test(baglam)) continue;

    const degerler = [ilk, ikinci].filter((v): v is number => v !== null).map((v) => v * carpan);
    const max = Math.max(...degerler);
    // "120 aya kadar" / "36 aya varan" → yalnızca üst sınır
    const ustSinirIfadesi = /\b(kadar|varan|uzayan|secenekleri)\b/.test(baglam);
    const min = degerler.length > 1 ? Math.min(...degerler) : ustSinirIfadesi ? null : null;

    return {
      deger: null,
      min,
      max,
      ham: eslesme[0],
      kanit: cumle?.metin ?? null,
      baslangic: cumle?.baslangic ?? null,
      bitis: cumle?.bitis ?? null,
      guven: 0.9,
    };
  }

  return { ...bosBulgu<null>(), min: null, max: null };
};

/* ------------------------------------------------------------------ */
/* Tahsis ücreti — olumsuzluk tespitiyle                               */
/* ------------------------------------------------------------------ */

export interface UcretBulgusu extends KuralBulgusu<number> {
  tipi: 'sabit' | 'oransal' | 'yok' | 'belirsiz';
  para_birimi: string;
}

const UCRET_BAGLAMI = /(tahsis|dosya\s*masraf|masraf|ucret|komisyon)/;
const TUTAR_DESENI = /([\d.,]+)\s*(₺|tl|try|türk\s*liras[ıi]|\$|usd|€|eur)/giu;

export const ucretCikar = (metin: string): UcretBulgusu => {
  const cumleler = cumlelereBol(metin);

  for (const cumle of cumleler) {
    const katlanmis = asciiKatla(cumle.metin);
    if (!UCRET_BAGLAMI.test(katlanmis)) continue;

    // Önce olumsuzluk: "tahsis ücreti alınmaz" → 0
    if (olumsuzlukVarMi(cumle.metin)) {
      return {
        deger: 0,
        tipi: 'yok',
        para_birimi: 'TRY',
        ham: cumle.metin,
        kanit: cumle.metin,
        baslangic: cumle.baslangic,
        bitis: cumle.bitis,
        guven: 1,
      };
    }

    // Rakamla yazılmış tutar
    TUTAR_DESENI.lastIndex = 0;
    const tutarEslesmesi = TUTAR_DESENI.exec(cumle.metin);
    if (tutarEslesmesi) {
      const deger = sayiCoz(tutarEslesmesi[1]);
      if (deger !== null) {
        return {
          deger,
          tipi: 'sabit',
          para_birimi: paraBirimiCoz(tutarEslesmesi[2]),
          ham: tutarEslesmesi[0],
          kanit: cumle.metin,
          baslangic: cumle.baslangic,
          bitis: cumle.bitis,
          guven: 0.95,
        };
      }
    }

    // Oransal ücret: "binde 5" · "%0,5 tahsis ücreti"
    const bindeEslesmesi = /binde\s+([\d.,]+)/i.exec(cumle.metin);
    if (bindeEslesmesi) {
      const sayi = sayiCoz(bindeEslesmesi[1]);
      if (sayi !== null) {
        return {
          deger: sayi / 1000,
          tipi: 'oransal',
          para_birimi: 'TRY',
          ham: bindeEslesmesi[0],
          kanit: cumle.metin,
          baslangic: cumle.baslangic,
          bitis: cumle.bitis,
          guven: 0.9,
        };
      }
    }

    // Yazıyla yazılmış tutar: "beş yüz Türk Lirası"
    const yazili = yaziliSayiCoz(cumle.metin);
    if (yazili !== null && yazili > 0 && /(lira|tl|₺)/.test(katlanmis)) {
      return {
        deger: yazili,
        tipi: 'sabit',
        para_birimi: 'TRY',
        ham: cumle.metin,
        kanit: cumle.metin,
        baslangic: cumle.baslangic,
        bitis: cumle.bitis,
        guven: 0.75,
      };
    }
  }

  return { ...bosBulgu<number>(), tipi: 'belirsiz', para_birimi: 'TRY' };
};

/* ------------------------------------------------------------------ */
/* Tutar aralığı                                                       */
/* ------------------------------------------------------------------ */

export interface TutarBulgusu extends KuralBulgusu<null> {
  min: number | null;
  max: number | null;
  para_birimi: string;
}

export const tutarCikar = (metin: string): TutarBulgusu => {
  const cumleler = cumlelereBol(metin);

  for (const cumle of cumleler) {
    const katlanmis = asciiKatla(cumle.metin);
    if (!/(minimum|maksimum|asgari|azami|arasi|tutar|limit|finansman)/.test(katlanmis)) continue;
    if (UCRET_BAGLAMI.test(katlanmis)) continue; // ücret cümlesiyle karışmasın

    TUTAR_DESENI.lastIndex = 0;
    const tutarlar: number[] = [];
    let e: RegExpExecArray | null;
    while ((e = TUTAR_DESENI.exec(cumle.metin)) !== null) {
      const v = sayiCoz(e[1]);
      if (v !== null && v >= 1000) tutarlar.push(v);
    }

    if (tutarlar.length >= 1) {
      return {
        deger: null,
        min: tutarlar.length > 1 ? Math.min(...tutarlar) : tutarlar[0],
        max: tutarlar.length > 1 ? Math.max(...tutarlar) : null,
        para_birimi: 'TRY',
        ham: cumle.metin,
        kanit: cumle.metin,
        baslangic: cumle.baslangic,
        bitis: cumle.bitis,
        guven: tutarlar.length > 1 ? 0.9 : 0.6,
      };
    }
  }

  return { ...bosBulgu<null>(), min: null, max: null, para_birimi: 'TRY' };
};

/* ------------------------------------------------------------------ */
/* Toplu çıkarım                                                       */
/* ------------------------------------------------------------------ */

export interface KuralCikarimi {
  kar_payi_orani: OranBulgusu;
  vade_ay: VadeBulgusu;
  tahsis_ucreti: UcretBulgusu;
  tutar: TutarBulgusu;
}

/** Birinci katmanın tam çıktısı. */
export const kuralTabanliCikar = (metin: string): KuralCikarimi => ({
  kar_payi_orani: oranCikar(metin),
  vade_ay: vadeCikar(metin),
  tahsis_ucreti: ucretCikar(metin),
  tutar: tutarCikar(metin),
});

export interface DogrulamaSonucu {
  alan: string;
  durum: 'uyumlu' | 'uyumsuz' | 'yalnizca-model' | 'yalnizca-kural';
  kuralDegeri: number | null;
  modelDegeri: number | null;
  /** Güven skoruna uygulanacak çarpan */
  guvenCarpani: number;
  aciklama: string;
}

/** İki sayının anlamlı ölçüde aynı olup olmadığı (%1 tolerans). */
const yakinMi = (a: number, b: number): boolean => {
  if (a === b) return true;
  const buyuk = Math.max(Math.abs(a), Math.abs(b));
  if (buyuk === 0) return true;
  return Math.abs(a - b) / buyuk < 0.01;
};

/**
 * Kural katmanı ile model çıktısını karşılaştırır.
 * Uyuşma güveni artırır, uyuşmazlık düşürür — bu, tek bir modelin kendi
 * beyanına güvenmek yerine bağımsız bir referans sağlar.
 */
export const caprazDogrula = (
  kural: KuralCikarimi,
  model: Record<string, { deger?: number | null; max?: number | null } | undefined>,
): DogrulamaSonucu[] => {
  const karsilastir = (
    alan: string,
    kuralDegeri: number | null,
    modelDegeri: number | null,
  ): DogrulamaSonucu => {
    if (kuralDegeri === null && modelDegeri === null) {
      return {
        alan,
        durum: 'uyumlu',
        kuralDegeri,
        modelDegeri,
        guvenCarpani: 1,
        aciklama: 'Her iki katman da alanı metinde bulmadı.',
      };
    }
    if (kuralDegeri === null) {
      return {
        alan,
        durum: 'yalnizca-model',
        kuralDegeri,
        modelDegeri,
        guvenCarpani: 0.85,
        aciklama: 'Kural katmanı doğrulayamadı; yalnızca model çıkardı.',
      };
    }
    if (modelDegeri === null) {
      return {
        alan,
        durum: 'yalnizca-kural',
        kuralDegeri,
        modelDegeri,
        guvenCarpani: 0.85,
        aciklama: 'Model bulamadı; kural katmanı çıkardı.',
      };
    }
    return yakinMi(kuralDegeri, modelDegeri)
      ? {
          alan,
          durum: 'uyumlu',
          kuralDegeri,
          modelDegeri,
          guvenCarpani: 1,
          aciklama: 'Kural ve model aynı değeri verdi.',
        }
      : {
          alan,
          durum: 'uyumsuz',
          kuralDegeri,
          modelDegeri,
          guvenCarpani: 0.5,
          aciklama: 'Kural ve model farklı değer verdi; manuel doğrulama önerilir.',
        };
  };

  return [
    karsilastir('kar_payi_orani', kural.kar_payi_orani.deger, model.kar_payi_orani?.deger ?? null),
    karsilastir('vade_ay', kural.vade_ay.max, model.vade_ay?.max ?? null),
    karsilastir('tahsis_ucreti', kural.tahsis_ucreti.deger, model.tahsis_ucreti?.deger ?? null),
  ];
};
