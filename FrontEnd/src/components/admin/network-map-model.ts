/**
 * Pure helpers for the admin network map (move confirmation, radius edits, URL view state).
 */
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import {
  formatDistance,
  formatRadiusKm,
  haversineDistance,
  roundCoord,
  suggestZoneForPoint,
  type LngLat,
} from "@/lib/network/geo";

import { formatCoordinates, RADIUS_MAX_KM } from "@/components/admin/network-schemas";

export type NetworkView = "carte" | "tableau";

export type SummaryTone = "neutral" | "muted" | "warning" | "danger";

export interface SummaryItem {
  label: string;
  value: string;
  tone: SummaryTone;
}

/**
 * KPI strip of /admin/reseau: values are neutral by default; an attention colour only when the
 * value is above zero AND the metric is a problem (VD-07, UX-PLAN §4.8).
 */
export function networkSummaryItems(c: {
  activeZones: number;
  zones: number;
  active: number;
  maintenance: number;
  down: number;
}): SummaryItem[] {
  const fmt = formatNumber;
  return [
    { label: "Zones actives", value: `${fmt(c.activeZones)} / ${fmt(c.zones)}`, tone: "neutral" },
    { label: "Porteurs actifs", value: fmt(c.active), tone: c.active === 0 ? "muted" : "neutral" },
    {
      label: "En maintenance",
      value: fmt(c.maintenance),
      tone: c.maintenance > 0 ? "warning" : "muted",
    },
    { label: "Inactifs ou hors ligne", value: fmt(c.down), tone: c.down > 0 ? "danger" : "muted" },
  ];
}

/** `?porteur=12` → 12 (positive integers only). */
export function parseIdParam(value: string | string[] | undefined | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Initial state of /admin/reseau from its query: `?porteur=` and `?panneau=coherence` open the
 * map (inspector / coherence panel); `?onglet=zones|ecrans` without `?vue` opens the table.
 */
export function networkPageState(q: {
  onglet?: string | string[];
  vue?: string | string[];
  porteur?: string | string[];
  panneau?: string | string[];
}): {
  tab: "zones" | "ecrans";
  view: NetworkView;
  supportId: number | null;
  panel: "coherence" | null;
} {
  const supportId = parseIdParam(q.porteur);
  const panel = q.panneau === "coherence" ? "coherence" : null;
  const view: NetworkView =
    supportId !== null || panel !== null || q.onglet === "carte"
      ? "carte"
      : q.vue === undefined && q.onglet !== undefined
        ? "tableau"
        : parseNetworkView(q.vue);
  return { tab: q.onglet === "ecrans" ? "ecrans" : "zones", view, supportId, panel };
}

/** `?vue=tableau` → table view; anything else → map-first. */
export function parseNetworkView(value: string | string[] | undefined | null): NetworkView {
  return value === "tableau" ? "tableau" : "carte";
}

export interface MoveProposal {
  support: SupportResponse;
  from: LngLat;
  to: LngLat;
  distanceM: number;
  distanceLabel: string;
  fromLabel: string;
  toLabel: string;
  /** Zone of the support (current attachment). */
  zone: ZoneResponse | null;
  /** True when the new point is outside the radius of the attached zone. */
  leavesZone: boolean;
  /** Nearest zone whose radius contains the new point (may differ from the current zone). */
  suggestedZone: ZoneResponse | null;
}

/** Everything the « Déplacer ce Porteur ? » dialog shows. Coordinates rounded to 6 decimals. */
export function buildMoveProposal(
  support: SupportResponse,
  target: LngLat,
  zones: readonly ZoneResponse[],
): MoveProposal {
  const from = { lng: support.longitude, lat: support.latitude };
  const to = { lng: roundCoord(target.lng), lat: roundCoord(target.lat) };
  const distanceM = haversineDistance(from, to);
  const zone = zones.find((z) => z.id === support.zoneId) ?? null;
  const leavesZone =
    zone !== null &&
    zone.radiusKm !== null &&
    zone.radiusKm > 0 &&
    haversineDistance(to, { lng: zone.longitude, lat: zone.latitude }) > zone.radiusKm * 1000;
  return {
    support,
    from,
    to,
    distanceM,
    distanceLabel: formatDistance(distanceM),
    fromLabel: formatCoordinates(from.lat, from.lng),
    toLabel: formatCoordinates(to.lat, to.lng),
    zone,
    leavesZone,
    suggestedZone: suggestZoneForPoint(to, zones),
  };
}

export interface RadiusProposal {
  zone: ZoneResponse;
  fromKm: number | null;
  toKm: number;
  fromLabel: string;
  toLabel: string;
  /** Porteurs attached to the zone that would fall outside the new radius. */
  outside: SupportResponse[];
}

/** Clamps a dragged radius to the zone form rules (0.05 km step, 500 km max). */
export function clampRadiusKm(km: number): number {
  if (!Number.isFinite(km)) return 0.05;
  const stepped = Math.round(km * 20) / 20;
  return Math.min(RADIUS_MAX_KM, Math.max(0.05, stepped));
}

export function buildRadiusProposal(
  zone: ZoneResponse,
  radiusKm: number,
  supports: readonly SupportResponse[],
): RadiusProposal {
  const toKm = clampRadiusKm(radiusKm);
  const centre = { lng: zone.longitude, lat: zone.latitude };
  const outside = supports.filter(
    (s) =>
      s.zoneId === zone.id &&
      haversineDistance({ lng: s.longitude, lat: s.latitude }, centre) > toKm * 1000 + 1e-6,
  );
  return {
    zone,
    fromKm: zone.radiusKm,
    toKm,
    fromLabel: zone.radiusKm !== null ? formatRadiusKm(zone.radiusKm) : "non défini",
    toLabel: formatRadiusKm(toKm),
    outside,
  };
}
