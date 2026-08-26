import { describe, expect, it, vi } from "vitest";
import {
  keywordSearch,
  parcaAnahtari,
  rrfBirlestir,
  sorguTerimleri,
} from "../hybridSearch";
import type { VectorSearchResult } from "../qdrantTypes";

function sonuc(
  chunkText: string,
  sourceUrl = "https://ornek.com/a",
  chunkIndex = 0,
  score = 0.5,
): VectorSearchResult {
  return {
    score,
    chunkText,
    bankName: "Test Bankası",
    documentType: "evidence",
    sourceUrl,
    sourceCheckedAt: "2026-08-26T00:00:00.000Z",
    sourceId: "test",
    chunkIndex,
  };
}

describe("sorgu terimleri", () => {
  it("soru kalıbı kelimelerini eler", () => {
    const t = sorguTerimleri("Kuveyt Türk konut finansmanı azami vade kaç ay?");
    expect(t).toContain("kuveyt");
    expect(t).toContain("vade");
    expect(t).toContain("azami");
    expect(t).not.toContain("kac");
    expect(t).not.toContain("banka");
  });

  it("kısa kelimeleri ve tekrarları atar", () => {
    const t = sorguTerimleri("ev ev konut konut");
    expect(t).toEqual(["konut"]);
  });

  it("terim kalmazsa boş döner", () => {
    expect(sorguTerimleri("ne kadar mi")).toEqual([]);
  });
});

describe("anahtar kelime araması", () => {
  it("terim geçmeyen parçaları eler, çok terim geçeni öne alır", async () => {
    const scroll = vi.fn(async () => [
      { payload: { chunk_text: "Avantajlı kâr oranları ve farklı seçenekler." } },
      {
        payload: {
          chunk_text: "Geri ödeme planında azami 120 aya kadar vade seçilebilir.",
        },
      },
      { payload: { chunk_text: "Vade seçenekleri şubeye göre değişir." } },
    ]);

    const sonuclar = await keywordSearch(
      "azami vade kaç ay?",
      undefined,
      { scroll },
    );

    expect(sonuclar).toHaveLength(2);
    expect(sonuclar[0].chunk_text).toContain("120 aya kadar vade");
  });

  it("mevcut filtreyi korur ve terimleri should olarak ekler", async () => {
    const scroll = vi.fn(
      async (_filter: unknown, _limit: number) =>
        [] as Array<{ payload?: Record<string, unknown> | null }>,
    );
    await keywordSearch(
      "kuveyt konut vade",
      { must: [{ key: "bank_id", match: { any: ["kuveyt-turk"] } }] },
      { scroll },
    );

    const filtre = scroll.mock.calls[0][0] as {
      must: Array<Record<string, unknown>>;
    };
    expect(filtre.must[0]).toMatchObject({ key: "bank_id" });
    const should = filtre.must[1].should as Array<{ key: string }>;
    expect(should.length).toBeGreaterThan(0);
    expect(should[0].key).toBe("chunk_text");
  });

  it("ayırt edici terim yoksa arama yapmaz", async () => {
    const scroll = vi.fn(async () => []);
    expect(await keywordSearch("ne kadar mi", undefined, { scroll })).toEqual([]);
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe("RRF birleştirme", () => {
  it("her iki listede geçen parçayı öne alır", () => {
    const ortak = sonuc("120 aya kadar vade", "https://ornek.com/vade", 1);
    const vektorel = [
      sonuc("tanıtım metni", "https://ornek.com/tanitim", 0),
      sonuc("başka metin", "https://ornek.com/baska", 0),
      ortak,
    ];
    const anahtar = [ortak];

    const birlesik = rrfBirlestir(vektorel, anahtar, 5);
    expect(birlesik[0].chunkText).toBe("120 aya kadar vade");
  });

  it("yalnızca vektörde olan sonuçları kaybetmez", () => {
    const v = [sonuc("a", "https://o/a"), sonuc("b", "https://o/b")];
    const k = [sonuc("c", "https://o/c")];
    const birlesik = rrfBirlestir(v, k, 10);
    expect(birlesik).toHaveLength(3);
  });

  it("limit uygular", () => {
    const v = [sonuc("a", "https://o/a"), sonuc("b", "https://o/b")];
    const k = [sonuc("c", "https://o/c")];
    expect(rrfBirlestir(v, k, 2)).toHaveLength(2);
  });

  it("aynı parça iki listede aynı anahtarı üretir", () => {
    const a = sonuc("aynı metin", "https://o/x", 2);
    const b = sonuc("aynı metin", "https://o/x", 2);
    expect(parcaAnahtari(a)).toBe(parcaAnahtari(b));
  });
});

describe("ilgili pencere seçimi", () => {
  it("aranan bilgi metnin sonundaysa bile pencereye alır", async () => {
    const { ilgiliPencere } = await import("../../rag/contextBuilder");
    const dolgu = "Bankacılığı değer üretmek olarak görüyoruz. ".repeat(50);
    const metin = `${dolgu}Geri ödeme planınız oluşturulurken 120 aya kadar vade seçeneği tercih edilebilir.${dolgu}`;

    const pencere = ilgiliPencere(metin, "azami vade kaç ay?", 400);
    expect(pencere).toContain("120 aya kadar vade");
    expect(pencere.length).toBeLessThanOrEqual(420);
  });

  it("kısa metni olduğu gibi bırakır", async () => {
    const { ilgiliPencere } = await import("../../rag/contextBuilder");
    const metin = "120 aya kadar vade.";
    expect(ilgiliPencere(metin, "vade", 400)).toBe(metin);
  });

  it("terim bulunmazsa baştan kırpar", async () => {
    const { ilgiliPencere } = await import("../../rag/contextBuilder");
    const metin = "a".repeat(1000);
    const p = ilgiliPencere(metin, "bulunmayanterim", 200);
    expect(p).toHaveLength(200);
    expect(p.startsWith("…")).toBe(false);
  });
});
