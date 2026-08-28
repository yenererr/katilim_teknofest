import os
from pathlib import Path
from dotenv import load_dotenv

# Load env variables from root .env and speech-service/.env
load_dotenv()
speech_service_env = Path(__file__).resolve().parent.parent / ".env"
if speech_service_env.exists():
    load_dotenv(speech_service_env, override=True)

BASE_DIR = Path(__file__).resolve().parent.parent

# Server Config
HOST = os.getenv("SPEECH_SERVICE_HOST", "0.0.0.0")
PORT = int(os.getenv("SPEECH_SERVICE_PORT", "8001"))

# Device & Acceleration
# "auto", "cuda", "cpu"
SPEECH_DEVICE = os.getenv("SPEECH_DEVICE", "auto")

# STT Configuration
# "large-v3-turbo", "medium", "small", "base"
STT_MODEL = os.getenv("STT_MODEL", "large-v3-turbo")
# "auto", "float16", "int8", "float32"
STT_COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "auto")
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "tr")

# TTS Configuration
# Yalnizca Piper desteklenir. Coqui XTTS v2 yolu kaldirildi: agirliklari CPML
# (ticari olmayan) lisansliydi ve sartname 5.10 acik kaynak/lisans kosuluyla
# celisiyordu. Piper agirliklari MIT / Open Data lisanslidir.
TTS_ENGINE = "piper"
PIPER_VOICE = os.getenv("PIPER_VOICE", "tr_TR-dfki-medium")

# Cache Directories
MODELS_CACHE_DIR = Path(os.getenv("MODELS_CACHE_DIR", str(BASE_DIR / "models")))
MODELS_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Audio Limits
MAX_AUDIO_SIZE_BYTES = int(os.getenv("MAX_AUDIO_SIZE_BYTES", str(20 * 1024 * 1024))) # 20MB
MAX_AUDIO_DURATION_SEC = float(os.getenv("MAX_AUDIO_DURATION_SEC", "120.0")) # 2 minutes

# CORS Origins
raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173")
CORS_ORIGINS = [o.strip() for o in raw_origins.split(",") if o.strip()]
