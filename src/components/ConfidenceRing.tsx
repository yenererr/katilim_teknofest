import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, HelpCircle, AlertTriangle, Minus } from 'lucide-react';

/**
 * Panel genelinde TEK güven görselleştirme dili.
 * Renk hiçbir zaman tek başına anlam taşımaz: her seviyenin
 * kendi ikonu ve metin etiketi vardır.
 */

export type ConfidenceLevel = 'yuksek' | 'orta' | 'dusuk' | 'yok';

export const getConfidenceLevel = (score: number): ConfidenceLevel => {
  if (score >= 0.9) return 'yuksek';
  if (score >= 0.6) return 'orta';
  if (score > 0) return 'dusuk';
  return 'yok';
};

interface LevelStyle {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  track: string;
  arc: string;
  text: string;
  chipBg: string;
  chipBorder: string;
  /** Kart kenarı / şerit vurgusu için */
  edge: string;
}

export const CONFIDENCE_STYLES: Record<ConfidenceLevel, LevelStyle> = {
  yuksek: {
    label: 'Yüksek',
    icon: Check,
    track: 'stroke-brand-100 dark:stroke-brand-900',
    arc: 'stroke-brand-600 dark:stroke-brand-400',
    text: 'text-brand-700 dark:text-brand-300',
    chipBg: 'bg-brand-50 dark:bg-brand-950',
    chipBorder: 'border-brand-200 dark:border-brand-800',
    edge: 'bg-brand-500',
  },
  orta: {
    label: 'Orta',
    icon: HelpCircle,
    track: 'stroke-warn-100 dark:stroke-warn-900',
    arc: 'stroke-warn-600 dark:stroke-warn-400',
    text: 'text-warn-800 dark:text-warn-300',
    chipBg: 'bg-warn-50 dark:bg-warn-950',
    chipBorder: 'border-warn-200 dark:border-warn-800',
    edge: 'bg-warn-500',
  },
  dusuk: {
    label: 'Düşük',
    icon: AlertTriangle,
    track: 'stroke-risk-100 dark:stroke-risk-900',
    arc: 'stroke-risk-600 dark:stroke-risk-400',
    text: 'text-risk-700 dark:text-risk-300',
    chipBg: 'bg-risk-50 dark:bg-risk-950',
    chipBorder: 'border-risk-200 dark:border-risk-800',
    edge: 'bg-risk-500',
  },
  yok: {
    label: 'Metinde yok',
    icon: Minus,
    track: 'stroke-ink-200 dark:stroke-ink-800',
    arc: 'stroke-ink-400 dark:stroke-ink-600',
    text: 'text-txt-muted',
    chipBg: 'bg-sunken',
    chipBorder: 'border-line',
    edge: 'bg-ink-300 dark:bg-ink-700',
  },
};

interface ConfidenceRingProps {
  /** 0–1 aralığında güven skoru */
  score: number;
  /** Piksel cinsinden dış çap */
  size?: number;
  /** Ring içinde yüzde rakamı gösterilsin mi (küçük boyutlarda ikon daha okunur) */
  showValue?: boolean;
  className?: string;
  /** Ekran okuyucu için alan adı ön eki, örn. "Kâr payı oranı" */
  label?: string;
}

export const ConfidenceRing: React.FC<ConfidenceRingProps> = ({
  score,
  size = 44,
  showValue = true,
  className = '',
  label,
}) => {
  const reduceMotion = useReducedMotion();
  const level = getConfidenceLevel(score);
  const style = CONFIDENCE_STYLES[level];
  const Icon = style.icon;

  const stroke = size >= 56 ? 4 : 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, score));

  const srText = `${label ? label + ': ' : ''}güven %${Math.round(pct * 100)} — ${style.label}`;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={srText}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={style.track}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={style.arc}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduceMotion ? circumference * (1 - pct) : circumference }}
          animate={{ strokeDashoffset: circumference * (1 - pct) }}
          transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center ${style.text}`}
        aria-hidden="true"
      >
        {showValue && size >= 40 ? (
          <span className="tnum font-mono text-xs font-medium">{Math.round(pct * 100)}</span>
        ) : (
          <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
        )}
      </span>
    </div>
  );
};

interface ConfidenceChipProps {
  score: number;
  label?: string;
  className?: string;
}

/** Satır içi kompakt gösterim: ikon + yüzde + seviye adı (renk + şekil + metin). */
export const ConfidenceChip: React.FC<ConfidenceChipProps> = ({ score, label, className = '' }) => {
  const level = getConfidenceLevel(score);
  const style = CONFIDENCE_STYLES[level];
  const Icon = style.icon;

  return (
    <span
      role="img"
      aria-label={`${label ? label + ' ' : ''}güven %${Math.round(Math.max(0, score) * 100)} — ${style.label}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${style.chipBg} ${style.chipBorder} ${style.text} ${className}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
      <span className="tnum font-mono" aria-hidden="true">
        %{Math.round(Math.max(0, score) * 100)}
      </span>
      <span aria-hidden="true">·</span>
      <span aria-hidden="true">{style.label}</span>
    </span>
  );
};
