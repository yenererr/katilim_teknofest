import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Bell, Bookmark, ChevronDown, Moon, Sun, Download } from 'lucide-react';
import { ANA_NAV, TabKey } from './nav';
import { BRAND_NAME, BRAND_TAGLINE, HEADER_LOGO } from '../lib/brand';

interface TopNavProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  kaydedilenSayisi: number;
  bildirimSayisi: number;
  onExport?: () => void;
}

/**
 * Üst çubuk: marka, ana gezinme sekmeleri ve hesap eylemleri.
 * Sekmeler `role="tablist"` — ok tuşlarıyla gezilir.
 */
export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  setActiveTab,
  theme,
  onToggleTheme,
  kaydedilenSayisi,
  bildirimSayisi,
  onExport,
}) => {
  const reduceMotion = useReducedMotion();
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const ileri = ['ArrowRight', 'ArrowDown'];
    const geri = ['ArrowLeft', 'ArrowUp'];
    let next: number | null = null;
    if (ileri.includes(event.key)) next = (index + 1) % ANA_NAV.length;
    else if (geri.includes(event.key)) next = (index - 1 + ANA_NAV.length) % ANA_NAV.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ANA_NAV.length - 1;
    if (next === null) return;
    event.preventDefault();
    const key = ANA_NAV[next].key;
    setActiveTab(key);
    refs.current[key]?.focus();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        {/* Marka */}
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className="flex shrink-0 items-center gap-3 rounded-lg pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:ring-offset-canvas"
        >
          <img
            src={HEADER_LOGO}
            alt={BRAND_NAME}
            className="h-10 w-auto max-w-[min(14rem,52vw)] object-contain object-left"
          />
          <span className="sr-only">{BRAND_TAGLINE}</span>
        </button>

        {/* Ana gezinme — masaüstü */}
        <nav
          role="tablist"
          aria-label="Ana bölümler"
          className="mx-auto hidden items-center gap-1.5 lg:flex"
        >
          {ANA_NAV.map((item, index) => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                ref={(el) => {
                  refs.current[item.key] = el;
                }}
                id={`tab-${item.key}`}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={`panel-${item.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(item.key)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`relative flex min-h-11 items-center rounded-lg px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:ring-offset-canvas ${
                  isActive
                    ? 'font-semibold text-brand-700 dark:text-brand-300'
                    : 'text-txt-secondary hover:bg-sunken hover:text-txt'
                }`}
              >
                {item.label}
                {isActive && (
                  <motion.span
                    layoutId="topnav-indicator"
                    className="absolute inset-x-2 -bottom-2.5 h-0.5 rounded-full bg-brand-500 dark:bg-brand-400"
                    transition={
                      reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                    }
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Hesap eylemleri */}
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          <button
            type="button"
            onClick={() => setActiveTab('kampanyalar')}
            className="hidden min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-txt-secondary transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 md:inline-flex dark:hover:border-brand-800 dark:hover:bg-brand-950 dark:hover:text-brand-300"
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            Kaydedilenler
            {kaydedilenSayisi > 0 && (
              <span className="tnum rounded-full bg-brand-500 px-1.5 font-mono text-[0.625rem] text-white">
                {kaydedilenSayisi}
              </span>
            )}
          </button>

          <button
            type="button"
            aria-label={`Bildirimler (${bildirimSayisi})`}
            onClick={() => setActiveTab('kampanyalar')}
            className="relative grid h-11 w-11 place-items-center rounded-lg text-txt-secondary transition-colors hover:bg-sunken hover:text-txt"
          >
            <Bell className="h-4.5 w-4.5" aria-hidden="true" />
            {bildirimSayisi > 0 && (
              <span className="absolute top-2 right-2.5 h-2 w-2 rounded-full bg-risk-500 ring-2 ring-surface" />
            )}
          </button>

          {onExport && (
            <button
              type="button"
              onClick={onExport}
              aria-label="Çıkarımları JSON olarak indir"
              className="hidden h-11 w-11 place-items-center rounded-lg text-txt-secondary transition-colors hover:bg-sunken hover:text-txt sm:grid"
            >
              <Download className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
            className="grid h-11 w-11 place-items-center rounded-lg text-txt-secondary transition-colors hover:bg-sunken hover:text-txt"
          >
            {theme === 'dark' ? (
              <Sun className="h-4.5 w-4.5" aria-hidden="true" />
            ) : (
              <Moon className="h-4.5 w-4.5" aria-hidden="true" />
            )}
          </button>

          <span className="hidden min-h-11 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white shadow-raised sm:inline-flex">
            Giriş Yap
            <ChevronDown className="h-4 w-4 text-white/80" aria-hidden="true" />
          </span>
        </div>
      </div>

      {/* Ana gezinme — mobil, yatay kaydırmalı */}
      <nav
        role="tablist"
        aria-label="Ana bölümler (mobil)"
        className="flex gap-1.5 overflow-x-auto border-t border-line px-3 py-2 lg:hidden"
      >
        {ANA_NAV.map((item) => {
          const isActive = activeTab === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`panel-${item.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(item.key)}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  isActive
                  ? 'bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                  : 'text-txt-secondary hover:bg-sunken'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.shortLabel}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
