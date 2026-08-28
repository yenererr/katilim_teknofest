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
