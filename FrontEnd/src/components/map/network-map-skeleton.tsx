import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/lib/cx";

/** Loading state of the network map (same footprint as the map: no layout shift). */
export function NetworkMapSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "relative h-full w-full overflow-hidden rounded-panel border border-line bg-bg-2",
        className,
      )}
    >
      <span className="sr-only">Chargement de la carte du réseau…</span>
      <div aria-hidden="true" className="absolute inset-0 app-ground opacity-70" />
      <div
        aria-hidden="true"
        className="pixel-grid absolute inset-0 opacity-25 mix-blend-overlay"
      />
      <div aria-hidden="true" className="absolute top-3 left-3 flex gap-2">
        <Skeleton className="h-11 w-56 rounded-[14px] md:w-80" />
        <Skeleton className="size-11 rounded-[14px]" />
      </div>
      <div aria-hidden="true" className="absolute top-3 right-3 hidden flex-col gap-1.5 md:flex">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="size-11 rounded-[12px]" />
        ))}
      </div>
      <div aria-hidden="true" className="absolute top-3 right-3 md:hidden">
        <Skeleton className="size-11 rounded-[14px]" />
      </div>
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <span className="relative grid size-14 place-items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand-orange/20 motion-reduce:animate-none" />
            <span className="size-3 rounded-full bg-brand-orange-text shadow-brand" />
          </span>
          <span className="font-label text-xs font-semibold text-muted-2">
            Chargement de la carte
          </span>
        </div>
      </div>
      <div aria-hidden="true" className="absolute bottom-3 left-3">
        <Skeleton className="h-7 w-36 rounded-full" />
      </div>
    </div>
  );
}
