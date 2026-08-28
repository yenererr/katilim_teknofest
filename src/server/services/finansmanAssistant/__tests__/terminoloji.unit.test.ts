/**
 * Şartname 5.5 — katılım bankacılığı terminolojisine uyum.
 * Şartnamenin tablo halinde saydığı beş kavramın sözlükten doğru şekilde
 * yanıtlandığını doğrular. Bu kavramlar önceden sözlükte yoktu.
 */

import { describe, expect, it } from "vitest";
import { sozluktenYanitla } from "../terimSozlugu";

describe("5.5 şartname kavramları", () => {
  const beklenen: Array<[string, string]> = [
    ["Kâr payı oranı nedir?", "Kâr payı oranı"],
    ["Finansman maliyeti ne demek?", "Finansman maliyeti"],
    ["Katılım fonu nedir?", "Katılım fonu"],
    ["Masrafsız finansman ne demek?", "Masrafsız finansman"],
    ["Avantajlı finansman nedir?", "Avantajlı finansman"],
  ];

  it.each(beklenen)("%s -> %s", (soru, terim) => {
    const y = sozluktenYanitla(soru);
    expect(y).not.toBeNull();
    expect(y!.terim).toBe(terim);
    expect(y!.message.length).toBeGreaterThan(80);
  });

  it("kâr payı oranı tanımı faizden ayrıştığını açıklar", () => {
    const y = sozluktenYanitla("Kâr payı oranı nedir?");
    expect(y!.message).toMatch(/faiz yerine/i);
    expect(y!.message).toMatch(/alım-satım|mal veya hizmet/i);
  });

  it("finansman maliyeti yalnızca kâr payı olmadığını belirtir", () => {
    const y = sozluktenYanitla("Finansman maliyeti ne demek?");
    expect(y!.message).toMatch(/tahsis ücreti|dosya masrafı/i);
  });
});

describe("yeni kavramlar mevcut davranışı gölgelemez", () => {
  it("faiz ile kâr payı karşılaştırması hâlâ karşılaştırma yanıtı verir", () => {
    const y = sozluktenYanitla("Faiz ile kâr payı arasındaki fark ne?");
    expect(y!.terim).toBe("Faiz / kâr payı");
  });

  it("murabaha hâlâ kendi kaydını döner", () => {
    expect(sozluktenYanitla("Murabaha nedir?")!.terim).toBe("Murabaha");
  });

  it("banka adı geçen veri sorusu sözlüğe düşmez", () => {
    expect(
      sozluktenYanitla("Kuveyt Türk konut finansmanı kâr payı oranı nedir?"),
    ).toBeNull();
  });
});
