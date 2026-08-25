import { EMBEDDING_VECTOR_SIZE } from "../qdrant/qdrantTypes";

const DEFAULT_BASE_URL = "https://evren-llmapi.ssyz.org.tr/v1";
const EMBEDDING_MODEL = "bge-m3-embed";
const EMBEDDING_TIMEOUT_MS = 1_800_000;
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 16;
/** Tek istekte gönderilecek yaklaşık karakter üst sınırı */
const MAX_CHARS_PER_ITEM = 6_000;

export type EmbeddingServiceOptions = {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function getApiKey(options?: EmbeddingServiceOptions): string {
  const key = options?.apiKey ?? process.env.EVREN_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "EVREN_API_KEY tanımlı değil. Embedding için LLM API anahtarı gerekli.",
    );
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function validateVector(vector: unknown, index: number): number[] {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_VECTOR_SIZE) {
    throw new Error(
      `Embedding boyutu geçersiz (index=${index}): beklenen ${EMBEDDING_VECTOR_SIZE}, ` +
        `gelen ${Array.isArray(vector) ? vector.length : typeof vector}.`,
    );
  }
  if (!vector.every((n) => typeof n === "number" && Number.isFinite(n))) {
    throw new Error(`Embedding sayısal olmayan değer içeriyor (index=${index}).`);
  }
  return vector as number[];
}

/**
 * EVREN bge-m3-embed embedding servisi.
 * API anahtarını loglamaz.
 */
export class EvrenEmbeddingService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: EmbeddingServiceOptions = {}) {
    this.apiKey = getApiKey(options);
    this.baseUrl = (options.baseUrl ?? process.env.EVREN_BASE_URL ?? DEFAULT_BASE_URL)
      .replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embedText(text: string): Promise<number[]> {
    const vectors = await this.embedTexts([text]);
    return vectors[0];
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const prepared = texts.map((t, i) => {
      const trimmed = (t ?? "").trim();
      if (!trimmed) {
        throw new Error(
          `Boş metin embedding servisine gönderilemez (index=${i}).`,
        );
      }
      return trimmed.length > MAX_CHARS_PER_ITEM
        ? trimmed.slice(0, MAX_CHARS_PER_ITEM)
        : trimmed;
    });

    const results: number[][] = new Array(prepared.length);
    for (let offset = 0; offset < prepared.length; offset += BATCH_SIZE) {
      const batch = prepared.slice(offset, offset + BATCH_SIZE);
      const batchVectors = await this.embedBatch(batch);
      for (let i = 0; i < batchVectors.length; i++) {
        results[offset + i] = batchVectors[i];
      }
    }
    return results;
  }

  private async embedBatch(inputs: string[]): Promise<number[][]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        EMBEDDING_TIMEOUT_MS,
      );

      try {
        const res = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: inputs.length === 1 ? inputs[0] : inputs,
          }),
        });

        if (!res.ok) {
          if (isAuthError(res.status)) {
            throw new Error(
              "Embedding kimlik doğrulaması başarısız. EVREN_API_KEY değerini kontrol edin.",
            );
          }
          if (isRetryable(res.status) && attempt < MAX_ATTEMPTS) {
            await sleep(750 * 2 ** (attempt - 1));
            continue;
          }
          throw new Error(
            `Embedding API hatası (HTTP ${res.status}). Geçici bir sorun olabilir.`,
          );
        }

        const json = (await res.json()) as {
          data?: Array<{ embedding?: number[]; index?: number }>;
        };

        const data = Array.isArray(json.data) ? json.data : [];
        if (data.length !== inputs.length) {
          throw new Error(
            `Embedding yanıt sayısı uyuşmuyor: beklenen ${inputs.length}, gelen ${data.length}.`,
          );
        }

        // OpenAI uyumlu yanıtta index alanı olabilir
        const sorted = [...data].sort(
          (a, b) => (a.index ?? 0) - (b.index ?? 0),
        );

        return sorted.map((item, i) => validateVector(item.embedding, i));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/kimlik doğrulama/i.test(message)) {
          throw err instanceof Error ? err : new Error(message);
        }

        const retryable =
          /abort|timeout|network|fetch failed|ECONNRESET|ETIMEDOUT|HTTP 5|HTTP 429|HTTP 408/i.test(
            message,
          ) ||
          (err instanceof Error && err.name === "AbortError");

        lastError = err instanceof Error ? err : new Error(message);
        if (retryable && attempt < MAX_ATTEMPTS) {
          await sleep(750 * 2 ** (attempt - 1));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError ?? new Error("Embedding isteği başarısız oldu.");
  }
}

let singleton: EvrenEmbeddingService | null = null;

export function getEmbeddingService(): EvrenEmbeddingService {
  if (!singleton) singleton = new EvrenEmbeddingService();
  return singleton;
}

export function resetEmbeddingService(): void {
  singleton = null;
}
