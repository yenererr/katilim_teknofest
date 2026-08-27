import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, RefreshCw } from "lucide-react";

type FxCode = "USD" | "EUR" | "GBP";
type FxCurrency = "TRY" | FxCode;

type FxRate = {
  code: FxCode;
  name: string;
  forexBuying: number;
  forexSelling: number;
  mid: number;
};

type FxSnapshot = {
  bulletinDate: string | null;
  fetchedAt: string;
  sourceUrl: string;
  rates: Record<FxCode, FxRate>;
};

const PARA_BIRIMLERI: Array<{ code: FxCurrency; label: string }> = [
  { code: "TRY", label: "TL" },
  { code: "USD", label: "USD" },
  { code: "EUR", label: "EUR" },
  { code: "GBP", label: "GBP" },
];

function parseAmount(metin: string): number {
  const temiz = metin.replace(/[^\d.,]/g, "").trim();
  if (!temiz) return 0;
  if (/\.\d{3}/.test(temiz) && !/,\d+$/.test(temiz)) {
    return Number(temiz.replace(/\./g, "")) || 0;
  }
  return Number(temiz.replace(/\./g, "").replace(",", ".")) || 0;
}

function bicimle(n: number, code: FxCurrency): string {
  if (!Number.isFinite(n)) return "—";
  if (code === "TRY") {
    return n.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function cevir(
  snapshot: FxSnapshot,
  amount: number,
  from: FxCurrency,
  to: FxCurrency,
): number | null {
  if (!(amount > 0) || from === to) return from === to ? amount : null;
  const toTry = (code: FxCurrency, a: number) =>
    code === "TRY" ? a : a * snapshot.rates[code].forexSelling;
  const fromTry = (code: FxCurrency, tryAmount: number) =>
    code === "TRY" ? tryAmount : tryAmount / snapshot.rates[code].forexSelling;
  return fromTry(to, toTry(from, amount));
}

/** Ana sayfa — TCMB kurlarıyla TL / USD / EUR / GBP çevirici. */
export const FxConverter: React.FC = () => {
  const [snapshot, setSnapshot] = useState<FxSnapshot | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [tutarMetni, setTutarMetni] = useState("100.000");
  const [from, setFrom] = useState<FxCurrency>("TRY");
  const [to, setTo] = useState<FxCurrency>("USD");

  const yukle = () => {
    setYukleniyor(true);
    fetch("/api/live/fx")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("kur yok"))))
      .then((d: FxSnapshot) => {
        setSnapshot(d);
        setHata(null);
      })
      .catch(() => {
        setSnapshot(null);
        setHata("TCMB kurları alınamadı. Biraz sonra yenileyin.");
      })
      .finally(() => setYukleniyor(false));
  };

  useEffect(() => {
    yukle();
    const id = window.setInterval(yukle, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const tutar = useMemo(() => parseAmount(tutarMetni), [tutarMetni]);
  const sonuc = useMemo(() => {
    if (!snapshot || tutar <= 0) return null;
    return cevir(snapshot, tutar, from, to);
  }, [snapshot, tutar, from, to]);

  const degistir = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-flat">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <h2 className="text-base font-semibold tracking-tight text-txt">
          Döviz Çevirici
        </h2>
        <button
          type="button"
          onClick={yukle}
          disabled={yukleniyor}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-brand-700 transition-colors hover:text-brand-800 disabled:opacity-50 dark:text-brand-400"
        >
          {yukleniyor ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          Yenile
        </button>
      </div>
      <p className="text-xs text-txt-secondary">
        TCMB günlük döviz kurları · TL, dolar, euro, sterlin
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <label className="block">
          <span className="mb-1 block text-xs text-txt-muted">Tutar</span>
          <input
            inputMode="decimal"
            value={tutarMetni}
            onChange={(e) => setTutarMetni(e.target.value)}
            className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 font-mono text-sm text-txt"
          />
        </label>
        <div className="hidden items-end sm:flex">
          <button
            type="button"
            onClick={degistir}
            aria-label="Para birimlerini değiştir"
            className="mb-0.5 grid h-11 w-11 place-items-center rounded-lg border border-line text-txt-secondary transition-colors hover:bg-sunken hover:text-txt"
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-txt-muted">Kimden</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value as FxCurrency)}
              className="h-11 w-full rounded-lg border border-line bg-surface px-2 text-sm text-txt"
            >
              {PARA_BIRIMLERI.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-txt-muted">Kime</span>
            <select
              value={to}
              onChange={(e) => setTo(e.target.value as FxCurrency)}
              className="h-11 w-full rounded-lg border border-line bg-surface px-2 text-sm text-txt"
            >
              {PARA_BIRIMLERI.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-sunken/60 px-3 py-3 dark:bg-sunken">
        {hata ? (
          <p className="text-sm text-warn-800 dark:text-warn-200">{hata}</p>
        ) : sonuc != null ? (
          <p className="tnum text-lg font-semibold text-txt">
            {bicimle(tutar, from)} {from === "TRY" ? "TL" : from}
            <span className="mx-2 text-txt-muted">≈</span>
            {bicimle(sonuc, to)} {to === "TRY" ? "TL" : to}
          </p>
        ) : (
          <p className="text-sm text-txt-muted">Tutar girin…</p>
        )}
        {snapshot?.bulletinDate ? (
          <p className="mt-1 text-[0.6875rem] text-txt-muted">
            Bülten: {snapshot.bulletinDate}
            {snapshot.sourceUrl ? (
              <>
                {" · "}
                <a
                  href={snapshot.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline dark:text-brand-400"
                >
                  TCMB
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      {snapshot ? (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {(["USD", "EUR", "GBP"] as FxCode[]).map((code) => {
            const r = snapshot.rates[code];
            return (
              <li
                key={code}
                className="rounded-lg border border-line px-2 py-2 text-center"
              >
                <p className="text-[0.6875rem] font-medium text-txt-secondary">
                  {code}
                </p>
                <p className="tnum mt-0.5 font-mono text-xs text-txt">
                  {bicimle(r.forexSelling, "TRY")}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};
