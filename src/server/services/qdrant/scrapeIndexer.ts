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
};

export type ScrapeIndexContext = {
  bankId: string;
  bankName: string;
  sourceId: string;
  sourceUrls: string[];
  combinedText: string;
  contentHash: string;
  sourceCheckedAt: string;
  products: ProductLike[];
};

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

  if (ctx.combinedText.trim().length > 80) {
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

    docs.push({
      bankId: ctx.bankId,
      bankName: ctx.bankName,
      sourceId: ctx.sourceId,
      sourceUrl: primaryUrl,
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
        sourceUrl: primaryUrl,
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
