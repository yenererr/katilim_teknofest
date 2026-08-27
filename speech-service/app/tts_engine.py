import io
import time
import logging
import os
import wave
import tempfile
import urllib.request
from pathlib import Path
from typing import Tuple, Dict, Any

from app import config
from app.normalizer import normalize_turkish_financial_text

logger = logging.getLogger("speech_service.tts")

# Piper Turkish Model URLs
PIPER_MODELS = {
    "tr_TR-dfki-medium": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx.json",
        "license": "MIT / Open Data (Commercial OK)"
    },
    "tr_TR-fettah-medium": {
        "onnx": "https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx",
        "json": "https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx.json",
        "license": "MIT / Open Data (Commercial OK)"
    }
}

_piper_voice_instance = None

def _download_file(url: str, dest_path: Path):
    """Downloads a file with progress logging."""
    logger.info(f"Downloading model file from {url} to {dest_path}...")
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = dest_path.with_suffix(".tmp")
    
    req = urllib.request.Request(url, headers={"User-Agent": "SpeechService/1.0"})
    with urllib.request.urlopen(req) as response, open(tmp_path, "wb") as out_file:
        data = response.read()
        out_file.write(data)
    
    tmp_path.rename(dest_path)
    logger.info(f"Downloaded {dest_path.name} ({dest_path.stat().st_size} bytes).")

def ensure_piper_model(voice_name: str = "tr_TR-dfki-medium") -> Tuple[Path, Path]:
    """Ensures Piper voice ONNX and JSON config files are downloaded."""
    if voice_name not in PIPER_MODELS:
        voice_name = "tr_TR-dfki-medium"

    model_info = PIPER_MODELS[voice_name]
    cache_dir = config.MODELS_CACHE_DIR / "piper" / voice_name
    cache_dir.mkdir(parents=True, exist_ok=True)

    onnx_path = cache_dir / f"{voice_name}.onnx"
    json_path = cache_dir / f"{voice_name}.onnx.json"

    if not onnx_path.exists():
        _download_file(model_info["onnx"], onnx_path)
    if not json_path.exists():
        _download_file(model_info["json"], json_path)

    return onnx_path, json_path

def synthesize_with_piper(text: str, voice_name: str = "tr_TR-dfki-medium") -> Tuple[bytes, Dict[str, Any]]:
    """Synthesizes normalized text into WAV audio using Piper TTS."""
    onnx_path, json_path = ensure_piper_model(voice_name)
    
    try:
        from piper import PiperVoice
        voice = PiperVoice.load(str(onnx_path), config_path=str(json_path))
        
        with io.BytesIO() as wav_io:
            with wave.open(wav_io, "wb") as wav_file:
                voice.synthesize_wav(text, wav_file)
            wav_bytes = wav_io.getvalue()

        meta = {
            "engine": "piper",
            "voice": voice_name,
            "license": PIPER_MODELS.get(voice_name, {}).get("license", "MIT"),
            "commercial_use_allowed": True
        }
        return wav_bytes, meta
    except Exception as e:
        logger.warning(f"Piper Python library invocation failed: {e}. Trying piper executable or fallback...")
        return _fallback_piper_cli(text, onnx_path, json_path, voice_name)

def _fallback_piper_cli(text: str, onnx_path: Path, json_path: Path, voice_name: str) -> Tuple[bytes, Dict[str, Any]]:
    """Fallback execution via piper binary CLI if available."""
    import subprocess
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_out:
        out_wav = tmp_out.name

    try:
        cmd = [
            "piper",
            "--model", str(onnx_path),
            "--config", str(json_path),
            "--output_file", out_wav
        ]
        proc = subprocess.run(cmd, input=text.encode("utf-8"), capture_output=True, check=True)
        with open(out_wav, "rb") as f:
            wav_bytes = f.read()

        meta = {
            "engine": "piper-cli",
            "voice": voice_name,
            "license": "MIT",
            "commercial_use_allowed": True
        }
        return wav_bytes, meta
    except Exception as err:
        logger.error(f"Piper CLI synthesis failed: {err}. Generating standard audio notice.")
        raise RuntimeError(f"Piper TTS synthesis failed: {err}")
    finally:
        if os.path.exists(out_wav):
            try:
                os.remove(out_wav)
            except Exception:
                pass

def synthesize_speech(text: str, speaker_voice: str = None) -> Tuple[bytes, Dict[str, Any]]:
    """Main entry point for text-to-speech synthesis with automatic text normalization."""
    start_time = time.time()
    
    # 1. Financial and Markdown normalization
    normalized_text = normalize_turkish_financial_text(text)
    if not normalized_text:
        raise ValueError("Provided text contains no synthesizable content after normalization.")

    voice = speaker_voice or config.PIPER_VOICE
    engine = config.TTS_ENGINE

    if engine == "xtts":
        meta_warning = "NON-COMMERCIAL PROTOTYPE: Coqui XTTS v2 weights carry CPML non-commercial license."
        logger.warning(meta_warning)

    wav_bytes, meta = synthesize_with_piper(normalized_text, voice)
    
    meta["duration_ms"] = round((time.time() - start_time) * 1000, 2)
    meta["normalized_text"] = normalized_text
    meta["char_count"] = len(normalized_text)
    return wav_bytes, meta
