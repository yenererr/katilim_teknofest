import React, { useEffect, useId, useRef, useState } from "react";
import {
  ExternalLink,
  Loader2,
  Send,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ArrowRight,
  Building2,
  TrendingDown,
  BadgePercent,
  User,
} from "lucide-react";

const AGENT_LOGO = "/logos/katilim-agent.png";

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

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type GroupedCitation = {
  key: string;
  ids: number[];
  bankName: string;
  sourceUrl: string;
  hostLabel: string;
  sourceCheckedAt: string;
};

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "resmî kaynak";
  }
}

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

/** Markdown bold (**text**) ve satır sonlarını HTML'e çevirir. */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={j} className="font-semibold text-txt">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
    return (
      <React.Fragment key={i}>
        {i > 0 && <br />}
        {rendered}
      </React.Fragment>
    );
  });
}

/* -----------------------------------------------------------------------
   Hızlı Başlangıç Kartları
   ----------------------------------------------------------------------- */

type StarterCard = {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
};

const STARTERS: StarterCard[] = [
  {
    icon: TrendingDown,
    label: "Finansman karşılaştır",
    value: "Finansman seçeneklerini karşılaştırmak istiyorum",
    color: "text-brand-600 dark:text-brand-400",
  },
  {
    icon: BadgePercent,
    label: "Kampanyalar",
    value: "Aktif kampanyaları göster",
    color: "text-accent-600 dark:text-accent-400",
  },
  {
    icon: User,
    label: "Yeni müşteri avantajları",
    value: "Yeni müşterilere özel avantajlar neler",
    color: "text-info-600 dark:text-info-400",
  },
  {
    icon: Building2,
    label: "Katılım bankaları",
    value: "Hangi katılım bankaları var",
    color: "text-ink-600 dark:text-ink-400",
  },
];

/* -----------------------------------------------------------------------
   Sonuç Kartları — ExactMatch ve FlexibleMatch
   ----------------------------------------------------------------------- */

