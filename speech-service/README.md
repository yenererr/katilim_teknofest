# KatılımFinans Yerel Speech Servisi (STT & TTS)

Bu servis, KatılımFinans platformu için tamamen yerel çalışan, açık kaynaklı Türkçe **Speech-to-Text (STT)** ve **Text-to-Speech (TTS)** mikroservisidir.

---

## Özellikler

1. **Speech-to-Text (STT)**:
   - Motor: `SYSTRAN/faster-whisper`
   - Model: `openai/whisper-large-v3-turbo` (Varsayılan Türkçe `tr`)
   - Donanım İvmesi: CUDA GPU (FP16/INT8), CUDA bulunamazsa otomatik CPU fallback (`int8`).
   - Girdi Formatları: WAV, WebM, Ogg, MP3, M4A, AAC.

2. **Text-to-Speech (TTS)**:
   - Birincil Motor: `Piper TTS` (Sesler: `tr_TR-dfki-medium`, `tr_TR-fettah-medium`)
   - Lisans: **MIT / Open Data (Ticari Kullanıma Uygun)**
   - Alternatif Prototip Motoru: Coqui XTTS v2 (CPML - Ticari Olmayan Prototip Uyarısı Dahil)
   - İşlev: Türkçe finansal metin normalizasyonu (TL, %, vadeler, banka markaları ve BSMV/KKDF terimleri sese uygun biçimlendirilir).

3. **Güvenlik ve Gizlilik**:
   - Kullanıcı sesleri sunucuda kalıcı olarak kaydedilmez.
   - İzin alınmadan ses klonlama veya eğitim verisine dönüştürme yapılmaz.
   - Maksimum dosya boyutu sınırı (20 MB) ve süre sınırı uygulanır.

---

## Lisans ve Ticari Kullanım Uyarısı

- **faster-whisper & Whisper models**: **MIT Lisansı** (Ticari kullanıma serbest)
- **Piper TTS & Türkçe Ses Kalıpları**: **MIT / Open Data** (Ticari kullanıma serbest)
- **Coqui XTTS v2 (Opsiyonel)**: CPML (Coqui Public Model License) — **`NON-COMMERCIAL PROTOTYPE ONLY`**

---

## Kurulum ve Başlatma

### Gereksinimler
- Python 3.10 - 3.13
- FFmpeg (Sistem PATH üzerinde tanımlı)
- (Opsiyonel) NVIDIA GPU + CUDA 12.x sürücüleri

### Adım 1: Sanal Ortam Kurulumu
```bash
cd speech-service
python -m venv venv
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

pip install -r requirements.txt
```

### Adım 2: Konfigürasyon
`.env.example` dosyasını `.env` adıyla kopyalayın:
```env
SPEECH_SERVICE_HOST=0.0.0.0
SPEECH_SERVICE_PORT=8001
SPEECH_DEVICE=auto
STT_MODEL=large-v3-turbo
STT_COMPUTE_TYPE=auto
STT_LANGUAGE=tr
TTS_ENGINE=piper
PIPER_VOICE=tr_TR-dfki-medium
MODELS_CACHE_DIR=./models
```

### Adım 3: Servisi Başlatma
```bash
python run_speech_service.py
```
Servis `http://localhost:8001` adresinde aktif olacaktır.

---

## API Endpoint'leri

### 1. Health Check
- **`GET /health`**
- Servis durumunu, donanım bilgisini (GPU VRAM / CPU) ve aktif model konfigürasyonunu döndürür.

### 2. Speech-to-Text (Transkripsiyon)
- **`POST /stt/transcribe`**
- Girdi: `multipart/form-data` (file: ses dosyası, language: "tr")
- Örnek Yanıt:
```json
{
  "text": "200 bin TL taşıt finansmanını karşılaştır",
  "language": "tr",
  "duration": 4.2,
  "processing_time": 0.85,
  "device": "cuda",
  "compute_type": "float16"
}
```

### 3. Text-to-Speech (Ses Sentezleme)
- **`POST /tts/synthesize`**
- Girdi: JSON `{ "text": "200.000 TL taşıt finansmanı %3,49 oranla karşılaştırıldı." }`
- Çıktı: `audio/wav` ses akışı (Response Header: `X-Speech-Normalized-Text`).

---

## Testler
```bash
python -m pytest tests/
```
