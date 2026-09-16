import type { ReactNode } from "react";

import { ESTIMATE_RULE } from "@/content/glossary";
import type { Tone } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";

/** SVG fill per status tone (text-only tokens, never hex). */
export const TONE_FILL: Record<Tone, string> = {
  info: "fill-info",
  warning: "fill-warning",
  blue: "fill-brand-blue-text",
  success: "fill-success",
  muted: "fill-muted",
  danger: "fill-danger",
  violet: "fill-violet-text",
  neutral: "fill-ink-soft",
};

/** SVG stroke per status tone. */
export const TONE_STROKE: Record<Tone, string> = {
  info: "stroke-info",
  warning: "stroke-warning",
  blue: "stroke-brand-blue-text",
  success: "stroke-success",
  muted: "stroke-muted",
  danger: "stroke-danger",
  violet: "stroke-violet-text",
  neutral: "stroke-ink-soft",
};

/** Background swatch per tone (legends). */
export const TONE_BG: Record<Tone, string> = {
  info: "bg-info",
  warning: "bg-warning",
  blue: "bg-brand-blue-text",
  success: "bg-success",
  muted: "bg-muted",
  danger: "bg-danger",
  violet: "bg-violet-text",
  neutral: "bg-ink-soft",
};

export const ESTIMATE_TOOLTIP = ESTIMATE_RULE;

/** Neutral estimate tag with its rule (VD-16): the shared ui primitive. */
export { EstimateTag } from "@/components/ui/estimate-tag";

const tndParts = new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND" });
const tndWholeParts = new Intl.NumberFormat("fr-TN", {
  style: "currency",
  currency: "TND",
  maximumFractionDigits: 0,
});

/**
 * Splits a TND amount for display: « 14 700 » (integer part) · « ,250 » (millimes, only
 * when present) · « DT ». Same digits and spacing as formatTND.
 */
export function splitTND(n: number): { integer: string; fraction: string; currency: string } {
  const value = Number.isFinite(n) ? n : 0;
  const formatter = Number.isInteger(value) ? tndWholeParts : tndParts;
  let integer = "";
  let fraction = "";
  let currency = "";
  for (const part of formatter.formatToParts(value)) {
    switch (part.type) {
      case "minusSign":
      case "integer":
        integer += part.value;
        break;
      case "group":
        integer += "\u00a0";
        break;
      case "decimal":
      case "fraction":
        fraction += part.value;
        break;
      case "currency":
        currency = part.value;
        break;
      default:
        break;
    }
  }
  return { integer, fraction, currency };
}

/**
 * Large money figure: strong integer part, subdued millimes and currency.
 * Never breaks inside the number (no « D / T » wrap on narrow cards).
 */
export function Amount({ value, className }: { value: number; className?: string }) {
  const { integer, fraction, currency } = splitTND(value);
  return (
    <span className={cx("inline-flex items-baseline whitespace-nowrap tabular", className)}>
      <span>{integer}</span>
      <span className="text-[0.6em] font-medium text-muted">{fraction}</span>
      {currency ? (
        <span className="ml-[0.3em] text-[0.6em] font-semibold text-ink-soft">{currency}</span>
      ) : null}
    </span>
  );
}

/** Small section heading used inside espace pages (h2 by default). */
export function PanelHeading({
  id,
  kicker,
  title,
  description,
  actions,
  as = "h2",
  className,
}: {
  id?: string;
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  const Heading = as;
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {kicker ? (
          <p className="mb-1 font-label text-[0.8125rem] font-medium text-muted">{kicker}</p>
        ) : null}
        <Heading
          id={id}
          className="font-display text-[1.125rem] leading-snug font-semibold tracking-tight text-ink-strong"
        >
          {title}
        </Heading>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Label/value pair for fact lists. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-label text-[0.8125rem] font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-sm break-words text-ink-soft">{children}</dd>
    </div>
  );
}
