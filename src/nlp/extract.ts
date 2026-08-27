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

/**
 * Sayı parçaları rakamla başlamalı/bitmeli — aksi hâlde önceki cümlenin
 * sonundaki nokta `%` ile birleşip ". %" gibi sahte eşleşme üretir ve
 * tarayıcı gerçek oranı atlar.
 */
const ORAN_DESENI = /(?:%\s*\d[\d.,]*)|(?:\d[\d.,]*\s*%)|(?:yüzde\s+\d[\d.,]*)/giu;

/**
 * Kâr payı olamayacak yüzdelerin geçtiği bağlamlar. Gerçek banka
 * sayfalarında vergi, çerez ve promosyon oranları da yer alır.
 */
const ORAN_DISLAMA =
  /(kkdf|bsmv|kdv|vergi|stopaj|gider\s*vergisi|indirim|iskonto|nem|kdv\s*dahil|cerez|komisyon|erken\s*kapama|erken\s*odeme|getiri\s*oran|hos\s*geldin|temettu|gecikme|azami\s*oran|asgari\s*oran|kalan\s*vade)/;

/**
 * Ücret/oran tablolarından alınan satırlar. Bu sayfalar tek bir ürünün
 * kampanya metni değil, onlarca kalemin listesidir; oran ataması güvenilmez.
 */
const TABLO_SATIRI = /(urun\s*\/\s*islem|para\s*birimi|asgari\s*tutar|azami\s*tutar|guncelleme\s*tarihi|tutar\s*kirilim|alt\s*limit)/;

/** Katılım finansmanı için makul aylık ve yıllık oran aralıkları. */
const AYLIK_ALT = 0.001; // %0,1
const AYLIK_UST = 0.15; // %15
const YILLIK_ALT = 0.01; // %1
const YILLIK_UST = 1.5; // %150

function oranMakulMu(deger: number, periyot: OranBulgusu['periyot']): boolean {
  if (deger <= 0) return false;
  if (periyot === 'aylik') return deger >= AYLIK_ALT && deger <= AYLIK_UST;
  if (periyot === 'yillik') return deger >= YILLIK_ALT && deger <= YILLIK_UST;
  // Periyot belirsizse aylık aralık esas alınır; konut/taşıt oranları buradadır.
  return deger >= AYLIK_ALT && deger <= AYLIK_UST;
}

/**
 * Kâr payı oranını çıkarır.
 *
 * Gerçek banka sayfaları binlerce kelimelik çerez/KVKK/ücret metni içerdiğinden
 * "ilk eşleşen kazanır" yaklaşımı alakasız yüzdeleri yakalar. Bunun yerine tüm
 * adaylar toplanır, bağlam kalitesine göre puanlanır ve en iyisi seçilir.
 */
export const oranCikar = (metin: string): OranBulgusu => {
  const cumleler = cumlelereBol(metin);
  const katlanmis = asciiKatla(metin);
  ORAN_DESENI.lastIndex = 0;

  type Aday = {
    deger: number;
    ham: string;
    periyot: OranBulgusu['periyot'];
    cumle: CumleSpan | null;
    puan: number;
  };
  const adaylar: Aday[] = [];

  let eslesme: RegExpExecArray | null;
  while ((eslesme = ORAN_DESENI.exec(metin)) !== null) {
    // Desen sondaki noktalamayı da yakalayabilir: "%2,05," → "%2,05"
    const ham = eslesme[0].replace(/[.,]+$/, '');
    const deger = yuzdeCoz(ham);
    if (deger === null) continue;

    const cumle = kanitCumlesi(cumleler, eslesme.index);
    const baglam = asciiKatla(cumle?.metin ?? katlanmis);

    // Oranın kâr payına ait olduğunu doğrula. Yalnız "oran" kelimesi yetmez —
    // ücret ve komisyon tablolarının her satırında geçer. Ya kâr payı açıkça
    // anılmalı ya da faiz karşılığı bir finansman ürünüyle birlikte geçmeli.
    const karPayiAnildi = /(kar\s*pay|kar\s*orani|faiz)/.test(baglam);
    const urunBaglami = /(konut|tasit|ihtiyac|finansman|katilma)/.test(baglam);
    if (!karPayiAnildi || !urunBaglami) continue;
    if (ORAN_DISLAMA.test(baglam)) continue;
    if (TABLO_SATIRI.test(baglam)) continue;

    let periyot: OranBulgusu['periyot'] = 'belirsiz';
    if (/\bayl[iı]k\b|\bay\s*bas[iı]na\b|\/\s*ay\b/.test(baglam)) periyot = 'aylik';
    else if (/\by[iı]ll[iı]k\b|\bsenelik\b|\byil\s*bas[iı]na\b/.test(baglam)) periyot = 'yillik';

    if (!oranMakulMu(deger, periyot)) continue;

    // Bağlam puanı: kâr payı ifadesi ve finansman ürünü yakınlığı ödüllendirilir.
    let puan = 0;
    if (/kar\s*pay/.test(baglam)) puan += 3;
    if (periyot !== 'belirsiz') puan += 2;
    if (/(konut|tasit|ihtiyac|finansman)/.test(baglam)) puan += 2;
    if (/(kampanya|ozel|firsat)/.test(baglam)) puan += 1;
    // Uzun cümleler genelde tablo/boilerplate; kısa cümleler daha güvenilir.
    if ((cumle?.metin.length ?? 0) < 200) puan += 1;

    adaylar.push({ deger, ham, periyot, cumle, puan });
  }

  if (adaylar.length === 0) return { ...bosBulgu<number>(), periyot: 'belirsiz' };

  // En yüksek puan; eşitlikte metinde önce geçen kazanır.
  const kazanan = adaylar.reduce((en, a) => (a.puan > en.puan ? a : en));

  return {
    deger: kazanan.deger,
    ham: kazanan.ham,
    periyot: kazanan.periyot,
    kanit: kazanan.cumle?.metin ?? null,
    baslangic: kazanan.cumle?.baslangic ?? null,
    bitis: kazanan.cumle?.bitis ?? null,
    // Şartname kuralı: periyot belirsizse güven en fazla 0.5
    guven: kazanan.periyot === 'belirsiz' ? 0.5 : 0.9,
  };
};

