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
    kaynakEtiket: 'Canlı',
  };
}

/** Yalnızca doğrulanmış (canlı) satırlar üstte; diğer bankalar altta “Veri paylaşılmıyor”. */
export const FinansmanView: React.FC<FinansmanViewProps> = ({ talep, onTalepDegisti }) => {
  const [secenek, setSecenek] = useState(
    () => FINANSMAN_SECENEKLERI.find((f) => f.temelTur === talep.tur)?.key ?? 'tasit_finansmani',
  );
  const [tutarMetni, setTutarMetni] = useState(sayiBicim(talep.tutar));
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
      void Promise.all(
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
      ).then((sonuclar) => {
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

  const secenekDegistir = (yeniKey: string) => {
    setSecenek(yeniKey);
    const yeni = FINANSMAN_SECENEKLERI.find((f) => f.key === yeniKey);
    if (!yeni) return;
    const tutarYeni = VARSAYILAN_TUTAR[yeni.temelTur];
    const vadeler = VADELER[yeni.temelTur];
    const vadeAy = vadeler.includes(talep.vadeAy)
      ? talep.vadeAy
      : vadeler[Math.floor(vadeler.length / 2)];
    setTutarMetni(sayiBicim(tutarYeni));
    onTalepDegisti({ tur: yeni.temelTur, tutar: tutarYeni, vadeAy });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-raised">
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
            <span className="mb-1 block text-xs text-txt-secondary">Vade</span>
            <select
              value={talep.vadeAy}
              onChange={(e) => onTalepDegisti({ ...talep, vadeAy: Number(e.target.value) })}
              className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-txt"
            >
              {VADELER[talep.tur].map((v) => (
                <option key={v} value={v}>
                  {v} Ay
                </option>
              ))}
            </select>
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
          Bu koşullarda doğrulanmış canlı teklif yok. Altta listelenen bankalar şu an veri
          paylaşmıyor veya erişilemiyor.
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

      <section className="rounded-xl border border-line bg-surface shadow-raised">
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">
              Doğrulanmış finansman teklifleri ve veri paylaşmayan bankalar.
            </caption>
            <thead>
              <tr className="text-left text-xs text-txt-secondary">
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
                <tr key={s.bankaId} className="border-t border-line hover:bg-sunken">
                  <th scope="row" className="px-3 py-3 text-left font-medium">
                    <span className="flex items-center gap-2.5">
                      <BankMark bankaId={s.bankaId} size="sm" />
                      <span className="text-txt">
                        {BANKA_INDEKS[s.bankaId]?.ad}
                        {s.kaynakEtiket && (
                          <span className="ml-1.5 text-[0.625rem] font-normal text-txt-muted">
                            ({s.kaynakEtiket})
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
                    Veri paylaşılmıyor
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
                    Veri paylaşılmıyor
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
        araçlarından gelen canlı teklifler gösterilir. Verisine ulaşılamayan bankalar
        altta “Veri paylaşılmıyor” olarak listelenir; örnek rakam uydurulmaz.
      </p>
    </div>
  );
};
