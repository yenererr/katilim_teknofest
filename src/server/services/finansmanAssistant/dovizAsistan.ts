/**
 * Asistan için TCMB döviz kuru / çeviri niyeti.
 */

import { asciiKatla } from "../../../nlp/normalize";
import {
  convertWithTcmb,
  getTcmbFxRates,
  type FxCode,
  type FxCurrency,
} from "../tcmb/tcmbRates";

const FX_CODES: FxCode[] = ["USD", "EUR", "GBP"];

function paraBirimiBul(t: string): FxCurrency | null {
  if (/\b(tl|try|turk\s*lirasi|turk\s*lira)\b/.test(t) || /\blira\b/.test(t)) {
    return "TRY";
  }
  if (/\b(usd|dolar|dollar|\$)\b/.test(t)) return "USD";
  if (/\b(eur|euro|avro|€)\b/.test(t)) return "EUR";
  if (/\b(gbp|sterlin|pound|£)\b/.test(t)) return "GBP";
  return null;
}

/** "100.000" / "100000" / "2,5" / "2.5 milyon" */
function tutarBul(mesaj: string): number | null {
  const t = asciiKatla(mesaj);
  const milyon = t.match(
    /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(milyon|mn)\b/,
  );
  if (milyon) {
    const n = Number(milyon[1].replace(/\./g, "").replace(",", ".").replace(/\s/g, ""));
    if (Number.isFinite(n) && n > 0) return n * 1_000_000;
  }
  const bin = t.match(
    /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(bin)\b/,
  );
  if (bin) {
    const n = Number(bin[1].replace(/\./g, "").replace(",", ".").replace(/\s/g, ""));
    if (Number.isFinite(n) && n > 0) return n * 1_000;
  }
  // 100.000 veya 100000 veya 2.5
  const m = mesaj.match(
    /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/,
  );
  if (!m) return null;
  let raw = m[1];
  if (/\.\d{3}/.test(raw) && !/,\d+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  } else {
    raw = raw.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function yonBul(t: string): { from: FxCurrency; to: FxCurrency } | null {
  // "X TL kaç dolar", "X dolar kaç TL", "X TL'yi euroya çevir"
  const kac = t.match(
    /(\d[\d.\s,]*)\s*(tl|try|lira|usd|dolar|dollar|eur|euro|avro|gbp|sterlin|pound)?\s*(?:yi|yı|yu|yü|ye|ya|ni|nı|nu|nü)?\s*(?:kac|ne\s*kadar)?\s*(tl|try|lira|usd|dolar|dollar|eur|euro|avro|gbp|sterlin|pound)/,
  );
  if (kac) {
    const fromHint = kac[2] ? paraBirimiBul(kac[2]) : null;
    const to = paraBirimiBul(kac[3]);
    if (to) {
      const from = fromHint || (to === "TRY" ? null : "TRY");
      // "kaç dolar" without from currency → assume TRY
      if (from && from !== to) return { from, to };
      if (!fromHint && to !== "TRY") return { from: "TRY", to };
      if (fromHint && to) return { from: fromHint, to };
    }
  }

  const cevir = t.match(
    /(tl|try|lira|usd|dolar|eur|euro|avro|gbp|sterlin).{0,24}(cevir|donustur|cevirir\s*misin).{0,16}(tl|try|lira|usd|dolar|eur|euro|avro|gbp|sterlin)/,
  );
  if (cevir) {
    const from = paraBirimiBul(cevir[1]);
    const to = paraBirimiBul(cevir[3]);
    if (from && to && from !== to) return { from, to };
  }

  // Sadece kur sorusu: "dolar kuru", "euro kaç TL"
  return null;
}

export function isDovizMesaji(mesaj: string): boolean {
  const t = asciiKatla(mesaj);
  if (
    /(doviz|kur\b|exchange|tcmb|merkez\s*bank).{0,20}(kur|kac|ne|goster|guncel)/.test(
      t,
    ) ||
    /(kur|doviz).{0,12}(ne\s*kadar|kac|nedir|guncel)/.test(t)
  ) {
    return true;
  }
  if (
    /\b(dolar|euro|avro|sterlin|usd|eur|gbp)\b/.test(t) &&
    /(kac|cevir|donustur|kur|tl\b|try\b|lira)/.test(t)
  ) {
    return true;
  }
  if (
    /\b(tl|try|lira)\b/.test(t) &&
    /(dolar|euro|avro|sterlin|usd|eur|gbp)/.test(t) &&
    /(kac|cevir|donustur|et\b|eder)/.test(t)
  ) {
    return true;
  }
  return false;
}

function fmtTl(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtFx(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function birimEtiket(c: FxCurrency): string {
  if (c === "TRY") return "TL";
  if (c === "USD") return "USD";
  if (c === "EUR") return "EUR";
  return "GBP";
}

export async function dovizAsistanYaniti(mesaj: string): Promise<{
  message: string;
  citations: Array<{
    id: number;
    bankName: string;
    sourceUrl: string;
    sourceCheckedAt: string | null;
    evidenceText: string;
  }>;
}> {
  const snapshot = await getTcmbFxRates();
  const t = asciiKatla(mesaj);
  const amount = tutarBul(mesaj);
  const yon = yonBul(t);

  const citation = {
    id: 1,
    bankName: "TCMB",
    sourceUrl: snapshot.sourceUrl,
    sourceCheckedAt: snapshot.fetchedAt,
    evidenceText: `TCMB döviz bülteni ${snapshot.bulletinDate || ""}`.trim(),
  };

  const kurOzeti = FX_CODES.map((code) => {
    const r = snapshot.rates[code];
    return (
      `• **${r.name} (${code})** — alış ${fmtTl(r.forexBuying)} / ` +
      `satış ${fmtTl(r.forexSelling)} TL`
    );
  }).join("\n");

  const dipnot =
    `\n\nKaynak: TCMB günlük döviz kurları` +
    (snapshot.bulletinDate ? ` (bülten: ${snapshot.bulletinDate})` : "") +
    `. Çeviriler satış kuruyla hesaplanır; banka gişe/efektif kurları farklı olabilir.`;

  // Sadece kur sorusu
  if (!amount || !yon) {
    // "dolar kaç TL" without amount → show 1 unit
    const tek = paraBirimiBul(t);
    if (
      tek &&
      tek !== "TRY" &&
      /(kac|ne\s*kadar|kur|tl\b|lira)/.test(t) &&
      !amount
    ) {
      const r = snapshot.rates[tek];
      return {
        message:
          `TCMB'ye göre 1 ${birimEtiket(tek)} ≈ **${fmtTl(r.forexSelling)} TL** (satış).\n\n` +
          `Güncel kurlar:\n${kurOzeti}` +
          dipnot,
        citations: [citation],
      };
    }

    return {
      message:
        `TCMB güncel döviz kurları:\n\n${kurOzeti}\n\n` +
        `Örnek: “100.000 TL kaç dolar?” veya “2.000 euro kaç TL?”` +
        dipnot,
      citations: [citation],
    };
  }

  const converted = convertWithTcmb(snapshot, amount, yon.from, yon.to);
  const fromLabel = birimEtiket(yon.from);
  const toLabel = birimEtiket(yon.to);
  const sonuc =
    yon.to === "TRY" ? fmtTl(converted.result) : fmtFx(converted.result);
  const tutarGoster =
    yon.from === "TRY"
      ? fmtTl(amount)
      : amount.toLocaleString("tr-TR", { maximumFractionDigits: 4 });

  return {
    message:
      `**${tutarGoster} ${fromLabel}** ≈ **${sonuc} ${toLabel}**\n\n` +
      `(${converted.rateLabel})\n\n` +
      `Güncel kurlar:\n${kurOzeti}` +
      dipnot,
    citations: [citation],
  };
}
