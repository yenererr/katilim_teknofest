/**
 * Resmî banka belgelerini (ücret tarifeleri, kâr paylaşım oranları) Qdrant'a
 * indeksler.
 *
 * Bu belgeler bankaların yayımladığı PDF tarifelerdir. Tabloları otomatik
 * ayrıştırıp sayı çıkarmıyoruz: üst kalem / alt kalem yapısı nedeniyle bir
 * ücretin yanlış kaleme bağlanma riski var ve yanlış banka ücreti göstermek
 * gerçek zarar verir. Bunun yerine belge metni kanıt olarak indeksleniyor;
 * asistan ilgili satırı kaynak göstererek alıntılıyor.
 */

import { getDocumentIndexer } from "./documentIndexer";
import { hashText } from "./textChunker";
import type { DocumentType, IndexDocumentInput } from "./qdrantTypes";

export type ResmiBelge = {
  bankId: string;
  bankName: string;
  /** Belgenin bankada yayımlandığı sayfa */
  sourceUrl: string;
  title: string;
  documentType: DocumentType;
  /** Tarifenin yürürlük tarihi (ISO) */
  effectiveDate: string;
  text: string;
};

export function belgeyiIndeksGirdisineCevir(
  belge: ResmiBelge,
): IndexDocumentInput {
  return {
    bankId: belge.bankId,
    bankName: belge.bankName,
    sourceId: belge.bankId,
    sourceUrl: belge.sourceUrl,
    documentType: belge.documentType,
    title: belge.title,
    text: belge.text,
    sourceCheckedAt: belge.effectiveDate,
    contentHash: hashText(`${belge.sourceUrl}:${belge.text}`),
  };
}

export type BelgeIndeksSonucu = {
  title: string;
  upserted: number;
  hata?: string;
};

/** Belgeleri indeksler; her belge için sonucu ayrı raporlar. */
export async function belgeleriIndeksle(
  belgeler: ResmiBelge[],
  indexer = getDocumentIndexer(),
): Promise<BelgeIndeksSonucu[]> {
  const sonuclar: BelgeIndeksSonucu[] = [];

  for (const belge of belgeler) {
    try {
      const r = await indexer.indexDocument(belgeyiIndeksGirdisineCevir(belge));
      sonuclar.push({
        title: belge.title,
        upserted: r.upserted,
      });
    } catch (err) {
      sonuclar.push({
        title: belge.title,
        upserted: 0,
        hata: err instanceof Error ? err.message : "bilinmeyen hata",
      });
    }
  }

  return sonuclar;
}
