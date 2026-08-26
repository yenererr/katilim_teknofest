/**
 * Türkçe metin normalizasyonu — ön işleme katmanının temeli.
 *
 * JavaScript'in yerleşik `toLowerCase()` metodu Türkçe bilmez:
 *   "FAİZ".toLowerCase()  → "fai̇z"  (i + U+0307 birleşik nokta)
 *   "MASRAFI".toLowerCase() → "masrafi" (noktasız I → ASCII i)
 * Bu yüzden büyük harfli kampanya başlıklarında terim eşleme sessizce başarısız
 * olur. Bu modüldeki fonksiyonlar tüm küçültme işlemlerini tr-TR yereliyle yapar.
 */

/** Türkçe kurallarına göre küçük harfe çevirir (İ→i, I→ı). */
export const kucult = (metin: string): string => metin.toLocaleLowerCase('tr-TR');

/** Türkçe kurallarına göre büyük harfe çevirir (i→İ, ı→I). */
export const buyult = (metin: string): string => metin.toLocaleUpperCase('tr-TR');

/** Birleşik aksan işaretlerini tek koda indirger (NFC). */
export const unicodeDuzelt = (metin: string): string => metin.normalize('NFC');

const SAPKA_HARITASI: Record<string, string> = {
  â: 'a',
  Â: 'A',
  î: 'i',
  Î: 'İ',
  û: 'u',
  Û: 'U',
};

/**
 * Şapkalı harfleri sadeleştirir: "kâr payı" ile "kar payı" eşleşebilsin.
 * Kampanya metinleri pazarlama içeriğidir; imla tutarlılığı beklenemez.
 */
export const sapkaSadelestir = (metin: string): string =>
  metin.replace(/[âÂîÎûÛ]/g, (h) => SAPKA_HARITASI[h] ?? h);

