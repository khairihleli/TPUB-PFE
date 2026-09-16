"use client";

import { ArrowRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import type { ScheduleDraft } from "@/components/network/booking-plan";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cx } from "@/lib/cx";
import { formatDate } from "@/lib/format";
import {
  DAY_STATUS_LABEL,
  isISODate,
  type CalendarDay,
  type DayStatus,
} from "@/lib/network/availability";
import { useReducedMotion } from "@/lib/use-reduced-motion";

const WEEKDAY_LETTER = ["D", "L", "M", "M", "J", "V", "S"] as const;
const WEEKDAY_NAME = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTH_SHORT = new Intl.DateTimeFormat("fr-TN", { month: "short", timeZone: "UTC" });

const HATCH: Record<Exclude<DayStatus, "libre">, string> = {
  temporaire:
    "border-warning/45 text-warning bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--color-warning)_30%,transparent)_0_2px,transparent_2px_6px)]",
  confirmee:
    "border-danger/50 text-danger bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--color-danger)_34%,transparent)_0_2px,transparent_2px_6px)]",
};

export interface AvailabilityStripProps {
  days: CalendarDay[];
  draft: ScheduleDraft;
  /** First click done, waiting for the end day. */
  awaitingEnd: boolean;
  onPick: (day: string) => void;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Read-only (campaign period locked): days stay readable, picking is off. */
  disabled?: boolean;
  /** First day of the next free window: shows « Prochain créneau libre » when days are booked. */
  nextFreeDate?: string | null;
  className?: string;
}

function inRange(day: string, draft: ScheduleDraft): boolean {
  return (
    isISODate(draft.startDate) &&
    isISODate(draft.endDate) &&
    day >= draft.startDate &&
    day <= draft.endDate
  );
}

/**
 * 60-day availability strip of one Porteur (GET /supports/{id}/availability). A booked day is
 * unavailable all day (backend rule). Days are buttons: click = start, second click = end.
 * One tab stop, arrow keys / Home / End move between days.
 */
