/**
 * Joins reservations with their campaign, Porteur (support) and zone names, filters and sorts them.
 * The reservation API returns ids only (contract §5.7), so names come from /supports + /zones.
 */
import type {
  CampaignResponse,
  ReservationResponse,
  ReservationStatus,
  SupportResponse,
  SupportType,
  ZoneResponse,
} from "@/lib/api/types";
import { RESERVATION_STATUS } from "@/lib/campaign-status";
import type { SortState } from "@/lib/url-state";

export interface ReservationRow {
  reservation: ReservationResponse;
  campaign: CampaignResponse | null;
  campaignName: string;
  supportName: string;
  supportType: SupportType | null;
  zoneName: string;
}

export function joinReservations(
  reservations: readonly ReservationResponse[],
  campaigns: readonly CampaignResponse[],
  supports: readonly SupportResponse[] | null,
  zones: readonly ZoneResponse[] | null,
): ReservationRow[] {
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const supportById = new Map((supports ?? []).map((s) => [s.id, s]));
  const zoneById = new Map((zones ?? []).map((z) => [z.id, z]));

  return reservations
    .filter((r) => campaignById.has(r.campaignId))
    .map((r) => {
      const campaign = campaignById.get(r.campaignId) ?? null;
      const support = supportById.get(r.supportId);
      const zone = zoneById.get(r.zoneId);
      return {
        reservation: r,
        campaign,
        campaignName: campaign?.name ?? `Campagne n° ${r.campaignId}`,
        supportName: support?.name ?? `Porteur n° ${r.supportId}`,
        supportType: support?.supportType ?? null,
        zoneName: zone?.name ?? support?.zoneName ?? `Zone n° ${r.zoneId}`,
      };
    });
}

export type ReservationStatusFilter = "toutes" | ReservationStatus;

export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  "TEMPORAIRE",
  "CONFIRMEE",
  "ANNULEE",
  "EXPIREE",
];

/** URL state of the Réservations page (`?statut=&campagne=&zone=`). null = no filter. */
export interface ReservationFilters {
  status: ReservationStatus | null;
  campaignId: number | null;
  zoneId: number | null;
}

export const DEFAULT_RESERVATION_FILTERS: ReservationFilters = {
  status: null,
  campaignId: null,
  zoneId: null,
};

export function isFiltering(f: ReservationFilters): boolean {
  return f.status !== null || f.campaignId !== null || f.zoneId !== null;
}

/** Filters counted in « Filtres (n) » (the status lives in the tabs above the bar). */
export function activeScopeFilterCount(
  f: Pick<ReservationFilters, "campaignId" | "zoneId">,
): number {
  return (f.campaignId !== null ? 1 : 0) + (f.zoneId !== null ? 1 : 0);
}

/** Filters by campaign + zone only (used for the status tab counts). */
export function filterByScope(
  rows: readonly ReservationRow[],
  f: Pick<ReservationFilters, "campaignId" | "zoneId">,
): ReservationRow[] {
  return rows.filter(
    (row) =>
      (f.campaignId === null || row.reservation.campaignId === f.campaignId) &&
      (f.zoneId === null || row.reservation.zoneId === f.zoneId),
  );
}

export function filterReservationRows(
  rows: readonly ReservationRow[],
  f: ReservationFilters,
): ReservationRow[] {
  return filterByScope(rows, f).filter(
    (row) => f.status === null || row.reservation.reservationStatus === f.status,
  );
}

export function countByStatus(
  rows: readonly ReservationRow[],
): Record<ReservationStatusFilter, number> {
  const out: Record<ReservationStatusFilter, number> = {
    toutes: rows.length,
    TEMPORAIRE: 0,
    CONFIRMEE: 0,
    ANNULEE: 0,
    EXPIREE: 0,
  };
  for (const row of rows) out[row.reservation.reservationStatus] += 1;
  return out;
}

/** Holding slots first, then by start date (soonest first), then id. */
export function sortReservationRows(rows: readonly ReservationRow[]): ReservationRow[] {
  const rank = (s: ReservationStatus) =>
    s === "CONFIRMEE" || s === "TEMPORAIRE" ? 0 : s === "EXPIREE" ? 1 : 2;
  return [...rows].sort((a, b) => {
    const ra = a.reservation;
    const rb = b.reservation;
    return (
      rank(ra.reservationStatus) - rank(rb.reservationStatus) ||
      (ra.startDate < rb.startDate ? -1 : ra.startDate > rb.startDate ? 1 : 0) ||
      ra.id - rb.id
    );
  });
}

export interface ZoneOption {
  id: number;
  name: string;
}

/** Unique zones present in the rows, sorted by name (filter options). */
export function zoneOptions(rows: readonly ReservationRow[]): ZoneOption[] {
  const byId = new Map<number, string>();
  for (const r of rows)
    if (!byId.has(r.reservation.zoneId)) byId.set(r.reservation.zoneId, r.zoneName);
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr") || a.id - b.id);
}

// ---------------------------------------------------------------------------
// Sort (`?tri=periode|-periode|cout|porteur|statut`)
// ---------------------------------------------------------------------------
export type ReservationSortKey = "periode" | "cout" | "porteur" | "statut";

export const RESERVATION_SORT_KEYS: readonly ReservationSortKey[] = [
  "periode",
  "cout",
  "porteur",
  "statut",
];

/** Default: période, début croissant (UX-PLAN §12.B.4). */
export const DEFAULT_RESERVATION_SORT: SortState = { key: "periode", dir: "asc" };

/** Status order for sorting: blocked, confirmed, past, released. */
const STATUS_RANK: Record<ReservationStatus, number> = {
  TEMPORAIRE: 0,
  CONFIRMEE: 1,
  EXPIREE: 2,
  ANNULEE: 3,
};

export function reservationSortValue(
  row: ReservationRow,
  key: ReservationSortKey,
): string | number {
  const r = row.reservation;
  switch (key) {
    case "periode":
      return `${r.startDate}T${r.startTime ?? ""}#${String(r.id).padStart(10, "0")}`;
    case "cout":
      return Number.isFinite(r.estimatedCost) ? r.estimatedCost : 0;
    case "porteur":
      return row.supportName;
    case "statut":
      return STATUS_RANK[r.reservationStatus];
  }
}

/** « Trié par : … » caption. */
export function reservationSortCaption(sort: SortState | null): string {
  const s = sort ?? DEFAULT_RESERVATION_SORT;
  const asc = s.dir === "asc";
  switch (s.key as ReservationSortKey) {
    case "cout":
      return asc
        ? "coût estimé, du plus bas au plus élevé"
        : "coût estimé, du plus élevé au plus bas";
    case "porteur":
      return asc ? "Porteur, de A à Z" : "Porteur, de Z à A";
    case "statut":
      return asc
        ? `statut (${RESERVATION_STATUS.TEMPORAIRE.label} d'abord)`
        : `statut (${RESERVATION_STATUS.ANNULEE.label} d'abord)`;
    case "periode":
    default:
      return asc
        ? "début, du plus proche au plus lointain"
        : "début, du plus lointain au plus proche";
  }
}

export const RESERVATION_SORT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "periode", label: "Début le plus proche" },
  { value: "-periode", label: "Début le plus lointain" },
  { value: "-cout", label: "Coût estimé le plus élevé" },
  { value: "cout", label: "Coût estimé le plus bas" },
  { value: "porteur", label: "Porteur (A → Z)" },
  { value: "statut", label: "Statut" },
];
