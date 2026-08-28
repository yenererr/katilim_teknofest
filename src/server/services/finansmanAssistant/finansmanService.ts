import { randomUUID } from "crypto";
import {
  createEmptyState,
  mergeMessageIntoState,
  missingRequiredFields,
  classifyTurn,
  buildHesaplamaHref,
  isCapabilitiesRequest,
  isSmallTalkRequest,
  isThanksRequest,
  isFarewellRequest,
  isWellbeingReply,
  isBankInfoQuestion,
  parseLimitInquiry,
  isPilgrimagePurpose,
  parseBanks,
  parseSorulanAlanlar,
  type LimitInquiryKind,
} from "./finansmanNlu";
import {
  cokBoyutluKarsilastir,
  cokBoyutluMesaj,
} from "../tools/cokBoyutluKarsilastirma";
import { bankaAdaylariniTopla } from "./bankaAdaylari";
import { bankaAlanMesaji } from "./bankaAlanYaniti";
import { runFinancingMatchEngine } from "./finansmanMatcher";
import { buildMatchesFromQdrantEvidence } from "./finansmanEvidence";
import {
  FINANCING_TYPE_LABEL,
  PRODUCT_TYPE_MAP,
  type FinancingAssistantResponse,
  type FinancingConversationState,
  type FinancingMatch,
  type FinancingType,
} from "./finansmanTypes";
import { asciiKatla } from "../../../nlp/normalize";
import { runRagChat } from "../rag/ragService";
import { rehberNiyetiTespit, rehberYaniti, bekleyenTakibiCoz, kampanyaSinyaliVar, bankaBul } from "./bankDirectory";
import { parseCampaignThemeFromMessage } from "../scraper/campaignNormalize";
import { sozluktenYanitla } from "./terimSozlugu";
import { dovizAsistanYaniti, isDovizMesaji } from "./dovizAsistan";
import { hesaplaOdemePlani } from "../../../lib/odemePlani";
import { enrichWithLiveCalculators } from "./liveCalculatorEnrichment";
import { BANKA_INDEKS } from "../../../data/piyasa";
import { listMemoryProducts } from "../postgres/store";
import {
  CAPABILITIES_MESSAGE,
  FAREWELL_MESSAGE,
  OUT_OF_SCOPE_MESSAGE,
  SMALLTALK_MESSAGE,
  THANKS_MESSAGE,
  WELCOME_MESSAGE,
  WELLBEING_REPLY_MESSAGE,
} from "../../../lib/assistantPersona";

const conversations = new Map<string, FinancingConversationState>();

export function getConversation(
  id: string,
): FinancingConversationState | undefined {
  return conversations.get(id);
}

export function resetConversationsForTests(): void {
  conversations.clear();
}

function purposeQuickReplies() {
  return [
    { id: "p-ihtiyac", label: "İhtiyaç", value: "İhtiyaç" },
    { id: "p-tasit", label: "Taşıt", value: "Taşıt" },
    { id: "p-konut", label: "Konut", value: "Konut" },
    { id: "p-alisveris", label: "Alışveriş", value: "Alışveriş" },
    { id: "p-egitim", label: "Eğitim", value: "Eğitim" },
    { id: "p-ticari", label: "Ticari", value: "Ticari" },
  ];
}

function termQuickReplies() {
  return [
    { id: "t-12", label: "12 ay", value: "12 ay" },
    { id: "t-24", label: "24 ay", value: "24 ay" },
    { id: "t-36", label: "36 ay", value: "36 ay" },
    { id: "t-48", label: "48 ay", value: "48 ay" },
    { id: "t-custom", label: "Kendim yazacağım", value: "Kendim yazacağım" },
  ];
}

function customerQuickReplies() {
  return [
    { id: "c-new", label: "Yeni müşteri", value: "Yeni müşteri" },
    { id: "c-exist", label: "Mevcut müşteri", value: "Mevcut müşteri" },
    {
      id: "c-unk",
      label: "Henüz karar vermedim",
      value: "Henüz karar vermedim",
    },
  ];
}

function sortFollowUpReplies() {
  return [
    {
      id: "s-rate",
      label: "Kâr payına göre",
      value: "En düşük kâr payına göre sırala",
    },
    {
      id: "s-total",
      label: "Toplam ödemeye göre",
      value: "En düşük toplam ödemeye göre sırala",
    },
    {
      id: "s-term",
      label: "Vadeye göre",
      value: "En uzun vadeye göre sırala",
    },
  ];
}

function formatAmount(n: number): string {
  return n.toLocaleString("tr-TR");
}

function joinTrList(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} ve ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

/** Doğrulanmış ürün kayıtlarından tür bazlı azami vade / tutar özeti. */
function collectPublishedLimits(financingType: FinancingType | null): {
  maxTerm: number | null;
  maxAmount: number | null;
  bankTerms: Array<{ bankId: string; maxTerm: number }>;
  bankAmounts: Array<{ bankId: string; maxAmount: number }>;
} {
  const productTypes = financingType
    ? PRODUCT_TYPE_MAP[financingType] || []
    : [];
  const products = listMemoryProducts({ primaryOnly: true }).filter((p) => {
    const pt = String(p.productType || "");
    if (!financingType) return false;
    return productTypes.includes(pt);
  });

  let maxTerm: number | null = null;
  let maxAmount: number | null = null;
  const byBankTerm = new Map<string, number>();
  const byBankAmount = new Map<string, number>();

  for (const p of products) {
    const term =
      p.maxTermMonths != null
        ? Number(p.maxTermMonths)
        : p.minTermMonths != null
          ? Number(p.minTermMonths)
          : null;
    const amount = p.maxAmountTl != null ? Number(p.maxAmountTl) : null;
    if (term != null && Number.isFinite(term)) {
      maxTerm = maxTerm == null ? term : Math.max(maxTerm, term);
      const prev = byBankTerm.get(p.bankId) ?? 0;
      if (term > prev) byBankTerm.set(p.bankId, term);
    }
    if (amount != null && Number.isFinite(amount)) {
      maxAmount = maxAmount == null ? amount : Math.max(maxAmount, amount);
      const prev = byBankAmount.get(p.bankId) ?? 0;
      if (amount > prev) byBankAmount.set(p.bankId, amount);
    }
  }

  return {
    maxTerm,
    maxAmount,
    bankTerms: [...byBankTerm.entries()]
      .map(([bankId, t]) => ({ bankId, maxTerm: t }))
      .sort((a, b) => b.maxTerm - a.maxTerm),
    bankAmounts: [...byBankAmount.entries()]
      .map(([bankId, a]) => ({ bankId, maxAmount: a }))
      .sort((a, b) => b.maxAmount - a.maxAmount),
  };
}

/** Tür bilinmiyorsa önerilen örnek tutar/vadeler (karşılaştırma başlatmak için). */
const LIMIT_HINTS: Record<
  FinancingType,
  { exampleAmount: number; exampleTerm: number; note: string }
> = {
  housing: {
    exampleAmount: 2_000_000,
    exampleTerm: 120,
    note: "Konut finansmanında vade ve tutar bankaya göre değişir; canlı hesaplamada sıkça 120 aya kadar seçenek görülür.",
  },
  vehicle: {
    exampleAmount: 500_000,
    exampleTerm: 48,
    note: "Taşıt finansmanında kayıtlı ürünlerde vade genelde 36–48 ay bandında ilan edilir.",
  },
  consumer: {
    exampleAmount: 200_000,
    exampleTerm: 36,
    note: "İhtiyaç finansmanında vade ve üst tutar banka/kampanyaya göre değişir.",
  },
  shopping: {
    exampleAmount: 50_000,
    exampleTerm: 12,
    note: "Alışveriş finansmanı / taksit kampanyalarında vade ürüne göre değişir.",
  },
  education: {
    exampleAmount: 100_000,
    exampleTerm: 12,
    note: "Eğitim finansmanı veya kart taksit kampanyalarında koşullar ürüne göre değişir.",
  },
  commercial: {
    exampleAmount: 500_000,
    exampleTerm: 36,
    note: "Ticari finansmanda limitler müşteri ve teminata göre belirlenir.",
  },
  other: {
    exampleAmount: 200_000,
    exampleTerm: 24,
    note: "Ürün türüne göre azami vade ve tutar değişir.",
  },
};