/* ------------------------------------------------------------------ */
/* Vade                                                                */
/* ------------------------------------------------------------------ */

export interface VadeBulgusu extends KuralBulgusu<null> {
  min: number | null;
  max: number | null;
}

/**
 * Birim sonrası çekim eki serbest: "120 aya kadar", "36 ayda", "12 aylık",
 * "10 yıla varan". Ek listesi dar tutulur ki "ayrıca", "senet" gibi
 * kelimeler yanlışlıkla vade sanılmasın.
 */
const VADE_DESENI =
  /(?<!\d)(\d{1,3})(?:\s*(?:-|–|ile|ila)\s*(\d{1,3}))?\s*(ay|yıl|yil|sene)(?:a|e|da|de|ta|te|ı|i|ın|in|ya|ye|lık|lik|luk|lük|lı|li)?\b/giu;

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

    // Vade bağlamı doğrulanmalı; "3 ay içinde bildirilir" gibi süreler vade değildir.
    if (!/(vade|finansman|odeme|geri\s*odeme|kadar|varan)/.test(baglam)) continue;

    const degerler = [ilk, ikinci].filter((v): v is number => v !== null).map((v) => v * carpan);
    const max = Math.max(...degerler);
    // Finansman vadesi en az 3 ay, en çok 360 aydır.
    if (max < 3 || max > 360) continue;
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
/* Kampanya avantajı                                                   */
/* ------------------------------------------------------------------ */

export type AvantajTuru =
  | 'masraf_muafiyeti'
  | 'ucret_karsilama'
  | 'hediye_ceki'
  | 'odul_puan'
  | 'indirim'
  | 'belirsiz';

export interface AvantajBulgusu extends KuralBulgusu<number> {
  tur: AvantajTuru;
  /** Ekranda gösterilecek kısa ifade */
  ozet: string | null;
}

const bosAvantaj = (): AvantajBulgusu => ({
  ...bosBulgu<number>(),
  tur: 'belirsiz',
  ozet: null,
});

/** Avantaj kalıpları — sıra önceliği belirler, ilk eşleşen kazanır. */
const AVANTAJ_KURALLARI: {
  tur: AvantajTuru;
  desen: RegExp;
  ozetle: (cumle: string, tutar: number | null) => string;
}[] = [
  {
    tur: 'hediye_ceki',
    desen: /(alisveris\s*ceki|hediye\s*ceki|cek\s*hediye|alisveris\s*karti)/,
    ozetle: (_c, t) => (t ? `${t.toLocaleString('tr-TR')} TL alışveriş çeki` : 'Alışveriş çeki'),
  },
  {
    tur: 'odul_puan',
    desen: /(parafpara|worldpuan|bonus\s*puan|mil\s*hediye|puan\s*hediye|\bmil\b|\bpuan\s*kazan)/,
    ozetle: (_c, t) => (t ? `${t.toLocaleString('tr-TR')} TL puan/ödül` : 'Puan veya ödül'),
  },
  {
    tur: 'ucret_karsilama',
    desen: /(banka\s*tarafindan\s*karsilan|banka\s*karsil|tarafimizca\s*karsilan)/,
    ozetle: (c) => {
      const kalem = /ekspertiz/.test(c)
        ? 'Ekspertiz ücreti'
        : /ipotek/.test(c)
          ? 'İpotek masrafı'
          : /sigorta/.test(c)
            ? 'Sigorta bedeli'
            : 'Masraf';
      return `${kalem} banka tarafından karşılanıyor`;
    },
  },
  {
    tur: 'masraf_muafiyeti',
    desen: /(masraf|tahsis|dosya|komisyon|ucret)/,
    ozetle: (_c, t) =>
      t ? `${t.toLocaleString('tr-TR')} TL'ye kadar masraf alınmıyor` : 'Masraf alınmıyor',
  },
  {
    tur: 'indirim',
    desen: /(indirim|avantajli\s*oran|ozel\s*oran)/,
    ozetle: () => 'Oran avantajı',
  },
];

