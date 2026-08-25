/** Qdrant koleksiyon şema sürümü */
export const QDRANT_SCHEMA_VERSION = "1.0.0";

/** Embedding vektör boyutu (bge-m3-embed) */
export const EMBEDDING_VECTOR_SIZE = 1024;

/** Varsayılan koleksiyon adı — istemciye collection adı gönderilmesine izin verilmez */
export const DEFAULT_QDRANT_COLLECTION = "katilim_finans_documents";

export type DocumentType =
  | "product"
  | "campaign"
  | "fee"
  | "condition"
  | "evidence";

export type CampaignStatus = "active" | "expired" | "unknown";

/** Qdrant noktası payload'ı (snake_case — filtre indeksleriyle uyumlu) */
export type FinancialDocumentPayload = {
  bank_id: string;
  bank_name: string;
  source_id: string;
  source_url: string;
  document_type: DocumentType;
  product_type?: string;
  product_name?: string;
  campaign_status?: CampaignStatus;
  chunk_index: number;
  chunk_text: string;
  title?: string;
  evidence_text?: string;
  source_checked_at: string;
  content_hash: string;
  schema_version: string;
};

/** İndeksleme girişi (camelCase API) */
export type IndexDocumentInput = {
  bankId: string;
  bankName: string;
  sourceId: string;
  sourceUrl: string;
  documentType: DocumentType;
  productType?: string;
  productName?: string;
  campaignStatus?: CampaignStatus;
  title?: string;
  evidenceText?: string;
  /** Embedding öncesi parçalanacak metin */
  text: string;
  sourceCheckedAt: string;
  contentHash: string;
};

export type VectorSearchParams = {
  query: string;
  limit?: number;
  bankIds?: string[];
  productTypes?: string[];
  documentTypes?: DocumentType[];
  activeOnly?: boolean;
  /** Cosine benzerlik eşiği (varsayılan 0.35) */
  scoreThreshold?: number;
};

export type VectorSearchResult = {
  score: number;
  chunkText: string;
  bankName: string;
  productName?: string;
  documentType: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  sourceId: string;
  chunkIndex: number;
};

export type QdrantHealthStatus = {
  ok: boolean;
  configured: boolean;
  collection: string;
  collectionReady: boolean;
  message: string;
};

export type IndexingResult = {
  upserted: number;
  deleted: number;
  skipped: number;
  sourceId?: string;
};

export type TextChunk = {
  text: string;
  chunkIndex: number;
  contentHash: string;
};
