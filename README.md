# Katılım Bankacılığı Ürün ve Kampanya Analiz Ajanı

Katılım bankalarının doğal dilde yazılmış kampanya ve ürün metinlerinden finansal
bilgileri otomatik olarak çıkaran, standart bir şemaya normalize eden ve ürünleri
karşılaştırılabilir hâle getiren bir NLP çözümü.

> TEKNOFEST 2026 — Yapay Zekâ Dil Ajanları Yarışması, 2. Senaryo
> `BilisimVadisi2026`

---

## İçindekiler

- [Ne yapıyor](#ne-yapıyor)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Bağımlılıklar](#bağımlılıklar)
- [Yapılandırma](#yapılandırma)
- [Qdrant vektör arama](#qdrant-vektör-arama)
- [RAG asistanı](#rag-asistanı)
- [Finansman Asistanı](#finansman-asistanı)
- [Mimari](#mimari)
- [NLP katmanı](#nlp-katmanı)
- [Veri şeması](#veri-şeması)
- [API sözleşmesi](#api-sözleşmesi)
- [Proje yapısı](#proje-yapısı)
- [Veri seti](#veri-seti)
- [Arayüz](#arayüz)
- [Geliştirme](#geliştirme)
- [Bilinen sınırlar](#bilinen-sınırlar)
- [Yol haritası](#yol-haritası)
- [Dokümantasyon](#dokümantasyon)
- [Lisans](#lisans)

---

## Ne yapıyor

Katılım bankaları kampanyalarını serbest metin olarak yayınlar. Her banka farklı
terminoloji, farklı biçim ve farklı içerik yapısı kullanır. Bu da ürünlerin
karşılaştırılmasını zorlaştırır.

Bu ajan, ham kampanya metnini alıp:

1. **Ön işlemden geçirir** — Türkçe normalizasyon, cümle bölütleme
2. **Terminolojiyi dönüştürür** — faiz → kâr payı, kredi → finansman, dosya masrafı → tahsis ücreti
3. **Finansal bilgileri çıkarır** — kâr payı oranı, vade, tahsis ücreti, tutar, taksit, ödül
4. **Standart formata normalize eder** — `%2,05` · `2.05 %` · `yüzde 2,05` → `0.0205`
5. **Her alanı bir kanıt cümlesine bağlar** — "bu rakam nereden geldi?" sorusunun cevabı
6. **Güven skoru atar** — düşük güvenli alanlar manuel doğrulama kuyruğuna düşer
7. **Ürünleri karşılaştırır** — en düşük kâr payı, en uzun vade, en düşük masraf, en yüksek ödül, en avantajlı

Ayırt edici yanı: **her çıkarılan değer, kaynak metindeki cümleye bağlıdır.** Panelde
bir alanın "Kanıt göster" düğmesine basıldığında ilgili cümle metnin içinde vurgulanır;
vurgulu cümleye tıklandığında da ilgili alan işaretlenir.

---

## Hızlı başlangıç

### Gereksinimler

- **Node.js** 20 veya üzeri
- **npm** 10 veya üzeri
- (İsteğe bağlı) Bir LLM sağlayıcısı — yoksa sistem kural tabanlı çıkarıma düşer

### Kurulum

```bash
git clone https://github.com/yenererr/kat-l-m-.git
cd kat-l-m-
npm install
cp .env.example .env
```

`.env` dosyasını düzenleyip API anahtarınızı girin (bkz. [Yapılandırma](#yapılandırma)).
**Anahtar girmeseniz de uygulama çalışır** — bu durumda kural tabanlı çıkarıcı devreye
girer.

### Çalıştırma

```bash
npm run dev
```

Tarayıcıdan **http://localhost:3000** adresini açın.

### Üretim derlemesi

```bash
npm run build
npm start
```

---

## Bağımlılıklar

### Çalışma zamanı

| Paket | Sürüm | Görev |
|---|---|---|
| `react`, `react-dom` | ^19.0.1 | Arayüz |
| `express` | ^4.21.2 | HTTP sunucusu ve API uç noktaları |
| `@qdrant/js-client-rest` | — | Qdrant REST istemcisi |
| `zod` | — | İstek gövdesi doğrulama |
| `express-rate-limit` | — | Qdrant API hız sınırı |
| `uuid` | — | Deterministik nokta kimlikleri |
| `vite` | ^6.2.3 | Geliştirme sunucusu ve derleme |
| `@vitejs/plugin-react` | ^5.0.4 | React desteği |
| `@tailwindcss/vite`, `tailwindcss` | ^4.1.14 | Tasarım token sistemi ve stiller |
| `lucide-react` | ^0.546.0 | İkonlar (SVG) |
| `motion` | ^12.23.24 | Hareket ve geçişler |
| `dotenv` | ^17.2.3 | Ortam değişkenleri |

### Geliştirme

| Paket | Sürüm | Görev |
|---|---|---|
| `typescript` | ~5.8.2 | Tip denetimi |
| `tsx` | ^4.21.0 | TypeScript sunucusunu doğrudan çalıştırma |
| `esbuild` | ^0.25.0 | Sunucu paketleme |
| `vitest` | — | Birim / entegrasyon testleri |
| `@types/node`, `@types/express` | — | Tip tanımları |

**Fontlar depoya dâhildir** ve `public/fonts/` altından sunulur — CDN bağımlılığı yoktur.
Inter ve JetBrains Mono, SIL Open Font License 1.1 ile lisanslıdır; latin-ext alt kümesi
Türkçe glifleri (ğ Ğ ş Ş ı İ ç Ç ö Ö ü Ü) kapsar.

---

## Yapılandırma

`.env` dosyası (şablon: `.env.example`). Gerçek anahtarları kaynak koda yazmayın; `.env` zaten `.gitignore` içindedir.

```ini
# LLM + embedding (EVREN)
EVREN_API_KEY="sk-evren-teamNN-ANAHTARINIZ"
EVREN_MODEL="llm-fast"
EVREN_BASE_URL="https://evren-llmapi.ssyz.org.tr/v1"

# Qdrant (EVREN vektör DB) — anahtar EVREN_API_KEY'den farklıdır
EVREN_QDRANT_URL="https://evren-vektor.ssyz.org.tr"
EVREN_QDRANT_PORT="443"
EVREN_QDRANT_PREFIX="teamNN"
EVREN_QDRANT_API_KEY="qdr-teamNN-ANAHTARINIZ"
QDRANT_COLLECTION="katilim_finans_documents"

# Admin uç noktaları (/api/qdrant/index, DELETE source)
ADMIN_API_KEY="admin-yerel-gelistirme-anahtari"

SCRAPER_ENABLED="true"
SCRAPER_INTERVAL_MINUTES="30"
```

**Kurallar**

- Takım yolunu `EVREN_QDRANT_URL` sonuna eklemeyin; `EVREN_QDRANT_PREFIX` istemci `prefix` ayarıyla gider.
- Port açıkça `443` olmalıdır; REST/HTTPS kullanılır (gRPC yok).
- Embedding modeli: `bge-m3-embed` (1024 boyut), endpoint `/v1/embeddings`, zaman aşımı 1800 sn.

Anahtar tanımlı değilse çıkarım kural tabanlı yedeğe düşer; Qdrant yapılandırılmamışsa vektör uç noktaları `503` döner, mevcut özellikler çalışmaya devam eder.

---

## Qdrant vektör arama

Qdrant **anlamsal metin araması** içindir (ürün açıklaması, kampanya, şart, ücret, kanıt cümleleri).
Kâr payı oranı, vade, tutar gibi sayısal karşılaştırma verileri ilişkisel/yapılandırılmış katmanda kalır.

### Kurulum özeti

1. `.env.example` → `.env` kopyalayın ve takım prefix / anahtarlarınızı girin.
2. `npm install && npm run dev`
3. Sağlık: `GET http://localhost:3000/api/qdrant/health`
4. Scraper içerik değişince otomatik `replaceSourceDocuments` çalışır (hash aynıysa embedding atlanır).

### İndeksleme akışı

1. Banka sayfası alınır → metin temizlenir → SHA-256 hash
2. Hash değişmediyse yeniden embedding yok
3. Değiştiyse parçalama (≈500–800 token, %10–15 örtüşme) → `bge-m3-embed` → upsert
4. Yeni noktalar yazıldıktan sonra eski `source_id` parçaları güvenli silinir; hata olursa eski kayıtlar korunur

### Hata giderme

| Belirti | Kontrol |
|---|---|
| `Qdrant yapılandırılmamış` | `EVREN_QDRANT_URL`, `PREFIX`, `API_KEY` |
| Kimlik doğrulama hatası | Qdrant anahtarı ≠ LLM anahtarı; prefix takımınıza ait mi? |
| Koleksiyon boyut uyuşmazlığı | Beklenen vektör boyutu 1024 / Cosine; koleksiyon silinmez |
| `Admin API anahtarı yapılandırılmamış` | `ADMIN_API_KEY` tanımlayın |
| Embedding boyutu hatası | Model `bge-m3-embed` olmalı |

Anahtarlar loglara yazılmaz; hata mesajları sanitize edilir.

### Örnek curl

```bash
# Sağlık
curl -s http://localhost:3000/api/qdrant/health

# Anlamsal arama
curl -s -X POST http://localhost:3000/api/qdrant/search \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"konut finansmanı tahsis ücreti\",\"limit\":5,\"bankIds\":[\"kuveyt-turk\"]}"

# İndeksleme (admin)
curl -s -X POST http://localhost:3000/api/qdrant/index \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -d "{\"mode\":\"replace\",\"sourceId\":\"demo-source\",\"documents\":[{\"bankId\":\"demo\",\"bankName\":\"Demo Bank\",\"sourceId\":\"demo-source\",\"sourceUrl\":\"https://example.com/\",\"documentType\":\"product\",\"text\":\"Konut finansmanında tahsis ücreti alınmaz. Başvuru için gelir belgesi gerekir.\",\"sourceCheckedAt\":\"2026-08-25T12:00:00.000Z\",\"contentHash\":\"demo-hash-001\"}]}"

# Kaynak silme (admin)
curl -s -X DELETE http://localhost:3000/api/qdrant/source/demo-source \
  -H "X-Admin-Key: $ADMIN_API_KEY"
```

### Bağlantı / test komutları

```bash
npm run lint
npm test
# Gerçek Qdrant (PowerShell):
$env:RUN_QDRANT_INTEGRATION="1"; npm run test:integration
```

---

## RAG asistanı

Uçtan uca akış:

```text
Soru → sınıflandırma → plan → güncellik → (sınırlı yenileme)
→ Qdrant + yapılandırılmış ürünler → kodla karşılaştırma
→ kanıtlı prompt → llm-fast → Zod + validator → kaynaklı cevap
```

### Ortam değişkenleri (ek)

```ini
EVREN_CHAT_MODEL=llm-fast
EVREN_TIMEOUT_SECONDS=1800
DATA_FRESHNESS_MINUTES=360
MAX_SYNC_REFRESH_SOURCES=3
```

### Endpoint

`POST /api/assistant/chat`

```bash
curl -s -X POST http://localhost:3000/api/assistant/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"36 ay vadede en düşük ilan edilen kâr payı oranına sahip taşıt finansmanı hangisi?\",\"forceRefresh\":false}"
```

### Güvenlik

- Tahmin yok; yoksa “Resmî kaynakta doğrulanamadı”
- Hesaplama LLM’de değil, TypeScript araçlarında
- Kaynak URL yalnızca izinli katılım bankası domainleri
- Prompt injection içeren kaynak metinleri talimat olarak uygulanmaz
- API anahtarı ve sistem promptu frontend’e dönmez
- Rate limit: 20 istek / dakika

### Başarı ölçütleri (ölçüm altyapısı)

Aşağıdaki metrikler için log alanı (`observability`) hazırdır; altın test seti ile doldurulacaktır — sayı uydurulmaz:

| Metrik | Durum |
|---|---|
| Retrieval Recall@5 | Test seti bekleniyor |
| Kanıt doğruluğu | Validator + manuel örnekler |
| Alan bazlı P/R/F1 | Test seti bekleniyor |
| Kaynaksız finansal iddia oranı | Validator engeli |
| JSON şema geçerlilik oranı | Zod |
| Eski veri tespit doğruluğu | Birim testleri mevcut |
| Ortalama uçtan uca yanıt süresi | `total_duration_ms` log |
| Fallback kullanım oranı | `fallback_used` log |
| Manuel doğrulama oranı | Test seti bekleniyor |

### Hata giderme

| Belirti | Kontrol |
|---|---|
| `insufficient_data` | Scraper ürün üretti mi? Qdrant indeksli mi? |
| `stale_data` | `DATA_FRESHNESS_MINUTES`, “Yenile” düğmesi |
| `clarification_required` | Ürün türü / tutar / vade eksik |
| Validator düşürdü | Uydurma oran veya geçersiz [KAYNAK n] |

---

## Finansman Asistanı

Sidebar / üst menüden **Finansman Asistanı** (`#/finansman-asistani`) açılır. Kullanıcı doğal dilde tutar, amaç ve vade verir; sistem doğrulanmış katılım bankası verileriyle karşılaştırır.

### Kullanım

1. Sol panelden **Finansman Asistanı** seçin (veya `#/finansman-asistani`).
2. Tutarı ve amacı yazın (veya hazır chip’lere tıklayın).
3. Eksik bilgi varsa en fazla iki kısa soru / chip ile tamamlanır.
4. Sonuçta **Size Uygun Finansmanlar** ve **Esnek Alternatifler ve Kampanyalar** tabloları oluşur.
5. “Tutarı 250 bin yap”, “En düşük toplam ödemeye göre sırala” gibi takip mesajlarıyla konuşma sıfırlanmadan yeniden hesaplanır.

### Karar akışı

```text
Mesaj → NLU (tutar/vade/amaç) → zorunlu alanlar
  → eksikse needs_information + quick replies
  → tamysa PostgreSQL/bellek + canlı scrape ürünleri
  → tam eşleşme filtresi (tür, tutar, vade, aktiflik, segment, güncellik)
  → TypeScript taksit hesabı (yeterli parametre yoksa sayı yok)
  → esnek alternatifler (varsayılan ±%25 tutar, ±12 ay vade)
  → yapılandırılmış JSON + kısa sohbet cevabı
```

### Veri kaynakları

- Yalnızca 11 katılım bankasının resmî domainleri
- Canlı scraper / bellek / PostgreSQL kayıtları
- Qdrant kanıt metinleri (sayısal değer olarak doğrudan kullanılmaz)
- `ALLOW_DEMO_DATA=false` iken demo veri gerçek sonuç gibi gösterilmez

### Hesaplama sınırlamaları

- Hesap LLM’de yapılmaz; `finansmanCalculator.ts` kullanır
- Oran veya periyot yoksa: “Bankadan teklif alınmalı” / “Resmî kaynakta belirtilmemiş”
- Eksik değerler `0` olarak gösterilmez

### Güvenlik

- EVREN / Qdrant anahtarları yalnızca backend’de
- Kullanıcıdan T.C. kimlik, şifre, kart, gelir istenmez
- Zod doğrulama + mesaj uzunluk sınırı + rate limit
- Konvansiyonel banka id/adları sonuçlardan elenir
- `sanitizeAssistantNumbers` backend’de olmayan tutarları maskeler

### Endpoint

`POST /api/assistant/chat` with `"mode":"finansman"`  
veya `POST /api/assistant/finansman`

```bash
curl -s -X POST http://localhost:3000/api/assistant/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"mode\":\"finansman\",\"message\":\"200 bin TL ihtiyaç finansmanı, 24 ay.\"}"
```

Yanıt alanları: `assistantMessage`, `status`, `exactMatches`, `flexibleMatches`, `quickReplies`, `summary`, `warnings`, `citations`, `query`.

---

## Resmî kaynak scraper + PostgreSQL

Sistem yalnızca 11 katılım bankasının resmî domainlerini tarar. VakıfBank / Ziraat Bankası vb. konvansiyonel domainler reddedilir (SSRF + allowlist).

### Paketler

`pg`, `cheerio` (+ mevcut `@qdrant/js-client-rest`, `zod`)

### Migration

```bash
psql "$DATABASE_URL" -f migrations/001_katilim_finans.sql
```

`DATABASE_URL` yoksa bellek içi depo kullanılır; uygulama çalışmaya devam eder.

### Job tabanlı yenileme

```bash
curl -X POST http://localhost:3000/api/live/refresh ^
  -H "Content-Type: application/json" ^
  -H "X-Admin-Key: %ADMIN_API_KEY%" ^
  -d "{\"force\":false}"

curl http://localhost:3000/api/live/jobs/JOB_ID
curl http://localhost:3000/api/system/health
```

### Güvenlik özeti

- Keyfî URL scrape yok
- Redirect sonrası domain yeniden doğrulanır
- Domain başına 1 eşzamanlı istek, ≥2 sn gecikme
- Hash değişmeden EVREN/embedding yok
- Kart kampanyaları finansman karşılaştırmasından ayrı
- `ALLOW_DEMO_DATA=false` iken demo gerçek veri gibi sunulmaz

---

## Mimari

```
Ham kampanya metni
        │
        ▼
┌───────────────────────────────────────────────┐
│  1. ÖN İŞLEME            src/nlp/normalize.ts │
│     Unicode, tırnak, boşluk, Türkçe küçültme  │
├───────────────────────────────────────────────┤
│  2. CÜMLE BÖLÜTLEME      src/nlp/segment.ts   │
│     Ondalık / tarih / kısaltma korumalı       │
├───────────────────────────────────────────────┤
│  3. TERMİNOLOJİ EŞLEME   src/nlp/lexicon.ts   │
│     Sözlükbirim tabanlı, çekim ekine toleranslı│
├───────────────────────────────────────────────┤
│  4. KURAL TABANLI ÇIKARIM src/nlp/extract.ts  │
│     Oran, vade, ücret (olumsuzluk), tutar     │
├───────────────────────────────────────────────┤
│  5. DİL MODELİ           server.ts            │
│     Şema kısıtlı; kalan alanlar için          │
├───────────────────────────────────────────────┤
│  6. ÇAPRAZ DOĞRULAMA     src/nlp/extract.ts   │
│     Kural ≠ model → güven düşer               │
├───────────────────────────────────────────────┤
│  7. KANIT HİZALAMA       src/nlp/align.ts     │
│     Birebir → normalize → Jaccard örtüşmesi   │
└───────────────────────────────────────────────┘
        │
        ▼
Yapılandırılmış JSON  →  Panel · Karşılaştırma · Dashboard
```

Kural katmanının dil modelinden **önce** çalışması bilinçli bir tercihtir: kolay vakalar
deterministik ve milisaniyelik çözülür, dil modeli yalnızca varyasyonlu ifadeler için
devreye girer, ve iki katmanın karşılaştırılması bağımsız bir doğrulama sağlar.

---

## NLP katmanı

`src/nlp/` altındaki modüller React'ten bağımsızdır ve hem istemci hem sunucu
tarafından kullanılır.

### `normalize.ts` — Türkçe metin normalizasyonu

JavaScript'in yerleşik `toLowerCase()` metodu Türkçe alfabeyi tanımaz:

```js
"FAİZ ORANI".toLowerCase()    // → "fai̇z oranı"   (i + U+0307 birleşik nokta)
"DOSYA MASRAFI".toLowerCase() // → "dosya masrafi" (noktasız I → ASCII i)
```

Sonuç: `/\bfaiz\b/` deseni eşleşmez ve büyük harfli kampanya başlıklarında terim
tespiti sessizce başarısız olur. Bu modül tüm küçültme işlemlerini `tr-TR` yereliyle
yapar.

| Fonksiyon | Görev |
|---|---|
| `kucult`, `buyult` | Türkçe kurallarına göre harf dönüşümü |
| `sapkaSadelestir` | `kâr payı` ↔ `kar payı` denkliği |
| `asciiKatla` | Eşleştirme için ASCII indirgeme |
| `metinTemizle` | Depolama için tam ön işleme hattı |
| `eslesmeAnahtari` | Karşılaştırma için agresif sadeleştirme |
| `sayiCoz` | `2,05` · `1.000.000` · `5.000.000,50` |
| `yaziliSayiCoz` | `"iki milyon beş yüz bin"` → `2500000` |
| `yuzdeCoz` | `%2,05` · `2.05 %` · `yüzde 2,05` → `0.0205` |
| `paraBirimiCoz` | `₺` · `TL` · `Türk Lirası` → `TRY` |

### `segment.ts` — Cümle bölütleme

Naif nokta bölme finans metinlerinde çöker. Bölütleyici şunları cümle sonu saymaz:

- Ondalık ayracı: `%2,05`, `2.05`
- Tarih: `31.12.2026`
- Binlik ayracı: `1.000.000`
- Kısaltmalar (25 adet): `vb.` `Sn.` `md.` `örn.` `Ltd.` …
- Baş harf: `A. Bankası`
- Sıra sayısı: `1. taksit`

Her cümle için kaynak metindeki `(başlangıç, bitiş)` karakter aralığı üretilir.

### `lexicon.ts` — Terminoloji eşleme ve olumsuzluk

Türkçe eklemeli bir dil olduğundan sabit kelime araması yetmez. Sözlük kök hâlinde
tutulur, eşleştirme çekim ekine toleranslıdır: `faiz`, `faizi`, `faizde`, `faizli`
tek girdiyle yakalanır.

| Konvansiyonel | Katılım karşılığı | Alan |
|---|---|---|
| faiz | kâr payı | `kar_payi_orani` |
| kredi | finansman | `urun_turu` |
| mevduat | katılım fonu | `urun_turu` |
| dosya masrafı | tahsis ücreti | `tahsis_ucreti` |
| kart puanı | ödül | `odul_miktari` |

**Olumsuzluk tespiti** — "tahsis ücreti alınmaz" şemada `0` değerine karşılık gelir ve
pozitif bir sayı aranarak bulunamaz. Türkçede olumsuzluk çekim ekiyle taşınır:

| Ek | Örnek | Değer |
|---|---|---|
| `-maz` / `-mez` | alınmaz, edilmez | 0 |
| `-mıyor` / `-muyor` | alınmıyor | 0 |
| `-mama-` / `-meme-` | alınmamaktadır | 0 |
| `-makta` / `-mekte` | **alınmaktadır** | pozitif |

Son satır kritiktir: naif bir `alınm` araması ikisini ayırt edemez ve ücreti hatalı
biçimde sıfırlar.

### `extract.ts` — Kural tabanlı bilgi çıkarımı

Deterministik birinci katman. Bağlam denetimleriyle çalışır: oranın gerçekten kâr
payına ait olup olmadığı, vadenin taksit sayısıyla karışıp karışmadığı, ücret
cümlesinin tutar cümlesinden ayrılması.

Şartname kuralı doğrudan kodlanmıştır: metinde "aylık" veya "yıllık" geçmiyorsa
`periyot: "belirsiz"` atanır ve güven skoru en fazla `0.5` olur.

`caprazDogrula` fonksiyonu kural ve model çıktısını karşılaştırır; %1 tolerans içinde
uyuşma güveni korur, uyuşmazlık güveni yarıya indirir.

### `align.ts` — Kanıt hizalama

Modelin döndürdüğü alıntı kaynak metinle birebir aynı olmayabilir. Üç aşamalı:

1. **Birebir arama** — en hızlı, skor 1.0
2. **Normalize edilmiş metin** — aksan, tırnak ve noktalama farklarına dayanıklı, skor 0.9
3. **Cümle düzeyinde Jaccard örtüşmesi** — `J(A,B) = |A∩B| / |A∪B|`, eşik 0.45

---

## Veri şeması

`src/types.ts` içinde tanımlıdır ve değiştirilmemelidir.

```ts
interface KatilimUrunu {
  urun_adi: string | null;
  urun_turu: 'konut_finansmani' | 'tasit_finansmani' | 'ihtiyac_finansmani'
           | 'kart' | 'katilim_fonu' | 'yatirim' | 'alisveris_puani' | 'diger';
  musteri_segmenti: ('yeni_musteri' | 'mevcut_musteri' | 'kurumsal'
                   | 'kobi' | 'genc' | 'emekli' | 'tumu')[];
  kampanya_baslangic: string | null;   // ISO 8601
  kampanya_bitis: string | null;
  terimler: {
    kar_payi_orani: TermDetail<number>;  // deger + periyot
    vade_ay:        TermDetail<null>;    // min / max, her zaman AY
    tahsis_ucreti:  TermDetail<number>;  // deger + tipi + para_birimi
    tutar:          TermDetail<null>;    // min / max
    taksit_sayisi:  TermDetail<number>;
    odul:           TermDetail<number>;
  };
  kanitlar: Record<string, string>;      // alan → kaynak cümle
  terim_esleme_uygulandi: boolean;
  ortalama_guven: number;                // 0–1
  manuel_dogrulama_gerekli: boolean;     // ortalama_guven < 0.6
  notlar: string | null;
}

interface TermDetail<T> {
  ham: string | null;        // metinde geçtiği hâli
  deger?: T | null;          // normalize edilmiş değer
  min?: number | null;
  max?: number | null;
  periyot?: 'aylik' | 'yillik' | 'belirsiz' | null;
  tipi?: 'sabit' | 'oransal' | 'yok' | 'belirsiz' | null;
  para_birimi?: 'TRY' | 'USD' | 'EUR' | string | null;
  guven: number;             // 0–1
}
```

### Normalizasyon kuralları

| Girdi | Çıktı |
|---|---|
| `%2,05` · `2.05 %` · `yüzde 2,05` | `0.0205` |
| `10 yıl` | `120` (vadeler her zaman ay) |
| `36 aya varan` | `max: 36, min: null` |
| `Tahsis ücreti alınmaz` | `deger: 0, tipi: "yok"` |
| `500 TL` · `500₺` · `beş yüz Türk Lirası` | `500`, `para_birimi: "TRY"` |
| Periyot belirtilmemiş | `periyot: "belirsiz"`, `guven ≤ 0.5` |

### Güven skoru ölçeği

| Aralık | Anlamı |
|---|---|
| 0.9 – 1.0 | Metinde açık ve tek anlamlı yazılı |
| 0.6 – 0.8 | Biçim veya birim hafif yoruma açık |
| 0.3 – 0.5 | Dolaylı çıkarım veya periyot belirsiz |
| 0.0 | Alan metinde hiç geçmiyor |

---

## API sözleşmesi

### `POST /api/extract`

**İstek**

```json
{ "text": "Konut finansmanında aylık kâr payı oranı %2,05'ten başlıyor..." }
```

**Yanıt**

```json
{
  "urunler": [
    {
      "urun_adi": "Konut Finansmanı",
      "urun_turu": "konut_finansmani",
      "musteri_segmenti": ["yeni_musteri", "mevcut_musteri"],
      "kampanya_baslangic": null,
      "kampanya_bitis": "2026-09-30",
      "terimler": {
        "kar_payi_orani": { "ham": "%2,05", "deger": 0.0205, "periyot": "aylik", "guven": 0.9 },
        "vade_ay":        { "ham": "120 ay", "min": null, "max": 120, "guven": 0.95 }
      },
      "kanitlar": {
        "kar_payi_orani": "Konut finansmanında aylık kâr payı oranı %2,05'ten başlıyor."
      },
      "terim_esleme_uygulandi": false,
      "ortalama_guven": 0.93,
      "manuel_dogrulama_gerekli": false,
      "notlar": null
    }
  ],
  "meta": {
    "duration_ms": 1240,
    "extracted_at": "2026-08-05T08:51:00.000Z",
    "conventional_terms_detected": []
  }
}
```

**Hata** — `500` ile `{ "error": "..." }`

### `GET /api/health`

```json
{
  "status": "ok",
  "service": "katilim-bilgi-cikarim-ajani",
  "provider": "ssb-evren",
  "model": "llm-fast",
  "api_key_configured": true,
  "qdrant_configured": true
}
```

### Qdrant uç noktaları

| Method | Path | Yetki | Açıklama |
|---|---|---|---|
| `GET` | `/api/qdrant/health` | Açık | Bağlantı + koleksiyon durumu |
| `POST` | `/api/qdrant/search` | Açık (rate limit) | Anlamsal benzer parça arama |
| `POST` | `/api/qdrant/index` | Admin | Belge indeksleme / replace |
| `DELETE` | `/api/qdrant/source/:sourceId` | Admin | Kaynağa ait vektörleri sil |

Admin: `Authorization: Bearer <ADMIN_API_KEY>` veya `X-Admin-Key`. İstek gövdeleri Zod ile doğrulanır; istemci `collection` adı veya keyfî scrape URL’i gönderemez.

---

## Proje yapısı

```
.
├── server.ts                  Express + Vite, scraper, /api/extract
├── vitest.config.ts
├── docs/
└── src/
    ├── nlp/                   NLP katmanı
    ├── server/
    │   ├── middleware/        adminAuth, rateLimit
    │   ├── routes/qdrantRoutes.ts
    │   └── services/
    │       ├── embedding/evrenEmbeddingService.ts
    │       └── qdrant/
    │           ├── qdrantClient.ts
    │           ├── collectionManager.ts
    │           ├── documentIndexer.ts
    │           ├── vectorSearch.ts
    │           ├── textChunker.ts
    │           ├── scrapeIndexer.ts
    │           └── __tests__/
    └── components/
```

---

## Veri seti

Şu an depoda `src/data/samples.ts` içinde **6 örnek kampanya metni** bulunmaktadır.
Bu metinler geliştirme ve demo amaçlıdır.

> **Durum:** BDDK'nın [katılım bankaları listesindeki](https://www.bddk.org.tr/Kurulus/Liste/77)
> kuruluşların resmî sitelerinden toplanacak gerçek veri seti henüz hazırlanmamıştır.
> Toplama hattı yol haritasında 1. sıradadır; veri seti tamamlandığında bu bölüme
> herkese açık indirme bağlantısı eklenecektir.

---

## Arayüz

Altı bölümden oluşur:

| Bölüm | İçerik |
|---|---|
| **Genel Bakış** | KPI şeridi, kriter bazlı kazananlar, ürün türü ve banka dağılımı, yaklaşan bitişler, otomatik bulgular |
| **Çıkarım** | Metin girişi, okuma/düzenleme modu, çıkarılan alanlar, kanıt vurgulama, alan doğrulama |
| **Kampanyalar** | Kart listesi, filtreler, karşılaştırma için çoklu seçim |
| **Karşılaştırma** | Kriter × banka matrisi, kazanan işaretleri, satır bazlı kanıt gösterimi |
| **Asistana Sor** | Genel RAG sohbeti (kanıtlı cevap) |
| **Finansman Asistanı** | Sohbet + tam eşleşme / esnek alternatif tabloları (`#/finansman-asistani`) |
| **JSON** | Ham çıktı, kopyalama, `.json` indirme, manuel düzenleme |
| **Kurallar** | Terim eşleme matrisi, normalizasyon kuralları, güven ölçeği |

**Erişilebilirlik ve kullanım**

- WCAG 2.1 AA kontrast oranları, açık ve koyu temada ayrı doğrulanmış
- Gerçek `tablist` / `tab` / `tabpanel` semantiği, ok tuşlarıyla gezinme
- Tüm etkileşimli öğelerde görünür odak halkası, en az 44 px dokunma hedefi
- Renk tek başına anlam taşımaz; her durum göstergesinde ikon ve metin de bulunur
- `prefers-reduced-motion` desteklenir
- 375 px genişlikte yatay taşma yoktur
- **Ctrl/Cmd + Enter** ile çıkarım başlatılır

---

## Geliştirme

```bash
npm run dev              # Geliştirme sunucusu (http://localhost:3000)
npm run lint             # TypeScript tip denetimi (tsc --noEmit)
npm test                 # Qdrant birim testleri (mock)
npm run test:integration # Gerçek Qdrant (RUN_QDRANT_INTEGRATION=1 gerekir)
npm run build            # Üretim derlemesi
npm start                # Derlenmiş sunucuyu çalıştır
npm run clean            # dist/ temizliği
```

NLP modülleri saf TypeScript'tir ve doğrudan çalıştırılabilir:

```bash
npx tsx -e "import('./src/nlp').then(n => console.log(n.kuralTabanliCikar('Aylık kâr payı %2,05, tahsis ücreti alınmaz.')))"
```

---

## Bilinen sınırlar

- **Kalıcı depo yok.** Çıkarım sonuçları ve doğrulama işaretleri yalnızca bellekte tutulur; sayfa yenilendiğinde kaybolur. Finansman Asistanı konuşma durumu da sunucu belleğindedir (yeniden başlatmada sıfırlanır).
- **Kural motoru yedek konumunda.** Şu an dil modeli birincil çıkarıcıdır; kural katmanı yalnızca API anahtarı yoksa devreye girer. Katmanların yer değiştirmesi planlanmaktadır.
- **Banka adı şemada yok.** Karşılaştırmada banka adı, metnin örnek şablonlarla eşleştirilmesinden türetilir.
- **Finansman Asistanı canlı veriye bağlıdır.** Scrape/ürün kapsamı seyrekse `no_verified_data` döner; demo veri gerçek sonuç gibi gösterilmez.
- **Bulut modeli kullanılıyor.** Yerel çalıştırma desteklenir ancak varsayılan yapılandırma harici bir servise gider.
- **Doğruluk ölçümü yok.** Altın değerlendirme seti hazırlanmamıştır.

---

## Şartname 5.3 / 5.4 alan kapsamı

Çıkarılan her kayıt (`ExtractedFinancialRecord`) şartnamedeki tablo sütunlarını
karşılar. Dil modeli bir alanı boş bırakırsa kural katmanı (`src/nlp/extract.ts`)
aynı alanı deterministik olarak doldurur; model çıktısı varsa ona dokunulmaz.

| Şartname alanı | Kayıt alanı | Kaynak |
|---|---|---|
| Kâr payı oranı | `profitRate`, `ratePeriod` | kural + model |
| Finansman tutarı | `minAmountTl`, `maxAmountTl` | kural + model |
| Vade süresi | `minTermMonths`, `maxTermMonths` | kural + model |
| Taksit sayısı | `installmentCount` | kural + model |
| Tahsis ücreti | `allocationFeeValue`, `allocationFeeType` | kural + model |
| Masraf bilgisi | `feeStatus` | kural (`masrafDurumu`) |
| Ürün türü | `productType` | kategoriden türetilir |
| Kampanya türü (5.4, 8 tür) | `campaignType` | `src/nlp/kampanyaTuru.ts` |
| Ödül miktarı | `rewardAmountTl`, `rewardPoints`, `rewardPointUnit` | kural + model |
| İndirim oranı | `discountRate` | kural |
| Alışveriş puanı | `rewardPoints` | kural |
| Kampanya süresi | `campaignStart`, `campaignEnd` | kural + model |
| Kampanya koşulları | `conditions`, `exclusions` | kural + model |
| Hedef kitle | `targetSegments` (8 segment kodu) | kural |

Kampanya türleri şartnamedeki sekiz türle birebir aynıdır: finansman, ihtiyaç
finansmanı, konut finansmanı, taşıt finansmanı, kart, alışveriş puanı, yeni
müşteri ve yatırım ürünü kampanyası. Sınıflandırıcı sinyal bulamazsa `null`
döner — kampanya olmayan sayfaya tür atanmaz.

---

## Yol haritası

| Sıra | İş | Karşıladığı madde |
|---|---|---|
| 1 | Yerel modele geçiş (Ollama / vLLM) | 5.9 On-premise |
| 2 | SQLite kalıcı depo, şema genişletme (`banka_adi`, `kampanya_turu`, `avantajlar`) | 5.3 |
| 3 | Veri toplama hattı (BDDK listesi, kaynak defteri, kırılganlık alarmı) | 5.1 |
| 4 | Kural motorunun birinci katmana taşınması | 5.3, teknik kriter |
| 5 | Altın değerlendirme seti ve F1 raporu | Model başarısı |
| 6 | Kampanya türü sınıflandırıcısının istatistiksel modele taşınması (şu an kural tabanlı) | 5.4 |
| 7 | Chatbot (niyet sınıflandırma + slot doldurma + sorguya çevirme) | Senaryo kapsamı |
| 8 | Örtük ifade kalıp sözlüğü | 5.2 |

Ayrıntılar için [docs/eksiklikler-ve-yol-haritasi.pdf](docs/eksiklikler-ve-yol-haritasi.pdf).

---

## Dokümantasyon

| Belge | İçerik |
|---|---|
| [docs/nlp-mimarisi.pdf](docs/nlp-mimarisi.pdf) | NLP yöntemlerinin şartname maddeleriyle eşlenmesi, işleme hattı, ölçüm planı |
| [docs/eksiklikler-ve-yol-haritasi.pdf](docs/eksiklikler-ve-yol-haritasi.pdf) | Şartname uyum tablosu, eksiklik listesi, fazlı yol haritası |

LaTeX kaynakları aynı dizindedir ve `pdflatex` ile derlenebilir.

---

## Lisans

Bu proje **Apache License 2.0** ile lisanslanmıştır. Tam lisans metni kök
dizindeki [`LICENSE`](LICENSE) dosyasındadır; telif ve üçüncü taraf bileşen
dökümü [`NOTICE`](NOTICE) dosyasındadır.

Tüm bağımlılıklar izin verici açık kaynak lisanslara (MIT, Apache-2.0, ISC,
BSD-2, OFL) sahiptir. Ücretli yazılım, ticari lisans gerektiren paket veya
BSL/SSPL/Elastic gibi kaynağı açık ama özgür olmayan bileşen kullanılmamıştır.

Üçüncü taraf varlıklar:

- **Inter** — SIL Open Font License 1.1
- **JetBrains Mono** — SIL Open Font License 1.1
- **Lucide** ikonları — ISC License
