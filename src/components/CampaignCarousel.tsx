import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { BANKA_INDEKS } from '../data/piyasa';
import { kisaKampanyaAciklama, type KampanyaOzetKaynak } from '../lib/kampanyaOzet';
import { BankMark } from './BankMark';

export type KampanyaKarti = KampanyaOzetKaynak & {
  id?: string;
  bankId: string;
  sourceUrl?: string | null;
  campaignEnd?: string | null;
  campaignTheme?: string | null;
};

const TEMA_ETIKET: Record<string, string> = {
  education: 'EĞİTİM',
  card: 'KART',
  housing: 'KONUT',
  vehicle: 'TAŞIT',
  new_customer: 'YENİ MÜŞTERİ',
  shopping: 'ALIŞVERİŞ',
  general: 'GENEL',
};

function bitisMetni(ham?: string | null): string | null {
  if (!ham) return null;
  const t = new Date(ham);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })} tarihine kadar geçerli`;
}

interface CampaignCarouselProps {
  kampanyalar: KampanyaKarti[];
  /** “Tümünü Gör” — kampanyalar sekmesine geçer */
  onTumunuGor: () => void;
}

/** Popüler kampanyalar — kenar çubuğunda tek kart, ileri/geri gezinmeli. */
export const CampaignCarousel: React.FC<CampaignCarouselProps> = ({
  kampanyalar,
  onTumunuGor,
}) => {
  const [index, setIndex] = useState(0);
  const toplam = kampanyalar.length;

  useEffect(() => {
    setIndex(0);
  }, [toplam]);

  const aktif = toplam > 0 ? kampanyalar[Math.min(index, toplam - 1)] : null;
  const git = (yon: -1 | 1) => {
    if (toplam === 0) return;
    setIndex((i) => (i + yon + toplam) % toplam);
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-flat">
      <div className="flex items-center justify-between gap-2 pb-3.5">
        <h2 className="text-base font-semibold tracking-tight text-txt">Popüler Kampanyalar</h2>
        <button
          type="button"
          onClick={onTumunuGor}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
        >
          Tümünü Gör
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {aktif ? (
        <>
          <article className="min-h-[178px] rounded-xl border border-line bg-gradient-to-br from-brand-50/50 to-surface p-4 dark:from-brand-950/25">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <BankMark bankaId={aktif.bankId} />
                <span className="truncate text-[0.625rem] text-txt-secondary">
                  {BANKA_INDEKS[aktif.bankId]?.ad || aktif.bankId}
                </span>
              </div>
              <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[0.625rem] font-medium tracking-wide text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                {TEMA_ETIKET[aktif.campaignTheme || 'general'] || 'GENEL'}
              </span>
            </div>

            <h3 className="mt-2.5 text-[0.8125rem] leading-relaxed font-medium text-txt">
              {aktif.title || aktif.productName || 'Kampanya'}
            </h3>

            {kisaKampanyaAciklama(aktif) && (
              <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-txt-secondary">
                {kisaKampanyaAciklama(aktif)}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[0.5625rem] text-txt-muted">
                {bitisMetni(aktif.campaignEnd) ?? 'Bitiş tarihi belirtilmemiş'}
              </span>
              {aktif.sourceUrl && (
                <a
                  href={aktif.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[0.6875rem] font-medium text-brand-700 transition-colors hover:text-brand-800 dark:text-brand-400"
                >
                  Kaynak
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </article>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => git(-1)}
              disabled={toplam < 2}
              aria-label="Önceki kampanya"
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-txt-secondary transition-colors hover:bg-sunken disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-1.5" aria-hidden="true">
              {kampanyalar.map((k, i) => (
                <span
                  key={k.id || k.sourceUrl || i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    i === Math.min(index, toplam - 1) ? 'bg-brand-500' : 'bg-line-strong'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => git(1)}
              disabled={toplam < 2}
              aria-label="Sonraki kampanya"
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-txt-secondary transition-colors hover:bg-sunken disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="mt-2 text-center text-[0.5625rem] text-txt-muted">
            {Math.min(index, toplam - 1) + 1} / {toplam}
          </p>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-3 py-10 text-center text-xs leading-relaxed text-txt-secondary">
          Canlı kampanya henüz yok. Scraper veya veritabanı bağlantısı sonrası burada görünecek.
        </p>
      )}
    </section>
  );
};
