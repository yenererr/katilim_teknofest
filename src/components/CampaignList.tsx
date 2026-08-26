import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Landmark, ArrowLeftRight, Megaphone, AlertTriangle, Check, ListFilter } from 'lucide-react';
import {
  KarsilastirmaOgesi,
  URUN_TURU_ETIKETLERI,
  aylikKarPayi,
  kalanGun,
  yuzdeBicim,
} from '../lib/compare';
import { ConfidenceRing } from './ConfidenceRing';
import { UrunTuru } from '../types';

interface CampaignListProps {
  ogeler: KarsilastirmaOgesi[];
  /** Karşılaştırma için seçili ürün kimlikleri */
  secili: string[];
  onSeciliChange: (ids: string[]) => void;
  /** Alt çubuktaki "Karşılaştır" eylemi */
  onCompare: () => void;
  isLoading?: boolean;
}

const MAKS_SECIM = 4;

export const CampaignList: React.FC<CampaignListProps> = ({
  ogeler,
  secili,
  onSeciliChange,
  onCompare,
  isLoading,
}) => {
  const reduceMotion = useReducedMotion();
  const [turFiltre, setTurFiltre] = useState<UrunTuru | 'tumu'>('tumu');
  const [bankaFiltre, setBankaFiltre] = useState<string>('tumu');
  const [sadeceInceleme, setSadeceInceleme] = useState(false);

  const bankalar = useMemo(
    () =>
      Array.from(new Set<string>(ogeler.map((o) => o.bankaAdi))).sort((a, b) =>
        a.localeCompare(b, 'tr'),
      ),
    [ogeler],
  );
  const turler = useMemo(
    () => Array.from(new Set(ogeler.map((o) => o.product.urun_turu))),
    [ogeler],
  );

  const filtreli = useMemo(
    () =>
      ogeler.filter((o) => {
        if (turFiltre !== 'tumu' && o.product.urun_turu !== turFiltre) return false;
        if (bankaFiltre !== 'tumu' && o.bankaAdi !== bankaFiltre) return false;
        if (sadeceInceleme && !o.product.manuel_dogrulama_gerekli) return false;
        return true;
      }),
    [ogeler, turFiltre, bankaFiltre, sadeceInceleme],
  );

  const toggle = (id: string) => {
    if (secili.includes(id)) {
      onSeciliChange(secili.filter((s) => s !== id));
    } else if (secili.length < MAKS_SECIM) {
      onSeciliChange([...secili, id]);
    }
  };

  if (isLoading) {
    return (
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="rounded-xl border border-line p-4">
            <div className="skeleton h-5 w-32" />
            <div className="skeleton mt-3 h-16 w-full" />
            <div className="skeleton mt-3 h-9 w-28" />
          </li>
        ))}
      </ul>
    );
  }

  if (ogeler.length === 0) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center rounded-xl border border-line bg-surface p-10 text-center">
        <Megaphone className="mb-3 h-8 w-8 text-txt-muted" aria-hidden="true" />
        <h2 className="text-base font-medium text-txt">Henüz kampanya yok</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-txt-secondary">
          Çıkarım sekmesinde metin analiz ettikçe kampanyalar burada kart olarak listelenir ve
          karşılaştırmak için seçilebilir.
        </p>
      </div>
    );
  }

  const filtreDugmesi = (aktif: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors ${
      aktif
        ? 'border-brand-400 bg-brand-50 text-brand-800 dark:border-brand-600 dark:bg-brand-950 dark:text-brand-200'
        : 'border-line bg-surface text-txt-secondary hover:bg-sunken hover:text-txt'
    }`;

  return (
    <div className="space-y-4 pb-24 lg:pb-20">
      {/* Filtreler */}
      <section
        aria-label="Filtreler"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-flat"
      >
        <span className="mr-1 flex items-center gap-1.5 text-xs text-txt-muted">
          <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
          Filtreler
        </span>

        <button type="button" onClick={() => setTurFiltre('tumu')} className={filtreDugmesi(turFiltre === 'tumu')}>
          Tüm türler
        </button>
        {turler.map((t) => (
          <button key={t} type="button" onClick={() => setTurFiltre(t)} className={filtreDugmesi(turFiltre === t)}>
            {URUN_TURU_ETIKETLERI[t] ?? t}
          </button>
        ))}

        {bankalar.length > 1 && (
          <>
            <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setBankaFiltre('tumu')}
              className={filtreDugmesi(bankaFiltre === 'tumu')}
            >
              Tüm bankalar
            </button>
            {bankalar.map((b) => (
              <button key={b} type="button" onClick={() => setBankaFiltre(b)} className={filtreDugmesi(bankaFiltre === b)}>
                {b}
              </button>
            ))}
          </>
        )}

        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setSadeceInceleme((v) => !v)}
          aria-pressed={sadeceInceleme}
          className={filtreDugmesi(sadeceInceleme)}
        >
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          İnceleme bekleyenler
        </button>
      </section>

      <p className="px-1 text-xs text-txt-secondary" aria-live="polite">
        <span className="tnum font-mono text-txt">{filtreli.length}</span> kampanya listeleniyor
        {filtreli.length !== ogeler.length && ` (toplam ${ogeler.length})`}
      </p>

      {/* Kartlar */}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtreli.map((oge, idx) => {
          const p = oge.product;
          const isSelected = secili.includes(oge.id);
          const limitDoldu = !isSelected && secili.length >= MAKS_SECIM;
          const oran = aylikKarPayi(p);
          const vade = p.terimler?.vade_ay?.max ?? null;
          const kalan = kalanGun(p.kampanya_bitis);
          const sonaErdi = kalan !== null && kalan < 0;

          return (
            <motion.li
              key={oge.id}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, delay: reduceMotion ? 0 : Math.min(idx, 8) * 0.03 }}
              className={`flex flex-col rounded-xl border bg-surface p-4 transition-colors ${
                isSelected
                  ? 'border-brand-400 ring-1 ring-brand-400 dark:border-brand-600 dark:ring-brand-600'
                  : p.manuel_dogrulama_gerekli
                    ? 'border-warn-300 dark:border-warn-800'
                    : 'border-line'
              } ${sonaErdi ? 'opacity-70' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-sunken text-txt-muted">
                    <Landmark className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                        sonaErdi
                          ? 'border-line bg-sunken text-txt-muted'
                          : 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200'
                      }`}
                    >
                      {sonaErdi ? 'Sona erdi' : 'Aktif'}
                    </span>
                    <h3 className="mt-1 truncate text-sm font-medium text-txt" title={p.urun_adi ?? ''}>
                      {p.urun_adi || 'İsimsiz ürün'}
                    </h3>
                    <p className="truncate text-xs text-txt-secondary">
                      {URUN_TURU_ETIKETLERI[p.urun_turu] ?? p.urun_turu} · {oge.bankaAdi}
                    </p>
                  </div>
                </div>

                <label
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                    limitDoldu ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                  }`}
                >
                  <span className="sr-only">
                    {p.urun_adi || 'İsimsiz ürün'} kampanyasını karşılaştırmaya ekle
                  </span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={limitDoldu}
                    onChange={() => toggle(oge.id)}
                    className="h-5 w-5 accent-brand-600"
                  />
                </label>
              </div>

              {/* Metrik ikilisi */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-line bg-sunken p-2.5">
                  <p className="text-xs text-txt-secondary">Kâr payı oranı</p>
                  <p className="tnum mt-0.5 font-mono text-base text-txt">
                    {oran !== null ? yuzdeBicim(oran) : '—'}
                  </p>
                  {p.terimler?.kar_payi_orani?.periyot === 'belirsiz' && (
                    <p className="mt-0.5 text-xs text-warn-700 dark:text-warn-300">periyot belirsiz</p>
                  )}
                </div>
                <div className="rounded-lg border border-line bg-sunken p-2.5">
                  <p className="text-xs text-txt-secondary">Azami vade</p>
                  <p className="tnum mt-0.5 font-mono text-base text-txt">{vade !== null ? `${vade} ay` : '—'}</p>
                </div>
              </div>

              {p.notlar && (
                <p className="mt-3 line-clamp-3 rounded-lg border border-line bg-sunken p-2.5 text-xs leading-relaxed text-txt-secondary">
                  {p.notlar}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                <div className="flex items-center gap-2">
                  <ConfidenceRing score={p.ortalama_guven} size={36} label="Ortalama" />
                  <span className="text-xs text-txt-secondary">
                    {p.manuel_dogrulama_gerekli ? 'Doğrulama bekliyor' : 'Doğrulanabilir'}
                  </span>
                </div>
                {kalan !== null && kalan >= 0 && kalan <= 60 && (
                  <span className="tnum rounded border border-warn-200 bg-warn-50 px-1.5 py-0.5 font-mono text-xs text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200">
                    {kalan} gün
                  </span>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>

      {/* Seçim çubuğu */}
      <AnimatePresence>
        {secili.length > 0 && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-14 z-40 px-4 pb-2 lg:bottom-0 lg:left-64 lg:px-8 lg:pb-4"
          >
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised p-3 shadow-float">
              <p className="flex items-center gap-2 text-sm text-txt">
                <span className="tnum grid h-8 w-8 place-items-center rounded-full bg-brand-600 font-mono text-white">
                  {secili.length}
                </span>
                <span>
                  kampanya seçildi
                  <span className="block text-xs text-txt-secondary">
                    En fazla {MAKS_SECIM} kampanya karşılaştırılabilir.
                  </span>
                </span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSeciliChange([])}
                  className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-xs text-txt-secondary transition-colors hover:bg-sunken hover:text-txt"
                >
                  Temizle
                </button>
                <button
                  type="button"
                  onClick={onCompare}
                  disabled={secili.length < 2}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                >
                  <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                  Karşılaştır
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {secili.length === 1 && (
        <p className="sr-only" aria-live="polite">
          Karşılaştırma için en az iki kampanya seçin.
        </p>
      )}

      {filtreli.length === 0 && (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <Check className="mx-auto mb-2 h-6 w-6 text-txt-muted" aria-hidden="true" />
          <p className="text-sm text-txt">Bu filtrelerle eşleşen kampanya yok.</p>
        </div>
      )}
    </div>
  );
};
