"use client";

import { CircleAlert } from "lucide-react";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";

import { cx } from "@/lib/cx";

export interface ErrorSummaryItem {
  /** id of the invalid control (Field `id`). */
  fieldId: string;
  message: string;
}

export interface ErrorSummaryProps {
  errors: readonly ErrorSummaryItem[];
  /** Default « {n} champ(s) à corriger ». */
  title?: string;
  /** Moves focus to the summary when it appears or when `focusKey` changes (submit attempt). */
  autoFocus?: boolean;
  /** Change it on every failed submit to re-focus the summary (e.g. a submit counter). */
  focusKey?: string | number;
  className?: string;
}

export interface ErrorSummaryHandle {
  focus: () => void;
}

/** Focuses a field by id (scrolls it into view first). Returns false when not found. */
export function focusField(fieldId: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(fieldId);
  if (!el) return false;
  if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
  el.focus({ preventScroll: true });
  return true;
}

/**
 * Submit-time summary (UX-PLAN §7.4, FFA-12): danger alert with `role="alert"`, heading
 * « 3 champs à corriger », anchor links that focus each field. Render it only for 2+ errors;
 * for a single error, call `focusField(id)` instead.
 */
export const ErrorSummary = forwardRef<ErrorSummaryHandle, ErrorSummaryProps>(function ErrorSummary(
  { errors, title, autoFocus = true, focusKey, className },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = `es${useId().replace(/:/g, "")}`;
  useImperativeHandle(ref, () => ({ focus: () => boxRef.current?.focus() }), []);

  const count = errors.length;
  useEffect(() => {
    if (autoFocus && count > 0) boxRef.current?.focus();
  }, [autoFocus, count, focusKey]);

  if (count === 0) return null;
  const heading = title ?? `${count} ${count >= 2 ? "champs" : "champ"} à corriger`;

  return (
    <div
      ref={boxRef}
      role="alert"
      tabIndex={-1}
      aria-labelledby={titleId}
      className={cx(
        "rounded-card border border-danger/35 bg-danger/8 px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger sm:px-5",
        className,
      )}
    >
      <p
        id={titleId}
        className="flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong"
      >
        <CircleAlert aria-hidden="true" className="size-5 text-danger" />
        {heading}
      </p>
      <ul className="mt-2 flex flex-col gap-1 pl-7 text-sm">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a
              href={`#${e.fieldId}`}
              onClick={(event) => {
                if (focusField(e.fieldId)) event.preventDefault();
              }}
              className="text-danger underline underline-offset-4 hover:text-ink-strong"
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});
