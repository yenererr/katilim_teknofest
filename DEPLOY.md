# Dokploy ile Canlıya Alma

Uygulama tek konteyner olarak çalışır: Express hem `/api/*` uçlarını sunar
hem de derlenmiş React arayüzünü (`dist/client`) statik olarak servis eder.
Ayrı bir web sunucusu veya reverse proxy yapılandırmasına gerek yoktur.

## 1. Dokploy'da uygulama oluştur

1. **Create Application** → **Provider: GitHub** → depo `yenererr/katilim_teknofest`, dal `main`.
2. **Build Type: Dockerfile** seç. Depodaki kök `Dockerfile` kullanılır.
   (Nixpacks otomatik algılama ile de derlenir, ancak Dockerfile üretim
   bağımlılıklarını ayırdığı için imaj belirgin şekilde küçük kalır.)

## 2. Ortam değişkenleri

Dokploy → **Environment** sekmesine aşağıdakileri gir. Anahtar değerleri
depoda tutulmaz; `.env` git'e dahil değildir.

```
NODE_ENV=production
PORT=3000

EVREN_API_KEY=<sk-evren-teamNN-...>
EVREN_MODEL=llm-fast
EVREN_CHAT_MODEL=llm-fast
EVREN_EMBED_MODEL=bge-m3-embed
EVREN_BASE_URL=https://evren-llmapi.ssyz.org.tr/v1
EVREN_TIMEOUT_SECONDS=1800

EVREN_QDRANT_URL=https://evren-vektor.ssyz.org.tr
EVREN_QDRANT_PORT=443
EVREN_QDRANT_PREFIX=<teamNN>
EVREN_QDRANT_API_KEY=<qdr-teamNN-...>
QDRANT_COLLECTION=katilim_finans_documents

SCRAPER_ENABLED=true
SCRAPER_INTERVAL_MINUTES=30
SCRAPER_CONCURRENCY_PER_DOMAIN=1
SCRAPER_REQUEST_DELAY_MS=2000
SCRAPER_TIMEOUT_MS=20000
SCRAPER_MAX_RETRIES=2
SCRAPER_USER_AGENT=KatilimFinansBot/1.0

DATA_FRESHNESS_MINUTES=40
DATA_EXPIRED_MINUTES=180
MAX_SYNC_REFRESH_SOURCES=3

ALLOW_DEMO_DATA=false
ADMIN_API_KEY=<uzun-rastgele-deger>
APP_URL=https://<alan-adiniz>
```

**`ADMIN_API_KEY` değerini mutlaka değiştirin.** Yerel geliştirme
varsayılanı canlıda kullanılmamalıdır; admin uçlarını bu anahtar korur.

PostgreSQL kullanacaksanız `DATABASE_URL` (ve gerekiyorsa `PGSSL=true`)
ekleyin. Tanımlı değilse uygulama bellek/JSON deposuna düşer ve veriler
her yeniden başlatmada sıfırlanır.

## 3. Ağ ve alan adı

