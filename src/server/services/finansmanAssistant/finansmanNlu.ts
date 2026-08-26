import { asciiKatla } from "../../../nlp/normalize";
import { BANK_NAME_TO_ID } from "../rag/ragTypes";
import type { FinancingConversationState, FinancingType } from "./finansmanTypes";

/** Türkçe tutar ifadelerini TL'ye çevirir */
export function parseTurkishAmount(text: string): number | null {
  const t = asciiKatla(text).replace(/\s+/g, " ");

  let m = t.match(/(\d+([.,]\d+)?)\s*milyon/);
  if (m) {
    const n = parseFloat(m[1].replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 1_000_000) : null;
  }

  m = t.match(/(\d+([.,]\d+)?)\s*bin(?:e|i|den|den)?\b/) ||
    t.match(/(\d+([.,]\d+)?)\s*(bin|k)\b/);
  if (m) {
    const n = parseFloat(m[1].replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 1_000) : null;
  }

  m =
    t.match(/(?:tutar|ihtiyac[iı]?m?|almak)\s*[:=]?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{4,})/) ||
    t.match(/(\d{1,3}(?:\.\d{3})+)(?:\s*tl)?/) ||
    t.match(/\b(\d{5,7})\b/);
  if (m) {
    const n = Number(String(m[1]).replace(/[.\s]/g, ""));
    return Number.isFinite(n) && n >= 1000 ? n : null;
  }

  return null;
}

