import React, { useEffect, useMemo, useState } from 'react';
import { Award, Info, Loader2 } from 'lucide-react';
import {
  BANKALAR,
  BANKA_INDEKS,
  FINANSMAN_SECENEKLERI,
  VADELER,
  VARSAYILAN_TUTAR,
} from '../data/piyasa';
import { FINANSMAN_NOTLARI_BY_KEY } from '../data/finansmanNotlari';
import { oranBicim, sayiBicim, tlBicim } from '../lib/finansman';
import { hesaplaOdemePlani } from '../lib/odemePlani';
import { BankMark } from './BankMark';
import { KarsilastirmaTalebi } from './HomeView';

interface FinansmanViewProps {
  talep: KarsilastirmaTalebi;
  onTalepDegisti: (talep: KarsilastirmaTalebi) => void;
}

type CanliSonuc = {
  bankaId: string;
  profitRatePercent: number | null;
  monthlyInstallmentTl: number | null;
  totalPaymentTl: number | null;
  appraisementFeeTl: number | null;
  mortgageReleaseFeeTl: number | null;
  allocationFeeTl?: number | null;
  termMonths?: number;
  amountTl?: number;
  productName?: string | null;
  sourceLabel?: string;
};

type StructuredProduct = {
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
  campaignEnd?: string | null;
  campaignStatus?: string | null;
  payload?: StructuredProduct | string;
};

type Satir = {
  bankaId: string;
  /** Canlı / doğrulanmış veri var mı */
  veriVar: boolean;
  aylikKarPayi: number | null;
  taksit: number | null;
  toplamOdeme: number | null;
  tahsisUcreti: number | null;
  toplamMaliyet: number | null;
  kaynakEtiket?: string;
  urunAdi?: string | null;
};

const CANLI_BANKALAR: { id: string; path: string }[] = [
  { id: 'vakif-katilim', path: '/api/calculators/vakif-katilim' },
  { id: 'ziraat-katilim', path: '/api/calculators/ziraat-katilim' },
  { id: 'kuveyt-turk', path: '/api/calculators/kuveyt-turk' },
];

function canliToSatir(t: CanliSonuc): Satir | null {
  if (t.monthlyInstallmentTl == null || t.profitRatePercent == null) return null;
  const vade = t.termMonths && t.termMonths > 0 ? t.termMonths : 1;
  const toplamOdeme = t.totalPaymentTl ?? t.monthlyInstallmentTl * vade;
  const tahsis =
    (t.allocationFeeTl ?? 0) > 0
      ? t.allocationFeeTl!
      : (t.appraisementFeeTl ?? 0);
  return {
    bankaId: t.bankaId,
    veriVar: true,
    aylikKarPayi: t.profitRatePercent / 100,
    taksit: t.monthlyInstallmentTl,
    toplamOdeme,
    tahsisUcreti: tahsis,
    toplamMaliyet: toplamOdeme + tahsis,
    kaynakEtiket: t.sourceLabel || 'Canlı',
    urunAdi: t.productName || null,
  };
}

function normalizeStructuredProduct(row: StructuredProduct): StructuredProduct {
  if (!row.payload) return row;
  if (typeof row.payload === 'string') {
    try {
      return { ...row, ...JSON.parse(row.payload) };
    } catch {
      return row;
    }
  }
  return { ...row, ...row.payload };
}

function isActiveStructuredProduct(row: StructuredProduct): boolean {
  if (row.campaignStatus === 'expired') return false;
  if (!row.campaignEnd) return true;
  const ts = Date.parse(String(row.campaignEnd));
  return !Number.isFinite(ts) || ts >= Date.now();
}

