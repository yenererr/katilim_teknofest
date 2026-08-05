import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { SAMPLE_BANK_TEXTS } from '../data/samples';
import { SampleBankText } from '../types';
import { Landmark, ArrowRight } from 'lucide-react';

interface SamplePickerProps {
  onSelectSample: (sample: SampleBankText) => void;
  selectedId?: string;
}

export const SamplePicker: React.FC<SamplePickerProps> = ({ onSelectSample, selectedId }) => {
  const reduceMotion = useReducedMotion();

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-raised" aria-label="Örnek kampanya metinleri">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium text-txt">
          <Landmark className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          Örnek katılım bankası kampanyaları
        </h2>
        <span className="tnum rounded border border-line bg-sunken px-2 py-0.5 font-mono text-xs text-txt-secondary">
          {SAMPLE_BANK_TEXTS.length} şablon
        </span>
      </div>

      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {SAMPLE_BANK_TEXTS.map((sample, idx) => {
          const isSelected = selectedId === sample.id;
          return (
            <motion.li
              key={sample.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : idx * 0.03 }}
            >
              <button
                type="button"
                onClick={() => onSelectSample(sample)}
                aria-pressed={isSelected}
                className={`group flex h-full min-h-24 w-full flex-col justify-between rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-950'
                    : 'border-line bg-sunken hover:border-line-strong hover:bg-surface'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-medium text-txt">{sample.bankName}</span>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-xs ${
                        sample.badge === 'Terim Eşlemeli'
                          ? 'border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200'
                          : 'border-line bg-surface text-txt-secondary'
                      }`}
                    >
                      {sample.badge}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-snug text-txt-secondary">
                    {sample.title}
                  </p>
                </div>
                <span className="mt-3 flex items-center justify-between text-xs text-txt-muted transition-colors group-hover:text-brand-700 dark:group-hover:text-brand-400">
                  {isSelected ? 'Yüklendi' : 'Yükle'}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
};
