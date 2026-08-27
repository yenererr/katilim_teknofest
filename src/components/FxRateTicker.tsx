import React, { useEffect, useState } from "react";

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

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

type Chip = {
  key: string;
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

/** Ana sayfa — TCMB kurlarının sürekli kayan şeridi. */
export const FxRateTicker: React.FC = () => {
  const [chips, setChips] = useState<Chip[]>([]);
  const [bulletinDate, setBulletinDate] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState(
    "https://www.tcmb.gov.tr/kurlar/today.xml",
  );

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
          /* sessiz — şerit boş kalır */
        });
    };
    yukle();
    const id = window.setInterval(yukle, 30 * 60 * 1000);
    return () => {
      iptal = true;
      window.clearInterval(id);
    };
  }, []);

  if (chips.length === 0) return null;

  // Kesintisiz döngü için iki kez tekrarlanır.
  const track = [...chips, ...chips, ...chips, ...chips];

  return (
    <section
      aria-label="TCMB döviz kurları"
      className="fx-ticker overflow-hidden rounded-xl border border-line bg-surface shadow-flat"
    >
      <div className="flex items-stretch">
        <div className="flex shrink-0 items-center gap-2 border-r border-line bg-brand-50 px-3 py-2.5 dark:bg-brand-950/50">
          <span className="text-[0.6875rem] font-semibold tracking-wide text-brand-800 uppercase dark:text-brand-300">
            TCMB
          </span>
          {bulletinDate ? (
            <span className="hidden text-[0.6875rem] text-txt-muted sm:inline">
              {bulletinDate}
            </span>
          ) : null}
        </div>

        <div className="fx-ticker-viewport relative min-w-0 flex-1 py-2.5">
          <div className="fx-ticker-track flex w-max items-center gap-8 px-4">
            {track.map((c, i) => (
              <div
                key={`${c.key}-${i}`}
                className="flex shrink-0 items-baseline gap-2 whitespace-nowrap"
                aria-hidden={i >= chips.length ? true : undefined}
              >
                <span className="text-xs font-semibold text-txt">{c.code}</span>
                <span className="hidden text-[0.6875rem] text-txt-muted md:inline">
                  {c.name}
                </span>
                <span className="tnum font-mono text-xs text-txt-secondary">
                  Alış <span className="text-txt">{c.buy}</span>
                </span>
                <span className="tnum font-mono text-xs text-txt-secondary">
                  Satış <span className="text-txt">{c.sell}</span>
                </span>
                <span className="text-line-strong" aria-hidden="true">
                  ·
                </span>
              </div>
            ))}
          </div>
        </div>

        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center border-l border-line px-3 text-[0.6875rem] font-medium text-brand-700 transition-colors hover:bg-sunken dark:text-brand-400"
        >
          Kaynak
        </a>
      </div>
    </section>
  );
};
