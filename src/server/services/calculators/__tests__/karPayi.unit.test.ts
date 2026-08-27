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

describe("Ziraat kâr payı", () => {
  it("Drupal AJAX insert komutlarından net/brüt okur", async () => {
    const impl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [
          {
            command: "insert",
            method: "html",
            selector: ".kar-payi-net-gelir",
            data: "1.961,57",
          },
          {
            command: "insert",
            method: "html",
            selector: ".kar-payi-brut-gelir",
            data: "2.377,67",
          },
          {
            command: "insert",
            method: "html",
            selector: ".kar-payi-net-oran",
            data: "23,10",
          },
          {
            command: "insert",
            method: "html",
            selector: ".kar-payi-brut-oran",
            data: "28,00",
          },
        ],
      }) as unknown as Response;

    const { hesaplaZiraatKarPayi } = await import("../ziraatKarPayiCalculator");
    const s = await hesaplaZiraatKarPayi(
      { amount: 100000, term: "1m" },
      impl as typeof fetch,
    );
    expect(s.available).toBe(true);
    expect(s.netProfit).toBe(1961.57);
    expect(s.grossProfit).toBe(2377.67);
    expect(s.netRatePercent).toBe(23.1);
    expect(s.grossRatePercent).toBe(28);
    expect(s.totalAmount).toBe(101961.57);
  });
});

describe("Dünya kâr payı", () => {
  it("DividendEstimatedProfit SUCCESS gövdesini okur", async () => {
    const { hesaplaDunyaKarPayi } = await import("../dunyaKarPayiCalculator");
    const impl = async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("DividendEstimatedProfit")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: "SUCCESS",
            grossProfitAmount: 2822.27,
            netProfitAmount: 2328.37,
            grossProfitRate: 33.23,
            netProfitRate: 27.41,
            unitValuePoolDefinition: "Standart",
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: {
          getSetCookie: () => [
            ".AspNetCore.Antiforgery.x=abc",
          ],
          get: () => ".AspNetCore.Antiforgery.x=abc",
        },
        text: async () =>
          `<input name="__RequestVerificationToken" value="TOKEN" />`,
      } as unknown as Response;
    };

    const s = await hesaplaDunyaKarPayi(
      { amount: 100000, term: "1m" },
      impl as typeof fetch,
    );
    expect(s.available).toBe(true);
    expect(s.netProfit).toBe(2328.37);
    expect(s.grossProfit).toBe(2822.27);
    expect(s.grossRatePercent).toBe(33.23);
    expect(s.accountName).toContain("Standart");
  });
});

describe("Hayat Finans kâr payı", () => {
  it("calculateprofitsharerate JSON gövdesini okur", async () => {
    const { hesaplaHayatKarPayi } = await import("../hayatKarPayiCalculator");
    const impl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          isSuccessful: true,
          data: {
            grossProfitShare: 3208.347961,
            netProfitShare: 2646.887068,
            grossProfitShareYearly: 37.7757,
            netProfitShareYearly: 31.164961,
          },
        }),
      }) as unknown as Response;

    const s = await hesaplaHayatKarPayi(
      { amount: 100000, term: "1m" },
      impl as typeof fetch,
    );
    expect(s.available).toBe(true);
    expect(s.netProfit).toBeCloseTo(2646.887068);
    expect(s.grossRatePercent).toBeCloseTo(37.7757);
    expect(s.totalAmount).toBeCloseTo(102646.887068);
  });
});

describe("Türkiye Finans kâr payı", () => {
  it("GetKarPayiHesaplama oranlarından bankanın formülüyle hesaplar", async () => {
    const { hesaplaTurkiyeFinansKarPayi } = await import(
      "../turkiyeFinansKarPayiCalculator"
    );
    const impl = async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          GetKarPayiHesaplamaResult: {
            Result: 1,
            Data: [
              {
                AnnuallyGrossRatio: "28.63272860",
                ProfitRate: "98/2",
                MinimumDueDay: 32,
                MaximumDueDay: 91,
                MinimumAmount: 250,
                MaximumAmount: 100000000,
                CurrencyTypeId: 0,
              },
            ],
          },
        }),
      }) as unknown as Response;

    const s = await hesaplaTurkiyeFinansKarPayi(
      { amount: 100000, term: "1m" },
      impl as typeof fetch,
    );
    expect(s.available).toBe(true);
    expect(s.grossProfit).toBeCloseTo(2510.27, 1);
    expect(s.netProfit).toBeCloseTo(2070.97, 1);
    expect(s.withholdingTaxPercent).toBe(17.5);
    expect(s.shareCustomerPercent).toBe(98);
  });
});

describe("karşılaştırma", () => {
  it("başarısız bankayı available:false bırakır, mock oran uydurmaz", async () => {
    const impl = async (url: string | URL) => {
      const u = String(url);
      if (
        u.includes("kuveytturk") ||
        u.includes("ziraatkatilim") ||
        u.includes("dunyakatilim") ||
        u.includes("hayatfinans") ||
        u.includes("turkiyefinans")
      ) {
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
    expect(rows).toHaveLength(7);
    const kuveyt = rows.find((r) => r.bankId === "kuveyt-turk");
    expect(kuveyt?.available).toBe(false);
    expect(kuveyt?.netProfit).toBeNull();
    expect(rows[0]?.available).toBe(true);
  });
});
