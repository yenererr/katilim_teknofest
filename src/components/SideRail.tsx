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
  <aside className="sticky top-[4.25rem] hidden h-[calc(100dvh-4.25rem)] w-70 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-4 py-5 lg:flex">
    <section>
      <h2 className="px-1 pb-2 text-sm font-semibold tracking-tight text-txt">İhtiyacını Seç</h2>
      <ul className="space-y-1.5">
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
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  isActive
                    ? 'border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950'
                    : 'border-line bg-surface hover:bg-sunken'
                }`}
              >
                <Icon
                  className={`h-4.5 w-4.5 shrink-0 ${
                    isActive ? 'text-brand-600 dark:text-brand-400' : 'text-txt-muted'
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
                className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:bg-sunken"
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
                    ? 'bg-sunken font-medium text-txt'
                    : 'text-txt-secondary hover:bg-sunken hover:text-txt'
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
