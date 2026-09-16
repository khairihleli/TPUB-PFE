import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface StepItem {
  label: string;
  description?: ReactNode;
}

export interface StepperProps {
  steps: readonly (string | StepItem)[];
  /** Index of the current step (0-based). */
  current: number;
  /** "failed" marks the current step as stopped (e.g. refused); "complete" marks all done. */
  state?: "current" | "failed" | "complete";
  orientation?: "horizontal" | "vertical";
  /** Accessible name of the list. */
  label?: string;
  className?: string;
}

export function Stepper({
  steps,
  current,
  state = "current",
  orientation = "horizontal",
  label = "Progression",
  className,
}: StepperProps) {
  const items = steps.map((s) => (typeof s === "string" ? { label: s } : s));
  const vertical = orientation === "vertical";

  return (
    <ol
      aria-label={label}
      className={cx(vertical ? "flex flex-col" : "flex w-full items-start", className)}
    >
      {items.map((step, i) => {
        const done = state === "complete" || i < current;
        const isCurrent = state !== "complete" && i === current;
        const failed = isCurrent && state === "failed";
        const last = i === items.length - 1;

        const status = failed
          ? "Interrompue"
          : done
            ? "Terminée"
            : isCurrent
              ? "En cours"
              : "À venir";

        return (
          <li
            key={step.label}
            aria-current={isCurrent ? "step" : undefined}
            className={cx(
              "relative",
              vertical
                ? "flex gap-4 pb-6 last:pb-0"
                : "flex flex-1 flex-col items-center text-center",
            )}
          >
            {/* connector */}
            {!last ? (
              <span
                aria-hidden="true"
                className={cx(
                  "absolute",
                  vertical
                    ? "top-9 bottom-1 left-[15px] w-px"
                    : "top-[15px] left-[calc(50%+22px)] h-px w-[calc(100%-44px)]",
                  done ? "bg-brand-blue-text/60" : "bg-line-strong",
                )}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cx(
                "relative z-[1] inline-flex size-[31px] shrink-0 items-center justify-center rounded-full border font-label text-[0.8125rem] font-semibold transition-colors",
                failed && "border-danger/60 bg-danger/15 text-danger",
                !failed && done && "border-brand-blue bg-brand-blue text-on-brand",
                !failed &&
                  isCurrent &&
                  "border-brand-blue-text bg-blue-soft text-brand-blue-text shadow-[0_0_0_4px_var(--color-blue-soft)]",
                !failed && !done && !isCurrent && "border-line-strong bg-surface text-muted",
              )}
            >
              {failed ? <X className="size-4" /> : done ? <Check className="size-4" /> : i + 1}
            </span>
            <span className={cx(vertical ? "pt-1" : "mt-2.5 px-1")}>
              <span
                className={cx(
                  "block font-label text-[0.8125rem] font-semibold leading-snug",
                  failed
                    ? "text-danger"
                    : isCurrent
                      ? "text-ink-strong"
                      : done
                        ? "text-ink-soft"
                        : "text-muted",
                )}
              >
                {step.label}
              </span>
              <span className="sr-only"> — {status}</span>
              {step.description ? (
                <span
                  className={cx(
                    "mt-0.5 block text-[0.8125rem] leading-snug text-muted",
                    !vertical && "hidden sm:block",
                  )}
                >
                  {step.description}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