function buildLimitInquiryMessage(
  state: FinancingConversationState,
  kind: LimitInquiryKind,
): { message: string; quickReplies: FinancingAssistantResponse["quickReplies"] } {
  const type = state.financingType;
  const typeLabel = type ? FINANCING_TYPE_LABEL[type] : null;
  const limits = collectPublishedLimits(type);
  const hint = type ? LIMIT_HINTS[type] : null;
  const parts: string[] = [];
  const quick: FinancingAssistantResponse["quickReplies"] = [];

  if (!type) {
    parts.push(
      "Azami vade veya tutar ürün türüne göre değişiyor. Önce amacı seçin; ardından kayıtlı tarifelerden üst sınırları özetleyeyim.",
    );
    return { message: parts.join("\n\n"), quickReplies: purposeQuickReplies() };
  }

  if (kind === "term" || kind === "both") {
    if (limits.maxTerm != null) {
      const bankLines = limits.bankTerms.slice(0, 5).map((b) => {
        const ad = BANKA_INDEKS[b.bankId]?.ad || b.bankId;
        return `• ${ad}: en fazla ${b.maxTerm} ay (kayıtlı ürün)`;
      });
      parts.push(
        `**Azami vade** — doğrulanmış ${typeLabel} kayıtlarında gördüğüm üst sınır **${limits.maxTerm} ay**.` +
          (bankLines.length ? `\n\n${bankLines.join("\n")}` : ""),
      );
    } else if (hint) {
      parts.push(
        `**Azami vade** — ${hint.note}\n\n` +
          `Karşılaştırmayı başlatmak için örnek: **${formatAmount(hint.exampleAmount)} TL, ${hint.exampleTerm} ay**.`,
      );
    }
    if (hint) {
      quick.push({
        id: "lim-term-ex",
        label: `${hint.exampleTerm} ay dene`,
        value: `${formatAmount(hint.exampleAmount)} TL ${typeLabel}, ${hint.exampleTerm} ay`,
      });
    }
    quick.push(...termQuickReplies().filter((t) => ["t-36", "t-48", "t-custom"].includes(t.id) || (type === "housing" && t.id === "t-custom")));
    if (type === "housing") {
      quick.unshift({
        id: "lim-120",
        label: "120 ay",
        value: "120 ay",
      });
    }
  }

  if (kind === "amount" || kind === "both") {
    if (limits.maxAmount != null) {
      const bankLines = limits.bankAmounts.slice(0, 5).map((b) => {
        const ad = BANKA_INDEKS[b.bankId]?.ad || b.bankId;
        return `• ${ad}: en fazla ${formatAmount(b.maxAmount)} TL (kayıtlı ürün)`;
      });
      parts.push(
        `**Azami tutar** — doğrulanmış ${typeLabel} kayıtlarında gördüğüm üst sınır **${formatAmount(limits.maxAmount)} TL**.` +
          (bankLines.length ? `\n\n${bankLines.join("\n")}` : ""),
      );
    } else if (hint) {
      parts.push(
        `**Azami tutar** — bankalar tutarı gelir/teminata göre belirler; sabit tek bir tavan ilan etmeyebilir.\n\n` +
          `${hint.note} Örnek tutarla bakmak için **${formatAmount(hint.exampleAmount)} TL** yazabilirsiniz.`,
      );
    }
    if (hint) {
      quick.push({
        id: "lim-amt-ex",
        label: `${formatAmount(hint.exampleAmount)} TL`,
        value: `${formatAmount(hint.exampleAmount)} TL`,
      });
    }
  }

  parts.push(
    "Net teklif için tutar + vade yazmanız yeterli — örneğin “2 milyon TL, 120 ay”.",
  );

  return {
    message: parts.filter(Boolean).join("\n\n"),
    quickReplies: quick.slice(0, 10),
  };
}

/** Banka / amaç bilgisini samimi bir onay cümlesine çevirir */
function buildContextAck(state: FinancingConversationState): string {
  const bankNames = state.selectedBankIds
    .map((id) => BANKA_INDEKS[id]?.ad)
    .filter((n): n is string => Boolean(n));
  const typeLabel = state.financingType
    ? FINANCING_TYPE_LABEL[state.financingType]
    : null;

  if (bankNames.length === 1 && typeLabel) {
    return `Anladım, ${bankNames[0]} özelinde ${typeLabel.toLocaleLowerCase("tr-TR")} için ilerleyeceğiz.`;
  }
  if (bankNames.length === 1) {
    return `Anladım, ${bankNames[0]} özelinde ilerleyeceğiz.`;
  }
  if (bankNames.length > 1 && typeLabel) {
    return `Anladım, ${bankNames.join(" ve ")} için ${typeLabel.toLocaleLowerCase("tr-TR")} bakacağız.`;
  }
  if (bankNames.length > 1) {
    return `Anladım, ${bankNames.join(" ve ")} özelinde bakacağız.`;
  }
  if (typeLabel) {
    return `Anladım, ${typeLabel.toLocaleLowerCase("tr-TR")} için bakacağız.`;
  }
  return "";
}

function buildNeedsInfoMessage(
  state: FinancingConversationState,
  missing: string[],
): { message: string; quickReplies: FinancingAssistantResponse["quickReplies"] } {
  const parts: string[] = [];
  const quick: FinancingAssistantResponse["quickReplies"] = [];

  const bankNames = state.selectedBankIds
    .map((id) => BANKA_INDEKS[id]?.ad)
    .filter((n): n is string => Boolean(n));
  const askType = missing.includes("financingType");
  const askTerm = missing.includes("preferredTermMonths");
  const askAmount = missing.includes("requestedAmountTl");

  // Tek banka seçili, amaç henüz yok → oran döngüsüne sokma; örnek iste
  if (bankNames.length === 1 && askType) {
    const bank = bankNames[0];
    parts.push(
      `**${bank}** finansman kâr payı kişiden kişiye ve ürüne göre değişir; sabit tek bir “oran” ilan edilmeyebilir.\n\n` +
        `Canlı karşılaştırmak için tutar + amaç + vade yazın — örneğin:\n` +
        `• “${bank} 100.000 TL ihtiyaç, 24 ay”\n` +
        `• “${bank} 500.000 TL taşıt, 36 ay”\n\n` +
        `Kampanyalarını da sorabilirsiniz: “${bank} kampanyaları”.`,
    );
    quick.push(
      {
        id: "bf-100-24",
        label: "100 bin ihtiyaç, 24 ay",
        value: `${bank} 100.000 TL ihtiyaç finansmanı, 24 ay`,
      },
      {
        id: "bf-camp",
        label: `${bank} kampanyaları`,
        value: `${bank} kampanyaları`,
      },
      ...purposeQuickReplies().slice(0, 3),
    );
    return { message: parts.join("\n\n"), quickReplies: quick.slice(0, 12) };
  }

  const ack = buildContextAck(state);
  if (ack) {
    parts.push(ack);
  } else if (state.requestedAmountTl != null) {
    parts.push(
      `${formatAmount(state.requestedAmountTl)} TL için seçeneklere bakabilirim.`,
    );
  }

  if (askType && askTerm) {
    parts.push("Ne için kullanacaksınız ve kaç ay vade düşünüyorsunuz?");
    quick.push(...purposeQuickReplies(), ...termQuickReplies());
  } else if (askType && askAmount) {
    parts.push("Ne için kullanacaksınız ve ne kadar tutar lazım?");
    quick.push(...purposeQuickReplies());
  } else if (askTerm && askAmount) {
    parts.push("Ne kadar tutar ve kaç ay vade düşünüyorsunuz?");
    quick.push(...termQuickReplies());
  } else if (askType) {
    parts.push("Ne için kullanacaksınız?");
    quick.push(...purposeQuickReplies());
  } else if (askTerm) {
    parts.push("Kaç ay vade düşünüyorsunuz?");
    quick.push(...termQuickReplies());
  } else if (askAmount) {
    parts.push("Ne kadar tutar düşünüyorsunuz?");
  }

  if (
    !askType &&
    !askTerm &&
    !askAmount &&
    state.customerStatus === "unknown" &&
    !state.askedFields.includes("customerStatus")
  ) {
    parts.push("İsterseniz müşteri durumunuzu da seçebilirsiniz.");
    quick.push(...customerQuickReplies());
  }

  return {
    message:
      parts.join("\n\n") ||
      "Karşılaştırma yapabilmem için birkaç bilgi lazım.",
    quickReplies: quick.slice(0, 12),
  };
}

function buildCampaignMessage(
  state: FinancingConversationState,
  flexCount: number,
  exactCount: number,
): string {
  const typeLabel = state.financingType
    ? FINANCING_TYPE_LABEL[state.financingType]
    : "finansman";
  const amount = formatAmount(state.requestedAmountTl!);
  if (flexCount === 0 && exactCount === 0) {
    return (
      `${amount} TL ${typeLabel.toLowerCase()} için kampanyalara baktım.\n\n` +
      `Koşullarınıza uyan bir kampanya çıkmadı. ` +
      `Tutarı ya da vadeyi değiştirirsek yeniden bakabilirim.`
    );
  }
  return (
    `${amount} TL ${typeLabel.toLowerCase()} ve ${state.preferredTermMonths} ay için ` +
    `kampanya ve esnek alternatiflere baktım.\n\n` +
    (flexCount > 0
      ? `${flexCount} esnek alternatif / kampanya satırını aşağıda gösterdim.`
      : `${exactCount} seçenek buldum; ayrı kampanya satırı yok.`) +
    `\n\nYeni müşteri kampanyalarını veya farklı vadeyi denemek ister misiniz?`
  );
}

