export type FinancingType =
  | "consumer"
  | "vehicle"
  | "housing"
  | "shopping"
  | "education"
  | "commercial"
  | "other";

export type FinancingConversationState = {
  conversationId: string;
  intent:
    | "finance_search"
    | "campaign_search"
    | "comparison"
    | "follow_up"
    | "general_question"
    | "unsupported";
  financingType: FinancingType | null;
  requestedAmountTl: number | null;
  preferredTermMonths: number | null;
  amountFlexibilityPercent: number;
  termFlexibilityMonths: number;
  amountCapStrict: boolean;
  customerStatus: "new" | "existing" | "unknown";
  selectedBankIds: string[];
  excludedBankIds: string[];
  hideUnknownFees: boolean;
  sortPreference:
    | "lowest_profit_rate"
    | "lowest_total_payment"
    | "longest_term"
    | "lowest_fee"
    | "highest_reward"
    | null;
  /** Kullanıcının belirlediği aylık kâr oranı (yüzde, 3.99 = %3,99) */
  customProfitRatePercent: number | null;
  askedFields: string[];
  lastResultIds: string[];
  /**
   * Asistanın önerdiği kısa takip (ör. “listele yazın”).
   * Sonraki kısa mesaj bu niyetle yorumlanır.
   */
  pendingFollowUp: "banka_listesi" | "banka_kampanyalari" | "capabilities" | null;
  /** Son birkaç kullanıcı mesajı — kısa takip için bağlam */
  recentUserMessages: string[];
  /** Findeks raporundan çıkarılan değerler; finansman tutarı gibi yorumlanmaz. */
  findeksProfile: FindeksProfile | null;
};

export type FindeksProfile = {
  score: number | null;
  riskGroup: string | null;
  monthlyIncomeTl: number | null;
  totalDebtTl: number | null;
  totalLimitTl: number | null;
  availableLimitTl: number | null;
  delayCount: number | null;
  followupCount: number | null;
  debtLimitRatioPercent: number | null;
  reportDate: string | null;
  approvalChancePercent: number | null;
};

export type FinancingMatch = {
  bankId: string;
  bankName: string;
  productId: string;
  productName: string;
  financingType: string;
  requestedAmountTl: number;
  termMonths: number;
  profitRate: number | null;
  ratePeriod: "monthly" | "annual" | "unknown" | null;
  estimatedMonthlyPaymentTl: number | null;
  estimatedTotalPaymentTl: number | null;
  allocationFeeTl: number | null;
  customerCondition: string | null;
  campaignEnd: string | null;
  freshnessStatus: string;
  sourceCheckedAt: string;
  sourceUrl: string;
  evidence: string[];
  calculationAvailable: boolean;
  calculationWarning: string | null;
};

export type FlexMatchScore = {
  totalScore: number;
  amountDifferenceScore: number;
  termDifferenceScore: number;
  customerEligibilityScore: number;
  freshnessScore: number;
  evidenceScore: number;
};

export type FlexibleCampaignMatch = {
  bankId: string;
  bankName: string;
  campaignId: string;
  campaignName: string;
  flexibilityType:
    | "amount"
    | "term"
    | "new_customer"
    | "application_channel"
    | "nearby_product";
  currentRequestDescription: string;
  requiredChangeDescription: string;
  offeredAmountTl: number | null;
  termMonths: number | null;
  profitRate: number | null;
  opportunityDescription: string;
  customerCondition: string | null;
  campaignEnd: string | null;
  matchScore: number;
  freshnessStatus: string;
  sourceCheckedAt: string;
  sourceUrl: string;
  evidence: string[];
};

export type FinancingAssistantResponse = {
  conversationId: string;
  assistantMessage: string;
  status:
    | "needs_information"
    | "results_ready"
    | "no_exact_match"
    | "no_verified_data"
    // Finansman motoru kapsamadığı sorular RAG katmanına devredilir.
    | "general_answer"
    | "error";
  missingFields: string[];
  quickReplies: Array<{ id: string; label: string; value: string }>;
  query: FinancingConversationState;
  exactMatches: FinancingMatch[];
  flexibleMatches: FlexibleCampaignMatch[];
  summary: {
    totalParticipationBanks: number;
    checkedBanks: number;
    exactMatchBankCount: number;
    flexibleMatchCount: number;
    dataAsOf: string | null;
    freshnessLabel: string;
  };
  warnings: string[];
  citations: Array<{
    id: number;
    bankName: string;
    sourceUrl: string;
    sourceCheckedAt: string;
    evidenceText: string;
  }>;
  /** İstemci yönlendirmesi (ör. ödeme planı → Hesaplama) */
  actions?: Array<{
    type: "navigate";
    href: string;
    label: string;
  }>;
};

export const FINANCING_TYPE_LABEL: Record<FinancingType, string> = {
  consumer: "İhtiyaç finansmanı",
  vehicle: "Taşıt finansmanı",
  housing: "Konut finansmanı",
  shopping: "Alışveriş finansmanı",
  education: "Eğitim finansmanı",
  commercial: "Ticari/KOBİ finansmanı",
  other: "Diğer",
};

export const PRODUCT_TYPE_MAP: Record<FinancingType, string[]> = {
  consumer: ["ihtiyac_finansmani"],
  vehicle: ["tasit_finansmani"],
  housing: ["konut_finansmani"],
  shopping: ["alisveris_puani", "ihtiyac_finansmani"],
  education: ["ihtiyac_finansmani"],
  commercial: ["diger", "ihtiyac_finansmani"],
  other: ["diger", "ihtiyac_finansmani", "konut_finansmani", "tasit_finansmani"],
};
