import { describe, expect, it } from 'vitest';
import {
  alisverisPuaniCikar,
  hedefKitleCikar,
  indirimOraniCikar,
  kampanyaBaslangicCikar,
  kuralTabanliCikar,
} from '../extract';
import { KAMPANYA_TURU_ETIKET, kampanyaTuruBelirle } from '../kampanyaTuru';
import { ruleBasedExtractRecords } from '../../server/services/scraper/evrenExtractor';

/**
 * Şartname 5.3 (finansal bilgi çıkarımı) ve 5.4 (kampanya türü) için
 * eksik kalan alanların testleri. Örnek metinler şartnamedeki senaryo
 * metinlerinden ve banka sayfalarındaki yaygın ifade biçimlerinden alındı.
 */
describe('hedef kitle segmenti', () => {
  it('yeni müşteri çağrısını segment olarak yakalar', () => {
    const b = hedefKitleCikar(
      'Bankamızda hesabı olmayan yeni müşterilere özel %1,89 kâr payı oranı sunulmaktadır.',
    );
    expect(b.deger).toContain('yeni_musteri');
    expect(b.kanit).toContain('yeni müşterilere');
  });

  it('maaş müşterisi ve emekli segmentlerini birlikte döndürür', () => {
    const b = hedefKitleCikar(
      'Maaş müşterilerimize özel avantaj. Emekli müşterilerimiz de kampanyadan yararlanabilir.',
    );
    expect(b.deger).toEqual(expect.arrayContaining(['maas_musterisi', 'emekli']));
  });

  it('mevcut müşteri ifadesini ayırır', () => {
    expect(hedefKitleCikar('Mevcut müşterilerimize özel taksit fırsatı.').deger).toContain(
      'mevcut_musteri',
    );
  });

  it('sinyal yoksa boş liste döner — "herkes" varsayımı yapılmaz', () => {
    expect(hedefKitleCikar('Konut finansmanında 120 aya kadar vade.').deger).toEqual([]);
  });
});

describe('indirim oranı', () => {
  it('indirimi kâr payı oranından ayrı alan olarak çıkarır', () => {
    const metin = 'Kampanya kapsamında akaryakıt alışverişlerinde %20 indirim uygulanır.';
    expect(indirimOraniCikar(metin).deger).toBe(0.2);
    // Aynı metinden kâr payı oranı üretilmemeli.
    expect(kuralTabanliCikar(metin).kar_payi_orani.deger).toBeNull();
  });

  it('indirim geçmeyen metinde boş döner', () => {
    expect(indirimOraniCikar('%1,89 kâr payı oranı ile konut finansmanı.').deger).toBeNull();
  });
});

describe('alışveriş puanı', () => {
  it('puan miktarını ve birimini çıkarır', () => {
    const b = alisverisPuaniCikar('Kampanyaya katılan müşterilerimize 5.000 puan hediye edilir.');
    expect(b.deger).toBe(5000);
    expect(b.birim).toBe('puan');
  });

  it('mil ödülünü ayırt eder', () => {
    expect(alisverisPuaniCikar('Her alışverişte 1.000 mil kazanın.').birim).toBe('mil');
  });

  it('TL cinsinden puanı tl_puan olarak işaretler', () => {
    const b = alisverisPuaniCikar('Alışverişlerinizde 750 TL puan kazanın.');
    expect(b.deger).toBe(750);
    expect(b.birim).toBe('tl_puan');
  });
});

describe('kampanya başlangıç tarihi', () => {
  it('tarih aralığının ilk tarihini başlangıç kabul eder', () => {
    const b = kampanyaBaslangicCikar(
      'Kampanya 01.09.2026 - 31.12.2026 tarihleri arasında geçerlidir.',
    );
    expect(b.iso).toBe('2026-09-01');
  });

  it('yazılı tarih aralığını çözer', () => {
    const b = kampanyaBaslangicCikar(
      'Kampanya 1 Eylül 2026 ile 31 Aralık 2026 tarihleri arasında geçerlidir.',
    );
    expect(b.iso).toBe('2026-09-01');
  });

  it('tek tarih varsa güveni düşürür — o tarih bitiş olabilir', () => {
    const b = kampanyaBaslangicCikar('Kampanya 31 Aralık 2026 tarihine kadar geçerlidir.');
    expect(b.guven).toBeLessThan(0.9);
  });
});

