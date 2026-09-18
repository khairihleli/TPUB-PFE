/**
 * Back-office reservations (pure), contract §2.4:
 * search filters (URL ⇄ `GET /api/reservations`), conflict grouping per Porteur
 * (`GET /api/reservations/conflicts`) and the admin cancellation reason.
 */
import type {
  ReservationConflict,
  ReservationResponse,
  ReservationSearchQuery,
  ReservationStatus,
} from "@/lib/api/types";
import { formatDate, fromApiTime } from "@/lib/format";

export const RESERVATION_STATUS_VALUES: readonly ReservationStatus[] = [
  "TEMPORAIRE",
  "CONFIRMEE",
  "ANNULEE",
  "EXPIREE",
];

export const RESERVATIONS_PAGE_SIZE = 20;
export const CANCEL_REASON_MAX = 255;

export interface ReservationFilterState {
  status: ReservationStatus | null;
  zoneId: number | null;
  supportId: number | null;
  campaignId: number | null;
  clientId: number | null;
  from: string;
  to: string;
  page: number;
}

export function reservationSearchQuery(s: ReservationFilterState): ReservationSearchQuery {
  const from = s.from || undefined;
  const to = s.to || undefined;
  return {
    status: s.status ? [s.status] : undefined,
    zoneId: s.zoneId ?? undefined,
    supportId: s.supportId ?? undefined,
    campaignId: s.campaignId ?? undefined,
    clientId: s.clientId ?? undefined,
    from: from ?? to,
    to: to ?? from,
    sort: "createdAt,desc",
    page: Math.max(0, s.page),
    size: RESERVATIONS_PAGE_SIZE,
  };
}

export function reservationFilterCount(s: ReservationFilterState): number {
  return [s.status, s.zoneId, s.supportId, s.campaignId, s.clientId, s.from || s.to].filter(
    (v) => v !== null && v !== "" && v !== undefined,
  ).length;
}

/** Admin cancellation: optional reason, 255 characters max. Null when valid. */
export function cancelReasonError(reason: string): string | null {
  return reason.trim().length > CANCEL_REASON_MAX
    ? `${CANCEL_REASON_MAX} caractères maximum.`
    : null;
}

/** « 12 sept. → 20 sept. · 08:00–12:00 ». */
export function windowLabel(w: {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}): string {
  const dates =
    w.startDate === w.endDate
      ? formatDate(w.startDate, "medium")
      : `${formatDate(w.startDate, "medium")} → ${formatDate(w.endDate, "medium")}`;
  return `${dates} · ${fromApiTime(w.startTime)}–${fromApiTime(w.endTime)}`;
}

export interface ConflictGroup {
  supportId: number;
  supportName: string;
  zoneName: string;
  capacity: number;
  severity: ReservationConflict["severity"];
  conflicts: ReservationConflict[];
  /** Distinct reservations involved in the group. */
  reservations: ReservationResponse[];
  /** Distinct campaigns involved (for the moderation links). */
  campaignIds: number[];
}

/** One card per Porteur, CONFLIT groups first, then by name. */
export function groupConflicts(conflicts: readonly ReservationConflict[]): ConflictGroup[] {
  const bySupport = new Map<number, ConflictGroup>();
  for (const c of conflicts) {
    let g = bySupport.get(c.supportId);
    if (!g) {
      g = {
        supportId: c.supportId,
        supportName: c.supportName,
        zoneName: c.zoneName,
        capacity: c.capacity,
        severity: c.severity,
        conflicts: [],
        reservations: [],
        campaignIds: [],
      };
      bySupport.set(c.supportId, g);
    }
    g.conflicts.push(c);
    if (c.severity === "CONFLIT") g.severity = "CONFLIT";
    for (const r of c.reservations) {
      if (!g.reservations.some((x) => x.id === r.id)) g.reservations.push(r);
      if (!g.campaignIds.includes(r.campaignId)) g.campaignIds.push(r.campaignId);
    }
  }
  return [...bySupport.values()].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "CONFLIT" ? -1 : 1) ||
      a.supportName.localeCompare(b.supportName, "fr"),
  );
}

/** « 2 conflits · 1 Porteur saturé ». */
export function conflictsSummary(groups: readonly ConflictGroup[]): string {
  const conflicts = groups.filter((g) => g.severity === "CONFLIT").length;
  const saturated = groups.length - conflicts;
  return `${conflicts} Porteur${conflicts > 1 ? "s" : ""} en conflit · ${saturated} saturé${saturated > 1 ? "s" : ""}`;
}
