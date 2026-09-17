/**
 * Zone & Porteurs step model (contract §2.1 zones, §2.4 availability): campaign circles drawn on
 * the map, availability rows, alternatives and recommendations. Pure functions only.
 */
import type {
  AlternativeSlot,
  AvailabilityResponse,
  AvailabilityStatus,
  AvailabilityWindow,
  CampaignResponse,
  CampaignZoneRequest,
  CampaignZoneResponse,
  SupportAvailabilityItem,
  SupportResponse,
  SupportType,
  ZoneRecommendation,
  ZoneResponse,
} from "@/lib/api/types";
import { translateFieldMessage } from "@/lib/api/messages";
import { AVAILABILITY_STATUS_ORDER } from "@/lib/campaign-status";
import { formatCount, formatDateRange, formatNumber } from "@/lib/format";
import { CAMPAIGN_ZONE_LIMITS, distanceKm } from "@/lib/geo";
import { formatSlot, normalizeTime } from "@/lib/time-slots";

/** Radius slider of the step (a narrower range than the API's 0.1..50 km). */
export const RADIUS_MIN_KM = 0.5;
export const RADIUS_MAX_KM = 20;
export const RADIUS_STEP_KM = 0.5;
export const DEFAULT_RADIUS_KM = 3;
export const MAX_CIRCLES = CAMPAIGN_ZONE_LIMITS.maxZones;

export interface DraftCircle {
  /** Stable client key (React lists, active circle). */
  key: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  label: string | null;
}

let circleSeq = 0;
export function newCircleKey(): string {
  circleSeq += 1;
  return `cercle-${circleSeq}`;
}

/** Radius snapped to the slider step and clamped to its range. */
export function snapRadius(km: number): number {
  if (!Number.isFinite(km)) return DEFAULT_RADIUS_KM;
  const snapped = Math.round(km / RADIUS_STEP_KM) * RADIUS_STEP_KM;
  return Math.min(RADIUS_MAX_KM, Math.max(RADIUS_MIN_KM, snapped));
}

/** 6 decimals (≈ 10 cm), like the backend columns. */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function circlesFromZones(
  zones: readonly CampaignZoneResponse[] | undefined,
): DraftCircle[] {
  return (zones ?? []).map((z) => ({
    key: `zone-${z.id}`,
    latitude: z.latitude,
    longitude: z.longitude,
    radiusKm: z.radiusKm,
    label: z.label,
  }));
}

export function toZoneRequests(circles: readonly DraftCircle[]): CampaignZoneRequest[] {
  return circles.map((c) => ({
    latitude: roundCoordinate(c.latitude),
    longitude: roundCoordinate(c.longitude),
    radiusKm: Math.round(c.radiusKm * 10) / 10,
    label: c.label?.trim() ? c.label.trim().slice(0, 150) : null,
  }));
}

/** Same geometry and labels (order matters: it is the label order « Zone 1…5 »). */
export function sameCircles(
  a: readonly Pick<DraftCircle, "latitude" | "longitude" | "radiusKm" | "label">[],
  b: readonly Pick<DraftCircle, "latitude" | "longitude" | "radiusKm" | "label">[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => {
    const d = b[i];
    return (
      d !== undefined &&
      Math.abs(c.latitude - d.latitude) < 1e-6 &&
      Math.abs(c.longitude - d.longitude) < 1e-6 &&
      Math.abs(c.radiusKm - d.radiusKm) < 1e-6 &&
      (c.label ?? "") === (d.label ?? "")
    );
  });
}

/** Display name of a circle: its label, else « Zone n ». */
export function circleName(circle: Pick<DraftCircle, "label">, index: number): string {
  return circle.label?.trim() || `Zone ${index + 1}`;
}

/** Map zone id of a draft circle (negative: never collides with a real zone). */
export function circleMapId(index: number): number {
  return -(index + 1);
}

export function circleIndexOfMapId(mapId: number): number | null {
  return mapId < 0 ? -mapId - 1 : null;
}

