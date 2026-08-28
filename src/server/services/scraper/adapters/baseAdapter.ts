import { getBankConfig, type BankSourceConfig } from "../bankSourceConfig";
import { cleanHtmlToDocument, extractLinks } from "../contentCleaner";
import { validateOfficialBankUrl } from "../urlGuard";
import { asciiKatla } from "../../../../nlp/normalize";
import type {
  BankScraperAdapter,
  CampaignStatus,
  CleanDocument,
  ContentCategory,
  ScrapedPage,
  SourceMetadata,
} from "../scraperTypes";

function detectStatusFromText(text: string): CampaignStatus {
  const t = text.toLocaleLowerCase("tr-TR");
  if (
    /kampanya süresi dolmuştur|süresi doldu|sona ermiştir|biten kampanya|kampanya bitti/.test(
      t,
    )
  ) {
    return "expired";
  }
  if (/yakında|yakinda|başlayacak|baslayacak/.test(t)) return "upcoming";
  if (/devam ediyor|geçerlidir|gecerlidir|son başvuru|son basvuru/.test(t)) {
    return "active";
  }
  return "unknown";
}

export function classifyByUrlAndText(
  url: string,
  text: string,
): ContentCategory {
  const h = asciiKatla(`${url} ${text}`);

  if (/kart|bankkart|bonus|puan/.test(h) || /kredi karti kampanya|kart kampanya/.test(h)) {
    return "card_campaign";
  }
  if (/%\s*\d+\s*indirim|indirim kampanya/.test(h) && !/finansman|kar pay/.test(h)) {
    return "discount_campaign";
  }
  if (/konut|evim|mortgage|gayrimenkul/.test(h)) return "housing_finance";
  if (/tasit|arac|otomobil|arac finans/.test(h)) return "vehicle_finance";
  if (/ihtiyac|tuketici|bireysel finansman/.test(h)) {
    return "consumer_finance";
  }
  if (/alisveris|magaza/.test(h)) return "shopping_finance";
  if (/ticari|mikro finansman|kobi/.test(h)) return "commercial_finance";
  if (
    /yatirim\s*(urun|kampanya|hesab)|katilim\s*fonu|altin\s*(hesab|birikim)|kiymetli\s*maden|birikim\s*hesab|katilma\s*hesab/.test(
      h,
    )
  ) {
    return "investment_product";
  }
  if (
    /yeni\s*musteri|hos\s*geldin|ilk\s*kez\s*musteri|musteri\s*ol\s*kampanya|musterimiz\s*olmayan|musteri\s*olan/.test(
      h,
    )
  ) {
    return "new_customer_financing";
  }
  if (/kampanya/.test(h) && /finansman|musteri\s+ol(?:un|maya|mak)\b/.test(h)) {
    return "financing_campaign";
  }
  if (/ucret|masraf|tahsis/.test(h)) return "financing_fee";
  if (/kariyer|is ilani|kvkk|cerez|blog|basin|atm|sube|gizlilik|bize ulas|yatirimci|musteri memnuniyet|hakkimizda|katilim bankaciligi/.test(h)) {
    return "irrelevant";
  }
  return "general_announcement";
}

export function createBaseAdapter(bankId: string): BankScraperAdapter {
  const config = getBankConfig(bankId);
  if (!config) throw new Error(`Banka yapılandırması yok: ${bankId}`);

  return {
    bankId,
    supportsUrl(url: string): boolean {
      const v = validateOfficialBankUrl(url, bankId);
      return v.ok;
    },
    async discoverDetailUrls(page: ScrapedPage): Promise<string[]> {
      const links = extractLinks(page.html, page.finalUrl);
      const found: string[] = [];
      for (const link of links) {
        const v = validateOfficialBankUrl(link, bankId);
        if (!v.ok) continue;
        const path = v.url.pathname;
        const matchesPattern = config.detailLinkPatterns.some((p) =>
          path.toLowerCase().includes(p.toLowerCase()),
        );
        const matchesPrefix = config.allowedPathPrefixes.some((p) =>
          path.toLowerCase().startsWith(p.toLowerCase()),
        );
        if (matchesPattern || matchesPrefix) {
          found.push(v.url.toString());
        }
      }
      return [...new Set(found)].slice(0, 40);
    },
    async extractMainContent(page: ScrapedPage): Promise<CleanDocument> {
      return cleanHtmlToDocument(page.html);
    },
    detectCampaignStatus(document: CleanDocument): CampaignStatus {
      return detectStatusFromText(document.text);
    },
    extractVisibleMetadata(document: CleanDocument): SourceMetadata {
      return {
        title: document.title,
        categoryHint: classifyByUrlAndText("", document.text),
        campaignStatus: detectStatusFromText(document.text),
      };
    },
    classifyContent(document: CleanDocument, url: string): ContentCategory {
      return classifyByUrlAndText(url, document.text);
    },
  };
}

export function getConfigOrThrow(bankId: string): BankSourceConfig {
  const c = getBankConfig(bankId);
  if (!c) throw new Error(`Bilinmeyen banka: ${bankId}`);
  return c;
}
