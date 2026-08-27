import React, { useEffect, useState } from 'react';
import { ExternalLink, Info, Loader2 } from 'lucide-react';
import { BANKALAR } from '../data/piyasa';
import type { FeeSourceRef, FeeValue, UcretKalemi } from '../data/verifiedFees';
import { BankMark } from './BankMark';
import { tlBicim2 } from '../lib/finansman';

type FeesResponse = {
  updated_at_tr?: string;
  channel_note?: string;
  items: UcretKalemi[];
  sources: FeeSourceRef[];
};

function formatFee(deger: FeeValue): string {
  if (deger == null) return '—';
  if (deger === 0) return 'Ücretsiz';
  return tlBicim2(deger);
}

/** Ücret matrisi: doğrulanmış /api/live/fees verisi. */
export const FeesView: React.FC = () => {
  const [items, setItems] = useState<UcretKalemi[]>([]);
  const [sources, setSources] = useState<FeeSourceRef[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [tarih, setTarih] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    fetch('/api/live/fees')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('yanıt yok'))))
      .then((data: FeesResponse) => {
        if (iptal) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setSources(Array.isArray(data.sources) ? data.sources : []);
        setNote(data.channel_note ?? null);
        setTarih(data.updated_at_tr ?? null);
        setHata(null);
      })
      .catch(() => {
        if (!iptal) setHata('Ücret tarifesi yüklenemedi.');
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line px-4 py-3.5">
          <h2 className="text-base font-semibold tracking-tight text-txt">
            Ücret ve Masraf Karşılaştırması
          </h2>
          <p className="mt-0.5 text-xs text-txt-secondary">
            Yalnızca doğrulanmış kaynaklardan gelen tarifeler gösterilir.
            {tarih ? ` Güncelleme: ${tarih}.` : null}
          </p>
        </div>

        {yukleniyor ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-txt-secondary">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Tarifeler yükleniyor…
          </div>
        ) : hata ? (
          <div className="px-4 py-10 text-center text-sm text-txt-secondary">{hata}</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-txt-secondary">
              Doğrulanmış ücret tarifesi henüz yok.
            </p>
          </div>
        ) : (
          <div
            className="overflow-x-auto p-2"
            tabIndex={0}
            role="region"
            aria-label="Ücret karşılaştırma tablosu"
          >
            <table className="table-zebra w-full min-w-[52rem] border-collapse text-sm">
              <caption className="sr-only">
                Katılım bankalarının ücret kalemleri; tire bilinmeyen, sıfır ücretsiz anlamına gelir.
              </caption>
              <thead>
                <tr className="sticky top-0 z-10 bg-surface">
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-left text-xs font-medium text-txt-secondary"
                  >
                    Ücret Kalemi
                  </th>
                  {BANKALAR.map((b) => (
                    <th
                      key={b.id}
                      scope="col"
                      className="px-3 py-2.5 text-center text-xs font-medium"
                    >
                      <span className="flex flex-col items-center gap-1">
                        <BankMark bankaId={b.id} size="sm" />
                        <span className="text-txt-secondary">{b.ad}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((kalem) => {
                  const bilinen = BANKALAR.map((b) => kalem.degerler[b.id]).filter(
                    (v): v is number => v != null,
                  );
                  const enDusuk = bilinen.length > 0 ? Math.min(...bilinen) : null;
                  return (
                    <tr key={kalem.key} className="border-t border-line hover:bg-sunken">
                      <th scope="row" className="px-3 py-3 text-left align-top font-medium">
                        <span className="block text-txt">{kalem.etiket}</span>
                        <span className="mt-0.5 block max-w-64 text-xs font-normal text-txt-muted">
                          {kalem.aciklama}
                        </span>
                      </th>
                      {BANKALAR.map((b) => {
                        const deger = kalem.degerler[b.id] ?? null;
                        const enIyi = deger != null && enDusuk != null && deger === enDusuk;
                        return (
                          <td key={b.id} className="px-3 py-3 text-center">
                            <span
                              className={`tnum font-mono ${
                                deger == null
                                  ? 'text-txt-muted'
                                  : enIyi
                                    ? 'font-medium text-brand-700 dark:text-brand-400'
                                    : 'text-txt'
                              }`}
                            >
                              {formatFee(deger)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {note ? (
        <p className="px-1 text-xs leading-relaxed text-txt-secondary">{note}</p>
      ) : null}

      {sources.length > 0 ? (
        <section className="rounded-xl border border-line bg-surface px-4 py-3">
          <h3 className="text-xs font-semibold tracking-wide text-txt-secondary uppercase">
            Kaynaklar
          </h3>
          <ul className="mt-2 space-y-1.5">
            {sources.map((s) => (
              <li key={`${s.bankId}-${s.url}`} className="text-xs text-txt-secondary">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-400"
                >
                  {s.label}
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-txt-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Tire (—) doğrulanmış rakam olmadığını gösterir; ücretsiz hücreler kaynakla teyit edilmiştir.
        Nihai tarife için bankanın kendi ücret sayfasını doğrulayın.
      </p>
    </div>
  );
};
