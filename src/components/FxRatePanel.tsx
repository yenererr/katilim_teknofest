import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Clock } from 'lucide-react';

type FxCode = 'USD' | 'EUR' | 'GBP' | 'XAU';

type FxRate = {
  code: FxCode;
  name: string;
  forexBuying: number;
  forexSelling: number;
  change: number | null;
};

type FxSnapshot = {
  bulletinDate: string | null;
  fetchedAt: string;
  updatedLabel?: string;
  sourceUrl: string;
  rates: Record<'USD' | 'EUR' | 'GBP', FxRate>;
  metals: { XAU: FxRate } | null;
};

type Satir = {
  code: FxCode;
  buy: string;
  sell: string;
  change: number | null;
};

/** Kenar çubuğunda gösterim sırası */
const SIRA: FxCode[] = ['EUR', 'GBP', 'USD', 'XAU'];

const ROZET: Record<FxCode, { glyph: string; sinif: string }> = {
  EUR: {
    glyph: '€',
    sinif:
      'text-info-700 bg-info-50 border-info-200 dark:bg-info-950/40 dark:text-info-300 dark:border-info-800/60',
  },
  GBP: {
    glyph: '£',
    sinif:
      'text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60',
  },
  USD: {
    glyph: '$',
    sinif:
      'text-accent-700 bg-accent-50 border-accent-200 dark:bg-accent-950/40 dark:text-accent-300 dark:border-accent-800/60',
  },
  XAU: {
    glyph: '₺',
    sinif:
      'text-warn-700 bg-warn-50 border-warn-200 dark:bg-warn-950/40 dark:text-warn-300 dark:border-warn-800/60',
  },
};

function bicimle(n: number, code: FxCode): string {
  const digits = code === 'XAU' ? 2 : 4;
  return n.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function degisimBicim(n: number): string {
  return Math.abs(n).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function AltinRozet() {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-warn-200 bg-warn-50 dark:border-warn-800/60 dark:bg-warn-950/40"
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="h-5 w-5">
        <rect x="6" y="18" width="20" height="6" rx="1" fill="#D4A017" />
        <rect x="8" y="12" width="16" height="5" rx="1" fill="#F0C14A" />
        <rect x="10" y="7" width="12" height="4" rx="1" fill="#E8B923" />
      </svg>
    </span>
  );
}

interface FxRatePanelProps {
  /** “Tüm Kurları Gör” bağlantısı — çevirici bölümüne kaydırır */
  onTumunuGor?: () => void;
}

/** TCMB döviz kurları ve gram altın — ana sayfa kenar çubuğu kartı. */
export const FxRatePanel: React.FC<FxRatePanelProps> = ({ onTumunuGor }) => {
  const [snapshot, setSnapshot] = useState<FxSnapshot | null>(null);
  const [hata, setHata] = useState(false);

  useEffect(() => {
    let iptal = false;
    const yukle = () => {
      fetch('/api/live/fx')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fx'))))
        .then((d: FxSnapshot) => {
          if (!iptal) {
            setSnapshot(d);
            setHata(false);
          }
        })
        .catch(() => {
          if (!iptal) setHata(true);
        });
    };
    yukle();
    const id = window.setInterval(yukle, 30 * 60 * 1000);
    return () => {
      iptal = true;
      window.clearInterval(id);
    };
  }, []);

  const satirlar = useMemo((): Satir[] => {
    if (!snapshot) return [];
    const liste: Satir[] = [];
    for (const code of SIRA) {
      const r = code === 'XAU' ? snapshot.metals?.XAU : snapshot.rates[code];
      if (!r) continue;
      liste.push({
        code,
        buy: bicimle(r.forexBuying, code),
        sell: bicimle(r.forexSelling, code),
        change: r.change,
      });
    }
    return liste;
  }, [snapshot]);

  const guncelleme = snapshot?.updatedLabel || snapshot?.bulletinDate || '—';

  return (
    <section
      aria-label="Güncel döviz ve altın kurları"
      className="rounded-xl border border-line bg-surface p-4 shadow-flat"
    >
      <div className="flex items-center justify-between gap-2 pb-3.5">
        <h2 className="text-base font-semibold tracking-tight text-txt">Döviz Kurları</h2>
        <span className="inline-flex items-center gap-1.5 text-[0.625rem] font-medium text-brand-700 dark:text-brand-300">
          <span
            className="h-1.5 w-1.5 rounded-full bg-brand-500 ring-4 ring-brand-500/10"
            aria-hidden="true"
          />
          Canlı
        </span>
      </div>

      {satirlar.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs leading-relaxed text-txt-secondary">
          {hata
            ? 'Kur verisi şu anda alınamıyor. Birkaç dakika sonra tekrar denenecek.'
            : 'Kurlar yükleniyor…'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {satirlar.map((s) => {
            const up = s.change != null && s.change > 0;
            const down = s.change != null && s.change < 0;
            const rozet = ROZET[s.code];
            return (
              <li
                key={s.code}
                className="grid grid-cols-[2.25rem_1fr_7rem] items-center gap-2.5 rounded-xl border border-line bg-gradient-to-br from-surface to-brand-50/40 px-3 py-2.5 dark:to-brand-950/20"
              >
                {s.code === 'XAU' ? (
                  <AltinRozet />
                ) : (
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-lg font-bold ${rozet.sinif}`}
                    aria-hidden="true"
                  >
                    {rozet.glyph}
                  </span>
                )}

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-txt">{s.code}</p>
                  {s.change != null && (
                    <p
                      className={`tnum mt-0.5 text-[0.625rem] font-bold ${
                        up
                          ? 'text-accent-600 dark:text-accent-400'
                          : down
                            ? 'text-risk-600 dark:text-risk-400'
                            : 'text-txt-muted'
                      }`}
                    >
                      <span aria-hidden="true">{up ? '▲' : down ? '▼' : '•'}</span>{' '}
                      {degisimBicim(s.change)}
                    </p>
                  )}
                </div>

                <dl className="grid grid-cols-[2.125rem_1fr] gap-y-1.5 text-[0.5625rem]">
                  <dt className="text-txt-muted">Alış</dt>
                  <dd className="tnum text-right font-mono text-[0.625rem] font-semibold text-txt">
                    {s.buy}
                  </dd>
                  <dt className="text-txt-muted">Satış</dt>
                  <dd className="tnum text-right font-mono text-[0.625rem] font-semibold text-txt">
                    {s.sell}
                  </dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2.5 rounded-lg border border-line px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Clock className="h-4 w-4 shrink-0 text-txt-muted" aria-hidden="true" />
          <div className="min-w-0 text-[0.5625rem] leading-relaxed text-txt-muted">
            <span className="block text-[0.625rem] font-medium text-txt-secondary">
              Son Güncelleme
            </span>
            <span className="truncate">{guncelleme}</span>
          </div>
        </div>

        {onTumunuGor && (
          <button
            type="button"
            onClick={onTumunuGor}
            className="inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-[0.6875rem] font-medium text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
          >
            Tüm Kurlar
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
};
