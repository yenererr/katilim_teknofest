/**
 * EVREN chat completions — RAG ve çıkarım için ortak istemci.
 * API anahtarını loglamaz.
 */

const DEFAULT_BASE = "https://evren-llmapi.ssyz.org.tr/v1";
const DEFAULT_MODEL = "llm-fast";
const MAX_ATTEMPTS = 3;

export type EvrenChatResult = {
  content: string;
  usedModel: string | null;
  modelWarning: string | null;
  requestedModel: string;
};

export type EvrenChatOptions = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callEvrenChat(
  options: EvrenChatOptions,
): Promise<EvrenChatResult | null> {
  const apiKey = options.apiKey ?? process.env.EVREN_API_KEY?.trim();
  if (!apiKey) return null;

  const baseUrl = (
    options.baseUrl ??
    process.env.EVREN_BASE_URL ??
    DEFAULT_BASE
  ).replace(/\/$/, "");
  const model =
    options.model ??
    process.env.EVREN_CHAT_MODEL ??
    process.env.EVREN_MODEL ??
    DEFAULT_MODEL;
  const timeoutMs =
    options.timeoutMs ??
    Number(process.env.EVREN_TIMEOUT_SECONDS || 1800) * 1000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const jsonMode = options.jsonMode !== false;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
        temperature: options.temperature ?? 0.0,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
      };
      if (jsonMode) {
        body.response_format = { type: "json_object" };
      }

      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "EVREN kimlik doğrulaması başarısız. EVREN_API_KEY değerini kontrol edin.",
        );
      }

      if (!res.ok) {
        if (
          (res.status === 408 || res.status === 429 || res.status >= 500) &&
          attempt < MAX_ATTEMPTS
        ) {
          await sleep(750 * 2 ** (attempt - 1));
          continue;
        }
        throw new Error(`EVREN API hatası (HTTP ${res.status}).`);
      }

      const json = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("EVREN API boş yanıt döndürdü.");
      }

      const usedModel = json.model ?? null;
      let modelWarning: string | null = null;
      if (usedModel && usedModel !== model && !usedModel.includes(model)) {
        modelWarning = `İstenen model aliası "${model}", yanıt modeli "${usedModel}".`;
      }

      return {
        content,
        usedModel,
        modelWarning,
        requestedModel: model,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/kimlik doğrulama/i.test(message)) {
        throw err instanceof Error ? err : new Error(message);
      }
      lastError = err instanceof Error ? err : new Error(message);
      const retryable =
        /abort|timeout|network|fetch failed|ECONNRESET|ETIMEDOUT|HTTP 5|HTTP 429|HTTP 408|boş yanıt/i.test(
          message,
        ) || (err instanceof Error && err.name === "AbortError");
      if (retryable && attempt < MAX_ATTEMPTS) {
        await sleep(750 * 2 ** (attempt - 1));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("EVREN çağrısı başarısız.");
}

/** Hata mesajından anahtar sızıntısını temizler */
export function sanitizeEvrenError(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let safe = message;
  const secrets = [env.EVREN_API_KEY, env.EVREN_QDRANT_API_KEY, env.ADMIN_API_KEY].filter(
    (s): s is string => Boolean(s && s.length > 4),
  );
  for (const secret of secrets) {
    safe = safe.split(secret).join("[REDACTED]");
  }
  return safe;
}
