import {
  Home,
  Wallet,
  Megaphone,
  Receipt,
  ArrowLeftRight,
  MessageSquare,
  MessagesSquare,
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
  | 'finansman-asistani'
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
  {
    key: 'finansman-asistani',
    label: 'Finansman Asistanı',
    shortLabel: 'Fin. Asistan',
    icon: MessagesSquare,
  },
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
    aciklama: 'Doğrulanmış kaynaklarla kanıtlı RAG yanıtı alın.',
  },
  'finansman-asistani': {
    baslik: 'Finansman Asistanı',
    aciklama:
      'İhtiyacınızı anlatın; güncel katılım finansmanı seçeneklerini karşılaştıralım.',
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

/** Hash tabanlı soft-route (React Router yok) */
export const TAB_TO_HASH: Partial<Record<TabKey, string>> = {
  'finansman-asistani': '/finansman-asistani',
  asistan: '/asistan',
  home: '/',
};

export function tabFromHash(hash: string): TabKey | null {
  const h = hash.replace(/^#/, '');
  if (h === '/finansman-asistani' || h === 'finansman-asistani') {
    return 'finansman-asistani';
  }
  if (h === '/asistan' || h === 'asistan') return 'asistan';
  if (h === '/' || h === '' || h === '/home') return null;
  return null;
}
