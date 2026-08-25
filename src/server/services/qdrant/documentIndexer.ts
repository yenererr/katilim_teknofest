import { v5 as uuidv5 } from "uuid";
import type { QdrantClient } from "@qdrant/js-client-rest";
import {
  EvrenEmbeddingService,
  getEmbeddingService,
} from "../embedding/evrenEmbeddingService";
import { ensureCollection } from "./collectionManager";
import { getQdrantClient } from "./qdrantClient";
import { chunkText } from "./textChunker";
import {
  QDRANT_SCHEMA_VERSION,
  type FinancialDocumentPayload,
  type IndexDocumentInput,
  type IndexingResult,
} from "./qdrantTypes";

/** Deterministik UUID için sabit namespace */
const DOCUMENT_NAMESPACE = uuidv5(
  "katilim-finans-documents.teknofestival",
  uuidv5.DNS,
);

export function buildPointId(
  sourceId: string,
  chunkContentHash: string,
  chunkIndex: number,
): string {
  return uuidv5(
    `${sourceId}:${chunkContentHash}:${chunkIndex}`,
    DOCUMENT_NAMESPACE,
  );
}

type PreparedPoint = {
  id: string;
  payload: FinancialDocumentPayload;
  text: string;
};

function preparePoints(documents: IndexDocumentInput[]): PreparedPoint[] {
  const points: PreparedPoint[] = [];
  const seenIds = new Set<string>();

  for (const doc of documents) {
    const chunks = chunkText(doc.text);
    for (const chunk of chunks) {
      const id = buildPointId(doc.sourceId, chunk.contentHash, chunk.chunkIndex);
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const payload: FinancialDocumentPayload = {
        bank_id: doc.bankId,
        bank_name: doc.bankName,
        source_id: doc.sourceId,
        source_url: doc.sourceUrl,
        document_type: doc.documentType,
        chunk_index: chunk.chunkIndex,
        chunk_text: chunk.text,
        source_checked_at: doc.sourceCheckedAt,
        content_hash: chunk.contentHash,
        schema_version: QDRANT_SCHEMA_VERSION,
      };

      if (doc.productType) payload.product_type = doc.productType;
      if (doc.productName) payload.product_name = doc.productName;
      if (doc.campaignStatus) payload.campaign_status = doc.campaignStatus;
      if (doc.title) payload.title = doc.title;
      if (doc.evidenceText) payload.evidence_text = doc.evidenceText;

      points.push({ id, payload, text: chunk.text });
    }
  }

  return points;
}

export type DocumentIndexerDeps = {
  embeddingService?: EvrenEmbeddingService;
  client?: QdrantClient;
  collection?: string;
  env?: NodeJS.ProcessEnv;
};

export class DocumentIndexer {
  private readonly embedding: EvrenEmbeddingService;
  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly deps: DocumentIndexerDeps = {}) {
    this.embedding = deps.embeddingService ?? getEmbeddingService();
    this.env = deps.env ?? process.env;
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

  async indexDocument(document: IndexDocumentInput): Promise<IndexingResult> {
    return this.indexDocuments([document]);
  }

  async indexDocuments(
    documents: IndexDocumentInput[],
  ): Promise<IndexingResult> {
    if (!documents.length) {
      return { upserted: 0, deleted: 0, skipped: 0 };
    }

    const prepared = preparePoints(documents);
    if (!prepared.length) {
      return { upserted: 0, deleted: 0, skipped: documents.length };
    }

    const vectors = await this.embedding.embedTexts(
      prepared.map((p) => p.text),
    );

    const { client, collection } = await this.resolveClient();
    const UPSERT_BATCH = 32;

    for (let i = 0; i < prepared.length; i += UPSERT_BATCH) {
      const slice = prepared.slice(i, i + UPSERT_BATCH);
      await client.upsert(collection, {
        wait: true,
        points: slice.map((point, offset) => ({
          id: point.id,
          vector: vectors[i + offset],
          payload: point.payload as unknown as Record<string, unknown>,
        })),
      });
    }

    return {
      upserted: prepared.length,
      deleted: 0,
      skipped: Math.max(0, documents.length - prepared.length),
    };
  }

  async deleteBySourceId(sourceId: string): Promise<IndexingResult> {
    const { client, collection } = await this.resolveClient();
    await client.delete(collection, {
      wait: true,
      filter: {
        must: [{ key: "source_id", match: { value: sourceId } }],
      },
    });
    return { upserted: 0, deleted: -1, skipped: 0, sourceId };
  }

  /**
   * Yeni noktaları yazar; başarıdan sonra aynı source_id altındaki
   * eski (yeni kümede olmayan) parçaları siler. Yazma başarısızsa silme yapılmaz.
   */
  async replaceSourceDocuments(
    sourceId: string,
    documents: IndexDocumentInput[],
  ): Promise<IndexingResult> {
    const scoped = documents.map((d) => ({ ...d, sourceId }));
    const prepared = preparePoints(scoped);

    if (!prepared.length) {
      // Boş içerik: eski kayıtları silme (güvenli taraf)
      return { upserted: 0, deleted: 0, skipped: documents.length, sourceId };
    }

    const vectors = await this.embedding.embedTexts(
      prepared.map((p) => p.text),
    );
    const { client, collection } = await this.resolveClient();

    const UPSERT_BATCH = 32;
    for (let i = 0; i < prepared.length; i += UPSERT_BATCH) {
      const slice = prepared.slice(i, i + UPSERT_BATCH);
      await client.upsert(collection, {
        wait: true,
        points: slice.map((point, offset) => ({
          id: point.id,
          vector: vectors[i + offset],
          payload: point.payload as unknown as Record<string, unknown>,
        })),
      });
    }

    const keepIds = prepared.map((p) => p.id);
    await client.delete(collection, {
      wait: true,
      filter: {
        must: [{ key: "source_id", match: { value: sourceId } }],
        must_not: [{ has_id: keepIds }],
      },
    });

    return {
      upserted: prepared.length,
      deleted: -1,
      skipped: 0,
      sourceId,
    };
  }
}

export function getDocumentIndexer(
  deps?: DocumentIndexerDeps,
): DocumentIndexer {
  return new DocumentIndexer(deps);
}
