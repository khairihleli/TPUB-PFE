"use client";

import { useId, useState } from "react";

import { TimeRangeField } from "@/components/ui/time-range-field";
import { cx } from "@/lib/cx";
import { fromApiTime } from "@/lib/format";
import {
  PERSONNALISE,
  presetOf,
  SLOT_CHOICES,
  type SlotChoice,
  slotWindow,
} from "@/lib/time-slots";

export interface SlotPresetFieldProps {
  /** "HH:mm" (or "HH:mm:ss") */
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  errors?: { start?: string | null; end?: string | null };
  disabled?: boolean;
  /** Base id of the custom time selects (`${id}-start` / `${id}-end`). */
  id: string;
  legend?: string;
}

/** Choice shown as selected: an explicit « Personnalisé » wins over a matching preset. */
export function selectedSlotChoice(start: string, end: string, forceCustom: boolean): SlotChoice {
  return forceCustom ? PERSONNALISE : presetOf(start, end);
}

/**
 * « Créneau horaire » (CdC §3.7): matin, après-midi, soir, journée complète or custom hours.
 * A native radio group; « Personnalisé » reveals the two time selects.
 */
export function SlotPresetField({
  start,
  end,
  onChange,
  errors,
  disabled = false,
  id,
  legend = "Créneau horaire",
}: SlotPresetFieldProps) {
  const name = useId();
  const [forceCustom, setForceCustom] = useState(
    () => Boolean(start && end) && presetOf(start, end) === PERSONNALISE,
  );
  const choice = selectedSlotChoice(start, end, forceCustom);

  const select = (next: SlotChoice) => {
    if (next === PERSONNALISE) {
      setForceCustom(true);
      return;
    }
    setForceCustom(false);
    const w = slotWindow(next);
    onChange({ start: fromApiTime(w.startTime), end: fromApiTime(w.endTime) });
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="mb-2 font-label text-[0.875rem] font-semibold text-ink-strong">
        {legend}
        <span aria-hidden="true" className="ml-0.5 text-danger">
          *
        </span>
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        {SLOT_CHOICES.map((c) => {
          const checked = c.id === choice;
          return (
            <label
              key={c.id}
              className={cx(
                "flex min-h-touch cursor-pointer items-center gap-3 rounded-control border px-3.5 py-2 text-[0.875rem] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue-text",
                checked
                  ? "border-brand-blue-text/60 bg-blue-soft text-ink-strong"
                  : "border-line-strong text-ink-soft hover:border-muted-2",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={c.id}
                checked={checked}
                onChange={() => select(c.id)}
                className="size-4 accent-[var(--color-brand-blue)]"
              />
              {c.label}
            </label>
          );
        })}
      </div>
      {choice === PERSONNALISE ? (
        <TimeRangeField
          id={id}
          value={{ start: fromApiTime(start), end: fromApiTime(end) }}
          onChange={(next) => onChange(next)}
          errors={errors}
          disabled={disabled}
          required
        />
      ) : errors?.start || errors?.end ? (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {errors.start ?? errors.end}
        </p>
      ) : null}
    </fieldset>
  );
}
