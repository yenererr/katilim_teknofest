import "dotenv/config";
import crypto from "crypto";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { asciiKatla, terimOzeti } from "./src/nlp";
import { createQdrantRouter } from "./src/server/routes/qdrantRoutes";
import { createAssistantRouter } from "./src/server/routes/assistantRoutes";
import { createCalculatorRouter } from "./src/server/routes/calculatorRoutes";
import {
  createLiveDataRouter,
  createSystemRouter,
} from "./src/server/routes/liveDataRoutes";
import findeksRoutes from "./src/server/routes/findeksRoutes";
import { createSpeechRouter } from "./src/server/routes/speechRoutes";
import { bindOfficialScraperBridge, runOfficialScrapeJob } from "./src/server/services/scraper/orchestrator";
import { BANK_SOURCE_CONFIGS } from "./src/server/services/scraper/bankSourceConfig";
import {
  ensureSchema,
  hydrateMemoryFromPostgres,
  loadCampaignMemoryCache,
  seedVerifiedResearchRecords,
} from "./src/server/services/postgres/store";
import {
  buildIndexDocumentsFromScrape,
  getCollectionHealth,
  getDocumentIndexer,
  isQdrantConfigured,
  sanitizeErrorMessage,
} from "./src/server/services/qdrant";

bindOfficialScraperBridge();

const app = express();
// Dokploy/konteyner ortamları portu PORT değişkeniyle bildirir.
const PORT = Number(process.env.PORT) || 3000;

// Konuşma proxy'si gövde ayrıştırıcısından ÖNCE bağlanır: ses yükü ham akış
// olarak aktarılır, express.json() onu tüketirse istek bozulur.
app.use("/api/speech", createSpeechRouter());

app.use(express.json({ limit: "25mb" }));
app.use("/api/findeks", findeksRoutes);

// SSB EVREN (OpenAI uyumlu) yapılandırması
const EVREN_BASE_URL = process.env.EVREN_BASE_URL || "https://evren-llmapi.ssyz.org.tr/v1";
const EVREN_MODEL = process.env.EVREN_MODEL || "llm-fast";
const EVREN_TIMEOUT_MS = 1_800_000;
const MAX_EVREN_ATTEMPTS = 3;
const SCRAPER_ENABLED = process.env.SCRAPER_ENABLED !== "false";
const SCRAPER_INTERVAL_MINUTES = Math.max(Number(process.env.SCRAPER_INTERVAL_MINUTES || 30), 5);
const SCRAPER_TEXT_LIMIT = 10_000;

interface BankScrapeSource {
  id: string;
  bankName: string;
  urls: string[];
}

interface BankScrapeState extends BankScrapeSource {
  status: "beklemede" | "degismedi" | "guncellendi" | "hata";
  contentHash: string | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastExtractedAt: string | null;
  products: any[];
  error: string | null;
  /** Qdrant indeksleme durumu — sayısal ürün verisinden bağımsız */
  indexStatus?: "atlandi" | "indekslendi" | "hata" | "yapilandirilmadi" | null;
  indexError?: string | null;
  indexedAt?: string | null;
}

/** BDDK katılım bankası listesi — `bankSourceConfig` ile tek kaynak. */
const BANK_SCRAPE_SOURCES: BankScrapeSource[] = BANK_SOURCE_CONFIGS.filter(
  (b) => b.enabled,
).map((b) => ({
  id: b.bankId,
  bankName: b.bankName
    .replace(/\s+Katılım Bankası A\.Ş\.$/u, "")
    .replace(/\s+Bankası A\.Ş\.$/u, ""),
  urls: b.seedUrls.map((s) => s.url),
}));

let scrapeStates: Record<string, BankScrapeState> = Object.fromEntries(
  BANK_SCRAPE_SOURCES.map((source) => [
    source.id,
    {
      ...source,
      status: "beklemede",
      contentHash: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastExtractedAt: null,
      products: [],
      error: null,
    },
  ]),
);
let scrapeRunning = false;

/**
 * SSB EVREN chat completions çağrısı.
 * API anahtarı yoksa null döner; çağıran taraf kural tabanlı fallback'e düşer.
 */
