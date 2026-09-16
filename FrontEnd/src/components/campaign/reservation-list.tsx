import { Box, MapPin } from "lucide-react";
import Link from "next/link";

import type { JoinedReservation } from "@/components/campaign/campaign-data";
import { SUPPORT_TYPE_ICON } from "@/components/campaign/campaign-ui";
import { StatusPill } from "@/components/ui/status-pill";
import { SUPPORT_TYPE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatDateRange, formatTimeRange, formatTND } from "@/lib/format";
import { routes } from "@/lib/routes";

export interface ReservationListProps {
  reservations: readonly JoinedReservation[];
  /** Show the per-line estimated cost. */
  showCost?: boolean;
  dense?: boolean;
  /**
   * Porteur name → Studio 3D (`/espace/reseau?porteur=`) with a visible « Voir en 3D » link,
   * zone name → map zone (IA-06, IA-13). Default true.
   */
  links?: boolean;
  /** « Bloqué · en attente de décision TPUB » instead of « Bloqué » (glossary long labels). */
  longStatus?: boolean;
  className?: string;
}

const LINK_CLASS =
  "rounded-sm underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text";

/** Créneaux joined with Porteur and zone names. A list (not a table) so it stacks on mobile. */
export function ReservationList({
  reservations,
  showCost = false,
  dense = false,
  links = true,
  longStatus = false,
  className,
}: ReservationListProps) {
  return (
    <ul
      className={cx(
        "divide-y divide-line overflow-hidden rounded-card border border-line",
        className,
      )}
    >
      {reservations.map((r) => {
        const Icon = r.supportType ? SUPPORT_TYPE_ICON[r.supportType] : MapPin;
        const porteurHref = routes.espace.network({ porteur: r.supportId });
        return (
          <li
            key={r.id}
            className={cx(
              "grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-2 bg-surface sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center",
              dense ? "px-4 py-3" : "px-4 py-4 sm:px-5",
            )}
          >
            <span
              aria-hidden="true"
              className="hidden size-10 items-center justify-center rounded-control border border-line bg-surface-2 text-brand-blue-text sm:inline-flex"
            >
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="font-label text-[0.9375rem] font-semibold break-words text-ink-strong">
                {links ? (
                  <Link href={porteurHref} className={LINK_CLASS}>
                    {r.supportName}
                  </Link>
                ) : (
                  r.supportName
                )}
              </p>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                {r.supportType ? `${SUPPORT_TYPE_LABEL[r.supportType]} · ` : ""}
                {links ? (
                  <Link
                    href={routes.espace.network({ zone: r.zoneId })}
                    className={cx(LINK_CLASS, "text-ink-soft")}
                  >
                    <span className="sr-only">Zone </span>
                    {r.zoneName}
                  </Link>
                ) : (
                  r.zoneName
                )}
              </p>
              {/* Dates and hours never split mid-range: two lines on phones, one from sm. */}
              <p className="mt-1 flex flex-col text-[0.8125rem] text-ink-soft tabular sm:flex-row sm:flex-wrap sm:gap-x-2">
                <span className="whitespace-nowrap">
                  {formatDateRange(r.startDate, r.endDate, "medium")}
                </span>
                <span aria-hidden="true" className="hidden text-muted-2 sm:inline">
                  ·
                </span>
                <span className="whitespace-nowrap">
                  <span className="sr-only">, </span>
                  {formatTimeRange(r.startTime, r.endTime)}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
              <StatusPill
                type="reservation"
                status={r.reservationStatus}
                long={longStatus}
                size="sm"
              />
              {showCost ? (
                <span className="text-[0.8125rem] whitespace-nowrap text-muted tabular">
                  <span className="sr-only">Coût estimé : </span>
                  {formatTND(r.estimatedCost)}
                </span>
              ) : null}
              {links ? (
                <Link
                  href={porteurHref}
                  className="inline-flex min-h-touch items-center gap-1.5 rounded-control px-1 font-label text-[0.8125rem] font-semibold text-brand-blue-text transition-colors hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text sm:min-h-8"
                >
                  <Box aria-hidden="true" className="size-4" />
                  Voir en 3D
                  <span className="sr-only"> : {r.supportName}</span>
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
