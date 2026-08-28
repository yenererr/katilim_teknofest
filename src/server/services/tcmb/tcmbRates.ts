/**
 * TCMB günlük döviz kurları — https://www.tcmb.gov.tr/kurlar/today.xml
 * Gram altın (XAU): Genel Para canlı listesi (TCMB today.xml’de yok).
 */

export type FxCode = "USD" | "EUR" | "GBP";
export type FxTickerCode = FxCode | "XAU";

export type FxRate = {
  code: FxTickerCode;
  name: string;
  unit: number;
  forexBuying: number;
  forexSelling: number;
  /** 1 birim için TL (alış-satış ortası). */
  mid: number;
  /** Satış kurunun önceki bültene göre mutlak farkı (yoksa null). */
  change: number | null;
};

export type TcmbFxSnapshot = {
  bulletinDate: string | null;
  bulletinDateIso: string | null;
  bulletinNo: string | null;
  fetchedAt: string;
  sourceUrl: string;
  updatedLabel: string;
  rates: Record<FxCode, FxRate>;
  /** Gram altın (TL); TCMB dışı kaynak. */
  metals: {
    XAU: FxRate & { sourceLabel: string; sourceUrl: string };
  } | null;
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
const GOLD_URL = "https://api.genelpara.com/json/?list=altin";
const CACHE_TTL_MS = 30 * 60 * 1000;
const TRACKED: FxCode[] = ["USD", "EUR", "GBP"];

const NAME_TR: Record<FxTickerCode, string> = {
  USD: "ABD Doları",
  EUR: "Euro",
  GBP: "İngiliz Sterlini",
  XAU: "Gram Altın",
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

function parseTrDate(trDate: string): Date | null {
  const m = trDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

function formatTrDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** TCMB arşiv yolu: 26.08.2026 → /kurlar/202608/26082026.xml */
export function tcmbArchivePath(trDate: string): string | null {
  const m = trDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`;
}

function extractCurrencyRates(
  xml: string,
  codes: FxCode[],
): Partial<Record<FxCode, { buy: number; sell: number }>> {
  const out: Partial<Record<FxCode, { buy: number; sell: number }>> = {};
  for (const code of codes) {
    const block = xml.match(
      new RegExp(
        `<Currency[^>]*CurrencyCode="${code}"[^>]*>([\\s\\S]*?)</Currency>`,
        "i",
      ),
    );
    if (!block) continue;
    const body = block[1];
    const unit = parseNumber(tagText(body, "Unit")) ?? 1;
    const forexBuying = parseNumber(tagText(body, "ForexBuying"));
    const forexSelling = parseNumber(tagText(body, "ForexSelling"));
    if (forexBuying == null || forexSelling == null) continue;
    out[code] = {
      buy: forexBuying / unit,
      sell: forexSelling / unit,
    };
  }
  return out;
}

export function parseTcmbTodayXml(
  xml: string,
  prevXml?: string | null,
): Omit<TcmbFxSnapshot, "metals" | "updatedLabel"> & {
  rates: Record<FxCode, FxRate>;
} {
  const bulletinDate = (() => {
    const m = xml.match(/Tarih_Date[^>]*\bTarih="([^"]+)"/);
    return m?.[1] ?? null;
  })();
  const bulletinNo = (() => {
    const m = xml.match(/Bulten_No="([^"]+)"/);
    return m?.[1] ?? null;
  })();

  const today = extractCurrencyRates(xml, TRACKED);
  const prev = prevXml ? extractCurrencyRates(prevXml, TRACKED) : {};

  const rates = {} as Record<FxCode, FxRate>;
  for (const code of TRACKED) {
    const cur = today[code];
    if (!cur) {
      throw new Error(`TCMB XML içinde ${code} bulunamadı.`);
    }
    const prevSell = prev[code]?.sell;
    rates[code] = {
      code,
      name: NAME_TR[code],
      unit: 1,
      forexBuying: cur.buy,
      forexSelling: cur.sell,
      mid: (cur.buy + cur.sell) / 2,
      change:
        prevSell != null && Number.isFinite(prevSell)
          ? Math.round((cur.sell - prevSell) * 10000) / 10000
          : null,
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

async function fetchText(url: string): Promise<string> {
  const ctrl = AbortSignal.timeout(12_000);
  const res = await fetch(url, {
    signal: ctrl,
    headers: {
      Accept: "application/xml,application/json,text/xml,*/*",
      "User-Agent":
        "Mozilla/5.0 (compatible; KatilimFinans/1.0; +https://localhost)",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${url}`);
  }
  return res.text();
}

async function fetchPreviousBulletinXml(
  bulletinDate: string | null,
): Promise<string | null> {
  if (!bulletinDate) return null;
  const base = parseTrDate(bulletinDate);
  if (!base) return null;
  for (let back = 1; back <= 5; back++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - back);
    const tr = formatTrDate(d);
    const path = tcmbArchivePath(tr);
    if (!path) continue;
    try {
      return await fetchText(`https://www.tcmb.gov.tr${path}`);
    } catch {
      /* hafta sonu / tatil */
    }
  }
  return null;
}

type GenelParaAltin = {
  success?: boolean;
  data?: Record<
    string,
    {
      alis?: string;
      satis?: string;
      degisim?: string;
    }
  >;
};

async function fetchGramAltin(): Promise<
  (FxRate & { sourceLabel: string; sourceUrl: string }) | null
> {
  try {
    const raw = await fetchText(GOLD_URL);
    const json = JSON.parse(raw) as GenelParaAltin;
    const ga = json.data?.GA;
    if (!ga) return null;
    const buy = parseNumber(ga.alis ?? null);
    const sell = parseNumber(ga.satis ?? null);
    if (buy == null || sell == null) return null;
    const change = parseNumber(ga.degisim ?? null);
    return {
      code: "XAU",
      name: NAME_TR.XAU,
      unit: 1,
      forexBuying: buy,
      forexSelling: sell,
      mid: (buy + sell) / 2,
      change,
      sourceLabel: "Genel Para",
      sourceUrl: "https://www.genelpara.com/",
    };
  } catch {
    return null;
  }
}

function formatUpdatedLabel(iso: string, bulletinDate: string | null): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) {
    return bulletinDate ? `${bulletinDate}` : "—";
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${mi}:${ss}`;
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
    const xml = await fetchText(SOURCE_URL);
    const preview = parseTcmbTodayXml(xml);
    const prevXml = await fetchPreviousBulletinXml(preview.bulletinDate);
    const base = parseTcmbTodayXml(xml, prevXml);
    const xau = await fetchGramAltin();
    const data: TcmbFxSnapshot = {
      ...base,
      updatedLabel: formatUpdatedLabel(base.fetchedAt, base.bulletinDate),
      metals: xau ? { XAU: xau } : null,
    };
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
  snapshot: Pick<TcmbFxSnapshot, "bulletinDate" | "sourceUrl" | "rates">,
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
