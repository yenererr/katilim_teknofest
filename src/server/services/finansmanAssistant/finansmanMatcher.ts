import { BANK_SOURCE_CONFIGS } from "../scraper/bankSourceConfig";
import { getLiveBankStates, type LiveBankState } from "../liveData/liveDataBridge";
import { evaluateFreshness } from "../rag/freshnessService";
import type { FreshnessStatus } from "../rag/ragTypes";
import { listMemoryCampaigns, listMemoryProducts } from "../postgres/store";
import { calculateFinancingPayments } from "./finansmanCalculator";
import {
  FINANCING_TYPE_LABEL,
  PRODUCT_TYPE_MAP,
  type FinancingConversationState,
  type FinancingMatch,
  type FlexibleCampaignMatch,
  type FlexMatchScore,
} from "./finansmanTypes";

const ALLOWED_BANK_IDS = new Set(BANK_SOURCE_CONFIGS.map((b) => b.bankId));

const CONVENTIONAL_NAME_RE =
  /(vak[iı]f\s*bank|ziraat\s+bankas|halkbank|[iı][sş]\s+bankas|garanti(\s*bbva)?|akbank|yap[iı]\s*kredi|qnb|denizbank|\bteb\b)/i;

export function isAllowedParticipationBank(
  bankId: string,
  bankName?: string,
): boolean {
  if (!ALLOWED_BANK_IDS.has(bankId)) return false;
  if (bankName && CONVENTIONAL_NAME_RE.test(bankName)) return false;
  // Bilinen konvansiyonel id sahteciliği
  if (
    /^(vakifbank|ziraat-bankasi|halkbank|isbank|garanti|akbank|yapikredi|qnb|denizbank|teb)$/i.test(
      bankId,
    )
  ) {
    return false;
  }
  return true;
}

function termOk(
  preferred: number,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (min != null && preferred < min) return false;
  if (max != null && preferred > max) return false;
  // Aralık yoksa vade bilgisini engelleyici sayma (ürün genel ilan)
  return true;
}

function amountOk(
  amount: number,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (min != null && amount < min) return false;
  if (max != null && amount > max) return false;
  return true;
}

function campaignActive(end: unknown, status?: string): boolean {
  if (status === "expired") return false;
  if (status === "active") {
    if (end == null || end === "") return true;
  }
  if (end == null || end === "") return true;
  const ts = Date.parse(String(end));
  if (!Number.isFinite(ts)) return true;
  return ts >= Date.now();
}

function freshnessUi(f: FreshnessStatus): string {
  switch (f) {
    case "FRESH":
      return "Güncel";
    case "STALE":
      return "Kısmen güncel";
    case "EXPIRED":
      return "Doğrulanamadı";
    case "FAILED":
      return "Doğrulanamadı";
    default:
      return "Doğrulanamadı";
  }
}

function productTypeMatches(
  urunTuru: string,
  financingType: FinancingConversationState["financingType"],
): boolean {
  if (!financingType) return true;
  const allowed = PRODUCT_TYPE_MAP[financingType] || [];
  return allowed.includes(urunTuru) || urunTuru === "diger";
}

function segmentOk(
  segs: string[],
  customerStatus: FinancingConversationState["customerStatus"],
): boolean {
  if (!segs.length) return true;
  const lower = segs.map((s) => s.toLowerCase());
  if (customerStatus === "new") {
    return (
      lower.some((s) => /yeni|new/.test(s)) ||
      lower.some((s) => /herkes|genel|tumu|tümü/.test(s))
    );
  }
  if (customerStatus === "existing") {
    return (
      lower.some((s) => /mevcut|existing/.test(s)) ||
      lower.some((s) => /herkes|genel|tumu|tümü/.test(s))
    );
  }
  return true;
}

function readTerm(p: Record<string, any>) {
  const v = p.terimler?.vade_ay;
  return { min: v?.min ?? null, max: v?.max ?? null };
}

function readAmount(p: Record<string, any>) {
  const t = p.terimler?.tutar;
  return { min: t?.min ?? null, max: t?.max ?? null };
}

