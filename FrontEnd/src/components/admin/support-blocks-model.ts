/**
 * Porteur availability management (pure): unavailability blocks (contract §2.4
 * `/api/supports/{id}/blocks`) and the per-day calendar that merges blocks with the
 * reservations returned by `/api/supports/{id}/availability`.
 */
import { z } from "zod";

import { addDaysISO, isIsoDate } from "@/components/admin/stats-model";
import { maxChars, REQUIRED } from "@/components/admin/form-utils";
import type {
  SupportAvailabilitySlot,
  SupportBlockRequest,
  SupportBlockResponse,
  SupportBlockStatus,
} from "@/lib/api/types";
import { RESERVATION_STATUS, SUPPORT_BLOCK_STATUS } from "@/lib/campaign-status";
import type { BadgeTone } from "@/components/ui/badge";

export const BLOCK_STATUSES = [
  "MAINTENANCE",
  "HORS_LIGNE",
  "OCCUPE",
] as const satisfies readonly SupportBlockStatus[];

/** Backend limit: one row per day, at most 92 days per request. */
export const BLOCK_MAX_DAYS = 92;
export const BLOCK_REASON_MAX = 255;
/** Calendar page size (days shown at once). */
export const CALENDAR_DAYS = 14;

export const BLOCK_FIELDS = [
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "availabilityStatus",
  "reason",
] as const;
export type BlockField = (typeof BLOCK_FIELDS)[number];
export type BlockFormValues = Record<BlockField, string>;

export function emptyBlockForm(today: string): BlockFormValues {
  return {
    startDate: today,
    endDate: today,
    startTime: "07:00",
    endTime: "23:00",
    availabilityStatus: "MAINTENANCE",
    reason: "",
  };
}

const HM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function withSeconds(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/** Days between two ISO dates, inclusive (« 2026-09-01 → 2026-09-03 » = 3). */
export function daysInclusive(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function blockSchema(today: string) {
  return z
    .object({
      startDate: z
        .string({ error: REQUIRED })
        .trim()
        .refine(isIsoDate, { error: "Date de début invalide." }),
      endDate: z
        .string({ error: REQUIRED })
        .trim()
        .refine(isIsoDate, { error: "Date de fin invalide." }),
      startTime: z.string().trim().regex(HM, { error: "Heure au format HH:MM." }),
      endTime: z.string().trim().regex(HM, { error: "Heure au format HH:MM." }),
      availabilityStatus: z.enum(BLOCK_STATUSES, {
        error: "Choisissez un motif d'indisponibilité.",
      }),
      reason: z.string().trim().max(BLOCK_REASON_MAX, maxChars(BLOCK_REASON_MAX)),
    })
    .superRefine((v, ctx) => {
      if (isIsoDate(v.startDate) && v.startDate < today) {
        ctx.addIssue({
          code: "custom",
          path: ["startDate"],
          message: "La date de début ne peut pas être passée.",
        });
      }
      if (isIsoDate(v.startDate) && isIsoDate(v.endDate)) {
        if (v.endDate < v.startDate) {
          ctx.addIssue({
            code: "custom",
            path: ["endDate"],
            message: "La date de fin doit suivre la date de début.",
          });
        } else if (daysInclusive(v.startDate, v.endDate) > BLOCK_MAX_DAYS) {
          ctx.addIssue({
            code: "custom",
            path: ["endDate"],
            message: `${BLOCK_MAX_DAYS} jours maximum par indisponibilité.`,
          });
        }
      }
      if (
        HM.test(v.startTime) &&
        HM.test(v.endTime) &&
        withSeconds(v.startTime) >= withSeconds(v.endTime)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["endTime"],
          message: "L'heure de fin doit suivre l'heure de début.",
        });
      }
    })
    .transform((v): SupportBlockRequest => ({
      startDate: v.startDate,
      endDate: v.endDate,
      startTime: withSeconds(v.startTime),
      endTime: withSeconds(v.endTime),
      availabilityStatus: v.availabilityStatus,
      reason: v.reason ? v.reason : null,
    }));
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
export interface CalendarEntry {
  key: string;
  kind: "RESERVATION" | "BLOCAGE";
  startTime: string;
  endTime: string;
  label: string;
  tone: BadgeTone;
  /** Reason of a block. */
  detail: string | null;
  /** Block id (deletable), null for reservations. */
  blockId: number | null;
}

export interface CalendarDay {
  date: string;
  entries: CalendarEntry[];
  /** Number of reservations holding capacity on that day. */
  reservations: number;
  blocked: boolean;
}

/** `from` → the `days` ISO dates of the page. */
export function calendarDates(from: string, days = CALENDAR_DAYS): string[] {
  return Array.from({ length: Math.max(0, days) }, (_, i) => addDaysISO(from, i));
}

/**
 * One row per day: blocks (one row per day in the backend) and reservation slots whose date
 * range covers the day, sorted by start time. Blocks returned in the availability list are
 * ignored there (the blocks endpoint carries their ids).
 */
export function buildCalendar(
  from: string,
  days: number,
  blocks: readonly SupportBlockResponse[],
  slots: readonly SupportAvailabilitySlot[],
): CalendarDay[] {
  return calendarDates(from, days).map((date) => {
    const entries: CalendarEntry[] = [];
    for (const b of blocks) {
      if (b.date !== date) continue;
      const meta = SUPPORT_BLOCK_STATUS[b.availabilityStatus];
      entries.push({
        key: `b-${b.id}`,
        kind: "BLOCAGE",
        startTime: b.startTime,
        endTime: b.endTime,
        label: meta?.label ?? b.availabilityStatus,
        tone: meta?.tone ?? "neutral",
        detail: b.reason,
        blockId: b.id,
      });
    }
    let reservations = 0;
    slots.forEach((s, i) => {
      if ((s.kind ?? "RESERVATION") !== "RESERVATION") return;
      if (date < s.startDate || date > s.endDate) return;
      reservations += 1;
      const status = s.reservationStatus ?? "TEMPORAIRE";
      const meta = RESERVATION_STATUS[status];
      entries.push({
        key: `r-${i}-${s.startDate}-${s.startTime}`,
        kind: "RESERVATION",
        startTime: s.startTime,
        endTime: s.endTime,
        label: `Créneau ${meta.label.toLowerCase()}`,
        tone: meta.tone,
        detail: null,
        blockId: null,
      });
    });
    entries.sort((a, b) =>
      a.startTime === b.startTime
        ? a.kind.localeCompare(b.kind)
        : a.startTime < b.startTime
          ? -1
          : 1,
    );
    return { date, entries, reservations, blocked: entries.some((e) => e.kind === "BLOCAGE") };
  });
}

/** « 3 indisponibilités · 5 créneaux réservés » for the calendar page. */
export function calendarSummary(days: readonly CalendarDay[]): string {
  const blocks = days.reduce((n, d) => n + d.entries.filter((e) => e.kind === "BLOCAGE").length, 0);
  const booked = days.filter((d) => d.reservations > 0).length;
  return `${blocks} indisponibilité${blocks > 1 ? "s" : ""} · ${booked} jour${booked > 1 ? "s" : ""} avec réservation`;
}

/** Days removed from the end of a range when it exceeds the backend limit. */
export function clampBlockEnd(startDate: string, endDate: string): string {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return endDate;
  return daysInclusive(startDate, endDate) > BLOCK_MAX_DAYS
    ? addDaysISO(startDate, BLOCK_MAX_DAYS - 1)
    : endDate;
}
