import { describe, expect, it, vi } from "vitest";
import {
  belgeleriIndeksle,
  belgeyiIndeksGirdisineCevir,
  type ResmiBelge,
} from "../belgeIndexer";

const belge: ResmiBelge = {
  bankId: "vakif-katilim",
  bankName: "Vakıf Katılım Bankası A.Ş.",
  sourceUrl: "https://www.vakifkatilim.com.tr/tr/yardimci-sayfalar/urun-ve-hizmet-ucretleri",
  title: "Ücret Tablosu (21.01.2026)",
  documentType: "fee",
  effectiveDate: "2026-01-21T00:00:00.000Z",
  text: "Tahsis Ücreti: finansman anaparasının binde beşini geçemez.",
};

describe("resmî belge indeksleme", () => {
  it("belgeyi indeks girdisine çevirir ve künyeyi korur", () => {
    const g = belgeyiIndeksGirdisineCevir(belge);
    expect(g.bankId).toBe("vakif-katilim");
    expect(g.documentType).toBe("fee");
    expect(g.sourceUrl).toContain("vakifkatilim.com.tr");
    // Yürürlük tarihi kaynak kontrol zamanı olarak taşınır ki künyede
    // tarifenin hangi tarihe ait olduğu görünsün.
    expect(g.sourceCheckedAt).toBe("2026-01-21T00:00:00.000Z");
    expect(g.contentHash).toMatch(/^[0-9a-f]+$/);
  });

  it("aynı metin için aynı içerik özetini üretir", () => {
    expect(belgeyiIndeksGirdisineCevir(belge).contentHash).toBe(
      belgeyiIndeksGirdisineCevir(belge).contentHash,
    );
  });

  it("metin değişince içerik özeti değişir", () => {
    const digeri = { ...belge, text: belge.text + " Güncellendi." };
    expect(belgeyiIndeksGirdisineCevir(digeri).contentHash).not.toBe(
      belgeyiIndeksGirdisineCevir(belge).contentHash,
    );
  });

  it("bir belge hata verse de diğerlerini indeksler", async () => {
    const indexer = {
      indexDocument: vi
        .fn()
        .mockRejectedValueOnce(new Error("qdrant erişilemedi"))
        .mockResolvedValueOnce({ upserted: 4, deleted: 0, skipped: 0 }),
    } as never;

    const sonuc = await belgeleriIndeksle(
      [belge, { ...belge, title: "İkinci belge" }],
      indexer,
    );

    expect(sonuc[0].hata).toContain("qdrant erişilemedi");
    expect(sonuc[0].upserted).toBe(0);
    expect(sonuc[1].upserted).toBe(4);
  });
});
