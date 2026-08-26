import React from 'react';
import { Info } from 'lucide-react';
import { BANKALAR, UCRETLER, VERI_TARIHI } from '../data/piyasa';
import { BankMark } from './BankMark';
import { tlBicim2 } from '../lib/finansman';

/** Ücret matrisi: satırlar ücret kalemi, sütunlar banka. */
export const FeesView: React.FC = () => (
  <div className="space-y-4">
    <section className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3.5">
        <h2 className="text-base font-semibold tracking-tight text-txt">
          Ücret ve Masraf Karşılaştırması
        </h2>
        <p className="mt-0.5 text-xs text-txt-secondary">
          Bireysel müşteri tarifeleri, {VERI_TARIHI} itibarıyla.
        </p>
      </div>

      <div
        className="overflow-x-auto p-2"
        tabIndex={0}
        role="region"
        aria-label="Ücret karşılaştırma tablosu"
      >
        <table className="table-zebra w-full min-w-[52rem] border-collapse text-sm">
          <caption className="sr-only">
            Katılım bankalarının ücret kalemleri; sıfır değerler ücretsiz anlamına gelir.
          </caption>
          <thead>
            <tr className="sticky top-0 z-10 bg-surface">
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-txt-secondary">
                Ücret Kalemi
              </th>
              {BANKALAR.map((b) => (
                <th key={b.id} scope="col" className="px-3 py-2.5 text-center text-xs font-medium">
                  <span className="flex flex-col items-center gap-1">
                    <BankMark bankaId={b.id} size="sm" />
                    <span className="text-txt-secondary">{b.ad}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {UCRETLER.map((kalem) => {
              const degerler = BANKALAR.map((b) => kalem.degerler[b.id] ?? 0);
              const enDusuk = Math.min(...degerler);
              return (
                <tr key={kalem.key} className="border-t border-line hover:bg-sunken">
                  <th scope="row" className="px-3 py-3 text-left align-top font-medium">
                    <span className="block text-txt">{kalem.etiket}</span>
                    <span className="mt-0.5 block max-w-64 text-xs font-normal text-txt-muted">
                      {kalem.aciklama}
                    </span>
                  </th>
                  {BANKALAR.map((b) => {
                    const deger = kalem.degerler[b.id] ?? 0;
                    const enIyi = deger === enDusuk;
                    return (
                      <td key={b.id} className="px-3 py-3 text-center">
                        <span
                          className={`tnum font-mono ${
                            enIyi ? 'font-medium text-brand-700 dark:text-brand-400' : 'text-txt'
                          }`}
                        >
                          {deger === 0 ? 'Ücretsiz' : tlBicim2(deger)}
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
    </section>

    <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-txt-muted">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Tutarlar BSMV dâhildir. Kampanya dönemlerinde bankalar bu ücretleri geçici olarak
      kaldırabilir; nihai tarife için bankanın kendi ücret sayfasını doğrulayın.
    </p>
  </div>
);
