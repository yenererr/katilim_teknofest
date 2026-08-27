import { asciiKatla } from "../../../nlp/normalize";
import {
  isDisplayableCampaignClient,
  isJunkCampaignTitleClient,
  isLikelyCampaignUrlClient,
} from "../../../lib/kampanyaFiltre";

/** Kampanya konu kategorisi — finansman türünden bağımsız. */
export type CampaignTheme =
  | "education"
  | "card"
  | "housing"
  | "vehicle"
  | "new_customer"
  | "pilgrimage"
  | "general";

export const CAMPAIGN_THEME_LABEL: Record<CampaignTheme, string> = {
  education: "Eğitim",
  card: "Kart",
  housing: "Konut",
  vehicle: "Taşıt",
  new_customer: "Yeni müşteri",
  pilgrimage: "Hac / Umre",
  general: "Genel",
};

const THEME_PATTERNS: Array<{ theme: CampaignTheme; re: RegExp }> = [
  {
    theme: "pilgrimage",
    re: /\bhac\b|hacca|umre|diyanet\s*umre|hac\s*finans|umre\s*finans/,
  },
  {
    theme: "education",
    re: /egitim|okul|universite|ogrenci|burs|okula\s*don|dershane|ogrenci\s*yurd|yurt\s*(ucret|aidat|finans)|kitap|kirtasiye/,
  },
  {
    theme: "new_customer",
    re: /yeni\s*musteri|hosgeldin|ilk\s*kez|yeni\s*uyelik|yeni\s*hesap|ilk\s*kart/,
  },
  {
    theme: "card",
    re: /\bkart\b|kredi\s*kart|debit|vclub|worldcard|bonus|miles|chip/,
  },
  {
    theme: "housing",
    re: /konut|mortgage|gayrimenkul|ev\s*finans|konut\s*finans|\bev\s+(alc|alacag|alacak|almak|aliyorum|bak|istiyorum)|\bev\b/,
  },
  {
    theme: "vehicle",
    re: /tasit|arac\s*finans|otomobil|araba\s*finans|tasit\s*finans|\baraba\b|\barac\b/,
  },
];

/** Başlık / URL / kategori metninden kampanya temasını çıkarır. */
export function inferCampaignTheme(opts: {
  title?: string | null;
  productName?: string | null;
  sourceUrl?: string | null;
  category?: string | null;
}): CampaignTheme {
  const haystack = asciiKatla(
    `${opts.title || ""} ${opts.productName || ""} ${opts.sourceUrl || ""} ${opts.category || ""}`,
  );
  if (opts.category === "card_campaign" || /kart.?kampanya|card_campaign/.test(haystack)) {
    // Eğitim + kart birlikteyse eğitim öncelikli (okula dönüş kart kampanyası)
    if (THEME_PATTERNS.find((p) => p.theme === "education")!.re.test(haystack)) {
      return "education";
    }
    return "card";
  }
  if (opts.category === "new_customer_financing") return "new_customer";
  for (const { theme, re } of THEME_PATTERNS) {
    if (re.test(haystack)) return theme;
  }
  return "general";
}

/** Kullanıcı mesajından kampanya teması (finansman amacı değil). */
export function parseCampaignThemeFromMessage(mesaj: string): CampaignTheme | null {
  const t = asciiKatla(mesaj);
  const hasKampanyaSignal =
    /kampanya|kmapnaya|kmapanya|kampnya|kampnyal|kampanyal|firsat|avantaj/.test(
      t,
    );

  // "konut finansmanı istiyorum" / "ev kredisi almak" → kampanya değil
  if (
    !hasKampanyaSignal &&
    /(finansman|kredi)/.test(t) &&
    /(istiyorum|lazim|ar[iı]yorum|alcam|alacag|hangisi|en iyi|\btl\b|\bbin\b|milyon|\d+\s*ay)/.test(
      t,
    )
  ) {
    return null;
  }

  const hasThemeAsk =
    /var\s*m[iı]|icin\b|ne\s+var|hangi|neler|goster|bak|pek[iı]|kendim|ozel/.test(t);

  for (const { theme, re } of THEME_PATTERNS) {
    if (!re.test(t)) continue;
    // "eğitim kampanyaları" veya "kırtasiye için var mı" / "hacca özel bir şey"
    if (hasKampanyaSignal || hasThemeAsk) return theme;
  }
  return null;
}

/** Kampanya kaydı verilen temaya uyuyor mu? */
export function campaignMatchesTheme(
  c: { title?: unknown; productName?: unknown; sourceUrl?: unknown; category?: unknown; campaignTheme?: unknown },
  theme: CampaignTheme,
): boolean {
  if (theme === "general") return true;
  const stored = c.campaignTheme as CampaignTheme | undefined;
  if (stored === theme) return true;
  return (
    inferCampaignTheme({
      title: String(c.title || ""),
      productName: String(c.productName || ""),
      sourceUrl: String(c.sourceUrl || ""),
      category: String(c.category || ""),
    }) === theme
  );
}

/** Karşılaştırma / ID için URL'yi normalize eder. */
export function normalizeCampaignUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    let path = u.pathname.replace(/\/+$/, "") || "/";
    u.pathname = path;
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

