/**
 * Katılma hesabı kâr payını bankaların resmî araçlarından paralel çeker.
 */

import { hesaplaAlbarakaKarPayi } from "./albarakaKarPayiCalculator";
import { hesaplaDunyaKarPayi } from "./dunyaKarPayiCalculator";
import { hesaplaHayatKarPayi } from "./hayatKarPayiCalculator";
import {
  unavailableKarPayi,
  type KarPayiHesaplamaOpts,
  type KarPayiHesaplamaSonucu,
} from "./karPayiShared";
import { hesaplaKuveytKarPayi } from "./kuveytKarPayiCalculator";
import { hesaplaTurkiyeFinansKarPayi } from "./turkiyeFinansKarPayiCalculator";
import { hesaplaVakifKarPayi } from "./vakifKarPayiCalculator";
import { hesaplaZiraatKarPayi } from "./ziraatKarPayiCalculator";

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
  {
    bankId: "ziraat-katilim",
    label: "Ziraat Katılım",
    sourceUrl: "https://www.ziraatkatilim.com.tr/#tab-kar-payi-content",
    run: hesaplaZiraatKarPayi,
  },
  {
    bankId: "dunya-katilim",
    label: "Dünya Katılım",
    sourceUrl: "https://dunyakatilim.com.tr/",
    run: hesaplaDunyaKarPayi,
  },
  {
    bankId: "hayat-finans",
    label: "Hayat Finans",
    sourceUrl: "https://hayatfinans.com.tr/hesaplar/katilma-hesabi",
    run: hesaplaHayatKarPayi,
  },
  {
    bankId: "turkiye-finans",
    label: "Türkiye Finans",
    sourceUrl:
      "https://www.turkiyefinans.com.tr/tr-tr/hesaplama-araclari/sayfalar/kar-payi-hesap-makinesi.aspx",
    run: hesaplaTurkiyeFinansKarPayi,
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
