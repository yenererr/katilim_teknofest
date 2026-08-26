import { asciiKatla } from "../../../nlp/normalize";
import { getEvidenceChunks } from "../tools/getEvidenceTool";
import { BANK_SOURCE_CONFIGS } from "../scraper/bankSourceConfig";
import { isAllowedParticipationBank } from "./finansmanMatcher";
import {
  FINANCING_TYPE_LABEL,
  type FinancingConversationState,
  type FinancingMatch,
  type FlexibleCampaignMatch,
} from "./finansmanTypes";

const TYPE_KEYWORDS: Record<string, RegExp> = {
  consumer: /ihtiyac|tuketici|bireysel finansman/,
  vehicle: /tasit|arac finansman|otomobil|araba/,
  housing: /konut|ev finansman|gayrimenkul/,
  shopping: /alisveris finansman/,
  education: /egitim finansman/,
  commercial: /ticari|kobi|isletme finansman/,
  other: /finansman/,
};

/** Katılma hesabı oranını finansman sanma */
function looksLikeParticipationAccountOnly(text: string): boolean {
  const t = asciiKatla(text);
  const account = /kat[iı]lma hesab|kar paylas|brut oran|net oran|yat[iı]r[iı]lan tutar/;
  const finance = /finansman|taksit|tahsis|konut finans|tasit finans|ihtiyac finans/;
  return account.test(t) && !finance.test(t);
}

function snippet(text: string, max = 280): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Yapılandırılmış ürün yokken Qdrant kanıtlarından kaynaklı satırlar üretir.
 * Oran/tutar uydurmaz; hesaplama yapılmaz.
 */
