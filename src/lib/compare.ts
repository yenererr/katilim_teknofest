import { KatilimUrunu, TermDetail, UrunTuru } from '../types';

/**
 * Karşılaştırma motoru — saf TypeScript, React içermez.
 * Şartname 5.7'deki beş karşılaştırma kriterini hesaplar.
 */

export interface KarsilastirmaOgesi {
  /** Kararlı kimlik: `${geçmişKaydıId}::${ürünIndeksi}` */
  id: string;
  bankaAdi: string;
  product: KatilimUrunu;
}

export type KriterKey =
  | 'en_dusuk_kar_payi'
  | 'en_yuksek_odul'
  | 'en_uzun_vade'
  | 'en_dusuk_masraf'
  | 'en_avantajli';

export interface KriterSonuc {
  key: KriterKey;
  etiket: string;
  /** Kazananın dayandığı terim alanı — kanıt alıntısını çekmek için */
  alan: string | null;
  kazanan: KarsilastirmaOgesi | null;
  /** Kazananın ekranda gösterilecek biçimlenmiş değeri */
  gosterim: string | null;
  /** Karşılaştırmaya girebilen ürün sayısı */
  degerlendirilen: number;
  /** Veri eksikliği nedeniyle dışarıda kalan ürün sayısı */
  disBirakilan: number;
  disBirakmaSebebi: string | null;
}

const term = (p: KatilimUrunu, key: string): TermDetail<number | null> | undefined =>
  (p.terimler as unknown as Record<string, TermDetail<number | null>>)?.[key];

/**
 * Kâr payı oranını aylığa normalize eder.
 * "yillik" → 12'ye bölünür, "belirsiz" → karşılaştırmaya alınmaz (null).
 */
export const aylikKarPayi = (p: KatilimUrunu): number | null => {
  const t = p.terimler?.kar_payi_orani;
  if (t?.deger === undefined || t?.deger === null) return null;
  if (t.periyot === 'aylik') return t.deger;
  if (t.periyot === 'yillik') return t.deger / 12;
  return null; // belirsiz periyot: matematiksel olarak karşılaştırılamaz
};

/** Türkçe yüzde biçimi: işaret başta, ondalık ayracı virgül. */
export const yuzdeBicim = (oran: number, ondalik = 2): string =>
  `%${(oran * 100).toLocaleString('tr-TR', {
    minimumFractionDigits: ondalik,
    maximumFractionDigits: ondalik,
  })}`;

const yuzde = (oran: number) => yuzdeBicim(oran);

const bosSonuc = (
  key: KriterKey,
  etiket: string,
  alan: string | null,
  disBirakilan: number,
  sebep: string | null,
): KriterSonuc => ({
  key,
  etiket,
  alan,
  kazanan: null,
  gosterim: null,
  degerlendirilen: 0,
  disBirakilan,
  disBirakmaSebebi: sebep,
});

/** Tek bir kriterde kazananı seçer. */
const enIyi = (
  ogeler: KarsilastirmaOgesi[],
  key: KriterKey,
  etiket: string,
  alan: string,
  deger: (p: KatilimUrunu) => number | null,
  yon: 'min' | 'max',
  bicimle: (v: number, p: KatilimUrunu) => string,
  disBirakmaSebebi: string,
): KriterSonuc => {
  const adaylar = ogeler
    .map((o) => ({ oge: o, v: deger(o.product) }))
    .filter((a): a is { oge: KarsilastirmaOgesi; v: number } => a.v !== null && Number.isFinite(a.v));

  const disBirakilan = ogeler.length - adaylar.length;
  if (adaylar.length === 0) {
    return bosSonuc(key, etiket, alan, disBirakilan, disBirakmaSebebi);
  }

  const kazanan = adaylar.reduce((en, a) =>
    yon === 'min' ? (a.v < en.v ? a : en) : a.v > en.v ? a : en,
  );

  return {
    key,
    etiket,
    alan,
    kazanan: kazanan.oge,
    gosterim: bicimle(kazanan.v, kazanan.oge.product),
    degerlendirilen: adaylar.length,
    disBirakilan,
    disBirakmaSebebi: disBirakilan > 0 ? disBirakmaSebebi : null,
  };
};

