import { useState, useRef, useEffect, useCallback } from "react";

export type SpeechState =
  | "idle"
  | "requesting_mic"
  | "listening"
  | "transcribing"
  | "synthesizing"
  | "speaking"
  | "error";

export type SpeechHookOptions = {
  speechServiceUrl?: string;
  silenceThresholdMs?: number;
  autoPlayDefault?: boolean;
};

const DEFAULT_SPEECH_SERVICE_URL = "http://localhost:8001";
const STORAGE_KEY_AUTOPLAY = "katilim_auto_play_tts";

export function useSpeech(options: SpeechHookOptions = {}) {
  const {
    speechServiceUrl = DEFAULT_SPEECH_SERVICE_URL,
    autoPlayDefault = false,
  } = options;

  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [autoPlayTTS, setAutoPlayTTS] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTOPLAY);
      return saved !== null ? JSON.parse(saved) : autoPlayDefault;
    } catch {
      return autoPlayDefault;
    }
  });
  const [isServiceHealthy, setIsServiceHealthy] = useState<boolean | null>(null);

  const stateRef = useRef<SpeechState>("idle");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist autoPlayTTS setting
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_AUTOPLAY, JSON.stringify(autoPlayTTS));
    } catch {
      // ignore storage errors
    }
  }, [autoPlayTTS]);

  // Check speech-service health on mount
  useEffect(() => {
    let unmounted = false;
    async function checkHealth() {
      try {
        const res = await fetch(`${speechServiceUrl}/health`, { signal: AbortSignal.timeout(3000) });
        if (!unmounted) setIsServiceHealthy(res.ok);
      } catch {
        if (!unmounted) setIsServiceHealthy(false);
      }
    }
    void checkHealth();
    return () => {
      unmounted = true;
    };
  }, [speechServiceUrl]);

  // Clean up media streams and audio context without changing function identity
  const cleanupRecordingStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const stopAudioPlayback = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (stateRef.current === "speaking" || stateRef.current === "synthesizing") {
      setState("idle");
    }
  }, []);

  // Unmount safety — runs ONLY when component actually unmounts
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        try { void audioContextRef.current.close(); } catch {}
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Start microphone recording (1st press starts, 2nd press stops)
  const startListening = useCallback(
    async (onTranscribed: (text: string) => void) => {
      setError(null);
      stopAudioPlayback();
      cleanupRecordingStream();
      setState("requesting_mic");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        mediaStreamRef.current = stream;
        audioChunksRef.current = [];

        // AudioContext for live volume meter
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;

        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;

        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/wav";

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          cleanupRecordingStream();
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          
          if (audioBlob.size < 1000) {
            setState("idle");
            return;
          }

          setState("transcribing");
          try {
            const formData = new FormData();
            formData.append("file", audioBlob, `recording.${mimeType.includes("webm") ? "webm" : "wav"}`);
            formData.append("language", "tr");

            const controller = new AbortController();
            abortControllerRef.current = controller;

            const res = await fetch(`${speechServiceUrl}/stt/transcribe`, {
              method: "POST",
              body: formData,
              signal: controller.signal,
            });

            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              throw new Error(errJson.detail || "Ses metne dönüştürülemedi.");
            }

            const data = await res.json();
            const text = data.text?.trim();

            if (text) {
              setState("idle");
              onTranscribed(text);
            } else {
              setError("Ses anlaşılamadı, lütfen tekrar deneyin.");
              setState("idle");
            }
          } catch (err) {
            if ((err as Error).name !== "AbortError") {
              setError(err instanceof Error ? err.message : "STT Bağlantı hatası");
              setState("error");
            } else {
              setState("idle");
            }
          }
        };

        recorder.start(100);
        setState("listening");

        // Live Audio Level Monitoring Loop
        const pcmData = new Uint8Array(analyser.frequencyBinCount);
        const startTime = Date.now();

        const monitorAudio = () => {
          if (!mediaStreamRef.current || recorder.state !== "recording") return;

          analyser.getByteFrequencyData(pcmData);
          let sum = 0;
          for (let i = 0; i < pcmData.length; i++) {
            sum += pcmData[i];
          }
          const avg = sum / pcmData.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));

          // Max safety timeout (60 seconds)
          if (Date.now() - startTime > 60000) {
            recorder.stop();
            return;
          }

          requestAnimationFrame(monitorAudio);
        };

        requestAnimationFrame(monitorAudio);
      } catch (err) {
        cleanupRecordingStream();
        const msg =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Mikrofon izni reddedildi. Yazılı sohbete devam edebilirsiniz."
            : "Mikrofona erişilemedi.";
        setError(msg);
        setState("error");
      }
    },
    [speechServiceUrl, cleanupRecordingStream, stopAudioPlayback]
  );

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecordingStream();
      setState("idle");
    }
  }, [cleanupRecordingStream]);

  // Text-To-Speech Playback
  const speakText = useCallback(
    async (text: string) => {
      if (!text || !text.trim()) return;
      stopAudioPlayback();
      setState("synthesizing");
      setError(null);

      try {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const res = await fetch(`${speechServiceUrl}/tts/synthesize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.detail || "Ses oluşturulamadı.");
        }

        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;

        audio.onplay = () => setState("speaking");
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          setState("idle");
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          setError("Ses oynatılamadı.");
          setState("idle");
        };

        await audio.play();
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          logger_warn(err);
          setError("Sesli yanıt servisine ulaşılamadı.");
          setState("idle");
        }
      }
    },
    [speechServiceUrl, stopAudioPlayback]
  );

  return {
    state,
    error,
    audioLevel,
    autoPlayTTS,
    setAutoPlayTTS,
    isServiceHealthy,
    startListening,
    stopListening,
    speakText,
    stopAudioPlayback,
  };
}

function logger_warn(err: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[SpeechHook]", err);
  }
}
