"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from "react";

import { cx } from "@/lib/cx";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Clickable label (may contain links). */
  label: ReactNode;
  description?: ReactNode;
  error?: string | null;
  className?: string;
}

/** Native checkbox, custom-styled, 44px touch target through its label. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, error, className, id, disabled, ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `cb${autoId.replace(/:/g, "")}`;
  const descId = description ? `${inputId}-desc` : undefined;
  const errId = error ? `${inputId}-error` : undefined;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div
        className={cx(
          "group/cb flex min-h-touch items-start gap-3 py-2.5",
          disabled && "opacity-60",
        )}
      >
        <span className="relative mt-px inline-flex size-5 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            disabled={disabled}
            aria-describedby={[descId, errId].filter(Boolean).join(" ") || undefined}
            aria-invalid={error ? true : undefined}
            className="peer absolute inset-0 size-5 cursor-pointer appearance-none rounded-[6px] border border-line-strong bg-overlay-inset transition-colors checked:border-brand-blue checked:bg-brand-blue hover:border-muted-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed aria-[invalid=true]:border-danger/70"
            {...props}
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="pointer-events-none relative size-3.5 text-on-brand opacity-0 transition-opacity peer-checked:opacity-100"
          >
            <path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="flex flex-col gap-0.5">
          <label
            htmlFor={inputId}
            className="cursor-pointer text-[0.9375rem] leading-snug text-ink-soft"
          >
            {label}
          </label>
          {description ? (
            <span id={descId} className="text-[0.8125rem] leading-snug text-muted">
              {description}
            </span>
          ) : null}
        </span>
      </div>
      {error ? (
        <p id={errId} className="pl-8 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
