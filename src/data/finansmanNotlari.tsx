import React from "react";

/** Vakıf Katılım hesaplama aracındaki türe özel dipnotlar (kod veya ürün anahtarı). */
export type FinansmanNotu = {
  metin: React.ReactNode;
};

const linkClass =
  "text-accent-600 underline underline-offset-2 hover:text-accent-700 dark:text-accent-400";

function Buradan({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
    >
      buradan
    </a>
  );
}

const IHTIYAC: FinansmanNotu = {
  metin: (
    <>
      İhtiyaç Finansmanında tahsis ücreti finansman tutarının %0,5&apos;idir. Yasal
      sınırlar kapsamında fatura değerinin %100&apos;ü kadar finansman
      kullanabilirsiniz. 125.000 TL ve üzerindeki İhtiyaç Finansmanı için en fazla
      24 ay, 250.000 TL üzerindeki İhtiyaç Finansmanı için en fazla 12 ay taksit
      yapılabilmektedir. Detaylı bilgiye{" "}
      <Buradan href="https://www.vakifkatilim.com.tr/tr/kendim-icin/finansmanlar/ihtiyac-finansmani" />{" "}
      ulaşabilirsiniz.
    </>
  ),
};

const KONUT: FinansmanNotu = {
  metin: (
    <>
      Konut Finansmanında tahsis ücreti finansman tutarının %0,5&apos;idir. Sıfır ve
      ikinci el konutlarda enerji sınıfına göre finansman tutarı değişiklik
      göstermektedir. Detaylı bilgiye{" "}
      <Buradan href="https://www.vakifkatilim.com.tr/tr/kendim-icin/finansmanlar/konut-finansmani" />{" "}
      ulaşabilirsiniz.
    </>
  ),
};

const TASIT_SIFIR: FinansmanNotu = {
  metin: (
    <>
      Taşıt Finansmanında tahsis ücreti finansman tutarının %0,5&apos;idir. Sıfır
      binek araçlar için fatura değeri 400.000 TL ve altında olan araçlar için
      fatura değerinin yüzde 70&apos;ine kadar finansman kullanılabilir, fatura
      değeri 400.000 TL&apos;yi aşan araçlar için detaylı bilgiye{" "}
      <Buradan href="https://www.vakifkatilim.com.tr/tr/kendim-icin/finansmanlar/tasit-finansmani" />{" "}
      ulaşabilirsiniz.
    </>
  ),
};

const TASIT_IKINCI: FinansmanNotu = {
  metin: (
    <>
      Taşıt Finansmanında tahsis ücreti finansman tutarının %0,5&apos;idir. İkinci
      el binek araçlar için fatura değeri 400.000 TL ve altında olan araçlar için
      fatura değerinin yüzde 70&apos;ine kadar finansman kullanılabilir, fatura
      değeri 400.000 TL&apos;yi aşan araçlar için detaylı bilgiye{" "}
      <Buradan href="https://www.vakifkatilim.com.tr/tr/kendim-icin/finansmanlar/tasit-finansmani" />{" "}
      ulaşabilirsiniz.
    </>
  ),
};

const ISYERI: FinansmanNotu = {
  metin: (
    <>
      İşyeri Finansmanında tahsis ücreti finansman tutarının %0,5&apos;idir.
      Ekspertiz değerinin %100&apos;ü kadar finansman kullanabilirsiniz.
    </>
  ),
};

const ARSA: FinansmanNotu = {
  metin: (
    <>
      Arsa Finansmanında tahsis ücreti finansman tutarının %0,5&apos;idir. Ekspertiz
      değerinin %100&apos;ü kadar finansman kullanabilirsiniz.
    </>
  ),
};

/** Ürün anahtarı (ihtiyac_finansmani, …) → dipnot */
export const FINANSMAN_NOTLARI_BY_KEY: Record<string, FinansmanNotu> = {
  ihtiyac_finansmani: IHTIYAC,
  konut_finansmani: KONUT,
  konut_finansmani_ikinci_el: KONUT,
  tasit_finansmani: TASIT_SIFIR,
  tasit_finansmani_ikinci_el: TASIT_IKINCI,
  isyeri_finansmani: ISYERI,
  arsa_finansmani: ARSA,
};

/** Banka finansman kodu (IF, K, …) → dipnot */
export const FINANSMAN_NOTLARI_BY_CODE: Record<string, FinansmanNotu> = {
  IF: IHTIYAC,
  K: KONUT,
  K2: KONUT,
  BO: TASIT_SIFIR,
  BO2: TASIT_IKINCI,
  I: ISYERI,
  A: ARSA,
};
