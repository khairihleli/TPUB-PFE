/**
 * Availability helpers for GET /api/supports/{id}/availability.
 * Backend conflict rule (contract §5.7): a TEMPORAIRE/CONFIRMEE reservation blocks its whole
 * date range on the support, times are ignored. So a covered day is unavailable all day.
 * Dates are ISO "YYYY-MM-DD" strings handled in UTC arithmetic (no timezone drift).
 */
import type { SupportAvailabilitySlot } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
/** Safety cap when expanding ranges (≈ 3 years). */
export const MAX_EXPANDED_DAYS = 1100;

export function isISODate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUTC(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  if (!isISODate(iso)) throw new RangeError(`Date invalide : ${String(iso)}`);
  return fromUTC(toUTC(iso) + Math.trunc(days) * DAY_MS);
}

/** Whole days from a to b (b − a). */
export function diffDaysISO(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** Every day from start to end inclusive; [] when end < start or invalid. */
export function eachDayISO(start: string, end: string, cap = MAX_EXPANDED_DAYS): string[] {
  if (!isISODate(start) || !isISODate(end) || end < start) return [];
  const out: string[] = [];
  const last = toUTC(end);
  for (let t = toUTC(start); t <= last && out.length < cap; t += DAY_MS) out.push(fromUTC(t));
  return out;
}

const BLOCKING = new Set<SupportAvailabilitySlot["reservationStatus"]>(["TEMPORAIRE", "CONFIRMEE"]);

function isBlocking(slot: SupportAvailabilitySlot): boolean {
  return (
    BLOCKING.has(slot.reservationStatus) && isISODate(slot.startDate) && isISODate(slot.endDate)
  );
}

export interface DayWindow {
  from?: string;
  to?: string;
}

/** Blocked ISO days, optionally clipped to [from, to]. */
export function blockedDays(
  slots: readonly SupportAvailabilitySlot[],
  window: DayWindow = {},
): Set<string> {
  const out = new Set<string>();
  for (const slot of slots) {
    if (!isBlocking(slot)) continue;
    const start = window.from && window.from > slot.startDate ? window.from : slot.startDate;
    const end = window.to && window.to < slot.endDate ? window.to : slot.endDate;
    for (const day of eachDayISO(start, end)) out.add(day);
  }
  return out;
}

/** Slots overlapping [start, end] (inclusive date overlap, like the backend). */
export function conflictingSlots(
  slots: readonly SupportAvailabilitySlot[],
  start: string,
  end: string,
): SupportAvailabilitySlot[] {
  if (!isISODate(start) || !isISODate(end) || end < start) return [];
  return slots.filter((s) => isBlocking(s) && s.startDate <= end && s.endDate >= start);
}

/** True when [start, end] is a valid range with no blocking slot. Invalid ranges → false. */
export function isRangeFree(
  slots: readonly SupportAvailabilitySlot[],
  start: string,
  end: string,
): boolean {
  if (!isISODate(start) || !isISODate(end) || end < start) return false;
  return conflictingSlots(slots, start, end).length === 0;
}

export interface FreeWindowOptions {
  /** First acceptable day (usually today). */
  from: string;
  /** Wanted length in days (≥ 1). */
  lengthDays: number;
  /** How far to search after `from` (default 90 days). */
  horizonDays?: number;
}

/** First window of `lengthDays` consecutive free days within the horizon, or null. */
export function findFirstFreeWindow(
  slots: readonly SupportAvailabilitySlot[],
  { from, lengthDays, horizonDays = 90 }: FreeWindowOptions,
): { startDate: string; endDate: string } | null {
  const length = Math.max(1, Math.trunc(lengthDays));
  if (!isISODate(from)) return null;
  const lastStart = addDaysISO(from, Math.max(0, horizonDays) - length + 1);
  if (lastStart < from) return null;
  const blocked = blockedDays(slots, { from, to: addDaysISO(from, horizonDays) });
  let run = 0;
  for (const day of eachDayISO(from, addDaysISO(lastStart, length - 1))) {
    run = blocked.has(day) ? 0 : run + 1;
    if (run === length) return { startDate: addDaysISO(day, -(length - 1)), endDate: day };
  }
  return null;
}

/**
 * Positional shorthand (UX-PLAN §11.5): first free window of `lengthDays` days from `fromISO`.
 * `firstFreeWindow(slots, 7, todayISO())` → { startDate, endDate } | null.
 * React hook for many Porteurs: `useSupportsAvailability` in `@/lib/network/use-supports-availability`.
 */
export function firstFreeWindow(
  slots: readonly SupportAvailabilitySlot[],
  lengthDays: number,
  fromISO: string,
  horizonDays = 90,
): { startDate: string; endDate: string } | null {
  return findFirstFreeWindow(slots, { from: fromISO, lengthDays, horizonDays });
}

export type DayStatus = "libre" | "temporaire" | "confirmee";

export interface CalendarDay {
  date: string;
  status: DayStatus;
  blocked: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** First day of a month (for month labels in the strip). */
  monthStart: boolean;
}

/** Day-by-day strip for the studio calendar (default 60 days). CONFIRMEE wins over TEMPORAIRE. */
export function buildCalendarStrip(
  slots: readonly SupportAvailabilitySlot[],
  from: string,
  days = 60,
): CalendarDay[] {
  if (!isISODate(from) || days <= 0) return [];
  const to = addDaysISO(from, days - 1);
  const status = new Map<string, DayStatus>();
  for (const slot of slots) {
    if (!isBlocking(slot)) continue;
    const s = slot.startDate > from ? slot.startDate : from;
    const e = slot.endDate < to ? slot.endDate : to;
    for (const day of eachDayISO(s, e)) {
      if (slot.reservationStatus === "CONFIRMEE") status.set(day, "confirmee");
      else if (!status.has(day)) status.set(day, "temporaire");
    }
  }
  return eachDayISO(from, to).map((date) => {
    const st = status.get(date) ?? "libre";
    return {
      date,
      status: st,
      blocked: st !== "libre",
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      monthStart: date.endsWith("-01"),
    };
  });
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  libre: "Disponible",
  temporaire: "Réservé (temporaire)",
  confirmee: "Réservé (confirmé)",
};

export type DayPartId = "matin" | "midi" | "apres-midi" | "soiree" | "journee" | "personnalise";

export interface DayPart {
  id: DayPartId;
  label: string;
  /** "HH:mm", null for « Personnalisé ». */
  start: string | null;
  end: string | null;
}

export const DAY_PARTS: readonly DayPart[] = [
  { id: "matin", label: "Matin", start: "07:00", end: "11:00" },
  { id: "midi", label: "Midi", start: "11:00", end: "15:00" },
  { id: "apres-midi", label: "Après-midi", start: "15:00", end: "19:00" },
  { id: "soiree", label: "Soirée", start: "19:00", end: "23:00" },
  { id: "journee", label: "Journée", start: "08:00", end: "22:00" },
  { id: "personnalise", label: "Personnalisé", start: null, end: null },
];

export function getDayPart(id: DayPartId): DayPart {
  return DAY_PARTS.find((p) => p.id === id) ?? (DAY_PARTS[DAY_PARTS.length - 1] as DayPart);
}

/** "08:00:00" or "08:00" → "08:00"; null when invalid. */
export function toHHmm(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${m[1]}:${m[2]}`;
}

/** Preset matching exactly the times, else « personnalise ». */
export function dayPartFromTimes(
  start: string | null | undefined,
  end: string | null | undefined,
): DayPartId {
  const s = toHHmm(start);
  const e = toHHmm(end);
  const preset = DAY_PARTS.find((p) => p.start !== null && p.start === s && p.end === e);
  return preset?.id ?? "personnalise";
}

/** Null when valid, else a French message. Requires end > start (backend rule). */
export function validateTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const s = toHHmm(start);
  const e = toHHmm(end);
  if (!s || !e) return "Indiquez une heure de début et une heure de fin (HH:MM).";
  if (e <= s) return "L'heure de fin doit être après l'heure de début.";
  return null;
}

/** Null when valid, else a French message. `today` = min start. */
export function validateDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  today?: string,
): string | null {
  if (!isISODate(start) || !isISODate(end)) return "Indiquez une date de début et une date de fin.";
  if (today && start < today) return "La date de début ne peut pas être dans le passé.";
  if (end < start) return "La date de fin doit être après la date de début.";
  return null;
}

/** Null when the period is free, else « Période indisponible … » with the first conflict. */
export function availabilityMessage(
  slots: readonly SupportAvailabilitySlot[],
  start: string,
  end: string,
): string | null {
  const conflicts = conflictingSlots(slots, start, end);
  const first = conflicts[0];
  if (!first) return null;
  const n = conflicts.length;
  return `Période indisponible : ce Porteur est déjà réservé du ${formatDate(first.startDate, "medium")} au ${formatDate(first.endDate, "medium")}${n > 1 ? ` (et ${n - 1} autre${n > 2 ? "s" : ""} période${n > 2 ? "s" : ""})` : ""}.`;
}
