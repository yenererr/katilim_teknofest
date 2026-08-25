# KatılımFinans Asistanı - Detaylı Proje Mimarisi

Bu doküman, TEKNOFEST 2026 Yapay Zekâ Dil Ajanları Yarışması bağlamında geliştirilen KatılımFinans Asistanı projesinin ne yaptığını, nasıl çalıştığını, hangi dosyanın hangi sorumluluğu taşıdığını ve sistemin uçtan uca veri akışını ayrıntılı biçimde açıklar.

Doküman hem teknik jüri/sunum hazırlığı hem de projeyi sonradan geliştirecek ekip üyeleri için hazırlanmıştır.

---

## 1. Projenin Amacı

Katılım bankalarının ürün, finansman, ücret ve kampanya metinleri genellikle farklı sayfalarda, farklı dil kalıplarıyla ve farklı detay seviyeleriyle yayınlanır. Bu proje, bu dağınık metinlerden anlamlı finansal bilgileri çıkarıp standart bir şemaya dönüştürmeyi amaçlar.

Projenin ana hedefleri şunlardır:

1. Katılım bankacılığı terminolojisine uygun bilgi çıkarımı yapmak.
2. Konvansiyonel bankacılık terimlerini katılım bankacılığı karşılıklarına çevirmek.
3. Kâr payı oranı, vade, tahsis ücreti, finansman tutarı, taksit sayısı ve ödül gibi alanları normalize etmek.
4. Her çıkarılan değeri kaynak metindeki kanıt cümlesine bağlamak.
5. Güven skoru ve manuel doğrulama ihtiyacı üretmek.
6. Banka ürünlerini karşılaştırılabilir hale getirmek.
7. EVREN API ile OpenAI uyumlu LLM entegrasyonu sağlamak.
8. Banka sitelerini periyodik olarak izleyip içerik değişikliklerinde otomatik yeniden çıkarım yapmak.
9. Kullanıcıya web arayüzünde finansman karşılaştırması, kampanya listesi, ücret karşılaştırması, ham JSON ve kanıt inceleme ekranları sunmak.

Kısaca proje, katılım bankalarının metinsel ürün/kampanya verisini standart, kanıtlı ve karşılaştırılabilir yapısal veriye dönüştüren bir bilgi çıkarım ajanıdır.

---

## 2. Yüksek Seviyeli Mimari

Proje tek bir Node.js/React uygulaması olarak çalışır. Hem frontend hem backend aynı repoda bulunur.

Ana bileşenler:

1. **React frontend**
   - Kullanıcı arayüzünü üretir.
   - Sayfa sekmelerini yönetir.
   - Finansman, kampanya, ücret, karşılaştırma ve asistan ekranlarını gösterir.
   - Backend endpointlerine istek atar.
   - Canlı scrape verisini düzenli olarak çeker.

2. **Express backend**
   - `/api/extract` ile metinden bilgi çıkarımı yapar.
   - `/api/health` ile sistem durumunu verir.
   - `/api/live/sources` ile izlenen banka kaynaklarını listeler.
   - `/api/live/products` ile canlı scrape sonucu çıkarılan ürünleri verir.
   - `/api/live/refresh` ile manuel scrape yenilemesi başlatır.

3. **EVREN LLM entegrasyonu**
   - OpenAI uyumlu endpoint kullanır.
   - `https://evren-llmapi.ssyz.org.tr/v1` base URL olarak ayarlıdır.
   - Model aliası varsayılan olarak `llm-fast`tir.
   - API anahtarı `.env` içindeki `EVREN_API_KEY` değişkeninden alınır.

4. **Kural tabanlı NLP yedeği**
   - EVREN anahtarı yoksa, API hata verirse veya model JSON üretimini tamamlayamazsa devreye girer.
   - Regex, Türkçe normalizasyon, terim sözlüğü ve cümle bölütleme kullanır.

5. **Canlı banka scraper**
   - 10 katılım bankasının web sitesini belirli aralıklarla kontrol eder.
   - İçeriği temiz metne çevirir.
   - SHA-256 hash ile değişiklik olup olmadığını tespit eder.
   - Değişiklik varsa EVREN ile yeniden bilgi çıkarımı yapar.
   - Sonuçları `.scraper-cache/katilim-bankalari.json` içinde tutar.

6. **Statik örnek piyasa verisi**
   - Canlı veri yoksa veya finansman karşılaştırması için yeterli canlı veri çıkarılamazsa arayüz statik örnek veriyi kullanmaya devam eder.
   - Bu veri `src/data/piyasa.ts` içinde tutulur.

---

## 3. Çalışma Zamanı Akışı

Uygulama `npm run dev` ile başlatıldığında aşağıdaki süreç işler:

1. `server.ts` çalışır.
2. `dotenv/config` ile `.env` okunur.
3. Express uygulaması kurulur.
4. API endpointleri tanımlanır.
5. Vite middleware geliştirme modunda Express içine bağlanır.
6. Sunucu `0.0.0.0:3000` üzerinde dinlemeye başlar.
7. `SCRAPER_ENABLED` false değilse canlı veri izleyici başlatılır.
8. Scraper ilk kontrolü 5 saniye sonra yapar.
9. Sonrasında `SCRAPER_INTERVAL_MINUTES` değerine göre periyodik kontrol devam eder.
10. Frontend açıldığında React uygulaması `/api/live/products` endpointini çağırır.
11. Canlı ürünler varsa history/veri havuzuna eklenir.
12. Kullanıcı ana sayfada finansman karşılaştırması yaptığında canlı finansman satırı varsa tablo canlı veriyi kullanır.
13. Canlı veri yeterli değilse statik finansman teklifleri gösterilir.

Not: Bu projede test sırasında `127.0.0.1:3000` adresi doğru Express/Vite uygulamasına cevap vermiştir. Bazı makinelerde `localhost:3000` başka bir lokal geliştirme sunucusuna düşebilir.

---

## 4. Dosya ve Klasör Yapısı

Projenin önemli dosya/katalogları:

