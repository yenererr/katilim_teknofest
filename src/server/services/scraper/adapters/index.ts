import { createBaseAdapter } from "./baseAdapter";
import type { BankScraperAdapter, ScrapedPage } from "../scraperTypes";
import { validateOfficialBankUrl } from "../urlGuard";
import { extractLinks } from "../contentCleaner";

const GENERIC_NON_CAMPAIGN_PATHS = [
  "/hakkimizda",
  "/hakkimizda/",
  "/gizlilik",
  "/gizlilik-ve-guvenlik",
  "/kisisel-verilerin-korunmasi",
  "/kvkk",
  "/cerez",
  "/bize-ulasin",
  "/iletisim",
  "/musteri-memnuniyeti",
  "/yatirimci-iliskileri",
  "/kariyer",
  "/assets/pdfs",
];

function withDetailFilter(
  base: BankScraperAdapter,
  patternIncludes: string[],
): BankScraperAdapter {
  return {
    ...base,
    async discoverDetailUrls(page: ScrapedPage): Promise<string[]> {
      const links = extractLinks(page.html, page.finalUrl);
      const out: string[] = [];
      const currentPath = new URL(page.finalUrl).pathname
        .replace(/\/+$/, "")
        .toLocaleLowerCase("tr-TR");
      for (const link of links) {
        const v = validateOfficialBankUrl(link, base.bankId);
        if (!v.ok) continue;
        const path = v.url.pathname.toLocaleLowerCase("tr-TR");
        const normalizedPath = path.replace(/\/+$/, "");
        if (normalizedPath === currentPath) continue;
        if (GENERIC_NON_CAMPAIGN_PATHS.some((p) => path.includes(p))) continue;
        if (!/kampanya/.test(path)) continue;
        if (patternIncludes.some((p) => path.includes(p.toLocaleLowerCase("tr-TR")))) {
          out.push(v.url.toString());
        }
      }
      return [...new Set(out)].slice(0, 50);
    },
  };
}

export const adilAdapter = withDetailFilter(createBaseAdapter("adil-katilim"), [
  "/kampanyalar/",
]);
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
  ["/kampanyalar/"],
);
export const tomBankAdapter = withDetailFilter(createBaseAdapter("tom-katilim"), [
  "/kampanyalar",
  "/hadi-kazan/",
  ".html",
]);
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
