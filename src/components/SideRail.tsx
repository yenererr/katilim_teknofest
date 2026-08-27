import React from 'react';
import {
  Home,
  Tag,
  Receipt,
  MessagesSquare,
  Calculator,
  type LucideIcon,
} from 'lucide-react';
import { ARAC_NAV, TabKey } from './nav';
import { BankMark } from './BankMark';
import { BRAND_LOGO, BRAND_NAME, BRAND_TAGLINE } from '../lib/brand';

export interface SonIslem {
  id: string;
  baslik: string;
  altBaslik: string;
  zaman: string;
  bankaAdi?: string;
}

interface IhtiyacKarti {
  key: TabKey;
  baslik: string;
  aciklama: string;
  icon: LucideIcon;
  tooltip?: string;
}

const IHTIYACLAR: IhtiyacKarti[] = [
  {
    key: 'finansmanlar',
    baslik: 'Finansman Karşılaştır',
    aciklama: 'Konut, taşıt, ihtiyaç vb.',
    icon: Home,
  },
  {
    key: 'hesaplama',
    baslik: 'Finansman Hesapla',
    aciklama: 'Taksit ve ödeme planı',
    icon: Calculator,
  },
  { key: 'kampanyalar', baslik: 'Kampanya Bul', aciklama: 'İndirim, taksit, puan vb.', icon: Tag },
  {
    key: 'ucretler',
    baslik: 'Ücretleri Karşılaştır',
    aciklama: 'EFT, FAST, kart aidatı vb.',
    icon: Receipt,
  },
  {
    key: 'finansman-asistani',
    baslik: 'Asistana Sor',
    aciklama: 'Finansman bul veya soru sor',
    icon: MessagesSquare,
    tooltip: 'Asistan',
  },
];

interface SideRailProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  sonIslemler: SonIslem[];
  onSonIslemSec: (id: string) => void;
}

/** Sol panel: ihtiyaç seçimi ve son işlemler. */
export const SideRail: React.FC<SideRailProps> = ({
  activeTab,
  setActiveTab,
  sonIslemler,
  onSonIslemSec,
}) => (
  <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-sunken/55 px-4 py-5 lg:flex">
    <section className="px-1">
      <img
        src={BRAND_LOGO}
        alt={BRAND_NAME}
        className="h-10 w-52 object-contain object-left"
      />
      <p className="sr-only">{BRAND_TAGLINE}</p>
    </section>

    <section>
      <h2 className="px-1 pb-1.5 text-xs font-semibold tracking-wide text-txt-secondary uppercase">
        İhtiyacını Seç
      </h2>
      <ul className="space-y-0.5">
        {IHTIYACLAR.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setActiveTab(item.key)}
                aria-current={isActive ? 'page' : undefined}
                title={item.tooltip || item.baslik}
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:ring-offset-surface ${
                  isActive
                    ? 'bg-info-200 text-info-800 ring-1 ring-info-300 dark:bg-brand-950 dark:text-brand-200 dark:ring-brand-800'
                    : 'hover:bg-sunken'
                }`}
              >
                <Icon
                  className={`h-4.5 w-4.5 shrink-0 ${
                    isActive ? 'text-brand-700 dark:text-brand-400' : 'text-txt-muted'
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-txt">{item.baslik}</span>
                  <span className="block truncate text-xs text-txt-muted">{item.aciklama}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>

    <section className="border-t border-line pt-4">
      <h2 className="px-1 pb-2 text-xs font-semibold tracking-wide text-txt-secondary uppercase">
        Karşılaştırılan Son İşlemler
      </h2>
      {sonIslemler.length === 0 ? (
        <p className="px-1 text-xs leading-relaxed text-txt-muted">
          Henüz karşılaştırma yapılmadı. Üstteki formu doldurup “Karşılaştır” deyin.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {sonIslemler.slice(0, 4).map((islem) => (
            <li key={islem.id}>
              <button
                type="button"
                onClick={() => onSonIslemSec(islem.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <BankMark ad={islem.bankaAdi ?? islem.baslik} bankaId={undefined} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-txt">{islem.baslik}</span>
                  <span className="block truncate text-xs text-txt-secondary">
                    {islem.altBaslik}
                  </span>
                  <span className="block text-xs text-txt-muted">{islem.zaman}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section className="mt-auto border-t border-line pt-4">
      <ul className="space-y-1">
        {ARAC_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => setActiveTab(item.key)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-surface font-medium text-txt'
                    : 'text-txt-secondary hover:bg-surface hover:text-txt'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 text-txt-muted" aria-hidden="true" />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-2.5 pt-3 text-xs leading-relaxed text-txt-muted">
        Tüm işlem yerel çalışır. Dış servise veri gönderilmez.
      </p>
    </section>
  </aside>
);