```text
.
├── server.ts
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example
├── .gitignore
├── docs/
│   ├── PROJE_MIMARISI_DETAYLI.md
│   ├── eksiklikler-ve-yol-haritasi.pdf
│   ├── eksiklikler-ve-yol-haritasi.tex
│   ├── nlp-mimarisi.pdf
│   └── nlp-mimarisi.tex
├── evren-api-project/
│   ├── main.py
│   ├── evren_client.py
│   ├── .env.example
│   ├── .gitignore
│   └── requirements.txt
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── types.ts
│   ├── data/
│   │   ├── piyasa.ts
│   │   └── samples.ts
│   ├── lib/
│   │   ├── compare.ts
│   │   └── finansman.ts
│   ├── nlp/
│   │   ├── index.ts
│   │   ├── normalize.ts
│   │   ├── segment.ts
│   │   ├── lexicon.ts
│   │   ├── align.ts
│   │   └── extract.ts
│   └── components/
│       ├── HomeView.tsx
│       ├── FinansmanView.tsx
│       ├── CampaignsView.tsx
│       ├── FeesView.tsx
│       ├── CompareView.tsx
│       ├── TextInspector.tsx
│       ├── ProductCard.tsx
│       ├── CampaignList.tsx
│       ├── Dashboard.tsx
│       ├── JsonViewer.tsx
│       ├── TopNav.tsx
│       ├── SideRail.tsx
│       ├── SamplePicker.tsx
│       ├── TerminologyGuide.tsx
│       ├── Toast.tsx
│       ├── BankMark.tsx
│       ├── ConfidenceRing.tsx
│       └── AnimatedNumber.tsx
```

---

## 5. Backend Mimarisi

Backend tek dosyada, `server.ts` içinde yer alır. Bu dosya projenin API katmanını, EVREN bağlantısını, fallback çıkarımı ve canlı scraper mekanizmasını yönetir.

### 5.1. Express Uygulaması

`server.ts` şu temel Express kurulumunu yapar:

- JSON body desteği açılır.
- Body limiti `5mb` olarak ayarlanır.
- API route'ları tanımlanır.
- Geliştirme modunda Vite middleware Express içine takılır.
- Production modunda `dist/` klasörü statik olarak servis edilir.

Temel endpointler:

```text
GET  /api/health
POST /api/extract
GET  /api/live/sources
GET  /api/live/products
POST /api/live/refresh
```

### 5.2. `/api/health`

Sistem durumunu verir.

Dönen bilgiler:

- Servis durumu
- Kullanılan provider
- Model aliası
- Base URL
- API anahtarı tanımlı mı

Örnek cevap:

```json
{
  "status": "ok",
  "service": "katilim-bilgi-cikarim-ajani",
  "provider": "ssb-evren",
  "model": "llm-fast",
  "base_url": "https://evren-llmapi.ssyz.org.tr/v1",
  "api_key_configured": true
}
```

Bu endpoint, bağlantı ve konfigürasyon kontrolü için kullanılır.

### 5.3. `/api/extract`

Tek bir metinden bilgi çıkarımı yapan ana endpointtir.

Girdi:

```json
{
  "text": "Analiz edilecek banka kampanya veya ürün metni"
}
```

Akış:

1. `text` alanı kontrol edilir.
2. Metin boşsa 400 döner.
3. EVREN API çağrısı denenir.
4. EVREN yanıtı markdown kod bloğu içeriyorsa temizlenir.
5. JSON parse edilir.
6. JSON geçerli değilse veya `urunler` dizisi yoksa fallback extractor çalışır.
7. Konvansiyonel terimler `terimOzeti` ile tespit edilir.
8. Yanıt `urunler` ve `meta` olarak döner.

Dönen `meta` içinde şunlar bulunabilir:

- `duration_ms`
- `extracted_at`
- `conventional_terms_detected`
- `provider`
- `requested_model`
- `used_model`
- `model_warning`

### 5.4. EVREN API Çağrısı

EVREN çağrısı `callEvren` fonksiyonu ile yapılır.

Önemli ayarlar:

```ts
const EVREN_BASE_URL = process.env.EVREN_BASE_URL || "https://evren-llmapi.ssyz.org.tr/v1";
const EVREN_MODEL = process.env.EVREN_MODEL || "llm-fast";
const EVREN_TIMEOUT_MS = 1_800_000;
const MAX_EVREN_ATTEMPTS = 3;
```

Davranış:

- API anahtarı `EVREN_API_KEY` üzerinden alınır.
- Anahtar yoksa `null` döner ve sistem fallback extractor'a düşer.
- `temperature: 0.0` kullanılır.
- `response_format: { type: "json_object" }` gönderilir.
- `stream: false` kullanılır.
- `max_tokens: 4096` kullanılır.
- `AbortController` ile 1800 saniye timeout uygulanır.
- 408, 429 ve 5xx durumlarında artan bekleme ile tekrar denenir.
- Yanıtın `model` alanı kontrol edilir.
- İstenen modelden farklı model çalışırsa `modelWarning` üretilir.
- Boş yanıt gelirse `finish_reason` ile açıklayıcı hata oluşturulur.
- API anahtarı hata mesajlarına yazılmaz.

### 5.5. EVREN Prompt Tasarımı

`EXTRACTION_SYSTEM_PROMPT` içinde modelin uyması gereken bilgi çıkarım kuralları vardır.

Prompt şu kuralları zorlar:

- Yalnızca metinde açıkça yazan bilgi çıkarılır.
- Tahmin yapılmaz.
- Eksik alanlar `null` veya güven skoru 0 olur.
- Konvansiyonel terimler katılım karşılıklarına çevrilir.
- Oran, vade, tutar, ücret ve ödül normalizasyon kuralları uygulanır.
- Her alan için kanıt cümlesi zorunludur.
- Güven skoru 0.0-1.0 arası üretilir.
- Ortalama güven 0.6 altındaysa `manuel_dogrulama_gerekli: true` olur.
- Yalnızca geçerli JSON döndürülür.

Bu prompt yarışma senaryosundaki bilgi çıkarımı şemasını uygulamanın merkezine yerleştirir.

---

## 6. Canlı Scraper Mimarisi

Canlı scraper, banka sitelerini periyodik olarak izleyen ve içerik değişikliklerinde yeniden bilgi çıkarımı yapan sunucu tarafı bileşendir.

### 6.1. Neden Webhook Değil?

