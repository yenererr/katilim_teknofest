/**
 * TCMB günlük döviz kurları — https://www.tcmb.gov.tr/kurlar/today.xml
 * Önbellek: bülten günde bir kez güncellenir; gereksiz istekleri kesmek için TTL kullanılır.
 */

export type FxCode = "USD" | "EUR" | "GBP";

export type FxRate = {
  code: FxCode;
  name: string;
  unit: number;
  forexBuying: number;
  forexSelling: number;
  /** 1 birim döviz için TL (alış-satış ortası). */
  mid: number;
};

export type TcmbFxSnapshot = {
  bulletinDate: string | null;
  bulletinDateIso: string | null;
  bulletinNo: string | null;
  fetchedAt: string;
  sourceUrl: string;
  rates: Record<FxCode, FxRate>;
};

export type FxCurrency = "TRY" | FxCode;

export type FxConvertResult = {
  amount: number;
  from: FxCurrency;
  to: FxCurrency;
  result: number;
  rateUsed: number;
  rateLabel: string;
  bulletinDate: string | null;
  sourceUrl: string;
};

const SOURCE_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const CACHE_TTL_MS = 30 * 60 * 1000;
const TRACKED: FxCode[] = ["USD", "EUR", "GBP"];

const NAME_TR: Record<FxCode, string> = {
  USD: "ABD Doları",
  EUR: "Euro",
  GBP: "İngiliz Sterlini",
};

let cache: { at: number; data: TcmbFxSnapshot } | null = null;
let inflight: Promise<TcmbFxSnapshot> | null = null;

function tagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1].trim() : null;
}

function parseNumber(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "26.08.2026" → "2026-08-26" */
export function tcmbDateToIso(trDate: string | null): string | null {
  if (!trDate) return null;
  const m = trDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseTcmbTodayXml(xml: string): TcmbFxSnapshot {
  const bulletinDate = (() => {
    const m = xml.match(/Tarih_Date[^>]*\bTarih="([^"]+)"/);
    return m?.[1] ?? null;
  })();
  const bulletinNo = (() => {
    const m = xml.match(/Bulten_No="([^"]+)"/);
    return m?.[1] ?? null;
  })();

  const rates = {} as Record<FxCode, FxRate>;
  for (const code of TRACKED) {
    const block = xml.match(
      new RegExp(
        `<Currency[^>]*CurrencyCode="${code}"[^>]*>([\\s\\S]*?)</Currency>`,
        "i",
      ),
    );
    if (!block) {
      throw new Error(`TCMB XML içinde ${code} bulunamadı.`);
    }
    const body = block[1];
    const unit = parseNumber(tagText(body, "Unit")) ?? 1;
    const forexBuying = parseNumber(tagText(body, "ForexBuying"));
    const forexSelling = parseNumber(tagText(body, "ForexSelling"));
    if (forexBuying == null || forexSelling == null) {
      throw new Error(`TCMB ${code} alış/satış kuru okunamadı.`);
    }
    // Unit>1 olan para birimleri için birim başına TL
    const buy = forexBuying / unit;
    const sell = forexSelling / unit;
    rates[code] = {
      code,
      name: NAME_TR[code],
      unit: 1,
      forexBuying: buy,
      forexSelling: sell,
      mid: (buy + sell) / 2,
    };
  }

  return {
    bulletinDate,
    bulletinDateIso: tcmbDateToIso(bulletinDate),
    bulletinNo,
    fetchedAt: new Date().toISOString(),
    sourceUrl: SOURCE_URL,
    rates,
  };
}

export async function getTcmbFxRates(opts?: {
  force?: boolean;
}): Promise<TcmbFxSnapshot> {
  const now = Date.now();
  if (!opts?.force && cache && now - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }
  if (!opts?.force && inflight) return inflight;

  inflight = (async () => {
    const ctrl = AbortSignal.timeout(12_000);
    const res = await fetch(SOURCE_URL, {
      signal: ctrl,
      headers: {
        Accept: "application/xml,text/xml,*/*",
        "User-Agent":
          "Mozilla/5.0 (compatible; KatilimFinans/1.0; +https://localhost)",
      },
    });
    if (!res.ok) {
      throw new Error(`TCMB kurları alınamadı (HTTP ${res.status}).`);
    }
    const xml = await res.text();
    const data = parseTcmbTodayXml(xml);
    cache = { at: Date.now(), data };
    return data;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function convertWithTcmb(
  snapshot: TcmbFxSnapshot,
  amount: number,
  from: FxCurrency,
  to: FxCurrency,
): FxConvertResult {
  if (!(amount > 0) || !Number.isFinite(amount)) {
    throw new Error("Tutar pozitif bir sayı olmalıdır.");
  }
  if (from === to) {
    return {
      amount,
      from,
      to,
      result: amount,
      rateUsed: 1,
      rateLabel: "1:1",
      bulletinDate: snapshot.bulletinDate,
      sourceUrl: snapshot.sourceUrl,
    };
  }

  // TRY → FX: satış kuru (döviz almak)
  // FX → TRY: satış kuru (döviz almak için ödenen TL; “kaç TL eder” sorularında yaygın)
  // FX → FX: önce TRY'ye, sonra hedefe
  let result: number;
  let rateUsed: number;
  let rateLabel: string;

  if (from === "TRY" && to !== "TRY") {
    const r = snapshot.rates[to];
    rateUsed = r.forexSelling;
    result = amount / rateUsed;
    rateLabel = `TCMB ${to} satış ${rateUsed.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}`;
  } else if (to === "TRY" && from !== "TRY") {
    const r = snapshot.rates[from];
    rateUsed = r.forexSelling;
    result = amount * rateUsed;
    rateLabel = `TCMB ${from} satış ${rateUsed.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}`;
  } else {
    // cross via TRY
    const fromR = snapshot.rates[from as FxCode];
    const toR = snapshot.rates[to as FxCode];
    const tryAmount = amount * fromR.forexSelling;
    result = tryAmount / toR.forexSelling;
    rateUsed = fromR.forexSelling / toR.forexSelling;
    rateLabel = `Çapraz ${from}/${to} (TCMB satış üzerinden)`;
  }

  return {
    amount,
    from,
    to,
    result,
    rateUsed,
    rateLabel,
    bulletinDate: snapshot.bulletinDate,
    sourceUrl: snapshot.sourceUrl,
  };
}

/** Testlerde önbelleği sıfırlamak için. */
export function __resetTcmbFxCacheForTests(): void {
  cache = null;
  inflight = null;
}
