import { asciiKatla } from "../../../nlp/normalize";
import { classifyQuery } from "./queryClassifier";
import {
  BANK_NAME_TO_ID,
  type RagIntent,
  type RagQueryPlan,
} from "./ragTypes";

function extractAmount(text: string): number | undefined {
  const m =
    text.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(?:tl|₺|try)?/i) ||
    text.match(/(?:tutar|finansman)\s*[:=]?\s*(\d[\d.\s]*)/i);
  if (!m) return undefined;
  const n = Number(String(m[1]).replace(/[.\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractTermMonths(text: string): number | undefined {
  const ay = text.match(/(\d+)\s*ay/i);
  if (ay) return Number(ay[1]);
  const yil = text.match(/(\d+)\s*yıl/i) || text.match(/(\d+)\s*yil/i);
  if (yil) return Number(yil[1]) * 12;
  return undefined;
}

function extractBankIds(text: string): string[] | undefined {
  const lower = asciiKatla(text);
  const ids = new Set<string>();
  for (const [name, id] of Object.entries(BANK_NAME_TO_ID)) {
    if (lower.includes(asciiKatla(name))) ids.add(id);
  }
  return ids.size ? [...ids] : undefined;
}

function extractProductTypes(text: string): string[] | undefined {
  const lower = asciiKatla(text);
  const types: string[] = [];
  if (/konut/.test(lower)) types.push("konut_finansmani");
  if (/tasit|arac|otomobil/.test(lower)) types.push("tasit_finansmani");
  if (/ihtiyac|tuketici|bireysel/.test(lower)) types.push("ihtiyac_finansmani");
  if (/kart/.test(lower)) types.push("kart");
  if (/katilma|katilim fonu|mevduat/.test(lower)) types.push("katilim_fonu");
  return types.length ? types : undefined;
}

function extractSegments(text: string): string[] | undefined {
  const lower = asciiKatla(text);
  const segs: string[] = [];
  if (/yeni musteri/.test(lower)) segs.push("yeni_musteri");
  if (/emekli/.test(lower)) segs.push("emekli");
  if (/genc/.test(lower)) segs.push("genc");
  if (/kobi/.test(lower)) segs.push("kobi");
  if (/kurumsal/.test(lower)) segs.push("kurumsal");
  return segs.length ? segs : undefined;
}

/**
 * Sorudan sorgu planı üretir. Eksik zorunlu bilgiyi tahmin etmez.
 */
export function planQuery(message: string): RagQueryPlan {
  const intent = classifyQuery(message);
  const bankIds = extractBankIds(message);
  const productTypes = extractProductTypes(message);
  const financingAmount = extractAmount(message);
  const termMonths = extractTermMonths(message);
  const targetSegment = extractSegments(message);
  const activeOnly = /aktif kampanya|güncel kampanya|guncel kampanya/i.test(
    message,
  );

  const requiresVectorSearch = ![
    "unsupported",
  ].includes(intent);
  const requiresStructuredSearch = [
    "product_search",
    "campaign_search",
    "fee_search",
    "comparison",
    "calculation",
    "condition_question",
    "general_information",
  ].includes(intent);
  const requiresCalculation =
    intent === "comparison" || intent === "calculation";
  const requiresFreshData =
    intent !== "unsupported" && intent !== "source_request";

  let clarificationQuestion: string | undefined;
  if (intent === "comparison" && !productTypes?.length) {
    clarificationQuestion =
      "Karşılaştırma için ürün türünü belirtir misiniz? (ör. taşıt, konut veya ihtiyaç finansmanı)";
  }
  if (intent === "calculation" && (!financingAmount || !termMonths)) {
    clarificationQuestion =
      "Hesaplama için finansman tutarı ve vade (ay) bilgisini paylaşır mısınız?";
  }

  return {
    intent,
    bankIds,
    productTypes,
    financingAmount,
    termMonths,
    targetSegment,
    activeOnly,
    requiresFreshData,
    requiresVectorSearch,
    requiresStructuredSearch,
    requiresCalculation,
    clarificationQuestion,
  };
}

export type { RagIntent };
