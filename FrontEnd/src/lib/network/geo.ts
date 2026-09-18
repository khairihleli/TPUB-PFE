/**
 * Pure geodesy helpers for the network map (WGS84 sphere approximation, metres).
 * GeoJSON order everywhere: [lng, lat].
 */

export interface LngLat {
  lng: number;
  lat: number;
}

/** GeoJSON position [lng, lat]. */
export type Position = [number, number];

/** [[west, south], [east, north]] — MapLibre `LngLatBoundsLike`. */
export type BBox = [Position, Position];

/** Tunisia (mainland + islands), padded. */
export const TUNISIA_BOUNDS: BBox = [
  [7.5, 30.2],
  [11.9, 37.6],
];

export const TUNISIA_CENTER: LngLat = { lng: 9.7, lat: 33.9 };

/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function isValidLngLat(p: Partial<LngLat> | null | undefined): p is LngLat {
  return (
    !!p &&
    typeof p.lng === "number" &&
    typeof p.lat === "number" &&
    Number.isFinite(p.lng) &&
    Number.isFinite(p.lat) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

export function toPosition(p: LngLat): Position {
  return [p.lng, p.lat];
}

export function fromPosition([lng, lat]: readonly [number, number]): LngLat {
  return { lng, lat };
}

/** Great-circle distance in metres. */
export function haversineDistance(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of a polyline in metres. */
export function polylineLength(points: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += haversineDistance(a, b);
  }
  return total;
}

/** Initial bearing from a to b, degrees 0–360 (0 = north, clockwise). */
export function bearingBetween(a: LngLat, b: LngLat): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLam = toRad(b.lng - a.lng);
  const y = Math.sin(dLam) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  return normalizeHeading(toDeg(Math.atan2(y, x)));
}

/** Point reached from `origin` after `distanceM` metres on `bearingDeg`. */
export function destinationPoint(origin: LngLat, bearingDeg: number, distanceM: number): LngLat {
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = toRad(bearingDeg);
  const phi1 = toRad(origin.lat);
  const lam1 = toRad(origin.lng);
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.min(1, Math.max(-1, sinPhi2)));
  const lam2 =
    lam1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * sinPhi2,
    );
  return { lng: ((toDeg(lam2) + 540) % 360) - 180, lat: toDeg(phi2) };
}

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Position[][];
}

/**
 * Geodesic circle as a closed GeoJSON Polygon (first = last position).
 * @param steps number of vertices (min 8).
 */
export function circlePolygon(center: LngLat, radiusKm: number, steps = 64): PolygonGeometry {
  const n = Math.max(8, Math.round(steps));
  const r = Math.max(0, radiusKm) * 1000;
  const ring: Position[] = [];
  for (let i = 0; i < n; i++) {
    ring.push(toPosition(destinationPoint(center, (360 / n) * i, r)));
  }
  const first = ring[0];
  if (first) ring.push([first[0], first[1]]);
  return { type: "Polygon", coordinates: [ring] };
}

/** True when `point` lies within `radiusKm` of `center` (inclusive). */
export function pointInRadius(point: LngLat, center: LngLat, radiusKm: number): boolean {
  if (!(radiusKm >= 0)) return false;
  return haversineDistance(point, center) <= radiusKm * 1000 + 1e-6;
}

export interface BBoxOptions {
  /** Fraction of the span added on each side (default 0.1). */
  padding?: number;
  /** Minimum span in degrees so a single point still frames a neighbourhood (default 0.02). */
  minSpanDeg?: number;
}

/** Bounding box of points with padding; null when there is no valid point. */
export function bboxOf(points: readonly LngLat[], options: BBoxOptions = {}): BBox | null {
  const { padding = 0.1, minSpanDeg = 0.02 } = options;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const p of points) {
    if (!isValidLngLat(p)) continue;
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  if (!Number.isFinite(west)) return null;
  let spanLng = east - west;
  let spanLat = north - south;
  if (spanLng < minSpanDeg) {
    const extra = (minSpanDeg - spanLng) / 2;
    west -= extra;
    east += extra;
    spanLng = minSpanDeg;
  }
  if (spanLat < minSpanDeg) {
    const extra = (minSpanDeg - spanLat) / 2;
    south -= extra;
    north += extra;
    spanLat = minSpanDeg;
  }
  const padLng = spanLng * Math.max(0, padding);
  const padLat = spanLat * Math.max(0, padding);
  return [
    [Math.max(-180, west - padLng), Math.max(-90, south - padLat)],
    [Math.min(180, east + padLng), Math.min(90, north + padLat)],
  ];
}

/** Bounding box of a circle (for fitting a zone). */
export function circleBBox(center: LngLat, radiusKm: number): BBox {
  const r = Math.max(0.05, radiusKm) * 1000;
  const n = destinationPoint(center, 0, r);
  const e = destinationPoint(center, 90, r);
  const s = destinationPoint(center, 180, r);
  const w = destinationPoint(center, 270, r);
  return [
    [w.lng, s.lat],
    [e.lng, n.lat],
  ];
}

