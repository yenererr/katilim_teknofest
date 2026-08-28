import { QdrantClient } from "@qdrant/js-client-rest";
import { DEFAULT_QDRANT_COLLECTION } from "./qdrantTypes";

export type QdrantEnvConfig = {
  url: string;
  port: number;
  prefix: string;
  apiKey: string;
  collection: string;
  /** URL şemasından türetilir; kurum içi Qdrant genelde düz HTTP'dir. */
  https: boolean;
};

/**
 * Ortam değişkenlerini doğrular. Gizli değerleri hata mesajında göstermez.
 */
export function loadQdrantEnv(
  env: NodeJS.ProcessEnv = process.env,
): QdrantEnvConfig {
  const missing: string[] = [];

  const url = env.EVREN_QDRANT_URL?.trim();
  const prefix = env.EVREN_QDRANT_PREFIX?.trim();
  const apiKey = env.EVREN_QDRANT_API_KEY?.trim();
  /** Kurum içi kurulum düz HTTP ile ayağa kalkar (ör. http://localhost:6333). */
  const yerelMi = /^http:\/\//i.test(url || "");
  const portRaw = env.EVREN_QDRANT_PORT?.trim() || (yerelMi ? "6333" : "443");
  const collection =
    env.QDRANT_COLLECTION?.trim() || DEFAULT_QDRANT_COLLECTION;

  if (!url) missing.push("EVREN_QDRANT_URL");
  // Uzak (EVREN) kurulum çok takımlıdır: önek ve anahtar olmadan istek
  // yanlış takımın koleksiyonuna gidebilir, bu yüzden zorunludur.
  // Kurum içi kurulumda ikisi de anlamsızdır, aranmaz.
  if (!yerelMi) {
    if (!prefix) missing.push("EVREN_QDRANT_PREFIX");
    if (!apiKey) missing.push("EVREN_QDRANT_API_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `Qdrant yapılandırması eksik: ${missing.join(", ")}. ` +
        `.env dosyasını kontrol edin (değerler hata mesajında gösterilmez).`,
    );
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(
      "EVREN_QDRANT_PORT geçerli bir port numarası olmalıdır (ör. 443).",
    );
  }

  // Takım yolunu URL'ye ekleme — prefix istemci ayarıyla gider
  let normalizedUrl = url!;
  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.pathname && parsed.pathname !== "/") {
      throw new Error(
        "EVREN_QDRANT_URL yalnızca protokol ve host içermelidir; " +
          "takım yolu prefix (EVREN_QDRANT_PREFIX) ile gönderilir.",
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("prefix")) throw err;
    throw new Error(
      "EVREN_QDRANT_URL geçerli bir adres olmalıdır " +
        "(uzak: https://evren-vektor.ssyz.org.tr, kurum içi: http://localhost:6333).",
    );
  }

  return {
    url: normalizedUrl.replace(/\/$/, ""),
    port,
    prefix: prefix ?? "",
    apiKey: apiKey ?? "",
    collection,
    https: !yerelMi,
  };
}

export function isQdrantConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const url = env.EVREN_QDRANT_URL?.trim();
  if (!url) return false;
  // Kurum içi (http) kurulumda önek ve anahtar aranmaz.
  if (/^http:\/\//i.test(url)) return true;
  return Boolean(
    env.EVREN_QDRANT_PREFIX?.trim() && env.EVREN_QDRANT_API_KEY?.trim(),
  );
}

let cachedClient: QdrantClient | null = null;
let cachedConfig: QdrantEnvConfig | null = null;

/**
 * Tekrar kullanılabilir Qdrant REST istemcisi.
 * gRPC kullanılmaz; port ve prefix açıkça ayarlanır.
 */
export function getQdrantClient(
  env: NodeJS.ProcessEnv = process.env,
): { client: QdrantClient; config: QdrantEnvConfig } {
  const config = loadQdrantEnv(env);

  if (
    cachedClient &&
    cachedConfig &&
    cachedConfig.url === config.url &&
    cachedConfig.port === config.port &&
    cachedConfig.prefix === config.prefix &&
    cachedConfig.apiKey === config.apiKey
  ) {
    return { client: cachedClient, config };
  }

  const client = new QdrantClient({
    url: config.url,
    port: config.port,
    // Boş önek/anahtar gönderilirse istemci geçersiz başlık üretir; kurum
    // içi kurulumda alanlar tamamen atlanır.
    ...(config.prefix ? { prefix: config.prefix } : {}),
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    https: config.https,
    checkCompatibility: false,
    timeout: 120_000,
  });

  cachedClient = client;
  cachedConfig = config;
  return { client, config };
}

/** Testlerde istemci önbelleğini temizler */
export function resetQdrantClientCache(): void {
  cachedClient = null;
  cachedConfig = null;
}

/**
 * Bağlantı sağlık kontrolü. Anahtarları loglamaz / döndürmez.
 */
export async function checkQdrantHealth(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: boolean; message: string }> {
  if (!isQdrantConfigured(env)) {
    return {
      ok: false,
      message:
        "Qdrant yapılandırılmamış. EVREN_QDRANT_URL, EVREN_QDRANT_PREFIX ve EVREN_QDRANT_API_KEY gerekli.",
    };
  }

  try {
    const { client } = getQdrantClient(env);
    await client.getCollections();
    return { ok: true, message: "Qdrant bağlantısı başarılı." };
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : undefined;

    if (status === 401 || status === 403) {
      return {
        ok: false,
        message:
          "Qdrant kimlik doğrulaması başarısız. EVREN_QDRANT_API_KEY ve EVREN_QDRANT_PREFIX değerlerini kontrol edin.",
      };
    }

    return {
      ok: false,
      message:
        "Qdrant servisine ulaşılamadı. Ağ bağlantısını ve EVREN_QDRANT_URL adresini kontrol edin.",
    };
  }
}

/**
 * Hata mesajlarından olası API anahtarı sızıntısını temizler.
 */
export function sanitizeErrorMessage(
  message: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let safe = message;
  const secrets = [
    env.EVREN_QDRANT_API_KEY,
    env.EVREN_API_KEY,
    env.ADMIN_API_KEY,
  ].filter((s): s is string => Boolean(s && s.length > 4));

  for (const secret of secrets) {
    safe = safe.split(secret).join("[REDACTED]");
  }
  return safe;
}
