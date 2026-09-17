/**
 * « Cartes de chaleur » model (docs/round2-contract.md §4.5). Pure: URL state → API queries, top
 * lists and French labels of the side table (the non-visual equivalent of the density layer).
 */
import type {
  DemandHeatmapResponse,
  DemandZone,
  DiffusionHeatProps,
  HeatmapFeature,
  HeatmapResponse,
  ReservationHeatProps,
} from "@/lib/api/types-carte";
import type { DiffusionContentType } from "@/lib/api/types";
import type { MapHeatmap } from "@/lib/network/overlays";
import { formatNumber } from "@/lib/format";

export const HEATMAP_TABS = ["diffusions", "demande"] as const;
export type HeatmapTab = (typeof HEATMAP_TABS)[number];

export const HEATMAP_CONTENT_TYPES: readonly DiffusionContentType[] = [
  "PUBLICITE",
  "URGENCE",
  "DEFAUT",
];

export const TOP_LIMIT = 10;
/** Default period: the 30 last days (diffusions) / the 30 next days (demand). */
export const DEFAULT_RANGE_DAYS = 30;
export const MAX_RANGE_DAYS = 366;

export interface HeatmapFilters {
  tab: HeatmapTab;
  from: string;
  to: string;
  contentType: DiffusionContentType | null;
  zoneId: number | null;
}

function shiftDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Default range of a tab when the URL carries none. */
export function defaultRange(tab: HeatmapTab, today: string): { from: string; to: string } {
  return tab === "diffusions"
    ? { from: shiftDays(today, -(DEFAULT_RANGE_DAYS - 1)), to: today }
    : { from: today, to: shiftDays(today, DEFAULT_RANGE_DAYS - 1) };
}

/** French reason when the period cannot be queried (mirrors the backend INVALID_RANGE). */
export function rangeError(from: string, to: string): string | null {
  if (!from || !to) return null;
  if (to < from) return "La date de fin doit être postérieure ou égale à la date de début.";
  const days =
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) return `La période ne peut pas dépasser ${MAX_RANGE_DAYS} jours.`;
  return null;
}

/** Heatmap layer of the diffusions tab. */
export function diffusionHeatmap(
  data: HeatmapResponse<DiffusionHeatProps> | null | undefined,
): MapHeatmap | null {
  if (!data) return null;
  return { points: data.points, maxWeight: data.maxWeight, label: "Diffusions par Porteur" };
}

/** Heatmap layer of the demand tab (reserved slot-hours). */
export function demandHeatmap(data: DemandHeatmapResponse | null | undefined): MapHeatmap | null {
  if (!data) return null;
  return {
    points: data.reservations,
    maxWeight: data.maxReservationWeight,
    label: "Heures réservées par Porteur",
  };
}

export interface TopRow {
  supportId: number;
  supportName: string;
  zoneName: string;
  weight: number;
  /** Clicks (diffusions) or occupancy 0..1 (demand). */
  detail: number;
}

function toTop(
  features: readonly HeatmapFeature<DiffusionHeatProps | ReservationHeatProps>[],
  detail: (p: DiffusionHeatProps | ReservationHeatProps) => number,
): TopRow[] {
  return [...features]
    .map((f) => ({
      supportId: f.properties.supportId,
      supportName: f.properties.supportName,
      zoneName: f.properties.zoneName,
      weight: f.properties.weight,
      detail: detail(f.properties),
    }))
    .sort((a, b) => b.weight - a.weight || a.supportName.localeCompare(b.supportName, "fr"))
    .slice(0, TOP_LIMIT);
}

export function topDiffusions(
  data: HeatmapResponse<DiffusionHeatProps> | null | undefined,
): TopRow[] {
  if (!data) return [];
  return toTop(data.points.features, (p) => ("clicks" in p ? p.clicks : 0));
}

export function topReservations(data: DemandHeatmapResponse | null | undefined): TopRow[] {
  if (!data) return [];
  return toTop(data.reservations.features, (p) => ("occupancy" in p ? p.occupancy : 0));
}

/** Zones sorted by occupancy, then by reserved hours. */
export function zonesByDemand(data: DemandHeatmapResponse | null | undefined): DemandZone[] {
  if (!data) return [];
  return [...data.byZone].sort(
    (a, b) =>
      b.occupancy - a.occupancy ||
      b.reservedHours - a.reservedHours ||
      a.zoneName.localeCompare(b.zoneName, "fr"),
  );
}

/** « 64 % ». */
export function percentLabel(ratio: number): string {
  return `${formatNumber(Math.round(ratio * 100))} %`;
}

/** « 18 h » (slot-hours of a support or a zone). */
export function hoursLabel(hours: number): string {
  return `${formatNumber(Math.round(hours * 10) / 10)} h`;
}

/** Empty-state sentence of a tab. */
export function emptyMessage(tab: HeatmapTab): string {
  return tab === "diffusions"
    ? "Aucune diffusion sur la période."
    : "Aucune réservation sur la période.";
}
