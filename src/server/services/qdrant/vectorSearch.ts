import type { QdrantClient } from "@qdrant/js-client-rest";
import {
  EvrenEmbeddingService,
  getEmbeddingService,
} from "../embedding/evrenEmbeddingService";
import { ensureCollection } from "./collectionManager";
import { getQdrantClient } from "./qdrantClient";
import { normalizeForHash } from "./textChunker";
import type {
  DocumentType,
  FinancialDocumentPayload,
  VectorSearchParams,
  VectorSearchResult,
} from "./qdrantTypes";

const DEFAULT_LIMIT = 8;
const DEFAULT_SCORE_THRESHOLD = 0.35;
const DEDUPE_SIMILARITY = 0.92;

export type VectorSearchDeps = {
  embeddingService?: EvrenEmbeddingService;
  client?: QdrantClient;
  collection?: string;
  env?: NodeJS.ProcessEnv;
  scoreThreshold?: number;
};

function buildFilter(params: VectorSearchParams) {
  const must: Array<Record<string, unknown>> = [];

  if (params.bankIds?.length) {
    must.push({
      key: "bank_id",
      match: { any: params.bankIds },
    });
  }

  if (params.productTypes?.length) {
    // product_type yalnızca "product" tipi kayıtlarda dolu; kanıt (evidence)
    // parçalarında boştur. Zorunlu eşleşme istendiğinde bir bankanın tüm
    // kanıt metinleri elenir ve soru cevapsız kalır. Bu yüzden koşul
    // "ürün türü eşleşsin VEYA ürün türü tanımsız olsun" biçiminde kurulur.
    must.push({
      should: [
        { key: "product_type", match: { any: params.productTypes } },
        { is_empty: { key: "product_type" } },
      ],
    });
  }

  if (params.documentTypes?.length) {
    must.push({
      key: "document_type",
      match: { any: params.documentTypes },
    });
  }

  if (params.activeOnly) {
    must.push({
      key: "campaign_status",
      match: { value: "active" },
    });
  }

  return must.length ? { must } : undefined;
}

function toResult(
  score: number,
  payload: FinancialDocumentPayload,
): VectorSearchResult {
  return {
    score,
    chunkText: payload.chunk_text,
    bankName: payload.bank_name,
    productName: payload.product_name,
    documentType: payload.document_type,
    sourceUrl: payload.source_url,
    sourceCheckedAt: payload.source_checked_at,
    sourceId: payload.source_id,
    chunkIndex: payload.chunk_index,
  };
}

/**
 * Aynı kaynaktan neredeyse aynı metin parçalarını sonuçlardan çıkarır.
 */
export function dedupeSearchResults(
  results: VectorSearchResult[],
): VectorSearchResult[] {
  const kept: VectorSearchResult[] = [];

  for (const item of results) {
    const norm = normalizeForHash(item.chunkText);
    const duplicate = kept.some((prev) => {
      if (prev.sourceId !== item.sourceId) return false;
      const prevNorm = normalizeForHash(prev.chunkText);
      if (prevNorm === norm) return true;
      // Basit örtüşme oranı
      const shorter = prevNorm.length < norm.length ? prevNorm : norm;
      const longer = prevNorm.length < norm.length ? norm : prevNorm;
      if (shorter.length < 40) return false;
      return longer.includes(shorter) || jaccard(prevNorm, norm) >= DEDUPE_SIMILARITY;
    });
    if (!duplicate) kept.push(item);
  }

  return kept;
}

function jaccard(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(Boolean));
  const tb = new Set(b.split(/\s+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

export class VectorSearchService {
  private readonly embedding: EvrenEmbeddingService;
  private readonly env: NodeJS.ProcessEnv;
  private readonly defaultThreshold: number;

  constructor(private readonly deps: VectorSearchDeps = {}) {
    this.embedding = deps.embeddingService ?? getEmbeddingService();
    this.env = deps.env ?? process.env;
    this.defaultThreshold =
      deps.scoreThreshold ??
      Number(process.env.QDRANT_SCORE_THRESHOLD || DEFAULT_SCORE_THRESHOLD);
  }

  private async resolveClient(): Promise<{
    client: QdrantClient;
    collection: string;
  }> {
    if (this.deps.client && this.deps.collection) {
      return { client: this.deps.client, collection: this.deps.collection };
    }
    await ensureCollection(this.env);
    const { client, config } = getQdrantClient(this.env);
    return { client, collection: config.collection };
  }

  async searchSimilarDocuments(
    params: VectorSearchParams,
  ): Promise<VectorSearchResult[]> {
    const query = params.query?.trim();
    if (!query) {
      throw new Error("Arama sorgusu boş olamaz.");
    }

    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), 50);
    const threshold =
      params.scoreThreshold ??
      (Number.isFinite(this.defaultThreshold)
        ? this.defaultThreshold
        : DEFAULT_SCORE_THRESHOLD);

    const vector = await this.embedding.embedText(query);
    const { client, collection } = await this.resolveClient();
    const filter = buildFilter(params);

    const response = await client.query(collection, {
      query: vector,
      limit: Math.min(limit * 3, 64),
      with_payload: true,
      filter: filter as never,
      score_threshold: threshold,
    });

    const mapped: VectorSearchResult[] = [];
    for (const hit of response.points ?? []) {
      const payload = hit.payload as FinancialDocumentPayload | null;
      if (!payload?.chunk_text) continue;
      mapped.push(toResult(hit.score ?? 0, payload));
    }

    return dedupeSearchResults(mapped).slice(0, limit);
  }
}

export function getVectorSearchService(
  deps?: VectorSearchDeps,
): VectorSearchService {
  return new VectorSearchService(deps);
}

export type { DocumentType };
