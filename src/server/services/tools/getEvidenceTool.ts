import { isQdrantConfigured } from "../qdrant/qdrantClient";
import { getVectorSearchService } from "../qdrant/vectorSearch";
import type { DocumentType } from "../qdrant/qdrantTypes";
import type { RagQueryPlan, RetrievedChunk } from "../rag/ragTypes";
import { evaluateFreshness } from "../rag/freshnessService";
import { getLiveBankStates } from "../liveData/liveDataBridge";

const INTENT_DOC_TYPES: Partial<Record<string, DocumentType[]>> = {
  fee_search: ["fee", "condition", "evidence"],
  campaign_search: ["campaign", "evidence"],
  condition_question: ["condition", "evidence", "product"],
  source_request: ["evidence", "product", "campaign", "fee", "condition"],
};

/**
 * Qdrant'tan kanıt / açıklama parçaları getirir.
 */
export async function getEvidenceChunks(
  query: string,
  plan: RagQueryPlan,
  topK = 16,
): Promise<RetrievedChunk[]> {
  if (!isQdrantConfigured()) return [];

  const documentTypes = INTENT_DOC_TYPES[plan.intent];
  const search = getVectorSearchService();
  const results = await search.searchHybrid({
    query,
    limit: topK,
    bankIds: plan.bankIds,
    productTypes: plan.productTypes,
    documentTypes,
    activeOnly: plan.activeOnly,
  });

  const states = getLiveBankStates();
  const byId = new Map(states.map((s) => [s.id, s]));

  return results.map((r, i) => {
    const state = byId.get(r.sourceId);
    return {
      citationId: i + 1,
      score: r.score,
      chunkText: r.chunkText,
      bankName: r.bankName,
      productName: r.productName,
      documentType: r.documentType,
      sourceUrl: r.sourceUrl,
      sourceCheckedAt: r.sourceCheckedAt || state?.lastCheckedAt || "",
      sourceId: r.sourceId,
      chunkIndex: r.chunkIndex,
      freshness: evaluateFreshness(state ?? null),
    };
  });
}
