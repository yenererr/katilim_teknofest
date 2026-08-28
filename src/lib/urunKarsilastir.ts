import { hesaplaOdemePlani } from './odemePlani';

/**
 * Banka ürünü karşılaştırma motoru — şartname 5.7'deki beş kriteri
 * doğrulanmış yapılandırılmış ürün verisi üzerinden hesaplar.
 * Saf TypeScript; React içermez.
 */

/** /api/live/products → structuredProducts satırı */
export interface YapilandirilmisUrun {
  bankId: string;
  productName?: string | null;
  title?: string | null;
  category?: string | null;
  productType?: string | null;
  profitRate?: number | null;
  ratePeriod?: string | null;
  minAmountTl?: number | null;
  maxAmountTl?: number | null;
  minTermMonths?: number | null;
  maxTermMonths?: number | null;
  allocationFeeValue?: number | null;
  allocationFeeType?: string | null;
  rewardAmountTl?: number | null;
  rewardType?: string | null;
  campaignAdvantage?: string | null;
  paymentDeferralMonths?: number | null;
  monthlyCostRate?: number | null;
  campaignEnd?: string | null;
  campaignStatus?: string | null;
  targetSegments?: string[] | null;
  conditions?: string[] | null;
  sourceUrl?: string | null;
  evidence?: { field: string; text: string; confidence?: number }[] | null;
  payload?: YapilandirilmisUrun | string | null;
}

/** Karşılaştırma tablosunda tek bir teklif satırı. */
export interface TeklifSatiri {
  id: string;
  bankaId: string;
  urunAdi: string;
  urunTuru: string | null;
  /** Hesaplamada kullanılan aylık kâr payı oranı (ondalık: 0.0334 = %3,34) */
  aylikOran: number;
  /** Bankanın kendi ilan ettiği oran — ortak oran uygulandığında farklıdır */
  ilanOrani: number | null;
  ortakOranUygulandi: boolean;
  /** Bankanın bu ürün için ilan ettiği oran yok; ortak oranla hesaplandı */
  ilanOraniYok: boolean;
  vadeAy: number;
  /** Ürünün ilan edilen azami vadesi (ay) */
  azamiVade: number | null;
  /** Metinden çıkarılan kampanya avantajı ifadesi */
  kampanyaAvantaji: string | null;
  /** Ödemeye kaç ay sonra başlanabildiği */
  odemeErtelemeAy: number | null;
  /** Masraf durumu özeti — "Dosya masrafı yok", "1.500 ₺" gibi */
  masrafDurumu: string;
  /** Talep edilen tutar için hesaplanan aylık taksit */
  taksit: number;
  toplamOdeme: number;
  tahsisUcreti: number;
  /** Tahsis dâhil toplam maliyet — sıralamanın esası */
  toplamMaliyet: number;
  odulTl: number | null;
  kampanyaBitis: string | null;
  segmentler: string[];
  kosullar: string[];
  kaynakUrl: string | null;
  kanitlar: Record<string, string>;
}

export type KriterKey =
  | 'en_dusuk_kar_payi'
  | 'en_dusuk_taksit'
  | 'en_dusuk_maliyet'
  | 'en_dusuk_masraf'
  | 'en_yuksek_odul'
  | 'en_uzun_vade'
  | 'en_avantajli';

export interface KriterSonuc {
  key: KriterKey;
  etiket: string;
  aciklama: string;
  kazanan: TeklifSatiri | null;
  gosterim: string | null;
  degerlendirilen: number;
}

const RATE_PERIOD_AYLIK = 'monthly';

function normalizeUrun(row: YapilandirilmisUrun): YapilandirilmisUrun {
  if (!row.payload) return row;
  if (typeof row.payload === 'string') {
    try {
      return { ...row, ...(JSON.parse(row.payload) as YapilandirilmisUrun) };
    } catch {
      return row;
    }
  }
  return { ...row, ...row.payload };
}

