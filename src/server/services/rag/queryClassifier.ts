import type { RagIntent } from "./ragTypes";

const RULES: Array<{ intent: RagIntent; patterns: RegExp[] }> = [
  {
    intent: "unsupported",
    patterns: [
      /yatırım tavsiyesi|borsa|kripto|bitcoin|garanti et|kesin kazan/i,
      /hack|şifre çal|prompt.?injection/i,
    ],
  },
  {
    intent: "comparison",
    patterns: [
      /karşılaştır|karsilastir|en düşük|en dusuk|en yüksek|en yuksek|hangisi (daha|en)|arasında|arasinda/i,
      /en avantajlı|en avantajli|en uygun/i,
    ],
  },
  {
    intent: "calculation",
    patterns: [
      /hesapla|taksit tutar|aylık ödeme|aylik odeme|maliyet hesap/i,
    ],
  },
  {
    intent: "fee_search",
    patterns: [
      /ücret|ucret|masraf|tahsis|aidat|komisyon|dosya masraf/i,
    ],
  },
  {
    intent: "campaign_search",
    patterns: [/kampanya|promosyon|indirim|ödül|odul|fırsat|firsat/i],
  },
  {
    intent: "condition_question",
    patterns: [
      /şart|sart|koşul|kosul|gereksinim|başvuru|basvuru|istisna|kimler yarar/i,
    ],
  },
  {
    intent: "source_request",
    patterns: [/kaynak|kanıt|kanit|nereden|hangi url|resmî site|resmi site/i],
  },
  {
    intent: "product_search",
    patterns: [
      /finansman|konut|taşıt|tasit|ihtiyaç|ihtiyac|murabaha|ürün|urun|kâr payı|kar payi/i,
    ],
  },
];

/**
 * Deterministik soru sınıflandırma. Belirsizse general_information.
 */
export function classifyQuery(message: string): RagIntent {
  const text = message.trim();
  if (!text) return "unsupported";

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return rule.intent;
    }
  }
  return "general_information";
}
