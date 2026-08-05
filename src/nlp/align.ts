import { eslesmeAnahtari } from './normalize';
import { belirtecleraAyir, cumlelereBol, CumleSpan } from './segment';

/**
 * Kanıt hizalama.
 *
 * Ajanın döndürdüğü alıntı, kaynak metinle birebir aynı olmayabilir:
 * boşluk farkı, kıvrık tırnak, kısaltılmış cümle, farklı büyük/küçük harf.
 * Düz `indexOf` bu durumlarda başarısız olur ve vurgu kaybolur.
 *
 * Buradaki hizalayıcı üç aşamalıdır:
 *   1. Birebir arama (en hızlı, en kesin)
 *   2. Normalize edilmiş metin üzerinde arama
 *   3. Cümle düzeyinde belirteç örtüşmesi (Jaccard) ile en yakın cümle
 */

export interface HizalamaSonucu {
  baslangic: number;
  bitis: number;
  /** 0–1 arası eşleşme güveni */
  skor: number;
  yontem: 'birebir' | 'normalize' | 'cumle-ortusmesi';
}

/** İki belirteç kümesi arasındaki Jaccard benzerliği. */
export const jaccard = (a: string[], b: string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const kumeA = new Set(a);
  const kumeB = new Set(b);
  let kesisim = 0;
  kumeA.forEach((t) => {
    if (kumeB.has(t)) kesisim += 1;
  });
  const birlesim = kumeA.size + kumeB.size - kesisim;
  return birlesim === 0 ? 0 : kesisim / birlesim;
};

/**
 * Normalize edilmiş metindeki konumu, kaynak metindeki konuma çevirmek için
 * karakter eşlemesi kurar. `eslesmeAnahtari` karakter siler ve birleştirir,
 * bu yüzden indeksler doğrudan taşınamaz.
 */
const anahtarHaritasi = (kaynak: string): { anahtar: string; indeksler: number[] } => {
  let anahtar = '';
  const indeksler: number[] = [];

  for (let i = 0; i < kaynak.length; i += 1) {
    const karakter = kaynak[i];

    // Boşluk: art arda gelenler tek boşluğa indirilir
    if (/\s/.test(karakter)) {
      if (anahtar.length > 0 && !anahtar.endsWith(' ')) {
        anahtar += ' ';
        indeksler.push(i);
      }
      continue;
    }

    // Noktalama tamamen elenir — eslesmeAnahtari ile aynı davranış
    const parca = eslesmeAnahtari(karakter);
    if (parca === '') continue;

    for (const harf of parca) {
      anahtar += harf;
      indeksler.push(i);
    }
  }

  return { anahtar, indeksler };
};

/**
 * Alıntıyı kaynak metinde konumlandırır.
 * @param alinti Ajanın döndürdüğü kanıt cümlesi
 * @param kaynak Ham kampanya metni
 * @param esik Cümle örtüşmesi için kabul edilen en düşük skor
 */
export const hizala = (
  alinti: string,
  kaynak: string,
  esik = 0.45,
): HizalamaSonucu | null => {
  const temizAlinti = alinti.trim();
  if (temizAlinti.length < 3) return null;

  // 1. Birebir
  const dogrudan = kaynak.indexOf(temizAlinti);
  if (dogrudan !== -1) {
    return {
      baslangic: dogrudan,
      bitis: dogrudan + temizAlinti.length,
      skor: 1,
      yontem: 'birebir',
    };
  }

  // 2. Normalize edilmiş metin üzerinde
  const { anahtar, indeksler } = anahtarHaritasi(kaynak);
  const alintiAnahtar = eslesmeAnahtari(temizAlinti);
  if (alintiAnahtar.length >= 3) {
    const konum = anahtar.indexOf(alintiAnahtar);
    if (konum !== -1) {
      const sonKonum = Math.min(konum + alintiAnahtar.length - 1, indeksler.length - 1);
      return {
        baslangic: indeksler[konum],
        bitis: indeksler[sonKonum] + 1,
        skor: 0.9,
        yontem: 'normalize',
      };
    }
  }

  // 3. Cümle düzeyinde belirteç örtüşmesi
  const cumleler = cumlelereBol(kaynak);
  const alintiBelirtecleri = belirtecleraAyir(temizAlinti);
  let enIyi: { cumle: CumleSpan; skor: number } | null = null;

  cumleler.forEach((cumle) => {
    const skor = jaccard(alintiBelirtecleri, belirtecleraAyir(cumle.metin));
    if (!enIyi || skor > enIyi.skor) enIyi = { cumle, skor };
  });

  if (enIyi && (enIyi as { skor: number }).skor >= esik) {
    const secilen = enIyi as { cumle: CumleSpan; skor: number };
    return {
      baslangic: secilen.cumle.baslangic,
      bitis: secilen.cumle.bitis,
      skor: secilen.skor,
      yontem: 'cumle-ortusmesi',
    };
  }

  return null;
};

export interface HizalanmisKanit {
  alan: string;
  alinti: string;
  baslangic: number;
  bitis: number;
  skor: number;
  yontem: HizalamaSonucu['yontem'];
}

/**
 * Bir kanıt kümesini metinle hizalar ve çakışan aralıkları temizler.
 * Çakışmada yüksek skorlu olan kazanır.
 */
export const kanitlariHizala = (
  kanitlar: Record<string, string>,
  kaynak: string,
): HizalanmisKanit[] => {
  const sonuclar: HizalanmisKanit[] = [];

  Object.entries(kanitlar).forEach(([alan, alinti]) => {
    if (!alinti) return;
    const hizalama = hizala(alinti, kaynak);
    if (!hizalama) return;
    sonuclar.push({ alan, alinti, ...hizalama });
  });

  sonuclar.sort((a, b) => b.skor - a.skor || a.baslangic - b.baslangic);

  const kabul: HizalanmisKanit[] = [];
  sonuclar.forEach((aday) => {
    const cakisma = kabul.some((k) => aday.baslangic < k.bitis && aday.bitis > k.baslangic);
    if (!cakisma) kabul.push(aday);
  });

  return kabul.sort((a, b) => a.baslangic - b.baslangic);
};
