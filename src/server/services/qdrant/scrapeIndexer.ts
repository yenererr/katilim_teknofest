import type { IndexDocumentInput } from "../qdrant/qdrantTypes";
import { hashText } from "../qdrant/textChunker";

type ProductLike = {
  urun_adi?: string | null;
  urun_turu?: string | null;
  kampanya_baslangic?: string | null;
  kampanya_bitis?: string | null;
  kanitlar?: Record<string, string | null | undefined> | null;
  notlar?: string | null;
  terimler?: Record<string, { ham?: string | null } | null> | null;
  /** Kaydın çıkarıldığı gerçek sayfa (orchestrator tarafından eklenir). */
  _sourceUrl?: string | null;
};

export type ScrapedPage = {
  url: string;
  text: string;
  /** bankSourceConfig içindeki sourceType; keşfedilen sayfalar için "detail" */
  sourceType: string;
};

export type ScrapeIndexContext = {
  bankId: string;
  bankName: string;
  sourceId: string;
  sourceUrls: string[];
  /** Sayfa bazlı metinler — her parça kendi URL'sine atfedilir. */
  pages?: ScrapedPage[];
  combinedText: string;
  contentHash: string;
  sourceCheckedAt: string;
  products: ProductLike[];
};

/**
 * Ana sayfa ve keşif sayfaları yalnızca bağlantı bulmak için taranır;
 * içerikleri kurumsal tanıtım metnidir ve kanıt olarak indekslendiğinde
 * ürün/oran sorularında alakasız sonuç üretir.
 */
const INDEKSLENMEYEN_SAYFA_TURLERI = new Set(["homepage", "discovery_only"]);

/** Sayfa başlığı: URL yolunun son anlamlı parçasından okunabilir etiket. */
function pageTitleFromUrl(url: string, bankName: string): string {
  try {
    const parcalar = new URL(url).pathname
      .split("/")
      .filter((p) => p && !/^(tr|tr-tr|sayfalar)$/i.test(p));
    const son = parcalar[parcalar.length - 1];
    if (!son) return `${bankName} — kaynak sayfa`;
    const etiket = son
      .replace(/\.(aspx|html?|php)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    return etiket ? `${bankName} — ${etiket}` : `${bankName} — kaynak sayfa`;
  } catch {
    return `${bankName} — kaynak sayfa`;
  }
}

function campaignStatusOf(product: ProductLike): "active" | "expired" | "unknown" {
  const end = product.kampanya_bitis;
  if (!end) return "unknown";
  const ts = Date.parse(end);
  if (!Number.isFinite(ts)) return "unknown";
  return ts < Date.now() ? "expired" : "active";
}

/**
 * Scraper çıktısından Qdrant indeksleme girdileri üretir.
 * Sayısal oran/tutar alanları vektöre yazılmaz; metinsel açıklamalar ve kanıtlar yazılır.
 */
export function buildIndexDocumentsFromScrape(
  ctx: ScrapeIndexContext,
): IndexDocumentInput[] {
  const primaryUrl = ctx.sourceUrls[0] || "";
  const docs: IndexDocumentInput[] = [];

  const indekslenecek = (ctx.pages || []).filter(
    (p) =>
      !INDEKSLENMEYEN_SAYFA_TURLERI.has(p.sourceType) &&
      p.text.trim().length > 80,
  );

  if (indekslenecek.length) {
    // Her sayfa kendi URL'siyle indekslenir; kaynak künyesi doğru sayfayı
    // gösterir ve tek bir 20 bin karakterlik blok diğer sayfaları kırpmaz.
    for (const page of indekslenecek) {
      docs.push({
        bankId: ctx.bankId,
        bankName: ctx.bankName,
        sourceId: ctx.sourceId,
        sourceUrl: page.url,
        documentType: "evidence",
        title: pageTitleFromUrl(page.url, ctx.bankName),
        text: page.text,
        sourceCheckedAt: ctx.sourceCheckedAt,
        contentHash: hashText(`${ctx.contentHash}:${page.url}`),
      });
    }
  } else if (ctx.combinedText.trim().length > 80) {
    // Sayfa dökümü yoksa (eski çağrı biçimi) birleşik metne düşülür.
    docs.push({
      bankId: ctx.bankId,
      bankName: ctx.bankName,
      sourceId: ctx.sourceId,
      sourceUrl: primaryUrl,
      documentType: "evidence",
      title: `${ctx.bankName} kaynak metin`,
      text: ctx.combinedText,
      sourceCheckedAt: ctx.sourceCheckedAt,
      contentHash: ctx.contentHash,
    });
  }

  for (const product of ctx.products || []) {
    const name = (product.urun_adi || "").trim() || "Ürün";
    const parts: string[] = [name];
    if (product.urun_turu) parts.push(`Tür: ${product.urun_turu}`);
    if (product.notlar) parts.push(String(product.notlar));

    const termHams = Object.values(product.terimler || {})
      .map((t) => t?.ham)
      .filter((h): h is string => Boolean(h && h.trim()));
    if (termHams.length) parts.push(termHams.join(". "));

    const evidenceLines = Object.entries(product.kanitlar || {})
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k, v]) => `${k}: ${v}`);

    const productText = [...parts, ...evidenceLines].join("\n").trim();
    if (productText.length < 40) continue;

    const productHash = hashText(`${ctx.contentHash}:${name}:${productText}`);
    // Kayıt hangi sayfadan çıkarıldıysa künye o sayfayı göstersin.
    const productUrl = product._sourceUrl?.trim() || primaryUrl;

    docs.push({
      bankId: ctx.bankId,
      bankName: ctx.bankName,
      sourceId: ctx.sourceId,
      sourceUrl: productUrl,
      documentType: product.kampanya_baslangic || product.kampanya_bitis
        ? "campaign"
        : "product",
      productType: product.urun_turu || undefined,
      productName: name,
      campaignStatus: campaignStatusOf(product),
      title: name,
      text: productText,
      evidenceText: evidenceLines[0],
      sourceCheckedAt: ctx.sourceCheckedAt,
      contentHash: productHash,
    });

    for (const [key, value] of Object.entries(product.kanitlar || {})) {
      if (typeof value !== "string" || value.trim().length < 40) continue;
      const evHash = hashText(`${ctx.contentHash}:kanit:${key}:${value}`);
      docs.push({
        bankId: ctx.bankId,
        bankName: ctx.bankName,
        sourceId: ctx.sourceId,
        sourceUrl: productUrl,
        documentType: key.includes("ucret") || key.includes("tahsis")
          ? "fee"
          : key.includes("vade") || key.includes("sart")
            ? "condition"
            : "evidence",
        productType: product.urun_turu || undefined,
        productName: name,
        campaignStatus: campaignStatusOf(product),
        title: `${name} — ${key}`,
        text: value,
        evidenceText: value,
        sourceCheckedAt: ctx.sourceCheckedAt,
        contentHash: evHash,
      });
    }
  }

  return docs;
}
