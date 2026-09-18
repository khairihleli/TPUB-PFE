import { cx } from "@/lib/cx";

export {
  LoadingRegion,
  type LoadingRegionProps,
  SLOW_CAPTION,
} from "@/components/ui/loading-region";

/** Decorative placeholder block. Size it with className (h-4 w-40…). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block animate-pulse rounded-[8px] bg-surface-3/70 motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** Several text lines, the last one shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cx("flex flex-col gap-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx("h-3.5", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </span>
  );
}

/** A card-shaped placeholder. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx("rounded-card border border-line bg-surface/60 p-5", className)}
    >
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="mt-4 h-8 w-3/5" />
      <SkeletonText lines={2} className="mt-5" />
    </div>
  );
}