function buildBankFocusMessage(
  state: FinancingConversationState,
  matches: Array<{
    bankName: string;
    profitRate: number | null;
    ratePeriod: string | null;
    calculationWarning: string | null;
    sourceUrl: string;
    evidence: string[];
  }>,
): string {
  const bankLabel =
    (state.selectedBankIds.length === 1
      ? BANKA_INDEKS[state.selectedBankIds[0]]?.ad
      : null) ||
    matches[0]?.bankName ||
    state.selectedBankIds.join(", ") ||
    "Seçilen banka";
  const typeLabel = state.financingType
    ? FINANCING_TYPE_LABEL[state.financingType]
    : "finansman";
  if (!matches.length) {
    return (
      `${bankLabel} için ${formatAmount(state.requestedAmountTl!)} TL ${typeLabel.toLowerCase()} ` +
      `ve ${state.preferredTermMonths} ay koşullarında doğrulanmış ilan edilmiş bir kâr payı kaydı bulamadım.\n\n` +
      `Resmî kaynakta oran kişiye özel / belirtilmemiş olabilir. Tüm bankalara dönmek veya vadeyi değiştirmek ister misiniz?`
    );
  }
  const lines = matches.slice(0, 3).map((m) => {
    const rate =
      m.profitRate == null
        ? "Resmî kaynakta belirtilmemiş (bankadan teklif alınmalı)"
        : `%${(m.profitRate * 100).toLocaleString("tr-TR", {
            maximumFractionDigits: 2,
          })} (${m.ratePeriod === "monthly" ? "aylık" : m.ratePeriod === "annual" ? "yıllık" : "periyot belirsiz"})`;
    return `• ${m.bankName}: ilan edilen kâr payı — ${rate}`;
  });
  return (
    `${bankLabel} için mevcut talebinize göre doğrulanmış kayıtlara baktım.\n\n` +
    lines.join("\n") +
    `\n\nAyrıntı ve kanıt için aşağıdaki tabloyu / resmî kaynak bağlantısını kullanabilirsiniz.`
  );
}

function buildMetaQuestionMessage(
  state: FinancingConversationState,
  lastExactCount: number,
): string {
  const typeLabel = state.financingType
    ? FINANCING_TYPE_LABEL[state.financingType]
    : null;
  const missing = missingRequiredFields(state);
  if (missing.length > 0 || lastExactCount === 0) {
    return (
      `Aynı soruyu tekrarlamamak için netleştireyim: finansman karşılaştırması için **tutar + amaç + vade** lazım.\n\n` +
      `Örnek: “100.000 TL ihtiyaç, 24 ay” veya “Ziraat Katılım 200 bin TL taşıt, 36 ay”.\n\n` +
      `Banka hakkında genel bilgi için “Albaraka nasıl banka?”, kampanyalar için “Ziraat kampanyaları” yazmanız yeterli.`
    );
  }
  return (
    `Parametreler aynı kaldığı için aynı doğrulanmış sonucu gösteriyorum.\n\n` +
    `10 katılım bankası içinde şu an koşullarınıza uyan ${lastExactCount} seçenek var; ` +
    `uygun olmayan bankaları tabloya eklemiyorum.\n\n` +
    `Daha fazla seçenek için tutarı, vadeyi (${state.preferredTermMonths ?? "?"} ay) veya amacı ` +
    `(şu an: ${typeLabel || "finansman"}) değiştirebilir; ya da “Albaraka oranları ne?” gibi tek banka sorabilirsiniz.`
  );
}

function emptySummary(): FinancingAssistantResponse["summary"] {
  return {
    totalParticipationBanks: 10,
    checkedBanks: 0,
    exactMatchBankCount: 0,
    flexibleMatchCount: 0,
    dataAsOf: null,
    freshnessLabel: "Doğrulanamadı",
  };
}

function defaultFindeksRate(financingType: FinancingType): number {
  if (financingType === "housing") return 3.5;
  if (financingType === "vehicle") return 3.8;
  if (financingType === "education") return 3;
  if (financingType === "commercial") return 4.2;
  return 4;
}

function approvalBand(chance: number): string {
  if (chance >= 75) return "Yüksek onay beklentisi";
  if (chance >= 50) return "Orta düzey ön uygunluk";
  return "Düşük / dikkatli değerlendirme";
}

function isFindeksFollowUpQuestion(message: string): boolean {
  const t = asciiKatla(message).trim();
  if (!t) return false;
  return (
    /findeks|rapor|kredi not|notum|skor|risk|onay|uygunluk|durumum|borc gelir|limit/.test(
      t,
    ) ||
    /^(iyi mi|guzel mi|kotu mu|nasıl|nasil|ne durumda|durum nasil|durumum nasil)(\b|[?.!])/.test(
      t,
    ) ||
    /(iyi|guzel|kotu|riskli|uygun).{0,30}(mi|mu|m[iı]|m[uü])/.test(t)
  );
}

function hasFindeksSimulationRequest(state: FinancingConversationState): boolean {
  return Boolean(
    state.findeksProfile &&
      state.financingType &&
      state.requestedAmountTl != null &&
      state.preferredTermMonths != null,
  );
}

