import { asciiKatla } from "../../../nlp/normalize";

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

export function isJunkCampaignTitle(title: string): boolean {
  const t = asciiKatla(title).trim();
  return (
    !t ||
    /^(kampanya|kampanyalar|detay|finansmanlar|urunler|bireysel|kurumsal)$/.test(t)
  );
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

/** Aynı URL / aynı başlık (case-insensitive) tek kayda iner; listing ve junk elenir. */
export function dedupeCampaignRecords<
  T extends { sourceUrl?: unknown; title?: unknown; productName?: unknown },
>(rows: T[]): T[] {
  const byUrl = new Map<string, T>();
  const byTitle = new Map<string, string>(); // title key -> url key

  for (const r of rows) {
    const url = String(r.sourceUrl || "").trim();
    if (!url || isCampaignListingUrl(url)) continue;
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
    if (titleQualityScore(titleRaw) > titleQualityScore(prevTitle)) {
      byUrl.set(urlKey, r);
      byTitle.set(titleKey, urlKey);
    }
  }

  return [...byUrl.values()];
}