const MatchCard: React.FC<{
  row: FinancingMatchRow;
  rank: number;
}> = ({ row, rank }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="group rounded-xl border border-line bg-surface shadow-flat transition-shadow hover:shadow-raised">
      <div className="flex items-start gap-3 p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-txt">{row.bankName}</p>
          <p className="text-xs text-txt-secondary">{row.productName}</p>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <div>
              <p className="text-txt-muted">Kâr payı</p>
              <p className="font-medium text-txt">
                {formatRate(row.profitRate, row.ratePeriod)}
              </p>
            </div>
            <div>
              <p className="text-txt-muted">Aylık ödeme</p>
              <p className="font-medium text-txt">
                {row.calculationAvailable
                  ? formatTl(row.estimatedMonthlyPaymentTl)
                  : "Teklif alınmalı"}
              </p>
            </div>
            <div>
              <p className="text-txt-muted">Toplam ödeme</p>
              <p className="font-medium text-txt">
                {row.calculationAvailable
                  ? formatTl(row.estimatedTotalPaymentTl)
                  : "Teklif alınmalı"}
              </p>
            </div>
            <div>
              <p className="text-txt-muted">Tahsis ücreti</p>
              <p className="font-medium text-txt">
                {row.allocationFeeTl == null
                  ? "Belirtilmemiş"
                  : row.allocationFeeTl === 0
                    ? "Yok"
                    : formatTl(row.allocationFeeTl)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
        <div className="flex items-center gap-3 text-[11px] text-txt-muted">
          {row.campaignEnd && (
            <span>Son: {formatDateShort(row.campaignEnd)}</span>
          )}
          <span>Kontrol: {formatDateShort(row.sourceCheckedAt)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-txt-secondary hover:bg-sunken"
          >
            {open ? "Gizle" : "Detay"}
            {open ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950"
          >
            Kaynak
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-sunken/50 px-4 py-3 text-xs text-txt-secondary">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <div>
              <dt className="text-txt-muted">Tutar</dt>
              <dd>{formatTl(row.requestedAmountTl)}</dd>
            </div>
            <div>
              <dt className="text-txt-muted">Vade</dt>
              <dd>{row.termMonths} ay</dd>
            </div>
            <div>
              <dt className="text-txt-muted">Müşteri koşulu</dt>
              <dd>{row.customerCondition || "Belirtilmemiş"}</dd>
            </div>
          </dl>
          {row.calculationWarning && (
            <p className="mt-2 text-warn-700 dark:text-warn-300">
              {row.calculationWarning}
            </p>
          )}
          {row.evidence.length > 0 && (
            <ul className="mt-2 list-disc pl-4">
              {row.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const FlexCard: React.FC<{
  row: FlexibleMatchRow;
  onSelect: () => void;
}> = ({ row, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    className="w-full rounded-xl border border-dashed border-line bg-surface p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:hover:bg-brand-950/30"
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-txt">{row.bankName}</p>
        <p className="text-xs text-txt-secondary">{row.campaignName}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-brand-500" />
    </div>
    <p className="mt-2 text-xs text-brand-700 dark:text-brand-300">
      {row.requiredChangeDescription}
    </p>
    {row.profitRate != null ? (
      <p className="mt-1 text-xs text-txt-muted">
        {formatRate(row.profitRate, "unknown")}
      </p>
    ) : (
      <p className="mt-1 text-xs text-txt-muted">
        {row.opportunityDescription}
      </p>
    )}
  </button>
);

/* -----------------------------------------------------------------------
   Ana Bileşen
   ----------------------------------------------------------------------- */

type FinansmanAsistaniViewProps = {
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
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const bootstrapped = useRef(false);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
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
      setError(err instanceof Error ? err.message : "Bağlantı hatası");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
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

  const lastQuick =
    turns.length > 0
      ? turns[turns.length - 1]?.payload?.quickReplies
      : undefined;

  const hasResults =
    latest &&
    (latest.exactMatches.length > 0 || latest.flexibleMatches.length > 0);

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-4xl flex-col">
      {/* Chat Area */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-2 py-4 sm:px-4"
      >
        {/* Boş durum — hoş geldin */}
        {turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
            <div className="flex flex-col items-center gap-3">
              <img
                src={AGENT_LOGO}
                alt="Katılım Bankası Agent"
                className="h-16 w-16 rounded-2xl object-contain shadow-raised"
              />
              <div className="text-center">
                <h1 className="text-xl font-semibold tracking-tight text-txt">
                  KatılımFinans Asistanı
                </h1>
                <p className="mt-1 text-sm text-txt-secondary">
                  Katılım bankacılığı hakkında her şeyi sorabilirsiniz
                </p>
              </div>
            </div>

            <div className="grid w-full max-w-lg grid-cols-2 gap-2.5">
              {STARTERS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => void send(s.value)}
                    className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-left transition-all hover:border-brand-300 hover:shadow-raised"
                  >
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.color}`} />
                    <span className="text-sm font-medium text-txt">
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Konuşma geçmişi */}
        {turns.map((t) => (
          <div
            key={t.id}
            className={`mb-4 flex gap-2.5 ${t.role === "user" ? "justify-end" : ""}`}
          >
            {t.role === "assistant" && (
              <img
                src={AGENT_LOGO}
                alt=""
                className="mt-1 h-7 w-7 shrink-0 rounded-full object-contain"
              />
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                t.role === "user"
                  ? "rounded-tr-md bg-brand-600 text-white"
                  : "rounded-tl-md border border-line bg-surface text-txt shadow-flat"
              }`}
            >
              {t.role === "assistant" ? renderMarkdown(t.text) : t.text}
            </div>
          </div>
        ))}

        {/* Yükleniyor */}
        {loading && (
          <div className="mb-4 flex gap-2.5">
            <img
              src={AGENT_LOGO}
              alt=""
              className="mt-1 h-7 w-7 shrink-0 rounded-full object-contain"
            />
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-flat">
              <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
              <span className="text-sm text-txt-muted">Bakıyorum...</span>
            </div>
          </div>
        )}
      </div>

      {/* Sonuç kartları — chat alanının altında */}
      {hasResults && (
        <div className="border-t border-line bg-sunken/30 px-2 py-4 sm:px-4">
          {latest.exactMatches.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-xs font-medium text-txt-muted">
                {latest.summary.exactMatchBankCount} uygun seçenek
              </p>
              {latest.exactMatches.map((r, i) => (
                <MatchCard key={r.productId} row={r} rank={i + 1} />
              ))}
            </div>
          )}

          {latest.flexibleMatches.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-txt-muted">
                Esnek alternatifler
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {latest.flexibleMatches.map((r) => (
                  <FlexCard
                    key={r.campaignId}
                    row={r}
                    onSelect={() => onFlexSelect(r)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Kaynaklar ve uyarılar — kompakt şerit */}
      {latest &&
        (latest.warnings?.length > 0 || latest.citations?.length > 0) && (
          <div className="border-t border-line bg-surface px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-txt-muted">
              {latest.warnings.length > 0 && (
                <span className="inline-flex items-center gap-1 text-warn-700 dark:text-warn-300">
                  <AlertTriangle className="h-3 w-3" />
                  {latest.warnings.length} uyarı
                </span>
              )}
              {groupCitations(latest.citations).map((c) => (
                <a
                  key={c.key}
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  {c.bankName}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ))}
            </div>
          </div>
        )}

      {/* Hızlı yanıtlar */}
      {lastQuick && lastQuick.length > 0 && !loading && (
        <div className="flex flex-wrap gap-1.5 border-t border-line bg-surface px-4 py-2.5">
          {lastQuick.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => void send(q.value, q.value)}
              className="rounded-full border border-line bg-sunken px-3 py-1 text-xs font-medium text-txt transition-colors hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {/* Hata */}
      {error && (
        <div className="border-t border-risk-200 bg-risk-50 px-4 py-2.5 text-xs text-risk-700 dark:border-risk-800 dark:bg-risk-950 dark:text-risk-300">
          {error}
        </div>
      )}

      {/* Giriş alanı */}
      <div className="border-t border-line bg-surface px-3 py-3 sm:px-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Mesajınız
          </label>
          <textarea
            ref={inputRef}
            id={inputId}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Sorunuzu yazın..."
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line bg-sunken px-3.5 py-2.5 text-sm text-txt placeholder:text-txt-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:focus:ring-brand-900"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
            aria-label="Gönder"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default FinansmanAsistaniView;