Banka siteleri değişiklikleri uygulamamıza bildiren webhook sağlamaz. Bu nedenle gerçek anlamda olay bazlı "anlık" sistem mümkün değildir.

Bu projede uygulanan yaklaşım:

- Belirli aralıklarla sayfaları çek.
- Temiz metin üret.
- Metnin hash'ini hesapla.
- Önceki hash ile karşılaştır.
- Değişmediyse hiçbir çıkarım yapma.
- Değiştiyse EVREN veya fallback extractor ile yeniden çıkarım yap.

Bu yaklaşım "periyodik otomatik izleme"dir.

### 6.2. İzlenen Bankalar

`BANK_SCRAPE_SOURCES` içinde 10 banka bulunur:

```text
Adil Katılım
Albaraka Türk
Dünya Katılım
Hayat Finans
Kuveyt Türk
T.O.M. Katılım
Emlak Katılım
Türkiye Finans
Vakıf Katılım
Ziraat Katılım
```

Her banka için:

- `id`
- `bankName`
- `urls`

alanları vardır.

Şu anda her banka için ana web sitesi izlenir. Sistem çoklu URL destekler; ileride her bankanın finansman, kampanya, ücret, kâr payı oranları gibi özel sayfaları `urls` dizisine eklenebilir.

### 6.3. Scraper Ayarları

`.env.example` içinde:

```env
SCRAPER_ENABLED="true"
SCRAPER_INTERVAL_MINUTES="30"
```

Anlamları:

- `SCRAPER_ENABLED`: Scraper aç/kapat anahtarı.
- `SCRAPER_INTERVAL_MINUTES`: Kaç dakikada bir kontrol yapılacağı.

Kod tarafında minimum aralık 5 dakika olarak sınırlandırılmıştır:

```ts
const SCRAPER_INTERVAL_MINUTES = Math.max(Number(process.env.SCRAPER_INTERVAL_MINUTES || 30), 5);
```

Bu, banka sitelerine aşırı sık istek atılmasını önler.

### 6.4. HTML Temizleme

`htmlToPlainText` fonksiyonu HTML'i temiz metne dönüştürür.

Yaptıkları:

- `<script>` bloklarını kaldırır.
- `<style>` bloklarını kaldırır.
- `<noscript>` bloklarını kaldırır.
- HTML tag'lerini boşlukla değiştirir.
- Temel HTML entity'lerini Türkçe karakterlere çevirir.
- Fazla boşlukları sadeleştirir.

Bu işlem modelin HTML etiketleri yerine anlamlı doğal dil metnini görmesini sağlar.

### 6.5. Sayfa Çekme

`fetchText` fonksiyonu her URL için istek atar.

Özellikleri:

- `User-Agent` gönderir.
- `Accept` header gönderir.
- 45 saniye timeout uygular.
- HTTP hata kodlarını yakalar.
- Dönen HTML'i düz metne çevirir.

### 6.6. Hash ile Değişiklik Tespiti

Her bankanın temizlenmiş birleşik metni SHA-256 ile hash'lenir:

```ts
const contentHash = crypto.createHash("sha256").update(combinedText).digest("hex");
```

Eğer önceki hash ile aynıysa:

- Banka `degismedi` durumuna alınır.
- EVREN çağrısı yapılmaz.
- Cache korunur.

Bu maliyeti ve gecikmeyi azaltır.

### 6.7. Cache Dosyası

Scraper sonucu şu dosyada tutulur:

```text
.scraper-cache/katilim-bankalari.json
```

Bu klasör `.gitignore` içindedir:

```gitignore
.scraper-cache/
```

Cache git'e gönderilmez çünkü çalışma zamanı verisidir.

### 6.8. Scraper Durumları

Her banka şu durumlardan birine sahip olur:

```ts
"beklemede" | "degismedi" | "guncellendi" | "hata"
```

Anlamları:

- `beklemede`: Henüz kontrol edilmedi.
- `degismedi`: Son kontrolde içerik hash'i değişmedi.
- `guncellendi`: İçerik yeni veya değişmiş, çıkarım yapıldı.
- `hata`: Sayfa çekme veya işleme sırasında hata oluştu.

Her banka için ayrıca şu bilgiler tutulur:

- `contentHash`
- `lastCheckedAt`
- `lastChangedAt`
- `lastExtractedAt`
- `products`
- `error`

### 6.9. Scraper Endpointleri

#### `GET /api/live/sources`

İzlenen kaynakları listeler.

Dönen alanlar:

- `enabled`
- `interval_minutes`
- `running`
- `sources`

#### `GET /api/live/products`

Canlı çıkarılmış ürünleri verir.

Dönen alanlar:

- `enabled`
- `running`
- `updated_at`
- `banks`
- `products`

`banks`, banka bazlı durumları içerir.

`products`, tüm bankalardan çıkan ürünleri düz liste olarak verir.

#### `POST /api/live/refresh`

Manuel yenileme başlatır.

Body:

```json
{
  "force": true
}
```

`force: true` verilirse hash aynı olsa bile yeniden çıkarım yapılır.

---

## 7. Python EVREN Entegrasyon Projesi

Ana uygulamaya ek olarak `evren-api-project/` içinde ayrı bir Python bağlantı testi ve tekrar kullanılabilir istemci bulunur.

Dosyalar:

```text
evren-api-project/
├── main.py
├── evren_client.py
├── .env.example
├── .gitignore
└── requirements.txt
```

### 7.1. `evren_client.py`

`EvrenClient` sınıfını içerir.

Sorumlulukları:

- `.env` dosyasını okur.
- `EVREN_API_KEY` değerini ortam değişkeninden alır.
- Anahtar yoksa Türkçe hata verir.
- OpenAI uyumlu `OpenAI` istemcisini kurar.
- Base URL olarak EVREN adresini kullanır.
- Timeout değerini 1800 saniye yapar.
- Varsayılan model olarak `llm-fast` kullanır.
- `temperature=0.0` ile deterministik cevap ister.
- API, bağlantı, timeout, rate limit ve kimlik doğrulama hatalarını ayrı yakalar.
- Boş yanıt durumunda `finish_reason` bilgisini gösterir.
- `response.model` değerini kaydeder.

### 7.2. `main.py`

