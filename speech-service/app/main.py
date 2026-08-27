import time
import logging
from typing import Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import config
from app.stt_engine import transcribe_audio, get_stt_engine
from app.tts_engine import synthesize_speech
from app.normalizer import normalize_turkish_financial_text

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("speech_service")

app = FastAPI(
    title="KatılımFinans Local Speech Service",
    description="Local Speech-to-Text (faster-whisper) and Text-to-Speech (Piper TTS) API service for Turkish language.",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize into speech", min_length=1, max_length=5000)
    voice: Optional[str] = Field(None, description="Optional TTS speaker voice name")

@app.get("/health")
def health_check():
    """Health endpoint showing service status, device hardware, and model configuration."""
    cuda_available = False
    gpu_name = None
    vram_mb = None

    try:
        import torch
        cuda_available = torch.cuda.is_available()
        if cuda_available:
            gpu_name = torch.cuda.get_device_name(0)
            vram_mb = round(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024), 2)
    except ImportError:
        pass

    return {
        "status": "ok",
        "service": "speech-service",
        "device": {
            "configured_device": config.SPEECH_DEVICE,
            "cuda_available": cuda_available,
            "gpu_name": gpu_name,
            "vram_mb": vram_mb
        },
        "stt": {
            "model": config.STT_MODEL,
            "compute_type": config.STT_COMPUTE_TYPE,
            "default_language": config.STT_LANGUAGE
        },
        "tts": {
            "engine": config.TTS_ENGINE,
            "default_voice": config.PIPER_VOICE,
            "license": "MIT / Open Data (Commercial OK)" if config.TTS_ENGINE == "piper" else "CPML (NON-COMMERCIAL PROTOTYPE)"
        }
    }

@app.post("/stt/transcribe")
async def transcribe_endpoint(
    file: UploadFile = File(...),
    language: Optional[str] = Form(config.STT_LANGUAGE)
):
    """Endpoint for audio transcription (Speech-to-Text)."""
    if not file:
        raise HTTPException(status_code=400, detail="No audio file uploaded.")

    audio_bytes = await file.read()
    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")

    if len(audio_bytes) > config.MAX_AUDIO_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file size exceeds limit of {config.MAX_AUDIO_SIZE_BYTES // (1024*1024)} MB."
        )

    try:
        result = transcribe_audio(
            audio_bytes=audio_bytes,
            filename=file.filename or "recording.wav",
            language=language
        )
        return result
    except Exception as e:
        logger.error(f"Transcription error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Audio transcription failed: {str(e)}")

@app.post("/tts/synthesize")
def synthesize_endpoint(req: TTSRequest):
    """Endpoint for text-to-speech synthesis."""
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text field cannot be empty.")

    try:
        wav_bytes, meta = synthesize_speech(text, speaker_voice=req.voice)
        
        from urllib.parse import quote
        headers = {
            "X-Speech-Normalized-Text": quote(meta.get("normalized_text", "")[:200]),
            "X-Speech-Processing-Time-Ms": str(meta.get("duration_ms", 0)),
            "X-Speech-License": meta.get("license", "MIT")
        }
        if meta.get("engine") == "xtts":
            headers["X-Speech-Notice"] = "NON-COMMERCIAL PROTOTYPE"

        return Response(content=wav_bytes, media_type="audio/wav", headers=headers)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"TTS synthesis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Text-to-speech synthesis failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.HOST, port=config.PORT)