const ASCII_HARITASI: Record<string, string> = {
  ı: 'i',
  ğ: 'g',
  ş: 's',
  ç: 'c',
  ö: 'o',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

/** Türkçe harfleri ASCII karşılıklarına indirger — yalnızca eşleştirme için. */
export const asciiKatla = (metin: string): string =>
  kucult(metin).replace(/[ığşçöüâîû]/g, (h) => ASCII_HARITASI[h] ?? h);

/** Kıvrık tırnak, uzun tire ve benzeri tipografik varyantları sadeleştirir. */
export const tirnakSadelestir = (metin: string): string =>
  metin
    .replace(/[‘’‛ʼ´`]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/…/g, '...');

/** Bölünmez boşluk ve tekrarlı boşlukları tek boşluğa indirir. */
export const bosluklariSadelestir = (metin: string): string =>
  metin
    .replace(/[     ]/g, ' ')
    .replace(/[​﻿]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Depolama için tam ön işleme hattı: metnin okunabilirliği korunur,
 * yalnızca görünmez ve tipografik gürültü temizlenir.
 */
export const metinTemizle = (metin: string): string =>
  bosluklariSadelestir(tirnakSadelestir(unicodeDuzelt(metin)));

/**
 * Karşılaştırma anahtarı: iki metin parçasının "aynı şeyi söyleyip
 * söylemediğini" anlamak için agresif sadeleştirme. Depolamada kullanılmaz.
 */
export const eslesmeAnahtari = (metin: string): string =>
  asciiKatla(tirnakSadelestir(unicodeDuzelt(metin)))
    // Noktalama boşlukla değil, tamamen silinir: "%2,05'ten" ve "%2,05ten"
    // aynı anahtarı üretsin diye.
    .replace(/[^\p{L}\p{N}\s%]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/* ------------------------------------------------------------------ */
/* Sayı ve para birimi normalizasyonu                                  */
/* ------------------------------------------------------------------ */

/**
 * Türkçe ve İngilizce sayı biçimlerini tek bir sayıya indirger.
 *   "2,05"        → 2.05
 *   "1.000.000"   → 1000000
 *   "5.000.000,50"→ 5000000.5
 *   "2.05"        → 2.05   (tek ondalık grup, binlik olamaz)
 */
export const sayiCoz = (ham: string): number | null => {
  const temiz = ham.replace(/[\s ]/g, '').replace(/[^\d.,-]/g, '');
  if (!temiz || !/\d/.test(temiz)) return null;

  const sonVirgul = temiz.lastIndexOf(',');
  const sonNokta = temiz.lastIndexOf('.');

  let normalize: string;
  if (sonVirgul > -1 && sonNokta > -1) {
    // İkisi de var: sonda olan ondalık ayracıdır
    normalize =
      sonVirgul > sonNokta
        ? temiz.replace(/\./g, '').replace(',', '.')
        : temiz.replace(/,/g, '');
  } else if (sonVirgul > -1) {
    const basamak = temiz.length - sonVirgul - 1;
    // "1,000" gibi üç basamaklı tek grup binlik ayracı sayılır
    normalize = basamak === 3 ? temiz.replace(/,/g, '') : temiz.replace(',', '.');
  } else if (sonNokta > -1) {
    const gruplar = temiz.split('.');
    const binlikGorunumu = gruplar.length > 2 || (gruplar[1]?.length === 3 && gruplar[0].length <= 3);
    normalize = binlikGorunumu ? temiz.replace(/\./g, '') : temiz;
  } else {
    normalize = temiz;
  }

  const deger = Number.parseFloat(normalize);
  return Number.isFinite(deger) ? deger : null;
};

const BIRLER: Record<string, number> = {
  sıfır: 0,
  bir: 1,
  iki: 2,
  üç: 3,
  dört: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
};

const ONLAR: Record<string, number> = {
  on: 10,
  yirmi: 20,
  otuz: 30,
  kırk: 40,
  elli: 50,
  altmış: 60,
  yetmiş: 70,
  seksen: 80,
  doksan: 90,
};

const CARPANLAR: Record<string, number> = {
  yüz: 100,
  bin: 1000,
  milyon: 1_000_000,
  milyar: 1_000_000_000,
};

/**
 * Yazıyla yazılmış Türkçe sayıları çözer.
 *   "beş yüz"        → 500
 *   "yüz yirmi"      → 120
 *   "iki milyon beş yüz bin" → 2500000
 * Kampanya metinlerinde "beş yüz Türk Lirası dosya masrafı" gibi kullanımlar
 * yaygın olduğundan gereklidir.
 */
export const yaziliSayiCoz = (ifade: string): number | null => {
  const kelimeler = sapkaSadelestir(kucult(ifade))
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (kelimeler.length === 0) return null;

  let toplam = 0;
  let gecerliGrup = 0;
  let herhangiEslesme = false;

  for (const kelime of kelimeler) {
    const k = asciiKatla(kelime);
    const birlerAnahtar = Object.keys(BIRLER).find((a) => asciiKatla(a) === k);
    const onlarAnahtar = Object.keys(ONLAR).find((a) => asciiKatla(a) === k);
    const carpanAnahtar = Object.keys(CARPANLAR).find((a) => asciiKatla(a) === k);

    if (birlerAnahtar) {
      gecerliGrup += BIRLER[birlerAnahtar];
      herhangiEslesme = true;
    } else if (onlarAnahtar) {
      gecerliGrup += ONLAR[onlarAnahtar];
      herhangiEslesme = true;
    } else if (carpanAnahtar) {
      const carpan = CARPANLAR[carpanAnahtar];
      herhangiEslesme = true;
      if (carpan === 100) {
        gecerliGrup = (gecerliGrup || 1) * 100;
      } else {
        toplam += (gecerliGrup || 1) * carpan;
        gecerliGrup = 0;
      }
    } else if (herhangiEslesme) {
      // Sayı dizisi bitti
      break;
    }
  }

  if (!herhangiEslesme) return null;
  return toplam + gecerliGrup;
};

/** Para birimi sembolü veya adını ISO koduna çevirir. */
export const paraBirimiCoz = (ham: string): string => {
  const k = asciiKatla(ham);
  if (/[₺]|(\btl\b)|(\btry\b)|(turk\s*lira)/.test(k)) return 'TRY';
  if (/[$]|(\busd\b)|(\bdolar\b)/.test(k)) return 'USD';
  if (/[€]|(\beur\b)|(\bavro\b)|(\beuro\b)/.test(k)) return 'EUR';
  return 'TRY';
};

/**
 * Yüzde ifadelerini ondalık orana çevirir.
 *   "%2,05" · "2.05 %" · "yüzde 2,05" → 0.0205
 */
export const yuzdeCoz = (ham: string): number | null => {
  const temiz = kucult(ham).replace(/yüzde/g, '%');
  const eslesme = temiz.match(/%\s*([\d.,]+)|([\d.,]+)\s*%/);
  if (!eslesme) return null;
  const sayi = sayiCoz(eslesme[1] ?? eslesme[2] ?? '');
  // 2.05 / 100 kayan nokta hatası üretir (0.020499999999999997) — yuvarlanır.
  return sayi === null ? null : Number((sayi / 100).toFixed(6));
};
