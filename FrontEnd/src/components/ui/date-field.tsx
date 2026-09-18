"use client";

/**
 * French date fields (UX-PLAN §8, FLOW-06/VD-22/FFA-20). Library-free: text entry « jj/mm/aaaa »
 * + WAI-ARIA APG date-picker dialog (radix Popover) + always-visible French echo.
 * Values are "YYYY-MM-DD" strings ("" when empty).
 */
import { CalendarDays, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { controlClasses, Field, useFieldContext } from "@/components/ui/field";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cx } from "@/lib/cx";
import {
  buildMonthGrid,
  type CalendarKey,
  DATE_PRESET_LABEL,
  type DatePreset,
  firstUnavailableRun,
  formatDayLong,
  formatFrDateInput,
  formatMonthTitle,
  isValidISODate,
  maskFrDateInput,
  moveCalendarFocus,
  parseFrDate,
  presetRange,
  startOfMonth,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
} from "@/lib/date-input";
import { formatDate, formatDateRangeLong, LOCALE, todayISO } from "@/lib/format";

export const INVALID_DATE_MESSAGE = "Date invalide (format jj/mm/aaaa)";
export const END_BEFORE_START_MESSAGE = "La date de fin doit suivre la date de début";

const CALENDAR_KEYS: readonly CalendarKey[] = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
];

