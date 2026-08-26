import { describe, expect, it } from "vitest";
import { sozluktenYanitla } from "../terimSozlugu";

describe("terim sözlüğü", () => {
  it("katılım finansına özgü kavramları açıklar", () => {
    const m = sozluktenYanitla("Murabaha nedir?");
    expect(m?.terim).toBe("Murabaha");
    expect(m?.message).toContain("kâr payı");
  });

  it("mudarebe, icara, tekafül gibi kavramları tanır", () => {
    expect(sozluktenYanitla("mudarebe ne demek?")?.terim).toBe("Mudarebe");
    expect(sozluktenYanitla("icara nedir")?.terim).toBe("İcara");
    expect(sozluktenYanitla("tekafül ne anlama gelir")?.terim).toBe("Tekafül");
  });

  it("faiz ve kâr payı farkını karşılaştırmalı yanıtlar", () => {
    const m = sozluktenYanitla("Kâr payı ile faiz arasındaki fark nedir?");
    expect(m).not.toBeNull();
    expect(m?.message).toContain("aynı şey değildir");
  });

  it("sözlükteki geleneksel terimleri katılım karşılığıyla verir", () => {
    const m = sozluktenYanitla("kredi nedir?");
    expect(m?.message).toContain("finansman");
    expect(m?.message).toContain("Denklik:");
  });

  it("soru kalıbı yoksa devreye girmez", () => {
    expect(sozluktenYanitla("200.000 TL ihtiyaç finansmanı 24 ay")).toBeNull();
    expect(sozluktenYanitla("murabaha")).toBeNull();
  });

  it("bilinmeyen terimde null döner, uydurmaz", () => {
    expect(sozluktenYanitla("zxqw nedir?")).toBeNull();
  });
});

describe("sözlük kapsam sınırı", () => {
  it("banka adı geçen ürün sorularına karışmaz", () => {
    expect(
      sozluktenYanitla("Kuveyt Türk araç finansmanı vade üst sınırı nedir?"),
    ).toBeNull();
    expect(
      sozluktenYanitla("Emlak Katılım ihtiyaç finansmanı kâr payı oranı nedir?"),
    ).toBeNull();
  });

  it("banka geçmeyen terim sorusunu yine yanıtlar", () => {
    expect(sozluktenYanitla("kâr payı nedir?")).not.toBeNull();
  });
});