describe('kampanya türü — şartname 5.4', () => {
  it('sekiz türün tamamı etiketlidir', () => {
    expect(Object.keys(KAMPANYA_TURU_ETIKET)).toHaveLength(8);
  });

  const vakalar: Array<[string, string]> = [
    ['Yeni ev sahibi olmak isteyen müşterilerimize özel konut finansmanı fırsatı.', 'konut_finansmani_kampanyasi'],
    ['Sıfır km taşıt finansmanında 48 aya kadar vade.', 'tasit_finansmani_kampanyasi'],
    ['İhtiyaç finansmanında masrafsız kullanım imkânı.', 'ihtiyac_finansmani_kampanyasi'],
    ['Kredi kartınızla yapacağınız harcamalarda ek taksit.', 'kart_kampanyasi'],
    ['Marketlerde alışveriş puanı kazanma fırsatı.', 'alisveris_puani_kampanyasi'],
    ['Katılma hesabı açan müşterilerimize özel kâr payı getirisi.', 'yatirim_urunu_kampanyasi'],
    ['Bankamıza yeni müşteri olanlara hoş geldin hediyesi.', 'yeni_musteri_kampanyasi'],
    ['Finansman kullanımlarında tahsis ücreti avantajı.', 'finansman_kampanyasi'],
  ];

  for (const [metin, beklenen] of vakalar) {
    it(`"${metin.slice(0, 34)}…" → ${beklenen}`, () => {
      expect(kampanyaTuruBelirle({ metin }).tur).toBe(beklenen);
    });
  }

  it('kampanya sinyali olmayan metne tür atamaz', () => {
    expect(kampanyaTuruBelirle({ metin: 'Şubelerimiz hafta içi 09:00-17:00 arası açıktır.' }).tur).toBeNull();
  });

  it('başlık ve URL gövde metni olmadan da tür belirler', () => {
    expect(
      kampanyaTuruBelirle({
        baslik: 'Konut Finansmanı Kampanyası',
        url: 'https://www.ornek.com.tr/kampanyalar/konut-finansmani',
      }).tur,
    ).toBe('konut_finansmani_kampanyasi');
  });
});

describe('toplu çıkarım şartname alanlarını içerir', () => {
  it('senaryo metninden hedef kitle, avantaj ve masraf durumunu birlikte üretir', () => {
    const c = kuralTabanliCikar(
      'Yeni ev sahibi olmak isteyen müşterilerimize özel %1,89 kâr payı oranı ile 120 aya kadar ' +
        'konut finansmanı fırsatı sunulmaktadır. Kampanya kapsamında 50.000 TL’ye kadar dosya ' +
        'masrafı alınmamaktadır. Kampanya 31 Aralık 2026 tarihine kadar geçerlidir.',
    );
    expect(c.kar_payi_orani.deger).toBeCloseTo(0.0189, 4);
    expect(c.vade_ay.max).toBe(120);
    expect(c.masraf_durumu).toBe('Dosya masrafı yok');
    expect(c.hedef_kitle.deger).toEqual([]);
  });
});

