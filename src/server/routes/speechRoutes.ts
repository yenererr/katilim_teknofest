import { Router, type Request, type Response } from "express";

/**
 * Konuşma servisi (STT / TTS) proxy'si.
 *
 * Tarayıcı doğrudan konuşma servisine bağlanamaz: üretimde sayfa HTTPS ile
 * sunulur ve `http://localhost:8001` hem karışık içerik olarak engellenir hem
 * de kullanıcının kendi makinesine işaret eder. Bu yüzden istekler uygulama
 * sunucusu üzerinden aktarılır; servis kurum ağının içinde kapalı kalır
 * (şartname 5.9 — müşteri verisi kurum dışına çıkmaz).
 */

const VARSAYILAN_URL = "http://127.0.0.1:8001";

/** Konuşma servisinin adresi; Dokploy'da servis adıyla verilir. */
export function speechServiceUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.SPEECH_SERVICE_URL || VARSAYILAN_URL).replace(/\/+$/, "");
}

/** Ses dosyaları büyük olabildiğinden aktarım süreleri uzun tutulur. */
const ZAMAN_ASIMI = {
  health: 4_000,
  stt: 300_000,
  tts: 120_000,
} as const;

async function aktar(
  req: Request,
  res: Response,
  yol: string,
  timeoutMs: number,
): Promise<void> {
  const hedef = `${speechServiceUrl()}${yol}`;

  try {
    const yanit = await fetch(hedef, {
      method: req.method,
      headers: aktarilacakBasliklar(req),
      // GET dışındaki isteklerde ham gövde aynen iletilir (ses, form-data).
      body: req.method === "GET" || req.method === "HEAD" ? undefined : (req as unknown as BodyInit),
      // Node fetch akış gövdesi için bu alanı zorunlu tutar.
      ...(req.method === "GET" || req.method === "HEAD" ? {} : { duplex: "half" }),
      signal: AbortSignal.timeout(timeoutMs),
    } as RequestInit);

    const tur = yanit.headers.get("content-type");
    if (tur) res.setHeader("Content-Type", tur);
    res.status(yanit.status);

    const govde = Buffer.from(await yanit.arrayBuffer());
    res.send(govde);
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : String(err);
    const ulasilamiyor = /ECONNREFUSED|fetch failed|ENOTFOUND|timeout|aborted/i.test(mesaj);

    // Servis kapalıysa özellik kapalıdır; uygulamanın geri kalanı etkilenmez.
    res.status(ulasilamiyor ? 503 : 502).json({
      error: ulasilamiyor
        ? "Konuşma servisi şu anda çalışmıyor. Sesli özellikler geçici olarak kullanılamıyor."
        : "Konuşma servisine erişilemedi.",
      detail: mesaj,
    });
  }
}

/** Yalnızca gerekli başlıklar iletilir; çerez ve yetki başlıkları geçirilmez. */
function aktarilacakBasliklar(req: Request): Record<string, string> {
  const basliklar: Record<string, string> = {};
  const contentType = req.headers["content-type"];
  if (typeof contentType === "string") basliklar["content-type"] = contentType;
  const contentLength = req.headers["content-length"];
  if (typeof contentLength === "string") basliklar["content-length"] = contentLength;
  return basliklar;
}

export function createSpeechRouter(): Router {
  const router = Router();

  router.get("/health", (req, res) => {
    void aktar(req, res, "/health", ZAMAN_ASIMI.health);
  });

  router.post("/stt/transcribe", (req, res) => {
    void aktar(req, res, "/stt/transcribe", ZAMAN_ASIMI.stt);
  });

  router.post("/tts/synthesize", (req, res) => {
    void aktar(req, res, "/tts/synthesize", ZAMAN_ASIMI.tts);
  });

  return router;
}
