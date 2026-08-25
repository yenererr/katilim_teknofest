import React, { useMemo, useState } from 'react';
import { Award, Info } from 'lucide-react';
import {
  BANKA_INDEKS,
  FINANSMAN_TURLERI,
  FinansmanTuru,
  VADELER,
  VARSAYILAN_TUTAR,
  VERI_TARIHI,
} from '../data/piyasa';
import { oranBicim, sayiBicim, teklifleriHesapla, tlBicim } from '../lib/finansman';
import { BankMark } from './BankMark';
import { KarsilastirmaTalebi } from './HomeView';

interface FinansmanViewProps {
  talep: KarsilastirmaTalebi;
  onTalepDegisti: (talep: KarsilastirmaTalebi) => void;
}

/** Tüm katılım bankalarının teklifleri; filtreler yerinde uygulanır. */
export const FinansmanView: React.FC<FinansmanViewProps> = ({ talep, onTalepDegisti }) => {
  const [tutarMetni, setTutarMetni] = useState(sayiBicim(talep.tutar));

  const satirlar = useMemo(
    () => teklifleriHesapla(talep.tur, talep.tutar, talep.vadeAy),
    [talep],
  );
  const enUcuz = satirlar.find((s) => s.uygunMu);

  const tutarUygula = () => {
    const rakamlar = tutarMetni.replace(/[^\d]/g, '');
    const yeni = rakamlar ? Number(rakamlar) : 0;
    if (yeni > 0) onTalepDegisti({ ...talep, tutar: yeni });
    setTutarMetni(sayiBicim(yeni > 0 ? yeni : talep.tutar));
  };

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-surface p-4 shadow-raised sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-txt-secondary">Finansman Türü</span>
          <select
            value={talep.tur}
            onChange={(e) => {
              const tur = e.target.value as FinansmanTuru;
              const vadeAy = VADELER[tur].includes(talep.vadeAy)
                ? talep.vadeAy
                : VADELER[tur][Math.floor(VADELER[tur].length / 2)];
              setTutarMetni(sayiBicim(VARSAYILAN_TUTAR[tur]));
              onTalepDegisti({ tur, tutar: VARSAYILAN_TUTAR[tur], vadeAy });
            }}
            className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-txt"
          >
            {FINANSMAN_TURLERI.map((f) => (
              <option key={f.key} value={f.key}>
                {f.etiket}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-txt-secondary">Tutar (TL)</span>
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
      </section>

      {enUcuz && (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-800 dark:bg-brand-950">
          <Award className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <p className="text-sm text-txt">
            Tahsis ücreti dâhil en düşük toplam maliyet:{' '}
            <strong className="font-medium">{BANKA_INDEKS[enUcuz.bankaId]?.ad}</strong> —{' '}
            <span className="tnum font-mono">{tlBicim(enUcuz.toplamMaliyet)}</span>
          </p>
        </section>
      )}

      <section className="rounded-xl border border-line bg-surface shadow-raised">
        <div className="overflow-x-auto p-2">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">
              Seçilen tutar ve vade için tüm katılım bankalarının finansman teklifleri.
            </caption>
            <thead>
              <tr className="text-left text-xs text-txt-secondary">
                <th scope="col" className="px-3 py-2.5 font-medium">Banka</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Aylık Taksit</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Kâr Oranı</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Toplam Ödeme</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Tahsis Ücreti</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Toplam Maliyet</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s) => (
                <tr
                  key={s.bankaId}
                  className={`border-t border-line ${s.uygunMu ? 'hover:bg-sunken' : 'opacity-55'}`}
                >
                  <th scope="row" className="px-3 py-3 text-left font-medium">
                    <span className="flex items-center gap-2.5">
                      <BankMark bankaId={s.bankaId} size="sm" />
                      <span className="text-txt">{BANKA_INDEKS[s.bankaId]?.ad}</span>
                    </span>
                  </th>
                  {s.uygunMu ? (
                    <>
                      <td className="tnum px-3 py-3 font-mono">{tlBicim(s.taksit)}</td>
                      <td className="tnum px-3 py-3 font-mono text-txt-secondary">
                        {oranBicim(s.aylikKarPayi)}
                      </td>
                      <td className="tnum px-3 py-3 font-mono">{tlBicim(s.toplamOdeme)}</td>
                      <td className="tnum px-3 py-3 font-mono text-txt-secondary">
                        {s.tahsisUcreti > 0 ? tlBicim(s.tahsisUcreti) : 'Yok'}
                      </td>
                      <td className="tnum px-3 py-3 font-mono font-medium">
                        {tlBicim(s.toplamMaliyet)}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-3 py-3 text-xs text-txt-secondary">
                      Bu vade bankanın azami vadesini aşıyor.
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-txt-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Taksitler eşit taksitli (anüite) yöntemle hesaplanır; vergi ve sigorta kalemleri hariçtir.
        Oranlar {VERI_TARIHI} tarihli örnek veri setine dayanır, bağlayıcı teklif değildir.
      </p>
    </div>
  );
};