function buildFindeksPreApprovalResponse(
  conversationId: string,
  state: FinancingConversationState,
): FinancingAssistantResponse | null {
  const profile = state.findeksProfile;
  if (!profile || state.intent === "campaign_search") return null;

  const missing = missingRequiredFields(state);
  const scoreLine =
    profile.score == null
      ? "Findeks notu raporda net okunamadı."
      : `Findeks notunuz ${profile.score}${profile.riskGroup ? ` (${profile.riskGroup})` : ""}.`;
  const debtLine =
    profile.totalDebtTl == null
      ? "Toplam borç rapordan net çıkarılamadı."
      : `Okunan toplam borç ${formatAmount(profile.totalDebtTl)} TL.`;
  const delayLine =
    (profile.delayCount || 0) > 0 || (profile.followupCount || 0) > 0
      ? `Gecikmeli hesap: ${profile.delayCount ?? 0}, takipteki kredi: ${profile.followupCount ?? 0}.`
      : "Raporda gecikme/takip sinyali görünmüyor.";

  if (missing.length > 0) {
    return {
      conversationId,
      assistantMessage:
        `Genel olarak iyi görünüyor.\n\n${scoreLine} ${debtLine} ${delayLine} ` +
        "Bu tablo ön değerlendirme açısından güçlü; yine de kesin onay değildir, banka gelir belgesi, teminat ve ürün koşullarını ayrıca kontrol eder.\n\n" +
        "Finansman Ön Uygunluk Simülatörü için finansman türü, tutar ve vade yazın. " +
        "Örneğin: “Konut için 1.2 milyon TL istiyorum, 120 ay” veya “200 bin TL taşıt, 24 ay”.",
      status: "needs_information",
      missingFields: missing,
      quickReplies: [
        {
          id: "fx-konut",
          label: "Konut 1.2 milyon, 120 ay",
          value: "Konut için 1.2 milyon TL istiyorum, 120 ay",
        },
        {
          id: "fx-tasit",
          label: "Taşıt 500 bin, 24 ay",
          value: "Taşıt için 500 bin TL istiyorum, 24 ay",
        },
        {
          id: "fx-ihtiyac",
          label: "İhtiyaç 200 bin, 24 ay",
          value: "İhtiyaç için 200 bin TL istiyorum, 24 ay",
        },
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
    };
  }

  if (!state.financingType || !state.requestedAmountTl || !state.preferredTermMonths) {
    return null;
  }

  const financingTypeKey =
    PRODUCT_TYPE_MAP[state.financingType]?.[0] || "ihtiyac_finansmani";
  const rate = state.customProfitRatePercent ?? defaultFindeksRate(state.financingType);
  const plan = hesaplaOdemePlani({
    amountTl: state.requestedAmountTl,
    termMonths: state.preferredTermMonths,
    profitRatePercent: rate,
    financingType: financingTypeKey,
  });
  const income = profile.monthlyIncomeTl || 0;
  const estimatedExistingMonthlyDebt =
    profile.totalDebtTl && profile.totalDebtTl > 0
      ? Math.round(profile.totalDebtTl * 0.05)
      : 0;
  const maxReasonableInstallment =
    income > 0 ? Math.max(0, Math.round(income * 0.5 - estimatedExistingMonthlyDebt)) : null;
  const projectedDti =
    income > 0
      ? Math.round(((estimatedExistingMonthlyDebt + plan.taksitTutari) / income) * 100)
      : null;

  const reasons: string[] = [];
  if (profile.score != null && profile.score >= 1500) {
    reasons.push("Findeks notu iyi bantta.");
  } else if (profile.score != null && profile.score < 1100) {
    reasons.push("Findeks notu zayıf bantta olduğu için risk artıyor.");
  }
  if ((profile.delayCount || 0) > 0) reasons.push("Raporda gecikmeli hesap var.");
  if ((profile.followupCount || 0) > 0) reasons.push("Raporda takip kaydı var.");
  if (projectedDti != null && projectedDti > 50) {
    reasons.push("Tahmini borç/gelir oranı %50 eşiğini aşıyor.");
  } else if (projectedDti != null) {
    reasons.push("Tahmini borç/gelir oranı makul aralıkta.");
  }
  if (maxReasonableInstallment != null && plan.taksitTutari > maxReasonableInstallment) {
    reasons.push("Tahmini taksit rapordaki gelir bilgisine göre makul taksit sınırının üstünde.");
  }
  if (reasons.length === 0) reasons.push("Banka koşulları, gelir belgesi ve teminat ayrıca değerlendirilir.");

  let chance = profile.approvalChancePercent ?? 50;
  if (projectedDti != null) {
    if (projectedDti > 65) chance -= 30;
    else if (projectedDti > 50) chance -= 18;
    else if (projectedDti <= 35) chance += 8;
  }
  if ((profile.delayCount || 0) > 0) chance -= 15;
  if ((profile.followupCount || 0) > 0) chance -= 25;
  chance = Math.max(5, Math.min(95, Math.round(chance)));

  const typeLabel = FINANCING_TYPE_LABEL[state.financingType];
  const href = buildHesaplamaHref({
    ...state,
    customProfitRatePercent: state.customProfitRatePercent ?? rate,
  });

  return {
    conversationId,
    assistantMessage:
      `**Finansman Ön Uygunluk Simülatörü**\n\n` +
      `Talep: ${formatAmount(state.requestedAmountTl)} TL ${typeLabel.toLowerCase()}, ${state.preferredTermMonths} ay.\n\n` +
      `Rapor: ${scoreLine} ${debtLine} ${delayLine}\n\n` +
      `Tahmini aylık taksit: ${formatAmount(Math.round(plan.taksitTutari))} TL. ` +
      `Maksimum makul taksit: ${maxReasonableInstallment == null ? "gelir bilgisi olmadığı için hesaplanamadı" : `${formatAmount(maxReasonableInstallment)} TL`}. ` +
      `Tahmini borç/gelir oranı: ${projectedDti == null ? "hesaplanamadı" : `%${projectedDti}`}.\n\n` +
      `Ön uygunluk: **${approvalBand(chance)}**. Tahmini ihtimal: **%${chance}**.\n\n` +
      `Risk nedeni: ${reasons.join(" ")}`,
    status: "general_answer",
    missingFields: [],
    quickReplies: [
      {
        id: "fx-plan",
        label: "Ödeme Planını Aç",
        value: `__navigate__:${href}`,
      },
      {
        id: "fx-rate-3",
        label: "Oranı %3 yap",
        value: "Oranı %3 yap",
      },
      {
        id: "fx-less",
        label: "Tutarı azalt",
        value: `${Math.round(state.requestedAmountTl * 0.8)} TL ${typeLabel}, ${state.preferredTermMonths} ay`,
      },
      {
        id: "fx-longer",
        label: "Vadeyi uzat",
        value: `${formatAmount(state.requestedAmountTl)} TL ${typeLabel}, ${Math.min(state.preferredTermMonths + 12, 180)} ay`,
      },
    ],
    query: state,
    exactMatches: [],
    flexibleMatches: [],
    summary: emptySummary(),
    warnings: [
      `Simülasyon aylık %${rate.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} kâr oranıyla ön değerlendirme üretir; kesin banka onayı değildir.`,
    ],
    citations: [],
    actions: [{ type: "navigate", href, label: "Ödeme Planını Aç" }],
  };
}

function buildResultMessage(
  state: FinancingConversationState,
  exactCount: number,
  flexCount: number,
  totalBanks: number,
): string {
  const typeLabel = state.financingType
    ? FINANCING_TYPE_LABEL[state.financingType]
    : "finansman";
  const amount = formatAmount(state.requestedAmountTl!);
  const term = state.preferredTermMonths;

  if (exactCount === 0 && flexCount === 0) {
    return (
      `${amount} TL ${typeLabel.toLowerCase()} ve ${term} ay vade için doğrulanmış ` +
      `seçenek aradım.\n\n` +
      `Bu koşullara uygun doğrulanmış güncel bir finansman seçeneği bulunamadı.`
    );
  }

  if (exactCount === 0) {
    return (
      `${amount} TL ${typeLabel.toLowerCase()} ve ${term} ay için tam eşleşen seçenek bulamadım.\n\n` +
      `Ancak tutar veya vadede küçük bir değişiklikle değerlendirebileceğiniz ` +
      `${flexCount} aktif alternatifi ikinci tabloda gösterdim.`
    );
  }

  return (
    `${amount} TL ${typeLabel.toLowerCase()} ve ${term} ay vade için doğrulanmış ` +
    `seçenekleri karşılaştırdım.\n\n` +
    `${totalBanks} katılım bankası içinde koşullarınıza uyan ${exactCount} seçenek buldum. ` +
    (state.customProfitRatePercent != null
      ? `Taksitleri sizin belirlediğiniz aylık %${state.customProfitRatePercent.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} kâr oranına göre hesapladım.`
      : `Mümkün olan bankalarda canlı hesaplama motorundan gelen kâr payı ve taksitleri kullandım.`) +
    (flexCount > 0
      ? `\n\nAyrıca tutar veya vadede küçük bir değişiklik yapmanız hâlinde ` +
        `yararlanabileceğiniz ${flexCount} aktif kampanyayı ikinci tabloda gösterdim.`
      : "") +
    `\n\nKâr oranını değiştirmek için “oranı %3 yap” yazabilirsiniz. ` +
    `Ödeme planı için “ödeme planı” demeniz yeterli.`
  );
}

/** Kullanıcı oranı ile satırları yeniden hesapla (hesaplama motoru ile aynı formül). */
function applyCustomProfitRate(
  matches: FinancingMatch[],
  state: FinancingConversationState,
): FinancingMatch[] {
  const rate = state.customProfitRatePercent;
  const amount = state.requestedAmountTl;
  const term = state.preferredTermMonths;
  if (rate == null || amount == null || term == null || !state.financingType) {
    return matches;
  }
  const financingTypeKey =
    PRODUCT_TYPE_MAP[state.financingType]?.[0] || "ihtiyac_finansmani";
  try {
    const plan = hesaplaOdemePlani({
      amountTl: amount,
      termMonths: term,
      profitRatePercent: rate,
      financingType: financingTypeKey,
    });
    const patch = (m: FinancingMatch): FinancingMatch => ({
      ...m,
      profitRate: rate / 100,
      ratePeriod: "monthly" as const,
      estimatedMonthlyPaymentTl: plan.taksitTutari,
      estimatedTotalPaymentTl: plan.odenecekToplamTutar,
      allocationFeeTl: plan.finansmanTahsisUcreti,
      calculationAvailable: true,
      calculationWarning:
        "Kullanıcının belirlediği kâr oranı ile hesaplandı (KKDF/BSMV dâhil).",
    });

    if (matches.length > 0) {
      return matches.map(patch);
    }

    // Tam eşleşme yoksa bile özel oranla 3 banka için yerel satır üret
    const banks = [
      {
        bankId: "vakif-katilim",
        bankName: "Vakıf Katılım Bankası A.Ş.",
        sourceUrl: "https://www.vakifkatilim.com.tr/tr",
      },
      {
        bankId: "ziraat-katilim",
        bankName: "Ziraat Katılım Bankası A.Ş.",
        sourceUrl:
          "https://www.ziraatkatilim.com.tr/bireysel/finansman-urunleri",
      },
      {
        bankId: "kuveyt-turk",
        bankName: "Kuveyt Türk Katılım Bankası A.Ş.",
        sourceUrl:
          "https://www.kuveytturk.com.tr/hesaplama-araclari/finansman-hesaplama",
      },
    ];
    const now = new Date().toISOString();
    return banks.map((b) =>
      patch({
        bankId: b.bankId,
        bankName: b.bankName,
        productId: `custom-${b.bankId}-${financingTypeKey}`,
        productName: `${b.bankName} — özel oran hesaplama`,
        financingType: financingTypeKey,
        requestedAmountTl: amount,
        termMonths: term,
        profitRate: rate / 100,
        ratePeriod: "monthly",
        estimatedMonthlyPaymentTl: plan.taksitTutari,
        estimatedTotalPaymentTl: plan.odenecekToplamTutar,
        allocationFeeTl: plan.finansmanTahsisUcreti,
        customerCondition: null,
        campaignEnd: null,
        freshnessStatus: "fresh",
        sourceCheckedAt: now,
        sourceUrl: b.sourceUrl,
        evidence: [
          `Kullanıcı oranı %${rate.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} ile Softtech uyumlu motor.`,
        ],
        calculationAvailable: true,
        calculationWarning: null,
      }),
    );
  } catch {
    return matches;
  }
}

function applyFlexibleClick(
  state: FinancingConversationState,
  selectedQuickReply: string | undefined,
): FinancingConversationState {
  if (!selectedQuickReply) return state;
  const t = asciiKatla(selectedQuickReply);
  // "flex:amount:220000" style from UI
  const mAmount = selectedQuickReply.match(/^flex:amount:(\d+)/i);
  if (mAmount) {
    return {
      ...state,
      requestedAmountTl: Number(mAmount[1]),
      intent: "follow_up",
    };
  }
  const mTerm = selectedQuickReply.match(/^flex:term:(\d+)/i);
  if (mTerm) {
    return {
      ...state,
      preferredTermMonths: Number(mTerm[1]),
      intent: "follow_up",
    };
  }
  if (/flex:new_customer/i.test(selectedQuickReply) || t.includes("yeni musteri olarak")) {
    return { ...state, customerStatus: "new", intent: "follow_up" };
  }
  return state;
}

export type FinansmanChatRequest = {
  conversationId?: string;
  message: string;
  selectedQuickReply?: string;
  forceRefresh?: boolean;
};

/**
 * Finansman Asistanı konuşma döngüsü.
 * Hesaplama ve sıralama TypeScript'te; LLM yalnızca açıklama için (isteğe bağlı, burada şablon kullanılır).
 */
export async function runFinansmanAssistantChat(
  req: FinansmanChatRequest,
  opts?: {
    matchOverride?: Parameters<typeof runFinancingMatchEngine>[0];
  },
): Promise<FinancingAssistantResponse> {
  const conversationId = req.conversationId?.trim() || randomUUID();
  let state =
    conversations.get(conversationId) || createEmptyState(conversationId);

  if (req.selectedQuickReply === "Kendim yazacağım") {
    // User will type term — mark asked
    state = {
      ...state,
      askedFields: [...new Set([...state.askedFields, "preferredTermMonths"])],
    };
    conversations.set(conversationId, state);
    return {
      conversationId,
      assistantMessage: "Vade süresini ay olarak yazabilirsiniz (örneğin 30 ay).",
      status: "needs_information",
      missingFields: missingRequiredFields(state),
      quickReplies: [],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: {
        totalParticipationBanks: 10,
        checkedBanks: 0,
        exactMatchBankCount: 0,
        flexibleMatchCount: 0,
        dataAsOf: null,
        freshnessLabel: "Doğrulanamadı",
      },
      warnings: [],
      citations: [],
    };
  }

  state = mergeMessageIntoState(state, req.message, req.selectedQuickReply);
  state = applyFlexibleClick(state, req.selectedQuickReply);
  state.conversationId = conversationId;
  state.recentUserMessages = [
    ...(state.recentUserMessages || []).slice(-4),
    req.message.trim(),
  ];
  // Eski oturumlar / test state'leri için varsayılanlar
  if (state.pendingFollowUp === undefined) state.pendingFollowUp = null;
  if (!Array.isArray(state.recentUserMessages)) state.recentUserMessages = [req.message.trim()];
  if (state.findeksProfile === undefined) state.findeksProfile = null;

  const turn = classifyTurn(req.message, req.selectedQuickReply);

  // Geri ödemeyeceğini söyleyen / kötü niyetli talepler
  if (turn === "policy_refuse") {
    conversations.set(conversationId, {
      ...state,
      financingType: null,
      requestedAmountTl: null,
      preferredTermMonths: null,
      lastResultIds: [],
      pendingFollowUp: null,
    });
    return {
      conversationId,
      assistantMessage:
        "Katılım bankası finansmanı geri ödemeli bir ürün; geri ödemeyeceğinizi söylediğiniz için bu konuda yardımcı olamam.\n\n" +
        "Gerçek bir finansman ihtiyacınız varsa tutar, vade ve amacı yazın — örneğin “80.000 TL ihtiyaç, 12 ay”. Kampanya veya kâr payı karşılaştırması da sorabilirsiniz.",
      status: "needs_information",
      missingFields: [],
      quickReplies: [
        {
          id: "pr-cap",
          label: "Neler yapabilirsin?",
          value: "Neler yapabilirsin?",
        },
        ...purposeQuickReplies().slice(0, 3),
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
    };
  }

  // Selam / nasılsın / neler yapabilirsin — sözlük ve rehberden ÖNCE
  if (turn === "greeting") {
    conversations.set(conversationId, { ...state, pendingFollowUp: null });
    const hasContext =
      state.requestedAmountTl != null ||
      state.financingType != null ||
      state.preferredTermMonths != null;

    let assistantMessage = WELCOME_MESSAGE;
    if (isCapabilitiesRequest(req.message)) {
      assistantMessage = CAPABILITIES_MESSAGE;
      return {
        conversationId,
        assistantMessage,
        status: "needs_information",
        missingFields: missingRequiredFields(state),
        quickReplies: [
          {
            id: "g-ihtiyac",
            label: "200.000 TL ihtiyaç, 24 ay",
            value: "200.000 TL ihtiyaç finansmanı, 24 ay",
          },
          {
            id: "g-konut",
            label: "2 milyon TL konut, 120 ay",
            value: "2.000.000 TL konut finansmanı, 120 ay",
          },
          {
            id: "g-tasit",
            label: "500.000 TL taşıt, 36 ay",
            value: "500.000 TL taşıt finansmanı, 36 ay",
          },
          {
            id: "g-kamp",
            label: "Kırtasiye kampanyaları",
            value: "kırtasiye kampanyaları",
          },
        ],
        query: state,
        exactMatches: [],
        flexibleMatches: [],
        summary: emptySummary(),
        warnings: [],
        citations: [],
      };
    } else if (isWellbeingReply(req.message)) {
      assistantMessage = WELLBEING_REPLY_MESSAGE;
    } else if (isThanksRequest(req.message)) {
      assistantMessage = THANKS_MESSAGE;
    } else if (isFarewellRequest(req.message)) {
      assistantMessage = FAREWELL_MESSAGE;
    } else if (isSmallTalkRequest(req.message)) {
      assistantMessage = SMALLTALK_MESSAGE;
    } else if (hasContext) {
      assistantMessage =
        "Tekrar merhaba! Kaldığımız yerden devam edebiliriz. Tutarı, vadeyi ya da amacı değiştirebilir; kampanya veya ödeme planı da sorabilirsiniz.\n\nİstersen “neler yapabilirsin” diye yaz, kısaca anlatayım.";
    }

    return {
      conversationId,
      assistantMessage,
      status: "needs_information",
      missingFields: missingRequiredFields(state),
      quickReplies: [
        {
          id: "g-cap",
          label: "Neler yapabilirsin?",
          value: "Neler yapabilirsin?",
        },
        {
          id: "g-ihtiyac",
          label: "200.000 TL ihtiyaç, 24 ay",
          value: "200.000 TL ihtiyaç finansmanı, 24 ay",
        },
        ...purposeQuickReplies().slice(0, 3),
        ...termQuickReplies().slice(0, 2),
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
    };
  }

  // Para yatırma / katılma hesabı / kâr payı getirisi — finansman eşleştirmesine düşmesin
  if (turn === "deposit_inquiry") {
    const cleared = {
      ...state,
      financingType: null as FinancingType | null,
      requestedAmountTl: null as number | null,
      preferredTermMonths: null as number | null,
      lastResultIds: [] as string[],
      pendingFollowUp: null,
      intent: "general_question" as const,
    };
    conversations.set(conversationId, cleared);
    return {
      conversationId,
      assistantMessage:
        "Anladım — finansman (borç) değil, **para yatırıp kâr payı / getiri** tarafına bakıyorsunuz.\n\n" +
        "Katılım bankalarında bu genellikle **katılma hesabı** ile olur; faiz değil, dönem sonu kâr payı dağıtılır. Oranlar bankaya ve vadeye göre değişir.\n\n" +
        "Karşılaştırmak için soldaki **Kâr Payı** ekranını açabilir veya “100.000 TL katılma hesabı, 3 ay” gibi tutar + vade yazabilirsiniz. " +
        "Terim için “katılma hesabı nedir” diye de sorabilirsiniz.",
      status: "general_answer",
      missingFields: [],
      quickReplies: [
        {
          id: "dep-kar",
          label: "Kâr Payı hesaplamayı aç",
          value: "__navigate__:#/kar-payi",
        },
        {
          id: "dep-nedir",
          label: "Katılma hesabı nedir?",
          value: "Katılma hesabı nedir?",
        },
        {
          id: "dep-ornek",
          label: "100 bin TL, 3 ay kâr payı",
          value: "100.000 TL katılma hesabı kâr payı 3 ay",
        },
        ...purposeQuickReplies().slice(0, 2),
      ],
      query: cleared,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
      actions: [
        { type: "navigate", href: "#/kar-payi", label: "Kâr Payı hesaplamayı aç" },
      ],
    };
  }

  // Terminoloji soruları doğrulanmış sözlükten anında yanıtlanır.
  const sozluk = sozluktenYanitla(req.message);
  if (sozluk) {
    conversations.set(conversationId, { ...state, pendingFollowUp: null });
    return {
      conversationId,
      assistantMessage:
        sozluk.message +
        "\n\nBelirli bir bankanın koşullarını da sorabilirsiniz.",
      status: "general_answer",
      missingFields: [],
      quickReplies: [
        ...purposeQuickReplies().slice(0, 3),
        ...termQuickReplies().slice(0, 2),
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
    };
  }

  // TCMB döviz kuru / TL↔USD-EUR-GBP çeviri
  if (isDovizMesaji(req.message)) {
    try {
      const doviz = await dovizAsistanYaniti(req.message);
      conversations.set(conversationId, { ...state, pendingFollowUp: null });
      return {
        conversationId,
        assistantMessage: doviz.message,
        status: "general_answer",
        missingFields: [],
        quickReplies: [
          {
            id: "fx-usd",
            label: "100.000 TL kaç dolar?",
            value: "100.000 TL kaç dolar?",
          },
          {
            id: "fx-eur",
            label: "2.000 euro kaç TL?",
            value: "2.000 euro kaç TL?",
          },
          {
            id: "fx-kur",
            label: "Güncel kurlar",
            value: "TCMB döviz kurları",
          },
        ],
        query: state,
        exactMatches: [],
        flexibleMatches: [],
        summary: emptySummary(),
        warnings: [],
        citations: doviz.citations,
      };
    } catch (err) {
      const tip =
        err instanceof Error ? err.message : "TCMB kurları alınamadı.";
      conversations.set(conversationId, { ...state, pendingFollowUp: null });
      return {
        conversationId,
        assistantMessage:
          `Şu an Merkez Bankası kurlarına ulaşamadım (${tip}). ` +
          `Biraz sonra tekrar deneyebilirsiniz; finansman karşılaştırması için tutar ve amacı yazmanız yeterli.`,
        status: "general_answer",
        missingFields: [],
        quickReplies: purposeQuickReplies().slice(0, 3),
        query: state,
        exactMatches: [],
        flexibleMatches: [],
        summary: emptySummary(),
        warnings: [tip],
        citations: [],
      };
    }
  }

  if (
    state.findeksProfile &&
    (isFindeksFollowUpQuestion(req.message) || hasFindeksSimulationRequest(state))
  ) {
    const findeksPreApproval = buildFindeksPreApprovalResponse(conversationId, state);
    if (findeksPreApproval) {
      conversations.set(conversationId, state);
      return findeksPreApproval;
    }
  }

  // Bekleyen takip (ör. “listele yazın”) veya yeni rehber sorusu
  let rehberNiyeti =
    bekleyenTakibiCoz(req.message, state.pendingFollowUp) ||
    rehberNiyetiTespit(req.message);

  // Oturumda banka seçiliyken kısa “kampanyalar” takibi → o banka.
  // Tema sorusu (“eğitim kampanyaları”) tüm bankalarda kalsın.
  const kampanyaTemasi = parseCampaignThemeFromMessage(req.message);
  if (
    kampanyaSinyaliVar(req.message) &&
    state.selectedBankIds.length === 1 &&
    !kampanyaTemasi &&
    (rehberNiyeti == null || rehberNiyeti === "genel_kampanyalar") &&
    !bankaBul(req.message)
  ) {
    rehberNiyeti = "banka_kampanyalari";
  }

  // Kampanya sorusu finansman motoruna düşmesin — tüm kayıtlı kampanyalardan yanıtla.
  // Ancak adı geçen bankaların oran/vade/masraf karşılaştırması bir kampanya
  // listesi sorusu değildir; kampanya teması ("konut") o niyeti ezmemeli.
  const alanOdakliSoru =
    turn === "multi_bank_comparison" || turn === "bank_focus";
  if (
    !rehberNiyeti &&
    !alanOdakliSoru &&
    (turn === "campaign_search" ||
      kampanyaSinyaliVar(req.message) ||
      kampanyaTemasi != null)
  ) {
    rehberNiyeti = "genel_kampanyalar";
  }

  // "Albaraka nasıl banka" — finansman slotuna düşmesin
  if (!rehberNiyeti && isBankInfoQuestion(req.message)) {
    rehberNiyeti = "banka_bilgi";
  }

  if (rehberNiyeti) {
    const sonuc = rehberYaniti(rehberNiyeti, req.message, {
      preferredBankId: state.selectedBankIds[0] ?? null,
      contextMessages: state.recentUserMessages,
    });
    const nextPending =
      rehberNiyeti === "banka_sayisi"
        ? ("banka_listesi" as const)
        : null;
    conversations.set(conversationId, {
      ...state,
      pendingFollowUp: nextPending,
    });
    return {
      conversationId,
      assistantMessage: sonuc.message,
      status: "general_answer",
      missingFields: [],
      quickReplies:
        rehberNiyeti === "banka_sayisi"
          ? [
              { id: "r-listele", label: "Listele", value: "listele" },
              ...purposeQuickReplies().slice(0, 3),
            ]
          : rehberNiyeti === "banka_kampanyalari" ||
              rehberNiyeti === "genel_kampanyalar"
            ? [
                {
                  id: "c-edu",
                  label: "Eğitim kampanyaları",
                  value: "Eğitim kampanyaları",
                },
                {
                  id: "c-new",
                  label: "Yeni müşteri kampanyaları",
                  value: "Yeni müşteri kampanyalarını göster",
                },
                {
                  id: "c-card",
                  label: "Kart kampanyaları",
                  value: "Kart kampanyaları",
                },
              ]
            : [
                ...purposeQuickReplies().slice(0, 3),
                ...termQuickReplies().slice(0, 2),
              ],
      query: { ...state, pendingFollowUp: nextPending },
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: sonuc.citations,
    };
  }

  // Ödeme planı → Hesaplama sayfasına yönlendir
  if (turn === "payment_plan") {
    conversations.set(conversationId, state);
    const href = buildHesaplamaHref(state);
    const eksik = missingRequiredFields(state);
    if (eksik.length > 0) {
      return {
        conversationId,
        assistantMessage:
          "Ödeme planı için tutar, vade ve finansman türü gerekli. " +
          "Örneğin: “200 bin TL ihtiyaç, 24 ay, oranı %3” yazıp ardından “ödeme planı” deyin.\n\n" +
          "Hazır olduğunuzda Hesaplama sayfasını da açabilirsiniz.",
        status: "needs_information",
        missingFields: eksik,
        quickReplies: [
          {
            id: "nav-hesaplama",
            label: "Hesaplama sayfasını aç",
            value: `__navigate__:${href}`,
          },
          ...purposeQuickReplies().slice(0, 3),
        ],
        query: state,
        exactMatches: [],
        flexibleMatches: [],
        summary: emptySummary(),
        warnings: [],
        citations: [],
        actions: [{ type: "navigate", href, label: "Hesaplama sayfasını aç" }],
      };
    }
    const oranNotu =
      state.customProfitRatePercent != null
        ? ` Aylık kâr oranı %${state.customProfitRatePercent.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} olarak ayarlandı.`
        : " İsterseniz önce “oranı %3 yap” diyerek kâr oranını belirleyebilirsiniz.";
    return {
      conversationId,
      assistantMessage:
        `Ödeme planınızı Hesaplama sayfasında detaylı (taksit, ana para, KKDF, BSMV) görebilirsiniz.${oranNotu}\n\n` +
        `Aşağıdaki bağlantıya tıklayın:`,
      status: "general_answer",
      missingFields: [],
      quickReplies: [
        {
          id: "nav-odeme",
          label: "Ödeme Planını Aç",
          value: `__navigate__:${href}`,
        },
        {
          id: "rate-3",
          label: "Oranı %3 yap",
          value: "Oranı %3 yap",
        },
        {
          id: "rate-399",
          label: "Oranı %3,99 yap",
          value: "Oranı %3,99 yap",
        },
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
      actions: [{ type: "navigate", href, label: "Ödeme Planını Aç" }],
    };
  }

  // Konu tamamen dışarıdaysa (yemek tarifi, hava durumu…) kapsam dışı
  // yanıtı korunur; RAG katmanına yalnızca katılım bankacılığına dair
  // bilgi soruları devredilir.
  if (turn === "unsupported") {
    conversations.set(conversationId, { ...state, pendingFollowUp: null });
    return {
      conversationId,
      assistantMessage: OUT_OF_SCOPE_MESSAGE,
      status: "needs_information",
      missingFields: [],
      quickReplies: [
        {
          id: "u-cap",
          label: "Neler yapabilirsin?",
          value: "Neler yapabilirsin?",
        },
        ...purposeQuickReplies().slice(0, 3),
        ...termQuickReplies().slice(0, 2),
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
    };
  }

  // Azami vade / tutar soruları — eksik slot diye tekrar sormadan yanıtla
  if (turn === "limit_inquiry") {
    const kind = parseLimitInquiry(req.message) || "both";
    const info = buildLimitInquiryMessage(state, kind);
    conversations.set(conversationId, { ...state, pendingFollowUp: null });
    return {
      conversationId,
      assistantMessage: info.message,
      status: "needs_information",
      missingFields: missingRequiredFields(state),
      quickReplies: info.quickReplies,
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
    };
  }

  if (turn === "general_question") {
    conversations.set(conversationId, state);

    // Finansman eşleştirme motoru bu soruyu karşılamıyor. Kullanıcıyı boş
    // çevirmek yerine kanıtlı RAG katmanına devrediyoruz; böylece tek bir
    // asistan hem finansman karşılaştırmasını hem genel soruları yanıtlar.
    const rag = await runRagChat({
      message: req.message,
      conversationId,
    });

    return {
      conversationId,
      assistantMessage: rag.answer,
      status: rag.citations.length ? "general_answer" : "needs_information",
      missingFields: [],
      quickReplies: [
        ...purposeQuickReplies().slice(0, 3),
        ...termQuickReplies().slice(0, 2),
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: {
        ...emptySummary(),
        dataAsOf: rag.dataAsOf ?? null,
      },
      warnings: rag.warnings,
      citations: rag.citations.map((c) => ({
        id: c.id,
        bankName: c.bankName,
        sourceUrl: c.sourceUrl,
        sourceCheckedAt: c.sourceCheckedAt,
        evidenceText: c.evidenceText,
      })),
    };
  }

  if (turn === "meta_question") {
    conversations.set(conversationId, state);
    return {
      conversationId,
      assistantMessage: buildMetaQuestionMessage(
        state,
        state.lastResultIds.length,
      ),
      status: "needs_information",
      missingFields: [],
      quickReplies: [
        { id: "m-all", label: "Tüm bankaları göster", value: "Tüm bankalar" },
        { id: "m-term", label: "Vadeyi 36 ay yap", value: "Vadeyi 36 ay yap" },
        { id: "m-konut", label: "Konut finansmanı", value: "Ev alcam" },
        ...purposeQuickReplies().slice(0, 3),
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
    };
  }

  if (turn === "ambiguous_purpose") {
    conversations.set(conversationId, state);
    const pilgrimage = isPilgrimagePurpose(req.message);
    if (pilgrimage) {
      return {
        conversationId,
        assistantMessage:
          "Hac veya umre için bazı katılım bankalarında özel finansman ya da vade farksız taksit kampanyaları olabiliyor.\n\n" +
          "İstersen önce bunlara bakayım; yoksa ihtiyaç finansmanı olarak karşılaştırabiliriz.",
        status: "needs_information",
        missingFields: state.financingType ? [] : ["financingType"],
        quickReplies: [
          {
            id: "amb-umre-kamp",
            label: "Hac/umre kampanyalarına bak",
            value: "hac umre kampanyaları",
          },
          {
            id: "amb-ihtiyac",
            label: "İhtiyaç finansmanı olarak bak",
            value: "İhtiyaç finansmanı olarak bak",
          },
          ...purposeQuickReplies().slice(0, 3),
        ],
        query: state,
        exactMatches: [],
        flexibleMatches: [],
        summary: emptySummary(),
        warnings: [],
        citations: [],
      };
    }
    return {
      conversationId,
      assistantMessage:
        "Anladım. Bu harcama için hangi finansman türüne bakmamı istersiniz?\n\n" +
        "Çoğu zaman bu tür ihtiyaçlar için “ihtiyaç finansmanı” kullanılır; " +
        "konut veya taşıt değilse aşağıdaki seçeneklerden birini seçebilirsiniz.",
      status: "needs_information",
      missingFields: state.financingType ? [] : ["financingType"],
      quickReplies: [
        {
          id: "amb-ihtiyac",
          label: "İhtiyaç finansmanı olarak bak",
          value: "İhtiyaç finansmanı olarak bak",
        },
        ...purposeQuickReplies(),
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
    };
  }

  const findeksPreApproval = buildFindeksPreApprovalResponse(conversationId, state);
  if (findeksPreApproval) {
    conversations.set(conversationId, state);
    return findeksPreApproval;
  }

  // ——— Çok boyutlu banka karşılaştırması ———
  // "X mi daha avantajlı, Y mi?" → oran/vade/masraf/ödül boyutlarında ayrı hüküm.
  // Tutar/vade slotları boş olsa bile temsili değerlerle cevaplanır.
  if (turn === "multi_bank_comparison") {
    const istenen = parseBanks(req.message).requested.slice(0, 4);
    const bankIds = istenen.length >= 2 ? istenen : state.selectedBankIds.slice(0, 4);

    if (bankIds.length >= 2) {
      const alanlar = parseSorulanAlanlar(req.message);
      const toplama = await bankaAdaylariniTopla({
        bankIds,
        financingType: state.financingType,
        amountTl: state.requestedAmountTl,
        termMonths: state.preferredTermMonths,
      });

      const sonuc = cokBoyutluKarsilastir(toplama.adaylar, {
        boyutlar: alanlar.length ? alanlar : undefined,
        tutarTl: toplama.tutarTl,
      });

      const urunEtiketi = state.financingType
        ? FINANCING_TYPE_LABEL[state.financingType]
        : null;

      const govde = cokBoyutluMesaj(sonuc, { urunEtiketi });
      const varsayimNotu = toplama.varsayimlar.length
        ? `\n\n${toplama.varsayimlar.map((v) => `_${v}_`).join("\n")}`
        : "";

      const citations = toplama.adaylar
        .filter((a) => a.sourceUrl)
        .map((a, i) => ({
          id: i + 1,
          bankName: a.bankName,
          sourceUrl: a.sourceUrl as string,
          sourceCheckedAt: new Date().toISOString(),
          evidenceText: a.productName || `${a.bankName} doğrulanmış ürün kaydı`,
        }));

      conversations.set(conversationId, state);
      return {
        conversationId,
        assistantMessage: govde + varsayimNotu,
        status:
          sonuc.karsilastirilabilirBoyutSayisi > 0
            ? "results_ready"
            : "no_verified_data",
        missingFields: [],
        quickReplies: state.financingType
          ? []
          : purposeQuickReplies().slice(0, 4),
        query: state,
        exactMatches: [],
        flexibleMatches: [],
        summary: {
          totalParticipationBanks: 10,
          checkedBanks: bankIds.length,
          exactMatchBankCount: toplama.adaylar.filter(
            (a) => a.aylikKarPayiOrani != null,
          ).length,
          flexibleMatchCount: 0,
          dataAsOf: new Date().toISOString(),
          freshnessLabel: toplama.canliBankIds.length
            ? "Canlı hesaplama"
            : "Doğrulanmış kayıt",
        },
        warnings: [],
        citations,
      };
    }
  }

  // ——— Tek banka alan sorgusu ———
  // "X'in konut finansmanı oranı ne?" → tutar/vade sormadan doğrudan cevap.
  if (turn === "bank_focus") {
    const istenen = parseBanks(req.message).requested;
    const bankId = istenen[0] ?? state.selectedBankIds[0] ?? null;
    const alanlar = parseSorulanAlanlar(req.message);

    if (bankId && alanlar.length > 0) {
      const toplama = await bankaAdaylariniTopla({
        bankIds: [bankId],
        financingType: state.financingType,
        amountTl: state.requestedAmountTl,
        termMonths: state.preferredTermMonths,
      });
      const aday = toplama.adaylar[0];

      if (aday) {
        const yanit = bankaAlanMesaji({
          aday,
          urunEtiketi: state.financingType
            ? FINANCING_TYPE_LABEL[state.financingType]
            : "finansman",
          alanlar,
          // Oran soranın vade/ödülü de merak ettiğini varsayıp veri varsa ekliyoruz.
          ekAlanlar: ["vade", "odul"],
          varsayimlar: toplama.varsayimlar,
          tutarTl: toplama.tutarTl,
        });

        if (yanit.cevaplandi) {
          conversations.set(conversationId, state);
          return {
            conversationId,
            assistantMessage: yanit.mesaj,
            status: "results_ready",
            missingFields: [],
            quickReplies: [
              {
                id: "bfq-plan",
                label: "Ödeme planı çıkar",
                value: `${aday.bankName} ${toplama.tutarTl} TL ${
                  state.financingType
                    ? FINANCING_TYPE_LABEL[state.financingType]
                    : "finansman"
                }, ${toplama.vadeAy} ay ödeme planı`,
              },
              {
                id: "bfq-camp",
                label: `${aday.bankName} kampanyaları`,
                value: `${aday.bankName} kampanyaları`,
              },
            ],
            query: state,
            exactMatches: [],
            flexibleMatches: [],
            summary: {
              totalParticipationBanks: 10,
              checkedBanks: 1,
              exactMatchBankCount: aday.aylikKarPayiOrani != null ? 1 : 0,
              flexibleMatchCount: 0,
              dataAsOf: new Date().toISOString(),
              freshnessLabel: toplama.canliBankIds.length
                ? "Canlı hesaplama"
                : "Doğrulanmış kayıt",
            },
            warnings: [],
            citations: aday.sourceUrl
              ? [
                  {
                    id: 1,
                    bankName: aday.bankName,
                    sourceUrl: aday.sourceUrl,
                    sourceCheckedAt: new Date().toISOString(),
                    evidenceText:
                      aday.productName || `${aday.bankName} doğrulanmış ürün kaydı`,
                  },
                ]
              : [],
          };
        }
      }
    }
  }

  const missing = missingRequiredFields(state);
  if (missing.length > 0) {
    state.askedFields = [...new Set([...state.askedFields, ...missing])];
    conversations.set(conversationId, state);
    const info = buildNeedsInfoMessage(state, missing);
    return {
      conversationId,
      assistantMessage: info.message,
      status: "needs_information",
      missingFields: missing,
      quickReplies: info.quickReplies,
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: {
        totalParticipationBanks: 10,
        checkedBanks: 0,
        exactMatchBankCount: 0,
        flexibleMatchCount: 0,
        dataAsOf: null,
        freshnessLabel: "Doğrulanamadı",
      },
      warnings: [],
      citations: [],
    };
  }

  const matchInput = opts?.matchOverride
    ? { ...opts.matchOverride, state }
    : { state };

  let match = runFinancingMatchEngine(matchInput);
  const evidenceWarnings: string[] = [];

  // Yapılandırılmış ürün yoksa Qdrant kanıtlarından kaynaklı satır üret (oran uydurmadan)
  if (
    !opts?.matchOverride &&
    (match.exactMatches.length === 0 || !match.hasVerifiedData)
  ) {
    const fromQdrant = await buildMatchesFromQdrantEvidence(state);
    evidenceWarnings.push(...fromQdrant.warnings);
    if (fromQdrant.exactMatches.length) {
      match = {
        ...match,
        hasVerifiedData: true,
        exactMatches: fromQdrant.exactMatches,
        flexibleMatches: [
          ...match.flexibleMatches,
          ...fromQdrant.flexibleMatches,
        ].slice(0, 12),
      };
    } else if (fromQdrant.flexibleMatches.length) {
      match = {
        ...match,
        hasVerifiedData: true,
        flexibleMatches: fromQdrant.flexibleMatches,
      };
    }
  }

  // Canlı hesaplama motorları (Vakıf / Ziraat / Kuveyt) — scrape oranı olmasa da taksit üretir
  if (!opts?.matchOverride) {
    const live = await enrichWithLiveCalculators(match.exactMatches, state);
    evidenceWarnings.push(...live.warnings);
    if (live.liveBankIds.length > 0) {
      match = {
        ...match,
        hasVerifiedData: true,
        exactMatches: live.matches,
        checkedBanks: Math.max(match.checkedBanks, live.liveBankIds.length),
      };
    }
  }

  if (!match.hasVerifiedData) {
    conversations.set(conversationId, state);
    const failNote = match.failedBanks.length
      ? `\n\nKontrol edilemeyen veya çıkarım yapılamayan bankalar: ${match.failedBanks.join(", ")}.`
      : "";
    return {
      conversationId,
      assistantMessage:
        "Bu koşullara uygun doğrulanmış güncel bir finansman seçeneği bulunamadı." +
        "\n\nResmî katılım bankası kaynaklarından henüz yapılandırılmış ürün kaydı " +
        "çıkarılamadı veya kayıtlar güncelliğini yitirdi. Biraz sonra yeniden deneyebilir " +
        "veya tutar/vade bilgisini koruyarak tekrar sorabilirsiniz." +
        failNote,
      status: "no_verified_data",
      missingFields: [],
      quickReplies: [
        {
          id: "retry",
          label: "Aynı koşullarla tekrar dene",
          value: `${state.requestedAmountTl} TL ${
            state.financingType
              ? FINANCING_TYPE_LABEL[state.financingType]
              : "finansman"
          }, ${state.preferredTermMonths} ay`,
        },
        ...purposeQuickReplies().slice(0, 3),
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: {
        totalParticipationBanks: 10,
        checkedBanks: match.checkedBanks,
        exactMatchBankCount: 0,
        flexibleMatchCount: 0,
        dataAsOf: match.dataAsOf,
        freshnessLabel: match.overallFreshnessLabel,
      },
      warnings: match.failedBanks.length
        ? [
            "Bazı banka kaynakları şu anda doğrulanamadığı için karşılaştırma yalnızca erişilebilen güncel kaynaklarla hazırlandı.",
            `Kontrol edilemeyen: ${match.failedBanks.join(", ")}`,
          ]
        : [
            "Doğrulanmış yapılandırılmış finansman kaydı henüz yok. Scraper arka planda çalışıyor olabilir.",
          ],
      citations: [],
    };
  }

  state.lastResultIds = match.exactMatches.map((m) => m.productId);
  conversations.set(conversationId, state);

  let exactMatches = match.exactMatches;
  if (state.customProfitRatePercent != null) {
    // Canlı motordan gelen satırları koru; diğerlerine yerel formül uygula
    const liveIds = new Set(
      exactMatches
        .filter((m) => m.productId.startsWith("live-") || m.evidence.some((e) => /canlı motor/i.test(e)))
        .map((m) => m.bankId),
    );
    const withCustom = applyCustomProfitRate(exactMatches, state);
    exactMatches = withCustom.map((m, i) =>
      liveIds.has(exactMatches[i]?.bankId || m.bankId) &&
      exactMatches[i]?.calculationAvailable
        ? exactMatches[i]!
        : m,
    );
  }

  const warnings: string[] = [...evidenceWarnings];
  if (state.customProfitRatePercent != null) {
    warnings.push(
      `Taksitler kullanıcı kâr oranı (%${state.customProfitRatePercent}) ile hesaplandı.`,
    );
  }
  if (match.failedBanks.length) {
    warnings.push(
      "Bazı banka kaynakları şu anda doğrulanamadığı için karşılaştırma yalnızca erişilebilen güncel kaynaklarla hazırlandı.",
    );
    warnings.push(`Kontrol edilemeyen: ${match.failedBanks.join(", ")}`);
  }

  const liveBankNames = [
    ...new Set(
      exactMatches
        .filter(
          (m) =>
            m.productId.startsWith("live-") ||
            m.evidence.some((e) => /canlı motor|Softtech|yerel motor/i.test(e)),
        )
        .map((m) => m.bankName),
    ),
  ];
  const liveNote = liveBankNames.length
    ? `\n\nTaksit ve kâr payı; ${joinTrList(liveBankNames)} için bankanın hesaplama aracı / Softtech uyumlu motorla dolduruldu.`
    : "";

  const citations = exactMatches.slice(0, 8).map((m, i) => ({
    id: i + 1,
    bankName: m.bankName,
    sourceUrl: m.sourceUrl,
    sourceCheckedAt: m.sourceCheckedAt,
    evidenceText: m.evidence[0] || m.productName,
  }));

  const status =
    exactMatches.length > 0
      ? ("results_ready" as const)
      : ("no_exact_match" as const);

  const liveFailNote = evidenceWarnings
    .filter((w) => /canlı hesaplama|ulaşılamadı/i.test(w))
    .slice(0, 2)
    .join(" ");

  const assistantMessage =
    (turn === "bank_focus"
      ? buildBankFocusMessage(state, exactMatches)
      : state.intent === "campaign_search"
        ? buildCampaignMessage(
            state,
            match.flexibleMatches.length,
            exactMatches.length,
          )
        : buildResultMessage(
            state,
            exactMatches.length,
            match.flexibleMatches.length,
            10,
          )) +
    liveNote +
    (liveFailNote ? `\n\nNot: ${liveFailNote}` : "");

  const href = buildHesaplamaHref(state);

  return {
    conversationId,
    assistantMessage,
    status,
    missingFields: [],
    quickReplies:
      turn === "bank_focus"
        ? [
            { id: "bf-all", label: "Tüm bankalar", value: "Tüm bankalar" },
            ...sortFollowUpReplies(),
          ]
        : state.intent === "campaign_search"
          ? [
              {
                id: "c-new-camp",
                label: "Yeni müşteri kampanyaları",
                value: "Yeni müşteri kampanyalarını göster",
              },
              ...sortFollowUpReplies(),
            ]
          : [
              ...sortFollowUpReplies(),
              {
                id: "nav-odeme",
                label: "Ödeme planı",
                value: `__navigate__:${href}`,
              },
              {
                id: "rate-3",
                label: "Oranı %3 yap",
                value: "Oranı %3 yap",
              },
            ],
    query: state,
    exactMatches,
    flexibleMatches: match.flexibleMatches,
    summary: {
      totalParticipationBanks: 10,
      checkedBanks: match.checkedBanks || 10,
      exactMatchBankCount: exactMatches.length,
      flexibleMatchCount: match.flexibleMatches.length,
      dataAsOf: match.dataAsOf,
      freshnessLabel: match.overallFreshnessLabel,
    },
    warnings,
    citations,
    actions: [{ type: "navigate", href, label: "Ödeme Planını Aç" }],
  };
}

/** LLM cevabındaki sayıları backend sonuçlarıyla doğrula */
export function sanitizeAssistantNumbers(
  text: string,
  allowedNumbers: number[],
): string {
  const allowed = new Set(
    allowedNumbers
      .filter((n) => Number.isFinite(n))
      .map((n) => Math.round(n)),
  );
  // Engelle: metindeki büyük tutar benzeri sayılar allowed değilse maskele
  return text.replace(/\b(\d{1,3}(?:\.\d{3})+|\d{5,})\b/g, (raw) => {
    const n = Number(raw.replace(/\./g, ""));
    if (!Number.isFinite(n)) return raw;
    if (allowed.has(n) || allowed.has(Math.round(n))) return raw;
    return "[doğrulanmamış tutar]";
  });
}
