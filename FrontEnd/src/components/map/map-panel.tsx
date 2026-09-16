"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface MapPanelProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** Desktop placement; always a bottom sheet below md. */
  placement?: "right" | "left" | "bottom-left";
  footer?: ReactNode;
  className?: string;
  /** Move focus into the panel on mount (default true). */
  focusOnOpen?: boolean;
  /** Extra id for tests / aria-controls. */
  id?: string;
}

/**
 * Floating opaque panel inside the map (not portalled, so it also works in fullscreen).
 * Bottom sheet on mobile, anchored card on desktop. Escape is handled by the map root.
 */
export function MapPanel({
  title,
  description,
  children,
  onClose,
  placement = "right",
  footer,
  className,
  focusOnOpen = true,
  id,
}: MapPanelProps) {
  const headingId = useId();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusOnOpen) return;
    const el = ref.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>(
      "input:not([disabled]), button:not([disabled]):not([data-panel-close]), [tabindex='0']",
    );
    (first ?? el).focus({ preventScroll: true });
  }, [focusOnOpen]);

  return (
    <section
      ref={ref}
      id={id}
      tabIndex={-1}
      aria-labelledby={headingId}
      className={cx(
        "tpub-map-surface pointer-events-auto absolute inset-x-2 bottom-2 z-30 flex max-h-[72%] animate-panel-in flex-col overflow-hidden rounded-t-panel rounded-b-card outline-none md:w-[21rem] md:rounded-card",
        placement === "right" &&
          "md:top-3 md:right-[4.25rem] md:bottom-auto md:left-auto md:max-h-[calc(100%-1.5rem)]",
        placement === "left" &&
          "md:top-[4.25rem] md:right-auto md:bottom-auto md:left-3 md:max-h-[calc(100%-5.5rem)]",
        placement === "bottom-left" &&
          "md:top-auto md:right-auto md:bottom-12 md:left-3 md:max-h-[calc(100%-6.5rem)]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong md:hidden"
      />
      <header className="flex shrink-0 items-start gap-3 px-4 pt-3 pb-2 md:pt-4">
        <div className="min-w-0 flex-1">
          <h2
            id={headingId}
            className="font-display text-[0.9375rem] font-semibold text-ink-strong"
          >
            {title}
          </h2>
          {description ? (
            <div className="mt-0.5 text-xs leading-snug text-muted">{description}</div>
          ) : null}
        </div>
        <button
          type="button"
          data-panel-close=""
          onClick={onClose}
          aria-label={`Fermer : ${title}`}
          className="-mt-1 -mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-overlay-hover hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
      {footer ? (
        <footer className="shrink-0 border-t border-line px-4 py-3">{footer}</footer>
      ) : null}
    </section>
  );
}
