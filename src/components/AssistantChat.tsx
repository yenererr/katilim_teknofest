import React, { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  Radio,
} from "lucide-react";
import { useSpeech } from "../hooks/useSpeech";

export type AssistantCitation = {
  id: number;
  title?: string;
  bankName: string;
  sourceUrl: string;
  sourceCheckedAt: string;
  evidenceText: string;
};

type GroupedCitation = {
  key: string;
  ids: number[];
  title: string;
  bankName: string;
  sourceUrl: string;
  hostLabel: string;
  checkedLabel: string;
  evidenceText: string;
};

/** Kaynak URL'sinden okunabilir alan adı üretir (www. ve yol atılır). */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Resmî kaynak";
  }
}

function checkedLabel(iso: string): string {
  if (!iso) return "bilinmiyor";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "bilinmiyor";
  return new Date(t).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Aynı sayfadan gelen parçalar tek kart altında toplanır; aksi halde
 * aynı banka için birebir aynı görünen 3-4 kart yan yana çıkıyordu.
 */
function groupCitations(citations: AssistantCitation[]): GroupedCitation[] {
  const map = new Map<string, GroupedCitation>();
  for (const c of citations) {
    const key = `${c.bankName}|${c.sourceUrl}|${c.title ?? ""}`;
    const mevcut = map.get(key);
    if (mevcut) {
      mevcut.ids.push(c.id);
      // Farklı parçaların kanıt metinleri birleştirilir
      if (c.evidenceText && !mevcut.evidenceText.includes(c.evidenceText)) {
        mevcut.evidenceText += `\n\n${c.evidenceText}`;
      }
      continue;
    }
    map.set(key, {
      key,
      ids: [c.id],
      title: c.title?.trim() || "Kaynak sayfa alıntısı",
      bankName: c.bankName,
      sourceUrl: c.sourceUrl,
      hostLabel: hostLabel(c.sourceUrl),
      checkedLabel: checkedLabel(c.sourceCheckedAt),
      evidenceText: c.evidenceText,
    });
  }
  return [...map.values()].map((g) => ({
    ...g,
    ids: [...g.ids].sort((a, b) => a - b),
  }));
}

export type AssistantChatResponse = {
  answer: string;
  status: string;
  products: Array<{
    productId?: string;
    bankName: string;
    productName?: string;
    verifiedFields: Record<string, unknown>;
    freshnessStatus: string;
  }>;
  citations: AssistantCitation[];
  warnings: string[];
  calculation?: {
    method: string;
    inputs: Record<string, unknown>;
    result: Record<string, unknown>;
  };
  dataAsOf?: string;
  requestId?: string;
  observability?: {
    intent?: string;
    freshness_status?: string;
    validation_status?: string;
    fallback_used?: boolean;
    total_duration_ms?: number;
  };
};

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  payload?: AssistantChatResponse;
};

const FRESHNESS_BADGE: Record<string, string> = {
  FRESH: "bg-brand-50 text-brand-800 border-brand-200 dark:bg-brand-950 dark:text-brand-200",
  STALE: "bg-warn-50 text-warn-800 border-warn-200 dark:bg-warn-950 dark:text-warn-200",
  EXPIRED: "bg-risk-50 text-risk-800 border-risk-200 dark:bg-risk-950 dark:text-risk-200",
  FAILED: "bg-risk-50 text-risk-800 border-risk-200",
  UNKNOWN: "bg-sunken text-txt-muted border-line",
  MIXED: "bg-warn-50 text-warn-800 border-warn-200",
};

const SUGGESTIONS = [
  "36 ay vadede en düşük ilan edilen kâr payı oranına sahip taşıt finansmanı hangisi?",
  "Konut finansmanında tahsis ücreti alınmayan kampanyalar var mı?",
  "Kuveyt Türk ihtiyaç finansmanı şartları neler?",
];

type Props = {
  initialQuestion?: string;
};

