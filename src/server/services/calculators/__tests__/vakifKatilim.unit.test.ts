import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  VAKIF_FINANSMAN_KODLARI,
  hesaplaVakifKatilim,
  parseTrNumber,
  resetVakifSessionForTests,
} from "../vakifKatilimCalculator";

const HOME_HTML = `
  <html><head><script>var config = { langId: 'bf2689d9-071e-4a20-9450-b1dbdd39778f', language: 'tr' };</script></head>
  <body><input name="__RequestVerificationToken" type="hidden" value="TOKEN-123" /></body></html>
`;

function makeFetch(calcJson: Record<string, unknown>) {
  const cagrilar: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    cagrilar.push({ url: u, init });
    if (u.endsWith("/tr")) {
      return {
        ok: true,
        status: 200,
        headers: {
          getSetCookie: () => ["ASP.NET_SessionId=abc; path=/; HttpOnly"],
          get: () => "ASP.NET_SessionId=abc; path=/",
        },
        text: async () => HOME_HTML,
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => calcJson,
    } as unknown as Response;
  });
  return { impl: impl as unknown as typeof fetch, cagrilar };
}

describe("Türkçe sayı ayrıştırma", () => {
  it("binlik ayıracı ve ondalık virgülü doğru çözer", () => {
    expect(parseTrNumber("8.680,05 TL")).toBe(8680.05);
    expect(parseTrNumber("156.240,94 TL")).toBe(156240.94);
    expect(parseTrNumber("3,99")).toBe(3.99);
    expect(parseTrNumber("0,00 TL")).toBe(0);
  });

  it("boş ve geçersiz değerlerde null döner", () => {
    expect(parseTrNumber("")).toBeNull();
    expect(parseTrNumber("  ")).toBeNull();
    expect(parseTrNumber(undefined)).toBeNull();
    expect(parseTrNumber(123 as unknown as string)).toBeNull();
  });
});

describe("Vakıf Katılım hesaplama", () => {
  beforeEach(() => resetVakifSessionForTests());

  it("banka yanıtını sayısal alanlara çevirir", async () => {
    const { impl } = makeFetch({
      installmentAmount: "8.680,05 TL",
      totalAmount: "156.240,94 TL",
      profitRate: "3,99",
      appraisementFee: "0,00 TL",
      mortgageReleaseFee: "0,00 TL",
      errorMessage: null,
      isErrorFriendly: false,
      installmenLabelText: "Taksit Tutarı",
    });

    const sonuc = await hesaplaVakifKatilim(
      { financingType: "ihtiyac_finansmani", amountTl: 100000, termMonths: 18 },
      impl,
    );

    expect(sonuc.profitRatePercent).toBe(3.99);
    expect(sonuc.monthlyInstallmentTl).toBe(8680.05);
    expect(sonuc.totalPaymentTl).toBe(156240.94);
    expect(sonuc.bankId).toBe("vakif-katilim");
  });

  it("token ve çerezi ana sayfadan alıp isteğe ekler", async () => {
    const { impl, cagrilar } = makeFetch({
      installmentAmount: "1,00 TL",
      totalAmount: "1,00 TL",
      profitRate: "1,00",
    });

    await hesaplaVakifKatilim(
      { financingType: "konut_finansmani", amountTl: 500000, termMonths: 36 },
      impl,
    );

    const calc = cagrilar[1];
    expect(calc.url).toContain("financingType=K");
    expect(calc.url).toContain("amount=500000");
    expect(calc.url).toContain("numberOfInstallments=36");
    expect(calc.url).toContain("calculateType=1");
    expect(calc.url).toContain("langId=bf2689d9-071e-4a20-9450-b1dbdd39778f");
    expect(String(calc.init?.body)).toContain("TOKEN-123");
    expect(
      (calc.init?.headers as Record<string, string>).Cookie,
    ).toContain("ASP.NET_SessionId=abc");
  });

  it("özel kâr oranı ve taksitten hesap parametrelerini iletir", async () => {
    const { impl, cagrilar } = makeFetch({
      installmentAmount: "100.000,00 TL",
      totalAmount: "120.000,00 TL",
      profitRate: "2,50",
    });

    await hesaplaVakifKatilim(
      {
        financingType: "ihtiyac_finansmani",
        amountTl: 5000,
        termMonths: 12,
        profitRatePercent: 2.5,
        calculateType: "2",
      },
      impl,
    );

    const calc = cagrilar[1];
    expect(calc.url).toContain("profitRate=2%2C5");
    expect(calc.url).toContain("calculateType=2");
    expect(calc.url).toContain("amount=5000");
  });

  it("banka hata döndürdüğünde istisna fırlatır", async () => {
    const { impl } = makeFetch({
      isErrorFriendly: true,
      errorMessage: "Tutar limit dışında.",
    });

    await expect(
      hesaplaVakifKatilim(
        { financingType: "ihtiyac_finansmani", amountTl: 1, termMonths: 3 },
        impl,
      ),
    ).rejects.toThrow(/limit dışında/);
  });

  it("finansman türü kodları bankanın beklediği değerlerdir", () => {
    expect(VAKIF_FINANSMAN_KODLARI.ihtiyac_finansmani).toBe("IF");
    expect(VAKIF_FINANSMAN_KODLARI.konut_finansmani).toBe("K");
    expect(VAKIF_FINANSMAN_KODLARI.tasit_finansmani).toBe("BO");
  });
});

describe("banka boş yanıt verdiğinde", () => {
  beforeEach(() => resetVakifSessionForTests());

  it("sessizce boş sonuç değil, açıklayıcı kısıt döndürür", async () => {
    const { impl } = makeFetch({
      installmentAmount: "",
      totalAmount: "",
      profitRate: "",
      errorMessage: null,
      isErrorFriendly: false,
    });

    await expect(
      hesaplaVakifKatilim(
        {
          financingType: "arsa_finansmani",
          amountTl: 1500000,
          termMonths: 120,
        },
        impl,
      ),
    ).rejects.toThrow(/çevrim içi hesaplama sunmuyor/);
  });
});
