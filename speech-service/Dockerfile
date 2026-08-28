# syntax=docker/dockerfile:1

# Konuşma servisi (STT / TTS) — Node uygulamasından ayrı konteyner.
#
# Ayrı tutulmasının nedeni: Whisper ve Piper modelleri yüzlerce MB tutar ve
# Python çalışma zamanı gerektirir. Aynı imaja konsaydı web uygulamasının
# imajı gereksiz yere büyür, dağıtımı yavaşlardı.

FROM python:3.12-slim AS runner

WORKDIR /app

# ffmpeg: ses dönüştürme (webm/ogg → wav). Tesseract: Findeks PDF OCR.
# --no-install-recommends ile imaj küçük tutulur.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        tesseract-ocr \
        tesseract-ocr-tur \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Bağımlılıklar önce kurulur; kod değişince bu katman yeniden çalışmaz.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY run_speech_service.py ./

# Modeller ilk çağrıda indirilir ve bu dizine yazılır. Konteyner yeniden
# başladığında yeniden indirmemek için burayı kalıcı hacim olarak bağlayın.
ENV MODELS_CACHE_DIR=/app/models
RUN mkdir -p /app/models

ENV SPEECH_SERVICE_HOST=0.0.0.0 \
    SPEECH_SERVICE_PORT=8001 \
    PYTHONUNBUFFERED=1

# Kök kullanıcı olarak çalışmaz.
RUN useradd --create-home --uid 10001 speech \
    && chown -R speech:speech /app
USER speech

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8001/health || exit 1

CMD ["python", "run_speech_service.py"]
