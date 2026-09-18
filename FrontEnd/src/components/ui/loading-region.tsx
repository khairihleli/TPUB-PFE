"use client";

import { type ReactNode, useEffect, useState } from "react";

import { cx } from "@/lib/cx";

export const SLOW_CAPTION = "Chargement plus long que d'habitude…";

export interface LoadingRegionProps {
  label?: string;
  children: ReactNode;
  className?: string;
  /** Force the slow caption (e.g. `useResource().slow`). */
  slow?: boolean;
  /** Shows « Réessayer » after `retryAfterMs`. */
  onRetry?: () => void;
  /** Default 4 s. */
  slowAfterMs?: number;
  /** Default 8 s. */
  retryAfterMs?: number;
}

/**
 * Wraps skeletons in ONE status region so screen readers hear a single sentence.
 * After 4 s: « Chargement plus long que d'habitude… »; after 8 s: « Réessayer » (when onRetry).
 * <LoadingRegion label="Chargement des campagnes…" onRetry={reload}><SkeletonCard/>…</LoadingRegion>
 */
export function LoadingRegion({
  label = "Chargement…",
  children,
  className,
  slow,
  onRetry,
  slowAfterMs = 4000,
  retryAfterMs = 8000,
}: LoadingRegionProps) {
  const [elapsed, setElapsed] = useState<"start" | "slow" | "retry">("start");

  useEffect(() => {
    const a = setTimeout(() => setElapsed((e) => (e === "start" ? "slow" : e)), slowAfterMs);
    const b = setTimeout(() => setElapsed("retry"), retryAfterMs);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [slowAfterMs, retryAfterMs]);

  const showSlow = slow === true || elapsed !== "start";
  const showRetry = Boolean(onRetry) && elapsed === "retry";

  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {showSlow ? (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
          <span>{SLOW_CAPTION}</span>
          {showRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cx(
                "hit-area relative rounded-sm font-semibold text-brand-blue-text underline-offset-4 hover:underline",
              )}
            >
              Réessayer
            </button>
          ) : null}
        </p>
      ) : null}
      {children}
    </div>
  );
}
