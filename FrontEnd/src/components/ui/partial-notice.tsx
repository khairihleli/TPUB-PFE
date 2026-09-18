"use client";

import { TriangleAlert } from "lucide-react";

import { cx } from "@/lib/cx";

export interface PartialNoticeProps {
  /** Default « Données partielles ». */
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Small warning note inside a tile/section whose data is incomplete (FFA-05). Not an error page:
 * the rest of the screen keeps rendering. « Données partielles · Réessayer ».
 */
export function PartialNotice({
  message = "Données partielles",
  onRetry,
  className,
}: PartialNoticeProps) {
  return (
    <p
      className={cx(
        "inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] text-warning",
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{message}</span>
      {onRetry ? (
        <>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onRetry}
            className="hit-area relative rounded-sm font-semibold text-brand-blue-text underline-offset-4 hover:underline"
          >
            Réessayer
          </button>
        </>
      ) : null}
    </p>
  );
}