Basit bağlantı testi yapar.

Akış:

1. `EvrenClient` oluşturulur.
2. Modele "Bir cümleyle kendini tanıt." mesajı gönderilir.
3. Yanıt terminale yazılır.
4. Kullanılan model aliası yazılır.
5. Başarılıysa "EVREN API bağlantısı başarılı." mesajı gösterilir.

---

## 8. Frontend Mimarisi

Frontend React ve TypeScript ile yazılmıştır. Uygulama Vite üzerinden servis edilir.

Ana giriş:

- `src/main.tsx`
- `src/App.tsx`

### 8.1. `src/main.tsx`

React uygulamasını DOM'a bağlar.

Genellikle:

- Root element alınır.
- `App` render edilir.
- Global CSS yüklenir.

### 8.2. `src/App.tsx`

Uygulamanın merkezi durum yönetimi ve sayfa yönlendirme bileşenidir.

Yönettiği başlıca state'ler:

- `activeTab`: Aktif sekme.
- `text`: Asistan/çıkarım metni.
- `selectedSampleId`: Seçili örnek metin.
- `isLoading`: Çıkarım yükleniyor mu?
- `loadingStep`: Yükleme adımı.
- `error`: Hata mesajı.
- `latestResult`: Son çıkarım sonucu.
- `highlightSentence`: Vurgulanacak kanıt cümlesi.
- `activeEvidenceKey`: Aktif kanıt alanı.
- `history`: Geçmiş çıkarımlar ve canlı scraper ürünleri.
- `seciliIds`: Karşılaştırma için seçili ürünler.
- `lastUpdated`: Son güncelleme saati.
- `talep`: Finansman karşılaştırma talebi.
- `karsilastirmalar`: Son karşılaştırmalar.
- `liveProductCount`: Canlı scraper'dan gelen ürün sayısı.

`App.tsx` aynı zamanda frontend veri akışını yönetir:

1. İlk açılışta örnek metni `/api/extract` ile analiz eder.
2. Her 60 saniyede `/api/live/products` endpointini çağırır.
3. Canlı ürünleri `history` içine `live_` prefix'iyle ekler.
4. `history` üzerinden `ogeler` listesini üretir.
5. Sayfa sekmelerine gerekli props'ları geçirir.

### 8.3. `ogeler` Veri Havuzu

`ogeler`, karşılaştırılabilir ürünlerin standart listesidir.

Kaynakları:

- Kullanıcının manuel analiz ettiği metinler.
- Örnek metinlerden çıkan ürünler.
- Canlı scraper ile banka sitelerinden çıkarılan ürünler.

Şekli:

```ts
interface KarsilastirmaOgesi {
  id: string;
  bankaAdi: string;
  product: KatilimUrunu;
}
```

Bu liste şu ekranlar tarafından kullanılır:

- Dashboard
- Kampanya listesi
- Karşılaştırma matrisi
- Ana sayfa canlı finansman tablosu

---

## 9. Sayfa ve Bileşen Yapısı

Uygulama sekme tabanlı bir yapıya sahiptir. Sekmeler `src/components/nav.ts` içinde tanımlanır.

### 9.1. Sekmeler

Ana sekmeler:

```text
home           Ana Sayfa
finansmanlar   Finansmanlar
kampanyalar    Kampanyalar
ucretler        Ücretler
compare         Karşılaştırmalar
asistan         Asistana Sor
json            Ham JSON
guide           Kurallar ve Rehber
```

`ANA_NAV` üst navigasyonda görünen ana sayfaları içerir.

`ARAC_NAV` teknik yardımcı ekranları içerir:

- Ham JSON
- Kurallar ve Rehber

### 9.2. Ana Sayfa - `HomeView.tsx`

Ana sayfa kullanıcının ilk gördüğü finansal karşılaştırma panelidir.

Bölümleri:

1. Hero alanı
2. Finansman türü/tutar/vade formu
3. Güven şeridi
4. Finansman karşılaştırma tablosu
5. Ücret kartları
6. Popüler kampanyalar
7. Asistana Sor kutusu

Önemli davranışlar:

- Kullanıcı finansman türü seçer.
- Tutar girer.
- Vade seçer.
- "Karşılaştır" ile talep kaydedilir.
- Tablo toplam maliyete göre sıralanır.
- Canlı scrape verisi uygunsa tablo statik veri yerine canlı veriyi kullanır.
- Canlı veri kullanılırsa tabloda `canlı scrape` etiketi gösterilir.

Ana sayfa finansman tablosu şu iki kaynaktan birini kullanır:

1. `canliSatirlar`
2. `teklifleriHesapla(...)` ile gelen statik satırlar

Canlı satır üretimi için ürünün şu alanları gerekir:

- `urun_turu` seçili finansman türüyle eşleşmeli.
- `kar_payi_orani.deger` bulunmalı.
- `kar_payi_orani.periyot` aylık veya yıllık olmalı.
- Vade varsa seçili vadeye uygun olmalı.

Eğer canlı satır yoksa statik örnek veri kullanılır.

### 9.3. Finansmanlar Sayfası - `FinansmanView.tsx`

Bu ekran daha geniş finansman karşılaştırma tablosudur.

Kullanıcı:

- Finansman türünü değiştirir.
- Tutarı değiştirir.
- Vadeyi değiştirir.

Tablo şunları gösterir:

- Banka
- Aylık taksit
- Kâr oranı
- Toplam ödeme
- Tahsis ücreti
- Toplam maliyet

`FinansmanView`, statik teklif motorunu kullanır:

```ts
teklifleriHesapla(talep.tur, talep.tutar, talep.vadeAy)
```

Uygun olmayan vadeler için satır soluk gösterilir ve "Bu vade bankanın azami vadesini aşıyor." mesajı verilir.

### 9.4. Kampanyalar Sayfası - `CampaignsView.tsx`

Statik kampanya kartlarını gösterir.

Filtre kategorileri:

- Tümü
- Genel
- Market
- Eğitim
- Akaryakıt
- Sağlık

Her kartta:

- Banka rozeti
- Banka adı
- Kampanya etiketi
- Başlık
- Açıklama
- Bitiş tarihi

Statik kampanya verisi `src/data/piyasa.ts` içindeki `KAMPANYALAR` dizisinden gelir.

