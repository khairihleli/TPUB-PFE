"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { Toast as RadixToast } from "radix-ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { cx } from "@/lib/cx";

export type ToastVariant = "info" | "success" | "warning" | "danger";

export interface ToastAction {
  label: string;
  /** Internal link, or external with `external`. */
  href?: string;
  external?: boolean;
  onClick?: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms, default 5000. */
  duration?: number;
  /** One follow-up action (e.g. « Vérifier sur un écran »). */
  action?: ToastAction;
}

interface ToastItem extends ToastOptions {
  id: number;
  open: boolean;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT: Record<ToastVariant, { Icon: typeof Info; icon: string; bar: string }> = {
  info: { Icon: Info, icon: "text-info", bar: "bg-info" },
  success: { Icon: CircleCheck, icon: "text-success", bar: "bg-success" },
  warning: { Icon: TriangleAlert, icon: "text-warning", bar: "bg-warning" },
  danger: { Icon: CircleAlert, icon: "text-danger", bar: "bg-danger" },
};

/**
 * Viewport placement (FFA-11): below sm, anchored at the top under the topbar; from sm, bottom
 * right, lifted by `--toast-offset` (sticky action bars, see useStickyBarOffset) and
 * `--bottom-bar-h` (mobile tab bar).
 */
export const TOAST_VIEWPORT_CLASS =
  "fixed inset-x-3 top-[calc(var(--topbar-h)+0.5rem)] z-(--z-toast) m-0 flex list-none flex-col gap-2 outline-none sm:inset-x-auto sm:top-auto sm:right-4 sm:bottom-[calc(1rem+var(--toast-offset)+var(--bottom-bar-h))] sm:w-[calc(100vw-2rem)] sm:max-w-sm";

/**
 * Mount once (AppShell does it). Toasts confirm completed actions; blocking errors stay inline.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, open: false } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 300);
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-3), { ...options, id, open: true }]);
    return id;
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right" label="Notifications">
        {children}
        {items.map((t) => {
          const v = VARIANT[t.variant ?? "info"];
          return (
            <RadixToast.Root
              key={t.id}
              open={t.open}
              duration={t.duration ?? (t.action ? 8000 : 5000)}
              onOpenChange={(open) => {
                if (!open) dismiss(t.id);
              }}
              className="relative flex w-full animate-panel-in items-start gap-3 overflow-hidden rounded-card border border-line-strong bg-surface-2 py-3.5 pr-12 pl-4 shadow-card data-[state=closed]:animate-fade-in data-[state=closed]:opacity-0 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:translate-x-full"
            >
              <span aria-hidden="true" className={cx("absolute inset-y-0 left-0 w-1", v.bar)} />
              <v.Icon aria-hidden="true" className={cx("mt-0.5 size-5 shrink-0", v.icon)} />
              <div className="min-w-0">
                <RadixToast.Title className="font-label text-sm font-semibold text-ink-strong">
                  {t.title}
                </RadixToast.Title>
                {t.description ? (
                  <RadixToast.Description className="mt-0.5 text-[0.8125rem] leading-snug text-muted">
                    {t.description}
                  </RadixToast.Description>
                ) : null}
                {t.action ? (
                  <RadixToast.Action altText={t.action.label} asChild>
                    {t.action.href ? (
                      t.action.external ? (
                        <a
                          href={t.action.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={t.action.onClick}
                          className="mt-2 inline-flex min-h-9 items-center font-label text-[0.8125rem] font-semibold text-brand-blue-text underline-offset-4 hover:underline"
                        >
                          {t.action.label}
                          <span className="sr-only"> (nouvel onglet)</span>
                        </a>
                      ) : (
                        <Link
                          href={t.action.href}
                          onClick={t.action.onClick}
                          className="mt-2 inline-flex min-h-9 items-center font-label text-[0.8125rem] font-semibold text-brand-blue-text underline-offset-4 hover:underline"
                        >
                          {t.action.label}
                        </Link>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={t.action.onClick}
                        className="mt-2 inline-flex min-h-9 items-center font-label text-[0.8125rem] font-semibold text-brand-blue-text underline-offset-4 hover:underline"
                      >
                        {t.action.label}
                      </button>
                    )}
                  </RadixToast.Action>
                ) : null}
              </div>
              <RadixToast.Close
                aria-label="Fermer la notification"
                className="absolute top-0.5 right-0.5 inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-overlay-strong hover:text-ink"
              >
                <X aria-hidden="true" className="size-4" />
              </RadixToast.Close>
            </RadixToast.Root>
          );
        })}
        <RadixToast.Viewport className={TOAST_VIEWPORT_CLASS} />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

/** `const { toast } = useToast(); toast({ title: "Campagne enregistrée", variant: "success" })` */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast doit être utilisé dans <ToastProvider>.");
  }
  return ctx;
}
