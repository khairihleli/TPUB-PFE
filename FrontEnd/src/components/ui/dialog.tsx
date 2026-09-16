"use client";

import { X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import {
  type ComponentPropsWithoutRef,
  createContext,
  forwardRef,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { cx } from "@/lib/cx";
import { frTypo } from "@/lib/fr-typo";

/** Radix Dialog root: focus trap, Escape, scroll lock, focus return. */
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;

interface DialogGuardValue {
  /** Returns true when the close may proceed; otherwise shows the inline discard bar. */
  requestClose: () => boolean;
}

const DialogGuardContext = createContext<DialogGuardValue | null>(null);

/**
 * Close button honouring `DialogContent dirty`: when the form is dirty it shows the inline
 * « Abandonner les modifications ? » bar instead of closing. Use it for « Annuler » buttons.
 */
export const DialogClose = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RadixDialog.Close>
>(function DialogClose({ onClick, ...props }, ref) {
  const guard = useContext(DialogGuardContext);
  return (
    <RadixDialog.Close
      ref={ref}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        onClick?.(e);
        if (!e.defaultPrevented && guard && !guard.requestClose()) e.preventDefault();
      }}
      {...props}
    />
  );
});

export interface DialogContentProps {
  /** Required accessible title. */
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer actions (right-aligned). */
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  hideCloseButton?: boolean;
  /** Prevent closing on outside click (e.g. during a pending action). */
  preventOutsideClose?: boolean;
  /**
   * Unsaved form inside (FFA-07): outside click, Escape, the close button and <DialogClose>
   * show an inline confirmation bar (« Garder » / « Abandonner ») instead of closing.
   */
  dirty?: boolean;
  /** Called when the user confirms « Abandonner » (reset local form state here). */
  onDiscard?: () => void;
  /** Radix open auto-focus hook (preventDefault then focus a safer target). */
  onOpenAutoFocus?: (event: Event) => void;
  className?: string;
}

const SIZE = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" } as const;

export function DialogContent({
  title,
  description,
  children,
  footer,
  size = "md",
  hideCloseButton = false,
  preventOutsideClose = false,
  dirty = false,
  onDiscard,
  onOpenAutoFocus,
  className,
}: DialogContentProps) {
  const [confirming, setConfirming] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Default initial focus: the first field of a form dialog, otherwise the dialog itself (its
  // title is announced) — never the close icon, which Radix would otherwise pick and ring.
  const defaultOpenAutoFocus = (event: Event) => {
    const root = contentRef.current;
    if (!root) return;
    event.preventDefault();
    // On touch screens a focused field opens the keyboard over the dialog: start on the dialog.
    const coarse =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const field = coarse
      ? null
      : root.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not(:disabled):not([readonly]), textarea:not(:disabled), select:not(:disabled)",
        );
    (field ?? root).focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!dirty) setConfirming(false);
  }, [dirty]);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const requestClose = () => {
    if (dirty) {
      setConfirming(true);
      return false;
    }
    return true;
  };

  const guardOutside = (e: Event) => {
    if (preventOutsideClose || !requestClose()) e.preventDefault();
  };

  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-(--z-modal) animate-fade-in bg-scrim" />
      <div className="pointer-events-none fixed inset-0 z-(--z-modal) flex items-end justify-center p-3 sm:items-center sm:p-6">
        <RadixDialog.Content
          ref={contentRef}
          onOpenAutoFocus={onOpenAutoFocus ?? defaultOpenAutoFocus}
          onPointerDownOutside={guardOutside}
          onInteractOutside={guardOutside}
          onEscapeKeyDown={(e) => {
            if (confirming) {
              e.preventDefault();
              setConfirming(false);
              return;
            }
            if (!requestClose()) e.preventDefault();
          }}
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cx(
            "pointer-events-auto relative flex max-h-[calc(100dvh-1.5rem)] w-full animate-panel-in flex-col overflow-hidden rounded-panel border border-line-strong bg-surface shadow-card focus:outline-none",
            SIZE[size],
            className,
          )}
        >
          <DialogGuardContext.Provider value={{ requestClose }}>
            <div
              aria-hidden="true"
              className="hairline-tricolor absolute inset-x-0 top-0 opacity-70"
            />
            <div className="flex items-start justify-between gap-4 px-5 pt-6 sm:px-7">
              <div className="min-w-0">
                <RadixDialog.Title className="font-display text-xl font-semibold text-balance text-ink-strong">
                  {typeof title === "string" ? frTypo(title) : title}
                </RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="mt-1.5 text-sm leading-relaxed text-muted">
                    {typeof description === "string" ? frTypo(description) : description}
                  </RadixDialog.Description>
                ) : null}
              </div>
              {hideCloseButton ? null : (
                <DialogClose
                  aria-label="Fermer"
                  className="-mt-1.5 -mr-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-overlay-hover hover:text-ink"
                >
                  <X aria-hidden="true" className="size-5" />
                </DialogClose>
              )}
            </div>
            {children ? (
              <div
                onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
                className={cx(
                  // A hairline appears once content scrolls under the title, so rows never look
                  // glued to the header.
                  "mt-2.5 overflow-y-auto border-t px-5 pt-2.5 pb-1 transition-colors sm:px-7",
                  scrolled ? "border-line" : "border-transparent",
                )}
              >
                {children}
              </div>
            ) : null}
            {confirming ? (
              <div
                role="alertdialog"
                aria-label="Abandonner les modifications ?"
                className="mt-5 flex flex-col gap-3 border-t border-warning/30 bg-warning/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"
              >
                <p className="text-sm font-semibold text-ink-strong">
                  Abandonner les modifications ?
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button
                    ref={keepRef}
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="inline-flex min-h-touch items-center justify-center rounded-control bg-brand-blue px-5 font-label text-sm font-semibold text-on-brand hover:bg-brand-blue-600"
                  >
                    Garder
                  </button>
                  <RadixDialog.Close
                    onClick={() => {
                      setConfirming(false);
                      onDiscard?.();
                    }}
                    className="inline-flex min-h-touch items-center justify-center rounded-control px-5 font-label text-sm font-semibold text-danger hover:bg-danger/10"
                  >
                    Abandonner
                  </RadixDialog.Close>
                </div>
              </div>
            ) : footer ? (
              <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line bg-overlay-inset px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
                {footer}
              </div>
            ) : (
              <div className="h-6" />
            )}
          </DialogGuardContext.Provider>
        </RadixDialog.Content>
      </div>
    </RadixDialog.Portal>
  );
}