function aktifMi(row: YapilandirilmisUrun): boolean {
  if (row.campaignStatus === 'expired') return false;
  if (!row.campaignEnd) return true;
  const ts = Date.parse(String(row.campaignEnd));
  return !Number.isFinite(ts) || ts >= Date.now();
}

function araliktaMi(deger: number, min?: number | null, max?: number | null): boolean {
  if (min != null && deger < min) return false;
  if (max != null && deger > max) return false;
  return true;
}

function kanitHaritasi(row: YapilandirilmisUrun): Record<string, string> {
  const harita: Record<string, string> = {};
  for (const k of row.evidence ?? []) {
    if (k?.field && k?.text && !harita[k.field]) harita[k.field] = k.text;
  }
  return harita;
}

/** Şartname tablosundaki "Kampanya Avantajı" sütunu. */
function kampanyaAvantaji(row: YapilandirilmisUrun): string | null {
  // Kaynakta açıkça belirtilen avantaj her zaman önceliklidir.
  if (row.campaignAdvantage) return row.campaignAdvantage;
  if (typeof row.rewardAmountTl === 'number' && row.rewardAmountTl > 0) {
    const tur = row.rewardType === 'voucher' ? 'alışveriş çeki' : 'ödül';
    return `${row.rewardAmountTl.toLocaleString('tr-TR')} TL ${tur}`;
  }
  if (row.allocationFeeValue === 0) return 'Tahsis ücreti alınmıyor';
  const kosul = (row.conditions ?? []).find((c) =>
    /(alınmaz|alınmamakta|ücretsiz|karşılan|muaf)/i.test(c),
  );
  return kosul ?? null;
}