function readRate(p: Record<string, any>) {
  const k = p.terimler?.kar_payi_orani;
  const deger = typeof k?.deger === "number" ? k.deger : null;
  const periyot = k?.periyot;
  const ratePeriod =
    periyot === "aylik"
      ? ("monthly" as const)
      : periyot === "yillik"
        ? ("annual" as const)
        : ("unknown" as const);
  return { profitRate: deger, ratePeriod };
}

function readFee(p: Record<string, any>): number | null {
  const f = p.terimler?.tahsis_ucreti?.deger;
  return typeof f === "number" ? f : null;
}

function evidenceList(p: Record<string, any>): string[] {
  const k = p.kanitlar;
  if (!k || typeof k !== "object") return [];
  return Object.values(k)
    .map((v) => String(v))
    .filter(Boolean)
    .slice(0, 5);
}

function moneyTr(n: number): string {
  return `${n.toLocaleString("tr-TR")} TL`;
}

export type MatchEngineInput = {
  state: FinancingConversationState;
  states?: LiveBankState[];
  memoryProducts?: any[];
  memoryCampaigns?: any[];
  allowDemoData?: boolean;
};

export type MatchEngineResult = {
  exactMatches: FinancingMatch[];
  flexibleMatches: FlexibleCampaignMatch[];
  checkedBanks: number;
  failedBanks: string[];
  dataAsOf: string | null;
  overallFreshnessLabel: string;
  hasVerifiedData: boolean;
};

function collectProductCandidates(
  input: MatchEngineInput,
): Array<{
  bankId: string;
  bankName: string;
  productId: string;
  product: Record<string, any>;
  freshness: FreshnessStatus;
  sourceCheckedAt: string;
  sourceUrl: string;
}> {
  const out: Array<{
    bankId: string;
    bankName: string;
    productId: string;
    product: Record<string, any>;
    freshness: FreshnessStatus;
    sourceCheckedAt: string;
    sourceUrl: string;
  }> = [];

  const states = input.states ?? getLiveBankStates();
  for (const bank of states) {
    if (!isAllowedParticipationBank(bank.id, bank.bankName)) continue;
    const freshness = evaluateFreshness(bank);
    // EXPIRED tamamen elenir; FAILED bankada hâlâ ürün varsa STALE sayılır
    if (freshness === "EXPIRED") continue;
    const products = Array.isArray(bank.products) ? bank.products : [];
    if (!products.length) continue;
    const effectiveFreshness =
      freshness === "FAILED" ? ("STALE" as FreshnessStatus) : freshness;
    products.forEach((product, index) => {
      const p = product as Record<string, any>;
      if (p.isDemo) return;
      out.push({
        bankId: bank.id,
        bankName: bank.bankName,
        productId: `${bank.id}::${index}`,
        product: p,
        freshness: effectiveFreshness,
        sourceCheckedAt: bank.lastCheckedAt || new Date().toISOString(),
        sourceUrl:
          String(p._sourceUrl || "") ||
          (bank.urls?.[0] ?? `https://example.invalid/${bank.id}`),
      });
    });
  }

  const mem = input.memoryProducts ?? listMemoryProducts({ primaryOnly: true });
  for (const row of mem) {
    if (!isAllowedParticipationBank(row.bankId, row.bankName)) continue;
    if (row.isDemo) continue;
    const mapped = row.payload
      ? typeof row.payload === "string"
        ? JSON.parse(row.payload)
        : row.payload
      : row;
    // memory stores ExtractedFinancialRecord — map lightly if needed
    const product =
      mapped.urun_adi || mapped.terimler
        ? mapped
        : {
            urun_adi: mapped.productName || mapped.title || "Ürün",
            urun_turu:
              mapped.category === "housing_finance"
                ? "konut_finansmani"
                : mapped.category === "vehicle_finance"
                  ? "tasit_finansmani"
                  : mapped.category === "consumer_finance"
                    ? "ihtiyac_finansmani"
                    : mapped.category === "shopping_finance"
                      ? "alisveris_puani"
                      : "diger",
            musteri_segmenti: mapped.targetSegments || [],
            kampanya_bitis: mapped.campaignEnd,
            terimler: {
              kar_payi_orani: {
                deger: mapped.profitRate,
                periyot:
                  mapped.ratePeriod === "monthly"
                    ? "aylik"
                    : mapped.ratePeriod === "annual"
                      ? "yillik"
                      : "belirsiz",
              },
              vade_ay: {
                min: mapped.minTermMonths,
                max: mapped.maxTermMonths,
              },
              tutar: { min: mapped.minAmountTl, max: mapped.maxAmountTl },
              tahsis_ucreti: { deger: mapped.allocationFeeValue },
            },
            kanitlar: Object.fromEntries(
              (mapped.evidence || []).map((e: any) => [e.field, e.text]),
            ),
            _sourceUrl: mapped.sourceUrl,
            _campaignStatus: mapped.campaignStatus,
          };

    if (out.some((x) => x.productId === row.id || x.bankId === row.bankId && x.product.urun_adi === product.urun_adi)) {
      continue;
    }
    out.push({
      bankId: row.bankId,
      bankName:
        BANK_SOURCE_CONFIGS.find((b) => b.bankId === row.bankId)?.bankName ||
        row.bankId,
      productId: String(row.id || `${row.bankId}::mem`),
      product,
      freshness: "FRESH",
      sourceCheckedAt: row.sourceCheckedAt || new Date().toISOString(),
      sourceUrl: String(product._sourceUrl || row.sourceUrl || ""),
    });
  }

  return out;
}