### 9.5. Metinden Çıkarılan Kampanyalar - `CampaignList.tsx`

Canlı veya manuel çıkarılmış ürünleri kampanya/ürün kartları olarak listeler.

Özellikler:

- Ürün türüne göre filtre
- Bankaya göre filtre
- Sadece manuel inceleme bekleyenleri gösterme
- En fazla 4 ürün seçme
- Seçilenleri karşılaştırma

Her kart:

- Ürün adı
- Ürün türü
- Banka adı
- Kâr payı oranı
- Azami vade
- Güven göstergesi
- Manuel doğrulama durumu
- Kampanya kalan günü

### 9.6. Ücretler Sayfası - `FeesView.tsx`

Banka ücretlerini matris olarak gösterir.

Satırlar:

- FAST ücreti
- EFT ücreti
- Kart yıllık aidatı
- Hesap işletim ücreti
- Ortak ATM nakit çekim ücreti

Sütunlar:

- 10 katılım bankası

En düşük ücretler vurgulanır. `0` değerleri "Ücretsiz" olarak gösterilir.

### 9.7. Karşılaştırmalar Sayfası - `CompareView.tsx`

Seçili veya mevcut tüm ürünleri kriter bazlı karşılaştırma matrisinde gösterir.

Karşılaştırma kriterleri:

- En düşük kâr payı
- En yüksek ödül
- En uzun vade
- En düşük masraf
- En avantajlı bileşik skor

Her kriterde kazanan ürün yıldızla işaretlenir.

Kanıt alıntısı olan alanlarda kullanıcı kanıtı açıp görebilir.

### 9.8. Asistana Sor Sayfası

Bu sayfa `App.tsx`, `SamplePicker`, `TextInspector` ve `ProductCard` bileşenlerinden oluşur.

Akış:

1. Kullanıcı örnek metin seçer veya kendi metnini girer.
2. `TextInspector` metni gösterir.
3. "Veri çıkar" butonuna basılır.
4. `/api/extract` çağrılır.
5. Sonuçlar `ProductCard` bileşenleriyle listelenir.
6. Kanıt cümleleri kaynak metin içinde vurgulanır.
7. Karttan kanıt seçilirse kaynak metindeki ilgili cümleye odaklanılır.
8. Kaynak metindeki vurgulu kanıta tıklanırsa karttaki ilgili alan aktifleşir.

### 9.9. Kaynak Metin İnceleyici - `TextInspector.tsx`

Metin giriş ve kanıt vurgulama bileşenidir.

Modları:

- Okuma
- Düzenleme

Özellikleri:

- Kaynak metni gösterir.
- Metin düzenlemeye izin verir.
- Konvansiyonel terimleri tespit eder.
- Kanıt cümlelerini metin içinde vurgular.
- Kanıt hizalamasını NLP katmanındaki `kanitlariHizala` fonksiyonuyla yapar.
- Kanıta tıklayınca ilgili alanı seçer.

### 9.10. Ürün Kartı - `ProductCard.tsx`

Bir çıkarılmış ürünü ayrıntılı gösterir.

Gösterilen alanlar:

- Ürün adı
- Ürün türü
- Terim dönüşümü bilgisi
- Ortalama güven
- Kâr payı oranı
- Vade
- Tahsis ücreti
- Finansman tutarı
- Taksit sayısı
- Ödül
- Müşteri segmenti
- Kampanya başlangıç/bitiş
- Ajan notu

Her alan için:

- Normalize değer
- Ham metin
- Güven skoru
- Kanıt göster butonu
- Doğrula butonu

Kullanıcı alanları manuel olarak doğrulanmış işaretleyebilir.

### 9.11. Dashboard - `Dashboard.tsx`

Çıkarılan ürünlerden özet görünüm üretir.

KPI alanları:

- Çıkarılan ürün
- İzlenen banka
- Ortalama güven
- İnceleme bekleyen

Ek analizler:

- Kriter bazlı kazananlar
- Ürün türü dağılımı
- Bankaya göre ortalama kâr payı
- Yakında bitecek kampanyalar
- Otomatik bulgular
- Güven bandı dağılımı

### 9.12. Ham JSON - `JsonViewer.tsx`

Son çıkarım sonucunu JSON olarak gösterir.

Özellikler:

- JSON görüntüleme
- JSON kopyalama
- JSON indirme
- Manuel JSON düzenleme
- JSON parse hatası gösterme

Bu ekran jüriye veya geliştiriciye şemanın nasıl üretildiğini göstermek için önemlidir.

### 9.13. Kurallar ve Rehber - `TerminologyGuide.tsx`

Katılım bankacılığı terminoloji ve normalizasyon kurallarını kullanıcıya açıklar.

Amaç:

- Kullanıcının model çıktısını anlaması
- Terim dönüşümlerini görmesi
- Güven skorlarının ne anlama geldiğini öğrenmesi

---

## 10. Veri Modeli

Ana veri tipleri `src/types.ts` içinde tanımlanır.

### 10.1. `KatilimUrunu`

Çıkarılan ürün/kampanya nesnesidir.

Alanları:

```ts
interface KatilimUrunu {
  urun_adi: string | null;
  urun_turu: UrunTuru;
  musteri_segmenti: MusteriSegmenti[];
  kampanya_baslangic: string | null;
  kampanya_bitis: string | null;
  terimler: KatilimUrunuTerimleri;
  kanitlar: Record<string, string>;
  terim_esleme_uygulandi: boolean;
  ortalama_guven: number;
  manuel_dogrulama_gerekli: boolean;
  notlar: string | null;
}
```

Bu yapı, hem EVREN çıktısı hem fallback extractor çıktısı için ortak şemadır.

### 10.2. `KatilimUrunuTerimleri`

Finansal alanları içerir:

```ts
interface KatilimUrunuTerimleri {
  kar_payi_orani: TermDetail<number>;
  vade_ay: TermDetail<null>;
  tahsis_ucreti: TermDetail<number>;
  tutar: TermDetail<null>;
  taksit_sayisi: TermDetail<number>;
  odul: TermDetail<number>;
}
```

### 10.3. `TermDetail`

Her normalize alanın ortak detay tipidir.

