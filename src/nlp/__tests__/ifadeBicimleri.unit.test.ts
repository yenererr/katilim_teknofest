/**
 * Şartname 5.2 — modelin farklı ifade biçimlerini katılım bankacılığı
 * terminolojisine uygun yorumlaması. Şartnamede isim isim sayılan dört ifade
 * burada kilitlenir; ikisi (avantajlı kâr payı fırsatı, düşük maliyetli
 * finansman) daha önce hiçbir sinyal üretmiyordu.
 *
 * Ayrıca 5.6'daki normalizasyon örnekleri ve Senaryo-1 metinlerinin somut
 * avantaj çıkarımı regresyona karşı korunur.
 */

import { describe, expect, it } from "vitest";
import { avantajCikar, kuralTabanliCikar } from "../extract";

describe("5.2 farklı ifade biçimleri", () => {
  it("'%2,05 kâr payı oranı' sayısal orana çözülür", () => {
    const c = kuralTabanliCikar(
      "Konut finansmanında kâr payı oranı %2,05 olarak uygulanır.",
    );
    expect(c.kar_payi_orani.deger).toBeCloseTo(0.0205, 10);
  });

  it("'avantajlı kâr payı fırsatı' niteliksel avantaj olarak tanınır", () => {
    const a = avantajCikar(
      "Konut finansmanında avantajlı kâr payı fırsatı sunulmaktadır.",
    );
    expect(a.tur).toBe("avantajli_finansman");
    expect(a.ozet).toBe("Avantajlı kâr payı");
    // Sayısal oran uydurulmaz.
    expect(a.deger).toBeNull();
  });

  it("'özel oranlı finansman' tanınır", () => {
    const a = avantajCikar("Size özel oranlı finansman imkânı sunulmaktadır.");
    expect(a.tur).toBe("avantajli_finansman");
    expect(a.ozet).toBe("Özel oranlı finansman");
  });

  it("'düşük maliyetli finansman' tanınır", () => {
    const a = avantajCikar(
      "Düşük maliyetli finansman ile ihtiyaçlarınızı karşılayın.",
    );
    expect(a.tur).toBe("avantajli_finansman");
    expect(a.ozet).toBe("Düşük maliyetli finansman");
  });

  it("avantaj sinyali olmayan nötr cümlede uydurma yapılmaz", () => {
    const a = avantajCikar(
      "Finansman başvurunuzu şubelerimizden gerçekleştirebilirsiniz.",
    );
    expect(a.tur).toBe("belirsiz");
    expect(a.ozet).toBeNull();
  });
});

describe("5.6 standart formata dönüştürme", () => {
  const oranMetinleri = [
    "Kâr payı oranı %2,05 olarak uygulanır.",
    "Kâr payı oranı % 2.05 olarak uygulanır.",
    "Kâr payı oranı 2.05 % olarak uygulanır.",
    "Kâr payı oranı yüzde 2,05 olarak uygulanır.",
  ];
  it.each(oranMetinleri)("oran formatı aynı değere çözülür: %s", (metin) => {
    const c = kuralTabanliCikar(`Konut finansmanında ${metin}`);
    expect(c.kar_payi_orani.deger).toBeCloseTo(0.0205, 10);
  });

  const tutarMetinleri = ["500 TL", "500₺", "500 Türk Lirası"];
  it.each(tutarMetinleri)("para birimi aynı değere çözülür: %s", (yazim) => {
    const c = kuralTabanliCikar(
      `İhtiyaç finansmanında tahsis ücreti ${yazim} olarak alınır.`,
    );
    expect(c.tahsis_ucreti.deger).toBe(500);
  });
});

describe("niteliksel geçiş somut avantajı gölgelemez", () => {
  it("A Bankası metninde masraf muafiyeti korunur", () => {
    // İlk cümle "özel ... fırsatı sunulmaktadır" içerir; niteliksel kural
    // önce çalışsaydı 50.000 TL'lik somut muafiyet kaybedilirdi.
    const c = kuralTabanliCikar(
      "Yeni ev sahibi olmak isteyen müşterilerimize özel %1,89 kâr payı oranı ile 120 aya kadar konut finansmanı fırsatı sunulmaktadır. Kampanya kapsamında 50.000 TL'ye kadar dosya masrafı alınmamaktadır.",
    );
    expect(c.kampanya_avantaji.tur).toBe("masraf_muafiyeti");
    expect(c.kampanya_avantaji.deger).toBe(50000);
    expect(c.masraf_durumu).toBe("Dosya masrafı yok");
  });

  it("C Bankası metninde hediye çeki korunur", () => {
    const c = kuralTabanliCikar(
      "Yeni konut alımlarına özel %1,87 kâr payı oranı ile 96 ay vadeli konut finansmanı fırsatı. Kampanya kapsamında 5.000 TL değerinde alışveriş çeki verilmektedir.",
    );
    expect(c.kampanya_avantaji.tur).toBe("hediye_ceki");
    expect(c.kampanya_avantaji.ozet).toBe("5.000 TL alışveriş çeki");
  });
});
