import type { ReactNode } from "react";

import type { Tone } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";

/** Status tones (Tone) + brand identity + categorical tokens (Porteur types, non-status series). */
export type BadgeTone = Tone | "brand" | "cat-1" | "cat-2" | "cat-3" | "cat-4";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  /** Leading 6px dot. */
  dot?: boolean;
  /** Pulsing dot (implies dot). Use only for "en diffusion" / demo indicators. */
  pulse?: boolean;
  size?: "sm" | "md";
  icon?: ReactNode;
  title?: string;
  className?: string;
}

/** 12% tint + 30% border recipe, text colour carries the tone. */
export const TONE_CLASSES: Record<BadgeTone, string> = {
  info: "text-info bg-info/12 border-info/30",
  warning: "text-warning bg-warning/12 border-warning/30",
  blue: "text-brand-blue-text bg-brand-blue-text/12 border-brand-blue-text/30",
  success: "text-success bg-success/12 border-success/30",
  muted: "text-muted bg-muted/10 border-muted/25",
  danger: "text-danger bg-danger/12 border-danger/30",
  violet: "text-violet-text bg-violet-soft border-violet-line",
  neutral: "text-ink-soft bg-surface-3 border-line-strong",
  brand: "text-brand-orange-text bg-orange-soft border-orange-line",
  "cat-1": "text-cat-1 bg-cat-1/12 border-cat-1/30",
  "cat-2": "text-cat-2 bg-cat-2/12 border-cat-2/30",
  "cat-3": "text-cat-3 bg-cat-3/12 border-cat-3/30",
  "cat-4": "text-cat-4 bg-cat-4/12 border-cat-4/30",
};

export function Badge({
  tone = "neutral",
  children,
  dot = false,
  pulse = false,
  size = "md",
  icon,
  title,
  className,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border font-label font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot || pulse ? (
        <span
          aria-hidden="true"
          className={cx(
            "size-1.5 shrink-0 rounded-full bg-current",
            pulse && "pulse-dot size-1.5!",
          )}
        />
      ) : null}
      {icon ? (
        <span aria-hidden="true" className="inline-flex [&_svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