/**
 * Kampanyanın sunduğu somut faydayı çıkarır (şartname 5.3 "kampanya avantajı").
 * Masraf muafiyeti yalnızca olumsuzluk varsa avantaj sayılır; "500 TL masraf
 * alınır" cümlesi avantaj değildir.
 */
export const avantajCikar = (metin: string): AvantajBulgusu => {
  const cumleler = cumlelereBol(metin);

  for (const cumle of cumleler) {
    const katlanmis = asciiKatla(cumle.metin);
    if (!/(kampanya|firsat|hediye|ozel|avantaj)/.test(katlanmis)) continue;

    TUTAR_DESENI.lastIndex = 0;
    const tutarEslesmesi = TUTAR_DESENI.exec(cumle.metin);
    const tutar = tutarEslesmesi ? sayiCoz(tutarEslesmesi[1]) : null;

    for (const kural of AVANTAJ_KURALLARI) {
      if (!kural.desen.test(katlanmis)) continue;
      // Masraf muafiyeti bir avantajdır ancak yalnızca olumsuzlandığında.
      if (kural.tur === 'masraf_muafiyeti' && !olumsuzlukVarMi(cumle.metin)) continue;

      return {
        deger: tutar,
        tur: kural.tur,
        ozet: kural.ozetle(katlanmis, tutar),
        ham: cumle.metin,
        kanit: cumle.metin,
        baslangic: cumle.baslangic,
        bitis: cumle.bitis,
        guven: kural.tur === 'belirsiz' ? 0.5 : 0.85,
      };
    }
  }

  return bosAvantaj();
};

/* ------------------------------------------------------------------ */
/* Kampanya bitiş tarihi                                               */
/* ------------------------------------------------------------------ */

export interface TarihBulgusu extends KuralBulgusu<null> {
  /** ISO 8601 (YYYY-MM-DD) */
  iso: string | null;
  /** Metinde geçtiği hâli */
  gosterim: string | null;
}

const AYLAR: Record<string, number> = {
  ocak: 1,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  eylul: 9,
  ekim: 10,
  kasim: 11,
  aralik: 12,
};

const AY_ADI = Object.keys(AYLAR).join('|');
const YAZILI_TARIH = new RegExp(`(\\d{1,2})\\s+(${AY_ADI})\\s+(\\d{4})`, 'iu');
const SAYISAL_TARIH = /(\d{1,2})[./](\d{1,2})[./](\d{4})/u;

const ikiHane = (n: number) => String(n).padStart(2, '0');

/**
 * Kampanyanın geçerlilik bitişini çıkarır. Tarih aralığı verilmişse
 * ("1.09.2024 - 31.12.2024") sonuncusu bitiş kabul edilir.
 */