describe('çıkarılan kayıt alanları eşleşebilir kodlar taşır', () => {
  it('productType karşılaştırma katmanının beklediği kodu üretir', () => {
    const [kayit] = ruleBasedExtractRecords({
      bankId: 'ornek-banka',
      sourceUrl: 'https://www.ornek.com.tr/kampanyalar/konut-finansmani',
      text:
        'Yeni ev sahibi olmak isteyen müşterilerimize özel %1,89 kâr payı oranı ile 120 aya ' +
        'kadar konut finansmanı fırsatı. Kampanya kapsamında 50.000 TL’ye kadar dosya masrafı ' +
        'alınmamaktadır.',
      categoryHint: 'housing_finance',
    });

    // Serbest metin ("Konut finansmanı") yazılırsa kayıt aday toplamada eşleşmez.
    expect(kayit.productType).toBe('konut_finansmani');
    expect(kayit.campaignType).toBe('konut_finansmani_kampanyasi');
    expect(kayit.feeStatus).toBe('Dosya masrafı yok');
    expect(kayit.campaignAdvantage).toBeTruthy();
  });
});

describe('kâr payı oranı — uzun bilgilendirme metinleri', () => {
  it('oranı bloğun tamamına değil, yakın çevresine göre değerlendirir', () => {
    // Bilgilendirme formları tek bir dev "cümle" olarak ayrışıyor. Blokta
    // geçen KKDF/BSMV, hemen yanında etiketlenmiş oranı elememeli.
    const form =
      'Finansman Tutarı : 10.000 TL Taksit Sayısı : 12 ay Aylık Kar payı oranı : %1,20 ' +
      'Efektif Yıllık Kar Payı Oranı : %23,52 KKDF ve BSMV oranları %15 olarak uygulanır ' +
      've gecikme cezası oranı ayrıca hesaplanır.';
    const c = kuralTabanliCikar(form);
    expect(c.kar_payi_orani.deger).toBeCloseTo(0.012, 6);
    expect(c.kar_payi_orani.periyot).toBe('aylik');
  });

  it('efektif yıllık oranı kampanya oranı yerine koymaz', () => {
    const form =
      'Aylık kâr payı oranı : %2,50 Efektif Yıllık Kâr Payı Oranı : %34,49 ' +
      'ihtiyaç finansmanı için geçerlidir.';
    expect(kuralTabanliCikar(form).kar_payi_orani.deger).toBeCloseTo(0.025, 6);
  });

  it('kâr paylaşım oranını kâr payı oranı sanmaz', () => {
    // Katılma hesabında paylaşım oranı bambaşka bir kavramdır (şartname 5.5).
    const metin =
      'Örneğin, 99 kâr paylaşım oranı, vade sonunda oluşan kârın %99’unun ' +
      'müşteriye, %1’inin ise bankaya aktarılacağını ifade eder.';
    expect(kuralTabanliCikar(metin).kar_payi_orani.deger).toBeNull();
  });

  it('etiketlenmiş %0 oranı geçerli değerdir', () => {
    const metin =
      'Güncelleme tarihi 01.01.2026. Aylık akdi kâr payı oranı %0. ' +
      'Bireysel kredi kartları için geçerlidir.';
    expect(kuralTabanliCikar(metin).kar_payi_orani.deger).toBe(0);
  });

  it('etiketsiz %0 değerini oran saymaz', () => {
    const metin =
      'Konut finansmanı kampanyasında ilk taksit %0 peşinatla ertelenebilir; ' +
      'kâr payı oranı şubelerimizden öğrenilebilir.';
    expect(kuralTabanliCikar(metin).kar_payi_orani.deger).toBeNull();
  });
});

