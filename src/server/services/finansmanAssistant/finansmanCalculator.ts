/**
 * Deterministik finansman hesaplamaları — LLM kullanılmaz.
 */

export type PaymentCalcInput = {
  principalTl: number;
  termMonths: number;
  /** Ondalık oran (ör. 0.029 = %2,9) */
  profitRate: number | null;
  ratePeriod: "monthly" | "annual" | "unknown" | null;
  allocationFeeTl: number | null;
  otherFeesTl?: number | null;
};

export type PaymentCalcResult = {
  estimatedMonthlyPaymentTl: number | null;
  estimatedTotalPaymentTl: number | null;
  allocationFeeTl: number | null;
  otherFeesTl: number | null;
  totalDisclosedCostTl: number | null;
  calculationAvailable: boolean;
  calculationWarning: string | null;
};

/**
 * Eşit taksit varsayımıyla aylık ödeme.
 * Formül veya parametre eksikse sayı üretmez.
 */
export function calculateFinancingPayments(
  input: PaymentCalcInput,
): PaymentCalcResult {
  const fee = input.allocationFeeTl;
  const other = input.otherFeesTl ?? null;

  if (
    input.profitRate == null ||
    !Number.isFinite(input.profitRate) ||
    input.profitRate < 0 ||
    input.ratePeriod == null ||
    input.ratePeriod === "unknown" ||
    !Number.isFinite(input.principalTl) ||
    input.principalTl <= 0 ||
    !Number.isFinite(input.termMonths) ||
    input.termMonths <= 0
  ) {
    return {
      estimatedMonthlyPaymentTl: null,
      estimatedTotalPaymentTl: null,
      allocationFeeTl: fee,
      otherFeesTl: other,
      totalDisclosedCostTl: null,
      calculationAvailable: false,
      calculationWarning:
        "Bankanın resmî kaynağında hesaplama için yeterli bilgi bulunmuyor.",
    };
  }

  const monthlyRate =
    input.ratePeriod === "annual"
      ? input.profitRate / 12
      : input.profitRate;

  const P = input.principalTl;
  const n = input.termMonths;
  const r = monthlyRate;

  let monthly: number;
  if (r === 0) {
    monthly = P / n;
  } else {
    const factor = Math.pow(1 + r, n);
    monthly = (P * r * factor) / (factor - 1);
  }

  if (!Number.isFinite(monthly) || monthly <= 0) {
    return {
      estimatedMonthlyPaymentTl: null,
      estimatedTotalPaymentTl: null,
      allocationFeeTl: fee,
      otherFeesTl: other,
      totalDisclosedCostTl: null,
      calculationAvailable: false,
      calculationWarning:
        "Bankanın resmî kaynağında hesaplama için yeterli bilgi bulunmuyor.",
    };
  }

  const total = monthly * n;
  const disclosedParts = [total];
  if (fee != null && Number.isFinite(fee)) disclosedParts.push(fee);
  if (other != null && Number.isFinite(other)) disclosedParts.push(other);

  return {
    estimatedMonthlyPaymentTl: Math.round(monthly * 100) / 100,
    estimatedTotalPaymentTl: Math.round(total * 100) / 100,
    allocationFeeTl: fee,
    otherFeesTl: other,
    totalDisclosedCostTl:
      Math.round(disclosedParts.reduce((a, b) => a + b, 0) * 100) / 100,
    calculationAvailable: true,
    calculationWarning: null,
  };
}