export interface Agirliklar {
  karPayi: number;
  masraf: number;
  vade: number;
  odul: number;
}

export const VARSAYILAN_AGIRLIKLAR: Agirliklar = {
  karPayi: 0.4,
  masraf: 0.25,
  vade: 0.2,
  odul: 0.15,
};

/** 0–1 aralığına ölçekler; dizide tek değer varsa 1 döner. */
const normalize = (v: number, min: number, max: number, tersCevir: boolean): number => {
  if (max === min) return 1;
  const n = (v - min) / (max - min);
  return tersCevir ? 1 - n : n;
};

/**
 * Bileşik "en avantajlı" skoru. Her ürün yalnızca veri sağladığı kriterlerden
 * puan alır; eksik alan sıfır sayılmaz, ağırlık yeniden dağıtılır.
 */
export const avantajSkoru = (
  ogeler: KarsilastirmaOgesi[],
  agirliklar: Agirliklar = VARSAYILAN_AGIRLIKLAR,
): { oge: KarsilastirmaOgesi; skor: number }[] => {
  const eksen = [
    { ad: 'karPayi' as const, deger: (p: KatilimUrunu) => aylikKarPayi(p), tersCevir: true },
    { ad: 'masraf' as const, deger: (p: KatilimUrunu) => term(p, 'tahsis_ucreti')?.deger ?? null, tersCevir: true },
    { ad: 'vade' as const, deger: (p: KatilimUrunu) => term(p, 'vade_ay')?.max ?? null, tersCevir: false },
    { ad: 'odul' as const, deger: (p: KatilimUrunu) => term(p, 'odul')?.deger ?? null, tersCevir: false },
  ];

  const aralik = eksen.map((e) => {
    const vals = ogeler.map((o) => e.deger(o.product)).filter((v): v is number => v !== null);
    return { min: Math.min(...vals), max: Math.max(...vals), adet: vals.length };
  });

  return ogeler
    .map((oge) => {
      let toplam = 0;
      let agirlikToplami = 0;
      eksen.forEach((e, i) => {
        const v = e.deger(oge.product);
        if (v === null || aralik[i].adet === 0) return;
        const w = agirliklar[e.ad];
        toplam += w * normalize(v, aralik[i].min, aralik[i].max, e.tersCevir);
        agirlikToplami += w;
      });
      return { oge, skor: agirlikToplami > 0 ? toplam / agirlikToplami : 0 };
    })
    .sort((a, b) => b.skor - a.skor);
};

