import type { RagCitation, RetrievedChunk } from "./ragTypes";

export function buildCitations(chunks: RetrievedChunk[]): RagCitation[] {
  return chunks.map((c) => ({
    id: c.citationId,
    title: c.productName || `${c.bankName} — ${c.documentType}`,
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
