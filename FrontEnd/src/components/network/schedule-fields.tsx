"use client";

import {
  scheduleTimes,
  scheduleWithTimes,
  type ScheduleDraft,
  type ScheduleField,
} from "@/components/network/booking-plan";
import { DateRangeField } from "@/components/ui/date-field";
import { TimeRangeField } from "@/components/ui/time-range-field";
import { cx } from "@/lib/cx";
import { DAY_PARTS, isISODate } from "@/lib/network/availability";

/** Day-part chips of the TimeRangeField (« Journée 08:00–22:00 »…), « Personnalisé » excluded. */
export const SCHEDULE_DAY_PARTS = DAY_PARTS.flatMap((p) =>
  p.start && p.end ? [{ label: p.label, start: p.start, end: p.end }] : [],
);

/** Control ids of the schedule fields, for focus management and error links. */
export function scheduleFieldIds(idPrefix: string) {
  return {
    period: `${idPrefix}-periode`,
    start: `${idPrefix}-periode-start`,
    end: `${idPrefix}-periode-end`,
    times: `${idPrefix}-horaires`,
    timeStart: `${idPrefix}-horaires-start`,
  };
}

export interface ScheduleFieldsProps {
  draft: ScheduleDraft;
  onChange: (draft: ScheduleDraft) => void;
  errors: Partial<Record<ScheduleField, string>>;
  /** Minimum start date (Africa/Tunis today). */
  today: string;
  /** Prefix for control ids (focus management). */
  idPrefix: string;
  disabled?: boolean;
  /** Read-only dates and times with this reason (e.g. « Période de la campagne »). */
  lockedReason?: string | null;
  /** Booked days of the Porteur: a range crossing one is not committed (French message). */
  unavailable?: (iso: string) => boolean;
  /** Hide the errors until the user tried to book (avoid shouting on first render). */
  showErrors?: boolean;
  className?: string;
}

/**
 * Période (French DateRangeField: jj/mm/aaaa, calendar, presets, echo) + tranche horaire
 * (TimeRangeField: 24 h selects and day-part chips). Values stay YYYY-MM-DD and HH:mm.
 */
export function ScheduleFields({
  draft,
  onChange,
  errors,
  today,
  idPrefix,
  disabled = false,
  lockedReason = null,
  unavailable,
  showErrors = true,
  className,
}: ScheduleFieldsProps) {
  const e = showErrors ? errors : {};
  const ids = scheduleFieldIds(idPrefix);
  const times = scheduleTimes(draft);
  const locked = Boolean(lockedReason);

  return (
    <div className={cx("flex min-w-0 flex-col gap-4", className)}>
      <DateRangeField
        id={ids.period}
        value={{ start: draft.startDate, end: draft.endDate }}
        min={today}
        presets={["1w", "2w", "1m"]}
        unavailable={unavailable}
        lockedReason={lockedReason}
        disabled={disabled}
        required
        errors={{ start: e.startDate, end: e.endDate }}
        onChange={({ start, end }) => {
          // A start after the current end moves the end with it (one-day period).
          const endDate =
            isISODate(start) && isISODate(end) && end < start && start !== draft.startDate
              ? start
              : end;
          onChange({ ...draft, startDate: start, endDate });
        }}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-label text-[0.8125rem] font-medium text-ink-soft">Tranche horaire</p>
        <TimeRangeField
          id={ids.times}
          value={{ start: times.start ?? draft.customStart, end: times.end ?? draft.customEnd }}
          dayParts={locked ? undefined : SCHEDULE_DAY_PARTS}
          disabled={disabled || locked}
          required
          errors={{ end: e.times }}
          onChange={({ start, end }) => onChange(scheduleWithTimes(draft, start, end))}
        />
      </div>
    </div>
  );
}