/** Vade ayı: "24 ay", "2 yıl", "pardon 24 ay", veya yalnızca "24". */
export function parseTermMonths(text: string): number | null {
  const t = text.trim();
  const ay = t.match(/(\d+)\s*ay/i);
  if (ay) {
    const n = Number(ay[1]);
    return Number.isFinite(n) && n >= 1 && n <= 360 ? n : null;
  }
  const yil = t.match(/(\d+)\s*y[iı]l/i);
  if (yil) {
    const n = Number(yil[1]) * 12;
    return Number.isFinite(n) && n >= 1 && n <= 360 ? n : null;
  }
  const bare = t.match(/^(\d{1,3})$/);
  if (bare) {
    const n = Number(bare[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 120) return n;
  }
  const soft = asciiKatla(t).match(
    /(?:pardon|vade(?:yi)?|olsun|yap)\s*.*?(\d{1,3})\s*(?:ay)?/,
  );
  if (soft) {
    const n = Number(soft[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 120) return n;
  }
  return null;
}

export function parseFinancingType(text: string): FinancingType | null {
  const t = asciiKatla(text);
  // "ev alcam", "ev alacağım", "ev bakıyorum"
  if (
    /konut|mortgage|gayrimenkul|\bev\s+alc|\bev\s+al[iı]|\bev almak|\bev bak|\bev istiyorum/.test(
      t,
    )
  ) {
    return "housing";
  }
  if (/tasit|arac|otomobil|araba/.test(t)) return "vehicle";
  if (/egitim|okul|universite/.test(t)) return "education";
  if (/alisveris|magaza|taksitle/.test(t)) return "shopping";
  if (/ticari|kobi|isletme|mikro/.test(t)) return "commercial";
  if (
    /ihtiyac finansman|ihtiyac kredi|tuketici finansman|bireysel finansman|nakit finansman/.test(
      t,
    ) ||
    (/\bihtiyac\b/.test(t) &&
      !/ihtiyac(im|ım)\b/.test(t) &&
      !/ihtiyacim var|ihtiyac[iı]m var|yardim/.test(t))
  ) {
    return "consumer";
  }
  return null;
}

/** Hac, düğün, tatil gibi amaç — finansman türü net değil */
export function isAmbiguousPurpose(text: string): boolean {
  const t = asciiKatla(text);
  return /hac\b|hacca|umre|dugun|nikah|tatil|seyahat|bayram|askeri|bedelli/.test(
    t,
  );
}

export function parseCustomerStatus(
  text: string,
): "new" | "existing" | "unknown" {
  const t = asciiKatla(text);
  if (/yeni musteri/.test(t)) return "new";
  if (/mevcut musteri/.test(t)) return "existing";
  if (/henuz karar|karar vermedim/.test(t)) return "unknown";
  return "unknown";
}

export function parseBanks(text: string): {
  requested: string[];
  excluded: string[];
} {
  const lower = asciiKatla(text);
  const requested: string[] = [];
  const excluded: string[] = [];
  for (const [name, id] of Object.entries(BANK_NAME_TO_ID)) {
    if (!lower.includes(asciiKatla(name))) continue;
    if (/cikar|hari[cç]|gosterme|gösterme/.test(lower)) excluded.push(id);
    else requested.push(id);
  }
  return { requested: [...new Set(requested)], excluded: [...new Set(excluded)] };
}

export function parseSortPreference(
  text: string,
): FinancingConversationState["sortPreference"] {
  const t = asciiKatla(text);
  // "albarakada oranlar ne" sıralama değil, banka sorusu
  if (/oran(lar)?\s*(ne|nedir|kac)|ne\s+(kadar\s+)?(oran|kar)/.test(t)) {
    return null;
  }
  if (/toplam.*(odeme|ödeme)|en dusuk toplam/.test(t)) return "lowest_total_payment";
  if (/en uzun vade/.test(t)) return "longest_term";
  if (/masraf|ucret|ücret|tahsis/.test(t) && /(dusuk|düşük|en az|sirala)/.test(t)) {
    return "lowest_fee";
  }
  if (/odul|ödül/.test(t) && /sirala|en (yuksek|fazla)/.test(t)) return "highest_reward";
  if (
    /(en dusuk).*(kar pay|oran)|(kar pay|oran).*(sirala|gore|en dusuk)/.test(t)
  ) {
    return "lowest_profit_rate";
  }
  return null;
}

/** Sonuç / meta sorular: neden az banka, neden aynı cevap */
export function isMetaResultQuestion(text: string): boolean {
  const t = asciiKatla(text);
  return (
    /baska banka|daha (fazla|cok) banka|sadece .* banka|neden .* banka|niye .* banka|hep ayni|neden ayni|niye ayni|ayn[iı] cevap|tekrar (ediyorsun|liyorsun)/.test(
      t,
    ) || /neden|niye/.test(t) && /ayn[iı]|tekrar|hep/.test(t)
  );
}

/** Belirli bankanın oranı / detayı soruluyor mu */
export function isBankRateQuestion(text: string): boolean {
  const t = asciiKatla(text);
  const banks = parseBanks(text);
  if (!banks.requested.length) return false;
  return /oran|kar pay|ne kadar|nasil|var m[iı]|goster|karsilastir/.test(t);
}

export function detectFollowUpFlags(text: string): {
  amountCapStrict: boolean;
  hideUnknownFees: boolean;
  onlyNewCustomer: boolean;
} {
  const t = asciiKatla(text);
  return {
    amountCapStrict: /asamam|ge[cç]emem|fazlas[iı]n[iı] istemiyorum|asamam/.test(t),
    hideUnknownFees: /masraf[iı] bilinmeyen|ucreti bilinmeyen|belirtilmemis.*gosterme/.test(
      t,
    ),
    onlyNewCustomer: /yeni musteri kampanya/.test(t),
  };
}

export type TurnKind =
  | "param_update"
  | "finance_search"
  | "campaign_search"
  | "comparison"
  | "ambiguous_purpose"
  | "unsupported"
  | "greeting"
  | "meta_question"
  | "bank_focus"
  // Finansman formuyla karşılanamayan bilgi sorusu (ör. "murabaha nedir?")
  // — kanıtlı RAG katmanına devredilir.
  | "general_question"
  | "sort_only";

/** Selam / genel yardım — finansman parametresi yok */
export function isGreetingOrHelpRequest(text: string): boolean {
  const t = asciiKatla(text).trim();
  if (!t) return false;

  const hasRealFinance =
    parseTurkishAmount(t) != null ||
    (parseTermMonths(t) != null && !/yardim/.test(t)) ||
    parseFinancingType(t) != null ||
    /finansman|kredi|faiz|kar pay|vade\b|kampanya|konut|tasit|araba|arac|otomobil|banka|kat[iı]l[iı]m|tahsis|masraf|\btl\b|\bbin\b|milyon/.test(
      t,
    );

  if (hasRealFinance) return false;

  return (
    /^(merhaba|selam|selamlar|hey|hi|hello|iyi gunler|gunaydin)\b/.test(t) ||
    /yardim(a|iniz)?\s+ihtiyac|bana yardim|yardim eder misin|ne yapabilirsin|nasil (calisir|kullan)/.test(
      t,
    ) ||
    /^(merhaba|selam).{0,60}yardim/.test(t)
  );
}

export function classifyTurn(
  message: string,
  selectedQuickReply?: string,
): TurnKind {
  const text = [message, selectedQuickReply].filter(Boolean).join(" ");
  const t = asciiKatla(text).trim();
  if (!t) return "unsupported";

  if (
    /tarif|yemek|kek|pasta|corba|hava durumu|f[iı]kra|saka|siir|sarki|oyun|film|spor sonucu/.test(
      t,
    )
  ) {
    return "unsupported";
  }

  if (isGreetingOrHelpRequest(t)) {
    return "greeting";
  }

  if (isMetaResultQuestion(t)) {
    return "meta_question";
  }

  if (isBankRateQuestion(t)) {
    return "bank_focus";
  }

  if (isAmbiguousPurpose(t) && !parseFinancingType(t)) {
    return "ambiguous_purpose";
  }

  if (/kampanya/.test(t)) return "campaign_search";
  if (/kar[sş]ila[sş]tir/.test(t)) return "comparison";
  if (parseSortPreference(t)) return "sort_only";

  const flags = detectFollowUpFlags(t);
  if (flags.amountCapStrict || flags.hideUnknownFees || flags.onlyNewCustomer) {
    return "param_update";
  }

  const somutTalep =
    parseTurkishAmount(t) != null ||
    parseTermMonths(t) != null ||
    parseFinancingType(t) != null;

  // "murabaha nedir", "kar payı nasıl hesaplanır", "faizsiz mi" gibi
  // bilgi soruları eşleştirme motoruyla cevaplanamaz; slot doldurmaya
  // sokmak yerine kanıtlı RAG katmanına devredilir.
  const bilgiSorusuKalibi =
    /(nedir|ne demek|ne anlama|neye gore|nasil (calis|hesaplan|isle|belirlen)|farki nedir|ne fark|avantaj|dezavantaj|helal mi|caiz mi|faizsiz mi|sart(lar)?i ne|hangi durumlarda|ne ise yarar|kimler (alabilir|basvurabilir))/.test(
      t,
    );

  if (bilgiSorusuKalibi && !somutTalep) {
    return "general_question";
  }

  const hasFinanceSignal =
    /finansman|kredi|faiz|kar pay|vade|tutar|\btl\b|\bbin\b|milyon|banka|kat[iı]l[iı]m|ihtiyac finansman|ihtiyac kredi|\bihtiyac\b(?!\s*im)|konut|tasit|araba|arac|otomobil|\bev\s+alc|alcam|alacag|alaca[gğ]|karsilastir|sirala|masraf|tahsis|musteri|pardon/.test(
      t,
    ) ||
    parseTurkishAmount(t) != null ||
    parseTermMonths(t) != null ||
    parseFinancingType(t) != null ||
    /^\d{1,3}$/.test(t);

  if (!hasFinanceSignal) return "unsupported";

  if (
    parseTermMonths(t) != null ||
    parseTurkishAmount(t) != null ||
    parseFinancingType(t) != null ||
    detectFollowUpFlags(t).amountCapStrict ||
    detectFollowUpFlags(t).hideUnknownFees ||
    detectFollowUpFlags(t).onlyNewCustomer
  ) {
    return "param_update";
  }

  return "finance_search";
}

export function createEmptyState(conversationId: string): FinancingConversationState {
  return {
    conversationId,
    intent: "finance_search",
    financingType: null,
    requestedAmountTl: null,
    preferredTermMonths: null,
    amountFlexibilityPercent: 25,
    termFlexibilityMonths: 12,
    amountCapStrict: false,
    customerStatus: "unknown",
    selectedBankIds: [],
    excludedBankIds: [],
    hideUnknownFees: false,
    sortPreference: "lowest_profit_rate",
    askedFields: [],
    lastResultIds: [],
  };
}

export function mergeMessageIntoState(
  prev: FinancingConversationState,
  message: string,
  selectedQuickReply?: string,
): FinancingConversationState {
  const text = [message, selectedQuickReply].filter(Boolean).join(" ");
  const next = { ...prev };
  const turn = classifyTurn(message, selectedQuickReply);

  if (turn === "unsupported") {
    next.intent = "unsupported";
    return next;
  }
  if (turn === "greeting" || turn === "meta_question") {
    next.intent = "general_question";
    return next;
  }
  if (turn === "ambiguous_purpose") {
    next.intent = "general_question";
    return next;
  }

  const amount = parseTurkishAmount(text);
  const termCandidate = parseTermMonths(text);
  const looksLikeBareTerm =
    termCandidate != null &&
    (/^\s*\d{1,3}\s*$/.test(text.trim()) ||
      /pardon|vade/i.test(asciiKatla(text)));

  if (amount != null && !(looksLikeBareTerm && next.requestedAmountTl != null)) {
    next.requestedAmountTl = amount;
  }

  if (termCandidate != null) next.preferredTermMonths = termCandidate;

  const prevType = next.financingType;
  const fType = parseFinancingType(text);
  if (fType) next.financingType = fType;

  const qr = asciiKatla(selectedQuickReply || "");
  if (qr === "ihtiyac" || qr === "ihtiyac finansmani") next.financingType = "consumer";
  if (qr === "tasit" || qr === "tasit finansmani") next.financingType = "vehicle";
  if (qr === "konut" || qr === "konut finansmani") next.financingType = "housing";
  if (qr === "alisveris") next.financingType = "shopping";
  if (qr === "egitim") next.financingType = "education";
  if (qr === "ticari") next.financingType = "commercial";
  if (qr === "yeni musteri") next.customerStatus = "new";
  if (qr === "mevcut musteri") next.customerStatus = "existing";
  if (qr === "henuz karar vermedim") next.customerStatus = "unknown";
  if (qr === "ihtiyac olarak devam" || qr === "ihtiyac finansmani olarak bak") {
    next.financingType = "consumer";
  }
  if (qr === "tum bankalar" || qr === "tumunu goster") {
    next.selectedBankIds = [];
  }

  const cs = parseCustomerStatus(text);
  if (cs !== "unknown" || /yeni musteri|mevcut musteri/.test(asciiKatla(text))) {
    next.customerStatus = cs;
  }

  const banks = parseBanks(text);
  if (banks.requested.length) next.selectedBankIds = banks.requested;
  else if (fType && fType !== prevType) {
    // Amaç değişince önceki banka filtresini temizle
    next.selectedBankIds = [];
  }
  if (/tum banka|tumunu goster|filtreyi kaldir|butun banka/.test(asciiKatla(text))) {
    next.selectedBankIds = [];
  }
  if (banks.excluded.length) {
    next.excludedBankIds = [
      ...new Set([...next.excludedBankIds, ...banks.excluded]),
    ];
  }

  const sort = parseSortPreference(text);
  if (sort) next.sortPreference = sort;

  const flags = detectFollowUpFlags(text);
  if (flags.amountCapStrict) {
    next.amountCapStrict = true;
    next.amountFlexibilityPercent = 0;
  }
  if (flags.hideUnknownFees) next.hideUnknownFees = true;
  if (flags.onlyNewCustomer) next.customerStatus = "new";

  if (turn === "bank_focus") next.intent = "follow_up";
  else if (turn === "campaign_search") next.intent = "campaign_search";
  else if (turn === "comparison") next.intent = "comparison";
  else if (turn === "param_update" || turn === "sort_only") next.intent = "follow_up";
  else next.intent = "finance_search";

  return next;
}

export function missingRequiredFields(
  state: FinancingConversationState,
): string[] {
  const missing: string[] = [];
  if (!state.financingType) missing.push("financingType");
  if (state.requestedAmountTl == null) missing.push("requestedAmountTl");
  if (state.preferredTermMonths == null) missing.push("preferredTermMonths");
  return missing;
}

export function stateFingerprint(state: FinancingConversationState): string {
  return [
    state.financingType,
    state.requestedAmountTl,
    state.preferredTermMonths,
    state.customerStatus,
    state.sortPreference,
    state.amountCapStrict,
    state.hideUnknownFees,
    state.selectedBankIds.join(","),
    state.excludedBankIds.join(","),
    state.intent,
  ].join("|");
}
