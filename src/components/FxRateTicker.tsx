import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type FxCode = "USD" | "EUR" | "GBP";

type FxRate = {
  code: FxCode;
  name: string;
  forexBuying: number;
  forexSelling: number;
};

type FxSnapshot = {
  bulletinDate: string | null;
  sourceUrl: string;
  rates: Record<FxCode, FxRate>;
};

const CODES: FxCode[] = ["USD", "EUR", "GBP"];
const SLIDE_MS = 3500;

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

type Chip = {
  key: FxCode;
  code: string;
  name: string;
  buy: string;
  sell: string;
};

function buildChips(snapshot: FxSnapshot): Chip[] {
  return CODES.map((code) => {
    const r = snapshot.rates[code];
    return {
      key: code,
      code,
      name: r.name,
      buy: fmt(r.forexBuying),
      sell: fmt(r.forexSelling),
    };
  });
}

/** Ana sayfa — TCMB kurlarını sırayla kaydıran slide. */
export const FxRateTicker: React.FC = () => {
  const [chips, setChips] = useState<Chip[]>([]);
  const [bulletinDate, setBulletinDate] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState(
    "https://www.tcmb.gov.tr/kurlar/today.xml",
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let iptal = false;
    const yukle = () => {
      fetch("/api/live/fx")
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: FxSnapshot) => {
          if (iptal) return;
          setChips(buildChips(d));
          setBulletinDate(d.bulletinDate);
          if (d.sourceUrl) setSourceUrl(d.sourceUrl);
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

  useEffect(() => {
    if (chips.length < 2 || paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % chips.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [chips.length, paused]);

  if (chips.length === 0) return null;

  const aktif = chips[index] ?? chips[0];

  const onceki = () =>
    setIndex((i) => (i - 1 + chips.length) % chips.length);
  const sonraki = () => setIndex((i) => (i + 1) % chips.length);

  return (
    <section
      aria-label="TCMB döviz kurları"
      aria-roledescription="carousel"
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-flat"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="flex items-stretch">
        <div className="flex shrink-0 flex-col justify-center gap-0.5 border-r border-line bg-brand-50 px-3 py-2 dark:bg-brand-950/50">
          <span className="text-[0.6875rem] font-semibold tracking-wide text-brand-800 uppercase dark:text-brand-300">
            TCMB
          </span>
          {bulletinDate ? (
            <span className="text-[0.625rem] text-txt-muted">{bulletinDate}</span>
          ) : null}
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{
              width: `${chips.length * 100}%`,
              transform: `translateX(-${(index * 100) / chips.length}%)`,
            }}
          >
            {chips.map((c) => (
              <div
                key={c.key}
                className="flex shrink-0 items-center justify-center gap-3 px-4 py-3 sm:gap-5"
                style={{ width: `${100 / chips.length}%` }}
                aria-hidden={c.key !== aktif.key}
              >
                <span className="text-sm font-semibold text-txt">{c.code}</span>
                <span className="hidden text-xs text-txt-muted sm:inline">
                  {c.name}
                </span>
                <span className="tnum font-mono text-xs text-txt-secondary sm:text-sm">
                  Alış{" "}
                  <span className="font-medium text-txt">{c.buy}</span>
                </span>
                <span className="tnum font-mono text-xs text-txt-secondary sm:text-sm">
                  Satış{" "}
                  <span className="font-medium text-txt">{c.sell}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 border-l border-line px-1.5">
          <button
            type="button"
            onClick={onceki}
            aria-label="Önceki kur"
            className="grid h-9 w-8 place-items-center rounded-lg text-txt-muted transition-colors hover:bg-sunken hover:text-txt"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={sonraki}
            aria-label="Sonraki kur"
            className="grid h-9 w-8 place-items-center rounded-lg text-txt-muted transition-colors hover:bg-sunken hover:text-txt"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-0.5 px-2 text-[0.6875rem] font-medium text-brand-700 transition-colors hover:underline dark:text-brand-400"
          >
            Kaynak
          </a>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 border-t border-line py-1.5">
        {chips.map((c, i) => (
          <button
            key={c.key}
            type="button"
            aria-label={`${c.code} kurunu göster`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index
                ? "w-4 bg-brand-500"
                : "w-1.5 bg-line-strong hover:bg-txt-muted"
            }`}
          />
        ))}
      </div>
    </section>
  );
};
