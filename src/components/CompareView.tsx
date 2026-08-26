import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { KatilimUrunu } from '../types';
import { ConfidenceChip } from './ConfidenceRing';
import {
  KarsilastirmaOgesi,
  hesaplaKriterler,
  kazananHaritasi,
  aylikKarPayi,
  URUN_TURU_ETIKETLERI,
  yuzdeBicim,
} from '../lib/compare';
import { ArrowLeftRight, Star, Quote, Check, AlertTriangle, Sparkles } from 'lucide-react';

interface CompareViewProps {
  history: { id: string; text: string; products: KatilimUrunu[]; timestamp: string; bankName?: string }[];
  /** Hazır karşılaştırma öğeleri; verilmezse history'den türetilir. */
  ogeler?: KarsilastirmaOgesi[];
  /** Kampanyalar sekmesinde seçilenler; boşsa tümü karşılaştırılır. */
  seciliIds?: string[];
}

/** Satır bazlı değer okuyucular — her satır kendi biçimlendirmesini bilir. */
const SATIRLAR: {
  key: string;
  etiket: string;
  alan: string | null;
  kriter: string | null;
  deger: (p: KatilimUrunu) => React.ReactNode;
}[] = [
  {
    key: 'kar_payi',
    etiket: 'Kâr payı oranı (aylık)',
    alan: 'kar_payi_orani',
    kriter: 'en_dusuk_kar_payi',
    deger: (p) => {
      const oran = aylikKarPayi(p);
      if (oran === null) {
        const t = p.terimler?.kar_payi_orani;
        // Periyot belirsizse dönüştürme yapma; metinde geçtiği hâliyle göster.
        if (t?.ham) {
          return (
            <span className="text-warn-700 dark:text-warn-300">
              &laquo;{t.ham}&raquo;
              <span className="mt-0.5 block text-xs">periyot belirsiz — karşılaştırmaya girmez</span>
            </span>
          );
        }
        if (t?.deger !== undefined && t?.deger !== null && t.deger > 0) {
          return (
            <span className="text-warn-700 dark:text-warn-300">
              {yuzdeBicim(t.deger)}
              <span className="mt-0.5 block text-xs">periyot belirsiz — karşılaştırmaya girmez</span>
            </span>
          );
        }
        return <span className="text-txt-muted">Metinde yok</span>;
      }
      return <span className="tnum font-mono text-base text-txt">{yuzdeBicim(oran)}</span>;
    },
  },
  {
    key: 'vade',
    etiket: 'Azami vade',
    alan: 'vade_ay',
    kriter: 'en_uzun_vade',
    deger: (p) => {
      const v = p.terimler?.vade_ay;
      if (v?.max === undefined || v?.max === null) return <span className="text-txt-muted">Metinde yok</span>;
      const aralikli = v.min !== undefined && v.min !== null && v.min !== v.max;
      return (
        <span className="tnum font-mono text-txt">
          {aralikli ? `${v.min}–${v.max} ay` : `${v.max} ay`}
        </span>
      );
    },
  },
  {
    key: 'tahsis',
    etiket: 'Tahsis ücreti',
    alan: 'tahsis_ucreti',
    kriter: 'en_dusuk_masraf',
    deger: (p) => {
      const f = p.terimler?.tahsis_ucreti;
      if (f?.deger === 0)
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Ücretsiz
          </span>
        );
      if (f?.deger === undefined || f?.deger === null)
        return <span className="text-txt-muted">Metinde yok</span>;
      return (
        <span className="tnum font-mono text-txt">
          {f.deger.toLocaleString('tr-TR')} {f.para_birimi || 'TRY'}
        </span>
      );
    },
  },
  {
    key: 'tutar',
    etiket: 'Finansman tutarı',
    alan: 'tutar',
    kriter: null,
    deger: (p) => {
      const t = p.terimler?.tutar;
      if (!t?.min && !t?.max) return <span className="text-txt-muted">Metinde yok</span>;
      return (
        <span className="tnum font-mono text-xs text-txt">
          {t.min ? t.min.toLocaleString('tr-TR') : '0'} – {t.max ? t.max.toLocaleString('tr-TR') : 'sınırsız'} ₺
        </span>
      );
    },
  },
  {
    key: 'odul',
    etiket: 'Ödül / puan',
    alan: 'odul',
    kriter: 'en_yuksek_odul',
    deger: (p) => {
      const o = p.terimler?.odul;
      if (o?.deger === undefined || o?.deger === null)
        return <span className="text-txt-muted">Metinde yok</span>;
      return <span className="tnum font-mono text-txt">{o.deger.toLocaleString('tr-TR')} ₺</span>;
    },
  },
  {
    key: 'segment',
    etiket: 'Müşteri segmenti',
    alan: null,
    kriter: null,
    deger: (p) =>
      p.musteri_segmenti?.length ? (
        <span className="flex flex-wrap gap-1">
          {p.musteri_segmenti.map((s) => (
            <span key={s} className="rounded border border-line bg-sunken px-1.5 py-0.5 text-xs text-txt-secondary">
              {s}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-txt-muted">Belirtilmedi</span>
      ),
  },
  {
    key: 'kampanya_bitis',
    etiket: 'Kampanya bitişi',
    alan: null,
    kriter: null,
    deger: (p) =>
      p.kampanya_bitis ? (
        <span className="tnum font-mono text-xs text-txt">{p.kampanya_bitis}</span>
      ) : (
        <span className="text-txt-muted">Süresiz</span>
      ),
  },
  {
    key: 'terim_donusum',
    etiket: 'Terim dönüşümü',
    alan: null,
    kriter: null,
    deger: (p) =>
      p.terim_esleme_uygulandi ? (
        <span className="inline-flex items-center gap-1.5 rounded border border-warn-200 bg-warn-50 px-2 py-0.5 text-xs text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Uygulandı
        </span>
      ) : (
        <span className="text-xs text-txt-secondary">Gerekmedi</span>
      ),
  },
  {
    key: 'guven',
    etiket: 'Ortalama güven',
    alan: null,
    kriter: null,
    deger: (p) => <ConfidenceChip score={p.ortalama_guven} label="Ortalama" />,
  },
  {
    key: 'inceleme',
    etiket: 'Manuel inceleme',
    alan: null,
    kriter: null,
    deger: (p) =>
      p.manuel_dogrulama_gerekli ? (
        <span className="inline-flex items-center gap-1.5 rounded border border-risk-200 bg-risk-50 px-2 py-0.5 text-xs text-risk-800 dark:border-risk-800 dark:bg-risk-950 dark:text-risk-200">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          Gerekli
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Gerekmiyor
        </span>
      ),
  },
];

export const CompareView: React.FC<CompareViewProps> = ({ history, ogeler, seciliIds }) => {
  const reduceMotion = useReducedMotion();
  const [acikKanit, setAcikKanit] = useState<string | null>(null);

  // Öğeler dışarıdan gelmediyse geçmişten türet (geriye dönük uyumluluk)
  const tumOgeler = useMemo<KarsilastirmaOgesi[]>(() => {
    if (ogeler) return ogeler;
    const liste: KarsilastirmaOgesi[] = [];
    history.forEach((h) => {
      h.products.forEach((p, i) => {
        liste.push({
          id: `${h.id}::${i}`,
          bankaAdi: h.bankName || p.urun_adi || 'Katılım ürünü',
          product: p,
        });
      });
    });
    return liste;
  }, [ogeler, history]);

  const gosterilen = useMemo(
    () =>
      seciliIds && seciliIds.length > 0
        ? tumOgeler.filter((o) => seciliIds.includes(o.id))
        : tumOgeler,
    [tumOgeler, seciliIds],
  );

  const kriterler = useMemo(() => hesaplaKriterler(gosterilen), [gosterilen]);
  const kazananlar = useMemo(() => kazananHaritasi(kriterler), [kriterler]);
  const enAvantajli = kriterler.find((k) => k.key === 'en_avantajli');

  if (gosterilen.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface p-10 text-center">
        <ArrowLeftRight className="mx-auto mb-3 h-8 w-8 text-txt-muted" aria-hidden="true" />
        <h2 className="text-base font-medium text-txt">Karşılaştırılacak ürün yok</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-txt-secondary">
          Çıkarım sekmesinde birden fazla kampanya metni analiz edin, ardından Kampanyalar
          sekmesinden karşılaştırmak istediklerinizi seçin.
        </p>
      </div>
    );
  }

  const cellBase = 'border-l border-line px-4 py-3 align-top';
  const rowHeader = 'sticky left-0 z-10 bg-surface px-4 py-3 text-left text-sm font-medium text-txt-secondary';

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      {/* Özet yorum — veriden türetilmiş, uydurma yok */}
      {enAvantajli?.kazanan && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5 dark:border-brand-800 dark:bg-brand-950/40">
          <h2 className="flex items-center gap-2 text-sm font-medium text-txt">
            <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            Karşılaştırma özeti
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-txt-secondary">
            {gosterilen.length} ürün arasında bileşik skoru en yüksek olan{' '}
            <strong className="font-medium text-txt">{enAvantajli.kazanan.bankaAdi}</strong> —{' '}
            {enAvantajli.kazanan.product.urun_adi || 'isimsiz ürün'} ({enAvantajli.gosterim}). Skor;
            kâr payı, masraf, vade ve ödül alanlarının ağırlıklı normalizasyonuyla hesaplanır ve
            yalnızca metinde bulunan alanları dikkate alır.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {kriterler
              .filter((k) => k.key !== 'en_avantajli' && k.kazanan)
              .map((k) => (
                <li
                  key={k.key}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs text-txt-secondary"
                >
                  <Star className="h-3.5 w-3.5 fill-current text-brand-600 dark:text-brand-400" aria-hidden="true" />
                  {k.etiket}: <strong className="font-medium text-txt">{k.kazanan!.bankaAdi}</strong> (
                  {k.gosterim})
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <div className="border-b border-line pb-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-txt">
            <ArrowLeftRight className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            Karşılaştırma matrisi
          </h2>
          <p className="mt-0.5 text-xs text-txt-secondary">
            Her satırda en iyi değer yıldızla işaretlidir. Kanıt düğmesi, değerin çıkarıldığı
            cümleyi gösterir.
          </p>
        </div>

        <div
          className="mt-4 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Ürün karşılaştırma tablosu"
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">
              Katılım bankacılığı ürünlerinin kâr payı oranı, vade, tahsis ücreti, tutar, ödül,
              segment, terim dönüşümü ve güven skoru karşılaştırması
            </caption>
            <thead>
              <tr className="border-b border-line bg-sunken text-xs text-txt-secondary">
                <th scope="col" className="sticky left-0 z-10 min-w-44 bg-sunken px-4 py-3">
                  Kriter
                </th>
                {gosterilen.map((oge) => (
                  <th key={oge.id} scope="col" className="min-w-56 border-l border-line px-4 py-3">
                    <span className="block text-sm font-medium text-txt">{oge.bankaAdi}</span>
                    <span className="mt-0.5 block truncate text-xs text-txt-secondary">
                      {oge.product.urun_adi || 'İsimsiz ürün'}
                    </span>
                    <span className="mt-1 inline-block rounded border border-line bg-surface px-1.5 py-0.5 text-xs text-txt-muted">
                      {URUN_TURU_ETIKETLERI[oge.product.urun_turu] ?? oge.product.urun_turu}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {SATIRLAR.map((satir) => {
                const kazananId = satir.kriter ? kazananlar[satir.kriter] : null;
                const kanitVar =
                  satir.alan !== null &&
                  gosterilen.some((o) => o.product.kanitlar?.[satir.alan as string]);
                const kanitAcik = acikKanit === satir.key;

                return (
                  <React.Fragment key={satir.key}>
                    <tr>
                      <th scope="row" className={rowHeader}>
                        <span className="flex items-center justify-between gap-2">
                          {satir.etiket}
                          {kanitVar && (
                            <button
                              type="button"
                              onClick={() => setAcikKanit(kanitAcik ? null : satir.key)}
                              aria-expanded={kanitAcik}
                              aria-label={`${satir.etiket} için kanıt alıntılarını ${kanitAcik ? 'gizle' : 'göster'}`}
                              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                kanitAcik
                                  ? 'border-brand-600 bg-brand-600 text-white'
                                  : 'border-line bg-surface text-txt-muted hover:text-txt'
                              }`}
                            >
                              <Quote className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </th>

                      {gosterilen.map((oge) => {
                        const kazandi = kazananId === oge.id;
                        return (
                          <td
                            key={oge.id}
                            className={`${cellBase} ${
                              kazandi ? 'bg-brand-50 dark:bg-brand-950' : ''
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              {satir.deger(oge.product)}
                              {kazandi && (
                                <Star
                                  className="h-3.5 w-3.5 shrink-0 fill-current text-brand-600 dark:text-brand-400"
                                  aria-label="Bu kriterde en iyi"
                                />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>

                    {kanitAcik && satir.alan && (
                      <tr className="bg-sunken">
                        <th scope="row" className="px-4 py-3 text-left text-xs text-txt-muted">
                          Kanıt alıntısı
                        </th>
                        {gosterilen.map((oge) => {
                          const alinti = oge.product.kanitlar?.[satir.alan as string];
                          return (
                            <td key={oge.id} className="border-l border-line px-4 py-3 align-top">
                              {alinti ? (
                                <p className="text-xs leading-relaxed text-txt-secondary">
                                  &laquo;{alinti}&raquo;
                                </p>
                              ) : (
                                <span className="text-xs text-txt-muted">Kanıt yok</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 border-t border-line pt-3 text-xs text-txt-muted">
          Kâr payı oranları karşılaştırma için aylığa normalize edilir; yıllık oranlar 12'ye
          bölünür, periyodu belirsiz olanlar oran karşılaştırmasına dâhil edilmez.
        </p>
      </div>
    </motion.section>
  );
};