Alanları:

- `ham`: Kaynak metindeki ham ifade.
- `deger`: Normalize tek değer.
- `min`: Aralık alt sınırı.
- `max`: Aralık üst sınırı.
- `periyot`: Aylık/yıllık/belirsiz.
- `tipi`: Sabit/oransal/yok/belirsiz.
- `para_birimi`: TRY/USD/EUR/XAU.
- `guven`: 0.0-1.0 güven skoru.

### 10.4. `ExtractionResponse`

Backend çıkarım cevabıdır.

```ts
interface ExtractionResponse {
  urunler: KatilimUrunu[];
  meta?: {
    duration_ms?: number;
    extracted_at?: string;
    conventional_terms_detected?: string[];
    provider?: string;
    requested_model?: string;
    used_model?: string | null;
    model_warning?: string | null;
  };
}
```

### 10.5. Canlı Veri Tipleri

`LiveBankState`, banka bazlı scraper durumudur.

`LiveBankProduct`, tek bir canlı çıkarılmış üründür.

`LiveProductsResponse`, `/api/live/products` endpointinin tüm cevabıdır.

---

## 11. Statik Veri Katmanı

`src/data/piyasa.ts`, uygulamanın statik piyasa verisini içerir.

İçerikler:

- `BANKALAR`
- `BANKA_INDEKS`
- `FINANSMAN_TURLERI`
- `VADELER`
- `VARSAYILAN_TUTAR`
- `TEKLIFLER`
- `UCRETLER`
- `KAMPANYALAR`
- `POPULER_ARAMALAR`

### 11.1. Bankalar

Projede 10 katılım bankası tanımlıdır:

1. Adil Katılım
2. Albaraka Türk
3. Dünya Katılım
4. Hayat Finans
5. Kuveyt Türk
6. T.O.M. Katılım
7. Emlak Katılım
8. Türkiye Finans
9. Vakıf Katılım
10. Ziraat Katılım

Her banka için:

- `id`
- `ad`
- `kisa`
- `renk`

bilgileri tutulur.

### 11.2. Finansman Teklifleri

Üç finansman türü vardır:

- Konut finansmanı
- Taşıt finansmanı
- İhtiyaç finansmanı

Her türde 10 banka için teklif bulunur.

Teklif alanları:

- `bankaId`
- `aylikKarPayi`
- `tahsisSabit`
- `tahsisOran`
- `kampanyaliMi`
- `azamiVade`

### 11.3. Ücretler

Ücret matrisi banka bazlı değer tutar.

Örnek:

```ts
{
  key: "fast",
  etiket: "FAST Ücreti",
  degerler: {
    "kuveyt-turk": 0,
    ...
  }
}
```

### 11.4. Kampanyalar

Statik kampanya kartları `KAMPANYALAR` içinde tutulur.

Her kampanya:

- `id`
- `bankaId`
- `baslik`
- `aciklama`
- `bitis`
- `etiket`
- `kategori`

alanlarına sahiptir.

---

## 12. Finansman Hesaplama Motoru

`src/lib/finansman.ts`, finansman hesaplarını yapan saf TypeScript modülüdür.

### 12.1. `aylikTaksit`

Anüite formülüyle aylık taksit hesaplar:

```text
A = P * i / (1 - (1 + i)^-n)
```

Burada:

- `P`: Anapara
- `i`: Aylık kâr payı oranı
- `n`: Vade ay sayısı

Oran 0 ise tutar vadeye bölünür.

### 12.2. `tahsisHesapla`

Tahsis ücretini hesaplar.

Öncelik:

1. `tahsisSabit`
2. `tahsisOran * tutar`

### 12.3. `teklifleriHesapla`

Seçilen finansman türü, tutar ve vade için tüm teklifleri hesaplar.

Ürettiği alanlar:

- `bankaId`
- `aylikKarPayi`
- `taksit`
- `toplamOdeme`
- `tahsisUcreti`
- `toplamMaliyet`
- `kampanyaliMi`
- `uygunMu`

Sonuçlar:

1. Uygun teklifler önce gelir.
2. Toplam maliyete göre artan sıralanır.

### 12.4. Biçimlendirme Yardımcıları

- `tlBicim`
- `tlBicim2`
- `sayiBicim`
- `oranBicim`

Bu fonksiyonlar Türkçe sayı ve para biçimi üretir.

---

## 13. Karşılaştırma Motoru

`src/lib/compare.ts`, metinden çıkarılmış ürünleri karşılaştırır.

Saf TypeScript modülüdür; React içermez.

### 13.1. Aylık Kâr Payı Normalizasyonu

`aylikKarPayi` fonksiyonu:

- Aylık oranı doğrudan döndürür.
- Yıllık oranı 12'ye böler.
- Periyot belirsizse `null` döndürür.

Bu önemlidir çünkü periyot bilinmeden oran karşılaştırması yapılmaz.

### 13.2. Kriterler

Motor şu kriterleri hesaplar:

1. En düşük kâr payı
2. En yüksek ödül
3. En uzun vade
4. En düşük masraf
5. En avantajlı bileşik skor

### 13.3. En Avantajlı Skoru

Varsayılan ağırlıklar:

```ts
{
  karPayi: 0.4,
  masraf: 0.25,
  vade: 0.2,
  odul: 0.15
}
```

Eksik alanlar sıfır sayılmaz. Ürün hangi alanlarda veri sağlıyorsa ağırlıklar o alanlar arasında yeniden dağıtılır.

Bu yaklaşım, eksik veri yüzünden ürünü gereksiz cezalandırmaz.

---

## 14. NLP Katmanı

`src/nlp/` klasörü hibrit bilgi çıkarımın yerel dil işleme bileşenlerini içerir.

### 14.1. `normalize.ts`

Metin normalizasyonu yapar.

Görevleri:

- Türkçe uyumlu küçültme
- ASCII katlama
- Para birimi çözümleme
- Yüzde çözümleme
- Yazıyla yazılmış sayı çözümleme
- Fazla boşluk/karakter sadeleştirme

### 14.2. `segment.ts`

Türkçe cümle bölütleme ve belirteçleme yapar.

Dikkat ettiği durumlar:

