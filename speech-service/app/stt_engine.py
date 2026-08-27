import io
import time
import logging
import tempfile
import os
from pathlib import Path
from typing import Dict, Any, Tuple, Optional

from app import config

logger = logging.getLogger("speech_service.stt")

_whisper_model = None
_actual_device = "cpu"
_actual_compute_type = "int8"

def get_stt_engine():
    """Lazy initialization of faster-whisper model with fallback mechanisms."""
    global _whisper_model, _actual_device, _actual_compute_type

    if _whisper_model is not None:
        return _whisper_model, _actual_device, _actual_compute_type

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        logger.error("faster-whisper is not installed. Please install faster-whisper package.")
        raise RuntimeError("faster-whisper package missing")

    target_device = config.SPEECH_DEVICE.lower()
    compute_type = config.STT_COMPUTE_TYPE.lower()

    if target_device in ("auto", "cuda"):
        try:
            import torch
            has_cuda = torch.cuda.is_available()
        except ImportError:
            has_cuda = False

        if has_cuda or target_device == "cuda":
            _actual_device = "cuda"
            _actual_compute_type = "float16" if compute_type in ("auto", "float16") else compute_type
            logger.info(f"Attempting to load WhisperModel('{config.STT_MODEL}') on CUDA ({_actual_compute_type})...")
            try:
                _whisper_model = WhisperModel(
                    config.STT_MODEL,
                    device="cuda",
                    compute_type=_actual_compute_type,
                    download_root=str(config.MODELS_CACHE_DIR)
                )
                logger.info(f"Successfully loaded WhisperModel on CUDA.")
                return _whisper_model, _actual_device, _actual_compute_type
            except Exception as e:
                logger.warning(f"Failed to initialize WhisperModel on CUDA: {e}. Falling back to CPU.")

    # CPU Fallback
    _actual_device = "cpu"
    _actual_compute_type = "int8" if compute_type in ("auto", "int8") else "float32"
    logger.info(f"Loading WhisperModel('{config.STT_MODEL}') on CPU ({_actual_compute_type})...")
    _whisper_model = WhisperModel(
        config.STT_MODEL,
        device="cpu",
        compute_type=_actual_compute_type,
        download_root=str(config.MODELS_CACHE_DIR)
    )
    logger.info("Successfully loaded WhisperModel on CPU.")
    return _whisper_model, _actual_device, _actual_compute_type

def transcribe_audio(
    audio_bytes: bytes,
    filename: str = "audio.wav",
    language: Optional[str] = None
) -> Dict[str, Any]:
    """Transcribes raw audio bytes using faster-whisper."""
    start_time = time.time()
    model, device, compute_type = get_stt_engine()
    lang = language or config.STT_LANGUAGE

    # Save incoming audio bytes to temporary file for robust FFmpeg compatibility
    suffix = Path(filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(
            tmp_path,
            language=lang,
            beam_size=5,
            vad_filter=True, # Voice Activity Detection filter
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        segment_list = []
        full_text_parts = []
        for segment in segments:
            full_text_parts.append(segment.text.strip())
            segment_list.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": segment.text.strip()
            })

        full_text = " ".join(full_text_parts).strip()
        processing_time = round(time.time() - start_time, 3)

        return {
            "text": full_text,
            "language": info.language if hasattr(info, "language") else lang,
            "duration": round(info.duration, 2) if hasattr(info, "duration") else 0.0,
            "processing_time": processing_time,
            "device": device,
            "compute_type": compute_type,
            "segments": segment_list
        }
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
