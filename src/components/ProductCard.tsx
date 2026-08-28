import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { KatilimUrunu, UrunTuru, MusteriSegmenti, TermDetail } from '../types';
import { ConfidenceRing, ConfidenceChip, getConfidenceLevel } from './ConfidenceRing';
import { AnimatedNumber } from './AnimatedNumber';
import { useToast } from './Toast';
import {
  AlertTriangle,
  Quote,
  Check,
  CheckCheck,
  Sparkles,
  Calendar,
  Wallet,
  CreditCard,
  Gift,
  Coins,
} from 'lucide-react';

interface ProductCardProps {
  product: KatilimUrunu;
  index: number;
  /** İkinci parametre çift yönlü kanıt bağı için alan anahtarıdır (isteğe bağlı). */
  onHighlightSentence: (sentence: string | null, key?: string | null) => void;
  /** Metinden seçilen kanıtın anahtarı (`${index}::${alan}`) */
  activeEvidenceKey?: string | null;
}

const PRODUCT_TYPE_LABELS: Record<UrunTuru, string> = {
  konut_finansmani: 'Konut finansmanı',
  tasit_finansmani: 'Taşıt finansmanı',
  ihtiyac_finansmani: 'İhtiyaç finansmanı',
  kart: 'Kart / ödül',
  katilim_fonu: 'Katılım fonu',
  yatirim: 'Yatırım',
  alisveris_puani: 'Alışveriş puanı',
  diger: 'Diğer',
};

const SEGMENT_LABELS: Record<MusteriSegmenti, string> = {
  yeni_musteri: 'Yeni müşteri',
  mevcut_musteri: 'Mevcut müşteri',
  maas_musterisi: 'Maaş müşterisi',
  emekli: 'Emekli',
  genc_ogrenci: 'Genç / öğrenci',
  esnaf_kobi: 'Esnaf / KOBİ',
  ticari_kurumsal: 'Ticari / kurumsal',
  kamu_calisani: 'Kamu çalışanı',
  kurumsal: 'Kurumsal',
  kobi: 'KOBİ',
  genc: 'Genç',
  tumu: 'Tümü',
};

const SECONDARY_TERMS = [
  { key: 'vade_ay', label: 'Vade', icon: Calendar },
  { key: 'tahsis_ucreti', label: 'Tahsis ücreti', icon: Wallet },
  { key: 'tutar', label: 'Finansman tutarı', icon: Coins },
  { key: 'taksit_sayisi', label: 'Taksit sayısı', icon: CreditCard },
  { key: 'odul', label: 'Ödül / puan', icon: Gift },
] as const;

const ALL_TERM_KEYS = ['kar_payi_orani', ...SECONDARY_TERMS.map((t) => t.key)];

const PERIYOT_LABELS: Record<string, string> = {
  aylik: 'aylık',
  yillik: 'yıllık',
  belirsiz: 'periyot belirsiz',
};

