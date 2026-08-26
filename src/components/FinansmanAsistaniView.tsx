import React, { useEffect, useId, useRef, useState } from "react";
import {
  Bot,
  ExternalLink,
  Loader2,
  Send,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

export type FinancingMatchRow = {
  bankId: string;
  bankName: string;
  productId: string;
  productName: string;
  financingType: string;
  requestedAmountTl: number;
  termMonths: number;
  profitRate: number | null;
  ratePeriod: "monthly" | "annual" | "unknown" | null;
  estimatedMonthlyPaymentTl: number | null;
  estimatedTotalPaymentTl: number | null;
  allocationFeeTl: number | null;
  customerCondition: string | null;
  campaignEnd: string | null;
  freshnessStatus: string;
  sourceCheckedAt: string;
  sourceUrl: string;
  evidence: string[];
  calculationAvailable: boolean;
  calculationWarning: string | null;
};

export type FlexibleMatchRow = {
  bankId: string;
  bankName: string;
  campaignId: string;
  campaignName: string;
  flexibilityType: string;
  currentRequestDescription: string;
  requiredChangeDescription: string;
  offeredAmountTl: number | null;
  termMonths: number | null;
  profitRate: number | null;
  opportunityDescription: string;
  customerCondition: string | null;
  campaignEnd: string | null;
  matchScore: number;
  freshnessStatus: string;
  sourceCheckedAt: string;
  sourceUrl: string;
  evidence: string[];
};

export type FinansmanChatResponse = {
  conversationId: string;
  assistantMessage: string;
  status: string;
  missingFields: string[];
  quickReplies: Array<{ id: string; label: string; value: string }>;
  query: Record<string, unknown>;
  exactMatches: FinancingMatchRow[];
  flexibleMatches: FlexibleMatchRow[];
  summary: {
    totalParticipationBanks: number;
    checkedBanks: number;
    exactMatchBankCount: number;
    flexibleMatchCount: number;
    dataAsOf: string | null;
    freshnessLabel: string;
  };
  warnings: string[];
  citations: Array<{
    id: number;
    bankName: string;
    sourceUrl: string;
    sourceCheckedAt: string;
    evidenceText: string;
  }>;
};

type Turn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  payload?: FinansmanChatResponse;
};

const STARTER_CHIPS = [
  "200.000 TL ihtiyaç finansmanı arıyorum",
  "Bir araç almak istiyorum",
  "Konut finansmanlarını karşılaştır",
  "Yeni müşterilere özel kampanyaları göster",
  "En uzun vadeli seçenekleri göster",
];

const WELCOME =
  "Merhaba! Katılım bankalarının finansman seçeneklerini birlikte karşılaştıralım.\n\nNe kadar tutara ihtiyacınız var ve ne için kullanacaksınız? Bu ikisi yeter.";

function formatTl(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "Belirtilmemiş";
  return `${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`;
}

function formatRate(
  rate: number | null,
  period: FinancingMatchRow["ratePeriod"],
): string {
  if (rate == null) return "Resmî kaynakta belirtilmemiş";
  const pct = (rate * 100).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const p =
    period === "monthly"
      ? "aylık"
      : period === "annual"
        ? "yıllık"
        : "periyot belirsiz";
  return `%${pct} (${p})`;
}

