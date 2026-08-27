import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

type FxTickerCode = "USD" | "EUR" | "GBP" | "XAU";

type FxRate = {
  code: FxTickerCode;
  name: string;
  forexBuying: number;
  forexSelling: number;
  change: number | null;
};

type FxSnapshot = {
  bulletinDate: string | null;
  fetchedAt: string;
  updatedLabel?: string;
  sourceUrl: string;
  rates: Record<"USD" | "EUR" | "GBP", FxRate>;
  metals: {
    XAU: FxRate & { sourceLabel?: string; sourceUrl?: string };
  } | null;
};

type Chip = {
  code: FxTickerCode;
  buy: string;
  sell: string;
  change: number | null;
};

const ORDER: FxTickerCode[] = ["USD", "EUR", "GBP", "XAU"];
const SLIDE_MS = 3200;

function fmtRate(n: number, code: FxTickerCode): string {
  const digits = code === "XAU" ? 2 : 4;
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtChange(n: number): string {
  const abs = Math.abs(n).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return n > 0 ? `+${abs}` : n < 0 ? `-${abs}` : abs;
}

function CurrencyGlyph({ code }: { code: FxTickerCode }) {
  if (code === "XAU") {
    return (
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-50 ring-1 ring-amber-200/80 dark:bg-amber-950/40 dark:ring-amber-800/50"
        aria-hidden
      >
        <svg viewBox="0 0 32 32" className="h-5 w-5">
          <rect x="6" y="18" width="20" height="6" rx="1" fill="#D4A017" />
          <rect x="8" y="12" width="16" height="5" rx="1" fill="#F0C14A" />
          <rect x="10" y="7" width="12" height="4" rx="1" fill="#E8B923" />
        </svg>
      </span>
    );
  }

  const glyph =
    code === "USD" ? "$" : code === "EUR" ? "€" : code === "GBP" ? "£" : "?";
  const tone =
    code === "USD"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50"
      : code === "EUR"
        ? "bg-sky-50 text-sky-700 ring-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/50"
        : "bg-indigo-50 text-indigo-700 ring-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800/50";

  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ring-1 ${tone}`}
      aria-hidden
    >
      {glyph}
    </span>
  );
}

function RateSlide({ chip }: { chip: Chip }) {
  const up = chip.change != null && chip.change > 0;
  const down = chip.change != null && chip.change < 0;
  return (
    <div className="flex items-center justify-center gap-3 px-4 py-2.5 sm:gap-4">
      <CurrencyGlyph code={chip.code} />
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold tracking-wide text-[#1e3a5f] dark:text-txt">
            {chip.code}
          </span>
          {chip.change != null ? (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                up
                  ? "text-emerald-600 dark:text-emerald-400"
                  : down
                    ? "text-red-600 dark:text-red-400"
                    : "text-txt-muted"
              }`}
            >
              <span aria-hidden>{up ? "▲" : down ? "▼" : "•"}</span>
              {fmtChange(chip.change)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-xs text-txt-secondary sm:text-[0.8125rem]">
          <span>
            Alış{" "}
            <span className="tnum font-semibold text-[#1e3a5f] dark:text-txt">
              {chip.buy}
            </span>
          </span>
          <span>
            Satış{" "}
            <span className="tnum font-semibold text-[#1e3a5f] dark:text-txt">
              {chip.sell}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Ana sayfa — TCMB döviz + gram altın; yalnızca otomatik kayan slide. */
export const FxRateTicker: React.FC = () => {
  const [snapshot, setSnapshot] = useState<FxSnapshot | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let iptal = false;
    const yukle = () => {
      fetch("/api/live/fx")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: FxSnapshot) => {
          if (!iptal) setSnapshot(d);
        })
        .catch(() => {
          /* sessiz */
        });
    };
    yukle();
    const id = window.setInterval(yukle, 30 * 60 * 1000);
    return () => {
      iptal = true;
      window.clearInterval(id);
    };
  }, []);

  const chips = useMemo((): Chip[] => {
    if (!snapshot) return [];
    const list: Chip[] = [];
    for (const code of ORDER) {
      const r =
        code === "XAU" ? snapshot.metals?.XAU : snapshot.rates[code];
      if (!r) continue;
      list.push({
        code,
        buy: fmtRate(r.forexBuying, code),
        sell: fmtRate(r.forexSelling, code),
        change: r.change,
      });
    }
    return list;
  }, [snapshot]);

  useEffect(() => {
    if (chips.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % chips.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [chips.length]);

  useEffect(() => {
    if (index >= chips.length && chips.length > 0) setIndex(0);
  }, [chips.length, index]);

  if (chips.length === 0) return null;

  const updated =
    snapshot?.updatedLabel || snapshot?.bulletinDate || "—";
  const aktif = chips[index] ?? chips[0];
  const n = chips.length;

  return (
    <section
      aria-label="Güncel döviz ve altın kurları"
      aria-roledescription="carousel"
      className="overflow-hidden rounded-xl border border-line bg-[#F7F9FC] shadow-flat dark:bg-surface"
    >
      <div className="flex items-stretch border-t-2 border-[#1e3a5f]">
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{
              width: `${n * 100}%`,
              transform: `translateX(-${(index * 100) / n}%)`,
            }}
          >
            {chips.map((c) => (
              <div
                key={c.code}
                className="shrink-0"
                style={{ width: `${100 / n}%` }}
                aria-hidden={c.code !== aktif.code}
              >
                <RateSlide chip={c} />
              </div>
            ))}
          </div>
        </div>

        <div className="hidden shrink-0 flex-col items-end justify-center gap-0.5 border-l border-line px-3 py-2 sm:flex">
          <p className="text-[0.5625rem] leading-tight text-txt-muted">
            Son Güncelleme
          </p>
          <p className="text-[0.625rem] leading-tight font-medium text-[#1e3a5f] dark:text-txt">
            {updated}
          </p>
          <a
            href="#kurlar"
            className="mt-0.5 inline-flex items-center gap-0.5 text-[0.6875rem] font-bold text-[#1e3a5f] transition-colors hover:text-brand-700 dark:text-brand-300"
          >
            Tüm Kurları Gör
            <ChevronRight className="h-3 w-3" aria-hidden />
          </a>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5 sm:justify-center">
        <div className="flex min-w-0 flex-col sm:hidden">
          <span className="text-[0.5625rem] text-txt-muted">Son Güncelleme</span>
          <span className="truncate text-[0.625rem] font-medium text-[#1e3a5f] dark:text-txt">
            {updated}
          </span>
        </div>
        <div className="flex items-center gap-1.5" aria-hidden>
          {chips.map((c, i) => (
            <span
              key={c.code}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-4 bg-[#1e3a5f]" : "w-1.5 bg-line-strong"
              }`}
            />
          ))}
        </div>
        <a
          href="#kurlar"
          className="inline-flex items-center gap-0.5 text-[0.6875rem] font-bold text-[#1e3a5f] sm:hidden dark:text-brand-300"
        >
          Tümü
          <ChevronRight className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </section>
  );
};
