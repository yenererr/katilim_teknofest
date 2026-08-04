import { GoogleGenAI } from "@google/genai";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "5mb" }));

// Server-side Gemini client initialization
const getGeminiAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

const EXTRACTION_SYSTEM_PROMPT = `
Sen katılım bankacılığı alanında uzmanlaşmış bir bilgi çıkarım ajanısın.
Görevin, Türkiye'deki katılım bankalarının resmî web sitelerinden alınmış ham kampanya ve ürün metinlerini okuyup, aşağıda tanımlanan şemaya uygun yapılandırılmış JSON üretmektir.

## TEMEL KURAL
Yalnızca metinde AÇIKÇA yazan bilgiyi çıkar. Çıkarım yapma, tahmin etme, sektör ortalamasıyla doldurma. Bir alan metinde yoksa değeri null olmalı ve o alan için güven skoru 0 verilmelidir. Eksik veri, yanlış veriden iyidir.

## TERMİNOLOJİ
Katılım bankacılığı terminolojisini kullan. Konvansiyonel terimleri karşılıklarına eşle, çıktıda ASLA konvansiyonel terimi yazma:
  faiz / faiz oranı      → kâr payı        → alan: kar_payi_orani
  kredi                  → finansman       → alan: urun_turu
  mevduat                → katılım fonu    → alan: urun_turu
  dosya masrafı          → tahsis ücreti   → alan: tahsis_ucreti
  kart puanı             → ödül            → alan: odul_miktari
Kaynak metin konvansiyonel terim kullanıyorsa (örneğin "kredi", "faiz", "mevduat", "dosya masrafı", "kart puanı"), çıkarımı yine yap ancak terim_esleme_uygulandi: true işaretle.

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
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "katilim-bilgi-cikarim-ajani" });
});

app.post("/api/extract", async (req, res) => {
  const startTime = Date.now();
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Lütfen analiz edilecek bir metin giriniz." });
    }

    const ai = getGeminiAI();
    let resultJson: any = null;
    let rawTextResponse = "";

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: `Aşağıdaki katılım bankacılığı metnini analiz et ve JSON verisini üret:\n\nMETİN:\n${text}`,
          config: {
            systemInstruction: EXTRACTION_SYSTEM_PROMPT,
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        });

        rawTextResponse = response.text || "";
        // Clean markdown backticks if any
        let cleanText = rawTextResponse.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.replace(/^```json\s*/, "").replace(/```$/, "").trim();
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.replace(/^```\s*/, "").replace(/```$/, "").trim();
        }

        resultJson = JSON.parse(cleanText);
      } catch (geminiError) {
        console.warn("Gemini API call warning/fallback:", geminiError);
      }
    }

    // Smart fallback rules parser if Gemini is unavailable or failed
    if (!resultJson || !Array.isArray(resultJson.urunler)) {
      resultJson = fallbackRuleExtractor(text);
    }

    // Detect conventional terms in source text for frontend audit visualization
    const conventionalTermsFound: string[] = [];
    const lowerText = text.toLowerCase();
    if (/\bfaiz\b/.test(lowerText) || /faiz oranı/.test(lowerText)) conventionalTermsFound.push("faiz -> kâr payı");
    if (/\bkredi\b/.test(lowerText)) conventionalTermsFound.push("kredi -> finansman");
    if (/\bmevduat\b/.test(lowerText)) conventionalTermsFound.push("mevduat -> katılım fonu");
    if (/dosya masrafı/.test(lowerText)) conventionalTermsFound.push("dosya masrafı -> tahsis ücreti");
    if (/kart puanı/.test(lowerText)) conventionalTermsFound.push("kart puanı -> ödül");

    const duration = Date.now() - startTime;

    return res.json({
      urunler: resultJson.urunler || [],
      meta: {
        duration_ms: duration,
        extracted_at: new Date().toISOString(),
        conventional_terms_detected: conventionalTermsFound,
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
  const lower = text.toLowerCase();
  
  // Product classification
  let urunTuru = "diger";
  if (lower.includes("konut")) urunTuru = "konut_finansmani";
  else if (lower.includes("taşıt") || lower.includes("tasit") || lower.includes("araç")) urunTuru = "tasit_finansmani";
  else if (lower.includes("ihtiyaç") || lower.includes("ihtiyac")) urunTuru = "ihtiyac_finansmani";
  else if (lower.includes("kart") || lower.includes("sanal kart")) urunTuru = "kart";
  else if (lower.includes("katılma") || lower.includes("katilim fonu") || lower.includes("hesap")) urunTuru = "katilim_fonu";

  // Segment detection
  const segmentler: string[] = [];
  if (lower.includes("yeni müşteri") || lower.includes("yeni musterı")) segmentler.push("yeni_musteri");
  if (lower.includes("mevcut müşteri") || lower.includes("bireysel")) segmentler.push("mevcut_musteri");
  if (lower.includes("kobi") || lower.includes("üretici")) segmentler.push("kobi");
  if (lower.includes("kurumsal")) segmentler.push("kurumsal");
  if (lower.includes("genc") || lower.includes("genç")) segmentler.push("genc");
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
    const s = sentences.find(st => st.toLowerCase().includes("tahsis") || st.toLowerCase().includes("masraf") || st.includes(feeHam!)) || sentences[0];
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
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Katılım Bilgi Çıkarım Ajanı] Sunucu 0.0.0.0:${PORT} adresinde aktif.`);
  });
}

startServer();