function formatDateTr(iso: string | null | undefined): string {
  if (!iso) return "Belirtilmemiş";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function freshnessBadgeClass(label: string): string {
  if (label === "Güncel")
    return "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-200";
  if (label === "Güncelleniyor" || label === "Kısmen güncel")
    return "border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-200";
  return "border-line bg-sunken text-txt-muted";
}

const ExactTable: React.FC<{
  rows: FinancingMatchRow[];
  summaryText: string;
  onCompareAdd?: (id: string) => void;
}> = ({ rows, summaryText, onCompareAdd }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!rows.length) return null;

  return (
    <section className="mt-4" aria-labelledby="exact-matches-title">
      <h2
        id="exact-matches-title"
        className="text-base font-semibold tracking-tight text-txt"
      >
        Size Uygun Finansmanlar
      </h2>
      <p className="mt-1 text-sm text-txt-secondary">{summaryText}</p>

      {/* Desktop table */}
      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-line md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-sunken text-xs text-txt-secondary">
            <tr>
              {[
                "Banka",
                "Ürün",
                "Talep Edilen Tutar",
                "Vade",
                "İlan Edilen Kâr Payı",
                "Tahmini Aylık Ödeme",
                "Tahmini Toplam Ödeme",
                "Tahsis Ücreti",
                "Müşteri Koşulu",
                "Kampanya Bitişi",
                "Son Kontrol",
                "Kaynak",
              ].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <React.Fragment key={r.productId}>
                <tr className="border-t border-line align-top">
                  <td className="px-3 py-2 font-medium text-txt">{r.bankName}</td>
                  <td className="px-3 py-2 text-txt">{r.productName}</td>
                  <td className="px-3 py-2">{formatTl(r.requestedAmountTl)}</td>
                  <td className="px-3 py-2">{r.termMonths} ay</td>
                  <td className="px-3 py-2">{formatRate(r.profitRate, r.ratePeriod)}</td>
                  <td className="px-3 py-2">
                    {r.calculationAvailable
                      ? formatTl(r.estimatedMonthlyPaymentTl)
                      : "Bankadan teklif alınmalı"}
                  </td>
                  <td className="px-3 py-2">
                    {r.calculationAvailable
                      ? formatTl(r.estimatedTotalPaymentTl)
                      : "Bankadan teklif alınmalı"}
                  </td>
                  <td className="px-3 py-2">
                    {r.allocationFeeTl == null
                      ? "Belirtilmemiş"
                      : formatTl(r.allocationFeeTl)}
                  </td>
                  <td className="px-3 py-2">{r.customerCondition || "Belirtilmemiş"}</td>
                  <td className="px-3 py-2">
                    {r.campaignEnd
                      ? formatDateTr(r.campaignEnd)
                      : "Belirtilmemiş"}
                  </td>
                  <td className="px-3 py-2">{formatDateTr(r.sourceCheckedAt)}</td>
                  <td className="px-3 py-2">
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                    >
                      Resmî Kaynak
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </td>
                </tr>
                <tr className="border-t border-line bg-sunken/40">
                  <td colSpan={12} className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-txt hover:bg-sunken"
                        onClick={() =>
                          setExpanded(
                            expanded === r.productId ? null : r.productId,
                          )
                        }
                        aria-expanded={expanded === r.productId}
                      >
                        {expanded === r.productId ? (
                          <span className="inline-flex items-center gap-1">
                            Gizle <ChevronUp className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            Detayları Gör <ChevronDown className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </button>
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-txt hover:bg-sunken"
                      >
                        Resmî Kaynak
                      </a>
                      <button
                        type="button"
                        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-txt hover:bg-sunken"
                        onClick={() => onCompareAdd?.(r.productId)}
                      >
                        Karşılaştırmaya Ekle
                      </button>
                    </div>
                    {expanded === r.productId && (
                      <div className="mt-2 space-y-1 text-xs text-txt-secondary">
                        {r.calculationWarning && <p>{r.calculationWarning}</p>}
                        {r.evidence.length ? (
                          <ul className="list-disc pl-4">
                            {r.evidence.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>Kanıt cümlesi bu kayıt için listelenmedi.</p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((r) => (
          <li
            key={r.productId}
            className="rounded-xl border border-line bg-surface p-3"
          >
            <p className="font-medium text-txt">{r.bankName}</p>
            <p className="text-sm text-txt-secondary">{r.productName}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-txt-muted">Tutar</dt>
              <dd>{formatTl(r.requestedAmountTl)}</dd>
              <dt className="text-txt-muted">Vade</dt>
              <dd>{r.termMonths} ay</dd>
              <dt className="text-txt-muted">Kâr payı</dt>
              <dd>{formatRate(r.profitRate, r.ratePeriod)}</dd>
              <dt className="text-txt-muted">Aylık</dt>
              <dd>
                {r.calculationAvailable
                  ? formatTl(r.estimatedMonthlyPaymentTl)
                  : "Bankadan teklif alınmalı"}
              </dd>
            </dl>
            <a
              href={r.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-brand-700 dark:text-brand-300"
            >
              Resmî kaynak sayfasını aç
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
};

const FlexTable: React.FC<{
  rows: FlexibleMatchRow[];
  onSelect: (row: FlexibleMatchRow) => void;
}> = ({ rows, onSelect }) => {
  if (!rows.length) return null;
  return (
    <section className="mt-6" aria-labelledby="flex-matches-title">
      <h2
        id="flex-matches-title"
        className="text-base font-semibold tracking-tight text-txt"
      >
        Esnek Alternatifler ve Kampanyalar
      </h2>
      <p className="mt-1 text-sm text-txt-secondary">
        Biraz Esnerseniz Değerlendirebileceğiniz Alternatifler
      </p>

      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-line md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-sunken text-xs text-txt-secondary">
            <tr>
              {[
                "Banka",
                "Kampanya",
                "Mevcut Talebiniz",
                "Gerekli Değişiklik",
                "Sunulan Tutar",
                "Vade",
                "Kâr Payı/Fırsat",
                "Müşteri Koşulu",
                "Son Başvuru",
                "Son Kontrol",
                "Kaynak",
              ].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.campaignId}
                className="cursor-pointer border-t border-line hover:bg-sunken/60"
                onClick={() => onSelect(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${r.campaignName} alternatifini uygula`}
              >
                <td className="px-3 py-2 font-medium">{r.bankName}</td>
                <td className="px-3 py-2">{r.campaignName}</td>
                <td className="px-3 py-2">{r.currentRequestDescription}</td>
                <td className="px-3 py-2">{r.requiredChangeDescription}</td>
                <td className="px-3 py-2">{formatTl(r.offeredAmountTl)}</td>
                <td className="px-3 py-2">
                  {r.termMonths != null ? `${r.termMonths} ay` : "Belirtilmemiş"}
                </td>
                <td className="px-3 py-2">
                  {r.profitRate != null
                    ? formatRate(r.profitRate, "unknown")
                    : r.opportunityDescription}
                </td>
                <td className="px-3 py-2">
                  {r.customerCondition || "Belirtilmemiş"}
                </td>
                <td className="px-3 py-2">
                  {r.campaignEnd
                    ? formatDateTr(r.campaignEnd)
                    : "Belirtilmemiş"}
                </td>
                <td className="px-3 py-2">{formatDateTr(r.sourceCheckedAt)}</td>
                <td className="px-3 py-2">
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Resmî Kaynak
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((r) => (
          <li key={r.campaignId}>
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="w-full rounded-xl border border-line bg-surface p-3 text-left"
            >
              <p className="font-medium text-txt">{r.bankName}</p>
              <p className="text-sm text-txt-secondary">{r.campaignName}</p>
              <p className="mt-1 text-xs text-txt">{r.requiredChangeDescription}</p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

type GroupedCitation = {
  key: string;
  ids: number[];
  bankName: string;
  sourceUrl: string;
  hostLabel: string;
  sourceCheckedAt: string;
};

/** Kaynak URL'sinden okunabilir alan adı üretir. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "resmî kaynak";
  }
}

/**
 * Aynı sayfadan gelen parçalar tek satırda toplanır; aksi halde aynı banka
 * için birebir aynı görünen satırlar alt alta tekrarlanıyordu.
 */
function groupCitations(
  citations: Array<{
    id: number;
    bankName: string;
    sourceUrl: string;
    sourceCheckedAt: string;
  }>,
): GroupedCitation[] {
  const map = new Map<string, GroupedCitation>();
  for (const c of citations) {
    const key = `${c.bankName}|${c.sourceUrl}`;
    const mevcut = map.get(key);
    if (mevcut) {
      mevcut.ids.push(c.id);
      continue;
    }
    map.set(key, {
      key,
      ids: [c.id],
      bankName: c.bankName,
      sourceUrl: c.sourceUrl,
      hostLabel: hostLabel(c.sourceUrl),
      sourceCheckedAt: c.sourceCheckedAt,
    });
  }
  return [...map.values()].map((g) => ({
    ...g,
    ids: [...g.ids].sort((a, b) => a - b),
  }));
}

type FinansmanAsistaniViewProps = {
  /** Dışarıdan (arama kutusu, geçmiş, hızlı işlem) gelen ilk soru. */
  initialQuestion?: string;
};

export const FinansmanAsistaniView: React.FC<FinansmanAsistaniViewProps> = ({
  initialQuestion,
}) => {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState(() =>
    crypto.randomUUID(),
  );
  const [latest, setLatest] = useState<FinansmanChatResponse | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const bootstrapped = useRef(false);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, loading]);

  useEffect(() => {
    if (bootstrapped.current) return;
    const soru = initialQuestion?.trim();
    if (!soru) return;
    bootstrapped.current = true;
    void send(soru);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const send = async (message: string, selectedQuickReply?: string) => {
    const text = (selectedQuickReply || message).trim();
    if (!text || loading) return;

    setError(null);
    setInput("");
    setTurns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    setLoading(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "finansman",
          conversationId,
          message: message || selectedQuickReply || text,
          selectedQuickReply,
        }),
      });
      const data = (await res.json()) as FinansmanChatResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Yanıt alınamadı");
      }
      if (data.conversationId) setConversationId(data.conversationId);
      setLatest(data);
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.assistantMessage,
          payload: data,
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Bazı banka kaynakları şu anda doğrulanamadığı için karşılaştırma tamamlanamadı.",
      );
    } finally {
      setLoading(false);
    }
  };

  const onFlexSelect = (row: FlexibleMatchRow) => {
    if (row.flexibilityType === "amount" && row.offeredAmountTl != null) {
      void send(
        `Tutarı ${row.offeredAmountTl} yap`,
        `flex:amount:${row.offeredAmountTl}`,
      );
      return;
    }
    if (row.flexibilityType === "term" && row.termMonths != null) {
      void send(
        `Vadeyi ${row.termMonths} ay yap`,
        `flex:term:${row.termMonths}`,
      );
      return;
    }
    if (row.flexibilityType === "new_customer") {
      void send("Yeni müşteri olarak başvuracağım", "flex:new_customer");
      return;
    }
    void send(row.requiredChangeDescription);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const freshnessLabel = latest?.summary.freshnessLabel || "Doğrulanamadı";
  const dataAsOf = latest?.summary.dataAsOf
    ? formatDateTr(latest.summary.dataAsOf)
    : "Henüz kontrol yok";

  const exactSummary =
    latest && latest.exactMatches.length > 0
      ? `${latest.summary.totalParticipationBanks} katılım bankası içinde koşullarınıza uyan ${latest.summary.exactMatchBankCount} seçenek çıktı.`
      : "";

  const lastQuick =
    turns.length > 0
      ? turns[turns.length - 1]?.payload?.quickReplies
      : undefined;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-txt">
            Finansman Asistanı
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-txt-secondary">
            Ne aradığınızı yazın, uygun seçenekleri birlikte bulalım.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-txt-muted">Veriler son kontrol</p>
          <p className="text-sm text-txt">{dataAsOf}</p>
          <span
            className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${freshnessBadgeClass(freshnessLabel)}`}
          >
            {freshnessLabel}
          </span>
        </div>
      </header>

      <div
        ref={listRef}
        className="max-h-[min(52vh,28rem)] min-h-56 overflow-y-auto rounded-xl border border-line bg-surface p-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={loading}
      >
        {turns.length === 0 && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <Bot className="h-4.5 w-4.5" aria-hidden />
              </div>
              <div className="rounded-2xl rounded-tl-md bg-sunken px-3.5 py-2.5 text-sm leading-relaxed text-txt whitespace-pre-wrap">
                {WELCOME}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-12">
              {STARTER_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void send(chip)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-txt transition-colors hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => (
          <div
            key={t.id}
            className={`mb-3 flex gap-3 ${t.role === "user" ? "justify-end" : ""}`}
          >
            {t.role === "assistant" && (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <Bot className="h-4.5 w-4.5" aria-hidden />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                t.role === "user"
                  ? "rounded-tr-md bg-brand-600 text-white"
                  : "rounded-tl-md bg-sunken text-txt"
              }`}
            >
              {t.text}
            </div>
          </div>
        ))}

        {loading && (
          <div
            className="flex items-center gap-2 text-sm text-txt-muted"
            role="status"
            aria-label="Finansman seçenekleri hazırlanıyor"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Seçenekler hazırlanıyor…
          </div>
        )}
      </div>

      {lastQuick && lastQuick.length > 0 && !loading && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Hızlı yanıtlar"
        >
          {lastQuick.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => void send(q.value, q.value)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-txt hover:bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Mesajınız
        </label>
        <textarea
          id={inputId}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Örn. 200 bin TL ihtiyaç finansmanı, 24 ay…"
          className="min-h-11 flex-1 resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-txt placeholder:text-txt-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:focus:ring-brand-900"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 self-end rounded-xl bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          aria-label="Mesaj gönder"
        >
          <Send className="h-4 w-4" aria-hidden />
          Gönder
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-risk-700 dark:text-risk-300">
          {error}
        </p>
      )}

      {latest?.exactMatches && latest.exactMatches.length > 0 && (
        <ExactTable
          rows={latest.exactMatches}
          summaryText={exactSummary}
          onCompareAdd={(id) =>
            setCompareIds((prev) =>
              prev.includes(id) ? prev : [...prev, id],
            )
          }
        />
      )}

      {latest?.flexibleMatches && latest.flexibleMatches.length > 0 && (
        <FlexTable rows={latest.flexibleMatches} onSelect={onFlexSelect} />
      )}

      {(latest?.warnings?.length || latest?.citations?.length) && (
        <section className="mt-2 rounded-xl border border-line bg-sunken/50 p-4">
          <h2 className="text-sm font-semibold text-txt">
            Kaynaklar ve açıklamalar
          </h2>
          {latest.warnings?.length > 0 && (
            <div className="mt-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-warn-800 dark:text-warn-200">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Veri Uyarıları
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs text-txt-secondary">
                {latest.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {latest.citations?.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-txt-secondary">
              {groupCitations(latest.citations).map((c) => (
                <li key={c.key}>
                  <span className="font-mono text-[10px] text-txt-muted">
                    {c.ids.map((id) => `[${id}]`).join("")}
                  </span>{" "}
                  {c.bankName} —{" "}
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                  >
                    {c.hostLabel}
                  </a>{" "}
                  ({formatDateTr(c.sourceCheckedAt)})
                </li>
              ))}
            </ul>
          )}
          {compareIds.length > 0 && (
            <p className="mt-2 text-xs text-txt-muted">
              Karşılaştırmaya eklenen: {compareIds.length} ürün
            </p>
          )}
        </section>
      )}
    </div>
  );
};

export default FinansmanAsistaniView;
