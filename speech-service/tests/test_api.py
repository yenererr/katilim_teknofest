import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "speech-service"
    assert "device" in data
    assert "stt" in data
    assert "tts" in data

def test_tts_empty_text():
    response = client.post("/tts/synthesize", json={"text": "   "})
    assert response.status_code == 400

def test_stt_missing_file():
    response = client.post("/stt/transcribe")
    assert response.status_code == 422 # Unprocessable entity due to missing form file
