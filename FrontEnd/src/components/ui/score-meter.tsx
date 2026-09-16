import { cx } from "@/lib/cx";

export interface ScoreMeterProps {
  label: string;
  /** 0..max */
  value: number;
  max?: number;
  /**
   * risk = lower is better (green → amber → red) · quality = higher is better.
   */
  kind: "risk" | "quality";
  /** Small hint under the label, e.g. « Plus il est bas, mieux c'est. » */
  hint?: string;
  size?: "sm" | "md";
  className?: string;
}

function toneFor(kind: "risk" | "quality", pct: number): { bar: string; text: string } {
  const good = kind === "risk" ? pct <= 30 : pct >= 70;
  const bad = kind === "risk" ? pct > 70 : pct < 40;
  if (good) return { bar: "bg-success", text: "text-success" };
  if (bad) return { bar: "bg-danger", text: "text-danger" };
  return { bar: "bg-warning", text: "text-warning" };
}

/**
 * Horizontal /100 meter (AI risk & quality). Accessible as role="meter".
 * Inside a <Reveal>, the bar fills when revealed (CSS .meter-fill).
 */
export function ScoreMeter({
  label,
  value,
  max = 100,
  kind,
  hint,
  size = "md",
  className,
}: ScoreMeterProps) {
  const safe = Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  const pct = max > 0 ? (safe / max) * 100 : 0;
  const tone = toneFor(kind, pct);

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-label text-[0.8125rem] font-medium text-ink-soft">{label}</span>
        <span
          className={cx(
            "font-display font-semibold tabular",
            size === "sm" ? "text-base" : "text-xl",
            tone.text,
          )}
        >
          {Math.round(safe)}
          <span className="text-[0.75em] font-medium text-muted"> /{max}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(safe)}
        className={cx(
          "relative overflow-hidden rounded-full bg-overlay-strong",
          size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <span
          className={cx("meter-fill absolute inset-y-0 left-0 rounded-full", tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
