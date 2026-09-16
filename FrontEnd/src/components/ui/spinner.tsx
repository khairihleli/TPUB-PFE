import { cx } from "@/lib/cx";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** When set, the spinner announces itself (role=status). Otherwise it is decorative. */
  label?: string;
  className?: string;
}

const SIZE = { sm: "size-4 border-2", md: "size-5 border-2", lg: "size-8 border-[3px]" } as const;

export function Spinner({ size = "md", label, className }: SpinnerProps) {
  const ring = (
    <span
      aria-hidden="true"
      className={cx(
        "inline-block shrink-0 animate-spin rounded-full border-current/25 border-t-current",
        SIZE[size],
        className,
      )}
    />
  );
  if (!label) return ring;
  return (
    <span role="status" className="inline-flex items-center gap-2">
      {ring}
      <span className="sr-only">{label}</span>
    </span>
  );
}
