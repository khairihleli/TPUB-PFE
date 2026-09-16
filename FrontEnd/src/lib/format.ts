/** Formatting helpers — French (Tunisia), TND, Africa/Tunis. The ONLY number/date formatting path. */

export const LOCALE = "fr-TN";
export const TIME_ZONE = "Africa/Tunis";

const NARROW_NBSP = /\u202f/g;
const NBSP = "\u00a0";

const tndFormatter = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "TND" });
const tndWholeFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "TND",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat(LOCALE);
const compactFormatter = new Intl.NumberFormat(LOCALE, {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Single normaliser for every Intl number output (VD-04): narrow no-break spaces (U+202F)
 * become regular no-break spaces (U+00A0). The narrow one is nearly invisible in Sora, so
 * thousands ran together in stat cards.
 */
export function normalizeNumberSpaces(value: string): string {
  return value.replace(NARROW_NBSP, NBSP);
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** 1500 → "1 500 DT", 1500.25 → "1 500,250 DT" (millimes only when present). Null/NaN → "—". */
export function formatTND(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return "—";
  const formatter = Number.isInteger(n) ? tndWholeFormatter : tndFormatter;
  return normalizeNumberSpaces(formatter.format(n));
}

/** 4000 → "4 000" (U+00A0). */
export function formatNumber(n: number | null | undefined): string {
  return isFiniteNumber(n) ? normalizeNumberSpaces(numberFormatter.format(n)) : "—";
}

/** 12500 → "12,5 k" (U+00A0). */
export function formatCompact(n: number | null | undefined): string {
  return isFiniteNumber(n) ? normalizeNumberSpaces(compactFormatter.format(n)) : "—";
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses "YYYY-MM-DD" (calendar date, no timezone) or an ISO instant.
 * Calendar dates are anchored at 12:00 UTC and formatted in UTC so they never shift a day.
 */
function toDate(value: string | Date): { date: Date; dateOnly: boolean } | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { date: value, dateOnly: false };
  }
  const m = DATE_ONLY.exec(value);
  if (m) {
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    return Number.isNaN(date.getTime()) ? null : { date, dateOnly: true };
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, dateOnly: false };
}

export type DateStyle = "long" | "short" | "medium";

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  long: { day: "numeric", month: "long", year: "numeric" },
  medium: { day: "numeric", month: "short", year: "numeric" },
  short: { day: "2-digit", month: "2-digit", year: "numeric" },
};

/** "2026-10-01" → "1 octobre 2026" (long) · "01/10/2026" (short) · "1 oct. 2026" (medium). */
export function formatDate(
  value: string | Date | null | undefined,
  style: DateStyle = "long",
): string {
  if (!value) return "—";
  const parsed = toDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    ...DATE_OPTIONS[style],
    timeZone: parsed.dateOnly ? "UTC" : TIME_ZONE,
  }).format(parsed.date);
}

/** "2026-09-14" → "14 sept." (no year: for near dates such as upcoming deadlines). */
export function formatDayMonth(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const parsed = toDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    timeZone: parsed.dateOnly ? "UTC" : TIME_ZONE,
  }).format(parsed.date);
}

/** ISO instant → "12 sept. 2026, 14:30" in Africa/Tunis, 24 h clock. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const parsed = toDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: parsed.dateOnly ? "UTC" : TIME_ZONE,
  }).format(parsed.date);
}

/** ISO instant → "14:32" (Africa/Tunis, 24 h). For « Mis à jour à 14:32 ». */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const parsed = toDate(value);
  if (!parsed) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: parsed.dateOnly ? "UTC" : TIME_ZONE,
  }).format(parsed.date);
}

/** "2026-10-01", "2026-10-31" → "1 oct. 2026 → 31 oct. 2026". */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  style: DateStyle = "medium",
): string {
  if (!start && !end) return "—";
  return `${formatDate(start, style)} → ${formatDate(end, style)}`;
}

const DAY_MS = 86_400_000;

function isoToUtcNoon(iso: string): number | null {
  const m = DATE_ONLY.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const d = new Date(t);
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? t : null;
}

/** Inclusive number of calendar days between two "YYYY-MM-DD" (null when invalid or reversed). */
export function countDaysInclusive(start: string, end: string): number | null {
  const a = isoToUtcNoon(start);
  const b = isoToUtcNoon(end);
  if (a === null || b === null || b < a) return null;
  return Math.round((b - a) / DAY_MS) + 1;
}

export interface DateRangeLongOptions {
  /** "long" → « mercredi 10 février » · "short" → « mer. 10 févr. ». Default "long". */
  weekday?: "long" | "short";
  /** Appends « · 7 jours ». Default true. */
  withDuration?: boolean;
}

/**
 * Echo line for date ranges: « du mercredi 10 février au mardi 16 février 2027 · 7 jours ».
 * Different years → both years are printed. Single day → « le mercredi 10 février 2027 · 1 jour ».
 * Invalid input → "".
 */
export function formatDateRangeLong(
  start: string | null | undefined,
  end: string | null | undefined,
  { weekday = "long", withDuration = true }: DateRangeLongOptions = {},
): string {
  if (!start || !end) return "";
  const a = isoToUtcNoon(start);
  const b = isoToUtcNoon(end);
  if (a === null || b === null || b < a) return "";
  const monthStyle = weekday === "long" ? "long" : "short";
  const dayFmt = new Intl.DateTimeFormat(LOCALE, {
    weekday,
    day: "numeric",
    month: monthStyle,
    timeZone: "UTC",
  });
  const yearOf = (t: number) => new Date(t).getUTCFullYear();
  const days = Math.round((b - a) / DAY_MS) + 1;
  const duration = withDuration ? ` · ${days} ${days >= 2 ? "jours" : "jour"}` : "";
  if (a === b) return `le ${dayFmt.format(new Date(a))} ${yearOf(a)}${duration}`;
  const startLabel =
    yearOf(a) === yearOf(b)
      ? dayFmt.format(new Date(a))
      : `${dayFmt.format(new Date(a))} ${yearOf(a)}`;
  return `du ${startLabel} au ${dayFmt.format(new Date(b))} ${yearOf(b)}${duration}`;
}

