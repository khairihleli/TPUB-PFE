import { cx } from "@/lib/cx";

/**
 * Placeholder while the Studio 3D chunk (three.js) downloads. Silhouette of a Porteur on a dark
 * stage so the layout does not jump.
 */
export function PorteurStudioSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "relative isolate flex aspect-[4/3] min-h-[320px] w-full items-center justify-center overflow-hidden rounded-panel border border-line bg-bg sm:aspect-[16/10]",
        className,
      )}
    >
      <span className="sr-only">Chargement du studio 3D…</span>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_35%,var(--color-blue-soft),transparent_70%)]"
      />
      <div aria-hidden="true" className="hairline-tricolor absolute inset-x-0 top-0 opacity-70" />
      <div aria-hidden="true" className="relative flex h-[72%] flex-col items-center">
        <span className="size-7 animate-pulse rounded-full bg-orange-soft ring-1 ring-orange-line motion-reduce:animate-none" />
        <span className="h-[8%] w-0.5 bg-surface-3" />
        <span className="h-1.5 w-24 -skew-y-6 rounded-full bg-surface-3" />
        <span className="h-[46%] w-1.5 rounded-full bg-[linear-gradient(90deg,var(--color-surface-2),var(--color-surface-3),var(--color-surface-2))]" />
        <span className="h-[12%] w-10 animate-pulse rounded-[6px] bg-red-soft ring-1 ring-red-line motion-reduce:animate-none" />
        <span className="h-[20%] w-2 bg-[linear-gradient(90deg,var(--color-surface-2),var(--color-surface-3),var(--color-surface-2))]" />
        <span className="h-2 w-12 rounded-full bg-surface-3" />
      </div>
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 font-label text-[0.75rem] font-semibold text-muted">
        Préparation du studio 3D
      </p>
    </div>
  );
}
