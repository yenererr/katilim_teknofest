import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Maximize2, X } from "lucide-react";
import { FinansmanAsistaniView } from "./FinansmanAsistaniView";
import { BRAND_LOGO } from "../lib/brand";

const AGENT_LOGO = BRAND_LOGO;

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
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

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
                src={AGENT_LOGO}
                alt=""
                className="h-8 w-20 rounded-lg bg-white object-contain object-left p-0.5"
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

      <motion.button
        ref={fabRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Sohbeti kapat" : "Asistanı aç"}
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full border border-brand-200 bg-brand-600 text-white shadow-raised transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:border-brand-700 dark:ring-offset-canvas"
      >
        {open ? (
          <X className="h-6 w-6" aria-hidden="true" />
        ) : (
          <img
            src={AGENT_LOGO}
            alt=""
            className="h-10 w-10 rounded-full bg-white object-cover object-left p-1"
          />
        )}
      </motion.button>
    </div>
  );
};

export default ChatWidget;
