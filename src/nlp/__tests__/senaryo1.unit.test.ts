import { describe, expect, it } from 'vitest';
import { kuralTabanliCikar, kampanyaBitisCikar } from '../extract';

/**
 * Şartname (2. Senaryo) "Örnek Temsili Senaryo-1" regresyon testi.
 *
 * Üç bankanın konut finansmanı kampanya metninden, şartnamenin sayfa 12'deki
 * yapılandırılmış tablosunun birebir üretilmesi beklenir. Bu test kural tabanlı
 * yerel katmanı doğrular; dış servis veya model çağrısı içermez.
 */

const A_METIN =
  'Yeni ev sahibi olmak isteyen müşterilerimize özel %1,89 kâr payı oranı ile 120 aya kadar konut finansmanı fırsatı sunulmaktadır. Kampanya kapsamında 50.000 TL’ye kadar dosya masrafı alınmamaktadır. Kampanya 31 Aralık 2026 tarihine kadar geçerlidir.';

const B_METIN =
  'Konut finansmanında avantajlı ödeme seçenekleri. %1,95 kâr payı oranı ile 120 ay vadeye kadar finansman imkanı sunulmaktadır. Kampanya kapsamında ekspertiz ücreti banka tarafından karşılanmaktadır.';

const C_METIN =
  'Yeni konut alımlarına özel %1,87 kâr payı oranı ile 96 ay vadeli konut finansmanı fırsatı. Kampanya kapsamında 5.000 TL değerinde alışveriş çeki verilmektedir.';

/** Kampanya bitişi "bugüne" göre değerlendirildiğinden tarih sabitlenir. */
const BUGUN = new Date('2026-08-28T00:00:00+03:00');

describe('Senaryo-1 — konut finansmanı kampanya metinlerinden yapılandırılmış tablo', () => {
  it('A Bankası: oran, vade, masraf muafiyeti ve kampanya bitişini çıkarır', () => {
    const c = kuralTabanliCikar(A_METIN);
    expect(c.kar_payi_orani.deger).toBeCloseTo(0.0189, 6);
    expect(c.vade_ay.max).toBe(120);
    expect(c.tahsis_ucreti.tipi).toBe('yok');
    expect(c.masraf_durumu).toBe('Dosya masrafı yok');
    expect(c.kampanya_avantaji.ozet).toBe("50.000 TL'ye kadar masraf alınmıyor");
    expect(kampanyaBitisCikar(A_METIN, BUGUN).iso).toBe('2026-12-31');
  });

  it('B Bankası: ücretin banka tarafından karşılanmasını avantaj olarak tanır', () => {
    const c = kuralTabanliCikar(B_METIN);
    expect(c.kar_payi_orani.deger).toBeCloseTo(0.0195, 6);
    expect(c.vade_ay.max).toBe(120);
    expect(c.kampanya_avantaji.tur).toBe('ucret_karsilama');
    expect(c.masraf_durumu).toBe('Ekspertiz ücretsiz');
    expect(c.kampanya_bitis.iso).toBeNull();
  });

  it('C Bankası: hediye çekini avantaj olarak çıkarır, masrafı belirsiz bırakır', () => {
    const c = kuralTabanliCikar(C_METIN);
    expect(c.kar_payi_orani.deger).toBeCloseTo(0.0187, 6);
    expect(c.vade_ay.max).toBe(96);
    expect(c.kampanya_avantaji.tur).toBe('hediye_ceki');
    expect(c.kampanya_avantaji.ozet).toBe('5.000 TL alışveriş çeki');
    expect(c.masraf_durumu).toBe('Masraf belirtilmemiş');
  });

  it('en düşük kâr payı oranını C Bankası verir (şartname karşılaştırma kriteri)', () => {
    const oranlar = [A_METIN, B_METIN, C_METIN].map(
      (m) => kuralTabanliCikar(m).kar_payi_orani.deger as number,
    );
    expect(Math.min(...oranlar)).toBeCloseTo(0.0187, 6);
    expect(oranlar.indexOf(Math.min(...oranlar))).toBe(2);
  });

  it('en uzun vadeyi A ve B Bankası paylaşır (120 ay)', () => {
    const vadeler = [A_METIN, B_METIN, C_METIN].map((m) => kuralTabanliCikar(m).vade_ay.max);
    expect(vadeler).toEqual([120, 120, 96]);
  });
});

describe('gerçek banka metinlerinde gürültü elenmesi', () => {
  it('ücret tablosundaki komisyon oranını kâr payı saymaz', () => {
    const tablo =
      'ÜRÜN/İŞLEM PARA BİRİMİ ASGARİ TUTAR ASGARİ ORAN AZAMİ ORAN Kredi Kartına - İnternet TRY 15 % 1 Oran + Sabit Tutar şeklinde komisyon uygulanmaktadır.';
    expect(kuralTabanliCikar(tablo).kar_payi_orani.deger).toBeNull();
  });

  it('erken kapama cezasını kâr payı saymaz', () => {
    const erken =
      'Finansmanın kalan vadesi 24 aydan az ise %1 , 24 aydan fazla ise %2 oranında uygulanmaktadır.';
    expect(kuralTabanliCikar(erken).kar_payi_orani.deger).toBeNull();
  });

  it('mevduat getiri oranını finansman kâr payı saymaz', () => {
    const getiri =
      'Döviz Cinsi Ürün Adı Hoş Geldin Süresi Hoş Geldin Getiri Oranları 1-35 Gün %11 katılma hesabı';
    expect(kuralTabanliCikar(getiri).kar_payi_orani.deger).toBeNull();
  });

  it('geçmiş tarihli kampanyayı bitiş tarihi olarak döndürmez', () => {
    const gecmis = 'Kampanya 1.03.2020 tarihine kadar geçerlidir.';
    expect(kampanyaBitisCikar(gecmis, BUGUN).iso).toBeNull();
  });

  it('cümle sonu noktası ile yüzdeyi birleştirip sahte oran üretmez', () => {
    const iki = 'Konut finansmanı avantajlı. %1,95 kâr payı oranı ile finansman.';
    expect(kuralTabanliCikar(iki).kar_payi_orani.deger).toBeCloseTo(0.0195, 6);
  });
});
