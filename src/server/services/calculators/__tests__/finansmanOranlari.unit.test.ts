import { beforeEach, describe, expect, it } from "vitest";
import {
  getAlbarakaFinansmanOrani,
  parseAlbarakaFinansmanUrunleri,
  resetAlbarakaFinansmanCacheForTests,
} from "../albarakaFinansmanCalculator";
import {
  getTurkiyeFinansFinansmanOrani,
  parseFinansorYaniti,
  resetTfFinansmanCacheForTests,
} from "../turkiyeFinansFinansmanCalculator";

/**
 * Ağa çıkmaz: bankaların gerçek yanıtlarından kısaltılmış örnekler kullanılır.
 * Sayfa/uç yapısı değişirse ayrıştırıcının sessizce boş dönmesi burada yakalanır.
 */

function albarakaOption(veri: Record<string, unknown>): string {
  return `<option value='${JSON.stringify(veri).replace(/"/g, "&quot;")}'>x</option>`;
}

const ALBARAKA_HTML = `
<select class="select2" id="slcfinansmanTuru">
  <optgroup label="KONUT">
  ${albarakaOption({
    ProductCode: "KONTKRD",
    CampaignName: "İLK EVİM KONUT FİNANSMANI",
    profitRate: 3.04,
    MaturityMinValue: 1,
    MaturityMaxValue: 120,
    AmountMaxValue: 9999999.0,
  })}
  </optgroup>
  <optgroup label="İHTİYAÇ">
  ${albarakaOption({
    ProductCode: "IHTKRED",
    CampaignName: "PRATİK FİNANSMAN KART",
    profitRate: 3.95,
    MaturityMinValue: 1,
    MaturityMaxValue: 34,
    AmountMaxValue: 150000.0,
  })}
  ${albarakaOption({
    ProductCode: "IHTKRED",
    CampaignName: "ENGELSİZ HAYAT FİNANSMANI",
    profitRate: 4.0,
    MaturityMinValue: 1,
    MaturityMaxValue: 36,
    AmountMaxValue: 9999999.0,
  })}
  </optgroup>
</select>`;

function albarakaFetch(): typeof fetch {
  return (async () =>
    new Response(ALBARAKA_HTML, { status: 200 })) as unknown as typeof fetch;
}

describe("Albaraka finansman oranları", () => {
  beforeEach(() => resetAlbarakaFinansmanCacheForTests());

  it("sayfadaki ürün JSON'unu ayrıştırır", () => {
    const urunler = parseAlbarakaFinansmanUrunleri(ALBARAKA_HTML);
    expect(urunler).toHaveLength(3);
    expect(urunler[0]).toMatchObject({
      productCode: "KONTKRD",
      profitRatePercent: 3.04,
      maxTermMonths: 120,
    });
  });

  it("konut finansmanında ilan oranını döndürür", async () => {
    const r = await getAlbarakaFinansmanOrani(
      "konut_finansmani",
      120,
      1_500_000,
      albarakaFetch(),
    );
    expect(r?.profitRatePercent).toBe(3.04);
    expect(r?.maxTermMonths).toBe(120);
  });

  it("tutar sınırını aşan ürünün oranını kullanmaz", async () => {
    // Pratik Finansman Kart daha ucuz (%3,95) ama azami 150.000 TL.
    const r = await getAlbarakaFinansmanOrani(
      "ihtiyac_finansmani",
      24,
      500_000,
      albarakaFetch(),
    );
    expect(r?.productName).toBe("ENGELSİZ HAYAT FİNANSMANI");
    expect(r?.profitRatePercent).toBe(4.0);
  });

  it("tutar sınırına uyan ürünlerde en düşük oranı seçer", async () => {
    const r = await getAlbarakaFinansmanOrani(
      "ihtiyac_finansmani",
      24,
      100_000,
      albarakaFetch(),
    );
    expect(r?.profitRatePercent).toBe(3.95);
  });

  it("desteklenmeyen türde null döner", async () => {
    expect(
      await getAlbarakaFinansmanOrani("katilim_fonu", 12, 1000, albarakaFetch()),
    ).toBeNull();
  });

  it("sayfa yapısı değişirse boş liste döner — uydurma oran üretmez", () => {
    expect(parseAlbarakaFinansmanUrunleri("<html><body>yeni tasarım</body></html>")).toEqual(
      [],
    );
  });
});

const TF_JSON = {
  GetFinansorItemsResult: {
    Data: {
      KKDF_BSMV: { BSMV: "0.05", KKDF: "0.15" },
      FinansorList: [
        {
          FinansorPackage: { ID: 1, Title: "Standart Finansör", Rate: 0.0175 },
          MaxValue: 40000,
          MonthlyRates: [
            { Month: 12, Rate: "0.0262" },
            { Month: 24, Rate: "0.0266" },
            { Month: 36, Rate: "0.0267" },
          ],
        },
        {
          FinansorPackage: { ID: 2, Title: "Sağlık Finansörü", Rate: 0.0175 },
          MaxValue: 20000,
          MonthlyRates: [{ Month: 12, Rate: "0.0250" }],
        },
      ],
    },
  },
};

function tfFetch(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(TF_JSON), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("Türkiye Finans finansman oranları", () => {
  beforeEach(() => resetTfFinansmanCacheForTests());

  it("vadeye göre oran listesini ayrıştırır", () => {
    const paketler = parseFinansorYaniti(TF_JSON);
    expect(paketler).toHaveLength(2);
    // 0.0266 * 100 kayan nokta artığı bırakmamalı.
    expect(paketler[0].ratesByTerm[1]).toEqual({ months: 24, ratePercent: 2.66 });
  });

  it("istenen vadenin oranını döndürür", async () => {
    const r = await getTurkiyeFinansFinansmanOrani(
      "ihtiyac_finansmani",
      24,
      tfFetch(),
    );
    expect(r?.profitRatePercent).toBe(2.66);
    expect(r?.matchedTermMonths).toBe(24);
  });

  it("vade listede yoksa en yakınını kullanır ve bunu bildirir", async () => {
    const r = await getTurkiyeFinansFinansmanOrani(
      "ihtiyac_finansmani",
      30,
      tfFetch(),
    );
    expect(r?.matchedTermMonths).toBe(36);
  });

  it("konut/taşıtta null döner — banka bu oranı yayımlamıyor", async () => {
    expect(
      await getTurkiyeFinansFinansmanOrani("konut_finansmani", 120, tfFetch()),
    ).toBeNull();
    expect(
      await getTurkiyeFinansFinansmanOrani("tasit_finansmani", 36, tfFetch()),
    ).toBeNull();
  });

  it("uç yapısı değişirse boş liste döner", () => {
    expect(parseFinansorYaniti({ beklenmeyen: true })).toEqual([]);
  });
});
