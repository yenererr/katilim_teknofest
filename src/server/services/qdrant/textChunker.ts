import crypto from "crypto";
import type { TextChunk } from "../qdrant/qdrantTypes";

/** Yaklaşık token → karakter (Türkçe için kaba tahmin) */
const CHARS_PER_TOKEN = 4;
const MIN_CHUNK_TOKENS = 500;
const MAX_CHUNK_TOKENS = 800;
const OVERLAP_RATIO = 0.12;

const NOISE_PATTERNS = [
  /^cookie/i,
  /çerez/i,
  /kvkk/i,
  /gizlilik politikası/i,
  /tüm hakları saklıdır/i,
  /all rights reserved/i,
  /javascript.?disabled/i,
  /menü|menu|footer|navbar|header/i,
  /^(ana sayfa|anasayfa|iletişim|hakkımızda)$/i,
];

const MIN_CHUNK_CHARS = 80;

export function normalizeForHash(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

export function hashText(text: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeForHash(text))
    .digest("hex");
}

function isNoise(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHUNK_CHARS) return true;
  const lines = trimmed.split(/\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 2 && NOISE_PATTERNS.some((p) => p.test(trimmed))) {
    return true;
  }
  const lower = trimmed.toLocaleLowerCase("tr-TR");
  if (
    /cookie|çerez tercihi|izin ver|reddet|kabul et/.test(lower) &&
    trimmed.length < 400
  ) {
    return true;
  }
  return false;
}

function splitIntoSentences(text: string): string[] {
  const parts = text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?…])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()].filter(Boolean);
}

/**
 * Metni ~500–800 token'lık parçalara ayırır; cümle sınırlarını korur,
 * parçalar arasında ~%12 örtüşme kullanır. Gürültü ve duplicate'leri eker.
 */
export function chunkText(
  text: string,
  options?: { minTokens?: number; maxTokens?: number; overlapRatio?: number },
): TextChunk[] {
  const minChars =
    (options?.minTokens ?? MIN_CHUNK_TOKENS) * CHARS_PER_TOKEN;
  const maxChars =
    (options?.maxTokens ?? MAX_CHUNK_TOKENS) * CHARS_PER_TOKEN;
  const overlapRatio = options?.overlapRatio ?? OVERLAP_RATIO;

  const cleaned = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || isNoise(cleaned)) return [];

  const sentences = splitIntoSentences(cleaned);
  const chunks: TextChunk[] = [];
  const seenHashes = new Set<string>();

  let buffer = "";
  let chunkIndex = 0;

  const flush = (force = false) => {
    const candidate = buffer.trim();
    if (!candidate) return;
    if (!force && candidate.length < minChars * 0.5 && chunks.length === 0) {
      return;
    }
    if (isNoise(candidate)) {
      buffer = "";
      return;
    }
    const contentHash = hashText(candidate);
    if (seenHashes.has(contentHash)) {
      buffer = "";
      return;
    }
    seenHashes.add(contentHash);
    chunks.push({ text: candidate, chunkIndex, contentHash });
    chunkIndex += 1;

    const overlapChars = Math.floor(candidate.length * overlapRatio);
    buffer =
      overlapChars > 0 ? candidate.slice(-overlapChars).trimStart() : "";
  };

  for (const sentence of sentences) {
    const next = buffer ? `${buffer} ${sentence}` : sentence;
    if (next.length > maxChars && buffer.length >= minChars) {
      flush(true);
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
      if (buffer.length > maxChars) {
        // Cümle tek başına çok uzunsa karakter sınırında böl
        while (buffer.length > maxChars) {
          const slice = buffer.slice(0, maxChars);
          const lastSpace = slice.lastIndexOf(" ");
          const cut = lastSpace > maxChars * 0.5 ? lastSpace : maxChars;
          const piece = buffer.slice(0, cut).trim();
          buffer = buffer.slice(cut).trim();
          const saved = buffer;
          buffer = piece;
          flush(true);
          buffer = saved;
        }
      }
    } else {
      buffer = next;
    }
  }

  if (buffer.trim()) flush(true);

  // Tek kısa parça kaldıysa yine de kaydet (ürün adı vb.)
  if (chunks.length === 0 && cleaned.length >= MIN_CHUNK_CHARS && !isNoise(cleaned)) {
    chunks.push({
      text: cleaned.slice(0, maxChars),
      chunkIndex: 0,
      contentHash: hashText(cleaned),
    });
  }

  return chunks;
}
