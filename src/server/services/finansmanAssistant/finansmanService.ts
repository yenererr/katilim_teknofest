import { randomUUID } from "crypto";
import {
  createEmptyState,
  mergeMessageIntoState,
  missingRequiredFields,
  classifyTurn,
} from "./finansmanNlu";
import { runFinancingMatchEngine } from "./finansmanMatcher";
import { buildMatchesFromQdrantEvidence } from "./finansmanEvidence";
import {
  FINANCING_TYPE_LABEL,
  type FinancingAssistantResponse,
  type FinancingConversationState,
} from "./finansmanTypes";
import { asciiKatla } from "../../../nlp/normalize";
import { runRagChat } from "../rag/ragService";
import { rehberNiyetiTespit, rehberYaniti } from "./bankDirectory";
import { sozluktenYanitla } from "./terimSozlugu";

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

function buildNeedsInfoMessage(
  state: FinancingConversationState,
  missing: string[],
): { message: string; quickReplies: FinancingAssistantResponse["quickReplies"] } {
  const parts: string[] = [];
  const quick: FinancingAssistantResponse["quickReplies"] = [];

  if (state.requestedAmountTl != null) {
    parts.push(
      `${formatAmount(state.requestedAmountTl)} TL için seçenekleri karşılaştırabilirim.`,
    );
  }

  const askType = missing.includes("financingType");
  const askTerm = missing.includes("preferredTermMonths");
  const askAmount = missing.includes("requestedAmountTl");

  if (askType && askTerm) {
    parts.push(
      "Bu finansmanı hangi amaçla kullanacaksınız ve kaç ay vade düşünüyorsunuz?",
    );
    quick.push(...purposeQuickReplies(), ...termQuickReplies());
  } else if (askType && askAmount) {
    parts.push(
      "Finansmanı hangi amaçla kullanacaksınız ve ne kadar tutara ihtiyacınız var?",
    );
    quick.push(...purposeQuickReplies());
  } else if (askTerm && askAmount) {
    parts.push("İstediğiniz tutarı ve vadeyi (ay) yazar mısınız?");
    quick.push(...termQuickReplies());
  } else if (askType) {
    parts.push("Bu finansmanı hangi amaçla kullanacaksınız?");
    quick.push(...purposeQuickReplies());
  } else if (askTerm) {
    parts.push("Kaç ay vade düşünüyorsunuz?");
    quick.push(...termQuickReplies());
  } else if (askAmount) {
    parts.push("İhtiyacınız olan tutarı yazar mısınız?");
  }

  // Max two question themes already handled; optionally customer as soft tip
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
      "Size uygun finansman seçeneklerini karşılaştırabilmem için kısa bilgilere ihtiyacım var.",
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
      `${amount} TL ${typeLabel.toLowerCase()} için doğrulanmış aktif kampanya aradım.\n\n` +
      `Şu anda koşullarınıza uyan doğrulanmış bir kampanya kaydı bulunamadı. ` +
      `İsterseniz tutarı veya vadeyi değiştirerek yeniden bakabilirim.`
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
    : "finansman";
  return (
    `Parametreler aynı kaldığı için aynı doğrulanmış sonucu gösteriyorum.\n\n` +
    `10 katılım bankası içinde şu an koşullarınıza uyan ${lastExactCount || "sınırlı sayıda"} seçenek var; ` +
    `uygun olmayan bankaları tabloya eklemiyorum.\n\n` +
    `Daha fazla seçenek için tutarı, vadeyi (${state.preferredTermMonths ?? "?"} ay) veya amacı ` +
    `(şu an: ${typeLabel}) değiştirebilir; ya da “Albaraka oranları ne?” gibi tek banka sorabilirsiniz.`
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
    `Aşağıdaki tabloyu ilan edilen kâr payı oranına göre sıraladım.` +
    (flexCount > 0
      ? `\n\nAyrıca tutar veya vadede küçük bir değişiklik yapmanız hâlinde ` +
        `yararlanabileceğiniz ${flexCount} aktif kampanyayı ikinci tabloda gösterdim.`
      : "") +
    `\n\nİsterseniz sonuçları toplam tahmini ödemeye veya vadeye göre yeniden ` +
    `sıralayabilirim. Hangisini tercih edersiniz?`
  );
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

  // Terminoloji soruları doğrulanmış sözlükten anında yanıtlanır.
  const sozluk = sozluktenYanitla(req.message);
  if (sozluk) {
    conversations.set(conversationId, state);
    return {
      conversationId,
      assistantMessage:
        sozluk.message +
        "\n\nBir bankanın bu ürüne ait güncel koşullarını da sorabilirsiniz.",
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

  // Banka rehberi soruları (liste, sayı, resmî site, kampanya listesi)
  // doğrulanmış yapılandırmadan anında yanıtlanır; LLM beklenmez.
  const rehberNiyeti = rehberNiyetiTespit(req.message);
  if (rehberNiyeti) {
    conversations.set(conversationId, state);
    const sonuc = rehberYaniti(rehberNiyeti, req.message);
    return {
      conversationId,
      assistantMessage: sonuc.message,
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
      citations: sonuc.citations,
    };
  }

  const turn = classifyTurn(req.message, req.selectedQuickReply);

  // Konu tamamen dışarıdaysa (yemek tarifi, hava durumu…) kapsam dışı
  // yanıtı korunur; RAG katmanına yalnızca katılım bankacılığına dair
  // bilgi soruları devredilir.
  if (turn === "unsupported") {
    conversations.set(conversationId, state);
    return {
      conversationId,
      assistantMessage:
        "Bu konuda yardımcı olamam. Ben katılım bankalarının doğrulanmış " +
        "finansman seçeneklerini karşılaştırmak ve katılım bankacılığı " +
        "sorularınızı yanıtlamak için buradayım.\n\n" +
        "Tutar, vade veya finansman amacınızı (ihtiyaç, taşıt, konut…) yazabilirsiniz.",
      status: "needs_information",
      missingFields: [],
      quickReplies: [
        ...purposeQuickReplies().slice(0, 4),
        ...termQuickReplies().slice(0, 3),
      ],
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

  if (turn === "greeting") {
    conversations.set(conversationId, state);
    const hasContext =
      state.requestedAmountTl != null ||
      state.financingType != null ||
      state.preferredTermMonths != null;
    return {
      conversationId,
      assistantMessage: hasContext
        ? "Merhaba! Mevcut talebinizi koruyorum. İsterseniz tutarı, vadeyi veya finansman amacını güncelleyin; ya da kampanya sorabilirsiniz."
        : "Merhaba! Katılım bankalarının doğrulanmış finansman seçeneklerini karşılaştırmanıza yardımcı olabilirim.\n\nİhtiyacınız olan tutarı ve finansman amacınızı yazmanız yeterli.",
      status: "needs_information",
      missingFields: missingRequiredFields(state),
      quickReplies: [
        {
          id: "g-ihtiyac",
          label: "200.000 TL ihtiyaç, 24 ay",
          value: "200.000 TL ihtiyaç finansmanı, 24 ay",
        },
        ...purposeQuickReplies().slice(0, 3),
        ...termQuickReplies().slice(0, 3),
      ],
      query: state,
      exactMatches: [],
      flexibleMatches: [],
      summary: emptySummary(),
      warnings: [],
      citations: [],
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

  const warnings: string[] = [...evidenceWarnings];
  if (match.failedBanks.length) {
    warnings.push(
      "Bazı banka kaynakları şu anda doğrulanamadığı için karşılaştırma yalnızca erişilebilen güncel kaynaklarla hazırlandı.",
    );
    warnings.push(`Kontrol edilemeyen: ${match.failedBanks.join(", ")}`);
  }

  const citations = match.exactMatches.slice(0, 8).map((m, i) => ({
    id: i + 1,
    bankName: m.bankName,
    sourceUrl: m.sourceUrl,
    sourceCheckedAt: m.sourceCheckedAt,
    evidenceText: m.evidence[0] || m.productName,
  }));

  const status =
    match.exactMatches.length > 0
      ? ("results_ready" as const)
      : ("no_exact_match" as const);

  const assistantMessage =
    turn === "bank_focus"
      ? buildBankFocusMessage(state, match.exactMatches)
      : state.intent === "campaign_search"
        ? buildCampaignMessage(
            state,
            match.flexibleMatches.length,
            match.exactMatches.length,
          )
        : buildResultMessage(
            state,
            match.exactMatches.length,
            match.flexibleMatches.length,
            10,
          );

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
          : sortFollowUpReplies(),
    query: state,
    exactMatches: match.exactMatches,
    flexibleMatches: match.flexibleMatches,
    summary: {
      totalParticipationBanks: 10,
      checkedBanks: match.checkedBanks || 10,
      exactMatchBankCount: match.exactMatches.length,
      flexibleMatchCount: match.flexibleMatches.length,
      dataAsOf: match.dataAsOf,
      freshnessLabel: match.overallFreshnessLabel,
    },
    warnings,
    citations,
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
