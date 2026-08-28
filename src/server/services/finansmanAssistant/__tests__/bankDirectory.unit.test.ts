import { describe, expect, it } from "vitest";
import {
  bankaBul,
  bekleyenTakibiCoz,
  rehberNiyetiTespit,
  rehberYaniti,
} from "../bankDirectory";
import {
  BANK_SOURCE_CONFIGS,
  isOperationalBank,
} from "../../scraper/bankSourceConfig";

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
    expect(rehberNiyetiTespit("ziraat katılımın ne tür kmapnayalrı var")).toBe(
      "banka_kampanyalari",
    );
    expect(rehberNiyetiTespit("eğitim kampanyaları var mı")).toBe(
      "genel_kampanyalar",
    );
    expect(
      rehberNiyetiTespit("kampanyalar hakkında bilgi almak istiyorum"),
    ).toBe("genel_kampanyalar");
    expect(rehberNiyetiTespit("eğitim kampanyaları")).toBe("genel_kampanyalar");
    expect(rehberNiyetiTespit("kart kampanyaları göster")).toBe(
      "genel_kampanyalar",
    );
    expect(
      rehberNiyetiTespit("bana ev alcam kendime ne kampanyalar var"),
    ).toBe("genel_kampanyalar");
    expect(rehberNiyetiTespit("kırtasiye için var mı")).toBe(
      "genel_kampanyalar",
    );
  });

  it("banka tanıtım sorularını tanır", () => {
    expect(rehberNiyetiTespit("albaraka nasıl banka")).toBe("banka_bilgi");
    expect(rehberNiyetiTespit("albaraka iyi mi ismi hoşuma gitti")).toBe(
      "banka_bilgi",
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
    expect(bankaBul("zıraaat oranı kaç")).toBe("ziraat-katilim");
    expect(bankaBul("İktisat Katılım kampanyaları")).toBe("iktisat-katilim");
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

  it("banka sayısı faaliyetteki bankaları esas alır", () => {
    // Faaliyet izni alıp ürünlerini henüz açmamış banka sayıya dahil
    // edilmez; kaynak envanterinde tutulur ama teklif üretemez.
    const sayi = rehberYaniti("banka_sayisi", "kaç katılım bankası var");
    const adet = Number(/(\d+)\s+katılım bankası/.exec(sayi.message)?.[1]);
    const faaliyette = BANK_SOURCE_CONFIGS.filter(
      (b) => b.enabled && isOperationalBank(b),
    ).length;
    expect(adet).toBe(faaliyette);
  });

  it("listede izlenen tüm bankalar yer alır, faaliyete geçmemiş olan işaretlenir", () => {
    const liste = rehberYaniti("banka_listesi", "listele");
    const satirlar = liste.message.split("\n").filter((s) => /^\d+\.\s/.test(s));
    expect(satirlar.length).toBe(
      BANK_SOURCE_CONFIGS.filter((b) => b.enabled).length,
    );

    const bekleyen = BANK_SOURCE_CONFIGS.filter(
      (b) => b.enabled && !isOperationalBank(b),
    );
    for (const b of bekleyen) {
      const satir = satirlar.find((s) => s.includes(b.bankName));
      expect(satir, b.bankName).toMatch(/ürünleri henüz açılmadı/);
    }
  });

  it("resmî site yanıtı gerçek URL döndürür", () => {
    const r = rehberYaniti("banka_sitesi", "Kuveyt Türk web sitesi");
    expect(r.message).toContain("kuveytturk.com.tr");
    expect(r.citations[0].sourceUrl).toMatch(/^https:\/\//);
  });

  it("tanınmayan bankada uydurmaz, seçenekleri listeler", () => {
    const r = rehberYaniti("banka_sitesi", "Falanca Bankası web sitesi");
    // Uydurma bir banka/URL üretmemeli, bunun yerine seçenekleri saymalı.
    expect(r.message).not.toMatch(/^https?:\/\//m);
    expect(r.message).toContain("Kuveyt Türk");
    expect(r.citations).toEqual([]);
  });

  it("FAST ücret karşılaştırmasında doğrulanmış bankaları listeler", () => {
    expect(rehberNiyetiTespit("FAST ücreti ne kadar")).toBe("ucret_karsilastir");
    const r = rehberYaniti("ucret_karsilastir", "FAST ücreti ne kadar");
    expect(r.message).toContain("FAST");
    expect(r.message).toMatch(/ücretsiz|0 TL/i);
    expect(r.message).toContain("Vakıf Katılım");
    expect(r.message).toContain("Kuveyt Türk");
  });

  it("kampanya listesinde kısa açıklama ekler", async () => {
    const { seedVerifiedResearchRecords } = await import(
      "../../postgres/store"
    );
    await seedVerifiedResearchRecords();
    const r = rehberYaniti("genel_kampanyalar", "kırtasiye var mı");
    expect(r.message).toMatch(/kırtasiye|Kırtasiye/i);
    expect(r.message).toMatch(/Albaraka World|vade farksız|taksit/i);
  });

  it("düğün gibi doğrudan eşleşmeyen kampanya niyetinde tüm kampanyaları dökmez", async () => {
    const { seedVerifiedResearchRecords } = await import(
      "../../postgres/store"
    );
    await seedVerifiedResearchRecords();
    const r = rehberYaniti(
      "genel_kampanyalar",
      "düğün yapacağım para lazım kampanya var mı",
    );
    expect(r.message).toMatch(/d[uü]gun|doğrudan eşleşen aktif kampanya bulamadım/i);
    expect(r.message).not.toMatch(/toplam \d+ aktif kampanya var/i);
  });
});