/** Liste sayfası mı (detay değil)? */
export function isCampaignListingUrl(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase().replace(/\/+$/, "");
    return (
      /\/kampanyalar$/.test(p) ||
      /\/kampanyalar\.html$/.test(p) ||
      /\/kart-kampanyalari$/.test(p) ||
      /\/kampanya$/.test(p)
    );
  } catch {
    return false;
  }
}

/** Kurumsal / yasal / iletişim sayfaları — kampanya değil. */
export function isJunkCampaignTitle(title: string): boolean {
  return isJunkCampaignTitleClient(title);
}

/** URL kampanya detayı gibi görünüyor mu? (liste / kurumsal / ürün kataloğu değil) */
export function isLikelyCampaignUrl(url: string): boolean {
  return isLikelyCampaignUrlClient(url);
}

/** Canlı listede gösterilebilir kampanya mı? */
export function isDisplayableCampaign(row: {
  sourceUrl?: unknown;
  title?: unknown;
  productName?: unknown;
}): boolean {
  return isDisplayableCampaignClient({
    sourceUrl: row.sourceUrl != null ? String(row.sourceUrl) : null,
    title: row.title != null ? String(row.title) : null,
    productName: row.productName != null ? String(row.productName) : null,
  });
}

/** Slug / düz metinden okunaklı başlık. */
export function prettifyCampaignTitle(raw: string): string {
  const cleaned = raw
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Kampanya";
  return cleaned
    .split(" ")
    .map((w) => {
      if (!w) return w;
      const lower = w.toLocaleLowerCase("tr-TR");
      if (/^(ve|ile|ya|mi|mu|mü|mı|de|da|te|ta|bir|için|icin)$/i.test(lower)) {
        return lower;
      }
      return (
        lower.charAt(0).toLocaleUpperCase("tr-TR") + lower.slice(1)
      );
    })
    .join(" ");
}

function titleQualityScore(title: string): number {
  let s = title.trim().length;
  if (/[A-ZİĞÜŞÖÇÁÉ]/.test(title)) s += 25;
  if (!isJunkCampaignTitle(title)) s += 50;
  if (/detay/i.test(title)) s -= 30;
  return s;
}

function recordDetailScore(row: Record<string, unknown>): number {
  let score = 0;
  for (const key of [
    "profitRate",
    "minAmountTl",
    "maxAmountTl",
    "minTermMonths",
    "maxTermMonths",
    "installmentCount",
    "allocationFeeValue",
    "rewardAmountTl",
    "campaignStart",
    "campaignEnd",
    "participationMethod",
  ]) {
    if (row[key] != null && row[key] !== "") score += 10;
  }
  if (Array.isArray(row.conditions)) score += Math.min(row.conditions.length, 5) * 8;
  if (Array.isArray(row.exclusions)) score += Math.min(row.exclusions.length, 3) * 4;
  if (Array.isArray(row.evidence)) score += Math.min(row.evidence.length, 6) * 3;
  if (row.manualReviewRequired === false) score += 8;
  return score;
}

/** Aynı URL / aynı başlık (case-insensitive) tek kayda iner; listing ve junk elenir. */
export function dedupeCampaignRecords<
  T extends { sourceUrl?: unknown; title?: unknown; productName?: unknown },
>(rows: T[]): T[] {
  const byUrl = new Map<string, T>();
  const byTitle = new Map<string, string>(); // title key -> url key

  for (const r of rows) {
    const url = String(r.sourceUrl || "").trim();
    if (!url || isCampaignListingUrl(url) || !isLikelyCampaignUrl(url)) continue;
    const titleRaw = String(r.title || r.productName || "").trim();
    if (isJunkCampaignTitle(titleRaw)) continue;

    const urlKey = normalizeCampaignUrl(url);
    const titleKey = asciiKatla(titleRaw).replace(/\s+/g, " ");
    const prevUrl = byUrl.get(urlKey);
    if (!prevUrl) {
      // Aynı başlık farklı URL'de varsa daha "detay" URL'sini tercih et
      const existingUrlKey = byTitle.get(titleKey);
      if (existingUrlKey && existingUrlKey !== urlKey) {
        const existing = byUrl.get(existingUrlKey);
        const preferNew =
          /\/detay\//i.test(url) &&
          existing &&
          !/\/detay\//i.test(String(existing.sourceUrl || ""));
        if (!preferNew) continue;
        byUrl.delete(existingUrlKey);
      }
      byUrl.set(urlKey, r);
      byTitle.set(titleKey, urlKey);
      continue;
    }

    const prevTitle = String(prevUrl.title || prevUrl.productName || "");
    const currentScore =
      titleQualityScore(titleRaw) + recordDetailScore(r as Record<string, unknown>);
    const prevScore =
      titleQualityScore(prevTitle) + recordDetailScore(prevUrl as Record<string, unknown>);
    if (currentScore > prevScore) {
      byUrl.set(urlKey, r);
      byTitle.set(titleKey, urlKey);
    }
  }

  return [...byUrl.values()];
}
