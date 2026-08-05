import { asciiKatla } from './normalize';

/**
 * Katılım bankacılığı terminoloji sözlüğü — sözlükbirim (leksikon) tabanlı
 * terim normalizasyonu.
 *
 * Türkçe eklemeli bir dil olduğundan sabit kelime araması yetmez:
 *   "faiz", "faizi", "faizde", "faizli", "faiz oranı"
 *   "kredi", "krediniz", "kredide", "kredili"
 * Bu yüzden eşleştirme kök + izin verilen ek deseniyle yapılır.
 */

export interface TerimKaydi {
  /** Konvansiyonel bankacılık terimi (kök hâli) */
  konvansiyonel: string;
  /** Katılım bankacılığındaki karşılığı */
  katilim: string;
  /** Şemada eşlendiği alan */
  alan: string;
  /** Ek kök varyantları */
  varyantlar?: string[];
}

export const TERIM_SOZLUGU: TerimKaydi[] = [
  {
    konvansiyonel: 'faiz',
    katilim: 'kâr payı',
    alan: 'kar_payi_orani',
    varyantlar: ['faiz oranı', 'faiz orani', 'faiz indirimi'],
  },
  {
    konvansiyonel: 'kredi',
    katilim: 'finansman',
    alan: 'urun_turu',
    varyantlar: ['kredi kullanımı', 'konut kredisi', 'taşıt kredisi', 'ihtiyaç kredisi'],
  },
  {
    konvansiyonel: 'mevduat',
    katilim: 'katılım fonu',
    alan: 'urun_turu',
    varyantlar: ['vadeli mevduat', 'mevduat hesabı'],
  },
  {
    konvansiyonel: 'dosya masrafı',
    katilim: 'tahsis ücreti',
    alan: 'tahsis_ucreti',
    varyantlar: ['dosya masrafi', 'dosya ücreti', 'masraf'],
  },
  {
    konvansiyonel: 'kart puanı',
    katilim: 'ödül',
    alan: 'odul_miktari',
    varyantlar: ['kart puani', 'bonus puan', 'puan kazanımı'],
  },
];

/** Türkçe çekim eklerine toleranslı desen üretir. */
const kokDeseni = (kok: string): RegExp => {
  const katlanmis = asciiKatla(kok).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Kelimeler arası boşluk esnek; sonunda en fazla üç heceye kadar ek olabilir
  const govde = katlanmis.replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^\\p{L}])(${govde})(\\p{L}{0,6})(?=$|[^\\p{L}])`, 'giu');
};

export interface TerimBulgusu {
  kayit: TerimKaydi;
  /** Metinde geçtiği hâli */
  ham: string;
  baslangic: number;
  bitis: number;
}

/**
 * Metinde konvansiyonel terimleri arar.
 * Arama ASCII katlanmış metin üzerinde yapılır; böylece "FAİZ", "faiz",
 * "Faizi" ve "kar payi" gibi varyantlar aynı şekilde yakalanır.
 * Dönen indeksler kaynak metne aittir (katlama karakter sayısını değiştirmez).
 */
export const terimleriBul = (metin: string): TerimBulgusu[] => {
  const katlanmis = asciiKatla(metin);
  const bulgular: TerimBulgusu[] = [];
  const kullanilanAralik: [number, number][] = [];

  const cakisiyor = (b: number, s: number) =>
    kullanilanAralik.some(([kb, ks]) => b < ks && s > kb);

  TERIM_SOZLUGU.forEach((kayit) => {
    const kokler = [kayit.konvansiyonel, ...(kayit.varyantlar ?? [])].sort(
      (a, b) => b.length - a.length,
    );

    kokler.forEach((kok) => {
      const desen = kokDeseni(kok);
      let eslesme: RegExpExecArray | null;
      while ((eslesme = desen.exec(katlanmis)) !== null) {
        const onEk = eslesme[1] ?? '';
        const baslangic = eslesme.index + onEk.length;
        const bitis = baslangic + (eslesme[2]?.length ?? 0) + (eslesme[3]?.length ?? 0);
        if (!cakisiyor(baslangic, bitis)) {
          kullanilanAralik.push([baslangic, bitis]);
          bulgular.push({
            kayit,
            ham: metin.slice(baslangic, bitis),
            baslangic,
            bitis,
          });
        }
      }
    });
  });

  return bulgular.sort((a, b) => a.baslangic - b.baslangic);
};

/** Aynı alana ait tekrarları eleyerek özet döndürür. */
export const terimOzeti = (
  metin: string,
): { orig: string; mapped: string; alan: string; adet: number }[] => {
  const bulgular = terimleriBul(metin);
  const gruplar = new Map<string, { orig: string; mapped: string; alan: string; adet: number }>();

  bulgular.forEach((b) => {
    const anahtar = b.kayit.konvansiyonel;
    const mevcut = gruplar.get(anahtar);
    if (mevcut) {
      mevcut.adet += 1;
    } else {
      gruplar.set(anahtar, {
        orig: b.kayit.konvansiyonel,
        mapped: `${b.kayit.katilim} (${b.kayit.alan})`,
        alan: b.kayit.alan,
        adet: 1,
      });
    }
  });

  return Array.from(gruplar.values());
};

/* ------------------------------------------------------------------ */
/* Olumsuzluk tespiti                                                  */
/* ------------------------------------------------------------------ */

/**
 * "Tahsis ücreti alınmaz" · "dosya masrafı yoktur" gibi ifadelerde
 * olumsuzluk kapsamını tespit eder. Bu ifadeler şemada 0 değerine karşılık
 * gelir — pozitif bir sayı aranarak bulunamazlar.
 */
/**
 * Türkçede olumsuzluk çekim ekiyle taşınır: -maz/-mez (geniş zaman),
 * -mıyor/-muyor (şimdiki zaman), -mama-/-meme- (mastar olumsuzu).
 * Kritik ayrım: "alınmaz" olumsuz, "alınmaktadır" olumludur — naif bir
 * "alınm" araması ikisini de yakalar ve ücreti yanlışlıkla sıfırlar.
 */
const OLUMSUZ_KALIPLAR = [
  /\p{L}+m(az|ez)\b/u, // alınmaz, edilmez, yansıtılmaz, uygulanmaz
  /\p{L}+m[iu]yor\b/u, // alınmıyor, uygulanmıyor
  /\p{L}+mam\p{L}*/u, // alınmamakta, alınmamıştır
  /\p{L}+mem\p{L}*/u, // edilmemekte
  /\byok(tur)?\b/,
  /\bmasrafsiz\b/,
  /\bucretsiz\b/,
  /\bsifir\b/,
];

export const olumsuzlukVarMi = (cumle: string): boolean => {
  const katlanmis = asciiKatla(cumle);
  return OLUMSUZ_KALIPLAR.some((desen) => desen.test(katlanmis));
};
