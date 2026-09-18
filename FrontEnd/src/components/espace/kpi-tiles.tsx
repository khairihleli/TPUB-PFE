import { Amount, EstimateTag } from "@/components/espace/espace-ui";
import type { KpiTileData } from "@/components/espace/kpis";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/lib/cx";
import { formatNumber } from "@/lib/format";

/** Tiles of `mineKpis` with the « mesuré / estimation » label on every figure. */
export function KpiTiles({
  tiles,
  loading = false,
  labelledBy,
  className,
}: {
  tiles: readonly KpiTileData[];
  loading?: boolean;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <dl
      aria-labelledby={labelledBy}
      className={cx(
        "grid grid-cols-[minmax(0,1fr)] gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6",
        className,
      )}
    >
      {tiles.map((t) => (
        <div
          key={t.key}
          className="flex min-w-0 flex-col gap-1.5 rounded-card border border-line bg-grad-card p-4"
        >
          <dt className="flex flex-wrap items-center gap-2 font-label text-[0.8125rem] font-medium text-muted">
            {t.label}
            {t.source === "estimation" ? (
              <EstimateTag />
            ) : t.source === "mesure" ? (
              <Badge tone="neutral" size="sm">
                Mesuré
              </Badge>
            ) : null}
          </dt>
          <dd className="font-display text-[1.5rem] leading-none font-semibold text-ink-strong tabular">
            {loading ? (
              <Skeleton className="h-6 w-20" />
            ) : t.kind === "money" ? (
              <Amount value={t.value} />
            ) : (
              formatNumber(t.value)
            )}
          </dd>
          <dd className="text-[0.75rem] leading-snug text-muted">{t.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
