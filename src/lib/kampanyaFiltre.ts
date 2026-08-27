/**
 * Kampanya listesi filtreleri — istemci ve sunucu ortak.
 * URL'de "kampanya" olmayan kurumsal/ürün sayfalarını eler.
 */

function asciiFold(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

const NON_CAMPAIGN_PATH_RE =
  /\/(gizlilik|guvenlik|kvkk|cerez|kisisel-veri|hakkimizda|hakkinda|bize-ulasin|iletisim|musteri-memnuniyeti|yatirimci-iliskileri|kariyer|basin|duyuru|haberler|atm|sube|internet-sube|giris|login|uye-ol|hesap-ac|sozlesme|politikas[iı]|surdurulebilirlik|insan-kaynaklari|katilim-bankaciligi)(\/|$)/i;

const JUNK_TITLE_RE =
  /^(kampanya|kampanyalar|detay|finansmanlar|urunler|bireysel|kurumsal|genel|gizlilik|guvenlik|gizlilik ve guvenlik|katilim bankaciligi|musteri memnuniyeti|musteri memnuniyeti politikasi|bize ulasin|yatirimci iliskileri|iletisim|kvkk|cerez politikasi|hakkimizda|kariyer)$/;

export function isCampaignListingPath(url: string): boolean {
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

export function isJunkCampaignTitleClient(title: string): boolean {
  const t = asciiFold(title).replace(/\s+/g, " ").trim();
  return !t || JUNK_TITLE_RE.test(t);
}

export function isLikelyCampaignUrlClient(url: string): boolean {
  if (!url || isCampaignListingPath(url)) return false;
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  if (NON_CAMPAIGN_PATH_RE.test(path)) return false;
  if (!/kampanya/.test(path)) return false;
  return true;
}

export function isDisplayableCampaignClient(row: {
  sourceUrl?: string | null;
  title?: string | null;
  productName?: string | null;
}): boolean {
  const url = String(row.sourceUrl || "").trim();
  const title = String(row.title || row.productName || "").trim();
  if (!url || !isLikelyCampaignUrlClient(url)) return false;
  if (isJunkCampaignTitleClient(title)) return false;
  return true;
}
