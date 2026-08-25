import type { KatilimUrunu } from "../../../types";
import { aylikKarPayi, yuzdeBicim } from "../../../lib/compare";
import type {
  ComparisonToolResult,
  RagQueryPlan,
  StructuredProductHit,
} from "../rag/ragTypes";

type MetricKey = "kar_payi" | "vade" | "ucret" | "odul";

function pickMetric(message: string, plan: RagQueryPlan): MetricKey {
  const t = message.toLocaleLowerCase("tr-TR");
  if (/ücret|ucret|masraf|tahsis/.test(t)) return "ucret";
  if (/ödül|odul|puan/.test(t)) return "odul";
  if (/vade|uzun/.test(t) && !/kar pay|kâr pay|oran/.test(t)) return "vade";
  if (plan.termMonths) return "kar_payi";
  return "kar_payi";
}

function asKatilim(product: Record<string, unknown>): KatilimUrunu {
  return product as unknown as KatilimUrunu;
}

/**
 * Deterministik ürün karşılaştırması — LLM hesaplamaz.
 */
export function compareProductsTool(
  hits: StructuredProductHit[],
  plan: RagQueryPlan,
  message: string,
): ComparisonToolResult {
  const metric = pickMetric(message, plan);
  const warnings: string[] = [];
  const ranked: ComparisonToolResult["ranked"] = [];

  // Farklı kategorileri karıştırma
  const types = new Set(
    hits.map((h) => String(h.product.urun_turu || "diger")),
  );
  let pool = hits;
  if (types.size > 1 && plan.productTypes?.length === 1) {
    pool = hits.filter((h) =>
      plan.productTypes!.includes(String(h.product.urun_turu || "")),
    );
  } else if (types.size > 1 && !plan.productTypes?.length) {
    warnings.push(
      "Farklı ürün kategorileri aynı listede; doğrudan çapraz kategori karşılaştırması yapılmadı. Ürün türü belirtin.",
    );
    return {
      method: "blocked_mixed_categories",
      inputs: { metric, productTypes: [...types] },
      result: { comparable: false },
      ranked: [],
      warnings,
      comparable: false,
    };
  }

  for (const hit of pool) {
    const p = asKatilim(hit.product);
    const name = String(p.urun_adi || "Ürün");

    // Süresi dolmuş kampanya
    if (p.kampanya_bitis) {
      const end = Date.parse(String(p.kampanya_bitis));
      if (Number.isFinite(end) && end < Date.now()) {
        ranked.push({
          productId: hit.productId,
          bankName: hit.bankName,
          productName: name,
          metricLabel: metric,
          metricValue: null,
          metricDisplay: null,
          excludedReason: "Kampanya süresi dolmuş; aktif gibi değerlendirilmedi.",
        });
        continue;
      }
    }

    if (metric === "kar_payi") {
      const aylik = aylikKarPayi(p);
      const periyot = p.terimler?.kar_payi_orani?.periyot;
      if (aylik === null) {
        ranked.push({
          productId: hit.productId,
          bankName: hit.bankName,
          productName: name,
          metricLabel: "ilan_edilen_aylik_kar_payi",
          metricValue: null,
          metricDisplay: null,
          excludedReason:
            periyot === "belirsiz"
              ? "Kâr payı periyodu belirsiz; aylık/yıllık normalize edilmeden karşılaştırılmadı."
              : "İlan edilen kâr payı oranı kaynakta yok veya doğrulanamadı.",
        });
        continue;
      }
      if (plan.termMonths) {
        const maxVade = p.terimler?.vade_ay?.max;
        if (maxVade != null && plan.termMonths > maxVade) {
          ranked.push({
            productId: hit.productId,
            bankName: hit.bankName,
            productName: name,
            metricLabel: "ilan_edilen_aylik_kar_payi",
            metricValue: null,
            metricDisplay: null,
            excludedReason: `İstenen vade (${plan.termMonths} ay) ürünün azami vadesini (${maxVade}) aşıyor.`,
          });
          continue;
        }
      }
      ranked.push({
        productId: hit.productId,
        bankName: hit.bankName,
        productName: name,
        metricLabel: "ilan_edilen_aylik_kar_payi",
        metricValue: aylik,
        metricDisplay: yuzdeBicim(aylik),
      });
      continue;
    }

    if (metric === "vade") {
      const maxVade = p.terimler?.vade_ay?.max ?? null;
      if (maxVade == null) {
        ranked.push({
          productId: hit.productId,
          bankName: hit.bankName,
          productName: name,
          metricLabel: "azami_vade_ay",
          metricValue: null,
          metricDisplay: null,
          excludedReason: "Azami vade kaynakta yok.",
        });
        continue;
      }
      ranked.push({
        productId: hit.productId,
        bankName: hit.bankName,
        productName: name,
        metricLabel: "azami_vade_ay",
        metricValue: maxVade,
        metricDisplay: `${maxVade} ay`,
      });
      continue;
    }

    if (metric === "ucret") {
      const fee = p.terimler?.tahsis_ucreti;
      if (fee?.deger === undefined || fee?.deger === null) {
        // Eksik ücreti sıfır kabul etme
        ranked.push({
          productId: hit.productId,
          bankName: hit.bankName,
          productName: name,
          metricLabel: "tahsis_ucreti",
          metricValue: null,
          metricDisplay: null,
          excludedReason:
            "Tahsis ücreti kaynakta belirtilmemiş; sıfır varsayılmadı.",
        });
        continue;
      }
      ranked.push({
        productId: hit.productId,
        bankName: hit.bankName,
        productName: name,
        metricLabel: "tahsis_ucreti",
        metricValue: fee.deger,
        metricDisplay: `${fee.deger} ${fee.para_birimi || "TRY"}`,
      });
      continue;
    }

    if (metric === "odul") {
      const odul = p.terimler?.odul?.deger;
      if (odul === undefined || odul === null) {
        ranked.push({
          productId: hit.productId,
          bankName: hit.bankName,
          productName: name,
          metricLabel: "odul",
          metricValue: null,
          metricDisplay: null,
          excludedReason: "Ödül bilgisi kaynakta yok.",
        });
        continue;
      }
      ranked.push({
        productId: hit.productId,
        bankName: hit.bankName,
        productName: name,
        metricLabel: "odul",
        metricValue: odul,
        metricDisplay: String(odul),
      });
    }
  }

  const usable = ranked.filter((r) => r.metricValue != null);
  if (!usable.length) {
    warnings.push("Karşılaştırılabilir doğrulanmış sayısal veri bulunamadı.");
    return {
      method: `deterministic_${metric}`,
      inputs: {
        metric,
        termMonths: plan.termMonths,
        financingAmount: plan.financingAmount,
        productTypes: plan.productTypes,
      },
      result: { comparable: false, winner: null },
      ranked,
      warnings,
      comparable: false,
    };
  }

  const lowerIsBetter = metric === "kar_payi" || metric === "ucret";
  usable.sort((a, b) =>
    lowerIsBetter
      ? (a.metricValue as number) - (b.metricValue as number)
      : (b.metricValue as number) - (a.metricValue as number),
  );

  const winner = usable[0];
  return {
    method: `deterministic_${metric}_sort`,
    inputs: {
      metric,
      termMonths: plan.termMonths,
      financingAmount: plan.financingAmount,
      productTypes: plan.productTypes,
      direction: lowerIsBetter ? "min" : "max",
    },
    result: {
      comparable: true,
      winnerProductId: winner.productId,
      winnerBank: winner.bankName,
      winnerProduct: winner.productName,
      winnerMetric: winner.metricDisplay,
      rankedCount: usable.length,
      excludedCount: ranked.length - usable.length,
    },
    ranked: [...usable, ...ranked.filter((r) => r.metricValue == null)],
    warnings,
    comparable: true,
  };
}
