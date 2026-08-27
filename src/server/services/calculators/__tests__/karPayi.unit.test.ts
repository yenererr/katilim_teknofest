import { describe, expect, it, beforeEach } from "vitest";
import { hesaplaAlbarakaKarPayi } from "../albarakaKarPayiCalculator";
import { karsilastirKarPayi } from "../karPayiCompare";
import {
  parseKarPayiNumber,
  parseWithholdingPercent,
} from "../karPayiShared";
import { hesaplaKuveytKarPayi } from "../kuveytKarPayiCalculator";
import { hesaplaVakifKarPayi } from "../vakifKarPayiCalculator";
import { resetVakifSessionForTests } from "../vakifKatilimCalculator";

describe("kar payı sayı ayrıştırma", () => {
  it("TR ve noktalı yüzde formatlarını çözer", () => {
    expect(parseKarPayiNumber("2.675,16 TL")).toBe(2675.16);
    expect(parseKarPayiNumber("%31,50")).toBe(31.5);
    expect(parseKarPayiNumber("% 32.185445")).toBeCloseTo(32.185445);
    expect(parseWithholdingPercent("% 0,175")).toBe(17.5);
    expect(parseWithholdingPercent("%17,5")).toBe(17.5);
  });
});

describe("Vakıf kâr payı", () => {
  beforeEach(() => resetVakifSessionForTests());

  it("GrossAmountCalculationJson yanıtını sayıya çevirir", async () => {
    const impl = async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/tr") && !u.includes("plugins")) {
        return {
          ok: true,
          status: 200,
          headers: {
            getSetCookie: () => ["ASP.NET_SessionId=abc"],
            get: () => "ASP.NET_SessionId=abc",
          },
          text: async () =>
            `<script>langId: 'bf2689d9-071e-4a20-9450-b1dbdd39778f'</script><input name="__RequestVerificationToken" value="TOKEN" />`,
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          grossProfit: "2.675,16 TL",
          netProfit: "2.207,01 TL",
          totalAmount: "2.207,01 TL",
          accountName: "Gümüş",
          grossRate: "%31,50",
          netRate: "%25,99",
          errorMessage: "",
        }),
      } as unknown as Response;
    };

    const s = await hesaplaVakifKarPayi(
      { amount: 100000, term: "1m" },
      impl as typeof fetch,
    );
    expect(s.available).toBe(true);
    expect(s.grossProfit).toBe(2675.16);
    expect(s.netProfit).toBe(2207.01);
    expect(s.totalAmount).toBe(102207.01);
    expect(s.grossRatePercent).toBe(31.5);
    expect(s.accountName).toBe("Gümüş");
  });
});

describe("Albaraka kâr payı", () => {
  it("getProfitShareCalculate JSON gövdesini okur", async () => {
    const impl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          Result: true,
          Data: {
            GrossProfit: "8.024,32 TRY",
            GrossRate: "% 32.185445",
            NetProfit: "6.620,06 TRY",
            InvestedAmountPlusNetProfit: "106.620,06 TRY",
            NetRate: "% 26.552992",
            IncomeTax: "% 0,175",
          },
        }),
      }) as unknown as Response;

    const s = await hesaplaAlbarakaKarPayi(
      { amount: 100000, term: "3m" },
      impl as typeof fetch,
    );
    expect(s.netProfit).toBe(6620.06);
    expect(s.grossRatePercent).toBeCloseTo(32.185445);
    expect(s.withholdingTaxPercent).toBe(17.5);
  });
});

describe("Kuveyt kâr payı", () => {
  it("ProfitSharingCalculator sayısal alanlarını okur", async () => {
    const impl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          SegmentName: "Gümüş",
          ProfitShareRatio: 92,
          GrossProfitShare: 2675.16,
          NetProfitShare: 2207.01,
          GrossProfitShareYearly: 31.14,
          NetProfitShareYearly: 25.69,
        }),
      }) as unknown as Response;

    const s = await hesaplaKuveytKarPayi(
      { amount: 100000, term: "1m" },
      impl as typeof fetch,
    );
    expect(s.netProfit).toBe(2207.01);
    expect(s.shareCustomerPercent).toBe(92);
    expect(s.netRatePercent).toBe(25.69);
  });
});

describe("karşılaştırma", () => {
  it("başarısız bankayı available:false bırakır, mock oran uydurmaz", async () => {
    const impl = async (url: string | URL) => {
      const u = String(url);
      if (u.includes("kuveytturk")) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      if (u.includes("albaraka")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            Result: true,
            Data: {
              GrossProfit: "1.000,00 TRY",
              NetProfit: "800,00 TRY",
              InvestedAmountPlusNetProfit: "100.800,00 TRY",
              GrossRate: "% 10",
              NetRate: "% 8",
              IncomeTax: "% 17,5",
            },
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: {
          getSetCookie: () => ["ASP.NET_SessionId=abc"],
          get: () => "ASP.NET_SessionId=abc",
        },
        text: async () =>
          `<script>langId: 'bf2689d9-071e-4a20-9450-b1dbdd39778f'</script><input name="__RequestVerificationToken" value="TOKEN" />`,
        json: async () => ({
          grossProfit: "900,00 TL",
          netProfit: "700,00 TL",
          accountName: "Klasik",
          grossRate: "%9",
          netRate: "%7",
          errorMessage: "",
        }),
      } as unknown as Response;
    };

    const rows = await karsilastirKarPayi(
      { amount: 100000, term: "1m" },
      impl as typeof fetch,
    );
    expect(rows).toHaveLength(3);
    const kuveyt = rows.find((r) => r.bankId === "kuveyt-turk");
    expect(kuveyt?.available).toBe(false);
    expect(kuveyt?.netProfit).toBeNull();
    expect(rows[0]?.available).toBe(true);
  });
});
