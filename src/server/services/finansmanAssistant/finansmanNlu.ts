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

  m = t.match(/(\d+([.,]\d+)?)\s*(bin|k)\b/);
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
  if (
    /konut|mortgage|gayrimenkul|\bev alac|\bev al[iı]yorum|\bev almak|\bev bak/.test(
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
    /ihtiyac finansman|tuketici finansman|bireysel finansman|nakit finansman/.test(
      t,
    ) ||
    (/\bihtiyac\b/.test(t) &&
      !/ihtiyac(im|ım)\b/.test(t) &&
      !/ihtiyacim var|ihtiyac[iı]m var/.test(t))
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
  if (/toplam.*(odeme|ödeme)|en dusuk toplam/.test(t)) return "lowest_total_payment";
  if (/en uzun vade/.test(t)) return "longest_term";
  if (/masraf|ucret|ücret|tahsis/.test(t) && /dusuk|düşük|en az/.test(t)) {
    return "lowest_fee";
  }
  if (/odul|ödül/.test(t)) return "highest_reward";
  if (/kar pay|kâr pay|oran/.test(t)) return "lowest_profit_rate";
  return null;
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
  | "sort_only";

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

  if (isAmbiguousPurpose(t) && !parseFinancingType(t)) {
    return "ambiguous_purpose";
  }

  if (/kampanya/.test(t)) return "campaign_search";
  if (/kar[sş]ila[sş]tir/.test(t)) return "comparison";
  if (parseSortPreference(t)) return "sort_only";

  const hasFinanceSignal =
    /finansman|kredi|faiz|kar pay|vade|tutar|tl\b|bin|milyon|banka|kat[iı]l[iı]m|ihtiyac|konut|tasit|araba|arac|otomobil|alcam|alacag|alaca[gğ]|karsilastir|sirala|masraf|tahsis|musteri|pardon/.test(
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

  const cs = parseCustomerStatus(text);
  if (cs !== "unknown" || /yeni musteri|mevcut musteri/.test(asciiKatla(text))) {
    next.customerStatus = cs;
  }

  const banks = parseBanks(text);
  if (banks.requested.length) next.selectedBankIds = banks.requested;
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

  if (turn === "campaign_search") next.intent = "campaign_search";
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
