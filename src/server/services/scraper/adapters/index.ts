import { createBaseAdapter } from "./baseAdapter";
import type { BankScraperAdapter, ScrapedPage } from "../scraperTypes";
import { validateOfficialBankUrl } from "../urlGuard";
import { extractLinks } from "../contentCleaner";

function withDetailFilter(
  base: BankScraperAdapter,
  patternIncludes: string[],
): BankScraperAdapter {
  return {
    ...base,
    async discoverDetailUrls(page: ScrapedPage): Promise<string[]> {
      const links = extractLinks(page.html, page.finalUrl);
      const out: string[] = [];
      for (const link of links) {
        const v = validateOfficialBankUrl(link, base.bankId);
        if (!v.ok) continue;
        if (patternIncludes.some((p) => v.url.pathname.includes(p))) {
          out.push(v.url.toString());
        }
      }
      return [...new Set(out)].slice(0, 50);
    },
  };
}

export const adilAdapter = createBaseAdapter("adil-katilim");
export const albarakaAdapter = withDetailFilter(createBaseAdapter("albaraka"), [
  "/tr/kampanyalar/detay/",
  "/kampanyalar/detay/",
]);
export const dunyaKatilimAdapter = withDetailFilter(
  createBaseAdapter("dunya-katilim"),
  ["/kampanyalar/"],
);
export const hayatFinansAdapter = withDetailFilter(
  createBaseAdapter("hayat-finans"),
  ["/kampanyalar/", "/finansmanlar/", "/finansmanlar-is/", "/krediler/"],
);
export const kuveytTurkAdapter = withDetailFilter(
  createBaseAdapter("kuveyt-turk"),
  ["/kampanyalar/", "/kendim-icin/finansmanlar/"],
);
export const tomBankAdapter = createBaseAdapter("tom-katilim");
export const emlakKatilimAdapter = withDetailFilter(
  createBaseAdapter("emlak-katilim"),
  ["/tr/bireysel/kampanyalar/kampanya/", "/tr/bireysel/finansmanlar/"],
);
export const turkiyeFinansAdapter = withDetailFilter(
  createBaseAdapter("turkiye-finans"),
  ["/tr-tr/kampanyalar/", "/tr-tr/bireysel/"],
);
export const vakifKatilimAdapter = withDetailFilter(
  createBaseAdapter("vakif-katilim"),
  ["/tr/kendim-icin/kampanyalar/detay/", "/tr/kendim-icin/finansmanlar/"],
);
export const ziraatKatilimAdapter = withDetailFilter(
  createBaseAdapter("ziraat-katilim"),
  ["/bireysel/kampanyalar/", "/bireysel/finansman-urunleri/", "/kart-kampanyalari/"],
);

const ADAPTERS: Record<string, BankScraperAdapter> = {
  "adil-katilim": adilAdapter,
  albaraka: albarakaAdapter,
  "dunya-katilim": dunyaKatilimAdapter,
  "hayat-finans": hayatFinansAdapter,
  "kuveyt-turk": kuveytTurkAdapter,
  "tom-katilim": tomBankAdapter,
  "emlak-katilim": emlakKatilimAdapter,
  "turkiye-finans": turkiyeFinansAdapter,
  "vakif-katilim": vakifKatilimAdapter,
  "ziraat-katilim": ziraatKatilimAdapter,
};

export function getAdapter(bankId: string): BankScraperAdapter {
  const a = ADAPTERS[bankId];
  if (!a) throw new Error(`Adapter yok: ${bankId}`);
  return a;
}

export function listAdapters(): BankScraperAdapter[] {
  return Object.values(ADAPTERS);
}
