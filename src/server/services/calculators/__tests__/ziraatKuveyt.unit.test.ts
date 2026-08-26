import { describe, expect, it, vi } from "vitest";
import {
  hesaplaZiraatKatilim,
  normalizeZiraatRatioPercent,
  parseZiraatTrNumber,
  getZiraatUrunMeta,
} from "../ziraatKatilimCalculator";
import { hesaplaKuveytTurk } from "../kuveytTurkCalculator";

describe("Ziraat sayı ayrıştırma", () => {
  it("TRY özet satırını çözer", () => {
    expect(parseZiraatTrNumber("11.401,85")).toBe(11401.85);
    expect(parseZiraatTrNumber("3,99")).toBe(3.99);
  });

  it("API ratio 499 → %4,99 ölçeğini düzeltir", () => {
    expect(normalizeZiraatRatioPercent(499)).toBe(4.99);
    expect(normalizeZiraatRatioPercent(349)).toBe(3.49);
    expect(normalizeZiraatRatioPercent(3.99)).toBe(3.99);
    expect(normalizeZiraatRatioPercent(4.99)).toBe(4.99);
    expect(normalizeZiraatRatioPercent(null)).toBeNull();
  });
});

describe("Ziraat get-vade meta", () => {
  it("tamsayı ratio alanını yüzdeye çevirir", async () => {
    const impl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        status: true,
        data: {
          ratio: "349",
          range: [1, 12],
          minimum_amount: 1,
          maximum_amount: 500000,
        },
      }),
    })) as unknown as typeof fetch;

    const meta = await getZiraatUrunMeta(
      "ihtiyac_finansmani",
      12,
      impl,
      100000,
    );
    expect(meta.ratio).toBe(3.49);
  });
});

describe("Ziraat Katılım hesaplama", () => {
  it("Drupal AJAX HTML özetini sayıya çevirir", async () => {
    const html = `
      <div class="payment-schedule">
        <div>100.000,00 TRY</div>
        <div>11.401,85 TRY</div>
        <div>12 Ay</div>
        <div>%3,99</div>
        <div>136.822,20 TRY</div>
      </div>`;
    const impl = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("get-vade")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            data: {
              ratio: "3.99",
              range: [1, 12, 24],
              minimum_amount: 1,
              maximum_amount: 249999,
            },
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            command: "insert",
            selector: "#odeme-plani",
            data: html,
          },
        ],
      } as unknown as Response;
    });

    const sonuc = await hesaplaZiraatKatilim(
      {
        financingType: "ihtiyac_finansmani",
        amountTl: 100000,
        termMonths: 12,
        profitRatePercent: 3.99,
      },
      impl as unknown as typeof fetch,
    );

    expect(sonuc.bankId).toBe("ziraat-katilim");
    expect(sonuc.profitRatePercent).toBe(3.99);
    expect(sonuc.monthlyInstallmentTl).toBe(11401.85);
    expect(sonuc.totalPaymentTl).toBe(136822.2);
  });
});

describe("Kuveyt Türk hesaplama", () => {
  it("Meta alanlarını sayıya çevirir", async () => {
    const impl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Meta: {
          ProfitRate: 4.01,
          InstallmentPayment: 11163.22,
          TotalAmount: 133958.8,
          SurveyFee: 0,
          HypothecFee: 0,
          AllocationAmount: 0,
        },
      }),
    })) as unknown as typeof fetch;

    const sonuc = await hesaplaKuveytTurk(
      {
        financingType: "ihtiyac_finansmani",
        amountTl: 100000,
        termMonths: 12,
      },
      impl,
    );

    expect(sonuc.bankId).toBe("kuveyt-turk");
    expect(sonuc.profitRatePercent).toBe(4.01);
    expect(sonuc.monthlyInstallmentTl).toBe(11163.22);
  });
});
