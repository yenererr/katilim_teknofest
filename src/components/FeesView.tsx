import React, { useEffect, useState } from 'react';
import { ExternalLink, Info, Loader2 } from 'lucide-react';
import { BANKALAR } from '../data/piyasa';
import type {
  BankFeeVerification,
  FeeSourceRef,
  FeeValue,
  UcretKalemi,
} from '../data/verifiedFees';
import { formatFeeCell } from '../data/verifiedFees';
import { BankMark } from './BankMark';

type FeesResponse = {
  updated_at_tr?: string;
  channel_note?: string;
  items: UcretKalemi[];
  sources: FeeSourceRef[];
  bankVerifications?: BankFeeVerification[];
};

function cellFor(kalem: UcretKalemi, bankId: string): { amount: FeeValue; note?: string } {
  return {
    amount: kalem.degerler[bankId] ?? null,
    note: kalem.notlar?.[bankId],
  };
}

/** Ücret matrisi: doğrulanmış /api/live/fees verisi — banka satırlı tablo. */
export const FeesView: React.FC = () => {
  const [items, setItems] = useState<UcretKalemi[]>([]);
  const [sources, setSources] = useState<FeeSourceRef[]>([]);
  const [verifications, setVerifications] = useState<BankFeeVerification[]>([]);
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
        setVerifications(
          Array.isArray(data.bankVerifications) ? data.bankVerifications : [],
        );
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
            Doğrulanmış ücret tablosu
          </h2>
          <p className="mt-0.5 text-xs text-txt-secondary">
            Yalnızca resmî kaynaklardan doğrulanmış tarifeler.
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
            aria-label="Doğrulanmış ücret tablosu"
          >
            <table className="table-zebra w-full min-w-[56rem] border-collapse text-sm">
              <caption className="sr-only">
                Katılım bankalarının doğrulanmış ücretleri. Tire tarife yok; 0 TL ücretsiz
                anlamına gelir. Kart sütununda ürün adı gösterilir.
              </caption>
              <thead>
                <tr className="sticky top-0 z-10 bg-surface text-left">
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-xs font-medium text-txt-secondary"
                  >
                    Banka
                  </th>
                  {items.map((kalem) => (
                    <th
                      key={kalem.key}
                      scope="col"
                      className="px-3 py-2.5 text-xs font-medium text-txt-secondary"
                    >
                      <span className="block">{kalem.etiket}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BANKALAR.map((b) => (
                  <tr key={b.id} className="border-t border-line hover:bg-sunken">
                    <th scope="row" className="px-3 py-3 text-left font-medium">
                      <span className="flex items-center gap-2.5">
                        <BankMark bankaId={b.id} size="sm" />
                        <span className="text-txt">{b.ad}</span>
                      </span>
                    </th>
                    {items.map((kalem) => {
                      const { amount, note: cellNote } = cellFor(kalem, b.id);
                      const text = formatFeeCell(amount, cellNote);
                      return (
                        <td key={kalem.key} className="px-3 py-3">
                          <span
                            className={`tnum text-sm ${
                              amount == null
                                ? 'text-txt-muted'
                                : amount === 0
                                  ? 'font-medium text-brand-700 dark:text-brand-400'
                                  : 'font-mono text-txt'
                            }`}
                          >
                            {text}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {note ? (
        <p className="px-1 text-xs leading-relaxed text-txt-secondary">{note}</p>
      ) : (
        <p className="px-1 text-xs leading-relaxed text-txt-secondary">
          Buradaki “0 TL”, bankanın ilgili bireysel ürün veya dijital kanal için açıkça
          ücretsiz olduğunu belirtmesi anlamına geliyor. “—” ise ücret var demek değil;
          doğrulanabilir güncel tarife yayımlanmadığı anlamına geliyor.
        </p>
      )}

      {items.length > 0 ? (
        <section className="rounded-xl border border-line bg-surface px-4 py-3">
          <h3 className="text-xs font-semibold tracking-wide text-txt-secondary uppercase">
            Sütun açıklamaları
          </h3>
          <ul className="mt-2 space-y-2">
            {items.map((kalem) => (
              <li key={kalem.key} className="text-xs leading-relaxed text-txt-secondary">
                <span className="font-medium text-txt">{kalem.etiket}.</span>{' '}
                {kalem.aciklama}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {verifications.length > 0 ? (
        <section className="rounded-xl border border-line bg-surface">
          <div className="border-b border-line px-4 py-3.5">
            <h2 className="text-base font-semibold tracking-tight text-txt">
              Banka banka doğrulama
            </h2>
            <p className="mt-0.5 text-xs text-txt-secondary">
              Her satırın dayandığı resmî duyuru özeti. Premium veya ayrı kart ürünleri
              ücretli olabilir.
            </p>
          </div>
          <ol className="divide-y divide-line">
            {verifications.map((v, i) => (
              <li key={v.bankId} className="px-4 py-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-txt">
                  <span className="text-txt-muted">{i + 1}.</span>
                  <BankMark bankaId={v.bankId} size="sm" />
                  {v.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-txt-secondary">
                  {v.summary}
                </p>
                <ul className="mt-2 space-y-1">
                  {v.details.map((d) => (
                    <li
                      key={d}
                      className="text-xs leading-relaxed text-txt-secondary before:mr-1.5 before:text-txt-muted before:content-['•']"
                    >
                      {d}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-txt-muted">
                  Kaynak:{' '}
                  {v.sourceUrl ? (
                    <a
                      href={v.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-400"
                    >
                      {v.sourceLabel}
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    v.sourceLabel
                  )}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {sources.length > 0 ? (
        <section className="rounded-xl border border-line bg-surface px-4 py-3">
          <h3 className="text-xs font-semibold tracking-wide text-txt-secondary uppercase">
            Kaynaklar
          </h3>
          <ul className="mt-2 space-y-1.5">
            {sources.map((s) => (
              <li key={`${s.bankId}-${s.url}-${s.label}`} className="text-xs text-txt-secondary">
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
        Adil Katılım için tabloda “Ücretsiz” yazılmaz — hizmet/tarife henüz yayımlanmamıştır.
        Nihai tarife için bankanın kendi ücret sayfasını doğrulayın.
      </p>
    </div>
  );
};