- Ondalık sayılar
- Tarihler
- Kısaltmalar
- Noktalama işaretleri

### 14.3. `lexicon.ts`

Terminoloji sözlüğünü yönetir.

Örnek dönüşümler:

- faiz -> kâr payı
- kredi -> finansman
- mevduat -> katılım fonu
- dosya masrafı -> tahsis ücreti
- kart puanı -> ödül

Ayrıca çekim eklerine toleranslı arama ve olumsuzluk tespiti yapar.

### 14.4. `extract.ts`

Kural tabanlı bilgi çıkarımı yapar.

Çıkardığı alanlar:

- Kâr payı oranı
- Vade
- Tahsis ücreti
- Tutar
- Taksit
- Ödül

Kural katmanı hızlıdır, deterministiktir ve EVREN hata verdiğinde sistemin çalışmaya devam etmesini sağlar.

### 14.5. `align.ts`

Kanıt cümlelerini kaynak metin içinde hizalar.

Strateji:

1. Birebir eşleşme
2. Normalize edilmiş eşleşme
3. Cümle örtüşmesi

Bu sayede modelin döndürdüğü kanıt cümlesi küçük biçim farkları içerse bile kaynak metinde vurgulanabilir.

---

## 15. Güven Skoru ve Manuel Doğrulama

Her alan 0.0-1.0 arası güven skoruna sahiptir.

Genel anlam:

- 0.9-1.0: Metinde açık ve tek anlamlı.
- 0.6-0.8: Değer var ama biçim/birim yoruma açık.
- 0.3-0.5: Dolaylı çıkarım veya belirsizlik var.
- 0.0: Alan metinde yok.

Ürün düzeyinde `ortalama_guven` hesaplanır.

Eğer `ortalama_guven < 0.6` ise:

```ts
manuel_dogrulama_gerekli: true
```

Arayüzde:

- Uyarı rengi
- Manuel doğrulama etiketi
- Güven halkası

ile gösterilir.

---

## 16. Kanıt Bağlama Sistemi

Projenin önemli ayırt edici özelliği her çıkarılan alanın kaynak cümleye bağlanmasıdır.

Örnek:

```json
{
  "kar_payi_orani": "Konut finansmanında aylık kâr payı oranı %2,05'ten başlıyor."
}
```

Arayüz davranışı:

1. Ürün kartında "Kanıt göster" butonuna basılır.
2. `ProductCard`, ilgili kanıt cümlesini `App.tsx` state'ine gönderir.
3. `TextInspector`, bu cümleyi kaynak metinde bulur.
4. İlgili metin parçası vurgulanır.
5. Kullanıcı vurgulu metne tıklarsa ürün kartındaki ilgili alan aktifleşir.

Bu çift yönlü bağlantı, çıkarımın denetlenebilirliğini artırır.

---

## 17. Güvenlik ve Gizli Bilgi Yönetimi

### 17.1. API Anahtarı

EVREN API anahtarı kaynak koda yazılmaz.

Doğru yer:

```env
EVREN_API_KEY="GERCEK_ANAHTAR"
```

Bu satır `.env` içinde bulunur.

`.env` dosyası `.gitignore` ile git dışında tutulur.

### 17.2. Örnek Env Dosyası

`.env.example` sadece placeholder içerir:

```env
EVREN_API_KEY="sk-evren-teamNN-ANAHTARINIZ"
```

Gerçek anahtar burada tutulmaz.

### 17.3. Hata Logları

EVREN çağrısında hata detayları temizlenir. API anahtarı hata mesajlarına yazılmaz.

### 17.4. Cache Dosyaları

Scraper cache'i `.scraper-cache/` içinde tutulur ve git'e gönderilmez.

### 17.5. Python Ortamı

`evren-api-project/.env` ve `.venv/` de git dışında tutulur.

---

## 18. Kurulum ve Çalıştırma

### 18.1. Node Bağımlılıkları

```powershell
npm install
```

### 18.2. Env Dosyası

```powershell
Copy-Item .env.example .env
notepad .env
```

`.env` içine gerçek EVREN anahtarı girilir.

### 18.3. Geliştirme Sunucusu

```powershell
npm run dev
```

Uygulama:

```text
http://127.0.0.1:3000
```

adresinde açılır.

### 18.4. Build

```powershell
npm run build
```

Bu komut:

1. Vite frontend build alır.
2. `server.ts` dosyasını esbuild ile `dist/server.cjs` olarak bundle eder.

### 18.5. Production Çalıştırma

```powershell
npm run build
npm start
```

---

## 19. API Kullanım Örnekleri

### 19.1. Health Kontrolü

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/health
```

### 19.2. Metin Çıkarımı

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri http://127.0.0.1:3000/api/extract `
  -Method POST `
  -ContentType 'application/json' `
  -Body '{"text":"Konut finansmanında aylık kâr payı oranı %2,05 ve vade 120 ay."}'
```

### 19.3. Canlı Kaynaklar

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/live/sources
```

### 19.4. Canlı Ürünler

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/live/products
```

### 19.5. Manuel Canlı Yenileme

```powershell
Invoke-WebRequest `
  -UseBasicParsing `
  -Uri http://127.0.0.1:3000/api/live/refresh `
  -Method POST `
  -ContentType 'application/json' `
  -Body '{"force":true}'
