import { getLiveBankStates } from "../liveData/liveDataBridge";
import { evaluateFreshness } from "../rag/freshnessService";
import type {
  RagQueryPlan,
  StructuredProductHit,
} from "../rag/ragTypes";

function campaignActive(product: Record<string, unknown>): boolean | null {
  const end = product.kampanya_bitis;
  if (end == null || end === "") return null;
  const ts = Date.parse(String(end));
  if (!Number.isFinite(ts)) return null;
  return ts >= Date.now();
}

/**
 * Yapılandırılmış canlı ürün araması (scrape cache / EVREN çıkarımı).
 * Örnek metin içermez; yalnızca çalışma anında çekilen canlı kayıtlara bakar.
 */
export function searchStructuredProducts(
  plan: RagQueryPlan,
): StructuredProductHit[] {
  const states = getLiveBankStates();
  const hits: StructuredProductHit[] = [];

  for (const bank of states) {
    if (plan.bankIds?.length && !plan.bankIds.includes(bank.id)) continue;
    const freshness = evaluateFreshness(bank);
    const products = Array.isArray(bank.products) ? bank.products : [];

    products.forEach((product, index) => {
      const p = product as Record<string, unknown>;
      const urunTuru = String(p.urun_turu || "");
      if (
        plan.productTypes?.length &&
        !plan.productTypes.includes(urunTuru)
      ) {
        return;
      }

      if (plan.targetSegment?.length) {
        const segs = Array.isArray(p.musteri_segmenti)
          ? (p.musteri_segmenti as string[])
          : [];
        if (
          segs.length &&
          !plan.targetSegment.some((s) => segs.includes(s))
        ) {
          return;
        }
      }

      const active = campaignActive(p);
      if (plan.activeOnly && active === false) return;

      hits.push({
        productId: `${bank.id}::${index}`,
        bankId: bank.id,
        bankName: bank.bankName,
        sourceUrls: bank.urls || [],
        lastCheckedAt: bank.lastCheckedAt,
        lastExtractedAt: bank.lastExtractedAt,
        freshness,
        isDemo: false,
        product: p,
      });
    });
  }

  return hits;
}
