/**
 * İnsan doğrulamalı referans (gold) veri seti yükleyicisi.
 *
 * Veri seti `Finansman_Kampanyalari_Referans_Veri_Seti.csv` dosyasındadır:
 * 11 katılım bankasının resmî sayfalarından toplanmış kampanya metinleri,
 * her metin için elle etiketlenmiş alan değerleri, alanın metindeki kanıt
 * ifadesi (span) ve "bu alan metinde yok" bilgisi.
 *
 * "Absent" listesi ölçüm açısından kritik: bir alanın kaynakta bulunmadığı
 * da etiketlidir, bu yüzden modelin susması ödüllendirilebilir ve uydurma
 * cezalandırılabilir. Yalnızca doğru cevapları saymak bunu ölçemezdi.
 */

import fs from "fs";
import path from "path";

export type GoldAralik = { min?: number | null; max?: number | null };

export type GoldKayit = {
  id: string;
  bankSlug: string;
  sourceUrl: string;
  text: string;
  /** Şartname 5.4 kampanya türü — Türkçe etiket */
  campaignType: string | null;
  /** Alan adı → etiketlenmiş değer (biçim alana göre değişir) */
  fields: Record<string, unknown>;
  /** Alan adı → değerin dayandığı metin parçası */
  fieldSpans: Record<string, string>;
  /** Bu metinde bulunmadığı doğrulanmış alanlar */
  absentFields: string[];
  /** Zorluk etiketleri: format_varyant, kosullu_aralik, terminoloji … */
  hardTags: string[];
  annotators: string[];
  adjudicated: boolean;
  hard: boolean;
  setGroup: string;
};

/**
 * RFC 4180 uyumlu asgari CSV çözücü.
 *
 * Harici bağımlılık eklenmedi: veri setindeki metin alanları satır sonu ve
 * çift tırnak içeriyor, bu yüzden satır satır bölmek yanlış olur; gereken
 * davranış küçük olduğu için burada yazılı.
 */
export function parseCsv(içerik: string): string[][] {
  const satirlar: string[][] = [];
  let alanlar: string[] = [];
  let alan = "";
  let tirnakIcinde = false;

  // BOM, Excel'in eklediği ilk sütun adını bozar.
  const metin = içerik.replace(/^﻿/, "");

  for (let i = 0; i < metin.length; i += 1) {
    const c = metin[i];

    if (tirnakIcinde) {
      if (c === '"') {
        if (metin[i + 1] === '"') {
          alan += '"';
          i += 1;
        } else {
          tirnakIcinde = false;
        }
      } else {
        alan += c;
      }
      continue;
    }

    if (c === '"') {
      tirnakIcinde = true;
    } else if (c === ",") {
      alanlar.push(alan);
      alan = "";
    } else if (c === "\n") {
      alanlar.push(alan);
      satirlar.push(alanlar);
      alanlar = [];
      alan = "";
    } else if (c !== "\r") {
      alan += c;
    }
  }

  if (alan.length > 0 || alanlar.length > 0) {
    alanlar.push(alan);
    satirlar.push(alanlar);
  }
  return satirlar;
}

function jsonCoz<T>(ham: string, varsayilan: T): T {
  if (!ham || !ham.trim()) return varsayilan;
  try {
    return JSON.parse(ham) as T;
  } catch {
    return varsayilan;
  }
}

export const GOLD_CSV_PATH = path.resolve(
  process.cwd(),
  "Finansman_Kampanyalari_Referans_Veri_Seti.csv",
);

/** Veri setini okur. Kimliği veya metni boş olan taslak satırlar atlanır. */
export function loadGoldDataset(csvPath: string = GOLD_CSV_PATH): GoldKayit[] {
  const satirlar = parseCsv(fs.readFileSync(csvPath, "utf8"));
  if (satirlar.length === 0) return [];

  const basliklar = satirlar[0];
  const idx = (ad: string) => basliklar.indexOf(ad);
  const al = (satir: string[], ad: string) => satir[idx(ad)] ?? "";

  const kayitlar: GoldKayit[] = [];
  for (const satir of satirlar.slice(1)) {
    const id = al(satir, "id").trim();
    const text = al(satir, "text");
    if (!id || !text.trim()) continue;

    kayitlar.push({
      id,
      bankSlug: al(satir, "bank_slug"),
      sourceUrl: al(satir, "source_url"),
      text,
      campaignType: al(satir, "campaign_type").trim() || null,
      fields: jsonCoz<Record<string, unknown>>(al(satir, "fields"), {}),
      fieldSpans: jsonCoz<Record<string, string>>(al(satir, "field_spans"), {}),
      absentFields: jsonCoz<string[]>(al(satir, "absent_fields"), []),
      hardTags: jsonCoz<string[]>(al(satir, "hard_tags"), []),
      annotators: jsonCoz<string[]>(al(satir, "annotators"), []),
      adjudicated: al(satir, "adjudicated").toLowerCase() === "true",
      hard: al(satir, "hard").toLowerCase() === "true",
      setGroup: al(satir, "set_group"),
    });
  }
  return kayitlar;
}
