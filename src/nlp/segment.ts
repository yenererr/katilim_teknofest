import { kucult } from './normalize';

/**
 * Türkçe cümle bölütleme.
 *
 * Naif nokta bölme Türkçe finans metinlerinde çöker:
 *   "%2,05"      → ondalık ayracı
 *   "31.12.2026" → tarih
 *   "1.000.000"  → binlik ayracı
 *   "Sn." "vb." "örn." → kısaltma
 * Bu modül önce bu kalıpları korur, sonra cümle sınırlarını belirler ve
 * her cümlenin kaynak metindeki karakter aralığını (span) döndürür.
 * Kanıt hizalama katmanı bu aralıklara dayanır.
 */

/** Türkçe metinlerde cümle sonu sanılabilecek yaygın kısaltmalar. */
const KISALTMALAR = [
  'sn',
  'sy',
  'bkz',
  'vb',
  'vs',
  'örn',
  'dr',
  'prof',
  'doç',
  'av',
  'md',
  'no',
  'tel',
  'tl',
  'krş',
  'yy',
  'age',
  'bknz',
  'mah',
  'cad',
  'sok',
  'apt',
  'ltd',
  'şti',
  'a.ş',
  'max',
  'min',
];

export interface CumleSpan {
  /** Kaynak metindeki hâliyle cümle */
  metin: string;
  /** Kaynak metinde başlangıç indeksi (dahil) */
  baslangic: number;
  /** Kaynak metinde bitiş indeksi (hariç) */
  bitis: number;
}

/** Verilen konumdaki noktanın gerçek cümle sonu olup olmadığını belirler. */
const cumleSonuMu = (metin: string, i: number): boolean => {
  const karakter = metin[i];
  if (karakter !== '.' && karakter !== '!' && karakter !== '?' && karakter !== '\n') return false;
  if (karakter === '\n') return true;

  const oncesi = metin[i - 1];
  const sonrasi = metin[i + 1];

  // Ondalık veya binlik ayracı: 2.05 · 1.000.000
  if (/\d/.test(oncesi ?? '') && /\d/.test(sonrasi ?? '')) return false;

  // Tarih: 31.12.2026 — rakamdan sonra gelen nokta, ardından rakam
  if (/\d/.test(oncesi ?? '') && /^\s*\d/.test(metin.slice(i + 1, i + 3))) return false;

  // Kısaltma kontrolü: noktadan önceki kelimeyi al
  const oncekiParca = metin.slice(Math.max(0, i - 12), i);
  const sonKelime = kucult(oncekiParca).match(/[\p{L}.]+$/u)?.[0] ?? '';
  if (KISALTMALAR.includes(sonKelime.replace(/^\./, ''))) return false;

  // Tek harf + nokta (baş harf): "A. Bankası"
  if (/(^|\s)\p{L}$/u.test(oncekiParca)) return false;

  // Sıra sayısı: "1. taksit" — noktadan sonra küçük harf geliyorsa cümle sonu değil
  if (/\d$/.test(oncekiParca) && /^\s+\p{Ll}/u.test(metin.slice(i + 1, i + 3))) return false;

  // Cümle sonundan sonra boşluk, satır sonu veya metin sonu beklenir
  if (sonrasi !== undefined && !/[\s"')\]]/.test(sonrasi)) return false;

  return true;
};

/** Metni cümlelere böler ve her cümlenin karakter aralığını döndürür. */
export const cumlelereBol = (metin: string): CumleSpan[] => {
  const cumleler: CumleSpan[] = [];
  let baslangic = 0;

  for (let i = 0; i < metin.length; i += 1) {
    if (!cumleSonuMu(metin, i)) continue;

    // Ardışık noktalama ve tırnakları cümleye dâhil et
    let bitis = i + 1;
    while (bitis < metin.length && /["')\].!?]/.test(metin[bitis])) bitis += 1;

    const parca = metin.slice(baslangic, bitis);
    if (parca.trim().length > 0) {
      const onBosluk = parca.length - parca.trimStart().length;
      const arkaBosluk = parca.length - parca.trimEnd().length;
      cumleler.push({
        metin: parca.trim(),
        baslangic: baslangic + onBosluk,
        bitis: bitis - arkaBosluk,
      });
    }
    baslangic = bitis;
  }

  // Son cümle noktalama ile bitmiyorsa
  const kalan = metin.slice(baslangic);
  if (kalan.trim().length > 0) {
    const onBosluk = kalan.length - kalan.trimStart().length;
    cumleler.push({
      metin: kalan.trim(),
      baslangic: baslangic + onBosluk,
      bitis: baslangic + kalan.trimEnd().length,
    });
  }

  return cumleler;
};

/** Belirteçlere (token) ayırır — eşleştirme ve sınıflandırma için. */
export const belirtecleraAyir = (metin: string): string[] =>
  kucult(metin)
    .replace(/[^\p{L}\p{N}%,.]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);

/** Verilen karakter konumunu içeren cümleyi bulur. */
export const konumdakiCumle = (cumleler: CumleSpan[], konum: number): CumleSpan | null =>
  cumleler.find((c) => konum >= c.baslangic && konum < c.bitis) ?? null;
