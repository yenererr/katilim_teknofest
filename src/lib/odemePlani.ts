/**
 * Katılım finansmanı ödeme planı — eşit taksit (anüite).
 *
 * Aylık brüt oran = kâr × (1 + KKDF + BSMV). Taksit bu oranla hesaplanır;
 * her dönemde kâr kalan anapara üzerinden alınır, KKDF/BSMV kârın yüzdesidir.
 */

export type OdemePlaniOpts = {
  amountTl: number;
  termMonths: number;
  /** Aylık kâr payı yüzdesi (3 = %3) */
  profitRatePercent: number;
  financingType?: string;
  /** Tahsis ücreti oranı (varsayılan %0,5) */
  allocationFeeRate?: number;
  /** İpotek / ekspertiz (TL) */
  mortgageFeeTl?: number;
  appraisalFeeTl?: number;
  kkdfRate?: number;
  bsmvRate?: number;
};

export type OdemePlaniSatir = {
  taksitNo: number;
  taksitTutari: number;
  anaPara: number;
  kalanAnaPara: number;
  karTutari: number;
  kkdfTutari: number;
  bsmvTutari: number;
};

export type OdemePlaniDetay = {
  finansmanTutari: number;
  taksitSayisi: number;
  taksitTutari: number;
  aylikKarOrani: number;
  aylikMaliyetOrani: number;
  yillikMaliyetOrani: number;
  efektifYillikKarOrani: number;
  odenecekToplamTutar: number;
  finansmanTahsisUcreti: number;
  ipotekTesisBedeli: number;
  ekspertizUcreti: number;
  toplamMasraf: number;
  rows: OdemePlaniSatir[];
  uyari: string | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function formatTl(n: number): string {
  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

function formatPct(n: number, digits = 4): string {
  return `%${n.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** Ürün tipine göre KKDF / BSMV (ihtiyaç: %15 / %15). */
export function vergiOranlari(financingType?: string): {
  kkdfRate: number;
  bsmvRate: number;
} {
  const t = financingType || "";
  // Konut / arsa / işyeri: sıklıkla KKDF yok veya düşük; ihtiyaç ve taşıtta %15+%15 yaygın.
  if (
    t.startsWith("konut") ||
    t === "arsa_finansmani" ||
    t === "isyeri_finansmani"
  ) {
    return { kkdfRate: 0, bsmvRate: 0.15 };
  }
  return { kkdfRate: 0.15, bsmvRate: 0.15 };
}

function ihtiyacVadeUyarisi(amountTl: number, financingType?: string): string | null {
  if (financingType !== "ihtiyac_finansmani") return null;
  return (
    "125.000 TL ve üzerindeki İhtiyaç Finansmanı için en fazla 24 ay, " +
    "250.000 TL üzerindeki İhtiyaç Finansmanı için en fazla 12 ay taksit yapılabilmektedir."
  );
}

/** Aylık IRR (net kullandırılan tutar = finansman − tahsis). */
function aylikIrr(principalNet: number, payments: number[]): number {
  if (principalNet <= 0 || payments.length === 0) return 0;
  const npv = (rate: number) => {
    let v = -principalNet;
    for (let i = 0; i < payments.length; i++) {
      v += payments[i] / Math.pow(1 + rate, i + 1);
    }
    return v;
  };
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function hesaplaOdemePlani(opts: OdemePlaniOpts): OdemePlaniDetay {
  const {
    amountTl,
    termMonths,
    profitRatePercent,
    financingType,
    allocationFeeRate = 0.005,
    mortgageFeeTl = 0,
    appraisalFeeTl = 0,
  } = opts;

  const { kkdfRate, bsmvRate } = {
    ...vergiOranlari(financingType),
    ...(opts.kkdfRate != null ? { kkdfRate: opts.kkdfRate } : {}),
    ...(opts.bsmvRate != null ? { bsmvRate: opts.bsmvRate } : {}),
  };

  const r = profitRatePercent / 100;
  const rGross = r * (1 + kkdfRate + bsmvRate);
  const n = termMonths;

  if (!(amountTl > 0) || !(n > 0) || !(r >= 0)) {
    throw new Error("Geçersiz ödeme planı parametreleri.");
  }

  let installment =
    rGross === 0
      ? amountTl / n
      : (amountTl * rGross * Math.pow(1 + rGross, n)) /
        (Math.pow(1 + rGross, n) - 1);
  installment = round2(installment);

  let remaining = amountTl;
  const rows: OdemePlaniSatir[] = [];

  for (let i = 1; i <= n; i++) {
    const kar = round2(remaining * r);
    const kkdf = round2(kar * kkdfRate);
    const bsmv = round2(kar * bsmvRate);
    let anaPara: number;
    let taksitTutari: number;
    if (i === n) {
      anaPara = round2(remaining);
      taksitTutari = round2(anaPara + kar + kkdf + bsmv);
    } else {
      anaPara = round2(installment - kar - kkdf - bsmv);
      taksitTutari = installment;
    }
    remaining = round2(Math.max(0, remaining - anaPara));
    rows.push({
      taksitNo: i,
      taksitTutari,
      anaPara,
      kalanAnaPara: remaining,
      karTutari: kar,
      kkdfTutari: kkdf,
      bsmvTutari: bsmv,
    });
  }

  const odenecekToplamTutar = round2(
    rows.reduce((s, row) => s + row.taksitTutari, 0),
  );
  // Tahsis: oran + BSMV (ör. %0,5 + %15 BSMV → 575 TL / 100.000)
  const finansmanTahsisUcreti = round2(
    amountTl * allocationFeeRate * (1 + bsmvRate),
  );
  const ipotekTesisBedeli = round2(mortgageFeeTl);
  const ekspertizUcreti = round2(appraisalFeeTl);
  const toplamMasraf = round2(
    finansmanTahsisUcreti + ipotekTesisBedeli + ekspertizUcreti,
  );

  const payments = rows.map((row) => row.taksitTutari);
  const aylikMaliyet = aylikIrr(
    Math.max(amountTl - finansmanTahsisUcreti, 1),
    payments,
  );
  const yillikMaliyet = Math.pow(1 + aylikMaliyet, 12) - 1;

  return {
    finansmanTutari: amountTl,
    taksitSayisi: n,
    taksitTutari: rows[0]?.taksitTutari ?? installment,
    aylikKarOrani: profitRatePercent,
    aylikMaliyetOrani: round2(aylikMaliyet * 10000) / 100, // 4 hane yüzdesi için
    yillikMaliyetOrani: round2(yillikMaliyet * 10000) / 100,
    efektifYillikKarOrani: round2(profitRatePercent * 12 * 100) / 100,
    odenecekToplamTutar,
    finansmanTahsisUcreti,
    ipotekTesisBedeli,
    ekspertizUcreti,
    toplamMasraf,
    rows,
    uyari: ihtiyacVadeUyarisi(amountTl, financingType),
  };
}

/** API / UI için biçimlendirilmiş ödeme planı. */
export function bicimleOdemePlani(detay: OdemePlaniDetay) {
  return {
    baslik: "Detaylı Bilgi ve Ödeme Planı",
    ozet: [
      { label: "Finansman Tutarı", value: formatTl(detay.finansmanTutari) },
      { label: "Taksit Sayısı", value: String(detay.taksitSayisi) },
      { label: "Taksit Tutarı", value: formatTl(detay.taksitTutari) },
      { label: "Aylık Kâr Oranı", value: formatPct(detay.aylikKarOrani, 4) },
      { label: "Aylık Maliyet Oranı", value: formatPct(detay.aylikMaliyetOrani, 4) },
      { label: "Yıllık Maliyet Oranı", value: formatPct(detay.yillikMaliyetOrani, 4) },
      {
        label: "Efektif Yıllık Kar Oranı",
        value: formatPct(detay.efektifYillikKarOrani, 4),
      },
      { label: "Ödenecek Toplam Tutar", value: formatTl(detay.odenecekToplamTutar) },
      {
        label: "Finansman Tahsis Ücreti",
        value: formatTl(detay.finansmanTahsisUcreti),
      },
      { label: "İpotek Tesis Bedeli", value: formatTl(detay.ipotekTesisBedeli) },
      { label: "Ekspertiz Ücreti", value: formatTl(detay.ekspertizUcreti) },
      { label: "Toplam Masraf", value: formatTl(detay.toplamMasraf) },
    ],
    tableHead: [
      "Taksit No",
      "Taksit Tutarı",
      "Ana Para",
      "Kalan Ana Para",
      "Kâr Tutarı",
      "KKDF",
      "BSMV",
    ],
    rows: detay.rows.map((r) => ({
      taksitNo: String(r.taksitNo),
      taksitTutari: formatTl(r.taksitTutari),
      anaPara: formatTl(r.anaPara),
      kalanAnaPara: formatTl(r.kalanAnaPara),
      karTutari: formatTl(r.karTutari),
      kkdfTutari: formatTl(r.kkdfTutari),
      bsmvTutari: formatTl(r.bsmvTutari),
    })),
    uyari: detay.uyari,
    detay,
  };
}
