import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Printer } from "lucide-react";
import { sayiBicim, tlBicim2 } from "../lib/finansman";
import { bicimleOdemePlani, hesaplaOdemePlani } from "../lib/odemePlani";
import { FINANSMAN_NOTLARI_BY_CODE } from "../data/finansmanNotlari";
import { BANKA_INDEKS } from "../data/piyasa";
import { BankMark } from "./BankMark";

type FinancingType =
  | "ihtiyac_finansmani"
  | "konut_finansmani"
  | "konut_finansmani_ikinci_el"
  | "tasit_finansmani"
  | "tasit_finansmani_ikinci_el"
  | "isyeri_finansmani"
  | "arsa_finansmani";

type CalculateType = "1" | "2";

type KarPayiTerm = "1m" | "3m" | "6m" | "12m" | "12p";

type KarPayiRow = {
  bankId: string;
  available: boolean;
  reason?: string;
  accountName: string | null;
  grossProfit: number | null;
  netProfit: number | null;
  totalAmount: number | null;
  grossRatePercent: number | null;
  netRatePercent: number | null;
  shareCustomerPercent: number | null;
  sourceUrl: string;
};

const KAR_PAYI_VADE_OPTIONS: Array<{ key: KarPayiTerm; label: string }> = [
  { key: "1m", label: "1 Ay" },
  { key: "3m", label: "3 Ay" },
  { key: "6m", label: "6 Ay" },
  { key: "12m", label: "1 Yıl" },
  { key: "12p", label: "1 Yıl üzeri" },
];

type HesapSonuc = {
  available?: boolean;
  reason?: string;
  profitRatePercent: number | null;
  monthlyInstallmentTl: number | null;
  totalPaymentTl: number | null;
  appraisementFeeTl: number | null;
  mortgageReleaseFeeTl: number | null;
  installmentLabel: string | null;
  sourceUrl?: string;
  calculatedAt?: string;
};

type OdemePlani = ReturnType<typeof bicimleOdemePlani>;

const FINANSMAN_OPTIONS: Array<{ key: FinancingType; label: string; code: string }> = [
  { key: "ihtiyac_finansmani", label: "İhtiyaç Finansmanı", code: "IF" },
  { key: "konut_finansmani", label: "Sıfır Konut Finansmanı", code: "K" },
  { key: "konut_finansmani_ikinci_el", label: "2. El Konut Finansmanı", code: "K2" },
  { key: "tasit_finansmani", label: "Taşıt Finansmanı 0 km", code: "BO" },
  { key: "tasit_finansmani_ikinci_el", label: "Taşıt Finansmanı 2. El", code: "BO2" },
  { key: "isyeri_finansmani", label: "İşyeri Finansmanı", code: "I" },
  { key: "arsa_finansmani", label: "Arsa Finansmanı", code: "A" },
];

const FALLBACK_VADELER: Record<FinancingType, number[]> = {
  ihtiyac_finansmani: Array.from({ length: 36 }, (_, i) => i + 1),
  konut_finansmani: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
  konut_finansmani_ikinci_el: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120],
  tasit_finansmani: Array.from({ length: 48 }, (_, i) => i + 1),
  tasit_finansmani_ikinci_el: Array.from({ length: 48 }, (_, i) => i + 1),
  isyeri_finansmani: [12, 24, 36, 48, 60],
  arsa_finansmani: [12, 24, 36, 48, 60],
};

const DEFAULT_VADER: Record<FinancingType, number> = {
  ihtiyac_finansmani: 18,
  konut_finansmani: 120,
  konut_finansmani_ikinci_el: 120,
  tasit_finansmani: 48,
  tasit_finansmani_ikinci_el: 48,
  isyeri_finansmani: 60,
  arsa_finansmani: 60,
};

function parseMoneyInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function parseRateInput(raw: string): number | null {
  const n = Number(raw.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatTl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

function formatRate(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `%${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Finansman hesaplama arayüzü — taksit, toplam tutar ve ödeme planı.
 */
export const VakifHesaplamaView: React.FC = () => {
  const [mode, setMode] = useState<"finansman" | "kar-payi">("finansman");
  const [financingType, setFinancingType] =
    useState<FinancingType>("ihtiyac_finansmani");
  const [tutarMetni, setTutarMetni] = useState("100.000");
  const [vadeAy, setVadeAy] = useState(18);
  const [vadeMetni, setVadeMetni] = useState("18");
  const [vadeler, setVadeler] = useState<number[]>(
    FALLBACK_VADELER.ihtiyac_finansmani,
  );
  const [oranOzel, setOranOzel] = useState(false);
  const [oranMetni, setOranMetni] = useState("3,99");
  const [calculateType, setCalculateType] = useState<CalculateType>("1");
  const [sonuc, setSonuc] = useState<HesapSonuc | null>(null);
  const [kisit, setKisit] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [plan, setPlan] = useState<OdemePlani | null>(null);
  const [planYukleniyor, setPlanYukleniyor] = useState(false);
  const [planHata, setPlanHata] = useState<string | null>(null);
  const [autoOpenPlan, setAutoOpenPlan] = useState(false);
  const [karPayiTutarMetni, setKarPayiTutarMetni] = useState("100.000");
  const [karPayiVade, setKarPayiVade] = useState<KarPayiTerm>("1m");
  const [karPayiRows, setKarPayiRows] = useState<KarPayiRow[]>([]);
  const [karPayiYukleniyor, setKarPayiYukleniyor] = useState(false);
  const [karPayiHata, setKarPayiHata] = useState<string | null>(null);
  const [karPayiDisclaimer, setKarPayiDisclaimer] = useState<string | null>(
    null,
  );
  const planRef = useRef<HTMLDivElement>(null);
  const pendingVadeRef = useRef<number | null>(null);
  const formId = useId();
  const bootstrappedQuery = useRef(false);

  // Chatbot / deep-link: #/hesaplama?tutar=&vade=&oran=&tur=&plan=1&mode=kar-payi
  useEffect(() => {
    if (bootstrappedQuery.current) return;
    bootstrappedQuery.current = true;
    const hash = window.location.hash.replace(/^#/, "");
    const qIdx = hash.indexOf("?");
    if (qIdx < 0) return;
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    if (params.get("mode") === "kar-payi") setMode("kar-payi");
    const tur = params.get("tur");
    if (tur && FINANSMAN_OPTIONS.some((o) => o.key === tur)) {
      setFinancingType(tur as FinancingType);
    }
    const tutarP = params.get("tutar");
    if (tutarP) {
      const n = Number(tutarP.replace(/[^\d]/g, ""));
      if (n > 0) {
        setTutarMetni(sayiBicim(n));
        setKarPayiTutarMetni(sayiBicim(n));
      }
    }
    const vadeP = params.get("vade");
    if (vadeP) {
      const v = Number(vadeP);
      if (Number.isFinite(v) && v > 0) {
        pendingVadeRef.current = v;
        setVadeAy(v);
        setVadeMetni(String(v));
      }
      if (KAR_PAYI_VADE_OPTIONS.some((o) => o.key === vadeP)) {
        setKarPayiVade(vadeP as KarPayiTerm);
      }
    }
    const oranP = params.get("oran");
    if (oranP) {
      setOranOzel(true);
      setOranMetni(oranP.replace(".", ","));
    }
    if (params.get("plan") === "1") setAutoOpenPlan(true);
  }, []);

  const tutar = useMemo(() => parseMoneyInput(tutarMetni), [tutarMetni]);
  const karPayiTutar = useMemo(
    () => parseMoneyInput(karPayiTutarMetni),
    [karPayiTutarMetni],
  );
  const secilen = FINANSMAN_OPTIONS.find((f) => f.key === financingType)!;
  const customRate = oranOzel ? parseRateInput(oranMetni) : null;

  const body = useMemo(
    () => ({
      financingType,
      amountTl: tutar,
      termMonths: vadeAy,
      calculateType,
      ...(customRate != null ? { profitRatePercent: customRate } : {}),
    }),
    [financingType, tutar, vadeAy, calculateType, customRate],
  );

  // Vade listesini bankadan çek
  useEffect(() => {
    let iptal = false;
    fetch(
      `/api/calculators/vakif-katilim/vadeler?financingType=${encodeURIComponent(financingType)}`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { termMonths?: number[] }) => {
        if (iptal) return;
        const list =
          Array.isArray(d.termMonths) && d.termMonths.length > 0
            ? d.termMonths
            : FALLBACK_VADELER[financingType];
        setVadeler(list);
        const pending = pendingVadeRef.current;
        pendingVadeRef.current = null;
        if (pending != null && pending >= 1 && pending <= 360) {
          setVadeAy(pending);
          setVadeMetni(String(pending));
        }
        // Kullanıcının yazdığı vade, banka listesinde olmasa da korunur.
      })
      .catch(() => {
        if (iptal) return;
        const list = FALLBACK_VADELER[financingType];
        setVadeler(list);
        const pending = pendingVadeRef.current;
        pendingVadeRef.current = null;
        if (pending != null && pending >= 1 && pending <= 360) {
          setVadeAy(pending);
          setVadeMetni(String(pending));
        }
      });
    return () => {
      iptal = true;
    };
  }, [financingType]);

  // Canlı hesaplama (debounce)
  useEffect(() => {
    if (mode !== "finansman" || tutar <= 0 || vadeAy <= 0) {
      setSonuc(null);
      return;
    }
    let iptal = false;
    setYukleniyor(true);
    setKisit(null);
    setHata(null);
    setPlan(null);
    const t = window.setTimeout(() => {
      fetch("/api/calculators/vakif-katilim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then(async (r) => {
          const d = (await r.json()) as HesapSonuc & { error?: string };
          if (!r.ok) throw new Error(d.error || "Hesaplama yapılamadı");
          return d;
        })
        .then((d) => {
          if (iptal) return;
          if (d.available === false) {
            setSonuc(null);
            setKisit(d.reason || "Bu koşullarda hesaplama sunulmuyor.");
            return;
          }
          setSonuc(d);
          if (d.profitRatePercent != null && !oranOzel) {
            setOranMetni(
              d.profitRatePercent.toLocaleString("tr-TR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
            );
          }
        })
        .catch((err) => {
          if (iptal) return;
          setSonuc(null);
          setHata(err instanceof Error ? err.message : "Bağlantı hatası");
        })
        .finally(() => {
          if (!iptal) setYukleniyor(false);
        });
    }, 350);
    return () => {
      iptal = true;
      window.clearTimeout(t);
    };
  }, [body, mode, oranOzel]);

  // Kâr payı: bankaların resmî araçlarından paralel karşılaştırma
  useEffect(() => {
    if (mode !== "kar-payi" || karPayiTutar <= 0) {
      setKarPayiRows([]);
      return;
    }
    let iptal = false;
    setKarPayiYukleniyor(true);
    setKarPayiHata(null);
    const t = window.setTimeout(() => {
      fetch("/api/calculators/kar-payi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: karPayiTutar, term: karPayiVade }),
      })
        .then(async (r) => {
          const d = (await r.json()) as {
            error?: string;
            disclaimer?: string;
            results?: KarPayiRow[];
          };
          if (!r.ok) throw new Error(d.error || "Kâr payı hesaplanamadı");
          return d;
        })
        .then((d) => {
          if (iptal) return;
          setKarPayiRows(Array.isArray(d.results) ? d.results : []);
          setKarPayiDisclaimer(d.disclaimer ?? null);
        })
        .catch((err) => {
          if (iptal) return;
          setKarPayiRows([]);
          setKarPayiHata(
            err instanceof Error ? err.message : "Bağlantı hatası",
          );
        })
        .finally(() => {
          if (!iptal) setKarPayiYukleniyor(false);
        });
    }, 350);
    return () => {
      iptal = true;
      window.clearTimeout(t);
    };
  }, [mode, karPayiTutar, karPayiVade]);

  const odemePlaniGetir = () => {
    if (tutar <= 0) return;
    const oran =
      customRate ??
      sonuc?.profitRatePercent ??
      parseRateInput(oranMetni);
    if (oran == null) {
      setPlanHata("Ödeme planı için kâr oranı gerekli.");
      return;
    }
    setPlanYukleniyor(true);
    setPlanHata(null);
    try {
      const detay = hesaplaOdemePlani({
        amountTl: tutar,
        termMonths: vadeAy,
        profitRatePercent: oran,
        financingType,
        mortgageFeeTl: sonuc?.mortgageReleaseFeeTl ?? 0,
        appraisalFeeTl: sonuc?.appraisementFeeTl ?? 0,
      });
      setPlan(bicimleOdemePlani(detay));
      requestAnimationFrame(() => {
        planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      setPlan(null);
      setPlanHata(err instanceof Error ? err.message : "Ödeme planı hatası");
    } finally {
      setPlanYukleniyor(false);
    }
  };

  // Chatbot yönlendirmesi: sonuç hazır olunca planı otomatik aç
  useEffect(() => {
    if (!autoOpenPlan || !sonuc || yukleniyor) return;
    setAutoOpenPlan(false);
    odemePlaniGetir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenPlan, sonuc, yukleniyor]);

  const yazdir = () => {
    if (!planRef.current) return;
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Ödeme Planı</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#111}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:right}
        th:first-child,td:first-child{text-align:left}
        h3{margin:0 0 12px}
        .ozet{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
        .ozet div{border:1px solid #eee;padding:8px 10px;border-radius:8px}
        .ozet span{font-weight:600;display:block;margin-top:2px}
      </style></head><body>${planRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const taksitLabel =
    sonuc?.installmentLabel ||
    (calculateType === "2" ? "Finansman Tutarı" : "Taksit Tutarı");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-txt">
            Finansman Hesaplama
          </h2>
          <p className="text-xs text-txt-muted">
            Taksit, toplam tutar ve ödeme planını aynı koşullarda hesaplayın.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div
          role="tablist"
          aria-label="Hesaplama türü"
          className="grid grid-cols-2 border-b border-line"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "kar-payi"}
            onClick={() => setMode("kar-payi")}
            className={`min-h-12 px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
              mode === "kar-payi"
                ? "border-b-2 border-brand-600 text-brand-800 dark:text-brand-200"
                : "font-medium text-txt-secondary hover:bg-sunken hover:text-txt"
            }`}
          >
            Kâr Payı Hesapla
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "finansman"}
            onClick={() => setMode("finansman")}
            className={`min-h-12 px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
              mode === "finansman"
                ? "border-b-2 border-brand-600 text-brand-800 dark:text-brand-200"
                : "font-medium text-txt-secondary hover:bg-sunken hover:text-txt"
            }`}
          >
            Finansman Hesapla
          </button>
        </div>

        {mode === "kar-payi" ? (
          <div className="space-y-5 p-5">
            <p className="text-sm text-txt-secondary">
              Katılma hesabı tahmini kâr payı; Vakıf Katılım, Albaraka Türk ve
              Kuveyt Türk’ün resmî hesaplama araçlarından canlı çekilir.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-txt-secondary">
                  Yatırılan Tutar
                </span>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    value={karPayiTutarMetni}
                    onChange={(e) => setKarPayiTutarMetni(e.target.value)}
                    onBlur={() => {
                      if (karPayiTutar > 0) {
                        setKarPayiTutarMetni(sayiBicim(karPayiTutar));
                      }
                    }}
                    className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 pr-10 font-mono text-sm text-txt"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-txt-muted">
                    TL
                  </span>
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-txt-secondary">
                  Vade
                </span>
                <select
                  value={karPayiVade}
                  onChange={(e) =>
                    setKarPayiVade(e.target.value as KarPayiTerm)
                  }
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-txt"
                >
                  {KAR_PAYI_VADE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {karPayiYukleniyor ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-txt-secondary">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Bankalardan kâr payı hesaplanıyor…
              </div>
            ) : karPayiHata ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                {karPayiHata}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-sunken text-xs text-txt-secondary">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Banka</th>
                      <th className="px-3 py-2.5 font-medium">Brüt oran</th>
                      <th className="px-3 py-2.5 font-medium">Net oran</th>
                      <th className="px-3 py-2.5 font-medium">Net kâr</th>
                      <th className="px-3 py-2.5 font-medium">Vade sonu</th>
                      <th className="px-3 py-2.5 font-medium">Kaynak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {karPayiRows.map((row) => {
                      const banka = BANKA_INDEKS[row.bankId];
                      return (
                        <tr
                          key={row.bankId}
                          className="border-t border-line align-top"
                        >
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <BankMark bankaId={row.bankId} size="sm" />
                              <div>
                                <div className="font-medium text-txt">
                                  {banka?.ad ?? row.bankId}
                                </div>
                                    {row.accountName ? (
                                  <div className="text-xs text-txt-muted">
                                    {row.accountName}
                                    {row.shareCustomerPercent != null
                                      ? ` · müşteri payı %${row.shareCustomerPercent}`
                                      : ""}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          {row.available ? (
                            <>
                              <td className="tnum px-3 py-3 font-mono text-txt">
                                {formatRate(row.grossRatePercent)}
                              </td>
                              <td className="tnum px-3 py-3 font-mono text-txt">
                                {formatRate(row.netRatePercent)}
                              </td>
                              <td className="tnum px-3 py-3 font-mono font-semibold text-txt">
                                {row.netProfit != null
                                  ? tlBicim2(row.netProfit)
                                  : "—"}
                              </td>
                              <td className="tnum px-3 py-3 font-mono text-txt">
                                {row.totalAmount != null
                                  ? tlBicim2(row.totalAmount)
                                  : "—"}
                              </td>
                            </>
                          ) : (
                            <td
                              colSpan={4}
                              className="px-3 py-3 text-xs text-txt-secondary"
                            >
                              {row.reason || "Bu koşullarda hesaplama yok"}
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <a
                              href={row.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline dark:text-brand-300"
                            >
                              Resmî araç
                              <ExternalLink className="h-3 w-3" aria-hidden />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {karPayiDisclaimer ? (
              <p className="text-xs leading-relaxed text-txt-muted">
                {karPayiDisclaimer}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-txt-secondary">
                  Finansman Türü
                </span>
                <select
                  value={financingType}
                  onChange={(e) =>
                    setFinancingType(e.target.value as FinancingType)
                  }
                  className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-txt"
                >
                  {FINANSMAN_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-txt-secondary">
                  {calculateType === "2" ? "Taksit Tutarı" : "Tutar"}
                </span>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    value={tutarMetni}
                    onChange={(e) => setTutarMetni(e.target.value)}
                    onBlur={() => {
                      if (tutar > 0) setTutarMetni(sayiBicim(tutar));
                    }}
                    className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 pr-10 font-mono text-sm text-txt"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-txt-muted">
                    TL
                  </span>
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-txt-secondary">
                  Vade (Ay)
                </span>
                <span className="relative block">
                  <input
                    list={`${formId}-vade-list`}
                    inputMode="numeric"
                    value={vadeMetni}
                    onChange={(e) => setVadeMetni(e.target.value)}
                    onBlur={() => {
                      const n = Number(vadeMetni.replace(/[^\d]/g, ""));
                      if (!Number.isFinite(n) || n < 1) {
                        setVadeMetni(String(vadeAy));
                        return;
                      }
                      const ay = Math.min(360, Math.floor(n));
                      setVadeAy(ay);
                      setVadeMetni(String(ay));
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const n = Number(vadeMetni.replace(/[^\d]/g, ""));
                      if (!Number.isFinite(n) || n < 1) return;
                      const ay = Math.min(360, Math.floor(n));
                      setVadeAy(ay);
                      setVadeMetni(String(ay));
                    }}
                    aria-label="Vade ay olarak"
                    className="tnum h-11 w-full rounded-lg border border-line bg-surface px-3 pr-10 font-mono text-sm text-txt"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-txt-muted">
                    Ay
                  </span>
                </span>
                <datalist id={`${formId}-vade-list`}>
                  {vadeler.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </label>

              <div className="block">
                <span className="mb-1.5 block text-xs font-medium text-txt-secondary">
                  Kâr Oranı Kendin Belirle
                </span>
                <div className="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3">
                  <input
                    id={`${formId}-oran`}
                    type="checkbox"
                    checked={oranOzel}
                    onChange={(e) => setOranOzel(e.target.checked)}
                    className="h-4 w-4 rounded border-line text-brand-600 focus:ring-brand-400"
                  />
                  <label htmlFor={`${formId}-oran`} className="sr-only">
                    Özel kâr oranı kullan
                  </label>
                  <input
                    inputMode="decimal"
                    disabled={!oranOzel}
                    value={oranMetni}
                    onChange={(e) => setOranMetni(e.target.value)}
                    className="tnum h-full min-w-0 flex-1 bg-transparent font-mono text-sm text-txt outline-none disabled:text-txt-muted"
                  />
                </div>
              </div>
            </div>

            <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
              <legend className="sr-only">Hesaplama biçimi</legend>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-txt">
                <input
                  type="radio"
                  name={`${formId}-calc`}
                  checked={calculateType === "1"}
                  onChange={() => setCalculateType("1")}
                  className="h-4 w-4 border-line text-brand-600 focus:ring-brand-400"
                />
                Finansman Tutarından Hesapla
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-txt">
                <input
                  type="radio"
                  name={`${formId}-calc`}
                  checked={calculateType === "2"}
                  onChange={() => setCalculateType("2")}
                  className="h-4 w-4 border-line text-brand-600 focus:ring-brand-400"
                />
                Taksit Tutarından Hesapla
              </label>
            </fieldset>

            <div className="relative overflow-hidden rounded-xl border border-line">
              {yukleniyor && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                </div>
              )}
              <div className="grid grid-cols-2 divide-x divide-line border-b border-line bg-sunken/40">
                <div className="px-4 py-4 sm:px-5">
                  <p className="text-xs text-txt-muted">{taksitLabel}</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-accent-600 tabular-nums dark:text-accent-400 sm:text-2xl">
                    {formatTl(sonuc?.monthlyInstallmentTl)}
                  </p>
                </div>
                <div className="px-4 py-4 sm:px-5">
                  <p className="text-xs text-txt-muted">Toplam Tutar</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight text-accent-600 tabular-nums dark:text-accent-400 sm:text-2xl">
                    {formatTl(sonuc?.totalPaymentTl)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="px-4 py-3">
                  <p className="text-[11px] text-txt-muted">Kar Oranı</p>
                  <p className="mt-0.5 text-sm font-medium text-txt tabular-nums">
                    {formatRate(sonuc?.profitRatePercent)}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-txt-muted">İpotek Tesis Ücreti</p>
                  <p className="mt-0.5 text-sm font-medium text-txt tabular-nums">
                    {formatTl(sonuc?.mortgageReleaseFeeTl)}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-txt-muted">Ekspertiz Ücreti</p>
                  <p className="mt-0.5 text-sm font-medium text-txt tabular-nums">
                    {formatTl(sonuc?.appraisementFeeTl)}
                  </p>
                </div>
              </div>
            </div>

            {(kisit || hata) && (
              <p
                role="alert"
                className="rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-xs text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200"
              >
                {kisit || hata}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-xl text-xs leading-relaxed text-txt-muted">
                {FINANSMAN_NOTLARI_BY_CODE[secilen.code]?.metin}
              </p>
              <button
                type="button"
                onClick={() => odemePlaniGetir()}
                disabled={planYukleniyor || !sonuc || yukleniyor}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-brand-700 px-5 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-brand-400 dark:text-brand-200 dark:hover:bg-brand-950"
              >
                {planYukleniyor ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Ödeme Planı
              </button>
            </div>

            {planHata && (
              <p className="text-xs text-risk-700 dark:text-risk-300">{planHata}</p>
            )}
          </div>
        )}
      </div>

      {plan && mode === "finansman" && (
        <div
          ref={planRef}
          className="space-y-4 rounded-2xl border border-line bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-txt">{plan.baslik}</h3>
            <button
              type="button"
              onClick={yazdir}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-txt-secondary hover:bg-sunken hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Printer className="h-3.5 w-3.5" />
              Yazdır
            </button>
          </div>

          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {plan.ozet.map((item) => (
              <div
                key={item.label}
                className="flex items-baseline justify-between gap-3 border-b border-line/70 py-1.5"
              >
                <dt className="text-xs text-txt-muted">{item.label}</dt>
                <dd className="text-sm font-semibold text-txt tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <div
            className="overflow-x-auto rounded-xl border border-line"
            tabIndex={0}
            role="region"
            aria-label="Ödeme planı tablosu"
          >
            <table className="w-full min-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="sticky top-0 z-10 bg-brand-800 text-left text-white dark:bg-brand-900">
                  {plan.tableHead.map((h) => (
                    <th key={h} scope="col" className="px-2.5 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr
                    key={r.taksitNo}
                    className="border-b border-line/70 odd:bg-surface even:bg-sunken/40 text-txt"
                  >
                    <th scope="row" className="px-2.5 py-2 text-left font-medium">
                      {r.taksitNo}
                    </th>
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      {r.taksitTutari}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{r.anaPara}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      {r.kalanAnaPara}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      {r.karTutari}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      {r.kkdfTutari}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      {r.bsmvTutari}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {plan.uyari && (
            <p className="text-[11px] leading-relaxed text-txt-muted">{plan.uyari}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default VakifHesaplamaView;
