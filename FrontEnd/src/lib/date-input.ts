/**
 * French date/time input helpers (UX-PLAN §8). Pure, SSR-safe, no timezone drift:
 * calendar dates are "YYYY-MM-DD" strings handled in UTC arithmetic. Times are "HH:mm".
 * Today is always computed in Africa/Tunis through `todayISO()` from `@/lib/format`.
 */
import { LOCALE } from "@/lib/format";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function utc(y: number, m: number, d: number): number {
  return Date.UTC(y, m, d, 12);
}

function fromParts(y: number, m1: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m1) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2999 || m1 < 1 || m1 > 12 || d < 1 || d > 31) return null;
  const date = new Date(utc(y, m1 - 1, d));
  if (date.getUTCMonth() !== m1 - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toMs(iso: string): number | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  return fromParts(Number(m[1]), Number(m[2]), Number(m[3]))
    ? utc(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : null;
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** True for a real calendar date "YYYY-MM-DD". */
export function isValidISODate(value: unknown): value is string {
  return typeof value === "string" && toMs(value) !== null;
}

/**
 * Parses French user input into "YYYY-MM-DD", or null.
 * Accepts « 10/02/2027 », « 1/2/2027 », « 10.02.2027 », « 10-02-2027 », « 10022027 » (8 digits)
 * and an ISO paste « 2027-02-10 ». Two-digit years are refused (ambiguous).
 */
export function parseFrDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const iso = ISO.exec(raw);
  if (iso) return fromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const sep = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/.exec(raw);
  if (sep) return fromParts(Number(sep[3]), Number(sep[2]), Number(sep[1]));
  const digits = /^(\d{2})(\d{2})(\d{4})$/.exec(raw);
  if (digits) return fromParts(Number(digits[3]), Number(digits[2]), Number(digits[1]));
  return null;
}

/** "2027-02-10" → "10/02/2027"; invalid/empty → "". */
export function formatFrDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = ISO.exec(iso);
  if (!m || toMs(iso) === null) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Typing mask for the « jj/mm/aaaa » text field: digits only, slashes auto-inserted.
 * Keeps user separators (« 1/2/2027 » stays parseable) and converts an ISO paste.
 */
export function maskFrDateInput(raw: string): string {
  const value = raw.trim();
  if (ISO.test(value)) return formatFrDateInput(value) || value;
  if (/[/.\-\s]/.test(value)) {
    const parts = value.split(/[/.\-\s]+/).map((p) => p.replace(/\D/g, ""));
    // Digits typed past a full day/month segment carry into the next one (« 10/022 » → « 10/02/2 »).
    for (let i = 0; i < 2; i++) {
      const part = parts[i] ?? "";
      if (part.length > 2) {
        parts[i + 1] = part.slice(2) + (parts[i + 1] ?? "");
        parts[i] = part.slice(0, 2);
      }
    }
    return [parts[0] ?? "", parts[1], parts[2]?.slice(0, 4)]
      .filter((p, i) => i === 0 || p !== undefined)
      .join("/");
  }
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** "2027-02-10" + 6 → "2027-02-16". Invalid → throws RangeError. */
export function addDays(iso: string, days: number): string {
  const ms = toMs(iso);
  if (ms === null) throw new RangeError(`Date invalide : ${iso}`);
  return msToIso(ms + Math.trunc(days) * DAY_MS);
}

/** Adds calendar months, clamping the day (31 janv. + 1 mois → 28/29 févr.). */
export function addMonths(iso: string, months: number): string {
  const m = ISO.exec(iso);
  if (!m || toMs(iso) === null) throw new RangeError(`Date invalide : ${iso}`);
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + Math.trunc(months);
  const y = Math.floor(total / 12);
  const mo = total - y * 12;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const d = Math.min(Number(m[3]), last);
  return fromParts(y, mo + 1, d) as string;
}

/** Inclusive days: ("2027-02-10", "2027-02-16") → 7. Invalid or reversed → null. */
export function daysInclusive(start: string, end: string): number | null {
  const a = toMs(start);
  const b = toMs(end);
  if (a === null || b === null || b < a) return null;
  return Math.round((b - a) / DAY_MS) + 1;
}

export type DatePreset = "1w" | "2w" | "1m";

export const DATE_PRESET_LABEL: Record<DatePreset, string> = {
  "1w": "1 semaine",
  "2w": "2 semaines",
  "1m": "1 mois",
};

/**
 * Preset range from `start` (or tomorrow when no valid start): 1 semaine = 7 days inclusive,
 * 2 semaines = 14 days, 1 mois = until the day before the same date next month.
 */
export function presetRange(
  preset: DatePreset,
  start: string | null | undefined,
  today: string,
): { start: string; end: string } {
  const from = isValidISODate(start) ? start : addDays(today, 1);
  switch (preset) {
    case "1w":
      return { start: from, end: addDays(from, 6) };
    case "2w":
      return { start: from, end: addDays(from, 13) };
    case "1m":
      return { start: from, end: addDays(addMonths(from, 1), -1) };
  }
}

/** Monday-first weekday index: lundi = 0 … dimanche = 6. */
export function mondayIndex(iso: string): number {
  const ms = toMs(iso);
  if (ms === null) return 0;
  return (new Date(ms).getUTCDay() + 6) % 7;
}

export const WEEKDAYS_SHORT = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."] as const;
export const WEEKDAYS_LONG = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
] as const;

export interface GridDay {
  iso: string;
  /** 1–31 */
  day: number;
  /** Belongs to the displayed month (else leading/trailing day). */
  inMonth: boolean;
}

/** First day of the month containing `iso`: "2027-02-10" → "2027-02-01". */
export function startOfMonth(iso: string): string {
  const m = ISO.exec(iso);
  if (!m) throw new RangeError(`Date invalide : ${iso}`);
  return `${m[1]}-${m[2]}-01`;
}

/**
 * Month grid, weeks starting on Monday, complete weeks only (4 to 6 rows).
 * `monthIso` is any day of the month to display.
 */
export function buildMonthGrid(monthIso: string): GridDay[][] {
  const first = startOfMonth(monthIso);
  const firstMs = toMs(first) as number;
  const month = new Date(firstMs).getUTCMonth();
  const gridStart = addDays(first, -mondayIndex(first));
  const lastOfMonth = addDays(addMonths(first, 1), -1);
  const gridEnd = addDays(lastOfMonth, 6 - mondayIndex(lastOfMonth));
  const weeks: GridDay[][] = [];
  let week: GridDay[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
    const date = new Date(toMs(d) as number);
    week.push({ iso: d, day: date.getUTCDate(), inMonth: date.getUTCMonth() === month });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  return weeks;
}

/** « février 2027 ». */
export function formatMonthTitle(monthIso: string): string {
  const ms = toMs(startOfMonth(monthIso));
  if (ms === null) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

/** « mercredi 10 février 2027 » (accessible day name). Invalid → "". */
export function formatDayLong(iso: string): string {
  const ms = toMs(iso);
  if (ms === null) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export type CalendarKey =
  "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "PageUp" | "PageDown" | "Home" | "End";

/** APG date-picker grid navigation. Returns the new focused date. */
export function moveCalendarFocus(iso: string, key: CalendarKey, shift = false): string {
  switch (key) {
    case "ArrowLeft":
      return addDays(iso, -1);
    case "ArrowRight":
      return addDays(iso, 1);
    case "ArrowUp":
      return addDays(iso, -7);
    case "ArrowDown":
      return addDays(iso, 7);
    case "PageUp":
      return addMonths(iso, shift ? -12 : -1);
    case "PageDown":
      return addMonths(iso, shift ? 12 : 1);
    case "Home":
      return addDays(iso, -mondayIndex(iso));
    case "End":
      return addDays(iso, 6 - mondayIndex(iso));
  }
}

/** Clamp an ISO date into [min, max] (either bound optional). */
export function clampISODate(iso: string, min?: string | null, max?: string | null): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** First contiguous run of unavailable days inside [start, end], or null. */
export function firstUnavailableRun(
  start: string,
  end: string,
  unavailable: (iso: string) => boolean,
  cap = 400,
): { start: string; end: string } | null {
  if (!isValidISODate(start) || !isValidISODate(end) || end < start) return null;
  let runStart: string | null = null;
  let runEnd: string | null = null;
  let n = 0;
  for (let d = start; d <= end && n < cap; d = addDays(d, 1), n++) {
    if (unavailable(d)) {
      runStart ??= d;
      runEnd = d;
    } else if (runStart) {
      break;
    }
  }
  return runStart && runEnd ? { start: runStart, end: runEnd } : null;
}

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

/** "00:00" → "23:30" (step 30) or "23:45" (step 15): 24 h labels. */
export function timeOptions(step: 15 | 30 = 30): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** "09:00" → 540. Invalid → null. */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
