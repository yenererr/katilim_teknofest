import { searchStructuredProducts } from "../tools/searchProductsTool";
import { getEvidenceChunks } from "../tools/getEvidenceTool";
import type {
  RagQueryPlan,
  RetrievedChunk,
  StructuredProductHit,
} from "./ragTypes";

export type RetrievalBundle = {
  chunks: RetrievedChunk[];
  products: StructuredProductHit[];
  retrievalDurationMs: number;
  structuredDurationMs: number;
};

/**
 * Qdrant + yapılandırılmış katmanı birleştirir; tekrarları azaltır.
 */
export async function retrieveForPlan(
  query: string,
  plan: RagQueryPlan,
): Promise<RetrievalBundle> {
  let chunks: RetrievedChunk[] = [];
  let products: StructuredProductHit[] = [];
  let retrievalDurationMs = 0;
  let structuredDurationMs = 0;

  if (plan.requiresVectorSearch) {
    const t0 = Date.now();
    try {
      chunks = await getEvidenceChunks(query, plan, 10);
    } catch (err) {
      console.warn(
        "[RAG] vektör arama:",
        err instanceof Error ? err.message.slice(0, 200) : err,
      );
      chunks = [];
    }
    retrievalDurationMs = Date.now() - t0;
  }

  if (plan.requiresStructuredSearch) {
    const t0 = Date.now();
    products = searchStructuredProducts(plan);
    structuredDurationMs = Date.now() - t0;
  }

  // Kaynak çeşitliliği sayfa bazlı uygulanır. sourceId banka kimliğidir;
  // banka başına 3 parça sınırı, o bankaya ait tüm sayfaların yalnızca ilk
  // (çoğunlukla tanıtım) paragraflarının LLM'e ulaşmasına yol açıyordu.
  const perPage = new Map<string, number>();
  const perBank = new Map<string, number>();
  const diversified: RetrievedChunk[] = [];
  for (const c of chunks) {
    const sayfa = perPage.get(c.sourceUrl) || 0;
    if (sayfa >= 3) continue;
    const banka = perBank.get(c.sourceId) || 0;
    if (banka >= 6) continue;
    perPage.set(c.sourceUrl, sayfa + 1);
    perBank.set(c.sourceId, banka + 1);
    diversified.push({ ...c, citationId: diversified.length + 1 });
  }

  return {
    chunks: diversified.slice(0, 8),
    products: products.slice(0, 40),
    retrievalDurationMs,
    structuredDurationMs,
  };
}