export async function buildMatchesFromQdrantEvidence(
  state: FinancingConversationState,
): Promise<{
  exactMatches: FinancingMatch[];
  flexibleMatches: FlexibleCampaignMatch[];
  warnings: string[];
}> {
  const type = state.financingType;
  if (!type || state.requestedAmountTl == null || state.preferredTermMonths == null) {
    return { exactMatches: [], flexibleMatches: [], warnings: [] };
  }

  const typeLabel = FINANCING_TYPE_LABEL[type];
  const query = `${typeLabel} ${state.requestedAmountTl} TL ${state.preferredTermMonths} ay vade kâr payı`;

  let chunks;
  try {
    chunks = await getEvidenceChunks(
      query,
      {
        intent: "product_search",
        // productTypes Qdrant filtresi boş sonuç doğurabiliyor; metin anahtar kelimesiyle süzüyoruz
        activeOnly: false,
        requiresFreshData: false,
        requiresVectorSearch: true,
        requiresStructuredSearch: false,
        requiresCalculation: false,
      },
      12,
    );
  } catch {
    return {
      exactMatches: [],
      flexibleMatches: [],
      warnings: [
        "Kanıt araması geçici olarak yanıt vermedi; yalnızca yapılandırılmış kayıtlar kullanıldı.",
      ],
    };
  }

  const typeRe = TYPE_KEYWORDS[type] || TYPE_KEYWORDS.other;
  const byBank = new Map<string, FinancingMatch>();
  const flexible: FlexibleCampaignMatch[] = [];

  for (const chunk of chunks) {
    if (chunk.score < 0.42) continue;
    if (!isAllowedParticipationBank(chunk.sourceId, chunk.bankName)) continue;
    if (
      state.selectedBankIds.length &&
      !state.selectedBankIds.includes(chunk.sourceId)
    ) {
      continue;
    }
    if (state.excludedBankIds.includes(chunk.sourceId)) continue;
    if (looksLikeParticipationAccountOnly(chunk.chunkText)) continue;
    const ascii = asciiKatla(chunk.chunkText);
    if (!typeRe.test(ascii)) continue;
    // Çapraz ürün karışmasını azalt
    if (
      type === "consumer" &&
      /konut finansman|tasit finansman/.test(ascii) &&
      !/ihtiyac/.test(ascii)
    ) {
      continue;
    }
    if (
      type === "housing" &&
      /ihtiyac finansman|tasit finansman/.test(ascii) &&
      !/konut/.test(ascii)
    ) {
      continue;
    }
    if (
      type === "vehicle" &&
      /konut finansman|ihtiyac finansman/.test(ascii) &&
      !/tasit|arac/.test(ascii)
    ) {
      continue;
    }

    const bankCfg = BANK_SOURCE_CONFIGS.find((b) => b.bankId === chunk.sourceId);
    const bankName = chunk.bankName || bankCfg?.bankName || chunk.sourceId;
    const evidenceText = snippet(chunk.chunkText);

    // Vade üst sınırı metinde açıkça varsa esnek not; oran asla uydurulmaz
    const termCap = asciiKatla(chunk.chunkText).match(/(\d+)\s*aya kadar/);
    const maxTerm = termCap ? Number(termCap[1]) : null;
    const termOk =
      maxTerm == null || state.preferredTermMonths <= maxTerm;

    if (!byBank.has(chunk.sourceId) && termOk) {
      byBank.set(chunk.sourceId, {
        bankId: chunk.sourceId,
        bankName,
        productId: `qdrant:${chunk.sourceId}:${chunk.chunkIndex}`,
        productName: chunk.productName || typeLabel,
        financingType: typeLabel,
        requestedAmountTl: state.requestedAmountTl,
        termMonths: state.preferredTermMonths,
        profitRate: null,
        ratePeriod: null,
        estimatedMonthlyPaymentTl: null,
        estimatedTotalPaymentTl: null,
        allocationFeeTl: null,
        customerCondition: null,
        campaignEnd: null,
        freshnessStatus:
          chunk.freshness === "FRESH"
            ? "Güncel"
            : chunk.freshness === "STALE"
              ? "Kısmen güncel"
              : "Doğrulanamadı",
        sourceCheckedAt:
          chunk.sourceCheckedAt || new Date().toISOString(),
        sourceUrl: chunk.sourceUrl,
        evidence: [evidenceText],
        calculationAvailable: false,
        calculationWarning:
          "Bankanın resmî kaynağında hesaplama için yeterli bilgi bulunmuyor.",
      });
    } else if (!termOk && maxTerm != null) {
      flexible.push({
        bankId: chunk.sourceId,
        bankName,
        campaignId: `qdrant-flex:${chunk.sourceId}:${chunk.chunkIndex}`,
        campaignName: chunk.productName || typeLabel,
        flexibilityType: "term",
        currentRequestDescription: `${state.requestedAmountTl.toLocaleString("tr-TR")} TL, ${state.preferredTermMonths} ay`,
        requiredChangeDescription: `Vadeyi ${state.preferredTermMonths} aydan en fazla ${maxTerm} aya indirirseniz`,
        offeredAmountTl: state.requestedAmountTl,
        termMonths: maxTerm,
        profitRate: null,
        opportunityDescription: "Vadede küçük değişiklik",
        customerCondition: null,
        campaignEnd: null,
        matchScore: Math.round(chunk.score * 100),
        freshnessStatus: "Kısmen güncel",
        sourceCheckedAt: chunk.sourceCheckedAt || new Date().toISOString(),
        sourceUrl: chunk.sourceUrl,
        evidence: [evidenceText],
      });
    }
  }

  const exactMatches = [...byBank.values()];
  const warnings: string[] = [];
  if (exactMatches.length) {
    warnings.push(
      "İlan edilen kâr payı oranı yapılandırılmış kayıtlarda doğrulanamadığı için tabloda “Resmî kaynakta belirtilmemiş” / “Bankadan teklif alınmalı” gösterilir. Satırlar resmî kaynak kanıtına dayanır.",
    );
  }

  return {
    exactMatches,
    flexibleMatches: flexible.slice(0, 8),
    warnings,
  };
}
