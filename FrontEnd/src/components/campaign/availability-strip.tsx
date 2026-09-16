"use client";

import { useMemo } from "react";

import type { SupportAvailabilitySlot } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDate } from "@/lib/format";
import { buildCalendarStrip, DAY_STATUS_LABEL } from "@/lib/network/availability";

const MONTH = new Intl.DateTimeFormat("fr-TN", { month: "short", timeZone: "UTC" });
const DAY_LETTER = ["D", "L", "M", "M", "J", "V", "S"] as const;

const HATCH =
  "bg-[repeating-linear-gradient(135deg,var(--color-warning)_0_2px,transparent_2px_5px)]";

/**
 * 60-day availability strip of one Porteur (backend conflict rule: a covered day is unavailable
 * for the whole day). The strip is visual; the blocked periods are also listed as text.
 */
export function AvailabilityStrip({
  slots,
  from,
  days = 60,
  highlight,
  className,
}: {
  slots: readonly SupportAvailabilitySlot[];
  /** First day (usually today). */
  from: string;
  days?: number;
  /** Requested period, outlined in blue. */
  highlight?: { start: string; end: string } | null;
  className?: string;
}) {
  const strip = useMemo(() => buildCalendarStrip(slots, from, days), [slots, from, days]);
  const blockedCount = strip.filter((d) => d.blocked).length;
  const periods = useMemo(
    () => [...slots].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [slots],
  );

  return (
    <div className={cx("flex flex-col gap-2.5", className)}>
      <div aria-hidden="true" className="no-scrollbar -mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max items-end gap-[3px]">
          {strip.map((day, i) => {
            const inRange =
              highlight !== null &&
              highlight !== undefined &&
              day.date >= highlight.start &&
              day.date <= highlight.end;
            const showMonth = i === 0 || day.monthStart;
            return (
              <div key={day.date} className="flex w-[16px] flex-col items-center gap-1">
                <span className="h-4 font-label text-[0.75rem] leading-4 whitespace-nowrap text-muted">
                  {showMonth ? MONTH.format(new Date(`${day.date}T00:00:00Z`)) : ""}
                </span>
                <span
                  title={`${formatDate(day.date, "medium")} — ${DAY_STATUS_LABEL[day.status]}`}
                  className={cx(
                    "block h-7 w-full rounded-[4px] border",
                    day.status === "libre"
                      ? "border-success/25 bg-success/15"
                      : day.status === "confirmee"
                        ? "border-danger/40 bg-danger/30"
                        : cx("border-warning/40 bg-warning/10", HATCH),
                    inRange && "ring-2 ring-brand-blue-text ring-offset-1 ring-offset-bg",
                  )}
                />
                <span
                  className={cx(
                    "text-[0.75rem] leading-none",
                    day.weekday === 0 || day.weekday === 6 ? "text-ink-soft" : "text-muted",
                  )}
                >
                  {DAY_LETTER[day.weekday]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <ul aria-hidden="true" className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-muted">
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-success/25 bg-success/15" />
          Disponible
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className={cx("size-2.5 rounded-[3px] border border-warning/40", HATCH)} />
          Réservé (temporaire)
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] border border-danger/40 bg-danger/30" />
          Réservé (confirmé)
        </li>
        {highlight ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] ring-2 ring-brand-blue-text" />
            Période de la campagne
          </li>
        ) : null}
      </ul>

      <div className="text-[0.75rem] text-muted">
        <p>
          {blockedCount === 0
            ? `Aucun jour réservé sur les ${days} prochains jours.`
            : `${blockedCount} jour${blockedCount > 1 ? "s" : ""} réservé${blockedCount > 1 ? "s" : ""} sur les ${days} prochains jours.`}
        </p>
        {periods.length > 0 ? (
          <ul className="sr-only">
            {periods.map((p, i) => (
              <li key={`${p.startDate}-${i}`}>
                Du {formatDate(p.startDate, "medium")} au {formatDate(p.endDate, "medium")} :{" "}
                {p.reservationStatus === "CONFIRMEE"
                  ? "réservé (confirmé)"
                  : "réservé (temporaire)"}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
