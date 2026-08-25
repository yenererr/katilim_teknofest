import { getBankConfig, type BankSourceConfig } from "../bankSourceConfig";
import { cleanHtmlToDocument, extractLinks } from "../contentCleaner";
import { validateOfficialBankUrl } from "../urlGuard";
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
  const u = url.toLocaleLowerCase("tr-TR");
  const t = text.toLocaleLowerCase("tr-TR");

  if (/kart|bankkart|bonus|puan/.test(u) || /kredi kartı kampanya|kart kampanya/.test(t)) {
    return "card_campaign";
  }
  if (/%\s*\d+\s*indirim|indirim kampanya/.test(t) && !/finansman|kâr pay|kar pay/.test(t)) {
    return "discount_campaign";
  }
  if (/konut|evim|mortgage|gayrimenkul/.test(u + t)) return "housing_finance";
  if (/ta[sş][iı]t|ara[cç]|otomobil|araç finans/.test(u + t)) return "vehicle_finance";
  if (/ihtiya[cç]|tüketici|tuketici|bireysel finansman/.test(u + t)) {
    return "consumer_finance";
  }
  if (/al[iı][sş]veri[sş]|ma[gğ]aza/.test(u + t)) return "shopping_finance";
  if (/ticari|mikro finansman|kobi/.test(u + t)) return "commercial_finance";
  if (/kat[iı]lma hesab|katılım fonu|katilim fonu/.test(u + t)) {
    return "participation_account";
  }
  if (/kampanya/.test(u + t) && /finansman|musteri ol|müşteri ol/.test(u + t)) {
    return "financing_campaign";
  }
  if (/ücret|ucret|masraf|tahsis/.test(u + t)) return "financing_fee";
  if (/kariyer|iş ilanı|kvkk|[cç]erez|blog|bas[iı]n|atm|[sş]ube/.test(u + t)) {
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