/** Beş kriterin tamamını hesaplar. */
export const hesaplaKriterler = (
  ogeler: KarsilastirmaOgesi[],
  agirliklar: Agirliklar = VARSAYILAN_AGIRLIKLAR,
): KriterSonuc[] => {
  if (ogeler.length === 0) return [];

  const sonuclar: KriterSonuc[] = [
    enIyi(
      ogeler,
      'en_dusuk_kar_payi',
      'En düşük kâr payı',
      'kar_payi_orani',
      aylikKarPayi,
      'min',
      (v) => `${yuzde(v)} / ay`,
      'Periyot belirsiz veya oran metinde yok',
    ),
    enIyi(
      ogeler,
      'en_yuksek_odul',
      'En yüksek ödül',
      'odul',
      (p) => term(p, 'odul')?.deger ?? null,
      'max',
      (v) => `${v.toLocaleString('tr-TR')} ₺`,
      'Ödül bilgisi metinde yok',
    ),
    enIyi(
      ogeler,
      'en_uzun_vade',
      'En uzun vade',
      'vade_ay',
      (p) => term(p, 'vade_ay')?.max ?? null,
      'max',
      (v) => `${v} ay`,
      'Vade bilgisi metinde yok',
    ),
    enIyi(
      ogeler,
      'en_dusuk_masraf',
      'En düşük masraf',
      'tahsis_ucreti',
      (p) => term(p, 'tahsis_ucreti')?.deger ?? null,
      'min',
      (v) => (v === 0 ? 'Ücretsiz' : `${v.toLocaleString('tr-TR')} ₺`),
      'Tahsis ücreti metinde yok',
    ),
  ];

  const siralama = avantajSkoru(ogeler, agirliklar);
  const enAvantajli = siralama[0];
  sonuclar.push({
    key: 'en_avantajli',
    etiket: 'En avantajlı',
    alan: null,
    kazanan: enAvantajli && enAvantajli.skor > 0 ? enAvantajli.oge : null,
    gosterim: enAvantajli && enAvantajli.skor > 0 ? `Skor ${(enAvantajli.skor * 100).toFixed(0)}/100` : null,
    degerlendirilen: siralama.filter((s) => s.skor > 0).length,
    disBirakilan: siralama.filter((s) => s.skor === 0).length,
    disBirakmaSebebi:
      siralama.some((s) => s.skor === 0) ? 'Karşılaştırılabilir alan bulunmuyor' : null,
  });

  return sonuclar;
};

/** Bir kriterde kazananın kimliğini döndürür — tabloda yıldız göstermek için. */
export const kazananHaritasi = (sonuclar: KriterSonuc[]): Record<string, string | null> => {
  const harita: Record<string, string | null> = {};
  sonuclar.forEach((s) => {
    harita[s.key] = s.kazanan?.id ?? null;
  });
  return harita;
};

export const bankayaGoreGrupla = (
  ogeler: KarsilastirmaOgesi[],
): { banka: string; urunler: KarsilastirmaOgesi[]; ortalamaKarPayi: number | null }[] => {
  const gruplar = new Map<string, KarsilastirmaOgesi[]>();
  ogeler.forEach((o) => {
    const mevcut = gruplar.get(o.bankaAdi) ?? [];
    mevcut.push(o);
    gruplar.set(o.bankaAdi, mevcut);
  });

  return Array.from(gruplar.entries()).map(([banka, urunler]) => {
    const oranlar = urunler.map((u) => aylikKarPayi(u.product)).filter((v): v is number => v !== null);
    return {
      banka,
      urunler,
      ortalamaKarPayi: oranlar.length ? oranlar.reduce((a, b) => a + b, 0) / oranlar.length : null,
    };
  });
};

export const URUN_TURU_ETIKETLERI: Record<UrunTuru, string> = {
  konut_finansmani: 'Konut',
  tasit_finansmani: 'Taşıt',
  ihtiyac_finansmani: 'İhtiyaç',
  kart: 'Kart',
  katilim_fonu: 'Katılım fonu',
  yatirim: 'Yatırım',
  alisveris_puani: 'Alışveriş puanı',
  diger: 'Diğer',
};

export const urunTuruDagilimi = (
  ogeler: KarsilastirmaOgesi[],
): { tur: UrunTuru; etiket: string; adet: number }[] => {
  const sayac = new Map<UrunTuru, number>();
  ogeler.forEach((o) => {
    const t = o.product.urun_turu;
    sayac.set(t, (sayac.get(t) ?? 0) + 1);
  });
  return Array.from(sayac.entries())
    .map(([tur, adet]) => ({ tur, etiket: URUN_TURU_ETIKETLERI[tur] ?? tur, adet }))
    .sort((a, b) => b.adet - a.adet);
};

export const guvenBandiDagilimi = (ogeler: KarsilastirmaOgesi[]) => {
  const bantlar = { yuksek: 0, orta: 0, dusuk: 0 };
  ogeler.forEach((o) => {
    const g = o.product.ortalama_guven;
    if (g >= 0.9) bantlar.yuksek += 1;
    else if (g >= 0.6) bantlar.orta += 1;
    else bantlar.dusuk += 1;
  });
  return bantlar;
};

