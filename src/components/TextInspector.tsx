import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Play, RotateCcw, AlertTriangle, FileText, BookOpenCheck, PenLine } from 'lucide-react';
import { kanitlariHizala, terimOzeti } from '../nlp';

interface TextInspectorProps {
  text: string;
  setText: (t: string) => void;
  onExtract: () => void;
  isLoading: boolean;
  highlightSentence?: string | null;
  /** Alan anahtarı → kanıt cümlesi eşlemesi; metin içi vurgulama için */
  evidences?: Record<string, string>;
  /** Metindeki vurgulu cümleye tıklanınca ilgili alanı işaretle (çift yönlü bağ) */
  onSelectEvidence?: (key: string | null) => void;
  /** Şu an seçili kanıt anahtarı */
  activeEvidenceKey?: string | null;
}

interface Segment {
  text: string;
  key?: string;
  /** Hizalama güveni (1 = birebir eşleşme) */
  skor?: number;
  yontem?: 'birebir' | 'normalize' | 'cumle-ortusmesi';
}

/**
 * Kanıt alıntılarını ham metin içinde konumlandırıp çakışmasız parçalara böler.
 * Konumlandırma NLP katmanındaki hizalayıcıya devredilmiştir: birebir arama
 * başarısız olduğunda normalize edilmiş metin, o da olmazsa cümle düzeyinde
 * belirteç örtüşmesi kullanılır.
 */
const buildSegments = (text: string, evidences: Record<string, string>): Segment[] => {
  const hizalanmis = kanitlariHizala(evidences, text);

  const segments: Segment[] = [];
  let cursor = 0;
  hizalanmis.forEach((kanit) => {
    if (kanit.baslangic < cursor) return;
    if (kanit.baslangic > cursor) segments.push({ text: text.slice(cursor, kanit.baslangic) });
    segments.push({
      text: text.slice(kanit.baslangic, kanit.bitis),
      key: kanit.alan,
      skor: kanit.skor,
      yontem: kanit.yontem,
    });
    cursor = kanit.bitis;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });

  return segments;
};

