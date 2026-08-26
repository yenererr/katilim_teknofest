import { describe, expect, it } from "vitest";
import { bicimleOdemePlani, hesaplaOdemePlani } from "../odemePlani";

describe("ödeme planı", () => {
  it("örnek ihtiyaç finansmanı satırlarını üretir (100 bin, %3, 18 ay)", () => {
    const d = hesaplaOdemePlani({
      amountTl: 100_000,
      termMonths: 18,
      profitRatePercent: 3,
      financingType: "ihtiyac_finansmani",
    });

    expect(d.taksitTutari).toBe(7835.26);
    expect(d.finansmanTahsisUcreti).toBe(575);
    expect(d.odenecekToplamTutar).toBeCloseTo(141034.75, 1);
    expect(d.aylikMaliyetOrani).toBeCloseTo(3.9708, 3);
    expect(d.efektifYillikKarOrani).toBe(36);
    expect(d.rows).toHaveLength(18);

    const first = d.rows[0];
    expect(first.karTutari).toBe(3000);
    expect(first.kkdfTutari).toBe(450);
    expect(first.bsmvTutari).toBe(450);
    expect(first.anaPara).toBe(3935.26);
    expect(first.kalanAnaPara).toBe(96064.74);

    const last = d.rows[17];
    expect(last.taksitTutari).toBe(7835.33);
    expect(last.kalanAnaPara).toBe(0);
    expect(d.uyari).toMatch(/125\.000 TL/);
  });

  it("bicimleOdemePlani özet ve tablo başlıklarını üretir", () => {
    const d = hesaplaOdemePlani({
      amountTl: 100_000,
      termMonths: 18,
      profitRatePercent: 3,
      financingType: "ihtiyac_finansmani",
    });
    const b = bicimleOdemePlani(d);
    expect(b.baslik).toBe("Detaylı Bilgi ve Ödeme Planı");
    expect(b.ozet.some((o) => o.label === "Finansman Tutarı")).toBe(true);
    expect(b.tableHead).toContain("KKDF");
    expect(b.rows[0].taksitTutari).toContain("TL");
  });
});
