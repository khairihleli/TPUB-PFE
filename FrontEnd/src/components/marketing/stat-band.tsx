import type { ReactNode } from "react";

import { CountUp } from "@/components/marketing/count-up";
import { Reveal } from "@/components/marketing/reveal";
import { cx } from "@/lib/cx";

export interface StatBandItem {
  /** Big label, e.g. « Par zone ». Used when `countTo` is absent. */
  label: string;
  /** Sub-line, e.g. « Du quartier à la ville ». */
  detail?: string;
  icon?: ReactNode;
  /**
   * Optional numeric count-up. ONLY for real, sourced figures (the brief forbids invented
   * metrics — ZELQANE is pre-launch, so the default use is mechanism items without numbers).
   */
  countTo?: number;
  prefix?: string;
  suffix?: string;
}

export interface StatBandProps {
  items: readonly StatBandItem[];
  /**
   * band = standalone hairline band · overlay = glass strip pinned at the bottom of a hero
   */
  variant?: "band" | "overlay";
  /** Accessible name of the list. */
  label?: string;
  className?: string;
}

/** « Mécanismes » band: 4 columns (2 on mobile) with vertical gradient dividers. */
export function StatBand({
  items,
  variant = "band",
  label = "Points clés",
  className,
}: StatBandProps) {
  return (
    <div
      className={cx(
        variant === "overlay"
          ? "border-t border-orange-line bg-bg/50 backdrop-blur-[10px]"
          : "rounded-panel border border-line bg-surface/40 backdrop-blur-sm",
        className,
      )}
    >
      <Reveal
        as="ul"
        stagger
        aria-label={label}
        className={cx(
          "grid grid-cols-2 lg:grid-cols-4",
          variant === "overlay" ? "container-site" : "",
        )}
      >
        {items.map((item, i) => (
          <li
            key={item.label}
            className={cx(
              "relative flex flex-col gap-1.5 px-4 py-6 sm:px-7 sm:py-8",
              // vertical gradient dividers between columns (2 cols mobile, 4 cols desktop)
              i % 4 !== 0 &&
                "before:absolute before:inset-y-5 before:left-0 before:w-px before:bg-[linear-gradient(180deg,transparent,var(--color-orange-line),transparent)]",
              i % 2 === 0 && i % 4 !== 0 && "before:hidden lg:before:block",
              i >= 2 && "border-t border-line lg:border-t-0",
            )}
          >
            {item.icon ? (
              <span
                aria-hidden="true"
                className="mb-2 inline-flex text-brand-orange-text [&_svg]:size-5"
              >
                {item.icon}
              </span>
            ) : null}
            <span className="font-display text-[clamp(1.15rem,2vw,1.5rem)] leading-tight font-semibold text-ink-strong">
              {typeof item.countTo === "number" ? (
                <CountUp
                  to={item.countTo}
                  prefix={item.prefix}
                  suffix={item.suffix}
                  className="text-gradient"
                />
              ) : (
                item.label
              )}
            </span>
            {typeof item.countTo === "number" ? (
              <span className="text-sm font-medium text-ink-soft">{item.label}</span>
            ) : null}
            {item.detail ? (
              <span className="text-[0.8125rem] leading-snug text-muted">{item.detail}</span>
            ) : null}
          </li>
        ))}
      </Reveal>
    </div>
  );
}
