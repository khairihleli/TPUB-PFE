import type { ReactNode } from "react";

import { EstimateTag } from "@/components/ui/estimate-tag";
import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/lib/cx";

export interface StatCardProps {
  label: string;
  /** Already formatted value (formatTND, formatNumber…). */
  value: ReactNode;
  /** Secondary line under the value. */
  hint?: ReactNode;
  icon?: ReactNode;
  /** Accent of the icon tile. */
  accent?: "orange" | "blue" | "red" | "success" | "warning" | "neutral";
  /** Shows a neutral « Estimation indicative » tag with its rule (hard-coded backend values, VD-16). */
  estimate?: boolean;
  /** Rule shown in the estimate tooltip (default: glossary rule). */
  estimateRule?: string;
  loading?: boolean;
  className?: string;
}

const ACCENT: Record<NonNullable<StatCardProps["accent"]>, string> = {
  orange: "text-brand-orange-text bg-orange-soft border-orange-line",
  blue: "text-brand-blue-text bg-blue-soft border-blue-line",
  red: "text-brand-red-text bg-red-soft border-red-line",
  success: "text-success bg-success/12 border-success/30",
  warning: "text-warning bg-warning/12 border-warning/30",
  neutral: "text-ink-soft bg-surface-2 border-line",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "blue",
  estimate = false,
  estimateRule,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <div
      className={cx(
        "relative flex flex-col gap-3 overflow-hidden rounded-card border border-line bg-grad-card p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-label text-[0.8125rem] font-medium text-muted">{label}</p>
        {icon ? (
          <span
            aria-hidden="true"
            className={cx(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border [&_svg]:size-4.5",
              ACCENT[accent],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-2/3" />
      ) : (
        <p className="font-display text-[1.75rem] leading-none font-semibold tracking-tight text-ink-strong tabular">
          {value}
        </p>
      )}
      {hint || estimate ? (
        <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
          {estimate ? <EstimateTag label="Estimation indicative" rule={estimateRule} /> : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
