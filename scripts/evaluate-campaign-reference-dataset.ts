import fs from "fs";
import { ruleBasedExtractRecords } from "../src/server/services/scraper/evrenExtractor";
import type { ContentCategory, ExtractedFinancialRecord } from "../src/server/services/scraper/scraperTypes";

type ReferenceRow = {
  id: string;
  bank_slug: string;
  source_url: string;
  text: string;
  campaign_type: string;
  fields: string;
  absent_fields: string;
  hard_tags: string;
  needs_adjudication: string;
};

type FieldName =
  | "kampanya_suresi"
  | "vade_ay"
  | "kampanya_kosullari"
  | "finansman_tutari"
  | "taksit_sayisi"
  | "hedef_kitle"
  | "kar_payi_orani"
  | "masraf_durumu"
  | "alisveris_puani"
  | "odul_miktari"
  | "indirim_orani"
  | "tahsis_ucreti";

function parseCsv(text: string): ReferenceRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);

  const header = rows.shift();
  if (!header) return [];
  return rows.map((values) => {
    const out: Record<string, string> = {};
    header.forEach((key, i) => {
      out[key] = values[i] || "";
    });
    return out as ReferenceRow;
  });
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function categoryHint(row: ReferenceRow): ContentCategory {
  const type = row.campaign_type.toLocaleLowerCase("tr-TR");
  if (type.includes("konut")) return "housing_finance";
  if (type.includes("taşıt") || type.includes("tasit")) return "vehicle_finance";
  if (type.includes("ihtiyaç") || type.includes("ihtiyac")) return "consumer_finance";
  if (type.includes("kart") || type.includes("puan")) return "card_campaign";
  if (type.includes("yeni müşteri") || type.includes("yeni musteri")) {
    return "new_customer_financing";
  }
  if (type.includes("yatırım") || type.includes("yatirim")) return "investment_product";
  if (type.includes("finansman")) return "financing_campaign";
  return "general_announcement";
}

function recordHasField(records: ExtractedFinancialRecord[], field: FieldName): boolean {
  return records.some((r) => {
    if (field === "kampanya_suresi") return Boolean(r.campaignEnd);
    if (field === "vade_ay") return r.minTermMonths != null || r.maxTermMonths != null;
    if (field === "kampanya_kosullari") return r.conditions.length > 0;
    if (field === "finansman_tutari") return r.minAmountTl != null || r.maxAmountTl != null;
    if (field === "taksit_sayisi") return r.installmentCount != null;
    if (field === "hedef_kitle") return r.targetSegments.length > 0;
    if (field === "kar_payi_orani") return r.profitRate != null;
    if (field === "masraf_durumu") return r.allocationFeeType != null;
    if (field === "alisveris_puani") return r.rewardType === "puan";
    if (field === "odul_miktari") {
      return r.rewardAmountTl != null && r.rewardType != null && r.rewardType !== "puan";
    }
    if (field === "indirim_orani") return r.rewardType === "indirim";
    if (field === "tahsis_ucreti") return r.allocationFeeValue != null;
    return false;
  });
}

function main() {
  const csvPath = process.argv[2] || process.env.CAMPAIGN_REFERENCE_CSV;
  if (!csvPath) {
    throw new Error(
      "Kullanım: npm run eval:campaign-reference -- <Finansman_Kampanyalari_Referans_Veri_Seti.csv>",
    );
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const usable = rows.filter(
    (r) =>
      r.bank_slug &&
      r.source_url &&
      r.text &&
      r.needs_adjudication.toLocaleLowerCase("tr-TR") !== "true",
  );
  const fields: FieldName[] = [
    "kampanya_suresi",
    "vade_ay",
    "kampanya_kosullari",
    "finansman_tutari",
    "taksit_sayisi",
    "kar_payi_orani",
    "alisveris_puani",
    "odul_miktari",
    "tahsis_ucreti",
  ];
  const score = Object.fromEntries(
    fields.map((field) => [
      field,
      { expected: 0, hit: 0, absent: 0, falsePositive: 0 },
    ]),
  ) as Record<FieldName, { expected: number; hit: number; absent: number; falsePositive: number }>;
  const misses: string[] = [];
  const falsePositives: string[] = [];
  let produced = 0;
  let expiredProduced = 0;

  for (const row of usable) {
    const expected = parseJson<Record<string, unknown>>(row.fields, {});
    const absent = new Set(parseJson<string[]>(row.absent_fields, []));
    const records = ruleBasedExtractRecords({
      bankId: row.bank_slug,
      sourceUrl: row.source_url,
      text: row.text,
      categoryHint: categoryHint(row),
    });
    if (records.length > 0) produced++;
    if (records.some((r) => r.campaignStatus === "expired")) expiredProduced++;

    for (const field of fields) {
      const has = recordHasField(records, field);
      if (Object.prototype.hasOwnProperty.call(expected, field)) {
        score[field].expected++;
        if (has) score[field].hit++;
        else if (misses.length < 25) misses.push(`${field}: ${row.id || row.source_url}`);
      }
      if (absent.has(field)) {
        score[field].absent++;
        if (has) {
          score[field].falsePositive++;
          if (falsePositives.length < 25) {
            falsePositives.push(`${field}: ${row.id || row.source_url}`);
          }
        }
      }
    }
  }

  console.log(`CSV: ${csvPath}`);
  console.log(`Satır: ${rows.length}, kullanılabilir eval satırı: ${usable.length}`);
  console.log(`Kural katmanı kayıt üretti: ${produced}, expired işaretledi: ${expiredProduced}`);
  console.table(
    fields.map((field) => {
      const s = score[field];
      return {
        field,
        expected: s.expected,
        hit: s.hit,
        recall: s.expected ? `${Math.round((s.hit / s.expected) * 100)}%` : "-",
        absent: s.absent,
        falsePositive: s.falsePositive,
      };
    }),
  );
  if (misses.length) {
    console.log("\nİlk kaçan alanlar:");
    misses.forEach((m) => console.log(`- ${m}`));
  }
  if (falsePositives.length) {
    console.log("\nİlk yanlış pozitifler:");
    falsePositives.forEach((m) => console.log(`- ${m}`));
  }
}

main();
