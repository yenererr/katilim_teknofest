/**
 * Katılma hesabı kâr payını bankaların resmî araçlarından paralel çeker.
 */

import { hesaplaAlbarakaKarPayi } from "./albarakaKarPayiCalculator";
import {
  unavailableKarPayi,
  type KarPayiHesaplamaOpts,
  type KarPayiHesaplamaSonucu,
} from "./karPayiShared";
import { hesaplaKuveytKarPayi } from "./kuveytKarPayiCalculator";
import { hesaplaVakifKarPayi } from "./vakifKarPayiCalculator";

export const KAR_PAYI_BANKALARI = [
  {
    bankId: "vakif-katilim",
    label: "Vakıf Katılım",
    sourceUrl:
      "https://www.vakifkatilim.com.tr/tr/kendim-icin/hesaplar/katilma-hesaplari/katilma-hesabi",
    run: hesaplaVakifKarPayi,
  },
  {
    bankId: "albaraka",
    label: "Albaraka Türk",
    sourceUrl: "https://www.albaraka.com.tr/tr/hesaplama-araclari/kar-payi-hesaplama",
    run: hesaplaAlbarakaKarPayi,
  },
  {
    bankId: "kuveyt-turk",
    label: "Kuveyt Türk",
    sourceUrl: "https://www.kuveytturk.com.tr/hesaplama-araclari/kar-payi-hesaplama",
    run: hesaplaKuveytKarPayi,
  },
] as const;

export async function karsilastirKarPayi(
  opts: KarPayiHesaplamaOpts,
  fetchImpl: typeof fetch = fetch,
): Promise<KarPayiHesaplamaSonucu[]> {
  const rows = await Promise.all(
    KAR_PAYI_BANKALARI.map(async (bank) => {
      try {
        return await bank.run(opts, fetchImpl);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Hesaplama alınamadı.";
        console.warn(`[KarPayi][${bank.bankId}]`, message);
        return unavailableKarPayi(bank.bankId, opts, bank.sourceUrl, message);
      }
    }),
  );

  return rows.sort((a, b) => {
    const an = a.available && a.netProfit != null ? a.netProfit : -1;
    const bn = b.available && b.netProfit != null ? b.netProfit : -1;
    return bn - an;
  });
}
