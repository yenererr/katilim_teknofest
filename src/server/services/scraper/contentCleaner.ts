import * as cheerio from "cheerio";
import crypto from "crypto";
import type { CleanDocument } from "./scraperTypes";

const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "footer",
  "header",
  "[role='navigation']",
  ".cookie",
  "#cookie",
  ".kvkk",
  ".footer",
  ".menu",
  ".navbar",
  ".breadcrumb",
];

/**
 * Menü/footer/cookie/KVKK temizliği + Türkçe koruyan normalize.
 */
export function cleanHtmlToDocument(html: string, titleHint?: string): CleanDocument {
  const $ = cheerio.load(html);
  for (const sel of NOISE_SELECTORS) {
    $(sel).remove();
  }

  // Gizli / aria-hidden
  $("[hidden], [aria-hidden='true']").remove();

  const title =
    titleHint ||
    $("h1").first().text().trim() ||
    $("title").first().text().trim() ||
    null;

  const main =
    $("main").text() ||
    $("article").text() ||
    $("[role='main']").text() ||
    $("body").text();

  const text = normalizeTurkishText(main);
  return {
    title,
    text,
    rawHtmlLength: html.length,
    cleanedLength: text.length,
  };
}

export function normalizeTurkishText(input: string): string {
  return input
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hashContent(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, baseUrl).toString();
      out.push(abs.split("#")[0]);
    } catch {
      /* ignore */
    }
  });
  return [...new Set(out)];
}