function toExactMatch(
  c: ReturnType<typeof collectProductCandidates>[number],
  state: FinancingConversationState,
): FinancingMatch {
  const amount = state.requestedAmountTl!;
  const term = state.preferredTermMonths!;
  const { profitRate, ratePeriod } = readRate(c.product);
  const fee = readFee(c.product);
  const calc = calculateFinancingPayments({
    principalTl: amount,
    termMonths: term,
    profitRate,
    ratePeriod,
    allocationFeeTl: fee,
  });

  const segs = Array.isArray(c.product.musteri_segmenti)
    ? c.product.musteri_segmenti
    : [];

  return {
    bankId: c.bankId,
    bankName: c.bankName,
    productId: c.productId,
    productName: String(c.product.urun_adi || "Finansman"),
    financingType: state.financingType
      ? FINANCING_TYPE_LABEL[state.financingType]
      : String(c.product.urun_turu || ""),
    requestedAmountTl: amount,
    termMonths: term,
    profitRate,
    ratePeriod,
    estimatedMonthlyPaymentTl: calc.estimatedMonthlyPaymentTl,
    estimatedTotalPaymentTl: calc.estimatedTotalPaymentTl,
    allocationFeeTl: fee,
    customerCondition: segs.length ? segs.join(", ") : "Herkese açık",
    campaignEnd: c.product.kampanya_bitis
      ? String(c.product.kampanya_bitis)
      : null,
    freshnessStatus: freshnessUi(c.freshness),
    sourceCheckedAt: c.sourceCheckedAt,
    sourceUrl: c.sourceUrl,
    evidence: evidenceList(c.product),
    calculationAvailable: calc.calculationAvailable,
    calculationWarning: calc.calculationWarning,
  };
}

function computeFlexScore(parts: {
  amountDiffPct: number;
  termDiffMonths: number;
  customerOk: boolean;
  freshness: FreshnessStatus;
  hasEvidence: boolean;
}): FlexMatchScore {
  const amountDifferenceScore = Math.max(0, 40 - parts.amountDiffPct * 1.2);
  const termDifferenceScore = Math.max(0, 30 - parts.termDiffMonths * 2);
  const customerEligibilityScore = parts.customerOk ? 15 : 5;
  const freshnessScore =
    parts.freshness === "FRESH" ? 10 : parts.freshness === "STALE" ? 5 : 0;
  const evidenceScore = parts.hasEvidence ? 5 : 0;
  const totalScore =
    amountDifferenceScore +
    termDifferenceScore +
    customerEligibilityScore +
    freshnessScore +
    evidenceScore;
  return {
    totalScore: Math.round(totalScore * 10) / 10,
    amountDifferenceScore,
    termDifferenceScore,
    customerEligibilityScore,
    freshnessScore,
    evidenceScore,
  };
}

