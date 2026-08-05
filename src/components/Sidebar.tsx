import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  LayoutDashboard,
  Sparkles,
  Megaphone,
  ArrowLeftRight,
  FileCode2,
  BookOpen,
  Building2,
} from 'lucide-react';
import { TabKey } from './Header';

interface SidebarProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  /** Karşılaştırma sekmesindeki rozet için ürün sayısı */
  extractedCount: number;
  /** İnceleme bekleyen ürün sayısı — kampanyalar sekmesinde uyarı rozeti */
  reviewCount?: number;
}

interface NavItem {
  key: TabKey;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Genel Bakış', shortLabel: 'Genel', icon: LayoutDashboard },
  { key: 'single', label: 'Çıkarım', shortLabel: 'Çıkarım', icon: Sparkles },
  { key: 'kampanyalar', label: 'Kampanyalar', shortLabel: 'Kampanya', icon: Megaphone },
  { key: 'compare', label: 'Karşılaştırma', shortLabel: 'Karşılaştır', icon: ArrowLeftRight },
  { key: 'json', label: 'JSON', shortLabel: 'JSON', icon: FileCode2 },
  { key: 'guide', label: 'Kurallar', shortLabel: 'Rehber', icon: BookOpen },
];

/**
 * Masaüstünde sol kenar navigasyonu, mobilde alt sekme çubuğu.
 * Tek bir tablist — çift DOM kaydı yok, ok tuşlarıyla gezilebilir.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  extractedCount,
  reviewCount = 0,
}) => {
  const reduceMotion = useReducedMotion();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const ileri = ['ArrowDown', 'ArrowRight'];
    const geri = ['ArrowUp', 'ArrowLeft'];
    let next: number | null = null;
    if (ileri.includes(event.key)) next = (index + 1) % NAV_ITEMS.length;
    else if (geri.includes(event.key)) next = (index - 1 + NAV_ITEMS.length) % NAV_ITEMS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = NAV_ITEMS.length - 1;
    if (next === null) return;

    event.preventDefault();
    const key = NAV_ITEMS[next].key;
    setActiveTab(key);
    refs.current[key]?.focus();
  };

  const rozet = (key: TabKey): { deger: number; ton: 'brand' | 'warn' } | null => {
    if (key === 'compare' && extractedCount > 0) return { deger: extractedCount, ton: 'brand' };
    if (key === 'kampanyalar' && reviewCount > 0) return { deger: reviewCount, ton: 'warn' };
    return null;
  };

  return (
    <>
      {/* Masaüstü: sol kenar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-600 text-white shadow-raised">
            <Building2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-txt">Katılım360</p>
            <p className="truncate text-xs text-txt-muted">Katılım bankacılığı zekâsı</p>
          </div>
        </div>

        <nav
          role="tablist"
          aria-orientation="vertical"
          aria-label="Panel bölümleri"
          className="flex flex-1 flex-col gap-1 px-3 py-2"
        >
          {NAV_ITEMS.map((item, index) => {
            const isActive = activeTab === item.key;
            const Icon = item.icon;
            const badge = rozet(item.key);
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
                className={`relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                  isActive ? 'text-txt' : 'text-txt-secondary hover:bg-sunken hover:text-txt'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-lg bg-sunken ring-1 ring-line"
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={`relative h-4.5 w-4.5 shrink-0 ${
                    isActive ? 'text-brand-600 dark:text-brand-400' : 'text-txt-muted'
                  }`}
                  aria-hidden="true"
                />
                <span className={`relative flex-1 text-left ${isActive ? 'font-medium' : ''}`}>
                  {item.label}
                </span>
                {badge && (
                  <span
                    className={`tnum relative rounded-full px-1.5 py-0.5 font-mono text-xs ${
                      badge.ton === 'brand'
                        ? 'bg-brand-600 text-white'
                        : 'bg-warn-100 text-warn-800 dark:bg-warn-900 dark:text-warn-200'
                    }`}
                  >
                    {badge.deger}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <p className="border-t border-line px-5 py-4 text-xs text-txt-muted">
          Tüm işlem yerel çalışır.
          <br />
          Dış servise veri gönderilmez.
        </p>
      </aside>

      {/* Mobil: alt sekme çubuğu */}
      <nav
        role="tablist"
        aria-label="Panel bölümleri"
        className="fixed inset-x-0 bottom-0 z-50 flex justify-between gap-0.5 border-t border-line bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {NAV_ITEMS.map((item, index) => {
          const isActive = activeTab === item.key;
          const Icon = item.icon;
          const badge = rozet(item.key);
          return (
            <button
              key={item.key}
              ref={(el) => {
                refs.current[`m-${item.key}`] = el;
              }}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`panel-${item.key}`}
              aria-label={item.label}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(item.key)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-xs transition-colors ${
                isActive ? 'text-brand-700 dark:text-brand-400' : 'text-txt-muted'
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {badge && (
                  <span
                    className={`absolute -top-1.5 -right-2 min-w-4 rounded-full px-1 text-center font-mono text-[0.625rem] leading-4 ${
                      badge.ton === 'brand' ? 'bg-brand-600 text-white' : 'bg-warn-500 text-warn-950'
                    }`}
                  >
                    {badge.deger}
                  </span>
                )}
              </span>
              <span className={isActive ? 'font-medium' : ''}>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