export function bboxContains(bbox: BBox, p: LngLat): boolean {
  return p.lng >= bbox[0][0] && p.lng <= bbox[1][0] && p.lat >= bbox[0][1] && p.lat <= bbox[1][1];
}

/** Heading normalised to [0, 360). */
export function normalizeHeading(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

const COMPASS_SHORT = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;
const COMPASS_LONG = [
  "nord",
  "nord-est",
  "est",
  "sud-est",
  "sud",
  "sud-ouest",
  "ouest",
  "nord-ouest",
] as const;

export type CompassPoint = (typeof COMPASS_SHORT)[number];

function compassIndex(deg: number): number {
  return Math.round(normalizeHeading(deg) / 45) % 8;
}

/** 8-point French compass abbreviation: 0 → "N", 45 → "NE", 270 → "O". */
export function bearingLabel(deg: number): CompassPoint {
  return COMPASS_SHORT[compassIndex(deg)] ?? "N";
}

/** Full French name for screen readers: 225 → "sud-ouest". */
export function bearingName(deg: number): string {
  return COMPASS_LONG[compassIndex(deg)] ?? "nord";
}

/** « 850 m », « 12,4 km », « 124 km ». */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.round(meters) : Math.round(meters / 10) * 10;
    if (rounded < 1000) return `${rounded} m`;
  }
  const km = meters / 1000;
  if (km >= 100) return `${Math.round(km)} km`;
  const oneDecimal = Math.round(km * 10) / 10;
  return `${Number.isInteger(oneDecimal) ? oneDecimal.toFixed(0) : oneDecimal.toFixed(1).replace(".", ",")} km`;
}

/** « 1,5 km » for radius inputs (km). */
export function formatRadiusKm(km: number): string {
  return formatDistance(km * 1000);
}

export interface ZoneLike {
  id: number;
  latitude: number;
  longitude: number;
  radiusKm: number | null;
}

/** Zones whose circle contains the point, nearest centre first. */
export function zonesContaining<Z extends ZoneLike>(point: LngLat, zones: readonly Z[]): Z[] {
  return zones
    .filter((z) => z.radiusKm !== null && z.radiusKm > 0)
    .map((z) => ({ z, d: haversineDistance(point, { lng: z.longitude, lat: z.latitude }) }))
    .filter(({ z, d }) => d <= (z.radiusKm ?? 0) * 1000 + 1e-6)
    .sort((a, b) => a.d - b.d)
    .map(({ z }) => z);
}

/**
 * Admin auto-suggestion: nearest zone whose radius contains the point (spec §7), else null.
 */
export function suggestZoneForPoint<Z extends ZoneLike>(
  point: LngLat,
  zones: readonly Z[],
): Z | null {
  return zonesContaining(point, zones)[0] ?? null;
}

/** Nearest zone centre regardless of radius, with its distance in metres. */
export function nearestZone<Z extends ZoneLike>(
  point: LngLat,
  zones: readonly Z[],
): { zone: Z; distanceM: number } | null {
  let best: { zone: Z; distanceM: number } | null = null;
  for (const zone of zones) {
    const distanceM = haversineDistance(point, { lng: zone.longitude, lat: zone.latitude });
    if (!best || distanceM < best.distanceM) best = { zone, distanceM };
  }
  return best;
}

/** Rounds a coordinate to 6 decimals (~11 cm), what the backend stores. */
export function roundCoord(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** One coordinate with 5 decimals (~1 m) and a dot: « 36.79980 ». */
export function formatCoordinate(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const fixed = n.toFixed(5);
  return fixed === "-0.00000" ? "0.00000" : fixed;
}

/** « 36.79980, 10.18170 » (latitude, longitude — the order map apps accept when pasted). */
export function formatLatLng(lat: number, lng: number): string {
  return `${formatCoordinate(lat)}, ${formatCoordinate(lng)}`;
}

/** OpenStreetMap link with a marker on the exact point, zoomed to street level. */
export function openStreetMapUrl(lat: number, lng: number, zoom = 18): string {
  const la = roundCoord(lat);
  const lo = roundCoord(lng);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=${Math.round(zoom)}/${la}/${lo}`;
}

/**
 * Bounding box of points plus circles (centre + radius), padded. Null when there is no valid
 * point and no valid circle.
 */
export function bboxOfPointsAndCircles(
  points: readonly LngLat[],
  circles: readonly { center: LngLat; radiusKm: number | null }[],
  options: BBoxOptions = {},
): BBox | null {
  const all: LngLat[] = points.filter((p) => isValidLngLat(p));
  for (const c of circles) {
    if (!isValidLngLat(c.center)) continue;
    if (c.radiusKm !== null && c.radiusKm > 0) {
      const [[w, s], [e, n]] = circleBBox(c.center, c.radiusKm);
      all.push({ lng: w, lat: s }, { lng: e, lat: n });
    } else {
      all.push(c.center);
    }
  }
  return bboxOf(all, options);
}