/** İkincil terimlerin normalize edilmiş değerini okunur metne çevirir. */
const formatTermValue = (key: string, term?: TermDetail<number | null> | null): string | null => {
  if (!term) return null;
  switch (key) {
    case 'vade_ay':
      if (term.max === undefined || term.max === null) return null;
      return term.min !== undefined && term.min !== null && term.min !== term.max
        ? `${term.min}–${term.max} ay`
        : `${term.max} ay`;
    case 'tahsis_ucreti':
      if (term.deger === 0) return 'Ücretsiz';
      if (term.deger === undefined || term.deger === null) return null;
      return `${term.deger.toLocaleString('tr-TR')} ${term.para_birimi || 'TRY'}`;
    case 'tutar':
      if (!term.min && !term.max) return null;
      return `${term.min ? term.min.toLocaleString('tr-TR') : '0'} – ${
        term.max ? term.max.toLocaleString('tr-TR') : 'sınırsız'
      } ₺`;
    default:
      if (term.deger === undefined || term.deger === null) return null;
      return term.deger.toLocaleString('tr-TR');
  }
};

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  index,
  onHighlightSentence,
  activeEvidenceKey,
}) => {
  const reduceMotion = useReducedMotion();
  const { showToast } = useToast();
  const [localQuoteKey, setLocalQuoteKey] = useState<string | null>(null);
  const [verified, setVerified] = useState<string[]>([]);

  const evidenceKeyOf = (field: string) => `${index}::${field}`;

  // Metinden gelen seçim varsa o, yoksa karttan yapılan seçim geçerlidir.
  const activeField = useMemo(() => {
    if (activeEvidenceKey && activeEvidenceKey.startsWith(`${index}::`)) {
      return activeEvidenceKey.slice(`${index}::`.length);
    }
    return activeEvidenceKey ? null : localQuoteKey;
  }, [activeEvidenceKey, localQuoteKey, index]);

  const toggleQuote = (field: string) => {
    const quote = product.kanitlar?.[field];
    if (!quote) return;
    if (activeField === field) {
      setLocalQuoteKey(null);
      onHighlightSentence(null, null);
    } else {
      setLocalQuoteKey(field);
      onHighlightSentence(quote, evidenceKeyOf(field));
    }
  };

  const toggleVerified = (field: string) => {
    setVerified((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));
  };

  const verifyAll = () => {
    setVerified(ALL_TERM_KEYS);
    showToast(`${product.urun_adi || 'Ürün'}: tüm alanlar doğrulandı olarak işaretlendi.`, 'basari');
  };

  const karPayi = product.terimler?.kar_payi_orani;
  const karPayiValue =
    karPayi?.deger !== undefined && karPayi?.deger !== null ? karPayi.deger * 100 : null;
  const needsReview = product.manuel_dogrulama_gerekli;

  const cardEdge = needsReview
    ? 'before:bg-warn-500'
    : getConfidenceLevel(product.ortalama_guven) === 'yuksek'
      ? 'before:bg-brand-500'
      : 'before:bg-ink-300 dark:before:bg-ink-700';

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.28, delay: reduceMotion ? 0 : index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      aria-label={`Ürün ${index + 1}: ${product.urun_adi || 'İsimsiz katılım ürünü'}`}
      className={`relative overflow-hidden rounded-xl border bg-surface p-4 shadow-raised before:absolute before:inset-y-0 before:left-0 before:w-[3px] sm:p-5 ${cardEdge} ${
        needsReview ? 'border-warn-300 bg-warn-50/40 dark:border-warn-800 dark:bg-warn-950/20' : 'border-line'
      }`}
    >
      {/* Başlık */}
      <div className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-line bg-sunken px-2 py-0.5 font-mono text-xs text-txt-secondary">
              #{index + 1}
            </span>
            <span className="rounded-full border border-line bg-sunken px-2.5 py-0.5 text-xs text-txt-secondary">
              {PRODUCT_TYPE_LABELS[product.urun_turu] ?? 'Diğer'}
            </span>
            {product.terim_esleme_uygulandi && (
              <span className="inline-flex items-center gap-1 rounded-full border border-info-200 bg-info-50 px-2.5 py-0.5 text-xs text-info-800 dark:border-info-800 dark:bg-info-950 dark:text-info-200">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Terim dönüşümü uygulandı
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-txt">
            {product.urun_adi || 'İsimsiz katılım ürünü'}
          </h3>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-txt-muted">Ortalama güven</div>
            <div className="tnum font-mono text-lg text-txt">
              %{Math.round(product.ortalama_guven * 100)}
            </div>
          </div>
          <ConfidenceRing score={product.ortalama_guven} size={52} label="Ortalama" />
        </div>
      </div>

      {/* Manuel doğrulama uyarısı */}
      {needsReview && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-warn-200 bg-warn-50 p-3 text-xs text-warn-900 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-600 dark:text-warn-400" aria-hidden="true" />
          <p className="leading-relaxed">
            <span className="font-medium">Manuel doğrulama gerekli.</span> Ortalama güven skoru
            %60&apos;ın altında (%{Math.round(product.ortalama_guven * 100)}). Alanları kanıt
            alıntılarıyla karşılaştırıp onaylayın.
          </p>
        </div>
      )}

      {/* Kahraman metrik: kâr payı oranı */}
      <div
        className={`mt-4 rounded-lg border p-4 transition-colors ${
          activeField === 'kar_payi_orani'
            ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-950'
            : 'border-line bg-sunken'
        }`}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-txt-secondary">Kâr payı oranı</div>
            {karPayiValue !== null ? (
              <div className="mt-1 flex items-baseline gap-2">
                <AnimatedNumber
                  value={karPayiValue}
                  decimals={2}
                  prefix="%"
                  className="font-mono text-hero font-medium tracking-tight text-txt"
                />
                <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-xs text-txt-secondary">
                  {PERIYOT_LABELS[karPayi?.periyot || 'belirsiz'] ?? 'periyot belirsiz'}
                </span>
              </div>
            ) : (
              <div className="mt-1 font-mono text-2xl text-txt-muted">Metinde yok</div>
            )}
            {karPayi?.ham && (
              <p className="mt-1.5 truncate font-mono text-xs text-txt-muted">
                Ham: &laquo;{karPayi.ham}&raquo;
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ConfidenceRing score={karPayi?.guven ?? 0} size={56} label="Kâr payı oranı" />
            <div className="flex flex-col gap-1.5">
              <EvidenceButton
                field="kar_payi_orani"
                quote={product.kanitlar?.kar_payi_orani}
                isActive={activeField === 'kar_payi_orani'}
                onToggle={toggleQuote}
              />
              <VerifyButton
                field="kar_payi_orani"
                label="Kâr payı oranı"
                isVerified={verified.includes('kar_payi_orani')}
                onToggle={toggleVerified}
              />
            </div>
          </div>
        </div>
      </div>

      {/* İkincil metrik ızgarası */}
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {SECONDARY_TERMS.map(({ key, label, icon: Icon }) => {
          const term = product.terimler?.[key] as TermDetail<number | null> | undefined;
          const value = formatTermValue(key, term);
          const isActive = activeField === key;
          const isVerified = verified.includes(key);

          return (
            <li
              key={key}
              className={`flex flex-col rounded-lg border p-3 transition-colors ${
                isActive
                  ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-950'
                  : 'border-line bg-surface'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-txt-secondary">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-txt-muted" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </span>
                <ConfidenceChip score={term?.guven ?? 0} label={label} />
              </div>

              <div className="mt-2 font-mono text-base text-txt">
                {value ?? <span className="text-txt-muted">Metinde yok</span>}
              </div>
              {term?.ham && (
                <p className="mt-1 truncate font-mono text-xs text-txt-muted" title={term.ham}>
                  &laquo;{term.ham}&raquo;
                </p>
              )}

              <div className="mt-3 flex items-center gap-1.5">
                <EvidenceButton
                  field={key}
                  quote={product.kanitlar?.[key]}
                  isActive={isActive}
                  onToggle={toggleQuote}
                />
                <VerifyButton
                  field={key}
                  label={label}
                  isVerified={isVerified}
                  onToggle={toggleVerified}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Kampanya bilgileri */}
      <dl className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-3 border-t border-line pt-4 text-xs">
        <div className="min-w-0">
          <dt className="text-txt-muted">Müşteri segmenti</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {product.musteri_segmenti?.length ? (
              product.musteri_segmenti.map((seg) => (
                <span
                  key={seg}
                  className="rounded border border-line bg-sunken px-2 py-0.5 text-txt-secondary"
                >
                  {SEGMENT_LABELS[seg] ?? seg}
                </span>
              ))
            ) : (
              <span className="text-txt-muted">Belirtilmedi</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-txt-muted">Kampanya başlangıcı</dt>
          <dd className="mt-1 font-mono text-txt">{product.kampanya_baslangic || 'Belirtilmedi'}</dd>
        </div>
        <div>
          <dt className="text-txt-muted">Kampanya bitişi</dt>
          <dd className="mt-1 font-mono text-txt">{product.kampanya_bitis || 'Süresiz'}</dd>
        </div>
      </dl>

      {product.notlar && (
        <p className="mt-3 rounded-lg border border-line bg-sunken p-3 text-xs leading-relaxed text-txt-secondary">
          <span className="text-txt">Ajan notu:</span> {product.notlar}
        </p>
      )}

      {/* Doğrulama izi */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-xs text-txt-secondary" aria-live="polite">
          <span className="tnum font-mono text-txt">
            {verified.length}/{ALL_TERM_KEYS.length}
          </span>{' '}
          alan doğrulandı
        </p>
        <button
          type="button"
          onClick={verifyAll}
          disabled={verified.length === ALL_TERM_KEYS.length}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-medium text-brand-800 transition-colors hover:bg-brand-100 disabled:opacity-50 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200 dark:hover:bg-brand-900"
        >
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
          Tüm alanları onayla
        </button>
      </div>
    </motion.article>
  );
};

const EvidenceButton: React.FC<{
  field: string;
  quote?: string;
  isActive: boolean;
  onToggle: (field: string) => void;
}> = ({ field, quote, isActive, onToggle }) => {
  if (!quote) {
    return <span className="inline-flex min-h-9 items-center px-2 text-xs text-txt-muted">Kanıt yok</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      aria-pressed={isActive}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
        isActive
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-line bg-surface text-txt-secondary hover:bg-sunken hover:text-txt'
      }`}
    >
      <Quote className="h-3.5 w-3.5" aria-hidden="true" />
      {isActive ? 'Kanıtı gizle' : 'Kanıt göster'}
    </button>
  );
};

const VerifyButton: React.FC<{
  field: string;
  label: string;
  isVerified: boolean;
  onToggle: (field: string) => void;
}> = ({ field, label, isVerified, onToggle }) => (
  <button
    type="button"
    onClick={() => onToggle(field)}
    aria-pressed={isVerified}
    aria-label={`${label} alanını doğrulandı olarak işaretle`}
    className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
      isVerified
        ? 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200'
        : 'border-line bg-surface text-txt-muted hover:bg-sunken hover:text-txt'
    }`}
  >
    <Check className="h-3.5 w-3.5" aria-hidden="true" />
    {isVerified ? 'Doğrulandı' : 'Doğrula'}
  </button>
);