/** Circles drawn by NetworkMap as pseudo-zones (radius handle on the active one). */
export function circlesAsMapZones(circles: readonly DraftCircle[]): ZoneResponse[] {
  return circles.map((c, i) => ({
    id: circleMapId(i),
    name: circleName(c, i),
    latitude: c.latitude,
    longitude: c.longitude,
    radiusKm: c.radiusKm,
    isActive: true,
  }));
}

/**
 * Circle centred on a recommended zone. The radius is the zone radius (3 km when unknown), widened
 * so every Porteur attached to the zone falls inside: recommendations count a zone's own Porteurs,
 * which may sit outside the zone's nominal circle. Rounded up to the slider step, max 20 km.
 */
export function circleFromRecommendation(
  rec: Pick<ZoneRecommendation, "zone">,
  supports: readonly Pick<SupportResponse, "zoneId" | "latitude" | "longitude">[] = [],
): DraftCircle {
  const { zone } = rec;
  const farthest = supports
    .filter((s) => s.zoneId === zone.id)
    .reduce(
      (max, s) => Math.max(max, distanceKm(zone.latitude, zone.longitude, s.latitude, s.longitude)),
      0,
    );
  // 100 m margin absorbs rounding between this haversine and the backend's.
  const needed = Math.max(zone.radiusKm ?? DEFAULT_RADIUS_KM, farthest > 0 ? farthest + 0.1 : 0);
  const radiusKm = Math.min(
    RADIUS_MAX_KM,
    Math.max(RADIUS_MIN_KM, Math.ceil(needed / RADIUS_STEP_KM - 1e-9) * RADIUS_STEP_KM),
  );
  return {
    key: newCircleKey(),
    latitude: zone.latitude,
    longitude: zone.longitude,
    radiusKm,
    label: zone.name.slice(0, 150),
  };
}

// ---------------------------------------------------------------------------
// Campaign window
// ---------------------------------------------------------------------------

/** The campaign's availability window ("HH:mm:ss"), or null while incomplete/invalid. */
export function campaignWindow(
  campaign: Pick<CampaignResponse, "startDate" | "endDate" | "startTime" | "endTime">,
): AvailabilityWindow | null {
  const startTime = normalizeTime(campaign.startTime);
  const endTime = normalizeTime(campaign.endTime);
  if (!campaign.startDate || !campaign.endDate || !startTime || !endTime) return null;
  if (campaign.endDate < campaign.startDate || startTime >= endTime) return null;
  return { startDate: campaign.startDate, endDate: campaign.endDate, startTime, endTime };
}

export function windowKey(w: AvailabilityWindow | null): string {
  return w ? `${w.startDate}_${w.endDate}_${w.startTime}_${w.endTime}` : "none";
}

/** « Soir (18 h – 23 h) · 12 oct. – 18 oct. 2026 · 4 Porteurs disponibles » */
export function alternativeLabel(alt: AlternativeSlot): string {
  return [
    formatSlot(alt.startTime, alt.endTime),
    formatDateRange(alt.startDate, alt.endDate, "medium"),
    formatCount(alt.availableSupports, "Porteur disponible", "Porteurs disponibles"),
  ].join(" · ");
}

// ---------------------------------------------------------------------------
// Availability rows
// ---------------------------------------------------------------------------

export function filterByType(
  items: readonly SupportAvailabilityItem[],
  types: readonly SupportType[],
): SupportAvailabilityItem[] {
  if (types.length === 0) return [...items];
  return items.filter((i) => types.includes(i.support.supportType));
}

/**
 * « Disponibles uniquement » filter (cahier §7, filtre par disponibilité): keeps DISPONIBLE Porteurs
 * and the ones already reserved by this campaign (so they can still be cancelled).
 */
export function filterByAvailability(
  items: readonly SupportAvailabilityItem[],
  onlyAvailable: boolean,
): SupportAvailabilityItem[] {
  if (!onlyAvailable) return [...items];
  return items.filter((i) => i.reservedByCampaign || i.status === "DISPONIBLE");
}