async function callEvren(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; usedModel: string | null; modelWarning: string | null } | null> {
  const apiKey = process.env.EVREN_API_KEY;
  if (!apiKey) return null;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_EVREN_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EVREN_TIMEOUT_MS);

    try {
      const res = await fetch(`${EVREN_BASE_URL}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EVREN_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.0,
          max_tokens: 4096,
          response_format: { type: "json_object" },
          stream: false,
        }),
      });

      if (!res.ok) {
        const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
        const detail = await res.text().catch(() => "");
        const safeDetail = detail.replace(apiKey, "[gizlendi]").slice(0, 500);
        const error = new Error(`EVREN API ${res.status}: ${safeDetail}`);

        if (retryable && attempt < MAX_EVREN_ATTEMPTS) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)));
          continue;
        }

        throw error;
      }

      const data: any = await res.json();
      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      const finishReason = choice?.finish_reason ?? "bilinmiyor";
      const usedModel = typeof data?.model === "string" ? data.model : null;
      const modelWarning =
        usedModel && usedModel !== EVREN_MODEL
          ? `İstenen model "${EVREN_MODEL}" idi, API "${usedModel}" modelini çalıştırdı.`
          : null;

      if (typeof content === "string" && content.trim().length > 0) {
        return { content, usedModel, modelWarning };
      }

      throw new Error(`EVREN API boş yanıt döndürdü. finish_reason=${finishReason}`);
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError";
      const isConnectionError = err instanceof TypeError;
      lastError = new Error(
        isTimeout
          ? "EVREN API isteği zaman aşımına uğradı."
          : isConnectionError
            ? "EVREN API bağlantısı kurulamadı."
            : err?.message || "EVREN API çağrısı başarısız oldu.",
      );

      if ((isTimeout || isConnectionError) && attempt < MAX_EVREN_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** (attempt - 1)));
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("EVREN API çağrısı başarısız oldu.");
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&scedil;/gi, "ş")
    .replace(/&Scedil;/g, "Ş")
    .replace(/&gbreve;/gi, "ğ")
    .replace(/&Gbreve;/g, "Ğ")
    .replace(/&imath;/gi, "ı")
    .replace(/&Idot;/g, "İ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "KatilimFinansAsistani/1.0 (+https://github.com/yenererr/katilim_teknofest)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return htmlToPlainText(await res.text());
  } finally {
    clearTimeout(timeoutId);
  }
}

async function scrapeOneBank(source: BankScrapeSource, force = false): Promise<BankScrapeState> {
  const now = new Date().toISOString();
  const previous = scrapeStates[source.id];

  try {
    const pageTexts = await Promise.all(
      source.urls.map(async (url) => {
        const text = await fetchText(url);
        return `KAYNAK: ${url}\n${text}`;
      }),
    );
    const combinedText = pageTexts.join("\n\n---\n\n").slice(0, SCRAPER_TEXT_LIMIT);
    const contentHash = crypto.createHash("sha256").update(combinedText).digest("hex");

    if (!force && previous?.contentHash === contentHash) {
      scrapeStates[source.id] = {
        ...previous,
        ...source,
        status: "degismedi",
        lastCheckedAt: now,
        error: null,
        indexStatus: previous.indexStatus ?? "atlandi",
        indexError: null,
      };
      return scrapeStates[source.id];
    }

    let resultJson: any = null;
    try {
      const evrenResponse = await callEvren(
        EXTRACTION_SYSTEM_PROMPT,
        `${source.bankName} web sitesinden alınan aşağıdaki metinleri analiz et. Finansman, kampanya, ücret, masraf, vade, kâr payı ve ödül bilgilerini JSON şemasına göre çıkar. Yalnızca metinde açıkça bulunan alanları doldur. Tekrarlanan menü, footer ve navigasyon metinlerini yok say. En fazla 8 en anlamlı ürün/kampanya döndür; geçerli JSON dışında metin yazma.\n\n${combinedText}`,
      );

      if (evrenResponse?.content) {
        let cleanText = evrenResponse.content.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.replace(/^```json\s*/, "").replace(/```$/, "").trim();
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```\s*/, "").replace(/```$/, "").trim();
        }
        resultJson = JSON.parse(cleanText);
      }
    } catch (err: any) {
      console.warn(`[Scraper] ${source.bankName} EVREN çıkarımı başarısız:`, err?.message || err);
    }

    if (!resultJson || !Array.isArray(resultJson.urunler)) {
      resultJson = fallbackRuleExtractor(combinedText);
    }

    const products = resultJson.urunler || [];
    let indexStatus: BankScrapeState["indexStatus"] = "yapilandirilmadi";
    let indexError: string | null = null;
    let indexedAt: string | null = null;

    if (isQdrantConfigured()) {
      try {
        const docs = buildIndexDocumentsFromScrape({
          bankId: source.id,
          bankName: source.bankName,
          sourceId: source.id,
          sourceUrls: source.urls,
          combinedText,
          contentHash,
          sourceCheckedAt: now,
          products,
        });
        const indexer = getDocumentIndexer();
        await indexer.replaceSourceDocuments(source.id, docs);
        indexStatus = "indekslendi";
        indexedAt = new Date().toISOString();
      } catch (indexErr: any) {
        indexStatus = "hata";
        indexError = sanitizeErrorMessage(
          indexErr?.message || "Qdrant indeksleme başarısız oldu.",
        );
        console.warn(`[Qdrant] ${source.bankName} indeksleme:`, indexError);
      }
    }

    scrapeStates[source.id] = {
      ...source,
      status: "guncellendi",
      contentHash,
      lastCheckedAt: now,
      lastChangedAt: now,
      lastExtractedAt: now,
      products,
      error: null,
      indexStatus,
      indexError,
      indexedAt,
    };
    return scrapeStates[source.id];
  } catch (err: any) {
    scrapeStates[source.id] = {
      ...previous,
      ...source,
      status: "hata",
      lastCheckedAt: now,
      error: err?.message || "Scrape işlemi başarısız oldu.",
      indexStatus: previous?.indexStatus ?? null,
      indexError: previous?.indexError ?? null,
      indexedAt: previous?.indexedAt ?? null,
    };
    return scrapeStates[source.id];
  }
}

async function refreshScrapeSources(force = false, bankIds?: string[]) {
  if (scrapeRunning) return scrapeStates;
  scrapeRunning = true;
  try {
    const sources = bankIds?.length
      ? BANK_SCRAPE_SOURCES.filter((s) => bankIds.includes(s.id))
      : BANK_SCRAPE_SOURCES;
    for (const source of sources) {
      await scrapeOneBank(source, force);
    }
    return scrapeStates;
  } finally {
    scrapeRunning = false;
  }
}

const EXTRACTION_SYSTEM_PROMPT = `
Sen katılım bankacılığı alanında uzmanlaşmış bir bilgi çıkarım ajanısın.
Görevin, Türkiye'deki katılım bankalarının resmî web sitelerinden alınmış ham kampanya ve ürün metinlerini okuyup, aşağıda tanımlanan şemaya uygun yapılandırılmış JSON üretmektir.

## TEMEL KURAL
Yalnızca metinde AÇIKÇA yazan bilgiyi çıkar. Çıkarım yapma, tahmin etme, sektör ortalamasıyla doldurma. Bir alan metinde yoksa değeri null olmalı ve o alan için güven skoru 0 verilmelidir. Eksik veri, yanlış veriden iyidir.

## TERMİNOLOJİ
Katılım bankacılığı terminolojisini kullan. Konvansiyonel terimleri karşılıklarına eşle, çıktıda ASLA konvansiyonel terimi yazma.
Temel eşlemeler (denklik farklı olabilir; yine de katılım ifadesini kullan):
  faiz / faiz oranı / kredi faizi     → kâr payı / kâr marjı     → alan: kar_payi_orani
  kredi / konut-taşıt-ticari kredi    → finansman                → alan: urun_turu
  faizli kredi                        → murabaha finansmanı      → alan: urun_turu
  mevduat                             → katılma hesabı           → alan: urun_turu
  mevduat faizi                       → kâr payı                 → alan: kar_payi_orani
  anapara                             → finanse edilen tutar     → alan: tutar
  kredi vadesi / taksiti / limiti     → finansman vadesi/taksiti/limiti
  dosya masrafı                       → tahsis ücreti            → alan: tahsis_ucreti
  kart puanı                          → ödül                     → alan: odul
Kaynak metin konvansiyonel terim kullanıyorsa çıkarımı yine yap ancak terim_esleme_uygulandi: true işaretle.
"Denk değil" seviyesindeki çiftlerde (faiz≠kâr payı, mevduat≠katılma hesabı) asla geleneksel terimi çıktıya yazma.

## NORMALİZASYON KURALLARI
1. Oranlar: "%2,05" · "2.05 %" · "yüzde 2,05" → 0.0205 (ondalık, nokta ayraç)
2. Tutarlar: "500₺" · "500 TL" · "Beş yüz Türk Lirası" → 500.00
3. Para birimi ayrı alanda: TRY / USD / EUR / XAU
4. Vadeler her zaman AY cinsinden: "10 yıl" → 120, "1 yıl" → 12, "31-365 gün" → min: 1, max: 12
5. Aralık ifadeleri min/max çifti olur:
   "36 aya varan"     → min: null, max: 36
   "12-36 ay arası"   → min: 12,   max: 36
   "sabit 24 ay"      → min: 24,   max: 24
6. Olumsuz ifadeler sayısal değere iner:
   "tahsis ücreti alınmaz" → deger: 0.00, tipi: "yok", guven: 1.0
   "dosya masrafı yok" → deger: 0.00, tipi: "yok", guven: 1.0
7. Kâr payı periyodu: metin "aylık" veya "yıllık" demiyorsa
   kar_payi_periyot: "belirsiz" ve o alanın güven skoru en fazla 0.5 olur.
   ASLA varsayılan olarak aylık kabul etme.

## ÜRÜN TÜRÜ SINIFLANDIRMASI
Şu kapalı listeden tam olarak bir değer seç:
konut_finansmani · tasit_finansmani · ihtiyac_finansmani · kart · katilim_fonu · yatirim · alisveris_puani · diger
Emin değilsen "diger" seç ve güven skorunu düşür.

## MÜŞTERİ SEGMENTİ
Çoklu seçim, kapalı liste:
yeni_musteri · mevcut_musteri · kurumsal · kobi · genc · emekli · tumu
Metin belirtmiyorsa "tumu" değil, boş dizi [] döndür.

## KANIT ZORUNLULUĞU
Çıkardığın HER alan için, o değerin dayandığı cümleyi kanitlar nesnesinde birebir kaynak metinden alıntıla. Kanıt gösteremiyorsan o alanı çıkarma.

## GÜVEN SKORU
Her alan için 0.0–1.0 arası skor ver:
  0.9–1.0  değer metinde açıkça ve tek anlamlı yazılı
  0.6–0.8  değer yazılı ama biçim veya birim yoruma açık
  0.3–0.5  dolaylı çıkarım gerekti veya periyot/birim belirsiz
  0.0      alan metinde yok
Ortalama güven (ortalama_guven) 0.6'nın altındaysa manuel_dogrulama_gerekli: true işaretle.

## ÇIKTI FORMATI
Yalnızca geçerli JSON döndür. Kod bloğu markatörleri veya açıklama EKLEME. 
Şu JSON yapısına BİREBİR uy:
{
  "urunler": [
    {
      "urun_adi": "string | null",
      "urun_turu": "konut_finansmani | tasit_finansmani | ihtiyac_finansmani | kart | katilim_fonu | yatirim | alisveris_puani | diger",
      "musteri_segmenti": ["yeni_musteri", "mevcut_musteri"],
      "kampanya_baslangic": "YYYY-MM-DD | null",
      "kampanya_bitis": "YYYY-MM-DD | null",
      "terimler": {
        "kar_payi_orani": { "ham": "%2,05'ten başlayan", "deger": 0.0205, "periyot": "aylik", "guven": 0.9 },
        "vade_ay": { "ham": "120 aya varan", "min": null, "max": 120, "guven": 0.95 },
        "tahsis_ucreti": { "ham": "500₺", "deger": 500.00, "tipi": "sabit", "para_birimi": "TRY", "guven": 1.0 },
        "tutar": { "ham": "100.000 TL ile 5.000.000 TL arası", "min": 100000.00, "max": 5000000.00, "para_birimi": "TRY", "guven": 0.9 },
        "taksit_sayisi": { "ham": null, "deger": null, "guven": 0.0 },
        "odul": { "ham": null, "deger": null, "tipi": null, "guven": 0.0 }
      },
      "kanitlar": {
        "kar_payi_orani": "Konut finansmanında aylık kâr payı oranı %2,05'ten başlıyor.",
        "vade_ay": "Vade seçenekleri 120 aya kadar uzuyor.",
        "tahsis_ucreti": "Finansman kullandırımında 500₺ sabit tahsis ücreti alınmaktadır."
      },
      "terim_esleme_uygulandi": false,
      "ortalama_guven": 0.85,
      "manuel_dogrulama_gerekli": false,
      "notlar": "Metinle ilgili varsa belirsizlik notları veya null"
    }
  ]
}
`;

// API Routes
app.use("/api/qdrant", createQdrantRouter());
app.use("/api/assistant", createAssistantRouter());
app.use("/api/live", createLiveDataRouter());
app.use("/api/calculators", createCalculatorRouter());
app.use("/api/system", createSystemRouter());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "katilim-bilgi-cikarim-ajani",
    provider: "ssb-evren",
    model: EVREN_MODEL,
    base_url: EVREN_BASE_URL,
    api_key_configured: Boolean(process.env.EVREN_API_KEY),
    qdrant_configured: isQdrantConfigured(),
  });
});

app.post("/api/extract", async (req, res) => {
  const startTime = Date.now();
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Lütfen analiz edilecek bir metin giriniz." });
    }

    let resultJson: any = null;
    let usedModel: string | null = null;
    let modelWarning: string | null = null;

    try {
      const evrenResponse = await callEvren(
        EXTRACTION_SYSTEM_PROMPT,
        `Aşağıdaki katılım bankacılığı metnini analiz et ve JSON verisini üret:\n\nMETİN:\n${text}`
      );

      if (evrenResponse !== null) {
        usedModel = evrenResponse.usedModel;
        modelWarning = evrenResponse.modelWarning;

        // Bazı modeller JSON'u markdown kod bloğu içinde döndürebiliyor
        let cleanText = evrenResponse.content.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.replace(/^```json\s*/, "").replace(/```$/, "").trim();
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```\s*/, "").replace(/```$/, "").trim();
        }

        resultJson = JSON.parse(cleanText);
      }
    } catch (evrenError: any) {
      console.warn("EVREN API uyarısı, kural tabanlı çıkarıma düşüldü:", evrenError?.message || evrenError);
    }

    // EVREN erişilemezse veya hata verirse kural tabanlı çıkarıma düş
    if (!resultJson || !Array.isArray(resultJson.urunler)) {
      resultJson = fallbackRuleExtractor(text);
    }

    // Konvansiyonel terim tespiti — NLP katmanındaki sözlükbirim eşleyiciyle.
    // Not: JS'in toLowerCase() metodu Türkçe bilmez ("FAİZ" -> "fai̇z"), bu yüzden
    // eşleştirme asciiKatla() üzerinden yapılır ve çekim eklerine toleranslıdır.
    const conventionalTermsFound = terimOzeti(text).map(
      (t) => `${t.orig} -> ${t.mapped}`,
    );

    const duration = Date.now() - startTime;

    return res.json({
      urunler: resultJson.urunler || [],
      meta: {
        duration_ms: duration,
        extracted_at: new Date().toISOString(),
        conventional_terms_detected: conventionalTermsFound,
        provider: "ssb-evren",
        requested_model: EVREN_MODEL,
        used_model: usedModel,
        model_warning: modelWarning,
      },
    });
  } catch (err: any) {
    console.error("Extraction error:", err);
    return res.status(500).json({ error: "Bilgi çıkarımı sırasında bir hata oluştu: " + (err.message || err) });
  }
});

/**
 * Fallback Rule Extractor in case server API key is unconfigured or offline.
 * Implements regex normalizations and exact structure guarantees.
 */
function fallbackRuleExtractor(text: string) {
  // Türkçe uyumlu katlama: "TAŞIT" -> "tasit", "FAİZ" -> "faiz"
  const lower = asciiKatla(text);
  
  // Product classification
  let urunTuru = "diger";
  // Not: `lower` ASCII katlanmış olduğundan aranan kalıplar da ASCII yazılır.
  if (lower.includes("konut")) urunTuru = "konut_finansmani";
  else if (lower.includes("tasit") || lower.includes("arac")) urunTuru = "tasit_finansmani";
  else if (lower.includes("ihtiyac")) urunTuru = "ihtiyac_finansmani";
  else if (lower.includes("kart")) urunTuru = "kart";
  else if (lower.includes("katilma") || lower.includes("katilim fonu") || lower.includes("hesap")) urunTuru = "katilim_fonu";

  // Segment detection
  const segmentler: string[] = [];
  if (lower.includes("yeni musteri")) segmentler.push("yeni_musteri");
  if (lower.includes("mevcut musteri") || lower.includes("bireysel")) segmentler.push("mevcut_musteri");
  if (lower.includes("kobi") || lower.includes("uretici")) segmentler.push("kobi");
  if (lower.includes("kurumsal")) segmentler.push("kurumsal");
  if (lower.includes("genc")) segmentler.push("genc");
  if (lower.includes("emekli")) segmentler.push("emekli");

  // Conventional term check
  const hasFaiz = lower.includes("faiz");
  const hasKredi = lower.includes("kredi");
  const hasMevduat = lower.includes("mevduat");
  const hasDosyaMasrafi = lower.includes("dosya masrafı");
  const hasKartPuani = lower.includes("kart puanı");
  const terimEslemeUygulandi = hasFaiz || hasKredi || hasMevduat || hasDosyaMasrafi || hasKartPuani;

  // Rate extraction
  let karPayiMatch = text.match(/%(?:\s*)(\d+[,.]?\d*)/) || text.match(/(\d+[,.]?\d*)\s*%/);
  let karPayiValue: number | null = null;
  let karPayiHam: string | null = null;
  if (karPayiMatch) {
    karPayiHam = karPayiMatch[0];
    const valNum = parseFloat(karPayiMatch[1].replace(',', '.'));
    karPayiValue = valNum / 100;
  }

  // Periyot detection
  let periyot = "belirsiz";
  let karPayiGuven = 0.5;
  if (lower.includes("aylık") || lower.includes("aylik")) {
    periyot = "aylik";
    karPayiGuven = 0.95;
  } else if (lower.includes("yıllık") || lower.includes("yillik")) {
    periyot = "yillik";
    karPayiGuven = 0.95;
  }

  // Vade ay extraction
  let vadeMatch = text.match(/(\d+)\s*(ay|yıl|yil)/i);
  let vadeMax: number | null = null;
  let vadeMin: number | null = null;
  let vadeHam: string | null = null;
  if (vadeMatch) {
    vadeHam = vadeMatch[0];
    let num = parseInt(vadeMatch[1], 10);
    const unit = vadeMatch[2].toLowerCase();
    if (unit.startsWith("yıl") || unit.startsWith("yil")) num = num * 12;
    vadeMax = num;
  }

  // Fee extraction
  let feeHam: string | null = null;
  let feeVal: number | null = null;
  let feeTipi = "belirsiz";
  let feeGuven = 0.0;
  if (lower.includes("tahsis ücreti alınmaz") || lower.includes("dosya masrafı ve tahsis ücreti alınmaz") || lower.includes("ücret alınmaz") || lower.includes("aidatı yok")) {
    feeHam = "Tahsis ücreti / masraf alınmaz";
    feeVal = 0.0;
    feeTipi = "yok";
    feeGuven = 1.0;
  } else {
    const feeMatch = text.match(/(\d+[\d.]*)\s*(₺|tl|türk lirası)/i);
    if (feeMatch) {
      feeHam = feeMatch[0];
      feeVal = parseFloat(feeMatch[1].replace(/\./g, '').replace(',', '.'));
      feeTipi = "sabit";
      feeGuven = 0.9;
    }
  }

  // Quotes
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kanitlar: Record<string, string> = {};
  if (karPayiHam) {
    const s = sentences.find(st => st.includes(karPayiHam!)) || sentences[0];
    if (s) kanitlar.kar_payi_orani = s;
  }
  if (vadeHam) {
    const s = sentences.find(st => st.includes(vadeHam!)) || sentences[0];
    if (s) kanitlar.vade_ay = s;
  }
  if (feeHam) {
    const s = sentences.find(st => asciiKatla(st).includes("tahsis") || asciiKatla(st).includes("masraf") || st.includes(feeHam!)) || sentences[0];
    if (s) kanitlar.tahsis_ucreti = s;
  }

  const scores = [karPayiValue !== null ? karPayiGuven : 0, vadeMax !== null ? 0.9 : 0, feeGuven].filter(s => s > 0);
  const ortalamaGuven = scores.length > 0 ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0.5;

  return {
    urunler: [
      {
        urun_adi: text.slice(0, 40) + "...",
        urun_turu: urunTuru,
        musteri_segmenti: segmentler.length ? segmentler : [],
        kampanya_baslangic: null,
        kampanya_bitis: null,
        terimler: {
          kar_payi_orani: { ham: karPayiHam, deger: karPayiValue, periyot, guven: karPayiValue !== null ? karPayiGuven : 0.0 },
          vade_ay: { ham: vadeHam, min: vadeMin, max: vadeMax, guven: vadeMax !== null ? 0.9 : 0.0 },
          tahsis_ucreti: { ham: feeHam, deger: feeVal, tipi: feeTipi, para_birimi: "TRY", guven: feeGuven },
          tutar: { ham: null, min: null, max: null, para_birimi: null, guven: 0.0 },
          taksit_sayisi: { ham: null, deger: null, guven: 0.0 },
          odul: { ham: null, deger: null, tipi: null, guven: 0.0 },
        },
        kanitlar,
        terim_esleme_uygulandi: terimEslemeUygulandi,
        ortalama_guven: ortalamaGuven,
        manuel_dogrulama_gerekli: ortalamaGuven < 0.6,
        notlar: terimEslemeUygulandi ? "Kaynak metinde konvansiyonel terimler tespit edildi ve katılım bankacılığı karşılıklarına eşlendi." : null,
      },
    ],
  };
}

// Start server function with Vite middleware
async function startServer() {
  // `.env` içinde NODE_ENV=production olsa bile `npm run dev` Vite + public/ kullanmalı.
  const useVite =
    process.env.npm_lifecycle_event === "dev" ||
    process.env.NODE_ENV !== "production";

  if (useVite) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Yalnızca istemci çıktısı servis edilir; dist/server.cjs dışarı açılmaz.
    const distPath = path.join(process.cwd(), "dist", "client");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Katılım Bilgi Çıkarım Ajanı] Sunucu 0.0.0.0:${PORT} adresinde aktif.`);

    void (async () => {
      try {
        const schema = await ensureSchema();
        console.log(`[PostgreSQL] ${schema.message}`);
        if (schema.ok) {
          const hydrated = await hydrateMemoryFromPostgres();
          console.log(`[PostgreSQL] ${hydrated.message}`);
        } else {
          // Snapshot cache yalnızca bilinçli fallback — anlık canlı veri değildir
          if (process.env.CAMPAIGN_CACHE_FALLBACK === "true") {
            const cached = await loadCampaignMemoryCache();
            if (cached.loaded > 0) {
              console.warn(
                `[PostgreSQL] Hydrate yok; CAMPAIGN_CACHE_FALLBACK ile ${cached.loaded} kampanya yüklendi (anlık değil).`,
              );
            }
          } else {
            console.warn(
              "[PostgreSQL] DATABASE_URL çözülemiyor. Anlık canlı liste için Dokploy’dan External Connection URL’sini .env DATABASE_URL’e yazın veya LIVE_CAMPAIGNS_ORIGIN=https://canli-site-adresiniz ayarlayın.",
            );
          }
        }
        const verified = await seedVerifiedResearchRecords();
        console.log(
          `[VerifiedResearch] ${verified.alreadySeeded ? "zaten yüklü" : `${verified.inserted} kayıt yüklendi`}.`,
        );
      } catch (err) {
        console.warn(
          "[PostgreSQL]",
          err instanceof Error ? err.message : err,
        );
      }
    })();

    if (SCRAPER_ENABLED) {
      console.log(
        `[Resmi Kaynak Scraper] ${BANK_SCRAPE_SOURCES.length} katılım bankası ${SCRAPER_INTERVAL_MINUTES} dk aralıkla (jitterli) kontrol edilecek.`,
      );
      setTimeout(() => {
        runOfficialScrapeJob({ force: false }).catch((err) =>
          console.warn("[OfficialScraper]", err),
        );
      }, 8_000);
      setInterval(
        () => {
          runOfficialScrapeJob({ force: false }).catch((err) =>
            console.warn("[OfficialScraper]", err),
          );
        },
        SCRAPER_INTERVAL_MINUTES * 60_000,
      );
    }

    if (isQdrantConfigured()) {
      getCollectionHealth()
        .then((health) => {
          console.log(
            `[Qdrant] ${health.ok ? "hazır" : "uyarı"}: ${health.message}`,
          );
        })
        .catch((err) => {
          console.warn(
            "[Qdrant]",
            sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
          );
        });
    } else {
      console.log(
        "[Qdrant] Yapılandırılmamış — vektör arama kapalı (EVREN_QDRANT_* tanımlayın).",
      );
    }
  });
}

startServer();
