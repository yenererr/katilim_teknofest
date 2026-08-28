import {
  Home,
  Wallet,
  Megaphone,
  Receipt,
  ArrowLeftRight,
  MessagesSquare,
  FileCode2,
  BookOpen,
  Calculator,
  Percent,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export type TabKey =
  | 'home'
  | 'finansmanlar'
  | 'hesaplama'
  | 'kar-payi'
  | 'findeks'
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
  { key: 'hesaplama', label: 'Hesaplama', shortLabel: 'Hesapla', icon: Calculator },
  { key: 'kar-payi', label: 'Kâr Payı', shortLabel: 'Kâr Payı', icon: Percent },
  { key: 'findeks', label: 'Findeks Analizi', shortLabel: 'Findeks', icon: ShieldCheck },
  { key: 'kampanyalar', label: 'Kampanyalar', shortLabel: 'Kampanya', icon: Megaphone },
  { key: 'ucretler', label: 'Ücretler', shortLabel: 'Ücret', icon: Receipt },
  { key: 'compare', label: 'Karşılaştırmalar', shortLabel: 'Karşılaştır', icon: ArrowLeftRight },
  {
    key: 'finansman-asistani',
    label: 'Asistan',
    shortLabel: 'Asistan',
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
  hesaplama: {
    baslik: 'Finansman Hesaplama',
    aciklama: 'Taksit, toplam tutar ve ödeme planını hesaplayın.',
  },
  'kar-payi': {
    baslik: 'Kâr Payı Hesaplama',
    aciklama: 'Katılma hesabı için bankaların resmî kâr payı araçlarından canlı sonuç.',
  },
  findeks: {
    baslik: 'Findeks Risk & Finansman Analizi',
    aciklama: 'Findeks PDF Raporu veya notunuz ile kişiye özel onay ve indirimli kâr payı analizi.',
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
    baslik: 'Asistan',
    aciklama: 'İhtiyacınızı anlatın veya soru sorun; kanıtlı cevap alın.',
  },
  'finansman-asistani': {
    baslik: 'Asistan',
    aciklama:
      'İhtiyacınızı anlatın; finansman seçeneklerini karşılaştırayım. Diğer sorularınızı resmî kaynaklara dayanarak yanıtlarım.',
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
export const TAB_TO_HASH: Record<TabKey, string> = {
  home: '/',
  // Eski "Finansmanlar" sekmesi kaldırıldı; karşılaştırmalar sayfasına yönlenir.
  finansmanlar: '/karsilastirmalar',
  hesaplama: '/hesaplama',
  'kar-payi': '/kar-payi',
  findeks: '/findeks',
  kampanyalar: '/kampanyalar',
  ucretler: '/ucretler',
  compare: '/karsilastirmalar',
  'finansman-asistani': '/asistan',
  asistan: '/asistan',
  json: '/json',
  guide: '/rehber',
};

const HASH_TO_TAB: Record<string, TabKey> = {};
for (const [tab, route] of Object.entries(TAB_TO_HASH)) {
  HASH_TO_TAB[route] = tab as TabKey;
}
HASH_TO_TAB['/finansman-asistani'] = 'finansman-asistani';
// Eski bağlantılar kırılmasın: /finansman-karsilastir → karşılaştırmalar
HASH_TO_TAB['/finansman-karsilastir'] = 'compare';
HASH_TO_TAB['/finansmanlar'] = 'compare';
HASH_TO_TAB['/home'] = 'home';

export function tabFromHash(hash: string): TabKey | null {
  const h = hash.replace(/^#/, '');
  const [pathPart, query = ''] = h.split('?');
  const path = pathPart || '/';

  if (
    path === '/hesaplama' &&
    /(?:^|&)mode=kar-payi(?:&|$)/.test(query)
  ) {
    return 'kar-payi';
  }

  const match = HASH_TO_TAB[path];
  if (match) return match;

  const bare = HASH_TO_TAB['/' + path];
  if (bare) return bare;

  if (path === '/') return 'home';
  return null;
}
