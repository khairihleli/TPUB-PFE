"use client";

import { type ReactNode, useId } from "react";

import { Field, Select } from "@/components/ui/field";
import { cx } from "@/lib/cx";
import { timeOptions, timeToMinutes } from "@/lib/date-input";
import { fromApiTime, formatTimeRangeLong } from "@/lib/format";

export const END_BEFORE_START_TIME_MESSAGE = "L'heure de fin doit suivre l'heure de début";

export interface TimeRangeValue {
  /** "HH:mm" */
  start: string;
  /** "HH:mm" */
  end: string;
}

export interface DayPartOption {
  label: string;
  start: string;
  end: string;
}

export interface TimeRangeFieldProps {
  value: TimeRangeValue;
  onChange: (value: TimeRangeValue) => void;
  /** Minutes between options (default 30 → 48 options). */
  step?: 15 | 30;
  /** Chips such as « Journée 08:00–20:00 » (passed by the consumer, e.g. from booking-plan). */
  dayParts?: readonly DayPartOption[];
  /** « de 09:00 à 18:00 · 9 h » (default true). */
  echo?: boolean;
  startLabel?: string;
  endLabel?: string;
  errors?: { start?: string | null; end?: string | null };
  disabled?: boolean;
  required?: boolean;
  /** Base id: `${id}-start` / `${id}-end`. */
  id?: string;
  hint?: ReactNode;
  className?: string;
}

/** Two 24 h selects (00:00 → 23:30), optional day-part chips and the French echo. */
export function TimeRangeField({
  value,
  onChange,
  step = 30,
  dayParts,
  echo = true,
  startLabel = "Heure de début",
  endLabel = "Heure de fin",
  errors,
  disabled,
  required,
  id,
  hint,
  className,
}: TimeRangeFieldProps) {
  const autoId = useId();
  const base = id ?? `tr${autoId.replace(/:/g, "")}`;
  const echoId = `${base}-echo`;
  const start = fromApiTime(value.start);
  const end = fromApiTime(value.end);
  const options = timeOptions(step);
  const withCurrent = (v: string) => (v && !options.includes(v) ? [...options, v].sort() : options);

  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  const orderError = s !== null && e !== null && e <= s ? END_BEFORE_START_TIME_MESSAGE : null;
  const activePart = dayParts?.find((p) => p.start === start && p.end === end);

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={startLabel}
          id={`${base}-start`}
          error={errors?.start}
          required={required}
          hint={hint}
        >
          <Select
            value={start}
            disabled={disabled}
            aria-describedby={echo ? echoId : undefined}
            onChange={(ev) => onChange({ start: ev.target.value, end })}
            placeholder={start ? undefined : "--:--"}
          >
            {withCurrent(start).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={endLabel}
          id={`${base}-end`}
          error={errors?.end ?? orderError}
          required={required}
        >
          <Select
            value={end}
            disabled={disabled}
            aria-describedby={echo ? echoId : undefined}
            onChange={(ev) => onChange({ start, end: ev.target.value })}
            placeholder={end ? undefined : "--:--"}
          >
            {withCurrent(end).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {/* Chips under the selects, like the date presets under the date inputs. */}
      {dayParts && dayParts.length > 0 ? (
        <div role="group" aria-label="Plages horaires" className="-mt-0.5 flex flex-wrap gap-1.5">
          {dayParts.map((part) => {
            const pressed = activePart === part;
            return (
              <button
                key={part.label}
                type="button"
                aria-pressed={pressed}
                disabled={disabled}
                onClick={() => onChange({ start: part.start, end: part.end })}
                className={cx(
                  "hit-area relative inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors disabled:opacity-50",
                  pressed
                    ? "border-brand-blue-text bg-blue-soft text-ink-strong"
                    : "border-line-strong text-ink-soft hover:border-muted-2 hover:bg-overlay-hover",
                )}
              >
                {part.label}
                <span className="text-muted tabular">
                  {part.start}–{part.end}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {echo ? (
        <p id={echoId} aria-live="polite" className="min-h-5 text-[0.8125rem] text-muted">
          {orderError ? "" : formatTimeRangeLong(start, end)}
        </p>
      ) : null}
    </div>
  );
}
