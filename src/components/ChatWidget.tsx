import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, X } from "lucide-react";
import { FinansmanAsistaniView } from "./FinansmanAsistaniView";
import { ASSISTANT_MASCOT } from "../lib/brand";

const AGENT_MASCOT = ASSISTANT_MASCOT;

type ChatWidgetProps = {
  /** Tam sayfa asistan açıkken FAB gizlenir. */
  hidden?: boolean;
  onExpand?: () => void;
  onNavigate?: (href: string) => void;
};

/** Sağ alt köşe sohbet balonu — her sayfada asistanla konuşmak için. */
export const ChatWidget: React.FC<ChatWidgetProps> = ({
  hidden = false,
  onExpand,
  onNavigate,
}) => {
  const [open, setOpen] = useState(false);
  /** Karşılama balonu — kullanıcı kapatınca bu oturumda bir daha gösterilmez. */
  const [balonGorunur, setBalonGorunur] = useState(false);
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  // Sayfa oturduktan kısa süre sonra bir kez belirir; dikkat dağıtmaması için
  // sohbet açıldığında veya kapatıldığında bir daha gösterilmez.
  useEffect(() => {
    if (hidden) return;
    try {
      if (sessionStorage.getItem('katilim-karsilama-balonu') === 'kapali') return;
    } catch {
      /* sessionStorage engelliyse balonu yine de göster */
    }
    const t = window.setTimeout(() => setBalonGorunur(true), 1200);
    return () => window.clearTimeout(t);
  }, [hidden]);

  const balonuKapat = () => {
    setBalonGorunur(false);
    try {
      sessionStorage.setItem('katilim-karsilama-balonu', 'kapali');
    } catch {
      /* yoksay */
    }
  };

  useEffect(() => {
    if (open) balonuKapat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Kapat düğmesine odaklama — yazma kutusunu çalmasın
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) fabRef.current?.blur();
  }, [open]);

  if (hidden) return null;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 hidden flex-col items-end gap-3 sm:right-6 sm:bottom-6 sm:flex">
      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="KatılımFinans Asistanı"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto flex h-[min(640px,calc(100dvh-6.5rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-float"
          >
            <header className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3 py-2.5">
              <img
                src={AGENT_MASCOT}
                alt=""
                className="h-9 w-9 shrink-0 object-contain"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-txt">
                  KatılımFinans Asistanı
                </p>
                <p className="truncate text-[11px] text-txt-muted">
                  Resmî kaynaklara dayalı yanıt
                </p>
              </div>
              {onExpand && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onExpand();
                  }}
                  className="grid h-11 w-11 place-items-center rounded-lg text-txt-secondary transition-colors hover:bg-sunken hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label="Tam sayfada aç"
                  title="Tam sayfada aç"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-lg text-txt-secondary transition-colors hover:bg-sunken hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Sohbeti kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1">
              <FinansmanAsistaniView
                variant="widget"
                onNavigate={(href) => {
                  setOpen(false);
                  onNavigate?.(href);
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AnimatePresence kullanılmaz: çıkış animasyonu düğümü DOM'da opacity:0
          hâlde bırakıyor ve görünmez ama odaklanabilir bir balon kalıyordu. */}
      {balonGorunur && !open && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto relative max-w-[17rem] rounded-2xl rounded-br-sm border border-line bg-surface px-3.5 py-3 shadow-float"
        >
          <button
            type="button"
            onClick={balonuKapat}
            aria-label="Karşılama balonunu kapat"
            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-txt-muted shadow-sm transition-colors hover:text-txt"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setOpen(true)} className="block text-left">
            <p className="text-sm leading-relaxed text-txt">
              Merhaba! Katılım bankalarının tüm işlemleri, öneriler ve sorularınız için
              buradayım.
            </p>
            <span className="mt-1.5 inline-block text-xs font-medium text-brand-600 dark:text-brand-400">
              Sohbeti başlat →
            </span>
          </button>
        </motion.div>
      )}

      <motion.button
        ref={fabRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Sohbeti kapat" : "Asistanı aç"}
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="pointer-events-auto grid h-14 w-14 place-items-center overflow-hidden rounded-full border border-line bg-surface text-txt shadow-raised transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:ring-offset-canvas"
      >
        {open ? (
          <X className="h-6 w-6 text-txt-secondary" aria-hidden="true" />
        ) : (
          <img
            src={AGENT_MASCOT}
            alt=""
            className="h-12 w-12 object-contain"
          />
        )}
      </motion.button>
    </div>
  );
};

export default ChatWidget;