export const TextInspector: React.FC<TextInspectorProps> = ({
  text,
  setText,
  onExtract,
  isLoading,
  highlightSentence,
  evidences,
  onSelectEvidence,
  activeEvidenceKey,
}) => {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const activeMarkRef = useRef<HTMLButtonElement | null>(null);

  /**
   * Konvansiyonel terim tespiti — NLP katmanındaki sözlükbirim eşleyiciye
   * devredilmiştir. Önceki uygulama `toLowerCase()` kullandığı için büyük
   * harfli metinlerde ("FAİZ ORANI") sessizce başarısız oluyordu.
   */
  const conventionalTermsDetected = useMemo(() => terimOzeti(text), [text]);

  const segments = useMemo(
    () => (evidences && Object.keys(evidences).length > 0 ? buildSegments(text, evidences) : [{ text }]),
    [text, evidences],
  );

  // Kanıt seçildiğinde okuma moduna dön ve vurguyu görünüme kaydır
  useEffect(() => {
    if (!highlightSentence) return;
    setMode('read');
    const id = window.setTimeout(() => {
      activeMarkRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }, 60);
    return () => window.clearTimeout(id);
  }, [highlightSentence, activeEvidenceKey, reduceMotion]);

  const isMarkActive = (key?: string) => {
    if (!key) return false;
    if (activeEvidenceKey) return key === activeEvidenceKey;
    return Boolean(highlightSentence && evidences?.[key]?.trim() === highlightSentence.trim());
  };

  const markedCount = segments.filter((s) => s.key).length;

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-raised sm:p-5">
      {/* Başlık satırı */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h2 className="text-sm font-medium text-txt">Kaynak metin</h2>
          <span className="tnum font-mono text-xs text-txt-muted">{text.length} karakter</span>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-line bg-sunken p-1">
          <button
            type="button"
            onClick={() => setMode('read')}
            aria-pressed={mode === 'read'}
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${
              mode === 'read' ? 'bg-surface text-txt shadow-flat' : 'text-txt-secondary hover:text-txt'
            }`}
          >
            <BookOpenCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Okuma</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('edit')}
            aria-pressed={mode === 'edit'}
            className={`flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${
              mode === 'edit' ? 'bg-surface text-txt shadow-flat' : 'text-txt-secondary hover:text-txt'
            }`}
          >
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Düzenleme</span>
          </button>
        </div>
      </div>

      {/* Konvansiyonel terim uyarısı */}
      {conventionalTermsDetected.length > 0 && (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-warn-200 bg-warn-50 p-3 text-xs text-warn-900 dark:border-warn-800 dark:bg-warn-950 dark:text-warn-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn-600 dark:text-warn-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">
              Konvansiyonel terim tespit edildi ({conventionalTermsDetected.length})
            </p>
            <p className="mt-0.5 leading-relaxed text-warn-800 dark:text-warn-200">
              Bu terimler çıkarımda katılım karşılıklarına dönüştürülür
              (<code className="font-mono">terim_esleme_uygulandi: true</code>).
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {conventionalTermsDetected.map((item) => (
                <li
                  key={item.orig}
                  className="rounded border border-warn-200 bg-warn-100 px-2 py-0.5 font-mono text-xs dark:border-warn-800 dark:bg-warn-900"
                >
                  <span className="line-through text-warn-700 dark:text-warn-300">{item.orig}</span>
                  <span aria-hidden="true"> → </span>
                  <span className="text-brand-800 dark:text-brand-300">{item.mapped}</span>
                  {item.adet > 1 && (
                    <span className="tnum ml-1 text-warn-700 dark:text-warn-300">×{item.adet}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Metin gövdesi */}
      <div className="relative mt-3 min-h-60 flex-1">
        {mode === 'edit' ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Kampanya metni"
            placeholder="Katılım bankası kampanya veya ürün metnini buraya yapıştırın."
            className="h-full min-h-60 w-full resize-none rounded-lg border border-line bg-sunken p-4 text-sm leading-relaxed text-txt outline-none transition-colors placeholder:text-txt-muted focus:border-brand-500"
          />
        ) : (
          <div
            className="h-full max-h-[26rem] min-h-60 overflow-y-auto rounded-lg border border-line bg-sunken p-4 text-sm leading-relaxed whitespace-pre-wrap text-txt"
            tabIndex={0}
            role="region"
            aria-label="Kaynak metin, kanıt alıntıları vurgulanmış"
          >
            {text.trim().length === 0 ? (
              <p className="text-txt-muted">
                Metin boş. Düzenleme moduna geçip kampanya metnini yapıştırın.
              </p>
            ) : (
              segments.map((segment, idx) =>
                segment.key ? (
                  <button
                    key={`${segment.key}-${idx}`}
                    ref={isMarkActive(segment.key) ? activeMarkRef : undefined}
                    type="button"
                    onClick={() =>
                      onSelectEvidence?.(isMarkActive(segment.key) ? null : (segment.key as string))
                    }
                    aria-pressed={isMarkActive(segment.key)}
                    title="Bu kanıta bağlı alanı işaretle"
                    className={`evidence-mark cursor-pointer text-left transition-shadow ${
                      isMarkActive(segment.key)
                        ? 'evidence-sweep ring-2 ring-brand-500'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    {segment.text}
                  </button>
                ) : (
                  <span key={idx}>{segment.text}</span>
                ),
              )
            )}
          </div>
        )}
      </div>

      {/* Eylem satırı */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex items-center gap-3 text-xs text-txt-secondary">
          {markedCount > 0 && mode === 'read' ? (
            <span>
              <span className="tnum font-mono text-txt">{markedCount}</span> kanıt alıntısı metinde
              işaretli
            </span>
          ) : (
            <span>Şema uyumlu veri çıkarımı</span>
          )}
          {text.length > 0 && (
            <button
              type="button"
              onClick={() => setText('')}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-txt-muted transition-colors hover:bg-sunken hover:text-txt"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Temizle</span>
            </button>
          )}
        </div>

        <motion.button
          type="button"
          onClick={onExtract}
          disabled={isLoading || !text.trim()}
          whileTap={reduceMotion || isLoading ? undefined : { scale: 0.98 }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-medium text-white shadow-raised transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                aria-hidden="true"
              />
              <span>Çıkarılıyor…</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              <span>Veri çıkar</span>
              <kbd className="ml-1 hidden rounded border border-white/30 px-1.5 py-0.5 font-mono text-xs text-white/80 sm:inline">
                ⌘↵
              </kbd>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
};