```

---

## 20. Uçtan Uca Veri Akışları

### 20.1. Kullanıcı Metin Girip Çıkarım Yaptığında

1. Kullanıcı Asistana Sor sayfasında metin girer.
2. `TextInspector` metni state'e yazar.
3. Kullanıcı "Veri çıkar" der.
4. `App.tsx` içindeki `handleExtract` çalışır.
5. `/api/extract` endpointine POST atılır.
6. Backend EVREN'i çağırır.
7. EVREN geçerli JSON döndürürse parse edilir.
8. Hata varsa fallback extractor çalışır.
9. Sonuç frontend'e döner.
10. `latestResult` güncellenir.
11. `history` içine yeni kayıt eklenir.
12. `ProductCard` sonuçları gösterir.
13. `TextInspector` kanıtları vurgular.

### 20.2. Canlı Scraper Çalıştığında

1. Sunucu başlar.
2. Scraper cache okunur.
3. 5 saniye sonra ilk scrape turu başlar.
4. Her banka URL'i çekilir.
5. HTML temiz metne dönüştürülür.
6. Metin hash'lenir.
7. Hash değişmediyse banka geçilir.
8. Hash değiştiyse EVREN çıkarımı yapılır.
9. EVREN başarısızsa fallback extractor çalışır.
10. Banka durumu cache'e yazılır.
11. Frontend `/api/live/products` ile sonucu alır.
12. Canlı ürünler `history` içine eklenir.
13. Dashboard ve kampanya listesi canlı ürünleri kullanır.
14. Ana finansman tablosu uygun canlı finansman verisi bulursa canlı tablo üretir.

### 20.3. Finansman Karşılaştırması Yapıldığında

1. Kullanıcı finansman türü, tutar ve vade seçer.
2. `HomeView` önce canlı ürünlerden uygun satır üretmeyi dener.
3. Canlı satır varsa tablo canlı veriden oluşur.
4. Canlı satır yoksa `teklifleriHesapla` ile statik örnek veri hesaplanır.
5. Satırlar toplam maliyete göre sıralanır.
6. En düşük toplam maliyet üstte görünür.

---

## 21. Bilinen Sınırlar

### 21.1. Scraping Tam Anlık Değildir

Banka siteleri webhook vermediği için değişiklikler periyodik kontrol ile yakalanır.

Varsayılan aralık 30 dakikadır.

### 21.2. Ana Sayfa Metni Gürültülüdür

Banka ana sayfalarında menü, footer, carousel, tekrar eden duyuru ve reklam metinleri bulunur. Bu gürültü EVREN çıktısını uzatabilir veya JSON'un kesilmesine yol açabilir.

Bu yüzden:

- Metin limiti uygulanır.
- Prompt en fazla 8 ürün döndürmesini ister.
- EVREN hata verirse fallback extractor kullanılır.

Daha iyi kalite için banka bazlı hedef URL listeleri genişletilmelidir.

### 21.3. Bazı Bankalarda Ürün Çıkmayabilir

Ana sayfada açık finansman/kampanya oranı yoksa ürün listesi boş kalabilir.

Bu hata değildir; metinde açık veri bulunmadığını gösterir.

### 21.4. Statik Veriler Temsilidir

`src/data/piyasa.ts` içindeki oranlar ve ücretler temsilî örnek veri setidir.

Canlı veri geldiğinde bazı ekranlar canlı veriyi kullanır, ancak statik veriler fallback ve demo amacıyla durur.

### 21.5. Matematiksel Hesap Modelden Değil Koddan Yapılır

Taksit ve toplam maliyet hesapları model çıktısına bırakılmaz. `src/lib/finansman.ts` içindeki deterministik kodla hesaplanır.

---

## 22. Geliştirme İçin Önerilen İyileştirmeler

1. Her banka için özel finansman/kampanya/ücret URL listeleri eklenmeli.
2. Scraper sonucu için ayrı bir yönetim ekranı yapılmalı.
3. Banka bazlı son kontrol/hata durumu arayüzde gösterilmeli.
4. Canlı scraper manuel yenileme butonu frontend'e eklenmeli.
5. EVREN yanıtı kesildiğinde otomatik "daha kısa JSON üret" retry stratejisi eklenmeli.
6. Scraper metni başlık/anahtar kelime bazlı bölümlere ayırıp yalnızca ilgili parçaları modele göndermeli.
7. Canlı ürünler local cache yerine SQLite veya küçük bir dosya tabanlı DB'de tutulabilir.
8. Banka sayfaları için robots.txt ve kullanım şartları daha ayrıntılı kontrol edilebilir.
9. Canlı veri kalite skoru üretilebilir.
10. Jüri sunumu için scrape durum paneli ve "son değişiklik" zaman çizelgesi eklenebilir.

---

## 23. Yarışma Açısından Öne Çıkan Teknik Noktalar

1. **Hibrit çıkarım**
   - LLM + kural tabanlı fallback birlikte kullanılır.

2. **Kanıt zorunluluğu**
   - Her değer kaynak cümleye bağlanır.

3. **Katılım terminolojisi**
   - Faiz/kredi/mevduat gibi terimler katılım karşılıklarına çevrilir.

4. **Normalize finansal şema**
   - Oranlar, vadeler, ücretler ve tutarlar standart biçime getirilir.

5. **Güven skoru**
   - Çıkarım kalitesi sayısallaştırılır.

6. **Manuel doğrulama kuyruğu**
   - Düşük güvenli alanlar kullanıcıya işaretlenir.

7. **Canlı değişiklik izleme**
   - Banka sitelerindeki değişiklikler hash ile takip edilir.

8. **Maliyet kontrolü**
   - İçerik değişmedikçe EVREN çağrısı yapılmaz.

9. **Deterministik finansman hesaplama**
   - Taksit ve toplam maliyet kodla hesaplanır.

10. **Denetlenebilir arayüz**
    - JSON, kanıt metni, kart görünümü ve karşılaştırma matrisi birlikte sunulur.

---

## 24. Kısa Sunum Özeti

KatılımFinans Asistanı, katılım bankalarının kampanya ve ürün metinlerini okuyup finansal bilgileri standart JSON şemasına çıkaran, EVREN API destekli ve kural tabanlı yedeği olan bir bilgi çıkarım ajanıdır.

Sistem, 10 katılım bankasını kapsayan statik karşılaştırma verisiyle çalışır; ayrıca banka web sitelerini periyodik olarak scrape edip içerik değişikliklerini hash ile takip eder. Değişiklik olduğunda EVREN ile yeniden çıkarım yapar ve sonuçları canlı ürün havuzuna ekler.

Arayüzde kullanıcı finansman tekliflerini karşılaştırabilir, kampanyaları filtreleyebilir, ücretleri matris halinde inceleyebilir, metinlerden veri çıkarabilir, her çıkarılan değerin kanıt cümlesini görebilir ve ham JSON çıktısını düzenleyip indirebilir.

Projenin temel farkı yalnızca "cevap üreten" bir asistan olmaması; kaynak kanıtı, güven skoru, terminoloji dönüşümü, finansal normalizasyon ve canlı değişiklik izleme hattını tek sistemde birleştirmesidir.