- **Port:** 3000. Sunucu `PORT` değişkenini okur, konteyner `0.0.0.0` üzerinde dinler.
- **Domains** sekmesinden alan adını ekleyip **HTTPS (Let's Encrypt)** işaretleyin.
- **Health check path:** `/api/health` — Dokploy bu ucu kullanabilir.
  `Dockerfile` içinde ayrıca konteyner düzeyinde `HEALTHCHECK` tanımlıdır.

`/api/health` yanıtı, anahtarların gerçekten yüklendiğini doğrulamak için
kullanılabilir:

```json
{ "status": "ok", "api_key_configured": true, "qdrant_configured": true }
```

Bu iki alan `false` dönüyorsa ortam değişkenleri konteynere ulaşmamıştır.

## 4. Kalıcı depolama (opsiyonel)

Scraper indirdiği sayfaları `/app/.scraper-cache` altına yazar. Bu klasör
olmadan da çalışır, yalnızca her dağıtımdan sonra ilk tarama sıfırdan
yapılır. Kalıcı olmasını isterseniz Dokploy → **Volumes**:

```
/app/.scraper-cache
```

## 5. Kaynak gereksinimi

Scraper 10 bankayı `SCRAPER_INTERVAL_MINUTES` aralığıyla tarar ve HTML
ayrıştırır. 1 vCPU / 1 GB RAM tipik kullanım için yeterlidir. Bellek dar
gelirse `SCRAPER_INTERVAL_MINUTES` değerini artırın veya
`SCRAPER_ENABLED=false` ile taramayı kapatıp Qdrant'taki mevcut indeksle
çalıştırın.

## 6. Yerelde imajı doğrulama

Dokploy'a göndermeden önce aynı imajı yerelde çalıştırabilirsiniz:

```bash
docker build -t katilim .
docker run --rm -p 3000:3000 --env-file .env -e NODE_ENV=production katilim
```

Ardından http://localhost:3000/api/health adresini kontrol edin.

## Notlar

- `npm run build` iki çıktı üretir: istemci `dist/client`, sunucu
  `dist/server.cjs`. Express yalnızca `dist/client` klasörünü statik
  servis eder, sunucu paketi dışarı açılmaz.
- Sunucu paketi `--packages=external` ile derlendiği için çalışma
  zamanında `node_modules` gereklidir; imaj bunu üretim bağımlılıklarıyla
  sınırlı olarak içerir.
- EVREN ve Qdrant servisleri dış ağdadır; Dokploy sunucusundan bu
  adreslere giden HTTPS trafiğinin açık olduğundan emin olun.

## Konuşma servisi (sesli asistan)

Sesli özellikler ayrı bir konteynerde çalışır: `speech-service/`. Whisper (STT)
ve Piper (TTS) modelleri yüzlerce MB tuttuğu ve Python çalışma zamanı
gerektirdiği için web imajına dâhil edilmez.

### Neden proxy üzerinden

Tarayıcı konuşma servisine **doğrudan bağlanmaz**. İstekler web uygulamasındaki
`/api/speech` proxy'si üzerinden geçer. Sebepleri:

- Sayfa HTTPS ile sunulduğu için HTTP servise giden istek karışık içerik olarak
  engellenirdi.
- `localhost:8001` üretimde kullanıcının kendi makinesine işaret eder.
- Proxy sayesinde CORS yapılandırmasına gerek kalmaz.
- Ses verisi kurum ağının dışına çıkmaz (şartname 5.9).

### Dokploy'da kurulum

Uygulama tek Dockerfile yerine **Docker Compose** ile dağıtılır:

1. Dokploy → uygulamada **Build Type: Docker Compose** seç.
2. Compose dosyası: depodaki kök `docker-compose.yml`.
3. Ortam değişkenlerini yine **Environment** sekmesinden gir; compose bunları
   `web` servisine aktarır.

`docker-compose.yml` iki servis tanımlar:

| Servis | Port | Dışarı açık |
|---|---|---|
| `web` | 3000 | evet |
| `speech` | 8001 | hayır — yalnızca `web` erişir |

`web` servisine `SPEECH_SERVICE_URL=http://speech:8001` otomatik verilir; ayrıca
tanımlamanıza gerek yoktur.

### Model önbelleği

Modeller ilk çağrıda indirilir ve `speech-models` adlı kalıcı hacme yazılır.
Bu hacim olmadan her yeniden başlatmada yüzlerce MB yeniden iner.

### GPU

Varsayılan yapılandırma CPU içindir (`STT_MODEL=small`, `int8`). Sunucuda GPU
varsa `docker-compose.yml` içindeki `speech` servisinde şunları değiştirin:

```
SPEECH_DEVICE: cuda
STT_MODEL: large-v3-turbo
STT_COMPUTE_TYPE: float16
```

### Servis çalışmazsa

Konuşma servisi kapalıyken `/api/speech/*` uçları **503** döner ve arayüz sesli
özellikleri gizler. Uygulamanın geri kalanı etkilenmez.
