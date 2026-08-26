import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { BANKA_INDEKS, KAMPANYALAR, Kampanya } from '../data/piyasa';
import { BankMark } from './BankMark';

const KATEGORILER: { key: Kampanya['kategori'] | 'hepsi'; etiket: string }[] = [
  { key: 'hepsi', etiket: 'Tümü' },
  { key: 'genel', etiket: 'Genel' },
  { key: 'market', etiket: 'Market' },
  { key: 'egitim', etiket: 'Eğitim' },
  { key: 'akaryakit', etiket: 'Akaryakıt' },
  { key: 'saglik', etiket: 'Sağlık' },
];

const ETIKET_TONU: Record<string, string> = {
  'TAKSİT': 'bg-info-50 text-info-700 dark:bg-info-950 dark:text-info-300',
  'İNDİRİM': 'bg-warn-50 text-warn-800 dark:bg-warn-950 dark:text-warn-300',
  'YENİ MÜŞTERİ': 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  'PUAN': 'bg-info-50 text-info-700 dark:bg-info-950 dark:text-info-300',
  'NAKİT İADE': 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
};

/** Piyasadaki güncel kampanyalar; kategoriye göre süzülür. */
export const CampaignsView: React.FC = () => {
  const [kategori, setKategori] = useState<Kampanya['kategori'] | 'hepsi'>('hepsi');
  const liste = KAMPANYALAR.filter((k) => kategori === 'hepsi' || k.kategori === kategori);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {KATEGORILER.map((k) => {
          const isActive = kategori === k.key;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setKategori(k.key)}
              aria-pressed={isActive}
              className={`min-h-11 rounded-lg border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                isActive
                  ? 'border-brand-600 bg-brand-600 font-semibold text-white'
                  : 'border-line bg-surface text-txt-secondary hover:bg-sunken'
              }`}
            >
              {k.etiket}
            </button>
          );
        })}
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {liste.map((k) => (
          <li
            key={k.id}
            className="flex flex-col rounded-xl border border-line bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <BankMark bankaId={k.bankaId} size="sm" />
                <span className="truncate text-xs text-txt-secondary">
                  {BANKA_INDEKS[k.bankaId]?.ad}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-medium tracking-wide ${
                  ETIKET_TONU[k.etiket] ?? 'bg-sunken text-txt-secondary'
                }`}
              >
                {k.etiket}
              </span>
            </div>
            <h3 className="mt-3 text-sm font-medium text-txt">{k.baslik}</h3>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-txt-secondary">{k.aciklama}</p>
            <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-xs text-txt-muted">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Bitiş: {k.bitis}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
};
