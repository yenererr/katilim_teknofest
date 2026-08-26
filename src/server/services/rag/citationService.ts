import type { RagCitation, RetrievedChunk } from "./ragTypes";

const BELGE_TURU_ETIKET: Record<string, string> = {
  product: "Ürün sayfası",
  campaign: "Kampanya sayfası",
  fee: "Ücret ve komisyon bilgisi",
  condition: "Koşullar ve sözleşme",
  evidence: "Kaynak sayfa alıntısı",
};

/**
 * Kaynak kartı başlığı. Ürün adı varsa onu kullanır; yoksa belge türünün
 * Türkçe etiketine düşer. Banka adı kartta ayrı satırda gösterildiği için
 * başlıkta tekrarlanmaz.
 */
export function citationTitle(
  documentType: string,
  productName?: string,
): string {
  const urun = productName?.trim();
  if (urun) return urun;
  return BELGE_TURU_ETIKET[documentType] ?? "Kaynak sayfa alıntısı";
}

export function buildCitations(chunks: RetrievedChunk[]): RagCitation[] {
  return chunks.map((c) => ({
    id: c.citationId,
    title: citationTitle(c.documentType, c.productName),
    bankName: c.bankName,
    sourceUrl: c.sourceUrl,
    sourceCheckedAt: c.sourceCheckedAt || "",
    evidenceText: c.chunkText.slice(0, 500),
  }));
}

/** Cevap metnindeki [KAYNAK n] referanslarını çıkarır */
export function extractCitationRefs(answer: string): number[] {
  const ids = new Set<number>();
  const re = /\[KAYNAK\s*(\d+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    ids.add(Number(m[1]));
  }
  return [...ids];
}
