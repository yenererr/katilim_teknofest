/**
 * Hibrit arama: anahtar kelime + vektör.
 *
 * Yalnızca vektör araması, "azami vade kaç ay" gibi sorularda ürün
 * sayfalarının tanıtım paragraflarını öne çıkarıyor; sayıyı içeren kısa
 * parça alt sıralarda kalıp LLM'e hiç ulaşmıyordu. Anahtar kelime ayağı
 * bu tür birebir terim eşleşmelerini yakalar.
 *
 * İki liste Reciprocal Rank Fusion (RRF) ile birleştirilir: bir parçanın
 * skoru, her iki listedeki sırasının tersi toplamıdır. Böylece tek bir
 * yöntemin mutlak skor ölçeği diğerini ezmez.
 */

import { asciiKatla } from "../../../nlp/normalize";
import type {
  FinancialDocumentPayload,
  VectorSearchParams,
  VectorSearchResult,
} from "./qdrantTypes";

/** RRF sabiti — küçük değer üst sıralara daha çok ağırlık verir. */
const RRF_K = 20;

/** Anahtar kelime ayağının aday havuzu. */
const KEYWORD_CANDIDATE_LIMIT = 64;

/**
 * Soru kalıbı kelimeleri: her belgede geçtikleri için ayırt edici değiller
 * ve anahtar kelime aramasını gürültüye boğuyorlar.
 */
const ETKISIZ_KELIMELER = new Set([
  "nedir",
  "ne",
  "kac",
  "kadar",
  "hangi",
  "hangisi",
  "nasil",
  "neden",
  "mi",
  "mu",
  "ve",
  "veya",
  "ile",
  "icin",
  "bir",
  "bu",
  "su",
  "the",
  "var",
  "yok",
  "olur",
  "olarak",
  "banka",
  "bankasi",
  "katilim",
]);

/** Sorgudan ayırt edici terimleri çıkarır. */
export function sorguTerimleri(query: string): string[] {
  const terimler = asciiKatla(query)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !ETKISIZ_KELIMELER.has(t));

  return [...new Set(terimler)].slice(0, 12);
}

/** BM25 parametreleri — k1 terim doygunluğu, b uzunluk normalizasyonu. */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/**
 * BM25 skoru. Ham terim sayısı yerine bunu kullanmak şart: terim sayısı
 * uzun tanıtım metinlerini ödüllendiriyor, aranan bilgiyi taşıyan kısa
 * cümle ("120 aya kadar vade seçilebilir") alt sıralarda kalıyordu.
 * IDF aday havuzundan hesaplanır; havuz küçük olduğu için bu yeterli.
 */
export function bm25Skoru(
  terimler: string[],
  kelimeler: string[],
  adaylar: Array<{ kelimeler: string[] }>,
  ortalamaUzunluk: number,
): number {
  const N = adaylar.length;
  const uzunluk = kelimeler.length || 1;
  let skor = 0;

  for (const terim of terimler) {
    const f = kelimeler.filter((k) => k.includes(terim)).length;
    if (!f) continue;

    const df = adaylar.filter((a) =>
      a.kelimeler.some((k) => k.includes(terim)),
    ).length;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

    const pay = f * (BM25_K1 + 1);
    const payda =
      f + BM25_K1 * (1 - BM25_B + (BM25_B * uzunluk) / (ortalamaUzunluk || 1));
    skor += idf * (pay / payda);
  }

  return skor;
}

export type KeywordSearchDeps = {
  /** Qdrant scroll çağrısı — testlerde taklit edilebilir. */
  scroll: (filter: unknown, limit: number) => Promise<
    Array<{ payload?: Record<string, unknown> | null }>
  >;
};

/**
 * Anahtar kelime araması: en az bir terimi geçen parçalar getirilir,
 * ardından kaç terim geçtiğine ve terimlerin uzunluğuna göre sıralanır.
 */
export async function keywordSearch(
  query: string,
  baseFilter: Record<string, unknown> | undefined,
  deps: KeywordSearchDeps,
): Promise<FinancialDocumentPayload[]> {
  const terimler = sorguTerimleri(query);
  if (!terimler.length) return [];

  const should = terimler.map((t) => ({
    key: "chunk_text",
    match: { text: t },
  }));

  const must = Array.isArray(baseFilter?.must) ? baseFilter.must : [];
  const filter = { must: [...must, { should }] };

  const points = await deps.scroll(filter, KEYWORD_CANDIDATE_LIMIT);

  const adaylar = points
    .map((p) => p.payload as FinancialDocumentPayload | undefined)
    .filter((p): p is FinancialDocumentPayload => Boolean(p?.chunk_text))
    .map((payload) => ({
      payload,
      kelimeler: asciiKatla(payload.chunk_text)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean),
    }));

  if (!adaylar.length) return [];

  const ortalamaUzunluk =
    adaylar.reduce((n, a) => n + a.kelimeler.length, 0) / adaylar.length;

  const skorlanmis = adaylar
    .map((aday) => ({
      payload: aday.payload,
      skor: bm25Skoru(terimler, aday.kelimeler, adaylar, ortalamaUzunluk),
    }))
    .filter((r) => r.skor > 0)
    .sort((a, b) => b.skor - a.skor);

  return skorlanmis.map((r) => r.payload);
}

/** Bir parçanın kimliği — iki listede aynı parçayı eşleştirmek için. */
export function parcaAnahtari(
  r: Pick<VectorSearchResult, "sourceUrl" | "chunkIndex" | "chunkText">,
): string {
  return `${r.sourceUrl}#${r.chunkIndex}#${r.chunkText.slice(0, 60)}`;
}

/**
 * İki sıralı listeyi Reciprocal Rank Fusion ile birleştirir.
 * Skor = Σ 1 / (RRF_K + sıra). Her iki listede de geçen parça öne çıkar.
 */
export function rrfBirlestir(
  vektorel: VectorSearchResult[],
  anahtarKelime: VectorSearchResult[],
  limit: number,
): VectorSearchResult[] {
  const skorlar = new Map<
    string,
    { sonuc: VectorSearchResult; skor: number }
  >();

  const ekle = (liste: VectorSearchResult[], etiket: "v" | "k") => {
    liste.forEach((sonuc, i) => {
      const anahtar = parcaAnahtari(sonuc);
      const katki = 1 / (RRF_K + i + 1);
      const mevcut = skorlar.get(anahtar);
      if (mevcut) {
        mevcut.skor += katki;
        // Vektör skorunu koru: kaynak künyesinde anlamlı olan odur.
        if (etiket === "v") mevcut.sonuc = sonuc;
      } else {
        skorlar.set(anahtar, { sonuc, skor: katki });
      }
    });
  };

  ekle(vektorel, "v");
  ekle(anahtarKelime, "k");

  // Saf RRF sıralaması. İki listede birden geçen parça zaten iki katkı
  // topladığı için doğal olarak öne çıkar; buna ayrıca mutlak öncelik
  // vermek, yalnızca anahtar kelimede bulunan parçayı (hibrit aramanın
  // kurtarmak istediği parçayı) listenin sonuna itiyordu.
  return [...skorlar.values()]
    .sort((a, b) => b.skor - a.skor)
    .slice(0, limit)
    .map((r) => r.sonuc);
}

export type HybridSearchParams = VectorSearchParams;
