import type { QdrantClient } from "@qdrant/js-client-rest";
import {
  checkQdrantHealth,
  getQdrantClient,
  isQdrantConfigured,
  type QdrantEnvConfig,
} from "./qdrantClient";
import {
  DEFAULT_QDRANT_COLLECTION,
  EMBEDDING_VECTOR_SIZE,
  type QdrantHealthStatus,
} from "./qdrantTypes";

/**
 * chunk_text için tam metin indeksi, hibrit aramanın anahtar kelime
 * ayağını mümkün kılar. Vektör araması tek başına "azami vade kaç ay"
 * gibi sorularda tanıtım paragraflarını öne çıkarıyor, sayıyı içeren
 * parça alt sıralarda kalıyordu.
 */
type TextIndexSchema = {
  type: "text";
  tokenizer: "multilingual" | "word" | "whitespace" | "prefix";
  lowercase: boolean;
  min_token_len: number;
  max_token_len: number;
};

const CHUNK_TEXT_INDEX: TextIndexSchema = {
  type: "text",
  tokenizer: "multilingual",
  lowercase: true,
  min_token_len: 2,
  max_token_len: 24,
};

const PAYLOAD_INDEXES: Array<{
  field: string;
  schema: "keyword" | "datetime" | TextIndexSchema;
}> = [
  { field: "chunk_text", schema: CHUNK_TEXT_INDEX },
  { field: "bank_id", schema: "keyword" },
  { field: "bank_name", schema: "keyword" },
  { field: "source_id", schema: "keyword" },
  { field: "source_url", schema: "keyword" },
  { field: "document_type", schema: "keyword" },
  { field: "product_type", schema: "keyword" },
  { field: "campaign_status", schema: "keyword" },
  { field: "source_checked_at", schema: "datetime" },
  { field: "content_hash", schema: "keyword" },
  { field: "schema_version", schema: "keyword" },
];

async function ensurePayloadIndexes(
  client: QdrantClient,
  collection: string,
): Promise<void> {
  for (const { field, schema } of PAYLOAD_INDEXES) {
    try {
      await client.createPayloadIndex(collection, {
        field_name: field,
        field_schema: schema as never,
        wait: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // İndeks zaten varsa yok say
      if (/already exists|already exist|conflict/i.test(msg)) continue;
      console.warn(
        `[Qdrant] Payload indeksi oluşturulamadı (${field}):`,
        msg.slice(0, 200),
      );
    }
  }
}

function readVectorSize(info: unknown): number | null {
  const raw = info as {
    result?: {
      config?: {
        params?: {
          vectors?: { size?: number } | Record<string, { size?: number }>;
        };
      };
    };
    config?: {
      params?: {
        vectors?: { size?: number } | Record<string, { size?: number }>;
      };
    };
  };

  const vectors =
    raw?.result?.config?.params?.vectors ?? raw?.config?.params?.vectors;
  if (!vectors) return null;
  if (typeof (vectors as { size?: number }).size === "number") {
    return (vectors as { size: number }).size;
  }
  const named = Object.values(vectors as Record<string, { size?: number }>);
  const first = named.find((v) => typeof v?.size === "number");
  return first?.size ?? null;
}

function readDistance(info: unknown): string | null {
  const raw = info as {
    result?: {
      config?: {
        params?: {
          vectors?:
            | { distance?: string }
            | Record<string, { distance?: string }>;
        };
      };
    };
    config?: {
      params?: {
        vectors?:
          | { distance?: string }
          | Record<string, { distance?: string }>;
      };
    };
  };

  const vectors =
    raw?.result?.config?.params?.vectors ?? raw?.config?.params?.vectors;
  if (!vectors) return null;
  if (typeof (vectors as { distance?: string }).distance === "string") {
    return (vectors as { distance: string }).distance;
  }
  const named = Object.values(
    vectors as Record<string, { distance?: string }>,
  );
  const first = named.find((v) => typeof v?.distance === "string");
  return first?.distance ?? null;
}

/**
 * Koleksiyon yoksa oluşturur; varsa yeniden oluşturmaz.
 * Yapılandırma uyuşmazsa açıklayıcı hata verir.
 */
export async function ensureCollection(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ collection: string; created: boolean }> {
  const { client, config } = getQdrantClient(env);
  const collection = config.collection || DEFAULT_QDRANT_COLLECTION;

  const existing = await client.getCollections();
  const names = (existing.collections || []).map((c) => c.name);
  const exists = names.includes(collection);

  if (!exists) {
    await client.createCollection(collection, {
      vectors: {
        size: EMBEDDING_VECTOR_SIZE,
        distance: "Cosine",
      },
    });
    await ensurePayloadIndexes(client, collection);
    return { collection, created: true };
  }

  const info = await client.getCollection(collection);
  const size = readVectorSize(info);
  const distance = readDistance(info);

  if (size !== null && size !== EMBEDDING_VECTOR_SIZE) {
    throw new Error(
      `Koleksiyon "${collection}" vektör boyutu ${size}, beklenen ${EMBEDDING_VECTOR_SIZE}. ` +
        `Mevcut koleksiyon silinmeden yeniden oluşturulmaz; yapılandırmayı düzeltin.`,
    );
  }

  if (distance && distance.toLowerCase() !== "cosine") {
    throw new Error(
      `Koleksiyon "${collection}" benzerlik metriği "${distance}", beklenen Cosine. ` +
        `Mevcut koleksiyon silinmeden yeniden oluşturulmaz.`,
    );
  }

  await ensurePayloadIndexes(client, collection);
  return { collection, created: false };
}

export async function getCollectionHealth(
  env: NodeJS.ProcessEnv = process.env,
): Promise<QdrantHealthStatus> {
  const collection =
    env.QDRANT_COLLECTION?.trim() || DEFAULT_QDRANT_COLLECTION;

  if (!isQdrantConfigured(env)) {
    return {
      ok: false,
      configured: false,
      collection,
      collectionReady: false,
      message:
        "Qdrant yapılandırılmamış. EVREN_QDRANT_* ortam değişkenlerini tanımlayın.",
    };
  }

  const connectivity = await checkQdrantHealth(env);
  if (!connectivity.ok) {
    return {
      ok: false,
      configured: true,
      collection,
      collectionReady: false,
      message: connectivity.message,
    };
  }

  try {
    await ensureCollection(env);
    return {
      ok: true,
      configured: true,
      collection,
      collectionReady: true,
      message: "Qdrant koleksiyonu hazır.",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Koleksiyon kontrolü başarısız.";
    return {
      ok: false,
      configured: true,
      collection,
      collectionReady: false,
      message: msg,
    };
  }
}

export function getActiveConfig(
  env: NodeJS.ProcessEnv = process.env,
): QdrantEnvConfig {
  return getQdrantClient(env).config;
}
