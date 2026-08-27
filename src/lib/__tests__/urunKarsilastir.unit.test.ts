import { describe, expect, it } from 'vitest';
import {
  yasalAzamiVade,
  canliTeklifiSatiraCevir,
  teklifleriHazirla,
  type YapilandirilmisUrun,
  type TalepKosullari,
} from '../urunKarsilastir';

/**
 * BDDK tüketici finansmanı vade sınırı ve bankaların ilan ettiği tahsis
 * ücretinin karşılaştırmaya doğru yansıdığını doğrular.
 */

describe('yasal azami vade', () => {
  it('ihtiyaç finansmanında tutara göre sınır uygular', () => {
    expect(yasalAzamiVade('ihtiyac_finansmani', 100_000)).toBe(36);
    expect(yasalAzamiVade('ihtiyac_finansmani', 125_000)).toBe(36);
    expect(yasalAzamiVade('ihtiyac_finansmani', 200_000)).toBe(24);
    expect(yasalAzamiVade('ihtiyac_finansmani', 250_000)).toBe(24);
    expect(yasalAzamiVade('ihtiyac_finansmani', 300_000)).toBe(12);
  });

  it('konut ve taşıt finansmanına bu sınır uygulanmaz', () => {
    expect(yasalAzamiVade('konut_finansmani', 3_000_000)).toBeNull();
    expect(yasalAzamiVade('tasit_finansmani', 800_000)).toBeNull();
  });
});

const talep = (tutar: number, vadeAy: number): TalepKosullari => ({
  urunTuru: 'ihtiyac_finansmani',
  tutar,
  vadeAy,
});

describe('canlı teklifte yasal sınır', () => {
  const canli = {
    bankId: 'kuveyt-turk',
    profitRatePercent: 4.01,
    monthlyInstallmentTl: 22_836.96,
    totalPaymentTl: 274_043.59,
    allocationFeeTl: 1150,
  };

  it('250.000 TL üzeri 36 ay teklifini reddeder', () => {
    expect(canliTeklifiSatiraCevir('kuveyt-turk', canli, talep(300_000, 36))).toBeNull();
  });

  it('250.000 TL üzeri 12 ay teklifini kabul eder', () => {
    const satir = canliTeklifiSatiraCevir('kuveyt-turk', canli, talep(300_000, 12));
    expect(satir).not.toBeNull();
    expect(satir!.aylikOran).toBeCloseTo(0.0401, 6);
  });
});

describe('ilan edilen tahsis ücreti', () => {
  it('servis ücret bildirmediğinde Vakıf Katılım için %0,5 uygular', () => {
    const satir = canliTeklifiSatiraCevir(
      'vakif-katilim',
      {
        bankId: 'vakif-katilim',
        profitRatePercent: 3.99,
        monthlyInstallmentTl: 22_803.69,
        totalPaymentTl: 273_644.28,
        appraisementFeeTl: 0,
        mortgageReleaseFeeTl: 0,
      },
      talep(200_000, 12),
    );
    expect(satir).not.toBeNull();
    // 200.000 * %0,5 * 1,15 (BSMV) = 1.150 TL — Kuveyt Türk'ün ucu da bunu döndürür
    expect(satir!.tahsisUcreti).toBe(1150);
    expect(satir!.toplamMaliyet).toBeCloseTo(273_644.28 + 1150, 2);
  });

  it('servis ücret bildirdiğinde onu kullanır', () => {
    const satir = canliTeklifiSatiraCevir(
      'kuveyt-turk',
      {
        bankId: 'kuveyt-turk',
        profitRatePercent: 4.01,
        monthlyInstallmentTl: 22_836.96,
        totalPaymentTl: 274_043.59,
        allocationFeeTl: 1150,
      },
      talep(200_000, 12),
    );
    expect(satir!.tahsisUcreti).toBe(1150);
  });
});

describe('doğrulanmış ürünlerde yasal sınır', () => {
  const urun: YapilandirilmisUrun = {
    bankId: 'turkiye-finans',
    productName: 'Sigortalı İhtiyaç Finansmanı (36 ay)',
    productType: 'ihtiyac_finansmani',
    profitRate: 0.0389,
    ratePeriod: 'monthly',
    minAmountTl: 50_001,
    maxAmountTl: 500_000,
    minTermMonths: 36,
    maxTermMonths: 36,
    allocationFeeValue: 0.005,
    allocationFeeType: 'percentage',
  };

  it('300.000 TL / 36 ay için teklif üretmez', () => {
    expect(teklifleriHazirla([urun], talep(300_000, 36))).toHaveLength(0);
  });

  it('100.000 TL / 36 ay için teklif üretir', () => {
    const r = teklifleriHazirla(
      [{ ...urun, minAmountTl: 50_001, maxAmountTl: 125_000 }],
      talep(100_000, 36),
    );
    expect(r).toHaveLength(1);
    // 100.000 * %0,5 * 1,15 (BSMV) = 575 TL
    expect(r[0].tahsisUcreti).toBe(575);
  });
});
