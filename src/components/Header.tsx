import React from 'react';
import { Building2, Sun, Moon, Clock, Download } from 'lucide-react';

export type TabKey = 'dashboard' | 'single' | 'kampanyalar' | 'compare' | 'guide' | 'json';

export const TAB_TITLES: Record<TabKey, { baslik: string; aciklama: string }> = {
  dashboard: {
    baslik: 'Genel Bakış',
    aciklama: 'Çıkarılan katılım bankacılığı ürünlerinin özeti.',
  },
  single: {
    baslik: 'Çıkarım',
    aciklama: 'Kampanya metnini analiz edip alanları kanıtla doğrulayın.',
  },
  kampanyalar: {
    baslik: 'Kampanyalar',
    aciklama: 'Çıkarılan tüm kampanyalar; karşılaştırmak için seçin.',
  },
  compare: {
    baslik: 'Karşılaştırma',
    aciklama: 'Benzer ürünleri standart kriterler üzerinden karşılaştırın.',
  },
  json: {
    baslik: 'JSON',
    aciklama: 'Şemaya uygun ham çıktı; kopyalayın veya indirin.',
  },
  guide: {
    baslik: 'Kurallar ve Rehber',
    aciklama: 'Terim eşleme, normalizasyon ve güven skoru standartları.',
  },
};

interface HeaderProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  extractedCount: number;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  /** Son başarılı çıkarımın zamanı */
  lastUpdated?: string | null;
  /** Sağ üstteki dışa aktarma eylemi (JSON indirme) */
  onExport?: () => void;
}

/**
 * Üst çubuk. Navigasyon Sidebar'a taşındı; burada bölüm başlığı,
 * veri tazeliği ve genel eylemler yer alır.
 */
export const Header: React.FC<HeaderProps> = ({
  activeTab,
  extractedCount,
  theme,
  onToggleTheme,
  lastUpdated,
  onExport,
}) => {
  const { baslik, aciklama } = TAB_TITLES[activeTab];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {/* Marka yalnızca mobilde — masaüstünde Sidebar'da duruyor */}
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-white lg:hidden">
            <Building2 className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-txt sm:text-lg">
              {baslik}
            </h1>
            <p className="hidden truncate text-xs text-txt-secondary sm:block">{aciklama}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {lastUpdated && (
            <span className="hidden items-center gap-1.5 rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-xs text-txt-secondary md:inline-flex">
              <Clock className="h-3.5 w-3.5 text-txt-muted" aria-hidden="true" />
              Son çıkarım {lastUpdated}
            </span>
          )}

          {onExport && extractedCount > 0 && (
            <button
              type="button"
              onClick={onExport}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs text-txt-secondary transition-colors hover:bg-sunken hover:text-txt"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">JSON indir</span>
            </button>
          )}

          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-txt-secondary transition-colors hover:bg-sunken hover:text-txt"
            >
              {theme === 'dark' ? (
                <Sun className="h-4.5 w-4.5" aria-hidden="true" />
              ) : (
                <Moon className="h-4.5 w-4.5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
