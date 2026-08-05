import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, AlertTriangle, Info, X } from 'lucide-react';

type ToastTone = 'basari' | 'uyari' | 'bilgi';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

const TONE_STYLES: Record<
  ToastTone,
  { icon: React.ComponentType<{ className?: string }>; ring: string; iconColor: string }
> = {
  basari: { icon: Check, ring: 'border-brand-300 dark:border-brand-700', iconColor: 'text-brand-600 dark:text-brand-400' },
  uyari: { icon: AlertTriangle, ring: 'border-warn-300 dark:border-warn-700', iconColor: 'text-warn-600 dark:text-warn-400' },
  bilgi: { icon: Info, ring: 'border-line-strong', iconColor: 'text-txt-secondary' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'basari') => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Odağı çalmaz; ekran okuyucuya aria-live ile bildirilir */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-100 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
        role="status"
        aria-live="polite"
        aria-atomic="false"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const tone = TONE_STYLES[toast.tone];
            const Icon = tone.icon;
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-raised px-4 py-3 text-sm text-txt shadow-float ${tone.ring}`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconColor}`} aria-hidden="true" />
                <span className="flex-1 leading-snug">{toast.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Bildirimi kapat"
                  className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-md text-txt-muted transition-colors hover:text-txt"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};
