import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { CONFIDENCE_STYLES } from './ConfidenceRing';

const TERM_MAP = [
  { orig: 'faiz / faiz oranı', mapped: 'kâr payı', field: 'kar_payi_orani' },
  { orig: 'kredi', mapped: 'finansman', field: 'urun_turu' },
  { orig: 'mevduat', mapped: 'katılım fonu', field: 'urun_turu' },
  { orig: 'dosya masrafı', mapped: 'tahsis ücreti', field: 'tahsis_ucreti' },
  { orig: 'kart puanı', mapped: 'ödül', field: 'odul_miktari' },
];

const NORMALIZATION_RULES = [
  {
    title: 'Oran normalizasyonu',
    body: '"%2,05" · "2.05 %" · "yüzde 2,05" ifadeleri ondalık sayıya çevrilir: 0.0205 (nokta ayraçlı).',
  },
  {
    title: 'Vadeler her zaman ay cinsinden',
    body: '"10 yıl" → 120. "36 aya varan" → max: 36, min: null.',
  },
  {
    title: 'Ücret sıfırlama',
    body: '"Tahsis ücreti alınmaz" → deger: 0.00, tipi: "yok".',
  },
  {
    title: 'Kâr payı periyodu',
    body: 'Metinde "aylık" veya "yıllık" geçmiyorsa periyot: "belirsiz" atanır ve güven skoru en fazla 0.5 olur.',
  },
];

const CONFIDENCE_BANDS = [
  { range: '0.9 – 1.0', level: 'yuksek' as const, desc: 'Metinde açık ve tek anlamlı yazılı.' },
  { range: '0.6 – 0.8', level: 'orta' as const, desc: 'Biçim veya birim hafif yoruma açık.' },
  { range: '0.3 – 0.5', level: 'dusuk' as const, desc: 'Dolaylı çıkarım veya periyot belirsiz.' },
  { range: '0.0', level: 'yok' as const, desc: 'Alan metinde hiç geçmiyor.' },
];

const SectionHeading: React.FC<{ no: number; children: React.ReactNode }> = ({ no, children }) => (
  <h3 className="flex items-center gap-2 text-base font-medium text-txt">
    <span className="tnum grid h-6 w-6 place-items-center rounded-md bg-brand-100 font-mono text-xs text-brand-800 dark:bg-brand-900 dark:text-brand-200">
      {no}
    </span>
    {children}
  </h3>
);

export const TerminologyGuide: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-8 rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-6"
    >
      <header className="border-b border-line pb-4">
        <p className="flex items-center gap-2 text-xs text-brand-700 dark:text-brand-400">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Ajan çalışma mantığı
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-txt">
          Katılım bankacılığı çıkarım sözlüğü ve normalizasyon standartları
        </h2>
        <p className="mt-1 text-sm text-txt-secondary">
          Ajanın ham metinleri okurken uyguladığı eşleme, dönüşüm ve doğrulama kuralları.
        </p>
      </header>

      <section className="space-y-3">
        <SectionHeading no={1}>Zorunlu terim eşleme matrisi</SectionHeading>
        <p className="max-w-prose text-sm leading-relaxed text-txt-secondary">
          Konvansiyonel bankacılık terimleri çıkarımda kullanılmaz. Kaynak metin böyle bir terim
          içeriyorsa dönüşüm yapılır ve{' '}
          <code className="rounded bg-warn-50 px-1 py-0.5 text-warn-800 dark:bg-warn-950 dark:text-warn-200">
            terim_esleme_uygulandi: true
          </code>{' '}
          işaretlenir.
        </p>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TERM_MAP.map((item) => (
            <li key={item.orig} className="rounded-lg border border-line bg-sunken p-3">
              <div className="flex items-center justify-between gap-2 font-mono text-sm">
                <span className="truncate text-risk-700 line-through dark:text-risk-300">
                  {item.orig}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-txt-muted" aria-hidden="true" />
                <span className="truncate text-brand-700 dark:text-brand-300">{item.mapped}</span>
              </div>
              <p className="mt-1.5 font-mono text-xs text-txt-muted">Alan: {item.field}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <SectionHeading no={2}>Sayısal normalizasyon</SectionHeading>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {NORMALIZATION_RULES.map((rule) => (
            <li key={rule.title} className="rounded-lg border border-line bg-sunken p-3.5">
              <p className="text-sm font-medium text-txt">{rule.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-txt-secondary">{rule.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <SectionHeading no={3}>Kapalı liste sınıflandırmaları</SectionHeading>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-sunken p-4">
            <p className="text-sm font-medium text-txt">
              Ürün türü <code className="font-mono text-xs text-txt-muted">urun_turu</code>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                'konut_finansmani',
                'tasit_finansmani',
                'ihtiyac_finansmani',
                'kart',
                'katilim_fonu',
                'yatirim',
                'alisveris_puani',
                'diger',
              ].map((t) => (
                <span
                  key={t}
                  className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-xs text-txt-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-sunken p-4">
            <p className="text-sm font-medium text-txt">
              Müşteri segmenti{' '}
              <code className="font-mono text-xs text-txt-muted">musteri_segmenti</code>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['yeni_musteri', 'mevcut_musteri', 'kurumsal', 'kobi', 'genc', 'emekli', 'tumu'].map(
                (s) => (
                  <span
                    key={s}
                    className="rounded border border-line bg-surface px-2 py-0.5 font-mono text-xs text-txt-secondary"
                  >
                    {s}
                  </span>
                ),
              )}
            </div>
            <p className="mt-2 text-xs text-txt-muted">
              Metin segment belirtmiyorsa varsayılan &laquo;tumu&raquo; değil, boş dizi döndürülür.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading no={4}>Kanıt zorunluluğu ve güven ölçeği</SectionHeading>
        <p className="max-w-prose text-sm leading-relaxed text-txt-secondary">
          Ajan çıkardığı her alan için dayandığı cümleyi{' '}
          <code className="font-mono text-txt">kanitlar</code> nesnesinde birebir alıntılamak
          zorundadır. Kanıt gösterilemeyen alan çıkarılamaz.
        </p>

        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {CONFIDENCE_BANDS.map((band) => {
            const style = CONFIDENCE_STYLES[band.level];
            const Icon = style.icon;
            return (
              <li
                key={band.range}
                className={`rounded-lg border p-3 ${style.chipBg} ${style.chipBorder}`}
              >
                <p className={`flex items-center gap-1.5 font-mono text-sm ${style.text}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {band.range}
                  <span className="text-xs">· {style.label}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-txt-secondary">{band.desc}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </motion.article>
  );
};