export const kampanyaBitisCikar = (
  metin: string,
  /** Bugünden önceki tarihler kampanya bitişi sayılmaz (test için sabitlenebilir) */
  bugun: Date = new Date(),
): TarihBulgusu => {
  const cumleler = cumlelereBol(metin);
  const esik = bugun.getTime();
  const gecmisMi = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) && t < esik;
  };

  for (const cumle of cumleler) {
    const katlanmis = asciiKatla(cumle.metin);
    const bitisBaglami =
      /(gecerli|sona\s*er|son\s*bas|bitis|kadar|tarihleri\s*arasinda|kampanya\s*tarih)/.test(
        katlanmis,
      );
    if (!bitisBaglami) continue;

    // Aralık verildiyse son tarih bitiştir.
    const sayisalHepsi = [...cumle.metin.matchAll(new RegExp(SAYISAL_TARIH, 'gu'))];
    if (sayisalHepsi.length > 0) {
      const son = sayisalHepsi[sayisalHepsi.length - 1];
      const [, g, a, y] = son;
      const ay = Number(a);
      const gun = Number(g);
      const iso = `${y}-${ikiHane(ay)}-${ikiHane(gun)}`;
      if (ay >= 1 && ay <= 12 && gun >= 1 && gun <= 31 && !gecmisMi(iso)) {
        return {
          deger: null,
          iso,
          gosterim: son[0],
          ham: son[0],
          kanit: cumle.metin,
          baslangic: cumle.baslangic,
          bitis: cumle.bitis,
          guven: 0.9,
        };
      }
    }

    const yaziliHepsi = [...asciiKatla(cumle.metin).matchAll(new RegExp(YAZILI_TARIH, 'giu'))];
    if (yaziliHepsi.length > 0) {
      const son = yaziliHepsi[yaziliHepsi.length - 1];
      const gun = Number(son[1]);
      const ay = AYLAR[son[2].toLowerCase()];
      const yil = son[3];
      const iso = ay ? `${yil}-${ikiHane(ay)}-${ikiHane(gun)}` : '';
      if (ay && gun >= 1 && gun <= 31 && !gecmisMi(iso)) {
        // Gösterimi özgün metinden al — ASCII katlanmış hâli değil.
        const ozgun = cumle.metin.slice(son.index ?? 0, (son.index ?? 0) + son[0].length);
        return {
          deger: null,
          iso,
          gosterim: ozgun || son[0],
          ham: son[0],
          kanit: cumle.metin,
          baslangic: cumle.baslangic,
          bitis: cumle.bitis,
          guven: 0.9,
        };
      }
    }
  }

  return { ...bosBulgu<null>(), iso: null, gosterim: null };
};

/* ------------------------------------------------------------------ */
/* Masraf durumu — şartname tablosundaki özet sütun                    */
/* ------------------------------------------------------------------ */

/**
 * Ücret ve avantaj bulgularını tek bir okunabilir ifadeye indirger.
 * Şartname tablosundaki "Masraf Durumu" sütununun karşılığıdır.
 */
export const masrafDurumu = (ucret: UcretBulgusu, avantaj: AvantajBulgusu): string => {
  if (ucret.tipi === 'yok') {
    const kanit = asciiKatla(ucret.kanit ?? '');
    if (/dosya/.test(kanit)) return 'Dosya masrafı yok';
    if (/tahsis/.test(kanit)) return 'Tahsis ücreti yok';
    if (/ekspertiz/.test(kanit)) return 'Ekspertiz ücretsiz';
    return 'Masraf alınmıyor';
  }

  if (avantaj.tur === 'ucret_karsilama') {
    const kanit = asciiKatla(avantaj.kanit ?? '');
    if (/ekspertiz/.test(kanit)) return 'Ekspertiz ücretsiz';
    if (/ipotek/.test(kanit)) return 'İpotek masrafı yok';
    return 'Masraf banka tarafından karşılanıyor';
  }

  if (ucret.tipi === 'sabit' && ucret.deger !== null) {
    return `${ucret.deger.toLocaleString('tr-TR')} ${ucret.para_birimi === 'TRY' ? '₺' : ucret.para_birimi}`;
  }

  if (ucret.tipi === 'oransal' && ucret.deger !== null) {
    return `Tutarın %${(ucret.deger * 100).toLocaleString('tr-TR', {
      maximumFractionDigits: 2,
    })}'i`;
  }

  return 'Masraf belirtilmemiş';
};

/* ------------------------------------------------------------------ */
/* Toplu çıkarım                                                       */
/* ------------------------------------------------------------------ */

export interface KuralCikarimi {
  kar_payi_orani: OranBulgusu;
  vade_ay: VadeBulgusu;
  tahsis_ucreti: UcretBulgusu;
  tutar: TutarBulgusu;
  kampanya_avantaji: AvantajBulgusu;
  kampanya_bitis: TarihBulgusu;
  /** Türetilmiş özet — şartname tablosundaki "Masraf Durumu" */
  masraf_durumu: string;
}

/** Birinci katmanın tam çıktısı. */
export const kuralTabanliCikar = (metin: string): KuralCikarimi => {
  const tahsis_ucreti = ucretCikar(metin);
  const kampanya_avantaji = avantajCikar(metin);
  return {
    kar_payi_orani: oranCikar(metin),
    vade_ay: vadeCikar(metin),
    tahsis_ucreti,
    tutar: tutarCikar(metin),
    kampanya_avantaji,
    kampanya_bitis: kampanyaBitisCikar(metin),
    masraf_durumu: masrafDurumu(tahsis_ucreti, kampanya_avantaji),
  };
};

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
