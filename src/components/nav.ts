import {
  Home,
  Wallet,
  Megaphone,
  Receipt,
  ArrowLeftRight,
  MessageSquare,
  FileCode2,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';

export type TabKey =
  | 'home'
  | 'finansmanlar'
  | 'kampanyalar'
  | 'ucretler'
  | 'compare'
  | 'asistan'
  | 'json'
  | 'guide';

export interface NavItem {
  key: TabKey;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

/** Üst çubuktaki ana gezinme — referans arayüzdeki sıra. */
export const ANA_NAV: NavItem[] = [
  { key: 'home', label: 'Ana Sayfa', shortLabel: 'Ana Sayfa', icon: Home },
  { key: 'finansmanlar', label: 'Finansmanlar', shortLabel: 'Finansman', icon: Wallet },
  { key: 'kampanyalar', label: 'Kampanyalar', shortLabel: 'Kampanya', icon: Megaphone },
  { key: 'ucretler', label: 'Ücretler', shortLabel: 'Ücret', icon: Receipt },
  { key: 'compare', label: 'Karşılaştırmalar', shortLabel: 'Karşılaştır', icon: ArrowLeftRight },
  { key: 'asistan', label: 'Asistana Sor', shortLabel: 'Asistan', icon: MessageSquare },
];

/** Yan panelin altındaki teknik görünümler. */
export const ARAC_NAV: NavItem[] = [
  { key: 'json', label: 'Ham JSON', shortLabel: 'JSON', icon: FileCode2 },
  { key: 'guide', label: 'Kurallar ve Rehber', shortLabel: 'Rehber', icon: BookOpen },
];

export const TAB_TITLES: Record<TabKey, { baslik: string; aciklama: string }> = {
  home: {
    baslik: 'Ana Sayfa',
    aciklama: 'Katılım bankalarını aynı koşullarda karşılaştırın.',
  },
  finansmanlar: {
    baslik: 'Finansmanlar',
    aciklama: 'Konut, taşıt ve ihtiyaç finansmanı teklifleri.',
  },
  kampanyalar: {
    baslik: 'Kampanyalar',
    aciklama: 'Güncel kampanyalar; karşılaştırmak için seçin.',
  },
  ucretler: {
    baslik: 'Ücretler',
    aciklama: 'EFT, FAST, kart aidatı ve diğer masraflar.',
  },
  compare: {
    baslik: 'Karşılaştırmalar',
    aciklama: 'Benzer ürünleri standart kriterler üzerinden karşılaştırın.',
  },
  asistan: {
    baslik: 'Asistana Sor',
    aciklama: 'Kampanya metnini doğal dille sorun, alanlar kanıtla çıkarılsın.',
  },
  json: {
    baslik: 'Ham JSON',
    aciklama: 'Şemaya uygun ham çıktı; kopyalayın veya indirin.',
  },
  guide: {
    baslik: 'Kurallar ve Rehber',
    aciklama: 'Terim eşleme, normalizasyon ve güven skoru standartları.',
  },
};
