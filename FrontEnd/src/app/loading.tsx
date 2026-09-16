export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60dvh] items-center justify-center"
    >
      <span className="sr-only">Chargement…</span>
      <span aria-hidden="true" className="flex items-center gap-1.5">
        <span className="size-2 animate-pulse rounded-full bg-brand-red" />
        <span className="size-2 animate-pulse rounded-full bg-brand-orange [animation-delay:150ms]" />
        <span className="size-2 animate-pulse rounded-full bg-brand-blue-text [animation-delay:300ms]" />
      </span>
    </div>
  );
}