/** « de 09:00 à 18:00 · 9 h » (« 8 h 30 » for half hours). Invalid/reversed → "". */
export function formatTimeRangeLong(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const s = fromApiTime(start);
  const e = fromApiTime(end);
  if (!s || !e) return "";
  const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
  const diff = minutes(e) - minutes(s);
  if (diff <= 0) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  const duration = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m}`;
  return `de ${s} à ${e} · ${duration}`;
}

const TIME_HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_HMS = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;

/** "08:00" → "08:00:00" (Spring CampaignRequest is strict HH:mm:ss). Invalid → throws. */
export function toApiTime(value: string): string {
  const v = value.trim();
  if (TIME_HMS.test(v)) return v;
  if (TIME_HM.test(v)) return `${v}:00`;
  throw new RangeError(`Heure invalide : ${value}`);
}

/** Like toApiTime but empty → null (optional fields). */
export function toApiTimeOrNull(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return toApiTime(value);
}

/** "08:00:00" → "08:00" (for time fields). Null → "". */
export function fromApiTime(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]}:${m[2]}` : "";
}

/** "08:00:00", "22:00:00" → "08:00 – 22:00". */
export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return "—";
  return `${fromApiTime(start) || "—"} – ${fromApiTime(end) || "—"}`;
}

function tunisParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

/** Today's calendar date in Africa/Tunis: "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): string {
  const p = tunisParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Local Tunis date-time without timezone, for /api/diffusion/next: "2026-09-12T14:30:00". */
export function toLocalIsoDateTime(now: Date = new Date()): string {
  const p = tunisParts(now);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Compares two "YYYY-MM-DD" strings lexicographically (valid for ISO dates). */
export function compareISODate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n >= 2 ? pluralForm : singular}`;
}

/**
 * Relative French time from real data, never invented:
 * - calendar dates ("YYYY-MM-DD") compare Tunis calendar days: « aujourd'hui », « demain »,
 *   « hier », « dans 5 jours », « il y a 3 jours », then weeks/months/years;
 * - instants: « à l'instant », « il y a 5 min », « il y a 3 h », « dans 2 jours »…
 * Invalid → "".
 */
export function formatRelative(
  from: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  if (!from) return "";
  const parsed = toDate(from);
  if (!parsed) return "";

  if (parsed.dateOnly && typeof from === "string") {
    const today = isoToUtcNoon(todayISO(now));
    const target = isoToUtcNoon(from);
    if (today === null || target === null) return "";
    const days = Math.round((target - today) / DAY_MS);
    if (days === 0) return "aujourd'hui";
    if (days === 1) return "demain";
    if (days === -1) return "hier";
    return relativeFromDays(days);
  }

  const diffMs = parsed.date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const future = diffMs > 0;
  const wrap = (s: string) => (future ? `dans ${s}` : `il y a ${s}`);
  if (abs < 45_000) return "à l'instant";
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60) return wrap(`${Math.max(1, minutes)} min`);
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return wrap(`${hours} h`);
  const days = Math.round(abs / DAY_MS);
  return relativeFromDays(future ? days : -days);
}

function relativeFromDays(days: number): string {
  const abs = Math.abs(days);
  const wrap = (s: string) => (days > 0 ? `dans ${s}` : `il y a ${s}`);
  if (abs < 14) return wrap(plural(abs, "jour", "jours"));
  if (abs < 60) return wrap(plural(Math.round(abs / 7), "semaine", "semaines"));
  if (abs < 365) return wrap(`${Math.round(abs / 30)} mois`);
  return wrap(plural(Math.round(abs / 365), "an", "ans"));
}

/**
 * Coordinates for display (VD-18): « 36,8829° N · 10,3301° E » (4 decimals, French comma).
 * Use a dot-decimal formatter (formatLatLng) only for clipboard/URL. Invalid → "—".
 */
export function formatCoordinatesFr(
  lat: number | null | undefined,
  lng: number | null | undefined,
): string {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return "—";
  const part = (v: number, pos: string, neg: string) =>
    `${Math.abs(v).toFixed(4).replace(".", ",")}° ${v < 0 ? neg : pos}`;
  return `${part(lat, "N", "S")} · ${part(lng, "E", "O")}`;
}

/**
 * Estimated value label (VD-16): `formatEstimate(120, "DT")` → « ≈ 120 DT »,
 * `formatEstimate(4000, "vues")` → « ≈ 4 000 vues ». Always pair with <EstimateTag>.
 */
export function formatEstimate(n: number | null | undefined, unit: string = "DT"): string {
  if (!isFiniteNumber(n)) return "—";
  if (unit === "DT") return `≈${NBSP}${formatTND(n)}`;
  return `≈${NBSP}${formatNumber(n)}${unit ? `${NBSP}${unit}` : ""}`;
}

/** "Sami Ben Salah" → "SB". */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : (words[0]?.[1] ?? "");
  return `${first}${second}`.toUpperCase() || "?";
}

/** formatCount(2, "campagne", "campagnes") → "2 campagnes". */
export function formatCount(n: number, singular: string, plural: string): string {
  return `${formatNumber(n)} ${Math.abs(n) >= 2 ? plural : singular}`;
}