/** Support types present in a list (filter chips), in API order. */
export function presentTypes(supports: readonly { supportType: SupportType }[]): SupportType[] {
  const order: SupportType[] = [
    "ECRAN",
    "PANNEAU_NUMERIQUE",
    "POINT_WIFI",
    "APPLICATION",
    "SITE_WEB",
  ];
  const present = new Set(supports.map((s) => s.supportType));
  return order.filter((t) => present.has(t));
}

/** Bookable now: DISPONIBLE and not already held by this campaign. */
export function isSelectable(item: SupportAvailabilityItem): boolean {
  return item.status === "DISPONIBLE" && !item.reservedByCampaign;
}

/** Porteurs reserved by the campaign first, then available ones, then by status and distance. */
export function sortAvailability(
  items: readonly SupportAvailabilityItem[],
): SupportAvailabilityItem[] {
  const rank = (i: SupportAvailabilityItem) =>
    i.reservedByCampaign ? -1 : AVAILABILITY_STATUS_ORDER.indexOf(i.status);
  return [...items].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY) ||
      a.support.name.localeCompare(b.support.name, "fr"),
  );
}

export function statusCounts(
  items: readonly SupportAvailabilityItem[],
): Record<AvailabilityStatus, number> {
  const out: Record<AvailabilityStatus, number> = {
    DISPONIBLE: 0,
    RESERVE: 0,
    OCCUPE: 0,
    MAINTENANCE: 0,
    HORS_LIGNE: 0,
  };
  for (const i of items) out[i.status] += 1;
  return out;
}

export function availabilityMap(
  items: readonly SupportAvailabilityItem[],
): Map<number, AvailabilityStatus> {
  return new Map(items.map((i) => [i.support.id, i.status]));
}

/** « 4 Porteurs disponibles sur 6 · 12 480 affichages estimés · 99,840 DT » parts. */
export function summaryParts(summary: AvailabilityResponse["summary"]): {
  available: string;
  views: string;
} {
  return {
    available: `${formatCount(summary.availableSupports, "Porteur disponible", "Porteurs disponibles")} sur ${formatNumber(summary.totalSupports)}`,
    views: `${formatNumber(summary.estimatedViewsAvailable)} affichages estimés`,
  };
}

export function selectionTotals(
  items: readonly SupportAvailabilityItem[],
  selected: ReadonlySet<number>,
): { count: number; views: number; cost: number } {
  let views = 0;
  let cost = 0;
  let count = 0;
  for (const i of items) {
    if (!selected.has(i.support.id)) continue;
    count += 1;
    views += Number.isFinite(i.estimatedViews) ? i.estimatedViews : 0;
    cost += Number.isFinite(i.estimatedCost) ? i.estimatedCost : 0;
  }
  return { count, views, cost: Math.round(cost * 1000) / 1000 };
}

/** 409 BATCH_CONFLICT `{ supportId: CODE }` → French message per Porteur. */
export function batchConflictMessages(
  conflicts: Readonly<Record<number, string>>,
): Map<number, string> {
  return new Map(
    Object.entries(conflicts).map(([id, code]) => [Number(id), translateFieldMessage(code)]),
  );
}

// ---------------------------------------------------------------------------
// Covering circle (network explorer bookings)
// ---------------------------------------------------------------------------

/**
 * Circle centred on the points' mean position whose radius covers them all plus `padKm`
 * (contract §5 F2 item 9), clamped to the API range.
 */
export function coveringCircle(
  points: readonly { latitude: number; longitude: number }[],
  padKm = 0.5,
): { latitude: number; longitude: number; radiusKm: number } | null {
  if (points.length === 0) return null;
  const latitude = points.reduce((s, p) => s + p.latitude, 0) / points.length;
  const longitude = points.reduce((s, p) => s + p.longitude, 0) / points.length;
  const far = Math.max(
    0,
    ...points.map((p) => distanceKm(latitude, longitude, p.latitude, p.longitude)),
  );
  const radiusKm = Math.min(
    CAMPAIGN_ZONE_LIMITS.maxRadiusKm,
    Math.max(CAMPAIGN_ZONE_LIMITS.minRadiusKm, Math.ceil((far + padKm) * 10) / 10),
  );
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude), radiusKm };
}
