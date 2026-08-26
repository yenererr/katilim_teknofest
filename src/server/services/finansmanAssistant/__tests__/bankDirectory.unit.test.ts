import { describe, expect, it } from "vitest";
import {
  bankaBul,
  bekleyenTakibiCoz,
  rehberNiyetiTespit,
  rehberYaniti,
} from "../bankDirectory";

describe("banka rehberi niyet tespiti", () => {
  it("liste sorularını tanır", () => {
    expect(rehberNiyetiTespit("katılım bankalarını listele")).toBe("banka_listesi");
    expect(rehberNiyetiTespit("Katılım bankaları hangileri?")).toBe("banka_listesi");
    expect(rehberNiyetiTespit("katılım bankalarının isimleri neler")).toBe(
      "banka_listesi",
    );
  });

  it("sayı sorularını tanır", () => {
    expect(rehberNiyetiTespit("kaç tane katılım bankası var?")).toBe("banka_sayisi");
  });

  it("resmî site sorularını tanır", () => {
    expect(rehberNiyetiTespit("Kuveyt Türk web sitesi nedir?")).toBe("banka_sitesi");
  });

  it("kampanya listesi sorularını tanır", () => {
    expect(rehberNiyetiTespit("Albaraka kampanyaları neler?")).toBe(
      "banka_kampanyalari",
    );
  });

  it("tek başına listele banka listesi döner", () => {
    expect(rehberNiyetiTespit("listele")).toBe("banka_listesi");
    expect(rehberNiyetiTespit("Listele!")).toBe("banka_listesi");
  });

  it("bekleyen takip ile listele çözülür", () => {
    expect(bekleyenTakibiCoz("listele", "banka_listesi")).toBe("banka_listesi");
    expect(bekleyenTakibiCoz("evet", "banka_listesi")).toBe("banka_listesi");
    expect(bekleyenTakibiCoz("200 bin TL ihtiyaç", "banka_listesi")).toBeNull();
  });

  it("finansman talebini rehber sorusu sanmaz", () => {
    expect(rehberNiyetiTespit("200.000 TL ihtiyaç finansmanı 24 ay")).toBeNull();
    expect(rehberNiyetiTespit("konut finansmanı istiyorum")).toBeNull();
  });
});

describe("banka adı çözümleme", () => {
  it("bilinen bankaları bulur", () => {
    expect(bankaBul("Kuveyt Türk kampanyaları")).toBe("kuveyt-turk");
    expect(bankaBul("vakıf katılım sitesi")).toBe("vakif-katilim");
    expect(bankaBul("ziraat katılım hakkında")).toBe("ziraat-katilim");
  });

  it("banka geçmiyorsa null döner", () => {
    expect(bankaBul("hava durumu nasıl")).toBeNull();
  });
});

describe("banka rehberi yanıtı", () => {
  it("listede tüm aktif bankaları sayar ve kaynak verir", () => {
    const r = rehberYaniti("banka_listesi", "katılım bankalarını listele");
    expect(r.message).toContain("Kuveyt Türk");
    expect(r.message).toContain("Albaraka");
    expect(r.citations.length).toBeGreaterThan(0);
    for (const c of r.citations) {
      expect(c.sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("banka sayısını listedeki banka adediyle tutarlı verir", () => {
    const sayi = rehberYaniti("banka_sayisi", "kaç katılım bankası var");
    const liste = rehberYaniti("banka_listesi", "listele");
    const adet = Number(/(\d+)\s+katılım bankası/.exec(sayi.message)?.[1]);
    const satirSayisi = liste.message
      .split("\n")
      .filter((s) => /^\d+\.\s/.test(s)).length;
    expect(adet).toBe(satirSayisi);
  });

  it("resmî site yanıtı gerçek URL döndürür", () => {
    const r = rehberYaniti("banka_sitesi", "Kuveyt Türk web sitesi");
    expect(r.message).toContain("kuveytturk.com.tr");
    expect(r.citations[0].sourceUrl).toMatch(/^https:\/\//);
  });

  it("tanınmayan bankada uydurmaz, seçenekleri listeler", () => {
    const r = rehberYaniti("banka_sitesi", "Falanca Bankası web sitesi");
    // Uydurma bir banka/URL üretmemeli, bunun yerine seçenekleri saymalı.
    expect(r.message).not.toMatch(/https?:\/\//);
    expect(r.message).toContain("Kuveyt Türk");
    expect(r.citations).toEqual([]);
  });
});
