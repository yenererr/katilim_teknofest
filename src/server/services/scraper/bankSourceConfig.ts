/**
 * Katılım bankası resmi kaynak envanteri.
 * Yalnızca bu listedeki domainler scrape edilebilir.
 */

export type SourceType =
  | "campaign_listing"
  | "product_listing"
  | "calculator"
  | "fees"
  | "homepage"
  | "discovery_only";

export type ParserMode = "static" | "dynamic" | "auto";

export type SeedUrlConfig = {
  url: string;
  sourceType: SourceType;
  parserMode: ParserMode;
};

export type BankSourceConfig = {
  bankId: string;
  bankName: string;
  enabled: boolean;
  allowedDomains: string[];
  seedUrls: SeedUrlConfig[];
  allowedPathPrefixes: string[];
  detailLinkPatterns: string[];
  excludedPathPatterns: string[];
};

/** Konvansiyonel banka domainleri — ASLA kabul edilmez */
export const BLOCKED_CONVENTIONAL_DOMAINS = [
  "vakifbank.com.tr",
  "ziraatbank.com.tr",
  "halkbank.com.tr",
  "isbank.com.tr",
  "garanti.com.tr",
  "garantibbva.com.tr",
  "akbank.com.tr",
  "yapikredi.com.tr",
  "qnb.com.tr",
  "qnbfinansbank.com.tr",
  "denizbank.com.tr",
  "teb.com.tr",
] as const;