/** Kampanya bitişine kalan gün; tarih yoksa veya çözümlenemiyorsa null. */
export const kalanGun = (bitis: string | null): number | null => {
  if (!bitis) return null;
  const t = Date.parse(bitis);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
};

export const yaklasanBitisler = (
  ogeler: KarsilastirmaOgesi[],
  gunEsigi = 60,
): { oge: KarsilastirmaOgesi; kalan: number }[] =>
  ogeler
    .map((oge) => ({ oge, kalan: kalanGun(oge.product.kampanya_bitis) }))
    .filter((x): x is { oge: KarsilastirmaOgesi; kalan: number } => x.kalan !== null && x.kalan <= gunEsigi)
    .sort((a, b) => a.kalan - b.kalan);

export interface Bulgu {
  id: string;
  metin: string;
  tur: 'bilgi' | 'uyari' | 'olumlu';
}

/**
 * Veriden türetilen otomatik bulgular. Uydurma trend üretmez —
 * yalnızca eldeki kayıtlardan çıkarılabilecek gerçek gözlemleri döndürür.
 */
export const otomatikBulgular = (ogeler: KarsilastirmaOgesi[]): Bulgu[] => {
  const bulgular: Bulgu[] = [];
  if (ogeler.length === 0) return bulgular;

  const kriterler = hesaplaKriterler(ogeler);
  const enDusuk = kriterler.find((k) => k.key === 'en_dusuk_kar_payi');
  if (enDusuk?.kazanan) {
    bulgular.push({
      id: 'en-dusuk-oran',
      tur: 'olumlu',
      metin: `En düşük aylık kâr payı ${enDusuk.gosterim} — ${enDusuk.kazanan.bankaAdi} (${enDusuk.degerlendirilen} ürün arasından).`,
    });
  }

  const belirsizPeriyot = ogeler.filter(
    (o) => o.product.terimler?.kar_payi_orani?.periyot === 'belirsiz',
  ).length;
  if (belirsizPeriyot > 0) {
    bulgular.push({
      id: 'belirsiz-periyot',
      tur: 'uyari',
      metin: `${belirsizPeriyot} üründe kâr payı periyodu metinde belirtilmemiş; bu ürünler oran karşılaştırmasına giremiyor.`,
    });
  }

  const inceleme = ogeler.filter((o) => o.product.manuel_dogrulama_gerekli).length;
  if (inceleme > 0) {
    bulgular.push({
      id: 'manuel-inceleme',
      tur: 'uyari',
      metin: `${inceleme} ürün ortalama güven skoru düşük olduğu için manuel doğrulama bekliyor.`,
    });
  }

  const masrafsiz = ogeler.filter((o) => o.product.terimler?.tahsis_ucreti?.deger === 0).length;
  if (masrafsiz > 0) {
    bulgular.push({
      id: 'masrafsiz',
      tur: 'olumlu',
      metin: `${masrafsiz} kampanyada tahsis ücreti alınmıyor.`,
    });
  }

  const yakin = yaklasanBitisler(ogeler, 30);
  if (yakin.length > 0) {
    bulgular.push({
      id: 'yaklasan-bitis',
      tur: 'bilgi',
      metin: `${yakin.length} kampanya 30 gün içinde sona eriyor; en yakını ${yakin[0].kalan} gün sonra.`,
    });
  }

  const donusum = ogeler.filter((o) => o.product.terim_esleme_uygulandi).length;
  if (donusum > 0) {
    bulgular.push({
      id: 'terim-donusumu',
      tur: 'bilgi',
      metin: `${donusum} metinde konvansiyonel terim tespit edilip katılım karşılığına dönüştürüldü.`,
    });
  }

  return bulgular;
};