function dayMonth(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** « Ce Porteur est déjà réservé du 14 au 20 sept. » */
export function defaultUnavailableMessage(range: { start: string; end: string }): string {
  const sameMonth = range.start.slice(0, 7) === range.end.slice(0, 7);
  const end = (text: string) => (text.endsWith(".") ? text : `${text}.`);
  if (range.start === range.end)
    return end(`Ce Porteur est déjà réservé le ${dayMonth(range.start)}`);
  const from = sameMonth ? String(Number(range.start.slice(8, 10))) : dayMonth(range.start);
  return end(`Ce Porteur est déjà réservé du ${from} au ${dayMonth(range.end)}`);
}

/**
 * Calendar closed (Escape, date chosen): focus the field again. When the user closed it by
 * clicking another control, that control keeps the focus.
 */
function returnFocusTo(id: string): void {
  const active = document.activeElement;
  if (active && active !== document.body && !active.closest("[data-calendar-popover]")) return;
  document.getElementById(id)?.focus();
}

// ---------------------------------------------------------------------------
// Calendar grid (APG)
// ---------------------------------------------------------------------------

interface CalendarProps {
  focused: string;
  onFocusedChange: (iso: string) => void;
  onSelect: (iso: string) => void;
  selected?: string | null;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  /** Preview end while choosing the second date of a range. */
  hover?: string | null;
  onHover?: (iso: string | null) => void;
  min?: string;
  max?: string;
  isDisabled?: (iso: string) => boolean;
  isUnavailable?: (iso: string) => boolean;
  today: string;
  /** Rendered above the grid (presets). */
  top?: ReactNode;
  /** Focus the focused day on mount (popover opened). */
  autoFocus?: boolean;
}

export function CalendarGrid({
  focused,
  onFocusedChange,
  onSelect,
  selected,
  rangeStart,
  rangeEnd,
  hover,
  onHover,
  min,
  max,
  isDisabled,
  isUnavailable,
  today,
  top,
  autoFocus = true,
}: CalendarProps) {
  const titleId = `cal${useId().replace(/:/g, "")}`;
  const gridRef = useRef<HTMLTableElement>(null);
  const month = startOfMonth(focused);
  const weeks = useMemo(() => buildMonthGrid(month), [month]);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (!autoFocus) return;
    }
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-iso="${focused}"]`)?.focus();
  }, [focused, autoFocus]);

  const disabled = (iso: string) =>
    Boolean((min && iso < min) || (max && iso > max) || isDisabled?.(iso));

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (!(CALENDAR_KEYS as readonly string[]).includes(e.key)) return;
    e.preventDefault();
    onFocusedChange(moveCalendarFocus(focused, e.key as CalendarKey, e.shiftKey));
  };

  const end = rangeEnd ?? (rangeStart && hover && hover >= rangeStart ? hover : null);

  return (
    <div className="w-[min(20.5rem,calc(100vw-3rem))]">
      {top}
      <div className="flex items-center justify-between gap-2 pb-2">
        <button
          type="button"
          aria-label="Mois précédent"
          onClick={() => onFocusedChange(moveCalendarFocus(focused, "PageUp"))}
          className="inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:bg-overlay-hover"
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <h2
          id={titleId}
          aria-live="polite"
          className="font-label text-sm font-semibold text-ink-strong"
        >
          {formatMonthTitle(month)}
        </h2>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() => onFocusedChange(moveCalendarFocus(focused, "PageDown"))}
          className="inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:bg-overlay-hover"
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onMouseLeave={() => onHover?.(null)}
        className="w-full border-collapse text-center"
      >
        <thead>
          <tr>
            {WEEKDAYS_SHORT.map((d, i) => (
              <th
                key={d}
                scope="col"
                abbr={WEEKDAYS_LONG[i]}
                className="pb-1 text-xs font-medium text-muted"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.iso}>
              {week.map((day) => {
                const isDisabledDay = disabled(day.iso);
                const unavailable = isUnavailable?.(day.iso) ?? false;
                const isSelected =
                  day.iso === selected || day.iso === rangeStart || day.iso === rangeEnd;
                const inRange = Boolean(rangeStart && end && day.iso > rangeStart && day.iso < end);
                const isToday = day.iso === today;
                const label = [
                  formatDayLong(day.iso),
                  isToday ? "aujourd'hui" : null,
                  unavailable || isDisabledDay ? "indisponible" : null,
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <td
                    key={day.iso}
                    role="gridcell"
                    aria-selected={isSelected || undefined}
                    className={cx("p-0.5", inRange && "bg-blue-soft")}
                  >
                    <button
                      type="button"
                      data-iso={day.iso}
                      tabIndex={day.iso === focused ? 0 : -1}
                      aria-label={label}
                      aria-disabled={isDisabledDay || unavailable || undefined}
                      onClick={() => {
                        if (isDisabledDay || unavailable) return;
                        onSelect(day.iso);
                      }}
                      onMouseEnter={() => onHover?.(day.iso)}
                      onFocus={() => onHover?.(day.iso)}
                      className={cx(
                        "relative inline-flex size-10 items-center justify-center rounded-[10px] text-sm tabular transition-colors",
                        day.inMonth ? "text-ink-soft" : "text-muted-2",
                        !isSelected && !isDisabledDay && !unavailable && "hover:bg-overlay-hover",
                        isSelected && "bg-brand-blue font-semibold text-on-brand",
                        (isDisabledDay || unavailable) &&
                          "cursor-not-allowed text-muted-2 line-through decoration-muted-2/70",
                        unavailable && !isSelected && "bg-danger/10",
                        isToday && !isSelected && "ring-1 ring-brand-blue-text ring-inset",
                      )}
                    >
                      {day.day}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Flèches pour naviguer, Page ↑/↓ pour changer de mois, Entrée pour choisir.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text input with mask
// ---------------------------------------------------------------------------

interface DateTextInputProps {
  id: string;
  value: string;
  onValue: (iso: string) => void;
  onFormatError: (message: string | null) => void;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  name?: string;
  onOpenCalendar: () => void;
  calendarLabel?: string;
}

function DateTextInput({
  id,
  value,
  onValue,
  onFormatError,
  describedBy,
  invalid,
  disabled,
  readOnly,
  required,
  name,
  onOpenCalendar,
  calendarLabel = "Choisir une date",
}: DateTextInputProps) {
  const [text, setText] = useState(() => formatFrDateInput(value));

  useEffect(() => {
    setText((current) =>
      (parseFrDate(current) ?? "") === value ? current : formatFrDateInput(value),
    );
  }, [value]);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="jj/mm/aaaa"
        maxLength={10}
        value={text}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const masked = maskFrDateInput(e.target.value);
          setText(masked);
          const parsed = parseFrDate(masked);
          if (parsed) {
            onFormatError(null);
            onValue(parsed);
          } else if (masked === "") {
            onFormatError(null);
            onValue("");
          }
        }}
        onBlur={() => {
          if (text && !parseFrDate(text)) onFormatError(INVALID_DATE_MESSAGE);
          else if (parseFrDate(text)) setText(formatFrDateInput(parseFrDate(text)));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && e.altKey) {
            e.preventDefault();
            onOpenCalendar();
          }
        }}
        className={cx(controlClasses, "pr-12 tabular")}
      />
      <button
        type="button"
        aria-label={calendarLabel}
        disabled={disabled || readOnly}
        onClick={onOpenCalendar}
        className="absolute top-1/2 right-0.5 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-overlay-hover hover:text-ink disabled:opacity-50"
      >
        <CalendarDays aria-hidden="true" className="size-[18px]" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DateField (single)
// ---------------------------------------------------------------------------

export interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  isDateDisabled?: (iso: string) => boolean;
  /** Control id (defaults to the parent Field id). */
  id?: string;
  name?: string;
  disabled?: boolean;
  /** Always-visible French echo « mercredi 10 février 2027 » (default true). */
  echo?: boolean;
  /** Called with the local format/bounds error (or null). */
  onValidityChange?: (message: string | null) => void;
  className?: string;
}

/** Put inside <Field label="Date de début">: `<DateField value={v} onChange={setV} min={today} />`. */
export function DateField({
  value,
  onChange,
  min,
  max,
  isDateDisabled,
  id,
  name,
  disabled,
  echo = true,
  onValidityChange,
  className,
}: DateFieldProps) {
  const ctx = useFieldContext();
  const autoId = `d${useId().replace(/:/g, "")}`;
  const controlId = id ?? ctx?.id ?? autoId;
  const echoId = `${controlId}-echo`;
  const errId = `${controlId}-format`;
  const [open, setOpen] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
  const today = todayISO();
  const [focused, setFocused] = useState(() => (isValidISODate(value) ? value : (min ?? today)));

  const boundsError =
    isValidISODate(value) && min && value < min
      ? `La date doit être au plus tôt le ${formatDate(min, "medium")}`
      : isValidISODate(value) && max && value > max
        ? `La date doit être au plus tard le ${formatDate(max, "medium")}`
        : null;
  const localError = formatError ?? boundsError;

  useEffect(() => {
    onValidityChange?.(localError);
  }, [localError, onValidityChange]);

  const describedBy =
    [ctx?.hintId, ctx?.errorId, localError && !ctx?.errorId ? errId : null, echo ? echoId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setFocused(isValidISODate(value) ? value : (min ?? today));
          setOpen(next);
        }}
      >
        <PopoverAnchor asChild>
          <div>
            <DateTextInput
              id={controlId}
              name={name}
              value={value}
              onValue={onChange}
              onFormatError={setFormatError}
              describedBy={describedBy}
              invalid={Boolean(ctx?.invalid || localError)}
              disabled={disabled ?? ctx?.disabled}
              required={ctx?.required}
              onOpenCalendar={() => {
                setFocused(isValidISODate(value) ? value : (min ?? today));
                setOpen(true);
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          aria-label="Choisir une date"
          role="dialog"
          data-calendar-popover=""
          onCloseAutoFocus={(e) => {
            // APG date picker: focus goes back to the text field (the anchor is not a trigger).
            e.preventDefault();
            returnFocusTo(controlId);
          }}
        >
          <CalendarGrid
            focused={focused}
            onFocusedChange={setFocused}
            selected={value || null}
            min={min}
            max={max}
            isDisabled={isDateDisabled}
            today={today}
            onSelect={(iso) => {
              onChange(iso);
              setFormatError(null);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {localError && !ctx?.errorId ? (
        <p id={errId} className="text-[0.8125rem] text-danger">
          {localError}
        </p>
      ) : null}
      {echo ? (
        <p id={echoId} aria-live="polite" className="min-h-5 text-[0.8125rem] text-muted">
          {isValidISODate(value) ? formatDayLong(value) : ""}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DateRangeField
// ---------------------------------------------------------------------------

export interface DateRangeValue {
  start: string;
  end: string;
}

export interface DateRangeFieldProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  min?: string;
  max?: string;
  /** Default ["1w", "2w", "1m"]; false hides presets. */
  presets?: false | readonly DatePreset[];
  /** Days that cannot be inside the range (booked Porteur). */
  unavailable?: (iso: string) => boolean;
  unavailableMessage?: (range: { start: string; end: string }) => string;
  /** « du mercredi 10 février au mardi 16 février 2027 · 7 jours » (default true). */
  echo?: boolean;
  startLabel?: string;
  endLabel?: string;
  errors?: { start?: string | null; end?: string | null };
  disabled?: boolean;
  /** Read-only with this reason (e.g. « La période est verrouillée : … »). */
  lockedReason?: string | null;
  required?: boolean;
  /** Base id: controls get `${id}-start` / `${id}-end` (for ErrorSummary links). */
  id?: string;
  hint?: ReactNode;
  className?: string;
}

/** Two Fields (Début / Fin) sharing one calendar popover, presets and the French echo. */
export function DateRangeField({
  value,
  onChange,
  min,
  max,
  presets = ["1w", "2w", "1m"],
  unavailable,
  unavailableMessage = defaultUnavailableMessage,
  echo = true,
  startLabel = "Début",
  endLabel = "Fin",
  errors,
  disabled,
  lockedReason,
  required,
  id,
  hint,
  className,
}: DateRangeFieldProps) {
  const autoId = useId();
  const base = id ?? `dr${autoId.replace(/:/g, "")}`;
  const startId = `${base}-start`;
  const endId = `${base}-end`;
  const echoId = `${base}-echo`;
  const lockId = `${base}-lock`;
  const today = todayISO();
  const locked = Boolean(lockedReason);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [focused, setFocused] = useState(() => value.start || min || today);
  const [hover, setHover] = useState<string | null>(null);
  const [formatErrors, setFormatErrors] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });
  const [conflict, setConflict] = useState<string | null>(null);
  /** Field that receives focus when the calendar closes. */
  const lastPicked = useRef<"start" | "end">("start");

  const validRange = isValidISODate(value.start) && isValidISODate(value.end);
  const orderError = validRange && value.end < value.start ? END_BEFORE_START_MESSAGE : null;
  const startError = errors?.start ?? formatErrors.start;
  const endError = errors?.end ?? formatErrors.end ?? orderError ?? conflict;

  const commit = (next: DateRangeValue): boolean => {
    if (
      unavailable &&
      isValidISODate(next.start) &&
      isValidISODate(next.end) &&
      next.end >= next.start
    ) {
      const run = firstUnavailableRun(next.start, next.end, unavailable);
      if (run) {
        setConflict(unavailableMessage(run));
        return false;
      }
    }
    setConflict(null);
    onChange(next);
    return true;
  };

  const openCalendar = (which: "start" | "end") => {
    setPicking(which);
    lastPicked.current = which;
    const anchor = which === "end" ? value.end || value.start : value.start;
    setFocused(isValidISODate(anchor) ? anchor : (min ?? today));
    setOpen(true);
  };

  const applyPreset = (preset: DatePreset) => {
    const range = presetRange(preset, value.start || null, today);
    const start = min && range.start < min ? min : range.start;
    const next = start === range.start ? range : presetRange(preset, start, today);
    if (commit(next)) setFocused(next.end);
  };

  const presetChips =
    presets && !locked ? (
      <div role="group" aria-label="Durées rapides" className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => applyPreset(p)}
            className="hit-area relative inline-flex min-h-8 items-center rounded-full border border-line-strong px-3 text-[0.8125rem] font-medium text-ink-soft transition-colors hover:border-muted-2 hover:bg-overlay-hover disabled:opacity-50"
          >
            {DATE_PRESET_LABEL[p]}
          </button>
        ))}
      </div>
    ) : null;

  const describedBy = (own: string | null) =>
    [own, locked ? lockId : null, echo ? echoId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <Popover open={open && !locked} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Field
              label={startLabel}
              id={startId}
              error={startError}
              required={required}
              hint={hint}
            >
              <RangeInput
                id={startId}
                value={value.start}
                disabled={disabled}
                locked={locked}
                describedBy={describedBy}
                onValue={(start) => {
                  setFormatErrors((f) => ({ ...f, start: null }));
                  commit({ start, end: value.end });
                }}
                onFormatError={(m) => setFormatErrors((f) => ({ ...f, start: m }))}
                onOpenCalendar={() => openCalendar("start")}
                calendarLabel="Choisir la date de début"
              />
            </Field>
            <Field label={endLabel} id={endId} error={endError} required={required}>
              <RangeInput
                id={endId}
                value={value.end}
                disabled={disabled}
                locked={locked}
                describedBy={describedBy}
                onValue={(end) => {
                  setFormatErrors((f) => ({ ...f, end: null }));
                  commit({ start: value.start, end });
                }}
                onFormatError={(m) => setFormatErrors((f) => ({ ...f, end: m }))}
                onOpenCalendar={() => openCalendar("end")}
                calendarLabel="Choisir la date de fin"
              />
            </Field>
          </div>
        </PopoverAnchor>
        <PopoverContent
          aria-label="Choisir la période"
          role="dialog"
          data-calendar-popover=""
          onCloseAutoFocus={(e) => {
            // APG date picker: focus returns to the field that opened the calendar (end after a
            // completed range), never to <body>.
            e.preventDefault();
            returnFocusTo(lastPicked.current === "end" ? endId : startId);
          }}
        >
          <CalendarGrid
            focused={focused}
            onFocusedChange={setFocused}
            rangeStart={value.start || null}
            rangeEnd={picking === "end" && hover ? null : value.end || null}
            hover={picking === "end" ? hover : null}
            onHover={setHover}
            min={min}
            max={max}
            isUnavailable={unavailable}
            today={today}
            top={presetChips ? <div className="pb-3">{presetChips}</div> : null}
            onSelect={(iso) => {
              if (picking === "start" || !value.start || iso < value.start) {
                const keepEnd = value.end && value.end >= iso ? value.end : "";
                commit({ start: iso, end: keepEnd });
                setPicking("end");
                return;
              }
              if (commit({ start: value.start, end: iso })) {
                lastPicked.current = "end";
                setOpen(false);
                setPicking("start");
              }
            }}
          />
          {conflict ? (
            <p role="alert" className="mt-2 max-w-[20.5rem] text-[0.8125rem] text-danger">
              {conflict}
            </p>
          ) : null}
        </PopoverContent>
      </Popover>

      {presetChips ? <div className="-mt-0.5">{presetChips}</div> : null}

      {locked ? (
        <p id={lockId} className="flex items-start gap-1.5 text-[0.8125rem] text-muted">
          <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {lockedReason}
        </p>
      ) : null}

      {echo ? (
        <p id={echoId} aria-live="polite" className="min-h-5 text-[0.8125rem] text-muted">
          {validRange && !orderError ? (
            formatDateRangeLong(value.start, value.end)
          ) : !value.start && !value.end && !locked ? (
            // Empty range: the reserved line explains the input instead of leaving a gap.
            <span className="text-muted-2">
              {presetChips
                ? "Saisissez jj/mm/aaaa, ou choisissez dans le calendrier ou une durée rapide."
                : "Saisissez jj/mm/aaaa, ou choisissez dans le calendrier."}
            </span>
          ) : (
            ""
          )}
        </p>
      ) : null}
    </div>
  );
}

function RangeInput({
  id,
  value,
  disabled,
  locked,
  describedBy,
  onValue,
  onFormatError,
  onOpenCalendar,
  calendarLabel,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  locked: boolean;
  describedBy: (own: string | null) => string | undefined;
  onValue: (iso: string) => void;
  onFormatError: (message: string | null) => void;
  onOpenCalendar: () => void;
  calendarLabel: string;
}) {
  const ctx = useFieldContext();
  const own = [ctx?.hintId, ctx?.errorId].filter(Boolean).join(" ") || null;
  return (
    <DateTextInput
      id={id}
      value={value}
      onValue={onValue}
      onFormatError={onFormatError}
      describedBy={describedBy(own)}
      invalid={ctx?.invalid}
      disabled={disabled}
      readOnly={locked}
      required={ctx?.required}
      onOpenCalendar={onOpenCalendar}
      calendarLabel={calendarLabel}
    />
  );
}
