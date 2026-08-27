import React, { useEffect, useMemo, useState } from 'react';
import { Award, Info, Loader2, Sparkles, Bot, ArrowRight, CheckCircle2, TrendingUp, RefreshCw, Zap } from 'lucide-react';
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
  
  // Seçilen bankaların karşılaştırılması için state
  const [secilenBankalar, setSecilenBankalar] = useState<string[]>([]);
  const [aiKarsilastirmaAktif, setAiKarsilastirmaAktif] = useState(false);

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
        const gelenIds = new Set<string>();
        for (const s of sonuclar) {
          if (!s) continue;
          if (s.sonuc && s.sonuc.monthlyInstallmentTl != null) {
            dolu.push(s.sonuc);
            gelenIds.add(s.sonuc.bankaId);
          } else if (s.reason) {
            notlar.push(s.reason);
          }
        }
        if (ozelOranYuzde != null) {
          for (const { id } of CANLI_BANKALAR) {
            if (gelenIds.has(id)) continue;
            try {
              const plan = hesaplaOdemePlani({
                amountTl: tutar,
                termMonths: talep.vadeAy,
                profitRatePercent: ozelOranYuzde,
                financingType: secenek,
              });
              dolu.push({
                bankaId: id,
                profitRatePercent: ozelOranYuzde,
                monthlyInstallmentTl: plan.taksitTutari,
                totalPaymentTl: plan.odenecekToplamTutar,
                appraisementFeeTl: null,
                mortgageReleaseFeeTl: null,
                allocationFeeTl: null,
                termMonths: talep.vadeAy,
                amountTl: tutar,
                sourceLabel: 'Özel oran (yerel motor)',
              });
              gelenIds.add(id);
            } catch {
              /* yoksay */
            }
          }
        }
        const temelTur =
          FINANSMAN_SECENEKLERI.find((f) => f.key === secenek)?.temelTur ?? talep.tur;
        if (ozelOranYuzde == null) {
          for (const row of dogrulanmisUrunler) {
            const canli = verifiedProductToCanli(row, {
              secenek,
              temelTur,
              tutar,
              vadeAy: talep.vadeAy,
            });
            if (canli && !gelenIds.has(canli.bankaId)) {
              dolu.push(canli);
              gelenIds.add(canli.bankaId);
            }
          }
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

  const tumSatirlar = useMemo(() => [...dogrulanmisSatirlar, ...verisizSatirlar], [dogrulanmisSatirlar, verisizSatirlar]);

  const secilenSatirlar = useMemo(() => {
    return tumSatirlar.filter((s) => secilenBankalar.includes(s.bankaId));
  }, [tumSatirlar, secilenBankalar]);

  const enUcuz = dogrulanmisSatirlar[0] ?? null;

  const toggleBankaSecim = (bankaId: string) => {
    setSecilenBankalar((prev) => {
      if (prev.includes(bankaId)) {
        return prev.filter((id) => id !== bankaId);
      }
      return [...prev, bankaId];
    });
  };

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

      <section aria-labelledby="finansman-sonuc-baslik" className="rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 id="finansman-sonuc-baslik" className="text-base font-semibold tracking-tight text-txt">
              Teklifler
            </h2>
            <p className="text-xs text-txt-secondary">
              Karşılaştırmak istediğiniz bankaların yanındaki kutucuğu işaretleyin.
            </p>
          </div>
          {secilenBankalar.length > 0 && (
            <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-300">
              {secilenBankalar.length} Banka Seçildi
            </span>
          )}
        </div>
        <div
          className="overflow-x-auto p-2"
          tabIndex={0}
          role="region"
          aria-label="Finansman teklifleri tablosu"
        >
          <table className="table-zebra w-full min-w-[48rem] border-collapse text-sm">
            <caption className="sr-only">
              Doğrulanmış finansman teklifleri ve canlı teklif alınamayan bankalar.
            </caption>
            <thead>
              <tr className="sticky top-0 z-10 bg-surface text-left text-xs text-txt-secondary">
                <th scope="col" className="px-3 py-2.5 font-medium text-center w-24">Karşılaştır</th>
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
                  <td colSpan={7} className="px-3 py-2 text-[11px] font-medium tracking-wide text-txt-muted uppercase">
                    Doğrulanmış teklifler
                  </td>
                </tr>
              )}
              {dogrulanmisSatirlar.map((s) => {
                const secili = secilenBankalar.includes(s.bankaId);
                return (
                  <tr
                    key={`${s.bankaId}-${s.urunAdi || s.kaynakEtiket || 'teklif'}`}
                    className={`border-t border-line transition-colors hover:bg-sunken ${secili ? 'bg-brand-50/50 dark:bg-brand-950/30' : ''}`}
                  >
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleBankaSecim(s.bankaId)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                          secili
                            ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                            : 'border border-line bg-surface text-txt-secondary hover:border-brand-500 hover:text-brand-600'
                        }`}
                      >
                        {secili ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Seçildi
                          </>
                        ) : (
                          'Ekle'
                        )}
                      </button>
                    </td>
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
                );
              })}

              {verisizSatirlar.length > 0 && (
                <tr className="border-t border-line bg-sunken/30">
                  <td colSpan={7} className="px-3 py-2 text-[11px] font-medium tracking-wide text-txt-muted uppercase">
                    Canlı teklif alınamadı
                  </td>
                </tr>
              )}
              {verisizSatirlar.map((s) => {
                const secili = secilenBankalar.includes(s.bankaId);
                return (
                  <tr key={s.bankaId} className="border-t border-line opacity-80 hover:bg-sunken">
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleBankaSecim(s.bankaId)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${
                          secili
                            ? 'bg-slate-700 text-white'
                            : 'border border-line text-txt-muted hover:border-slate-400'
                        }`}
                      >
                        {secili ? 'Eklendi' : 'Ekle'}
                      </button>
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SEÇİLEN BANKALARIN YAPAY ZEKÂ KARŞILAŞTIRMA ALANI */}
      {secilenBankalar.length > 0 && (
        <section aria-label="Yapay zekâ karşılaştırma alanı" className="space-y-4 rounded-xl border-2 border-brand-500 bg-surface p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-900/50 dark:text-brand-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-txt">
                  Yapay Zekâ Finansman Karşılaştırma Paneli
                </h3>
                <p className="text-xs text-txt-secondary">
                  Karşılaştırılmak üzere seçilen {secilenBankalar.length} katılım bankasının detaylı maliyet analizi.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSecilenBankalar([])}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-txt-secondary hover:bg-sunken"
              >
                Seçimleri Temizle
              </button>

              <button
                type="button"
                onClick={() => setAiKarsilastirmaAktif(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-brand-700 active:scale-95"
              >
                <Bot className="h-4 w-4" />
                Yapay Zekâ İle Analiz Et
              </button>
            </div>
          </div>

          {/* SEÇİLEN KARTLAR IZGARASI */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {secilenSatirlar.map((s) => (
              <div
                key={s.bankaId}
                className="relative rounded-lg border border-line bg-sunken/40 p-4 transition-all hover:border-brand-300"
              >
                <div className="flex items-center justify-between pb-2 border-b border-line">
                  <div className="flex items-center gap-2">
                    <BankMark bankaId={s.bankaId} size="sm" />
                    <span className="font-semibold text-sm text-txt">
                      {BANKA_INDEKS[s.bankaId]?.ad}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBankaSecim(s.bankaId)}
                    className="text-xs text-txt-muted hover:text-red-500"
                  >
                    Kaldır
                  </button>
                </div>
                
                {s.veriVar ? (
                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-txt-secondary">Aylık Taksit:</span>
                      <span className="font-mono font-bold text-txt">{tlBicim(s.taksit!)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-txt-secondary">Kâr Payı Oranı:</span>
                      <span className="font-mono font-medium text-txt">{oranBicim(s.aylikKarPayi!)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-txt-secondary">Toplam Ödeme:</span>
                      <span className="font-mono text-txt">{tlBicim(s.toplamOdeme!)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-txt-secondary">Tahsis Ücreti:</span>
                      <span className="font-mono text-txt">{(s.tahsisUcreti ?? 0) > 0 ? tlBicim(s.tahsisUcreti!) : 'Yok'}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-line font-bold">
                      <span className="text-brand-600 dark:text-brand-400">Toplam Maliyet:</span>
                      <span className="font-mono text-brand-600 dark:text-brand-400">{tlBicim(s.toplamMaliyet!)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-txt-muted">
                    Bu talep için otomatik canlı teklif verisi yok.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* YAPAY ZEKÂ ANALİZ RAPOR KARTI */}
          {aiKarsilastirmaAktif && secilenSatirlar.length > 0 && (
            <div className="mt-4 space-y-3 rounded-xl border border-brand-300 bg-brand-50/60 p-4 dark:border-brand-800 dark:bg-brand-950/40">
              <div className="flex items-center gap-2 text-brand-700 dark:text-brand-300 font-semibold text-sm">
                <Bot className="h-5 w-5" />
                <span>Yapay Zekâ Finansman Değerlendirme Raporu</span>
              </div>

              {secilenSatirlar.filter((s) => s.veriVar).length >= 2 ? (
                (() => {
                  const teklifli = secilenSatirlar.filter((s) => s.veriVar).sort((a, b) => (a.toplamMaliyet || 0) - (b.toplamMaliyet || 0));
                  const enUygun = teklifli[0];
                  const ikincil = teklifli[1];
                  const maliyetFarki = (ikincil.toplamMaliyet || 0) - (enUygun.toplamMaliyet || 0);
                  const taksitFarki = (ikincil.taksit || 0) - (enUygun.taksit || 0);

                  return (
                    <div className="space-y-2.5 text-xs text-txt leading-relaxed">
                      <p className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        <strong>En Avantajlı Seçenek:</strong> {BANKA_INDEKS[enUygun.bankaId]?.ad} — Toplam maliyet: <span className="font-mono font-bold">{tlBicim(enUygun.toplamMaliyet!)}</span>
                      </p>
                      
                      <div className="rounded-lg bg-surface p-3 border border-line space-y-1">
                        <p>
                          💡 <strong>Maliyet Analizi:</strong> {BANKA_INDEKS[enUygun.bankaId]?.ad}, {BANKA_INDEKS[ikincil.bankaId]?.ad} bankasına göre ayda <strong className="font-mono text-emerald-600">{tlBicim(taksitFarki)}</strong> daha az taksit ödemesi sağlar. Toplam geri ödemede net <strong className="font-mono text-emerald-600">{tlBicim(maliyetFarki)}</strong> tasarruf edersiniz.
                        </p>
                        <p>
                          📌 <strong>Tahsis & Masraf Kıyaslaması:</strong> {enUygun.tahsisUcreti === 0 ? `${BANKA_INDEKS[enUygun.bankaId]?.ad} masrafsız / tahsis ücretsiz finansman sunmaktadır.` : `Tahsis ücreti ${tlBicim(enUygun.tahsisUcreti!)} seviyesindedir.`}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-txt-muted text-[11px]">
                          Tüm hesaplamalar Katılım Bankacılığı kâr payı standartlarına uygundur.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const mesaj = `Bana ${secilenSatirlar.map(s => BANKA_INDEKS[s.bankaId]?.ad).join(' ve ')} finansmanlarını detaylı karşılaştır.`;
                            window.dispatchEvent(new CustomEvent('open-ai-chat', { detail: { prompt: mesaj } }));
                          }}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline font-semibold"
                        >
                          Asistana Detaylı Sor <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-xs text-txt-secondary">
                  Lütfen yapay zekâ maliyet kıyaslaması için en az 2 doğrulanmış canlı teklifi seçin.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-txt-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Üstte Vakıf Katılım, Ziraat Katılım ve Kuveyt Türk’ün kendi hesaplama
        araçlarından gelen canlı teklifler gösterilir. Diğer bankalar için otomatik
        canlı teklif alınamazsa altta ayrıca belirtilir; örnek rakam uydurulmaz.
      </p>
    </div>
  );
};