export const BANK_SOURCE_CONFIGS: BankSourceConfig[] = [
  {
    bankId: "adil-katilim",
    bankName: "Adil Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: ["adilkatilim.com.tr", "www.adilkatilim.com.tr"],
    seedUrls: [
      { url: "https://www.adilkatilim.com.tr/", sourceType: "homepage", parserMode: "static" },
      {
        url: "https://www.adilkatilim.com.tr/katilim-bankaciligi/urun-ve-hizmetler",
        sourceType: "product_listing",
        parserMode: "static",
      },
      { url: "https://www.adilkatilim.com.tr/finansman", sourceType: "discovery_only", parserMode: "static" },
      {
        url: "https://www.adilkatilim.com.tr/hesaplama-araclari",
        sourceType: "discovery_only",
        parserMode: "static",
      },
    ],
    allowedPathPrefixes: ["/", "/katilim-bankaciligi", "/finansman", "/urun"],
    detailLinkPatterns: ["/finansman/", "/urun"],
    excludedPathPatterns: [
      "/giris",
      "/login",
      "/internet-subesi",
      "/kariyer",
      "/kvkk",
      "/cerez",
      "/gizlilik",
      "/bize-ulasin",
      "/yatirimci-iliskileri",
      "/musteri-memnuniyeti",
      "/hakkimizda",
    ],
  },
  {
    bankId: "albaraka",
    bankName: "Albaraka Türk Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: [
      "albaraka.com.tr",
      "www.albaraka.com.tr",
      "albarakaturk.com.tr",
      "www.albarakaturk.com.tr",
    ],
    seedUrls: [
      { url: "https://www.albaraka.com.tr/tr/kampanyalar", sourceType: "campaign_listing", parserMode: "static" },
      {
        url: "https://www.albarakaturk.com.tr/hesaplama-araclari.aspx",
        sourceType: "calculator",
        parserMode: "static",
      },
      {
        url: "https://www.albarakaturk.com.tr/konut-finansmani.aspx",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.albarakaturk.com.tr/urun-hizmet-ucretleri.aspx",
        sourceType: "fees",
        parserMode: "static",
      },
    ],
    allowedPathPrefixes: ["/tr/kampanyalar", "/hesaplama", "/konut", "/urun", "/finansman"],
    detailLinkPatterns: ["/tr/kampanyalar/detay/", "/kampanyalar/detay/"],
    excludedPathPatterns: ["/giris", "/login", "/internet", "/kariyer", "/kvkk"],
  },
  {
    bankId: "dunya-katilim",
    bankName: "Dünya Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: ["dunyakatilim.com.tr", "www.dunyakatilim.com.tr"],
    seedUrls: [
      { url: "https://dunyakatilim.com.tr/", sourceType: "homepage", parserMode: "static" },
      { url: "https://dunyakatilim.com.tr/kampanyalar", sourceType: "campaign_listing", parserMode: "static" },
    ],
    allowedPathPrefixes: ["/", "/kampanyalar", "/finansman", "/urun"],
    detailLinkPatterns: ["/kampanyalar/"],
    excludedPathPatterns: ["/giris", "/login", "/kvkk", "/cerez", "/kariyer"],
  },
  {
    bankId: "hayat-finans",
    bankName: "Hayat Finans Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: ["hayatfinans.com.tr", "www.hayatfinans.com.tr"],
    seedUrls: [
      { url: "https://hayatfinans.com.tr/kampanyalar", sourceType: "campaign_listing", parserMode: "static" },
      { url: "https://hayatfinans.com.tr/finansmanlar", sourceType: "product_listing", parserMode: "static" },
      { url: "https://hayatfinans.com.tr/finansmanlar-is", sourceType: "product_listing", parserMode: "static" },
      {
        url: "https://hayatfinans.com.tr/finansmanlar/bana-bunu-al-is-ortagim",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://hayatfinans.com.tr/krediler/bana-bunu-al",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://hayatfinans.com.tr/finansmanlar-is/mikro-finansman",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://hayatfinans.com.tr/finansmanlar-is/ticari-finansman",
        sourceType: "product_listing",
        parserMode: "static",
      },
    ],
    allowedPathPrefixes: ["/kampanyalar", "/finansmanlar", "/finansmanlar-is", "/krediler"],
    detailLinkPatterns: ["/kampanyalar/", "/finansmanlar/", "/finansmanlar-is/", "/krediler/"],
    excludedPathPatterns: ["/giris", "/login", "/kvkk", "/kariyer"],
  },
  {
    /**
     * BDDK 26.02.2026 tarih ve 11424 sayılı kararıyla faaliyet izni aldı.
     * Ürün ve hizmetler 2026'nın ikinci yarısında açılacağı için sitede
     * henüz kampanya/ürün listesi yok; yalnızca kurumsal ana sayfa taranır.
     * Kampanya sayfası yayına girdiğinde campaign_listing seed'i eklenmeli.
     */
    bankId: "iktisat-katilim",
    bankName: "İktisat Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: ["iktisatkatilim.com.tr", "www.iktisatkatilim.com.tr"],
    seedUrls: [
      { url: "https://www.iktisatkatilim.com.tr/", sourceType: "homepage", parserMode: "static" },
    ],
    allowedPathPrefixes: ["/", "/kampanyalar", "/urun", "/finansman"],
    detailLinkPatterns: ["/kampanyalar/", "/urun"],
    excludedPathPatterns: ["/giris", "/login", "/internet-subesi", "/kariyer", "/kvkk", "/cerez"],
  },
  {
    bankId: "kuveyt-turk",
    bankName: "Kuveyt Türk Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: ["kuveytturk.com.tr", "www.kuveytturk.com.tr"],
    seedUrls: [
      {
        url: "https://www.kuveytturk.com.tr/kampanyalar/kendim-icin",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.kuveytturk.com.tr/kampanyalar/kendim-icin/finansman-kampanyalari",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.kuveytturk.com.tr/kampanyalar/kendim-icin/musteri-ol-kampanyalari",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.kuveytturk.com.tr/kampanyalar/kendim-icin/kart-kampanyalari",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.kuveytturk.com.tr/hesaplama-araclari/finansman-hesaplama",
        sourceType: "calculator",
        parserMode: "auto",
      },
      {
        url: "https://www.kuveytturk.com.tr/kendim-icin/finansmanlar/ihtiyac-finansmanlari",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.kuveytturk.com.tr/kendim-icin/finansmanlar/arac-finansmanlari",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.kuveytturk.com.tr/kendim-icin/finansmanlar/arac-finansmanlari/arac-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.kuveytturk.com.tr/kendim-icin/finansmanlar/konut-finansmanlari/ilk-evim-konut-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.kuveytturk.com.tr/kendim-icin/finansmanlar/alisveris-finansmanlari/alisveris-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.kuveytturk.com.tr/blog/finans/eftye-dair-merak-edilenler",
        sourceType: "fees",
        parserMode: "static",
      },
    ],
    allowedPathPrefixes: ["/kampanyalar", "/hesaplama-araclari", "/kendim-icin/finansmanlar", "/blog"],
    detailLinkPatterns: ["/kampanyalar/"],
    excludedPathPatterns: ["/giris", "/login", "/internet-subesi", "/kvkk", "/arsiv"],
  },
  {
    bankId: "tom-katilim",
    bankName: "T.O.M. Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: ["tombank.com.tr", "www.tombank.com.tr", "tombankhadi.com", "www.tombankhadi.com"],
    seedUrls: [
      { url: "https://tombank.com.tr/", sourceType: "homepage", parserMode: "static" },
      { url: "https://tombank.com.tr/kampanyalar.html", sourceType: "campaign_listing", parserMode: "static" },
      { url: "https://tombankhadi.com/kampanyalar", sourceType: "campaign_listing", parserMode: "static" },
      {
        url: "https://tombankhadi.com/hadi-kazan/bayii-kampanyalari",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      { url: "https://tombank.com.tr/urunlerimiz.html", sourceType: "product_listing", parserMode: "static" },
      {
        url: "https://tombank.com.tr/hesaplama-araclari.html",
        sourceType: "calculator",
        parserMode: "auto",
      },
      {
        url: "https://www.tombank.com.tr/magazadan-alisveris-kredisi.html",
        sourceType: "product_listing",
        parserMode: "static",
      },
      { url: "https://tombank.com.tr/taksitle.html", sourceType: "product_listing", parserMode: "static" },
      { url: "https://tombank.com.tr/hadi-kredi-karti.html", sourceType: "product_listing", parserMode: "static" },
    ],
    allowedPathPrefixes: ["/", "/urun", "/hesaplama", "/magaza", "/taksit", "/hadi", "/kampanya", "/hadi-kazan"],
    detailLinkPatterns: [".html", "/kampanyalar/", "/hadi-kazan/"],
    excludedPathPatterns: ["/giris", "/login", "/kvkk"],
  },
  {
    bankId: "emlak-katilim",
    bankName: "Türkiye Emlak Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: [
      "emlakkatilim.com.tr",
      "www.emlakkatilim.com.tr",
      "mortgage.emlakkatilim.com.tr",
    ],
    seedUrls: [
      {
        url: "https://www.emlakkatilim.com.tr/tr/bireysel/kampanyalar",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.emlakkatilim.com.tr/tr/bireysel/finansmanlar",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.emlakkatilim.com.tr/tr/bireysel/finansmanlar/konut-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.emlakkatilim.com.tr/tr/bireysel/finansmanlar/tasit-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.emlakkatilim.com.tr/tr/bireysel/finansmanlar/ihtiyac-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://mortgage.emlakkatilim.com.tr/finansman-hesaplama",
        sourceType: "calculator",
        parserMode: "auto",
      },
    ],
    allowedPathPrefixes: ["/tr/bireysel", "/finansman-hesaplama"],
    detailLinkPatterns: ["/tr/bireysel/kampanyalar/kampanya/", "/tr/bireysel/finansmanlar/"],
    excludedPathPatterns: ["/giris", "/login", "/internet", "/kvkk"],
  },
  {
    bankId: "turkiye-finans",
    bankName: "Türkiye Finans Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: ["turkiyefinans.com.tr", "www.turkiyefinans.com.tr"],
    seedUrls: [
      {
        url: "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/default.aspx",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/finansman-kampanyalari.aspx",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/dijital-bankacilik-kampanyalari.aspx",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/ticari-kampanyalar.aspx",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/biten-kampanyalar.aspx",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.turkiyefinans.com.tr/tr-tr/hesaplama-araclari/sayfalar/finansman-odeme-plani.aspx",
        sourceType: "calculator",
        parserMode: "auto",
      },
      {
        url: "https://www.turkiyefinans.com.tr/tr-tr/hesaplama-araclari/sayfalar/hesaplama-araclari.aspx",
        sourceType: "calculator",
        parserMode: "static",
      },
      {
        url: "https://www.turkiyefinans.com.tr/tr-tr/bireysel/ihtiyac-finansmani/sayfalar/ihtiyac-finansmani.aspx",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.turkiyefinans.com.tr/tr-tr/kampanyalar/sayfalar/masrafsiz-bankacilik.aspx",
        sourceType: "fees",
        parserMode: "static",
      },
    ],
    allowedPathPrefixes: ["/tr-tr/kampanyalar", "/tr-tr/hesaplama-araclari", "/tr-tr/bireysel"],
    detailLinkPatterns: ["/tr-tr/kampanyalar/", "/tr-tr/bireysel/"],
    excludedPathPatterns: ["/giris", "/login", "/internet", "/kvkk", "/kariyer"],
  },
  {
    bankId: "vakif-katilim",
    bankName: "Vakıf Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: ["vakifkatilim.com.tr", "www.vakifkatilim.com.tr"],
    seedUrls: [
      {
        url: "https://www.vakifkatilim.com.tr/tr/kendim-icin/kampanyalar",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.vakifkatilim.com.tr/tr/kendim-icin/finansmanlar",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.vakifkatilim.com.tr/tr/kendim-icin/finansmanlar/ihtiyac-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.vakifkatilim.com.tr/tr/kendim-icin/finansmanlar/tasit-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.vakifkatilim.com.tr/tr/kendim-icin/finansmanlar/konut-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.vakifkatilim.com.tr/tr/yardimci-sayfalar/hesaplama-araclari",
        sourceType: "calculator",
        parserMode: "static",
      },
      {
        url: "https://www.vakifkatilim.com.tr/tr/yardimci-sayfalar/hesaplama-araclari/finansman-hesaplama",
        sourceType: "calculator",
        parserMode: "auto",
      },
      {
        url: "https://www.vakifkatilim.com.tr/tr/yardimci-sayfalar/urun-ve-hizmet-ucretleri",
        sourceType: "fees",
        parserMode: "static",
      },
    ],
    allowedPathPrefixes: ["/tr/kendim-icin", "/tr/yardimci-sayfalar"],
    detailLinkPatterns: ["/tr/kendim-icin/kampanyalar/detay/", "/tr/kendim-icin/finansmanlar/"],
    excludedPathPatterns: ["/giris", "/login", "/internet", "/kvkk"],
  },
  {
    bankId: "ziraat-katilim",
    bankName: "Ziraat Katılım Bankası A.Ş.",
    enabled: true,
    allowedDomains: ["ziraatkatilim.com.tr", "www.ziraatkatilim.com.tr"],
    seedUrls: [
      { url: "https://www.ziraatkatilim.com.tr/", sourceType: "homepage", parserMode: "static" },
      {
        url: "https://www.ziraatkatilim.com.tr/bireysel/kampanyalar",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.ziraatkatilim.com.tr/kart-kampanyalari",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.ziraatkatilim.com.tr/kart-kampanyalari/ziraat-katilim-avantajli-bankkart-kampanyalari",
        sourceType: "campaign_listing",
        parserMode: "static",
      },
      {
        url: "https://www.ziraatkatilim.com.tr/bireysel/finansman-urunleri",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.ziraatkatilim.com.tr/bireysel/finansman-urunleri/konut-gayrimenkul-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.ziraatkatilim.com.tr/bireysel/finansman-urunleri/tasit-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.ziraatkatilim.com.tr/bireysel/finansman-urunleri/ihtiyac-finansmani",
        sourceType: "product_listing",
        parserMode: "static",
      },
      {
        url: "https://www.ziraatkatilim.com.tr/finansal-hesaplama-araci",
        sourceType: "calculator",
        parserMode: "auto",
      },
    ],
    allowedPathPrefixes: ["/", "/bireysel", "/kart-kampanyalari", "/finansal-hesaplama"],
    detailLinkPatterns: ["/bireysel/kampanyalar/", "/bireysel/finansman-urunleri/", "/kart-kampanyalari/"],
    excludedPathPatterns: ["/giris", "/login", "/internet", "/kvkk", "/kariyer"],
  },
];

export function getBankConfig(bankId: string): BankSourceConfig | undefined {
  return BANK_SOURCE_CONFIGS.find((b) => b.bankId === bankId);
}

export function getAllAllowedDomains(): string[] {
  return BANK_SOURCE_CONFIGS.flatMap((b) => b.allowedDomains);
}

export function isPrimaryFinanceCategory(category: string): boolean {
  return [
    "housing_finance",
    "vehicle_finance",
    "consumer_finance",
    "shopping_finance",
    "commercial_finance",
    "participation_account",
    "profit_share_rate",
    "financing_fee",
    "financing_campaign",
    "new_customer_financing",
  ].includes(category);
}
