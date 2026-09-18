import { ESTIMATE_LABEL, ESTIMATE_RULE } from "@/content/glossary";
import { InfoTip } from "@/components/ui/tooltip";
import { cx } from "@/lib/cx";

export { formatEstimate } from "@/lib/format";

export interface EstimateTagProps {
  /** The rule behind the value (default: glossary rule, 10 % / 1 000 vues per créneau). */
  rule?: string;
  /** Visible label (default « Estimation »). */
  label?: string;
  className?: string;
}

/**
 * Neutral « Estimation » tag + rule tooltip (VD-16). Not amber: amber is reserved for statuses
 * that need attention. Pair values with `formatEstimate(120, "DT")` → « ≈ 120 DT ».
 */
export function EstimateTag({
  rule = ESTIMATE_RULE,
  label = ESTIMATE_LABEL,
  className,
}: EstimateTagProps) {
  return (
    <span className={cx("inline-flex items-center gap-0.5 align-middle", className)}>
      <span className="rounded-full border border-line-strong px-2 py-0.5 font-label text-xs font-semibold whitespace-nowrap text-ink-soft">
        {label}
      </span>
      <InfoTip label={`À propos de cette estimation : ${rule}`} content={rule} />
    </span>
  );
}
