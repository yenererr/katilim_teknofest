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
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  Radio,
} from "lucide-react";
import { useSpeech } from "../hooks/useSpeech";
import { WELCOME_MESSAGE } from "../lib/assistantPersona";
import { ASSISTANT_MASCOT } from "../lib/brand";

const AGENT_MASCOT = ASSISTANT_MASCOT;
const WELCOME_TURN_ID = "welcome-assistant";

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
  actions?: Array<{
    type: "navigate";
    href: string;
    label: string;
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
    const parts = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
    const rendered = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={j} className="font-semibold text-txt">
            {part.slice(2, -2)}
          </strong>
        );
      }
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        return (
          <a
            key={j}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300"
          >
            {link[1]}
          </a>
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
    value: "200.000 TL ihtiyaç finansmanı, 24 ay",
    color: "text-brand-600 dark:text-brand-400",
  },
  {
    icon: BadgePercent,
    label: "Neler yapabilirsin?",
    value: "Neler yapabilirsin?",
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
    <div className="group rounded-xl border border-line bg-surface">
      <div className="flex items-start gap-3 p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-txt">{row.bankName}</p>
          <p className="text-xs text-txt-secondary">{row.productName}</p>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs sm:grid-cols-4">
            <div>
              <p className="text-[11px] text-txt-muted">Kâr payı</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-txt">
                {formatRate(row.profitRate, row.ratePeriod)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-txt-muted">Aylık ödeme</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-txt">
                {row.calculationAvailable
                  ? formatTl(row.estimatedMonthlyPaymentTl)
                  : "Teklif alınmalı"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-txt-muted">Toplam ödeme</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums text-txt">
                {row.calculationAvailable
                  ? formatTl(row.estimatedTotalPaymentTl)
                  : "Teklif alınmalı"}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-txt-muted">Tahsis ücreti</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums text-txt">
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
  /** Sayfa veya sağ alt köşe sohbet paneli. */
  variant?: "page" | "widget";
  /** Ödeme planı / Hesaplama yönlendirmesi */
  onNavigate?: (href: string) => void;
};

export const FinansmanAsistaniView: React.FC<FinansmanAsistaniViewProps> = ({
  initialQuestion,
  variant = "page",
  onNavigate,
}) => {
  const isWidget = variant === "widget";
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>(() => [
    { id: WELCOME_TURN_ID, role: "assistant", text: WELCOME_MESSAGE },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState(() =>
    crypto.randomUUID(),
  );
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Kullanıcı sohbet dışına tıklayana kadar imleç kutuda kalsın. */
  const preferInputFocus = useRef(true);
  const inputId = useId();
  const lastInitialQuestion = useRef<string | null>(null);

  const {
    state: speechState,
    error: speechError,
    audioLevel,
    autoPlayTTS,
    setAutoPlayTTS,
    startListening,
    stopListening,
    speakText,
    stopAudioPlayback,
  } = useSpeech();

  const focusInput = () => {
    if (!preferInputFocus.current) return;
    // disabled/readOnly geçişi ve DOM güncellemesi sonrası odakla
    requestAnimationFrame(() => {
      if (!preferInputFocus.current) return;
      inputRef.current?.focus({ preventScroll: true });
    });
  };

  useEffect(() => {
    preferInputFocus.current = true;
    focusInput();
  }, []);

  useEffect(() => {
    if (!loading) focusInput();
  }, [loading, turns.length]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      preferInputFocus.current = Boolean(
        root && root.contains(e.target as Node),
      );
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  useEffect(() => {
    if (isWidget) {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, loading, isWidget]);

  useEffect(() => {
    const soru = initialQuestion?.trim();
    if (!soru) return;
    if (lastInitialQuestion.current === soru) return;
    lastInitialQuestion.current = soru;
    void send(soru);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const navigateFromAssistant = (href: string) => {
    if (onNavigate) {
      onNavigate(href);
      return;
    }
    if (href.startsWith("#")) {
      window.location.hash = href.slice(1);
    } else {
      window.location.assign(href);
    }
  };

  const send = async (message: string, selectedQuickReply?: string) => {
    const navValue = (selectedQuickReply || message).trim();
    if (navValue.startsWith("__navigate__:")) {
      navigateFromAssistant(navValue.slice("__navigate__:".length));
      return;
    }

    const text = (selectedQuickReply || message).trim();
    if (!text || loading) return;
    const isHiddenContext = /^FINDEKS_RAPOR_BAGLAMI\b/.test(text);
    const visibleText = isHiddenContext ? "Findeks raporumu yorumla" : text;

    setError(null);
    setInput("");
    setTurns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text: visibleText },
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
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.assistantMessage,
          payload: data,
        },
      ]);
      if (autoPlayTTS && data.assistantMessage) {
        void speakText(data.assistantMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı hatası");
    } finally {
      setLoading(false);
      preferInputFocus.current = true;
      focusInput();
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

  const showStarters =
    turns.length === 1 && turns[0]?.id === WELCOME_TURN_ID && !loading;

  return (
    <div
      ref={rootRef}
      className={
        isWidget
          ? "flex h-full min-h-0 flex-col overflow-hidden"
          : "mx-auto max-w-4xl pb-24"
      }
    >
      <div
        ref={listRef}
        className={
          isWidget
            ? "min-h-0 flex-1 overflow-y-auto px-2 py-3"
            : "overflow-visible px-2 py-4 sm:px-4"
        }
      >
        {turns.map((t, turnIndex) => {
          const payload = t.payload;
          const hasTurnResults =
            t.role === "assistant" &&
            payload &&
            (payload.exactMatches.length > 0 ||
              payload.flexibleMatches.length > 0);
          const isLatestAssistant =
            t.role === "assistant" && turnIndex === turns.length - 1;

          if (t.role === "user") {
            return (
              <div key={t.id} className="mb-4 flex justify-end">
                <div className="max-w-[min(100%,42rem)] rounded-2xl rounded-tr-md bg-brand-600 px-3.5 py-2.5 text-sm leading-relaxed text-white">
                  {t.text}
                </div>
              </div>
            );
          }

          return (
            <div key={t.id} className="mb-5 flex gap-2.5">
              <img
                src={AGENT_MASCOT}
                alt=""
                className="mt-0.5 h-8 w-8 shrink-0 object-contain"
              />
              <div className="min-w-0 flex-1 space-y-3">
                {/* Tek sohbet kartı: metin + seçenekler birlikte */}
                <div className="rounded-2xl rounded-tl-md border border-line bg-surface text-txt shadow-flat">
                  <div className="flex items-start justify-between gap-2 px-3.5 pt-2.5">
                    <div className="min-w-0 flex-1 text-sm leading-relaxed">
                      {renderMarkdown(t.text)}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (speechState === "speaking") {
                          stopAudioPlayback();
                        } else {
                          void speakText(t.text);
                        }
                      }}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-txt-muted transition-colors hover:bg-sunken hover:text-txt"
                      title={speechState === "speaking" ? "Sesli okumayı durdur" : "Sesli oku"}
                      aria-label={speechState === "speaking" ? "Sesli okumayı durdur" : "Sesli oku"}
                    >
                      {speechState === "speaking" ? (
                        <Square className="h-3.5 w-3.5 text-brand-600 fill-brand-600 dark:text-brand-400" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {hasTurnResults && payload && (
                    <div className="space-y-2.5 border-t border-line px-3.5 py-3">
                      {payload.exactMatches.length > 0 && (
                        <p className="text-xs font-medium text-txt-muted">
                          {payload.summary.exactMatchBankCount} uygun seçenek
                        </p>
                      )}
                      {payload.exactMatches.map((r, i) => (
                        <MatchCard key={r.productId} row={r} rank={i + 1} />
                      ))}

                      {payload.flexibleMatches.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <p className="text-xs font-medium text-txt-muted">
                            Esnek alternatifler
                          </p>
                          <div
                            className={`grid gap-2 ${isWidget ? "grid-cols-1" : "sm:grid-cols-2"}`}
                          >
                            {payload.flexibleMatches.map((r) => (
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
                </div>

                {isLatestAssistant && !loading && payload && (
                  <div className="space-y-2.5">
                    {(payload.warnings?.length > 0 ||
                      payload.citations?.length > 0) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-txt-muted">
                        {payload.warnings.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-warn-700 dark:text-warn-300">
                            <AlertTriangle className="h-3 w-3" />
                            {payload.warnings.length} uyarı
                          </span>
                        )}
                        {groupCitations(payload.citations).map((c) => (
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
                    )}

                    {lastQuick && lastQuick.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {lastQuick.map((q) => (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => void send(q.value, q.value)}
                            className={`min-h-11 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                              q.value.startsWith("__navigate__:")
                                ? "border-brand-400 bg-brand-50 text-brand-800 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-200"
                                : "border-line bg-sunken text-txt hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950"
                            }`}
                          >
                            {q.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {payload.actions && payload.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {payload.actions.map((a) => (
                          <button
                            key={a.href + a.label}
                            type="button"
                            onClick={() => navigateFromAssistant(a.href)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-brand-700"
                          >
                            {a.label}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {showStarters && (
          <div
            className={`mb-6 mx-auto grid w-full grid-cols-2 justify-items-center ${isWidget ? "gap-2 px-1" : "max-w-xl gap-3"}`}
          >
            {STARTERS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => void send(s.value)}
                  className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-brand-950/30 ${isWidget ? "p-2.5" : "gap-2.5 p-3"}`}
                >
                  <Icon
                    className={`shrink-0 ${s.color} ${isWidget ? "h-3.5 w-3.5" : "h-4 w-4"}`}
                  />
                  <span
                    className={`font-medium text-txt ${isWidget ? "text-xs" : "text-sm"}`}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="mb-4 flex gap-2.5">
            <img
              src={AGENT_MASCOT}
              alt=""
              className="mt-0.5 h-8 w-8 shrink-0 object-contain"
            />
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 shadow-flat">
              <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
              <span className="text-sm text-txt-muted">Bakıyorum...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-xl border border-risk-200 bg-risk-50 px-4 py-2.5 text-xs text-risk-700 dark:border-risk-800 dark:bg-risk-950 dark:text-risk-300">
            {error}
          </div>
        )}

        {!isWidget && <div ref={endRef} className="h-2" aria-hidden="true" />}
      </div>

      <div
        className={
          isWidget
            ? "shrink-0 border-t border-line bg-surface px-3 py-3"
            : "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 px-3 py-3 backdrop-blur-md sm:px-4 lg:left-72"
        }
      >
        {speechError && (
          <div className="mb-3 rounded-xl border border-risk-200 bg-risk-50 px-4 py-2.5 text-xs text-risk-700 dark:border-risk-800 dark:bg-risk-950 dark:text-risk-300">
            {speechError}
          </div>
        )}

        {speechState !== "idle" && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/80 px-3.5 py-2 text-xs text-brand-900 dark:border-brand-900 dark:bg-brand-950/80 dark:text-brand-200">
            <div className="flex items-center gap-2">
              {speechState === "listening" && (
                <>
                  <Radio className="h-4 w-4 animate-pulse text-risk-500" />
                  <span>Dinleniyor... Tamamlamak için mikrofona tekrar basın.</span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="h-3 w-1 rounded-full bg-brand-500 transition-all duration-75"
                        style={{
                          height: `${Math.max(4, (audioLevel * (i * 0.25)) / 3)}px`,
                        }}
                      />
                    ))}
                  </div>
                </>
              )}
              {speechState === "transcribing" && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                  <span>Ses yazıya çevriliyor...</span>
                </>
              )}
              {speechState === "synthesizing" && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                  <span>Ses oluşturuluyor...</span>
                </>
              )}
              {speechState === "speaking" && (
                <>
                  <Volume2 className="h-4 w-4 animate-bounce text-brand-600" />
                  <span>Yanıt seslendiriliyor...</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (speechState === "listening") stopListening();
                else stopAudioPlayback();
              }}
              className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-txt hover:bg-sunken"
            >
              Durdur
            </button>
          </div>
        )}

        <form
          className={`mx-auto flex items-end gap-2 ${isWidget ? "" : "max-w-4xl"}`}
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (speechState === "listening") {
                stopListening();
              } else {
                void startListening((text) => {
                  setInput(text);
                  void send(text);
                });
              }
            }}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
              speechState === "listening"
                ? "border-risk-500 bg-risk-500 text-white animate-pulse"
                : "border-line bg-sunken text-txt-secondary hover:border-brand-300 hover:text-txt"
            }`}
            title={speechState === "listening" ? "Kaydı durdur" : "Mikrofonla konuş"}
            aria-label={speechState === "listening" ? "Kaydı durdur" : "Mikrofonla konuş"}
          >
            {speechState === "listening" ? (
              <MicOff className="h-5 w-5" />
            ) : (
              <Mic className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            )}
          </button>

          <label htmlFor={inputId} className="sr-only">
            Mesajınız
          </label>
          <textarea
            ref={inputRef}
            id={inputId}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              preferInputFocus.current = true;
            }}
            onBlur={() => {
              if (preferInputFocus.current) focusInput();
            }}
            rows={1}
            placeholder="Sorunuzu yazın veya konuşun..."
            className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-line bg-sunken px-3.5 py-2.5 text-sm text-txt placeholder:text-txt-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:focus:ring-brand-900 read-only:opacity-80"
            readOnly={loading || speechState === "listening" || speechState === "transcribing"}
            aria-busy={loading || speechState === "transcribing"}
          />

          <button
            type="button"
            onClick={() => setAutoPlayTTS(!autoPlayTTS)}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors ${
              autoPlayTTS
                ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                : "border-line bg-sunken text-txt-muted hover:text-txt"
            }`}
            title={autoPlayTTS ? "Sesli yanıtlar açık" : "Sesli yanıtlar kapalı"}
            aria-label={autoPlayTTS ? "Sesli yanıtlar açık" : "Sesli yanıtlar kapalı"}
          >
            {autoPlayTTS ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 disabled:opacity-40 dark:ring-offset-surface"
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