function between(value: number, min?: number | null, max?: number | null): boolean {
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function verifiedProductToCanli(
  raw: StructuredProduct,
  opts: { secenek: string; temelTur: string; tutar: number; vadeAy: number },
): CanliSonuc | null {
  const row = normalizeStructuredProduct(raw);
  if (!isActiveStructuredProduct(row)) return null;
  if (row.ratePeriod !== 'monthly' || typeof row.profitRate !== 'number') return null;
  if (row.productType !== opts.secenek && row.productType !== opts.temelTur) return null;
  if (!between(opts.tutar, row.minAmountTl, row.maxAmountTl)) return null;
  if (!between(opts.vadeAy, row.minTermMonths, row.maxTermMonths)) return null;

  const allocationFeeTl =
    row.allocationFeeType === 'percentage' && typeof row.allocationFeeValue === 'number'
      ? Math.round(opts.tutar * row.allocationFeeValue * 100) / 100
      : typeof row.allocationFeeValue === 'number'
        ? row.allocationFeeValue
        : null;
  const plan = hesaplaOdemePlani({
    amountTl: opts.tutar,
    termMonths: opts.vadeAy,
    profitRatePercent: row.profitRate * 100,
    financingType: opts.secenek,
    allocationFeeRate:
      row.allocationFeeType === 'percentage' && typeof row.allocationFeeValue === 'number'
        ? row.allocationFeeValue
        : undefined,
  });
  return {
    bankaId: row.bankId,
    productName: row.productName || row.title || null,
    profitRatePercent: row.profitRate * 100,
    monthlyInstallmentTl: plan.taksitTutari,
    totalPaymentTl: plan.odenecekToplamTutar,
    appraisementFeeTl: null,
    mortgageReleaseFeeTl: null,
    allocationFeeTl,
    termMonths: opts.vadeAy,
    amountTl: opts.tutar,
    sourceLabel: 'Resmî tablo',
  };
}

/** Yalnızca doğrulanmış canlı satırlar üstte; diğer bankalar altta canlı teklif alınamadı olarak gösterilir. */
export const FinansmanView: React.FC<FinansmanViewProps> = ({ talep, onTalepDegisti }) => {
  const [secenek, setSecenek] = useState(
    () => FINANSMAN_SECENEKLERI.find((f) => f.temelTur === talep.tur)?.key ?? 'tasit_finansmani',
  );
  const [tutarMetni, setTutarMetni] = useState(sayiBicim(talep.tutar));
  const [vadeMetni, setVadeMetni] = useState(String(talep.vadeAy));
  const [oranOzel, setOranOzel] = useState(false);
  const [oranMetni, setOranMetni] = useState('3,99');
  const [hesapTipi, setHesapTipi] = useState<'1' | '2'>('1');
  const [canliListe, setCanliListe] = useState<CanliSonuc[]>([]);
  const [hesapNotu, setHesapNotu] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  const turNotu = FINANSMAN_NOTLARI_BY_KEY[secenek] ?? null;

  const tutar = useMemo(() => {
    const rakamlar = tutarMetni.replace(/[^\d]/g, '');
    return rakamlar ? Number(rakamlar) : 0;
  }, [tutarMetni]);

  const ozelOranYuzde = useMemo(() => {
    if (!oranOzel) return null;
    const n = Number(oranMetni.replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [oranOzel, oranMetni]);

  useEffect(() => {
    setTutarMetni(sayiBicim(talep.tutar));
    setVadeMetni(String(talep.vadeAy));
    const eslesen = FINANSMAN_SECENEKLERI.find((f) => f.temelTur === talep.tur);
    if (eslesen && !FINANSMAN_SECENEKLERI.find((f) => f.key === secenek && f.temelTur === talep.tur)) {
      setSecenek(eslesen.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talep.tur, talep.tutar, talep.vadeAy]);

  useEffect(() => {
    if (tutar <= 0 || talep.vadeAy <= 0) {
      setCanliListe([]);
      return;
    }
    let iptal = false;
    setYukleniyor(true);
    const govde = {
      financingType: secenek,
      amountTl: tutar,
      termMonths: talep.vadeAy,
      calculateType: hesapTipi,
      ...(ozelOranYuzde != null ? { profitRatePercent: ozelOranYuzde } : {}),
    };
    const zamanlayici = window.setTimeout(() => {
      const canliIstekleri = Promise.all(
        CANLI_BANKALAR.map(async ({ id, path }) => {
          try {
            const r = await fetch(path, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(govde),
            });
            if (!r.ok) return null;
            const d = (await r.json()) as CanliSonuc & {
              available?: boolean;
              reason?: string;
              bankId?: string;
            };
            if (d.available === false) return { id, reason: d.reason || null, sonuc: null };
            return {
              id,
              reason: null as string | null,
              sonuc: {
                bankaId: d.bankId || id,
                profitRatePercent: d.profitRatePercent,
                monthlyInstallmentTl: d.monthlyInstallmentTl,
                totalPaymentTl: d.totalPaymentTl,
                appraisementFeeTl: d.appraisementFeeTl,
                mortgageReleaseFeeTl: d.mortgageReleaseFeeTl,
                allocationFeeTl: d.allocationFeeTl,
                termMonths: d.termMonths ?? talep.vadeAy,
                amountTl: d.amountTl ?? tutar,
              },
            };
          } catch {
            return null;
          }
        }),
      );
      const dogrulanmisIstek = fetch('/api/live/products')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('ürün yanıtı yok'))))
        .then((d: { structuredProducts?: StructuredProduct[] }) => d.structuredProducts || [])
        .catch(() => [] as StructuredProduct[]);

      void Promise.all([canliIstekleri, dogrulanmisIstek]).then(([sonuclar, dogrulanmisUrunler]) => {
        if (iptal) return;
        const dolu: CanliSonuc[] = [];
        const notlar: string[] = [];
        for (const s of sonuclar) {
          if (!s) continue;
          if (s.sonuc && s.sonuc.monthlyInstallmentTl != null) {
            dolu.push(s.sonuc);
          } else if (s.reason) {
            notlar.push(s.reason);
          }
        }
        const temelTur =
          FINANSMAN_SECENEKLERI.find((f) => f.key === secenek)?.temelTur ?? talep.tur;
        for (const row of dogrulanmisUrunler) {
          const canli = verifiedProductToCanli(row, {
            secenek,
            temelTur,
            tutar,
            vadeAy: talep.vadeAy,
          });
          if (canli) dolu.push(canli);
        }
        setCanliListe(dolu);
        setHesapNotu(notlar[0] ?? null);
        if (!oranOzel) {
          const referans = dolu.find((x) => x.bankaId === 'vakif-katilim') ?? dolu[0];
          if (referans?.profitRatePercent != null) {
            setOranMetni(
              referans.profitRatePercent.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
            );
          }
        }
        setYukleniyor(false);
      });
    }, 350);
    return () => {
      iptal = true;
      window.clearTimeout(zamanlayici);
    };
  }, [secenek, tutar, talep.vadeAy, hesapTipi, ozelOranYuzde, oranOzel]);

  const dogrulanmisSatirlar = useMemo<Satir[]>(() => {
    return canliListe
      .map(canliToSatir)
      .filter((s): s is Satir => s != null)
      .sort(
        (a, b) =>
          (a.toplamMaliyet ?? Number.POSITIVE_INFINITY) -
          (b.toplamMaliyet ?? Number.POSITIVE_INFINITY),
      );
  }, [canliListe]);

  const verisizSatirlar = useMemo<Satir[]>(() => {
    const dolu = new Set(dogrulanmisSatirlar.map((s) => s.bankaId));
    return BANKALAR.filter((b) => !dolu.has(b.id)).map((b) => ({
      bankaId: b.id,
      veriVar: false,
      aylikKarPayi: null,
      taksit: null,
      toplamOdeme: null,
      tahsisUcreti: null,
      toplamMaliyet: null,
    }));
  }, [dogrulanmisSatirlar]);

  const enUcuz = dogrulanmisSatirlar[0] ?? null;

  const tutarUygula = () => {
    const yeni = tutar;
    if (yeni > 0) onTalepDegisti({ ...talep, tutar: yeni });
    setTutarMetni(sayiBicim(yeni > 0 ? yeni : talep.tutar));
  };

  const vadeUygula = (ham: string) => {
    const n = Number(ham.replace(/[^\d]/g, ''));
    if (!Number.isFinite(n) || n < 1) {
      setVadeMetni(String(talep.vadeAy));
      return;
    }
    const vadeAy = Math.min(360, Math.floor(n));
    setVadeMetni(String(vadeAy));
    if (vadeAy !== talep.vadeAy) onTalepDegisti({ ...talep, vadeAy });
  };

  const secenekDegistir = (yeniKey: string) => {
    setSecenek(yeniKey);
    const yeni = FINANSMAN_SECENEKLERI.find((f) => f.key === yeniKey);
    if (!yeni) return;
    const tutarYeni = VARSAYILAN_TUTAR[yeni.temelTur];
    // Kullanıcının yazdığı vade korunur; yoksa türün ortanca önerisi.
    const vadeler = VADELER[yeni.temelTur];
    const vadeAy =
      talep.vadeAy >= 1 && talep.vadeAy <= 360
        ? talep.vadeAy
        : vadeler[Math.floor(vadeler.length / 2)];
    setTutarMetni(sayiBicim(tutarYeni));
    setVadeMetni(String(vadeAy));
    onTalepDegisti({ tur: yeni.temelTur, tutar: tutarYeni, vadeAy });
  };

  return (
    <div className="space-y-5">
      <section aria-labelledby="finansman-form-baslik" className="space-y-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div>
          <h2 id="finansman-form-baslik" className="text-base font-semibold tracking-tight text-txt">
            Karşılaştırma koşulları
          </h2>
          <p className="mt-0.5 text-xs text-txt-secondary">
            Tutar ve vade girin; doğrulanmış teklifler aşağıda listelenir.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-txt-secondary">Finansman Türü</span>
            <select
              value={secenek}
              onChange={(e) => secenekDegistir(e.target.value)}
              className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-txt"
            >
              {FINANSMAN_SECENEKLERI.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.etiket}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-txt-secondary">
              {hesapTipi === '2' ? 'Taksit Tutarı (TL)' : 'Tutar (TL)'}
            </span>
            <input
              inputMode="numeric"
              value={tutarMetni}
              onChange={(e) => setTutarMetni(e.target.value)}
              onBlur={tutarUygula}
              onKeyDown={(e) => {
                if (e.key === 'Enter') tutarUygula();
              }}
              className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm text-txt"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-txt-secondary">Vade (Ay)</span>
            <span className="relative block">
              <input
                list={`finansman-vade-${talep.tur}`}
                inputMode="numeric"
                value={vadeMetni}
                onChange={(e) => setVadeMetni(e.target.value)}
                onBlur={() => vadeUygula(vadeMetni)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') vadeUygula(vadeMetni);
                }}
                aria-label="Vade ay olarak"
                className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 pr-10 font-mono text-sm text-txt"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-txt-muted">
                Ay
              </span>
            </span>
            <datalist id={`finansman-vade-${talep.tur}`}>
              {VADELER[talep.tur].map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <div className="block">
            <span className="mb-1 block text-xs text-txt-secondary">
              Kâr Oranı Kendin Belirle
            </span>
            <div className="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3">
              <input
                id="finansman-oran-ozel"
                type="checkbox"
                checked={oranOzel}
                onChange={(e) => setOranOzel(e.target.checked)}
                className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-400"
              />
              <label htmlFor="finansman-oran-ozel" className="sr-only">
                Özel kâr oranı kullan
              </label>
              <input
                inputMode="decimal"
                disabled={!oranOzel}
                value={oranMetni}
                onChange={(e) => setOranMetni(e.target.value)}
                aria-label="Aylık kâr oranı yüzdesi"
                className="tnum h-full min-w-0 flex-1 bg-transparent font-mono text-sm text-txt outline-none disabled:text-txt-muted"
              />
            </div>
          </div>

          <fieldset className="flex flex-wrap items-end gap-x-5 gap-y-2 pb-1">
            <legend className="sr-only">Hesaplama biçimi</legend>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-txt">
              <input
                type="radio"
                name="finansman-hesap-tipi"
                checked={hesapTipi === '1'}
                onChange={() => setHesapTipi('1')}
                className="h-4 w-4 border-line text-brand-600 focus:ring-brand-400"
              />
              Finansman Tutarından Hesapla
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-txt">
              <input
                type="radio"
                name="finansman-hesap-tipi"
                checked={hesapTipi === '2'}
                onChange={() => setHesapTipi('2')}
                className="h-4 w-4 border-line text-brand-600 focus:ring-brand-400"
              />
              Taksit Tutarından Hesapla
            </label>
          </fieldset>
        </div>

        {turNotu && (
          <p className="text-[11px] leading-relaxed text-txt-muted">{turNotu.metin}</p>
        )}
      </section>

      {enUcuz && enUcuz.toplamMaliyet != null && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-800 dark:bg-brand-950">
          <Award className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <p className="text-sm text-txt">
            Tahsis ücreti dâhil en düşük toplam maliyet:{' '}
            <strong className="font-medium">{BANKA_INDEKS[enUcuz.bankaId]?.ad}</strong> —{' '}
            <span className="tnum font-mono">{tlBicim(enUcuz.toplamMaliyet)}</span>
            {yukleniyor && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-txt-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                Güncel oranlar alınıyor…
              </span>
            )}
          </p>
        </section>
      )}

      {!enUcuz && !yukleniyor && (
        <p className="rounded-lg border border-line bg-sunken/40 px-3 py-2.5 text-xs text-txt-secondary">
          Bu koşullarda doğrulanmış canlı teklif yok. Alttaki bankalar için otomatik
          teklif alınamadı; banka sitesinde bilgi olabilir ama bu ekranda henüz
          hesaplanabilir canlı teklif olarak doğrulanmadı.
        </p>
      )}

      {hesapNotu && (
        <p className="rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-xs text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200">
          {hesapNotu}
        </p>
      )}

      {yukleniyor && !enUcuz && (
        <p className="inline-flex items-center gap-2 px-1 text-xs text-txt-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Vakıf, Ziraat ve Kuveyt Türk hesaplanıyor…
        </p>
      )}

      <section aria-labelledby="finansman-sonuc-baslik" className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-3">
          <h2 id="finansman-sonuc-baslik" className="text-base font-semibold tracking-tight text-txt">
            Teklifler
          </h2>
        </div>
        <div
          className="overflow-x-auto p-2"
          tabIndex={0}
          role="region"
          aria-label="Finansman teklifleri tablosu"
        >
          <table className="table-zebra w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">
              Doğrulanmış finansman teklifleri ve canlı teklif alınamayan bankalar.
            </caption>
            <thead>
              <tr className="sticky top-0 z-10 bg-surface text-left text-xs text-txt-secondary">
                <th scope="col" className="px-3 py-2.5 font-medium">Banka</th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  {hesapTipi === '2' ? 'Finansman / Taksit' : 'Aylık Taksit'}
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">Kâr Oranı</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Toplam Ödeme</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Tahsis Ücreti</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Toplam Maliyet</th>
              </tr>
            </thead>
            <tbody>
              {dogrulanmisSatirlar.length > 0 && (
                <tr className="border-t border-line bg-sunken/30">
                  <td colSpan={6} className="px-3 py-2 text-[11px] font-medium tracking-wide text-txt-muted uppercase">
                    Doğrulanmış teklifler
                  </td>
                </tr>
              )}
              {dogrulanmisSatirlar.map((s) => (
                <tr key={`${s.bankaId}-${s.urunAdi || s.kaynakEtiket || 'teklif'}`} className="border-t border-line hover:bg-sunken">
                  <th scope="row" className="px-3 py-3 text-left font-medium">
                    <span className="flex items-center gap-2.5">
                      <BankMark bankaId={s.bankaId} size="sm" />
                      <span className="min-w-0 text-txt">
                        <span className="block">
                          {BANKA_INDEKS[s.bankaId]?.ad}
                          {s.kaynakEtiket && (
                            <span className="ml-1.5 text-[0.625rem] font-normal text-txt-muted">
                              ({s.kaynakEtiket})
                            </span>
                          )}
                        </span>
                        {s.urunAdi && (
                          <span className="mt-0.5 block max-w-60 truncate text-xs font-normal text-txt-muted">
                            {s.urunAdi}
                          </span>
                        )}
                      </span>
                    </span>
                  </th>
                  <td className="tnum px-3 py-3 font-mono">{tlBicim(s.taksit!)}</td>
                  <td className="tnum px-3 py-3 font-mono text-txt-secondary">
                    {oranBicim(s.aylikKarPayi!)}
                  </td>
                  <td className="tnum px-3 py-3 font-mono">{tlBicim(s.toplamOdeme!)}</td>
                  <td className="tnum px-3 py-3 font-mono text-txt-secondary">
                    {(s.tahsisUcreti ?? 0) > 0 ? tlBicim(s.tahsisUcreti!) : 'Yok'}
                  </td>
                  <td className="tnum px-3 py-3 font-mono font-medium">
                    {tlBicim(s.toplamMaliyet!)}
                  </td>
                </tr>
              ))}

              {verisizSatirlar.length > 0 && (
                <tr className="border-t border-line bg-sunken/30">
                  <td colSpan={6} className="px-3 py-2 text-[11px] font-medium tracking-wide text-txt-muted uppercase">
                    Canlı teklif alınamadı
                  </td>
                </tr>
              )}
              {verisizSatirlar.map((s) => (
                <tr key={s.bankaId} className="border-t border-line opacity-80">
                  <th scope="row" className="px-3 py-3 text-left font-medium">
                    <span className="flex items-center gap-2.5">
                      <BankMark bankaId={s.bankaId} size="sm" />
                      <span className="text-txt">{BANKA_INDEKS[s.bankaId]?.ad}</span>
                    </span>
                  </th>
                  <td colSpan={5} className="px-3 py-3 text-xs text-txt-secondary">
                    Bu talep için otomatik hesaplanabilir canlı teklif alınamadı.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-txt-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Üstte Vakıf Katılım, Ziraat Katılım ve Kuveyt Türk’ün kendi hesaplama
        araçlarından gelen canlı teklifler gösterilir. Diğer bankalar için otomatik
        canlı teklif alınamazsa altta ayrıca belirtilir; örnek rakam uydurulmaz.
      </p>
    </div>
  );
};