export function AvailabilityStrip({
  days,
  draft,
  awaitingEnd,
  onPick,
  loading,
  error,
  onRetry,
  disabled = false,
  nextFreeDate = null,
  className,
}: AvailabilityStripProps) {
  const reduce = useReducedMotion();
  const legendId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef(new Map<string, HTMLButtonElement>());
  const [rovingDay, setRovingDay] = useState<string | null>(null);

  const focusDay = useMemo(() => {
    if (rovingDay && days.some((d) => d.date === rovingDay)) return rovingDay;
    const first = days[0]?.date;
    if (isISODate(draft.startDate) && days.some((d) => d.date === draft.startDate)) {
      return draft.startDate;
    }
    return first ?? null;
  }, [days, draft.startDate, rovingDay]);

  const blockedInRange = days.filter((d) => d.blocked && inRange(d.date, draft)).length;
  const freeCount = days.filter((d) => !d.blocked).length;
  const canJump =
    !disabled &&
    nextFreeDate !== null &&
    freeCount < days.length &&
    days.some((d) => d.date === nextFreeDate);

  const scrollToDay = (day: string | null) => {
    const scroller = scrollerRef.current;
    const el = day ? buttonsRef.current.get(day) : undefined;
    if (!scroller || !el) return;
    const left = el.offsetLeft - scroller.clientWidth / 2 + el.clientWidth / 2;
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
    }
  };

  // keep the chosen start in view
  useEffect(() => {
    scrollToDay(isISODate(draft.startDate) ? draft.startDate : (days[0]?.date ?? null));
    // Only a new start (or a new strip) should scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.startDate, days.length, reduce]);

  /** « Prochain créneau libre »: scroll to the first free window and put focus on its first day. */
  const jumpToNextFree = () => {
    if (!nextFreeDate) return;
    setRovingDay(nextFreeDate);
    scrollToDay(nextFreeDate);
    buttonsRef.current.get(nextFreeDate)?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === "ArrowRight") next = index + 1;
    else if (e.key === "ArrowLeft") next = index - 1;
    else if (e.key === "ArrowDown") next = index + 7;
    else if (e.key === "ArrowUp") next = index - 7;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = days.length - 1;
    else return;
    e.preventDefault();
    const day = days[Math.max(0, Math.min(days.length - 1, next))];
    if (day) buttonsRef.current.get(day.date)?.focus();
  };

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-label text-[0.8125rem] font-medium text-ink-soft">
          Disponibilités · {days.length || 60} prochains jours
        </p>
        {!loading && !error && days.length > 0 ? (
          <p className="text-[0.75rem] text-muted tabular" aria-live="polite">
            {freeCount === days.length
              ? "Aucune période réservée"
              : `${freeCount} jour${freeCount > 1 ? "s" : ""} libre${freeCount > 1 ? "s" : ""} sur ${days.length}`}
          </p>
        ) : null}
        {canJump && !loading && !error ? (
          <button
            type="button"
            onClick={jumpToNextFree}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control px-2 font-label text-[0.8125rem] font-semibold text-brand-blue-text transition-colors hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-brand-blue-text"
          >
            Prochain créneau libre
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>

      {error ? (
        <ErrorState compact error={error} onRetry={onRetry} title="Disponibilités indisponibles" />
      ) : loading && days.length === 0 ? (
        <div role="status" aria-label="Chargement des disponibilités…" className="flex gap-1">
          {Array.from({ length: 14 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-9 shrink-0 rounded-[10px]" />
          ))}
        </div>
      ) : (
        <div className="relative">
          <div
            ref={scrollerRef}
            role="group"
            aria-label="Calendrier des disponibilités du Porteur"
            aria-describedby={legendId}
            aria-busy={loading || undefined}
            className="no-scrollbar -mx-1 flex snap-x gap-1 overflow-x-auto px-1 pt-5 pb-1"
          >
            {days.map((d, index) => {
              const selected = inRange(d.date, draft);
              const isStart = d.date === draft.startDate;
              const isEnd = d.date === draft.endDate;
              const conflict = selected && d.blocked;
              const weekend = d.weekday === 0 || d.weekday === 6;
              const dayNumber = Number(d.date.slice(8, 10));
              const showMonth = index === 0 || d.monthStart;
              return (
                <div
                  key={d.date}
                  className="relative flex shrink-0 snap-start flex-col items-center"
                >
                  {showMonth ? (
                    <span
                      aria-hidden="true"
                      className="absolute -top-5 left-0 font-label text-[0.75rem] font-semibold whitespace-nowrap text-muted-2"
                    >
                      {MONTH_SHORT.format(new Date(`${d.date}T00:00:00Z`)).replace(".", "")}
                    </span>
                  ) : null}
                  <button
                    ref={(el) => {
                      if (el) buttonsRef.current.set(d.date, el);
                      else buttonsRef.current.delete(d.date);
                    }}
                    type="button"
                    tabIndex={d.date === focusDay ? 0 : -1}
                    aria-pressed={selected}
                    aria-label={`${WEEKDAY_NAME[d.weekday]} ${formatDate(d.date, "long")} — ${DAY_STATUS_LABEL[d.status]}${
                      selected
                        ? conflict
                          ? " — dans votre créneau, en conflit"
                          : " — dans votre créneau"
                        : ""
                    }`}
                    aria-disabled={disabled || undefined}
                    onClick={() => {
                      if (!disabled) onPick(d.date);
                    }}
                    onFocus={() => setRovingDay(d.date)}
                    onKeyDown={(e) => onKeyDown(e, index)}
                    className={cx(
                      disabled ? "cursor-default" : "cursor-pointer",
                      "relative flex h-14 w-9 flex-col items-center justify-center gap-0.5 rounded-[10px] border font-label transition-[background-color,border-color,box-shadow,transform] duration-200 ease-smooth focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
                      d.status === "libre"
                        ? selected
                          ? "border-brand-blue-text/70 bg-brand-blue text-on-brand shadow-blue"
                          : "border-line bg-overlay-subtle text-ink-soft hover:-translate-y-0.5 hover:border-line-strong hover:bg-overlay-hover"
                        : HATCH[d.status],
                      conflict && "ring-2 ring-danger ring-offset-1 ring-offset-surface",
                      (isStart || isEnd) && !conflict && "ring-2 ring-brand-blue-text/70",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        "text-[0.75rem] font-bold",
                        selected && d.status === "libre"
                          ? "text-on-brand/80"
                          : weekend
                            ? "text-brand-orange-text/80"
                            : "text-muted-2",
                      )}
                    >
                      {WEEKDAY_LETTER[d.weekday]}
                    </span>
                    <span aria-hidden="true" className="text-[0.8125rem] font-semibold tabular">
                      {dayNumber}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-[linear-gradient(90deg,transparent,var(--color-surface))]"
          />
        </div>
      )}

      <ul
        id={legendId}
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.75rem] text-muted"
      >
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-3 rounded-[4px] border border-line bg-overlay-subtle"
          />
          Disponible
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cx("size-3 rounded-[4px] border", HATCH.temporaire)}
          />
          Réservé (temporaire)
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cx("size-3 rounded-[4px] border", HATCH.confirmee)} />
          Réservé (confirmé)
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-3 rounded-[4px] border border-brand-blue-text/70 bg-brand-blue"
          />
          Votre créneau
        </li>
      </ul>

      <p className="text-[0.75rem] leading-relaxed text-muted">
        {disabled
          ? "La période suit la campagne choisie."
          : awaitingEnd
            ? "Choisissez maintenant le dernier jour de diffusion."
            : "Touchez un jour pour commencer le créneau, puis un second pour le terminer."}{" "}
        Un jour déjà réservé est indisponible toute la journée sur ce Porteur.
        {blockedInRange > 0 ? (
          <span className="text-danger">
            {" "}
            {blockedInRange} jour{blockedInRange > 1 ? "s" : ""} de votre créneau{" "}
            {blockedInRange > 1 ? "sont" : "est"} déjà réservé{blockedInRange > 1 ? "s" : ""}.
          </span>
        ) : null}
      </p>
    </div>
  );
}