function sortExact(
  matches: FinancingMatch[],
  pref: FinancingConversationState["sortPreference"],
): FinancingMatch[] {
  const copy = [...matches];
  copy.sort((a, b) => {
    switch (pref) {
      case "lowest_total_payment": {
        const av = a.estimatedTotalPaymentTl;
        const bv = b.estimatedTotalPaymentTl;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av - bv;
      }
      case "longest_term":
        return b.termMonths - a.termMonths;
      case "lowest_fee": {
        const av = a.allocationFeeTl;
        const bv = b.allocationFeeTl;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return av - bv;
      }
      case "lowest_profit_rate":
      default: {
        const av = a.profitRate;
        const bv = b.profitRate;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        // Normalize roughly to monthly for sort
        const am =
          a.ratePeriod === "annual" ? av / 12 : av;
        const bm =
          b.ratePeriod === "annual" ? bv / 12 : bv;
        return am - bm;
      }
    }
  });
  return copy;
}

export function runFinancingMatchEngine(
  input: MatchEngineInput,
): MatchEngineResult {
  const state = input.state;
  const states = input.states ?? getLiveBankStates();
  const failedBanks = states
    .filter((s) => s.status === "hata" || s.error)
    .map((s) => s.bankName);

  const checkedBanks = states.filter((s) =>
    isAllowedParticipationBank(s.id, s.bankName),
  ).length;

  const dates = states
    .map((s) => s.lastCheckedAt)
    .filter(Boolean)
    .map((d) => Date.parse(String(d)))
    .filter(Number.isFinite) as number[];
  const dataAsOf =
    dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null;

  const freshStatuses = states.map((s) => evaluateFreshness(s));
  let overallFreshnessLabel = "Doğrulanamadı";
  if (freshStatuses.every((f) => f === "FRESH")) overallFreshnessLabel = "Güncel";
  else if (freshStatuses.some((f) => f === "FRESH" || f === "STALE")) {
    overallFreshnessLabel = freshStatuses.every(
      (f) => f === "FRESH" || f === "STALE",
    )
      ? "Kısmen güncel"
      : "Güncelleniyor";
  }

  if (
    state.requestedAmountTl == null ||
    state.preferredTermMonths == null ||
    !state.financingType
  ) {
    return {
      exactMatches: [],
      flexibleMatches: [],
      checkedBanks,
      failedBanks,
      dataAsOf,
      overallFreshnessLabel,
      hasVerifiedData: false,
    };
  }

  const candidates = collectProductCandidates({ ...input, allowDemoData: false });
  const hasVerifiedData = candidates.length > 0;

  const amount = state.requestedAmountTl;
  const term = state.preferredTermMonths;

  const exact: FinancingMatch[] = [];
  const flexible: FlexibleCampaignMatch[] = [];

  const maxFlexAmount = state.amountCapStrict
    ? amount
    : Math.round(amount * (1 + state.amountFlexibilityPercent / 100));
  const minFlexAmount = state.amountCapStrict
    ? amount
    : Math.round(amount * (1 - state.amountFlexibilityPercent / 100));
  const termLo = Math.max(1, term - state.termFlexibilityMonths);
  const termHi = term + state.termFlexibilityMonths;

  for (const c of candidates) {
    if (state.excludedBankIds.includes(c.bankId)) continue;
    if (
      state.selectedBankIds.length &&
      !state.selectedBankIds.includes(c.bankId)
    ) {
      continue;
    }

    const p = c.product;
    if (!productTypeMatches(String(p.urun_turu || ""), state.financingType)) {
      continue;
    }
    if (!campaignActive(p.kampanya_bitis, p._campaignStatus)) continue;

    const segs = Array.isArray(p.musteri_segmenti) ? p.musteri_segmenti : [];
    if (!segmentOk(segs, state.customerStatus)) continue;

    const { min: amin, max: amax } = readAmount(p);
    const { min: tmin, max: tmax } = readTerm(p);

    const exactAmount = amountOk(amount, amin, amax);
    const exactTerm = termOk(term, tmin, tmax);

    if (exactAmount && exactTerm) {
      const m = toExactMatch(c, state);
      if (state.hideUnknownFees && m.allocationFeeTl == null) continue;
      exact.push(m);
      continue;
    }

    // Flexible alternatives
    const currentDesc = `${moneyTr(amount)}, ${term} ay, ${
      FINANCING_TYPE_LABEL[state.financingType!]
    }`;

    // Amount flex
    if (!exactAmount && exactTerm && !state.amountCapStrict) {
      let offered: number | null = null;
      let change = "";
      if (amin != null && amin > amount && amin <= maxFlexAmount) {
        offered = amin;
        change = `Tutarı ${moneyTr(amount)}'den ${moneyTr(amin)}'ye çıkarırsanız`;
      } else if (amax != null && amax < amount && amax >= minFlexAmount) {
        offered = amax;
        change = `Tutarı ${moneyTr(amount)}'den ${moneyTr(amax)}'ye indirirseniz`;
      }
      if (offered != null) {
        const { profitRate } = readRate(p);
        const score = computeFlexScore({
          amountDiffPct: (Math.abs(offered - amount) / amount) * 100,
          termDiffMonths: 0,
          customerOk: true,
          freshness: c.freshness,
          hasEvidence: evidenceList(p).length > 0,
        });
        flexible.push({
          bankId: c.bankId,
          bankName: c.bankName,
          campaignId: c.productId,
          campaignName: String(p.urun_adi || "Kampanya"),
          flexibilityType: "amount",
          currentRequestDescription: currentDesc,
          requiredChangeDescription: change,
          offeredAmountTl: offered,
          termMonths: term,
          profitRate,
          opportunityDescription: "Tutarda küçük değişiklik",
          customerCondition: segs.length ? segs.join(", ") : null,
          campaignEnd: p.kampanya_bitis ? String(p.kampanya_bitis) : null,
          matchScore: score.totalScore,
          freshnessStatus: freshnessUi(c.freshness),
          sourceCheckedAt: c.sourceCheckedAt,
          sourceUrl: c.sourceUrl,
          evidence: evidenceList(p),
        });
      }
    }

    // Term flex
    if (exactAmount && !exactTerm) {
      let offeredTerm: number | null = null;
      let change = "";
      if (tmax != null && tmax < term && tmax >= termLo) {
        offeredTerm = tmax;
        change = `Vadeyi ${term} aydan ${tmax} aya indirirseniz`;
      } else if (tmin != null && tmin > term && tmin <= termHi) {
        offeredTerm = tmin;
        change = `Vadeyi ${term} aydan ${tmin} aya çıkarırsanız`;
      }
      if (offeredTerm != null) {
        const { profitRate } = readRate(p);
        const score = computeFlexScore({
          amountDiffPct: 0,
          termDiffMonths: Math.abs(offeredTerm - term),
          customerOk: true,
          freshness: c.freshness,
          hasEvidence: evidenceList(p).length > 0,
        });
        flexible.push({
          bankId: c.bankId,
          bankName: c.bankName,
          campaignId: c.productId,
          campaignName: String(p.urun_adi || "Kampanya"),
          flexibilityType: "term",
          currentRequestDescription: currentDesc,
          requiredChangeDescription: change,
          offeredAmountTl: amount,
          termMonths: offeredTerm,
          profitRate,
          opportunityDescription: "Vadede küçük değişiklik",
          customerCondition: segs.length ? segs.join(", ") : null,
          campaignEnd: p.kampanya_bitis ? String(p.kampanya_bitis) : null,
          matchScore: score.totalScore,
          freshnessStatus: freshnessUi(c.freshness),
          sourceCheckedAt: c.sourceCheckedAt,
          sourceUrl: c.sourceUrl,
          evidence: evidenceList(p),
        });
      }
    }

    // New customer opportunity
    if (
      exactAmount &&
      exactTerm &&
      state.customerStatus !== "new" &&
      segs.some((s) => /yeni/i.test(String(s)))
    ) {
      const { profitRate } = readRate(p);
      const score = computeFlexScore({
        amountDiffPct: 0,
        termDiffMonths: 0,
        customerOk: false,
        freshness: c.freshness,
        hasEvidence: evidenceList(p).length > 0,
      });
      flexible.push({
        bankId: c.bankId,
        bankName: c.bankName,
        campaignId: `${c.productId}::new`,
        campaignName: String(p.urun_adi || "Yeni müşteri"),
        flexibilityType: "new_customer",
        currentRequestDescription: currentDesc,
        requiredChangeDescription: "Yeni müşteri olarak başvurursanız",
        offeredAmountTl: amount,
        termMonths: term,
        profitRate,
        opportunityDescription: "Yeni müşteri fırsatı",
        customerCondition: segs.join(", "),
        campaignEnd: p.kampanya_bitis ? String(p.kampanya_bitis) : null,
        matchScore: score.totalScore,
        freshnessStatus: freshnessUi(c.freshness),
        sourceCheckedAt: c.sourceCheckedAt,
        sourceUrl: c.sourceUrl,
        evidence: evidenceList(p),
      });
    }
  }

  // Memory campaigns for new customer / channel
  const camps =
    input.memoryCampaigns ?? listMemoryCampaigns({ activeOnly: true });
  for (const camp of camps) {
    if (!isAllowedParticipationBank(camp.bankId)) continue;
    if (camp.campaignStatus === "expired") continue;
    if (!campaignActive(camp.campaignEnd, camp.campaignStatus)) continue;
    const segs: string[] = camp.targetSegments || [];
    const isNew = segs.some((s) => /yeni/i.test(String(s)));
    if (state.customerStatus === "new" || !isNew) {
      if (!(state.intent === "campaign_search" && isNew)) {
        if (!isNew) continue;
        if (state.customerStatus === "new") {
          // already eligible — skip flex
          continue;
        }
      }
    }
    if (state.amountCapStrict && camp.minAmountTl != null && camp.minAmountTl > amount) {
      continue;
    }
    const bankName =
      BANK_SOURCE_CONFIGS.find((b) => b.bankId === camp.bankId)?.bankName ||
      camp.bankId;
    const offered = camp.minAmountTl ?? amount;
    if (!state.amountCapStrict && offered > maxFlexAmount) continue;

    const score = computeFlexScore({
      amountDiffPct:
        amount > 0 ? (Math.abs(offered - amount) / amount) * 100 : 0,
      termDiffMonths: 0,
      customerOk: isNew,
      freshness: "FRESH",
      hasEvidence: (camp.evidence || []).length > 0,
    });

    flexible.push({
      bankId: camp.bankId,
      bankName,
      campaignId: String(camp.id),
      campaignName: camp.title || camp.productName || "Kampanya",
      flexibilityType: isNew ? "new_customer" : "nearby_product",
      currentRequestDescription: `${moneyTr(amount)}, ${term} ay`,
      requiredChangeDescription: isNew
        ? "Yeni müşteri olarak başvurursanız"
        : "Yakın ürün alternatifini değerlendirirseniz",
      offeredAmountTl: offered,
      termMonths: camp.maxTermMonths ?? term,
      profitRate: camp.profitRate ?? null,
      opportunityDescription: isNew
        ? "Yeni müşteri fırsatı"
        : "Yakın ürün alternatifi",
      customerCondition: segs.join(", ") || null,
      campaignEnd: camp.campaignEnd || null,
      matchScore: score.totalScore,
      freshnessStatus: "Güncel",
      sourceCheckedAt: camp.sourceCheckedAt || new Date().toISOString(),
      sourceUrl: camp.sourceUrl || "",
      evidence: (camp.evidence || []).map((e: any) => e.text).filter(Boolean),
    });
  }

  // One row per bank for exact (best by sort key)
  const byBank = new Map<string, FinancingMatch>();
  for (const m of sortExact(exact, state.sortPreference)) {
    if (!byBank.has(m.bankId)) byBank.set(m.bankId, m);
  }
  const exactMatches = [...byBank.values()];

  flexible.sort((a, b) => b.matchScore - a.matchScore);
  const flexibleMatches = flexible.slice(0, 12);

  return {
    exactMatches,
    flexibleMatches,
    checkedBanks: checkedBanks || ALLOWED_BANK_IDS.size,
    failedBanks,
    dataAsOf,
    overallFreshnessLabel,
    hasVerifiedData,
  };
}

export { CONVENTIONAL_NAME_RE, ALLOWED_BANK_IDS };
