import React from 'react';

/**
 * Kahraman alanı dekoratif görseli: kâr grafiği kartı, hesap makinesi ve yıldız.
 * Tamamen süsleme olduğu için ekran okuyucudan gizlenir.
 */
export const HeroFinanceArt: React.FC = () => (
  <div
    aria-hidden="true"
    className="relative hidden h-[210px] items-center justify-center sm:flex"
  >
    {/* Yıldız */}
    <span className="absolute top-[18px] left-[22px] h-[78px] w-[78px] rotate-[14deg] rounded-[26%] border-[4px] border-double border-brand-400/70 opacity-60" />

    {/* Grafik kartı */}
    <div className="absolute top-[18px] right-5 h-[140px] w-[170px] rotate-[5deg] rounded-[17px] border border-brand-500/20 bg-white/60 shadow-float backdrop-blur-md dark:bg-surface/70">
      <div className="absolute top-[38px] right-[25px] left-[25px] h-[50px]">
        <svg viewBox="0 0 120 50" className="h-full w-full">
          <polyline
            points="0,38 25,22 47,30 74,8 95,20 120,2"
            fill="none"
            stroke="var(--color-brand-500)"
            strokeWidth="2"
          />
          {[
            [0, 38],
            [25, 22],
            [47, 30],
            [74, 8],
            [95, 20],
            [120, 2],
          ].map(([cx, cy]) => (
            <circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r="2.5"
              fill="var(--color-brand-500)"
            />
          ))}
        </svg>
      </div>

      <div className="absolute bottom-[21px] left-[28px] flex h-[72px] items-end gap-[9px] right-5">
        {[24, 40, 35, 59, 85].map((h, i) => (
          <span
            key={i}
            style={{ height: `${h}%` }}
            className="flex-1 rounded-t bg-gradient-to-b from-brand-400 to-brand-200"
          />
        ))}
      </div>
    </div>

    {/* Hesap makinesi */}
    <div className="absolute bottom-[23px] left-[44px] h-[125px] w-[98px] rotate-[10deg] rounded-2xl border border-line bg-gradient-to-br from-white to-brand-50 p-3.5 shadow-float dark:from-surface dark:to-brand-950">
      <div className="mb-3 h-[25px] rounded bg-gradient-to-r from-brand-700 to-brand-400" />
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="h-3.5 rounded border border-line bg-white dark:bg-surface"
          />
        ))}
      </div>
    </div>
  </div>
);
