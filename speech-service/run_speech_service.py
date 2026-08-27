import os
import sys
import uvicorn
from app import config

if __name__ == "__main__":
    print(f"Starting Speech Service on http://{config.HOST}:{config.PORT}")
    print(f"STT Model: {config.STT_MODEL} (Device: {config.SPEECH_DEVICE})")
    print(f"TTS Engine: {config.TTS_ENGINE} (Voice: {config.PIPER_VOICE})")
    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=False)
