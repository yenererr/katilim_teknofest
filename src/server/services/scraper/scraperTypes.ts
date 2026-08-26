export type CampaignStatus = "active" | "expired" | "upcoming" | "unknown";

export type SourceStatus =
  | "pending"
  | "fetching"
  | "unchanged"
  | "changed"
  | "extracting"
  | "indexed"
  | "verified"
  | "expired"
  | "blocked"
  | "failed"
  | "parser_degraded"
  | "manual_review"
  | "no_public_campaign_page";

export type ContentCategory =
  | "housing_finance"
  | "vehicle_finance"
  | "consumer_finance"
  | "shopping_finance"
  | "commercial_finance"
  | "participation_account"
  | "profit_share_rate"
  | "financing_fee"
  | "financing_campaign"
  | "new_customer_financing"
  | "card_campaign"
  | "discount_campaign"
  | "investment_product"
  | "insurance"
  | "general_announcement"
  | "irrelevant";

export type ScrapedPage = {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  html: string;
  fetchedAt: string;
  fetchMethod: "fetch" | "playwright";
};

export type CleanDocument = {
  title: string | null;
  text: string;
  rawHtmlLength: number;
  cleanedLength: number;
};

export type SourceMetadata = {
  title: string | null;
  categoryHint: ContentCategory | null;
  campaignStatus: CampaignStatus;
};

export type ExtractedFinancialRecord = {
  bankId: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  title: string | null;
  recordType: "campaign" | "product" | "fee" | "rate";
  category: ContentCategory;
  productName: string | null;
  productType: string | null;
  profitRate: number | null;
  ratePeriod: "monthly" | "annual" | "unknown" | null;
  minAmountTl: number | null;
  maxAmountTl: number | null;
  minTermMonths: number | null;
  maxTermMonths: number | null;
  installmentCount: number | null;
  allocationFeeValue: number | null;
  allocationFeeType: "fixed" | "percentage" | null;
  rewardAmountTl: number | null;
  rewardType: string | null;
  campaignStart: string | null;
  campaignEnd: string | null;
  targetSegments: string[];
  participationMethod: string | null;
  conditions: string[];
  exclusions: string[];
  campaignStatus: CampaignStatus;
  /** Eğitim / kart / konut vb. — finansman türünden bağımsız */
  campaignTheme?:
    | "education"
    | "card"
    | "housing"
    | "vehicle"
    | "new_customer"
    | "general";
  evidence: Array<{ field: string; text: string; confidence: number }>;
  manualReviewRequired: boolean;
};

export interface BankScraperAdapter {
  bankId: string;
  discoverDetailUrls(page: ScrapedPage): Promise<string[]>;
  extractMainContent(page: ScrapedPage): Promise<CleanDocument>;
  detectCampaignStatus(document: CleanDocument): CampaignStatus;
  extractVisibleMetadata(document: CleanDocument): SourceMetadata;
  supportsUrl(url: string): boolean;
  classifyContent?(document: CleanDocument, url: string): ContentCategory;
}
