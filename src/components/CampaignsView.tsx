import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, Loader2 } from 'lucide-react';
import { BANKA_INDEKS } from '../data/piyasa';
import { isDisplayableCampaignClient } from '../lib/kampanyaFiltre';
import { kisaKampanyaAciklama } from '../lib/kampanyaOzet';
import { BankMark } from './BankMark';

type LiveCampaign = {
  id?: string;
  bankId: string;
  title?: string | null;
  productName?: string | null;
  sourceUrl?: string | null;
  campaignEnd?: string | null;
  campaignTheme?: string | null;
  category?: string | null;
  rewardAmountTl?: number | null;
  rewardType?: string | null;
  installmentCount?: number | null;
  maxTermMonths?: number | null;
  profitRate?: number | null;
  ratePeriod?: string | null;
  conditions?: string[];
  participationMethod?: string | null;
  manualReviewRequired?: boolean;
};

type ThemeKey =
  | 'hepsi'
  | 'education'
  | 'card'
  | 'housing'
  | 'vehicle'
  | 'new_customer'
  | 'pilgrimage'
  | 'general';

const TEMALAR: { key: ThemeKey; etiket: string }[] = [
  { key: 'hepsi', etiket: 'Tümü' },
  { key: 'education', etiket: 'Eğitim' },
  { key: 'card', etiket: 'Kart' },
  { key: 'housing', etiket: 'Konut' },
  { key: 'vehicle', etiket: 'Taşıt' },
  { key: 'new_customer', etiket: 'Yeni müşteri' },
  { key: 'pilgrimage', etiket: 'Hac / Umre' },
  { key: 'general', etiket: 'Genel' },
];

const TEMA_ETIKET: Record<string, string> = {
  education: 'EĞİTİM',
  card: 'KART',
  housing: 'KONUT',
  vehicle: 'TAŞIT',
  new_customer: 'YENİ MÜŞTERİ',
  pilgrimage: 'HAC / UMRE',
  general: 'GENEL',
};

const tl = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0,
});

function oranEtiketi(value: number): string {
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return `%${pct.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Scrape / DB’den gelen canlı kampanyalar — statik mock yok. */
export const CampaignsView: React.FC = () => {
  const [tema, setTema] = useState<ThemeKey>('hepsi');
  const [liste, setListe] = useState<LiveCampaign[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    fetch('/api/live/campaigns')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('yanıt yok'))))
      .then(
        (d: {
          financingCampaigns?: LiveCampaign[];
          cardAndDiscountCampaigns?: LiveCampaign[];
        }) => {
          if (iptal) return;
          const hepsi = [
            ...(d.financingCampaigns || []),
            ...(d.cardAndDiscountCampaigns || []),
          ].filter(isDisplayableCampaignClient);
          const uniq = new Map<string, LiveCampaign>();
          for (const c of hepsi) {
            const key = `${c.bankId}|${c.sourceUrl || c.id || c.title}`;
            if (!uniq.has(key)) uniq.set(key, c);
          }
          setListe([...uniq.values()]);
          setHata(null);
        },
      )
      .catch(() => {
        if (!iptal) {
          setListe([]);
          setHata('Kampanyalar yüklenemedi. Scraper veya veritabanı bağlantısını kontrol edin.');
        }
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, []);

  const filtrelenen = useMemo(
    () =>
      tema === 'hepsi'
        ? liste
        : liste.filter((c) => (c.campaignTheme || 'general') === tema),
    [liste, tema],
  );

  return (
    <section className="space-y-4">
      <p className="text-xs text-txt-secondary">
        Yalnızca banka sitelerinden scrape edilen aktif kampanyalar gösterilir; örnek veri yoktur.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {TEMALAR.map((k) => {
          const isActive = tema === k.key;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setTema(k.key)}
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

      {yukleniyor && (
        <p className="inline-flex items-center gap-2 text-sm text-txt-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Kampanyalar yükleniyor…
        </p>
      )}

      {!yukleniyor && hata && (
        <p className="rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-sm text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200">
          {hata}
        </p>
      )}

      {!yukleniyor && !hata && filtrelenen.length === 0 && (
        <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-txt-secondary">
          Bu filtrede kayıtlı canlı kampanya yok. Asistandan banka adı yazarak da
          sorabilirsiniz.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtrelenen.map((k) => {
          const baslik = String(k.title || k.productName || 'Kampanya');
          const temaKey = k.campaignTheme || 'general';
          const bitis = k.campaignEnd
            ? String(k.campaignEnd).slice(0, 10)
            : null;
          const kosul =
            k.conditions?.find(Boolean) ||
            k.participationMethod ||
            kisaKampanyaAciklama(k) ||
            null;
          const taksit = k.installmentCount || k.maxTermMonths || null;
          const oran = typeof k.profitRate === 'number' ? oranEtiketi(k.profitRate) : null;
          const rowKey = `${k.bankId}-${k.sourceUrl || k.id || baslik}`;
          return (
            <li
              key={rowKey}
              className="flex flex-col rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <BankMark bankaId={k.bankId} size="sm" />
                  <span className="truncate text-xs text-txt-secondary">
                    {BANKA_INDEKS[k.bankId]?.ad || k.bankId}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-[0.625rem] font-medium tracking-wide text-txt-secondary">
                  {TEMA_ETIKET[temaKey] || 'GENEL'}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-medium text-txt">{baslik}</h3>
              {kosul && (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-txt-secondary">
                  {kosul}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {oran && (
                  <span className="rounded border border-line bg-sunken px-2 py-1 text-[0.6875rem] text-txt-secondary">
                    Kâr payı {oran}
                  </span>
                )}
                {taksit && (
                  <span className="rounded border border-line bg-sunken px-2 py-1 text-[0.6875rem] text-txt-secondary">
                    {taksit} taksit/ay
                  </span>
                )}
                {k.rewardAmountTl != null && (
                  <span className="rounded border border-line bg-sunken px-2 py-1 text-[0.6875rem] text-txt-secondary">
                    {tl.format(k.rewardAmountTl)} {k.rewardType === 'puan' ? 'puan' : k.rewardType === 'indirim' ? 'indirim' : 'ödül'}
                  </span>
                )}
              </div>
              {k.sourceUrl ? (
                <a
                  href={k.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300"
                >
                  Resmî sayfa
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : (
                <p className="mt-2 text-xs text-txt-muted">Kaynak URL yok</p>
              )}
              <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-xs text-txt-muted">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {bitis ? `Bitiş: ${bitis}` : 'Bitiş tarihi belirtilmemiş'}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
