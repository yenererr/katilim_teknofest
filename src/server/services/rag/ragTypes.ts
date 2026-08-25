/** RAG istek/yanıt ve ara katman tipleri */

export type RagIntent =
  | "product_search"
  | "campaign_search"
  | "fee_search"
  | "comparison"
  | "condition_question"
  | "calculation"
  | "source_request"
  | "general_information"
  | "unsupported";

export type FreshnessStatus = "FRESH" | "STALE" | "EXPIRED" | "FAILED" | "UNKNOWN";

export type RagAnswerStatus =
  | "answered"
  | "insufficient_data"
  | "stale_data"
  | "clarification_required"
  | "unsupported";

export type RagQueryPlan = {
  intent: RagIntent;
  bankIds?: string[];
  productTypes?: string[];
  financingAmount?: number;
  termMonths?: number;
  targetSegment?: string[];
  activeOnly: boolean;
  requiresFreshData: boolean;
  requiresVectorSearch: boolean;
  requiresStructuredSearch: boolean;
  requiresCalculation: boolean;
  clarificationQuestion?: string;
};

export type StructuredProductHit = {
  productId: string;
  bankId: string;
  bankName: string;
  sourceUrls: string[];
  lastCheckedAt: string | null;
  lastExtractedAt: string | null;
  freshness: FreshnessStatus;
  isDemo: boolean;
  product: Record<string, unknown>;
};

export type RetrievedChunk = {
  citationId: number;
  score: number;
  chunkText: string;
  bankName: string;
  productName?: string;
  documentType: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  sourceId: string;
  chunkIndex: number;
  freshness: FreshnessStatus;
};

export type ComparisonToolResult = {
  method: string;
  inputs: Record<string, unknown>;
  result: Record<string, unknown>;
  ranked: Array<{
    productId: string;
    bankName: string;
    productName: string;
    metricLabel: string;
    metricValue: number | null;
    metricDisplay: string | null;
    excludedReason?: string;
  }>;
  warnings: string[];
  comparable: boolean;
};

export type RagCitation = {
  id: number;
  title?: string;
  bankName: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  evidenceText: string;
};

export type RagAnswer = {
  answer: string;
  status: RagAnswerStatus;
  products: Array<{
    productId?: string;
    bankName: string;
    productName?: string;
    verifiedFields: Record<string, unknown>;
    freshnessStatus: string;
  }>;
  citations: RagCitation[];
  warnings: string[];
  calculation?: {
    method: string;
    inputs: Record<string, unknown>;
    result: Record<string, unknown>;
  };
  dataAsOf?: string;
};

export type RagObservability = {
  request_id: string;
  intent: RagIntent;
  retrieval_duration_ms: number;
  structured_query_duration_ms: number;
  llm_duration_ms: number;
  total_duration_ms: number;
  retrieved_chunk_count: number;
  used_source_count: number;
  freshness_status: FreshnessStatus | "MIXED";
  model_alias: string | null;
  fallback_used: boolean;
  validation_status: "passed" | "failed" | "skipped";
};

export type RagChatResponse = RagAnswer & {
  requestId: string;
  observability?: RagObservability;
};

export const ALLOWED_BANK_DOMAINS = [
  "adilkatilim.com.tr",
  "albaraka.com.tr",
  "albarakaturk.com.tr",
  "dunyakatilim.com.tr",
  "hayatfinans.com.tr",
  "kuveytturk.com.tr",
  "tombank.com.tr",
  "emlakkatilim.com.tr",
  "mortgage.emlakkatilim.com.tr",
  "turkiyefinans.com.tr",
  "vakifkatilim.com.tr",
  "ziraatkatilim.com.tr",
] as const;

export const BANK_NAME_TO_ID: Record<string, string> = {
  "adil katılım": "adil-katilim",
  "adil katilim": "adil-katilim",
  albaraka: "albaraka",
  "albaraka türk": "albaraka",
  "dünya katılım": "dunya-katilim",
  "dunya katilim": "dunya-katilim",
  "hayat finans": "hayat-finans",
  "kuveyt türk": "kuveyt-turk",
  "kuveyt turk": "kuveyt-turk",
  "t.o.m. katılım": "tom-katilim",
  "tom katılım": "tom-katilim",
  "emlak katılım": "emlak-katilim",
  "türkiye finans": "turkiye-finans",
  "turkiye finans": "turkiye-finans",
  "vakıf katılım": "vakif-katilim",
  "vakif katilim": "vakif-katilim",
  "ziraat katılım": "ziraat-katilim",
  "ziraat katilim": "ziraat-katilim",
};