export const AssistantChat: React.FC<Props> = ({ initialQuestion }) => {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId] = useState(() => crypto.randomUUID());
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null);
  const [forceRefresh, setForceRefresh] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const bootstrapped = useRef(false);

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

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, loading]);

  const send = async (message: string, refresh = forceRefresh) => {
    const text = message.trim();
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
          message: text,
          conversationId,
          forceRefresh: refresh,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Asistan yanıt veremedi.");
      }
      const payload = data as AssistantChatResponse;
      setTurns((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: payload.answer,
          payload,
        },
      ]);
      if (autoPlayTTS && payload.answer) {
        void speakText(payload.answer);
      }
      setForceRefresh(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bootstrapped.current) return;
    if (initialQuestion?.trim()) {
      bootstrapped.current = true;
      void send(initialQuestion.trim());
    }
  }, [initialQuestion]);

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <header className="rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
        <p className="flex items-center gap-2 text-xs text-brand-700 dark:text-brand-400">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Kanıtlı RAG asistanı
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-txt">
          Asistana Sor
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-txt-secondary">
          Yalnızca doğrulanmış canlı / Qdrant kaynakları üzerinden cevap verir.
          Tahmin etmez; kaynak URL ve son kontrol zamanını gösterir.
        </p>
      </header>

      {!turns.length && (
        <ul className="grid gap-2 sm:grid-cols-3">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => void send(s)}
                className="h-full w-full rounded-lg border border-line bg-sunken p-3 text-left text-sm text-txt-secondary transition hover:border-brand-300 hover:text-txt"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        ref={listRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-line bg-surface p-4"
        aria-live="polite"
      >
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`max-w-3xl ${turn.role === "user" ? "ml-auto" : ""}`}
          >
            <div
              className={`flex items-start justify-between gap-2 rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                turn.role === "user"
                  ? "bg-brand-600 text-white"
                  : "border border-line bg-sunken text-txt"
              }`}
            >
              <div className="flex-1">{turn.text}</div>
              {turn.role === "assistant" && (
                <button
                  type="button"
                  onClick={() => {
                    if (speechState === "speaking") {
                      stopAudioPlayback();
                    } else {
                      void speakText(turn.text);
                    }
                  }}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded text-txt-muted hover:bg-surface hover:text-txt"
                  title={speechState === "speaking" ? "Durdur" : "Sesli oku"}
                >
                  {speechState === "speaking" ? (
                    <Square className="h-3 w-3 text-brand-600 fill-brand-600" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>

            {turn.payload && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span
                    className={`rounded-md border px-2 py-0.5 ${
                      FRESHNESS_BADGE[
                        turn.payload.observability?.freshness_status || "UNKNOWN"
                      ] || FRESHNESS_BADGE.UNKNOWN
                    }`}
                  >
                    Güncellik:{" "}
                    {turn.payload.observability?.freshness_status || "UNKNOWN"}
                  </span>
                  <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-txt-muted">
                    Durum: {turn.payload.status}
                  </span>
                  {turn.payload.dataAsOf && (
                    <span className="rounded-md border border-line bg-surface px-2 py-0.5 text-txt-muted">
                      dataAsOf:{" "}
                      {new Date(turn.payload.dataAsOf).toLocaleString("tr-TR")}
                    </span>
                  )}
                </div>

                {turn.payload.warnings?.length > 0 && (
                  <ul className="space-y-1">
                    {turn.payload.warnings.map((w) => (
                      <li
                        key={w}
                        className="flex gap-2 rounded-md border border-warn-200 bg-warn-50 px-2.5 py-1.5 text-xs text-warn-900 dark:border-warn-900 dark:bg-warn-950 dark:text-warn-200"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                )}

                {turn.payload.calculation && (
                  <div className="rounded-md border border-line bg-surface p-2.5 text-xs text-txt-secondary">
                    <p className="font-medium text-txt">Karşılaştırma kriteri</p>
                    <p className="mt-1 font-mono">
                      {turn.payload.calculation.method}
                    </p>
                    {turn.payload.calculation.result?.winnerBank != null && (
                      <p className="mt-1">
                        Kod sonucu: {String(turn.payload.calculation.result.winnerBank)}{" "}
                        — {String(turn.payload.calculation.result.winnerMetric ?? "")}
                      </p>
                    )}
                  </div>
                )}

                {turn.payload.citations?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-txt-muted">
                      Kaynaklar ({groupCitations(turn.payload.citations).length})
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {groupCitations(turn.payload.citations).map((c) => (
                        <li key={c.key}>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCitation((id) =>
                                id === c.key ? null : c.key,
                              )
                            }
                            className="flex w-full flex-col gap-1 rounded-lg border border-line bg-surface p-3 text-left transition hover:border-brand-300"
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="text-xs font-medium leading-snug text-txt">
                                {c.title}
                              </span>
                              <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-txt-muted">
                                {c.ids.map((id) => `#${id}`).join(" ")}
                              </span>
                            </span>
                            <span className="truncate text-[11px] text-txt-secondary">
                              {c.bankName}
                            </span>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-txt-muted">
                              <span>Son kontrol: {c.checkedLabel}</span>
                              <a
                                href={c.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-300"
                              >
                                {c.hostLabel} <ExternalLink className="h-3 w-3" />
                              </a>
                            </span>
                            {expandedCitation === c.key && (
                              <span className="mt-1 border-t border-line pt-2 text-xs leading-relaxed text-txt-secondary">
                                {c.evidenceText}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <p className="flex items-center gap-2 text-sm text-txt-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Kaynaklar ve yapılandırılmış veri kontrol ediliyor…
          </p>
        )}
      </div>

      {speechError && (
        <p className="flex items-center gap-2 rounded-lg border border-risk-200 bg-risk-50 px-3 py-2 text-sm text-risk-800">
          <ShieldAlert className="h-4 w-4" />
          {speechError}
        </p>
      )}

      {speechState !== "idle" && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-900 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-200">
          <div className="flex items-center gap-2">
            {speechState === "listening" && (
              <>
                <Radio className="h-4 w-4 animate-pulse text-risk-500" />
                <span>Dinleniyor... Tamamlamak için mikrofona tekrar basın. (Ses: %{audioLevel})</span>
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
                <span>Seslendiriliyor...</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (speechState === "listening") stopListening();
              else stopAudioPlayback();
            }}
            className="rounded border border-line bg-surface px-2 py-0.5 text-[11px] font-medium"
          >
            Durdur
          </button>
        </div>
      )}

      <form
        className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-raised sm:flex-row sm:items-end"
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
          className={`inline-flex items-center justify-center rounded-lg border p-2 text-sm transition-colors ${
            speechState === "listening"
              ? "border-risk-500 bg-risk-500 text-white animate-pulse"
              : "border-line bg-sunken text-txt-secondary hover:text-txt"
          }`}
          title={speechState === "listening" ? "Kaydı durdur" : "Mikrofonla konuş"}
        >
          {speechState === "listening" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5 text-brand-600" />}
        </button>

        <label className="min-w-0 flex-1">
          <span className="sr-only" id={inputId}>
            Sorunuz
          </span>
          <textarea
            aria-labelledby={inputId}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Örn. 36 ay vadeli taşıt finansmanında en düşük ilan edilen kâr payı hangisi?"
            className="w-full resize-none rounded-lg border border-line bg-sunken px-3 py-2 text-sm text-txt outline-none ring-brand-500 focus:ring-2"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAutoPlayTTS(!autoPlayTTS)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm ${
              autoPlayTTS
                ? "border-brand-400 bg-brand-50 text-brand-800"
                : "border-line bg-sunken text-txt-muted"
            }`}
            title={autoPlayTTS ? "Sesli yanıtlar açık" : "Sesli yanıtlar kapalı"}
          >
            {autoPlayTTS ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            type="button"
            title="İlgili kaynakları yenilemeyi dene"
            onClick={() => setForceRefresh((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${
              forceRefresh
                ? "border-brand-400 bg-brand-50 text-brand-800"
                : "border-line bg-sunken text-txt-secondary"
            }`}
          >
            <RefreshCw className="h-4 w-4" />
            Yenile
          </button>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Gönder
          </button>
        </div>
      </form>
    </div>
  );
};
