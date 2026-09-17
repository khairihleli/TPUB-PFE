/**
 * Campaign-zone geometry (contract §5 F1): point + radius circles drawn on MapLibre and the
 * distance used by the backend (haversine, R = 6371.0088 km, `util/GeoUtils`).
 * Thin (lat, lng) wrappers over `@/lib/network/geo`, which works in {lng, lat} objects.
 */
import { circlePolygon as circleGeometry, haversineDistance } from "@/lib/network/geo";

/** Contract limits for campaign circles (PUT /api/campaigns/{id}/zones). */
export const CAMPAIGN_ZONE_LIMITS = {
  maxZones: 5,
  minRadiusKm: 0.1,
  maxRadiusKm: 50,
} as const;

/** Distance in kilometres between two points (same formula as the backend). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversineDistance({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 }) / 1000;
}

/** Backend `GeoUtils.within`: inclusive. */
export function withinKm(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radiusKm: number,
): boolean {
  if (!(radiusKm >= 0)) return false;
  return distanceKm(lat, lng, centerLat, centerLng) <= radiusKm + 1e-9;
}

export interface CircleFeature {
  type: "Feature";
  properties: { latitude: number; longitude: number; radiusKm: number };
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
}

/** Closed GeoJSON polygon feature approximating the circle (for a MapLibre `geojson` source). */
export function circlePolygon(
  lat: number,
  lng: number,
  radiusKm: number,
  steps = 64,
): CircleFeature {
  const geometry = circleGeometry({ lat, lng }, radiusKm, steps);
  return {
    type: "Feature",
    properties: { latitude: lat, longitude: lng, radiusKm },
    geometry: { type: "Polygon", coordinates: geometry.coordinates },
  };
}

/** FeatureCollection of several circles (multi-zone campaigns). */
export function circlesCollection(
  circles: readonly { latitude: number; longitude: number; radiusKm: number }[],
  steps = 64,
): { type: "FeatureCollection"; features: CircleFeature[] } {
  return {
    type: "FeatureCollection",
    features: circles.map((c) => circlePolygon(c.latitude, c.longitude, c.radiusKm, steps)),
  };
}

/** True when the point lies inside at least one circle (contract §2.4 reservation rule 6). */
export function insideAnyCircle(
  lat: number,
  lng: number,
  circles: readonly { latitude: number; longitude: number; radiusKm: number }[],
): boolean {
  return circles.some((c) => withinKm(lat, lng, c.latitude, c.longitude, c.radiusKm));
}

/** Clamps a radius to the contract range, rounded to 0.1 km. */
export function clampRadiusKm(radiusKm: number): number {
  if (!Number.isFinite(radiusKm)) return CAMPAIGN_ZONE_LIMITS.minRadiusKm;
  const clamped = Math.min(
    CAMPAIGN_ZONE_LIMITS.maxRadiusKm,
    Math.max(CAMPAIGN_ZONE_LIMITS.minRadiusKm, radiusKm),
  );
  return Math.round(clamped * 10) / 10;
}
