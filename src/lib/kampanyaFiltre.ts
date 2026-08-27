/**
 * Kampanya listesi filtreleri — istemci ve sunucu ortak.
 * Yalnızca gerçek kampanya detay URL’lerini bırakır.
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

/** Kurumsal / yasal / iletişim / ürün kataloğu */
const BLOCKED_PATH_RE =
  /gizlilik|guvenlik|kvkk|cerez|kisisel-veri|aydinlatma|hakkimizda|hakkinda|bize-ulasin|iletisim|musteri-memnuniyet|yatirimci|kariyer|basin|duyuru|haberler|\/atm|\/sube|internet-sube|\/giris|\/login|uye-ol|hesap-ac|sozlesme|politika|surdurulebilirlik|insan-kaynak|katilim-bankaciligi|bilgi-toplumu|kurumsal-bilgi|icazet|hesaplama-arac|urunlerimiz|mobil-sube|index\.html|default\.aspx|\/assets\/pdf|\.pdf($|\?)/i;

/** Kampanya listesi / arşiv (detay değil) */
const LISTING_PATH_RE =
  /\/kampanyalar\/?$|\/kampanyalar\.html$|\/kart-kampanyalari\/?$|\/kampanya\/?$|kampanya-arsivi|biten-kampanyalar|finansman-kampanyalari\.aspx|dijital-bankacilik-kampanyalari\.aspx|ticari-kampanyalar\.aspx|\/kampanyalar\/sayfalar\/default\.aspx|\/musteri-ol-kampanyalari\/?$|\/finansman-kampanyalari\/?$|\/kart-kampanyalari\/ziraat-katilim-avantajli/i;

/** Ürün / finansman katalog sayfaları */
const PRODUCT_PATH_RE =
  /\/finansmanlar\/|\/finansman-urunleri\/|\/hizli-finansman\/|\/krediler\/(?!.*kampanya)|finansmani\.aspx|finansman\.aspx|urun-hizmet-ucret|hesaplama-araclari\.aspx|odeme-plani\.aspx|yedek-hesap|hazir-limit|gunluk-hesap/i;

const JUNK_TITLE_RE =
  /^(kampanya|kampanyalar|detay|finansmanlar|urunler|urunlerimiz|bireysel|kurumsal|genel|gizlilik.*|guvenlik|katilim bankaciligi|musteri memnuniyeti.*|bize ulasin|yatirimci iliskileri|iletisim.*|kvkk|cerez.*|hakkimizda|kariyer|index|default\.aspx|.*\.aspx|.*\.pdf|.*\.html|konut finansmanlari|arac finansmanlari|alisveris finansmanlari|ihtiyac finansmanlari|tasit finansmani|konut finansmani|arac finansmani|surdurulebilirlik temali.*|hesaplama araclari|icazet belgeleri|bilgi toplumu.*|kurumsal bilgi.*|sozlesme ve formlar|kisisel veriler.*|mobil sube|musteri iletisim.*|tkbb.*|iletisim formu|isyeri finansmani|ihtiyac finansmani|hadi kredi karti)$/;

export function isCampaignListingPath(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase().replace(/\/+$/, "");
    return LISTING_PATH_RE.test(p) || LISTING_PATH_RE.test(url.toLowerCase());
  } catch {
    return false;
  }
}

export function isJunkCampaignTitleClient(title: string): boolean {
  const t = asciiFold(title).replace(/\s+/g, " ").trim();
  if (!t || t.length < 3) return true;
  if (JUNK_TITLE_RE.test(t)) return true;
  if (/\.(aspx|pdf|html)$/i.test(t)) return true;
  if (/^adil katilim .*formu/i.test(t)) return true;
  return false;
}

export function isLikelyCampaignUrlClient(url: string): boolean {
  if (!url) return false;
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  const full = url.toLowerCase();
  if (BLOCKED_PATH_RE.test(path) || BLOCKED_PATH_RE.test(full)) return false;
  if (PRODUCT_PATH_RE.test(path)) return false;
  if (isCampaignListingPath(url)) return false;
  if (full.includes("katilimfinans") || full.includes("gold_ref")) return true;
  if (!/kampanya/.test(path)) return false;
  return true;
}

function isExpiredCampaign(campaignEnd?: string | null): boolean {
  if (!campaignEnd) return false;
  const m = String(campaignEnd).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  const now = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return end < now;
}

export function isDisplayableCampaignClient(row: {
  sourceUrl?: string | null;
  title?: string | null;
  productName?: string | null;
  campaignEnd?: string | null;
  campaignStatus?: string | null;
}): boolean {
  const url = String(row.sourceUrl || "").trim();
  const title = String(row.title || row.productName || "").trim();
  if (!url || !isLikelyCampaignUrlClient(url)) return false;
  if (isJunkCampaignTitleClient(title)) return false;
  if (row.campaignStatus === "expired") return false;
  if (isExpiredCampaign(row.campaignEnd)) return false;
  return true;
}