/** Şartname tablosundaki "Masraf Durumu" sütunu. */
function masrafOzeti(oransal: number | null, tutar: number): string {
  if (tutar === 0) return 'Masraf alınmıyor';
  const tl = tutar.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Tüm bankalarda aynı birim gösterilir; oran varsa parantezde belirtilir.
  if (oransal !== null) {
    const yuzde = (oransal * 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    return `${tl} (tutarın %${yuzde}'i)`;
  }
  return `${tl} ₺`;
}

/**
 * İhtiyaç finansmanında finansman tutarına bağlı yasal azami vade.
 * Kaynak: BDDK tüketici finansmanı vade sınırlaması.
 *   125.000 TL'ye kadar  → 36 ay
 *   125.000 - 250.000 TL → 24 ay
 *   250.000 TL üzeri     → 12 ay
 */
export function yasalAzamiVade(urunTuru: string, tutar: number): number | null {
  if (urunTuru !== 'ihtiyac_finansmani') return null;
  if (tutar <= 125_000) return 36;
  if (tutar <= 250_000) return 24;
  return 12;
}

/**
 * Bankaların ilan ettiği tahsis ücreti oranları. Bankanın hesaplama servisi
 * ücreti döndürmediğinde bu tablo esas alınır — "ücret yok" varsaymak
 * toplam maliyeti olduğundan düşük gösterir.
 */
export const ILAN_EDILEN_TAHSIS_ORANLARI: Record<string, number> = {
  'vakif-katilim': 0.005,
  'turkiye-finans': 0.005,
};

/** Tahsis ücreti BSMV'ye tabidir; bankaların ilan ettiği tutar vergiyi içerir. */
const BSMV_ORANI = 0.15;

export interface TalepKosullari {
  urunTuru: string;
  tutar: number;
  vadeAy: number;
  /**
   * Kullanıcının elle girdiği aylık kâr oranı yüzdesi. Verilirse tüm bankalar
   * bu ortak oranla hesaplanır; oran farkı yerine masraf farkı karşılaştırılır.
   */
  ortakOranYuzde?: number | null;
}

/**
 * Yapılandırılmış ürünleri talep koşullarına göre süzer ve
 * her biri için ödeme planı hesaplayarak karşılaştırılabilir satıra çevirir.
 * Talebe uymayan (vade/tutar aralığı dışı, oranı olmayan) ürünler elenir.
 */
export function teklifleriHazirla(
  urunler: YapilandirilmisUrun[],
  talep: TalepKosullari,
): TeklifSatiri[] {
  const satirlar: TeklifSatiri[] = [];
  const azami = yasalAzamiVade(talep.urunTuru, talep.tutar);
  if (azami !== null && talep.vadeAy > azami) return satirlar;

  urunler.forEach((ham, index) => {
    const row = normalizeUrun(ham);
    if (!aktifMi(row)) return;
    if (row.ratePeriod !== RATE_PERIOD_AYLIK) return;
    if (typeof row.profitRate !== 'number' || row.profitRate <= 0) return;
    if (row.productType !== talep.urunTuru) return;
    if (!araliktaMi(talep.tutar, row.minAmountTl, row.maxAmountTl)) return;
    if (!araliktaMi(talep.vadeAy, row.minTermMonths, row.maxTermMonths)) return;

    const ilanOraniYuzde = row.profitRate * 100;
    // Ortak oran verildiyse her banka aynı oranla hesaplanır.
    const oranYuzde =
      talep.ortakOranYuzde != null && talep.ortakOranYuzde > 0
        ? talep.ortakOranYuzde
        : ilanOraniYuzde;
    const oransalTahsis =
      row.allocationFeeType === 'percentage' && typeof row.allocationFeeValue === 'number'
        ? row.allocationFeeValue
        : null;
    // Sabit tutarlı ücrette oranı sıfırlayıp TL'yi maliyete ayrıca ekleriz.
    const sabitTahsis =
      oransalTahsis === null && typeof row.allocationFeeValue === 'number'
        ? row.allocationFeeValue
        : 0;

    let plan;
    try {
      plan = hesaplaOdemePlani({
        amountTl: talep.tutar,
        termMonths: talep.vadeAy,
        profitRatePercent: oranYuzde,
        financingType: talep.urunTuru,
        allocationFeeRate: oransalTahsis ?? 0,
      });
    } catch {
      return;
    }

    const tahsisUcreti = oransalTahsis !== null ? plan.finansmanTahsisUcreti : sabitTahsis;

    satirlar.push({
      id: `${row.bankId}::${index}`,
      bankaId: row.bankId,
      urunAdi: row.productName || row.title || 'İsimsiz ürün',
      urunTuru: row.productType ?? null,
      aylikOran: oranYuzde / 100,
      ilanOrani: row.profitRate,
      ortakOranUygulandi: oranYuzde !== ilanOraniYuzde,
      ilanOraniYok: false,
      vadeAy: talep.vadeAy,
      azamiVade: row.maxTermMonths ?? null,
      kampanyaAvantaji: kampanyaAvantaji(row),
      odemeErtelemeAy: row.paymentDeferralMonths ?? null,
      masrafDurumu: masrafOzeti(oransalTahsis, tahsisUcreti),
      taksit: plan.taksitTutari,
      toplamOdeme: plan.odenecekToplamTutar,
      tahsisUcreti,
      toplamMaliyet: plan.odenecekToplamTutar + tahsisUcreti,
      odulTl: typeof row.rewardAmountTl === 'number' ? row.rewardAmountTl : null,
      kampanyaBitis: row.campaignEnd ?? null,
      segmentler: row.targetSegments ?? [],
      kosullar: row.conditions ?? [],
      kaynakUrl: row.sourceUrl ?? null,
      kanitlar: kanitHaritasi(row),
    });
  });

  return satirlar.sort((a, b) => a.toplamMaliyet - b.toplamMaliyet);
}

/** Bankanın kendi hesaplama servisinden dönen canlı teklif. */
export interface CanliTeklif {
  bankId?: string;
  profitRatePercent?: number | null;
  monthlyInstallmentTl?: number | null;
  totalPaymentTl?: number | null;
  appraisementFeeTl?: number | null;
  mortgageReleaseFeeTl?: number | null;
  allocationFeeTl?: number | null;
  sourceUrl?: string | null;
  available?: boolean;
  reason?: string | null;
}

/** Canlı hesaplama servisi bulunan bankalar ve uç noktaları. */
export const CANLI_HESAPLAMA_UCLARI: { bankaId: string; path: string }[] = [
  { bankaId: 'vakif-katilim', path: '/api/calculators/vakif-katilim' },
  { bankaId: 'ziraat-katilim', path: '/api/calculators/ziraat-katilim' },
  { bankaId: 'kuveyt-turk', path: '/api/calculators/kuveyt-turk' },
];

/**
 * Bankanın kendi hesaplama aracından gelen sonucu karşılaştırma satırına çevirir.
 * Bu satırlar bankanın ilan ettiği gerçek orandır; ortak oranla üretilmez.
 */
export function canliTeklifiSatiraCevir(
  bankaId: string,
  teklif: CanliTeklif,
  talep: TalepKosullari,
): TeklifSatiri | null {
  if (teklif.available === false) return null;
  const oran = teklif.profitRatePercent;
  const taksit = teklif.monthlyInstallmentTl;
  if (typeof oran !== 'number' || oran <= 0) return null;
  if (typeof taksit !== 'number' || taksit <= 0) return null;

  // Bankanın servisi yasal vade sınırını uygulamayabilir; burada zorunlu tutulur.
  const azami = yasalAzamiVade(talep.urunTuru, talep.tutar);
  if (azami !== null && talep.vadeAy > azami) return null;

  const toplamOdeme = teklif.totalPaymentTl ?? taksit * talep.vadeAy;
  const servisUcreti =
    (teklif.allocationFeeTl ?? 0) > 0
      ? teklif.allocationFeeTl!
      : (teklif.appraisementFeeTl ?? 0) + (teklif.mortgageReleaseFeeTl ?? 0);
  // Servis ücret bildirmediyse bankanın ilan ettiği oran uygulanır.
  const ilanOrani = ILAN_EDILEN_TAHSIS_ORANLARI[bankaId];
  const ilanEdilenUcret =
    ilanOrani != null
      ? Math.round(talep.tutar * ilanOrani * (1 + BSMV_ORANI) * 100) / 100
      : null;
  const tahsisUcreti = servisUcreti > 0 ? servisUcreti : (ilanEdilenUcret ?? 0);
  // Servis ücret bildirmedi ve ilan edilen oranı da bilmiyorsak "ücretsiz" demeyiz.
  const masrafBilinmiyor = servisUcreti <= 0 && ilanEdilenUcret === null;

  return {
    id: `${bankaId}::canli`,
    bankaId,
    urunAdi: 'Bankanın hesaplama aracı',
    urunTuru: talep.urunTuru,
    aylikOran: oran / 100,
    ilanOrani: oran / 100,
    ortakOranUygulandi: false,
    ilanOraniYok: false,
    vadeAy: talep.vadeAy,
    azamiVade: null,
    kampanyaAvantaji: null,
    odemeErtelemeAy: null,
    masrafDurumu: masrafBilinmiyor
      ? 'Belirtilmemiş'
      : tahsisUcreti > 0
        ? `${tahsisUcreti.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
        : 'Masraf alınmıyor',
    taksit,
    toplamOdeme,
    tahsisUcreti,
    toplamMaliyet: toplamOdeme + tahsisUcreti,
    odulTl: null,
    kampanyaBitis: null,
    segmentler: [],
    kosullar: [],
    kaynakUrl: teklif.sourceUrl ?? null,
    kanitlar: {},
  };
}

/**
 * Canlı teklifleri doğrulanmış ürün satırlarıyla birleştirir.
 * Bir banka için canlı sonuç varsa o esas alınır — bankanın kendi aracıdır.
 */
export function tekliflerBirlestir(
  canli: TeklifSatiri[],
  dogrulanmis: TeklifSatiri[],
): TeklifSatiri[] {
  const kapsanan = new Set(canli.map((s) => s.bankaId));
  const kalanlar = dogrulanmis.filter((s) => !kapsanan.has(s.bankaId));
  return [...canli, ...kalanlar].sort((a, b) => a.toplamMaliyet - b.toplamMaliyet);
}

/**
 * Finansman hesabında aynı motoru (eşit taksitli murabaha + binde 5 tahsis)
 * kullanan bankalar. Bir bankanın o ürün için ilan ettiği oran yoksa,
 * ortak oran verildiğinde bu motorla hesaplanıp karşılaştırmaya katılır.
 */
export const ORTAK_MOTOR_BANKALARI = [
  'turkiye-finans',
  'ziraat-katilim',
  'vakif-katilim',
  'albaraka',
  'kuveyt-turk',
] as const;

/** Ortak motorda varsayılan tahsis ücreti oranı (binde 5). */
const VARSAYILAN_TAHSIS_ORANI = 0.005;

/**
 * Ortak oran verildiğinde, ilan oranı bulunmayan bankaları da aynı motorla
 * hesaplayıp tabloya ekler. Bu satırlar bankanın ilan ettiği bir teklif
 * değildir; "aynı oranda maliyet ne olurdu" sorusunu yanıtlar.
 */
export function ortakMotorlaTamamla(
  mevcut: TeklifSatiri[],
  talep: TalepKosullari,
): TeklifSatiri[] {
  const oran = talep.ortakOranYuzde;
  if (oran == null || oran <= 0) return mevcut;
  const azami = yasalAzamiVade(talep.urunTuru, talep.tutar);
  if (azami !== null && talep.vadeAy > azami) return mevcut;

  const kapsanan = new Set(mevcut.map((s) => s.bankaId));
  const eklenen: TeklifSatiri[] = [];

  for (const bankaId of ORTAK_MOTOR_BANKALARI) {
    if (kapsanan.has(bankaId)) continue;

    let plan;
    try {
      plan = hesaplaOdemePlani({
        amountTl: talep.tutar,
        termMonths: talep.vadeAy,
        profitRatePercent: oran,
        financingType: talep.urunTuru,
        allocationFeeRate: VARSAYILAN_TAHSIS_ORANI,
      });
    } catch {
      continue;
    }

    const tahsisUcreti = plan.finansmanTahsisUcreti;
    eklenen.push({
      id: `${bankaId}::ortak`,
      bankaId,
      urunAdi: 'Ortak oranla hesaplandı',
      urunTuru: talep.urunTuru,
      aylikOran: oran / 100,
      ilanOrani: null,
      ortakOranUygulandi: true,
      ilanOraniYok: true,
      vadeAy: talep.vadeAy,
      azamiVade: null,
      kampanyaAvantaji: null,
      odemeErtelemeAy: null,
      masrafDurumu: masrafOzeti(VARSAYILAN_TAHSIS_ORANI, tahsisUcreti),
      taksit: plan.taksitTutari,
      toplamOdeme: plan.odenecekToplamTutar,
      tahsisUcreti,
      toplamMaliyet: plan.odenecekToplamTutar + tahsisUcreti,
      odulTl: null,
      kampanyaBitis: null,
      segmentler: [],
      kosullar: [],
      kaynakUrl: null,
      kanitlar: {},
    });
  }

  return [...mevcut, ...eklenen].sort((a, b) => a.toplamMaliyet - b.toplamMaliyet);
}

/** Aynı bankadan birden çok teklif varsa en ucuzunu bırakır. */
export function bankaBasinaEnIyi(satirlar: TeklifSatiri[]): TeklifSatiri[] {
  const enIyi = new Map<string, TeklifSatiri>();
  for (const s of satirlar) {
    const mevcut = enIyi.get(s.bankaId);
    if (!mevcut || s.toplamMaliyet < mevcut.toplamMaliyet) enIyi.set(s.bankaId, s);
  }
  return [...enIyi.values()].sort((a, b) => a.toplamMaliyet - b.toplamMaliyet);
}

const tl = (v: number) =>
  `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

export const yuzdeBicim = (oran: number, ondalik = 2) =>
  `%${(oran * 100).toLocaleString('tr-TR', {
    minimumFractionDigits: ondalik,
    maximumFractionDigits: ondalik,
  })}`;

function enIyisi(
  satirlar: TeklifSatiri[],
  key: KriterKey,
  etiket: string,
  aciklama: string,
  deger: (s: TeklifSatiri) => number | null,
  yon: 'min' | 'max',
  bicimle: (v: number) => string,
): KriterSonuc {
  const adaylar = satirlar
    .map((s) => ({ s, v: deger(s) }))
    .filter((a): a is { s: TeklifSatiri; v: number } => a.v !== null && Number.isFinite(a.v));

  if (adaylar.length === 0) {
    return { key, etiket, aciklama, kazanan: null, gosterim: null, degerlendirilen: 0 };
  }

  const kazanan = adaylar.reduce((en, a) =>
    yon === 'min' ? (a.v < en.v ? a : en) : a.v > en.v ? a : en,
  );

  return {
    key,
    etiket,
    aciklama,
    kazanan: kazanan.s,
    gosterim: bicimle(kazanan.v),
    degerlendirilen: adaylar.length,
  };
}

export interface Agirliklar {
  karPayi: number;
  masraf: number;
  odul: number;
}

export const VARSAYILAN_AGIRLIKLAR: Agirliklar = {
  karPayi: 0.6,
  masraf: 0.3,
  odul: 0.1,
};

const olcekle = (v: number, min: number, max: number, tersCevir: boolean): number => {
  if (max === min) return 1;
  const n = (v - min) / (max - min);
  return tersCevir ? 1 - n : n;
};

/**
 * Bileşik avantaj skoru. Aynı tutar ve vade için hesaplandığından
 * vade ekseni skora girmez; kâr payı, masraf ve ödül tartılır.
 * Veri sağlamayan eksen için ağırlık yeniden dağıtılır.
 */
export function avantajSkoru(
  satirlar: TeklifSatiri[],
  agirliklar: Agirliklar = VARSAYILAN_AGIRLIKLAR,
): { satir: TeklifSatiri; skor: number }[] {
  const eksen = [
    { ad: 'karPayi' as const, deger: (s: TeklifSatiri) => s.aylikOran, tersCevir: true },
    { ad: 'masraf' as const, deger: (s: TeklifSatiri) => s.tahsisUcreti, tersCevir: true },
    { ad: 'odul' as const, deger: (s: TeklifSatiri) => s.odulTl, tersCevir: false },
  ];

  const aralik = eksen.map((e) => {
    const vals = satirlar.map((s) => e.deger(s)).filter((v): v is number => v !== null);
    return vals.length
      ? { min: Math.min(...vals), max: Math.max(...vals), adet: vals.length }
      : { min: 0, max: 0, adet: 0 };
  });

  return satirlar
    .map((satir) => {
      let toplam = 0;
      let agirlikToplami = 0;
      eksen.forEach((e, i) => {
        const v = e.deger(satir);
        if (v === null || aralik[i].adet === 0) return;
        const w = agirliklar[e.ad];
        toplam += w * olcekle(v, aralik[i].min, aralik[i].max, e.tersCevir);
        agirlikToplami += w;
      });
      return { satir, skor: agirlikToplami > 0 ? toplam / agirlikToplami : 0 };
    })
    .sort((a, b) => b.skor - a.skor);
}

/** Şartname 5.7'deki karşılaştırma kriterlerinin tamamı. */
export function hesaplaKriterler(
  satirlar: TeklifSatiri[],
  agirliklar: Agirliklar = VARSAYILAN_AGIRLIKLAR,
): KriterSonuc[] {
  if (satirlar.length === 0) return [];

  const sonuclar: KriterSonuc[] = [
    enIyisi(
      satirlar,
      'en_dusuk_kar_payi',
      'En düşük kâr payı oranı',
      'Aylık kâr payı oranı en düşük olan teklif.',
      (s) => s.aylikOran,
      'min',
      (v) => `${yuzdeBicim(v)} / ay`,
    ),
    enIyisi(
      satirlar,
      'en_dusuk_taksit',
      'En düşük aylık taksit',
      'Aynı tutar ve vadede en az aylık ödeme.',
      (s) => s.taksit,
      'min',
      tl,
    ),
    enIyisi(
      satirlar,
      'en_dusuk_masraf',
      'En düşük masraf',
      'Tahsis ücreti en düşük olan teklif.',
      (s) => s.tahsisUcreti,
      'min',
      (v) => (v === 0 ? 'Ücretsiz' : tl(v)),
    ),
    enIyisi(
      satirlar,
      'en_dusuk_maliyet',
      'En düşük toplam maliyet',
      'Tahsis ücreti dâhil toplam geri ödeme.',
      (s) => s.toplamMaliyet,
      'min',
      tl,
    ),
    enIyisi(
      satirlar,
      'en_yuksek_odul',
      'En yüksek ödül',
      'Kampanya kapsamında verilen ödül tutarı.',
      (s) => s.odulTl,
      'max',
      tl,
    ),
  ];

  const siralama = avantajSkoru(satirlar, agirliklar);
  const enAvantajli = siralama[0];
  sonuclar.push({
    key: 'en_avantajli',
    etiket: 'En avantajlı',
    aciklama: 'Kâr payı, masraf ve ödülün ağırlıklı bileşik skoru.',
    kazanan: enAvantajli?.satir ?? null,
    gosterim: enAvantajli ? `Skor ${(enAvantajli.skor * 100).toFixed(0)}/100` : null,
    degerlendirilen: siralama.length,
  });

  return sonuclar;
}

/** Kriter → kazanan satır kimliği; tabloda yıldız göstermek için. */
export function kazananHaritasi(sonuclar: KriterSonuc[]): Record<string, string | null> {
  const harita: Record<string, string | null> = {};
  for (const s of sonuclar) harita[s.key] = s.kazanan?.id ?? null;
  return harita;
}

/**
 * İki teklif arasındaki farkı düz Türkçe cümlelerle anlatır.
 * Yalnızca hesaplanmış değerlerden türetilir; uydurma yorum üretmez.
 */
export function farkAciklamalari(en: TeklifSatiri, digeri: TeklifSatiri): string[] {
  const notlar: string[] = [];

  const taksitFarki = digeri.taksit - en.taksit;
  if (Math.abs(taksitFarki) >= 0.01) {
    notlar.push(
      `Aylık taksit ${tl(Math.abs(taksitFarki))} ${taksitFarki > 0 ? 'daha düşük' : 'daha yüksek'}.`,
    );
  }

  const maliyetFarki = digeri.toplamMaliyet - en.toplamMaliyet;
  if (Math.abs(maliyetFarki) >= 0.01) {
    notlar.push(
      `Toplam maliyette ${tl(Math.abs(maliyetFarki))} ${maliyetFarki > 0 ? 'tasarruf' : 'ek yük'} oluşuyor.`,
    );
  }

  const oranFarki = digeri.aylikOran - en.aylikOran;
  if (Math.abs(oranFarki) >= 0.00001) {
    notlar.push(
      `Kâr payı oranı ${yuzdeBicim(Math.abs(oranFarki), 2)} puan ${oranFarki > 0 ? 'daha düşük' : 'daha yüksek'}.`,
    );
  }

  if (en.tahsisUcreti === 0 && digeri.tahsisUcreti > 0) {
    notlar.push('Tahsis ücreti alınmıyor.');
  } else if (en.tahsisUcreti < digeri.tahsisUcreti) {
    notlar.push(`Tahsis ücreti ${tl(digeri.tahsisUcreti - en.tahsisUcreti)} daha az.`);
  }

  return notlar;
}

export const tlBicim = tl;
