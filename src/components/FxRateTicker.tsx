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

/** Ana sayfa — TCMB döviz + gram altın yatay kur şeridi. */
export const FxRateTicker: React.FC = () => {
  const [snapshot, setSnapshot] = useState<FxSnapshot | null>(null);

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

  if (chips.length === 0) return null;

  const updated =
    snapshot?.updatedLabel ||
    snapshot?.bulletinDate ||
    "—";

  return (
    <section
      aria-label="Güncel döviz ve altın kurları"
      className="overflow-hidden rounded-xl border border-line bg-[#F7F9FC] shadow-flat dark:bg-surface"
    >
      <div className="flex flex-col gap-3 border-t-2 border-[#1e3a5f] px-3 py-2.5 sm:flex-row sm:items-center sm:gap-0 sm:px-4 sm:py-0">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <ul className="flex min-w-max items-stretch divide-x divide-line">
            {chips.map((c) => {
              const up = c.change != null && c.change > 0;
              const down = c.change != null && c.change < 0;
              return (
                <li
                  key={c.code}
                  className="flex items-center gap-2.5 px-3 py-2.5 first:pl-0 last:pr-0 sm:gap-3 sm:px-4"
                >
                  <CurrencyGlyph code={c.code} />
                  <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold tracking-wide text-[#1e3a5f] dark:text-txt">
                        {c.code}
                      </span>
                      {c.change != null ? (
                        <span
                          className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
                            up
                              ? "text-emerald-600 dark:text-emerald-400"
                              : down
                                ? "text-red-600 dark:text-red-400"
                                : "text-txt-muted"
                          }`}
                        >
                          <span aria-hidden>
                            {up ? "▲" : down ? "▼" : "•"}
                          </span>
                          {fmtChange(c.change)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-txt-secondary sm:text-[0.8125rem]">
                      <span>
                        Alış{" "}
                        <span className="tnum font-semibold text-[#1e3a5f] dark:text-txt">
                          {c.buy}
                        </span>
                      </span>
                      <span>
                        Satış{" "}
                        <span className="tnum font-semibold text-[#1e3a5f] dark:text-txt">
                          {c.sell}
                        </span>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
          <p className="text-[0.6875rem] text-txt-secondary sm:text-xs">
            Son Güncelleme :{" "}
            <span className="font-medium text-[#1e3a5f] dark:text-txt">
              {updated}
            </span>
          </p>
          <a
            href="#kurlar"
            className="inline-flex items-center gap-0.5 text-xs font-bold text-[#1e3a5f] transition-colors hover:text-brand-700 dark:text-brand-300"
          >
            Tüm Kurları Gör
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
};