describe('finansman tutarı — pencere tabanlı bağlam kontrolü', () => {
  it('harcama eşiği finansman tutarı sayılmamalı', () => {
    // "10.000 TL ve üzeri ilk harcamaya" bir harcama koşuludur, finansman
    // tutarı değildir. Gold veri seti bu ayrımı açıkça belirtmiş.
    const metin =
      'İhtiyaç Finansmanı kampanyasında 10.000 TL ve üzeri ilk harcamaya ' +
      'özel 500 TL hediye çeki kazanın.';
    expect(kuralTabanliCikar(metin).tutar.min).toBeNull();
    expect(kuralTabanliCikar(metin).tutar.max).toBeNull();
  });

  it('hesap bakiyesi koşulu elenmelidir', () => {
    // "minimum 10.000 TL bulunması yeterlidir" bir hesap açılış koşuludur.
    const metin =
      'Hadi Black Kredi Kartı\'na sahip olman ve Mega Günlük Hesabında ' +
      'minimum 10.000 TL bulunması yeterlidir.';
    expect(kuralTabanliCikar(metin).tutar.min).toBeNull();
  });

  it('toplam geri ödeme tutarı elenmelidir', () => {
    // Ödeme planı bilgilendirmesi; finansman miktarı değil, toplam geri ödeme.
    const metin =
      'Ödenecek toplam tutar: 13.882 TL. Bu Ödeme Planı bilgi amaçlıdır.';
    expect(kuralTabanliCikar(metin).tutar.min).toBeNull();
  });

  it('ücret tablosu tutarı elenmelidir', () => {
    // Ücret tablosu; ekstre ücreti finansman tutarı değildir.
    const metin =
      'Özel Sistem Uyumlu Ekstre Ücreti 500 TL 5.000 TL Aylık sabit tutar tahsil edilmektedir.';
    expect(kuralTabanliCikar(metin).tutar.min).toBeNull();
  });

  it('alışveriş finansmanı tutarını yakalamalı', () => {
    // Kuveyt Türk alışveriş finansmanı sayfalarındaki tutarlar yakalanmalı.
    const metin =
      'Alışveriş Finansmanı ödeme seçeneği ile 200.000 TL\'ye kadar olan ' +
      'alışverişlerinizde 36 aya varan vade imkanından yararlanabilirsiniz.';
    const sonuc = kuralTabanliCikar(metin).tutar;
    // "200.000 TL'ye kadar" → min veya max olarak 200000 beklenir.
    expect(sonuc.min ?? sonuc.max).toBe(200000);
  });

  it('doğrudan etiketlenmiş tutarı yakalamalı', () => {
    // "Finansman Miktarı : 10.000 TL" gibi etiketli değerler en güvenilir.
    const metin =
      'Hesaplama Örneği Finansman Miktarı : 10.000 TL Taksit Sayısı : 12 ay ' +
      'Aylık Kar payı oranı : %1,20';
    const sonuc = kuralTabanliCikar(metin).tutar;
    expect(sonuc.min).toBe(10000);
  });

  it('kampanya dışı hesap ürünü sayfasında tutar üretmemeli', () => {
    // Günlük hesap sayfalarındaki limit bilgisi finansman tutarı değildir.
    const metin =
      'TL Günlük Hesapla ilgili cari hesap işlem limitleri dahilinde ' +
      'minimum tutar en az 5.000 TL, en fazla 5.500.000 TL\'dir.';
    expect(kuralTabanliCikar(metin).tutar.min).toBeNull();
  });

  it('promosyon maaş tutarı elenmelidir', () => {
    // Emekli promosyonundaki maaş kademeleri finansman tutarı değildir.
    const metin =
      'Promosyon Taahhütnamesinin imzalanması sonrasında; ' +
      'bir aylık emekli maaşı 9.999 TL\'ye kadarsa 5.000 TL; ' +
      '10.000 TL – 14.999 TL arasındaysa 8.000 TL promosyon verilir.';
    expect(kuralTabanliCikar(metin).tutar.min).toBeNull();
  });

  it('mevcut doğru çıkarımları korur — finansman tutarı aralığı', () => {
    // Gerçek bir finansman tutarı aralığı doğru çıkarılmalı.
    const metin =
      'Konut finansmanı kampanyasında 100.000 TL ile 500.000 TL arasında ' +
      'finansman kullandırımı yapılmaktadır.';
    const sonuc = kuralTabanliCikar(metin).tutar;
    expect(sonuc.min).toBe(100000);
    expect(sonuc.max).toBe(500000);
  });
});
