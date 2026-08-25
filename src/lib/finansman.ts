import { FinansmanTeklifi, FinansmanTuru, TEKLIFLER } from '../data/piyasa';

/**
 * Finansman hesapları — saf fonksiyonlar, React içermez.
 * Eşit taksitli (anüite) ödeme planı: murabaha kâr payı da aynı
 * anüite formülüyle taksitlendirilir.
 */

/** Anüite taksiti: A = P·i / (1 − (1+i)^−n) */
export const aylikTaksit = (anapara: number, aylikOran: number, vadeAy: number): number => {
  if (vadeAy <= 0) return 0;
  if (aylikOran <= 0) return anapara / vadeAy;
  const k = Math.pow(1 + aylikOran, -vadeAy);
  return (anapara * aylikOran) / (1 - k);
};

export interface TeklifSatiri {
  bankaId: string;
  aylikKarPayi: number;
  taksit: number;
  toplamOdeme: number;
  tahsisUcreti: number;
  /** Tahsis dâhil toplam maliyet — sıralama bunun üzerinden yapılır */
  toplamMaliyet: number;
  kampanyaliMi: boolean;
  /** Vade bankanın azami vadesini aşıyorsa teklif verilemez */
  uygunMu: boolean;
}

export const tahsisHesapla = (teklif: FinansmanTeklifi, tutar: number): number =>
  teklif.tahsisSabit ?? Math.round((teklif.tahsisOran ?? 0) * tutar);

export const teklifleriHesapla = (
  tur: FinansmanTuru,
  tutar: number,
  vadeAy: number,
): TeklifSatiri[] =>
  TEKLIFLER[tur]
    .map((t) => {
      const uygunMu = vadeAy <= t.azamiVade;
      const taksit = aylikTaksit(tutar, t.aylikKarPayi, vadeAy);
      const toplamOdeme = taksit * vadeAy;
      const tahsisUcreti = tahsisHesapla(t, tutar);
      return {
        bankaId: t.bankaId,
        aylikKarPayi: t.aylikKarPayi,
        taksit,
        toplamOdeme,
        tahsisUcreti,
        toplamMaliyet: toplamOdeme + tahsisUcreti,
        kampanyaliMi: t.kampanyaliMi,
        uygunMu,
      };
    })
    .sort((a, b) => {
      if (a.uygunMu !== b.uygunMu) return a.uygunMu ? -1 : 1;
      return a.toplamMaliyet - b.toplamMaliyet;
    });

const TL0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const TL2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const tlBicim = (deger: number): string => `${TL0.format(Math.round(deger))} TL`;
export const sayiBicim = (deger: number): string => TL0.format(Math.round(deger));
export const tlBicim2 = (deger: number): string => TL2.format(deger);
export const oranBicim = (oran: number): string =>
  `%${(oran * 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
