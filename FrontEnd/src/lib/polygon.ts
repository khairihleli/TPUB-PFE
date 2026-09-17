/**
 * Polygon geometry of campaign and emergency targets (docs/round2-contract.md §4.2). Mirror of the
 * backend `util/PolygonGeometry`: same limits, same validation order, same French reasons, same
 * projection and rounding. The test vectors of `__tests__/polygon.test.ts` are shared with
 * `PolygonGeometryTest.java`.
 *
 * Representation: parts → rings → open vertex lists (`LngLat[][][]`). Ring 0 of a part is its
 * outer ring, the others are holes.
 */
import type { LngLat } from "@/lib/network/geo";

export type PolygonParts = LngLat[][][];

export interface GeoJsonPolygon {
  type: "Polygon";
  /** rings → [lng, lat] positions, closed */
  coordinates: [number, number][][];
}

export interface GeoJsonMultiPolygon {
  type: "MultiPolygon";
  coordinates: [number, number][][][];
}

export type GeoJsonPolygonal = GeoJsonPolygon | GeoJsonMultiPolygon;

export interface PolygonLimits {
  /** per ring, closing point excluded */
  maxVertices: number;
  maxTotalVertices: number;
  maxParts: number;
  /** per part */
  maxHoles: number;
  minAreaKm2: number;
  maxAreaKm2: number;
  maxRadiusKm: number;
}

/** `tpub.geo.polygon.*` defaults (§4.1). */
export const DEFAULT_POLYGON_LIMITS: PolygonLimits = {
  maxVertices: 100,
  maxTotalVertices: 200,
  maxParts: 5,
  maxHoles: 5,
  minAreaKm2: 0.01,
  maxAreaKm2: 2000,
  maxRadiusKm: 50,
};

export const POLYGON_MESSAGES = {
  geometry: "Géométrie invalide (Polygon ou MultiPolygon attendu).",
  bounds: "Coordonnées hors limites.",
  minVertices: "Un polygone doit avoir au moins 3 sommets.",
  crossing: "Le tracé du polygone se croise.",
} as const;

/** Distance (degrees) under which a point is on an edge, hence inside. */
const EDGE_EPSILON = 1e-9;
const EARTH_RADIUS_KM = 6371.0088;

export type PolygonValidation =
  | { ok: true; areaKm2: number; centroid: LngLat; radiusKm: number; parts: PolygonParts }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return (Math.sign(value) * Math.round(Math.abs(value) * factor)) / factor;
}

export function round7(value: number): number {
  return roundTo(value, 7);
}

/** `0.01 → "0,01"`, `2000 → "2 000"` (plain spaces, same as the backend messages). */
export function formatFr(value: number): string {
  const negative = value < 0;
  const plain = String(Math.abs(value));
  const [integer = "0", fraction = ""] = plain.split(".");
  let grouped = "";
  for (let i = 0; i < integer.length; i += 1) {
    if (i > 0 && (integer.length - i) % 3 === 0) grouped += " ";
    grouped += integer[i];
  }
  return `${negative ? "-" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

const tooDetailed = (limit: string) => `Polygone trop détaillé (${limit}).`;

// ---------------------------------------------------------------------------
// GeoJSON conversion
// ---------------------------------------------------------------------------

function closeRing(ring: readonly LngLat[]): [number, number][] {
  const out = ring.map((v) => [v.lng, v.lat] as [number, number]);
  const first = ring[0];
  if (first) out.push([first.lng, first.lat]);
  return out;
}

/** One part → Polygon, several → MultiPolygon; rings are closed. */
export function ringsToGeoJson(parts: PolygonParts): GeoJsonPolygonal {
  if (parts.length === 1) {
    return { type: "Polygon", coordinates: (parts[0] ?? []).map(closeRing) };
  }
  return { type: "MultiPolygon", coordinates: parts.map((part) => part.map(closeRing)) };
}

function isPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function parsePolygon(coordinates: unknown): LngLat[][] | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
  const rings: LngLat[][] = [];
  for (const ring of coordinates) {
    if (!Array.isArray(ring)) return null;
    const vertices: LngLat[] = [];
    for (const position of ring) {
      if (!isPosition(position)) return null;
      vertices.push({ lng: position[0], lat: position[1] });
    }
    rings.push(vertices);
  }
  return rings;
}

/** Parts of a GeoJSON Polygon/MultiPolygon as given (not normalised), null when malformed. */
export function geoJsonToRings(geometry: unknown): PolygonParts | null {
  if (typeof geometry !== "object" || geometry === null) return null;
  const { type, coordinates } = geometry as { type?: unknown; coordinates?: unknown };
  if (type === "Polygon") {
    const part = parsePolygon(coordinates);
    return part ? [part] : null;
  }
  if (type === "MultiPolygon") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return null;
    const parts: PolygonParts = [];
    for (const polygon of coordinates) {
      const part = parsePolygon(polygon);
      if (!part) return null;
      parts.push(part);
    }
    return parts;
  }
  return null;
}

/** Rounds to 7 decimals, removes consecutive duplicates and the closing point(s). */
export function normalizeParts(parts: PolygonParts): PolygonParts {
  return parts.map((part) =>
    part.map((ring) => {
      const clean: LngLat[] = [];
      for (const v of ring) {
        const rounded = { lng: round7(v.lng), lat: round7(v.lat) };
        const last = clean[clean.length - 1];
        if (!last || last.lng !== rounded.lng || last.lat !== rounded.lat) clean.push(rounded);
      }
      while (clean.length > 1) {
        const first = clean[0]!;
        const last = clean[clean.length - 1]!;
        if (first.lng !== last.lng || first.lat !== last.lat) break;
        clean.pop();
      }
      return clean;
    }),
  );
}

function distinctCount(ring: readonly LngLat[]): number {
  return new Set(ring.map((v) => `${v.lng},${v.lat}`)).size;
}

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

function orientation(a: LngLat, b: LngLat, c: LngLat): number {
  return (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
}

function onSegment(a: LngLat, b: LngLat, p: LngLat): boolean {
  return (
    p.lng >= Math.min(a.lng, b.lng) &&
    p.lng <= Math.max(a.lng, b.lng) &&
    p.lat >= Math.min(a.lat, b.lat) &&
    p.lat <= Math.max(a.lat, b.lat)
  );
}

export function segmentsIntersect(p1: LngLat, p2: LngLat, p3: LngLat, p4: LngLat): boolean {
  const d1 = orientation(p3, p4, p1);
  const d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3);
  const d4 = orientation(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return (
    (d1 === 0 && onSegment(p3, p4, p1)) ||
    (d2 === 0 && onSegment(p3, p4, p2)) ||
    (d3 === 0 && onSegment(p1, p2, p3)) ||
    (d4 === 0 && onSegment(p1, p2, p4))
  );
}

/** Any pair of non-adjacent edges intersecting (touching included). */
export function ringSelfIntersects(ring: readonly LngLat[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j += 1) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(a, b, ring[j]!, ring[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

function distanceToSegment(a: LngLat, b: LngLat, p: LngLat): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / lengthSquared));
  return Math.hypot(p.lng - (a.lng + t * dx), p.lat - (a.lat + t * dy));
}

function onRingEdge(ring: readonly LngLat[], p: LngLat): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    if (distanceToSegment(ring[i]!, ring[(i + 1) % n]!, p) < EDGE_EPSILON) return true;
  }
  return false;
}

function crossingsOdd(ring: readonly LngLat[], p: LngLat): boolean {
  let odd = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const vi = ring[i]!;
    const vj = ring[j]!;
    if (
      vi.lat > p.lat !== vj.lat > p.lat &&
      p.lng < ((vj.lng - vi.lng) * (p.lat - vi.lat)) / (vj.lat - vi.lat) + vi.lng
    ) {
      odd = !odd;
    }
  }
  return odd;
}

/** Even-odd ray casting over every ring of each part; a point on an edge is inside. */
export function pointInPolygon(point: LngLat, parts: PolygonParts): boolean {
  for (const part of parts) {
    let inside = false;
    for (const ring of part) {
      if (ring.length === 0) continue;
      if (onRingEdge(ring, point)) return true;
      if (crossingsOdd(ring, point)) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Measures
// ---------------------------------------------------------------------------

function haversineKm(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

interface Measures {
  areaKm2: number;
  centroid: LngLat;
  radiusKm: number;
}

/** [|area|, cx, cy] of one ring in the projection. */
function ringMeasure(
  ring: readonly LngLat[],
  lat0: number,
  lng0: number,
  cos0: number,
): [number, number, number] {
  const n = ring.length;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const xs = ring.map((v) => EARTH_RADIUS_KM * toRad(v.lng - lng0) * cos0);
  const ys = ring.map((v) => EARTH_RADIUS_KM * toRad(v.lat - lat0));
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const cross = xs[i]! * ys[j]! - xs[j]! * ys[i]!;
    twiceArea += cross;
    cx += (xs[i]! + xs[j]!) * cross;
    cy += (ys[i]! + ys[j]!) * cross;
  }
  if (twiceArea === 0) {
    const mx = xs.reduce((s, x) => s + x, 0) / n;
    const my = ys.reduce((s, y) => s + y, 0) / n;
    return [0, mx, my];
  }
  return [Math.abs(twiceArea / 2), cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

/** Equirectangular projection around the mean outer-ring position, shoelace, weighted centroid. */
function measure(parts: PolygonParts): Measures {
  let sumLat = 0;
  let sumLng = 0;
  let count = 0;
  for (const part of parts) {
    for (const v of part[0] ?? []) {
      sumLat += v.lat;
      sumLng += v.lng;
      count += 1;
    }
  }
  const lat0 = sumLat / count;
  const lng0 = sumLng / count;
  const cos0 = Math.cos((lat0 * Math.PI) / 180);
  let totalArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (const part of parts) {
    let partArea = 0;
    let partX = 0;
    let partY = 0;
    part.forEach((ring, k) => {
      const [area, x, y] = ringMeasure(ring, lat0, lng0, cos0);
      const sign = k === 0 ? 1 : -1;
      partArea += sign * area;
      partX += sign * area * x;
      partY += sign * area * y;
    });
    if (partArea > 0) {
      totalArea += partArea;
      weightedX += partX;
      weightedY += partY;
    }
  }
  const cx = totalArea > 0 ? weightedX / totalArea : 0;
  const cy = totalArea > 0 ? weightedY / totalArea : 0;
  const centroid = {
    lat: round7(lat0 + ((cy / EARTH_RADIUS_KM) * 180) / Math.PI),
    lng: round7(lng0 + ((cx / (EARTH_RADIUS_KM * cos0)) * 180) / Math.PI),
  };
  let radius = 0;
  for (const part of parts) {
    for (const ring of part) {
      for (const v of ring) radius = Math.max(radius, haversineKm(centroid, v));
    }
  }
  return { areaKm2: roundTo(Math.max(0, totalArea), 3), centroid, radiusKm: roundTo(radius, 3) };
}

export function polygonAreaKm2(parts: PolygonParts): number {
  return measure(normalizeParts(parts)).areaKm2;
}

export function centroid(parts: PolygonParts): LngLat {
  return measure(normalizeParts(parts)).centroid;
}

export function circumscribedRadiusKm(parts: PolygonParts): number {
  return measure(normalizeParts(parts)).radiusKm;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Contract order, first failure wins. `parts` are normalised in the result. */
export function validatePolygon(
  parts: PolygonParts,
  limits: PolygonLimits = DEFAULT_POLYGON_LIMITS,
): PolygonValidation {
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    return { ok: false, reason: POLYGON_MESSAGES.geometry };
  }
  for (const part of parts) {
    for (const ring of part) {
      for (const v of ring) {
        if (
          !Number.isFinite(v.lat) ||
          !Number.isFinite(v.lng) ||
          v.lat < -90 ||
          v.lat > 90 ||
          v.lng < -180 ||
          v.lng > 180
        ) {
          return { ok: false, reason: POLYGON_MESSAGES.bounds };
        }
      }
    }
  }
  const clean = normalizeParts(parts);
  for (const part of clean) {
    for (const ring of part) {
      if (distinctCount(ring) < 3) return { ok: false, reason: POLYGON_MESSAGES.minVertices };
    }
  }
  if (clean.length > limits.maxParts) {
    return { ok: false, reason: tooDetailed(`${limits.maxParts} parties au plus`) };
  }
  let total = 0;
  for (const part of clean) {
    if (part.length - 1 > limits.maxHoles) {
      return { ok: false, reason: tooDetailed(`${limits.maxHoles} trous au plus par partie`) };
    }
    for (const ring of part) {
      if (ring.length > limits.maxVertices) {
        return { ok: false, reason: tooDetailed(`${limits.maxVertices} sommets au plus`) };
      }
      total += ring.length;
    }
  }
  if (total > limits.maxTotalVertices) {
    return { ok: false, reason: tooDetailed(`${limits.maxTotalVertices} sommets au plus au total`) };
  }
  for (const part of clean) {
    for (const ring of part) {
      if (ringSelfIntersects(ring)) return { ok: false, reason: POLYGON_MESSAGES.crossing };
    }
    const outer = part[0]!;
    for (const hole of part.slice(1)) {
      for (const v of hole) {
        if (!onRingEdge(outer, v) && !crossingsOdd(outer, v)) {
          return { ok: false, reason: POLYGON_MESSAGES.crossing };
        }
      }
    }
  }
  const m = measure(clean);
  if (m.areaKm2 < limits.minAreaKm2) {
    return { ok: false, reason: `Zone trop petite (${formatFr(limits.minAreaKm2)} km² minimum).` };
  }
  if (m.areaKm2 > limits.maxAreaKm2) {
    return { ok: false, reason: `Zone trop grande (${formatFr(limits.maxAreaKm2)} km² maximum).` };
  }
  if (m.radiusKm > limits.maxRadiusKm) {
    return {
      ok: false,
      reason: `Zone trop étendue (${formatFr(limits.maxRadiusKm)} km autour de son centre au maximum).`,
    };
  }
  return { ok: true, areaKm2: m.areaKm2, centroid: m.centroid, radiusKm: m.radiusKm, parts: clean };
}

/** Same validation for a GeoJSON value (malformed → geometry reason). */
export function validateGeoJson(
  geometry: unknown,
  limits: PolygonLimits = DEFAULT_POLYGON_LIMITS,
): PolygonValidation {
  const parts = geoJsonToRings(geometry);
  if (!parts) return { ok: false, reason: POLYGON_MESSAGES.geometry };
  return validatePolygon(parts, limits);
}

/** « 3,2 km² » (1 decimal from 1 km², 2 below). */
export function formatAreaKm2(areaKm2: number): string {
  const decimals = areaKm2 >= 1 ? 1 : 2;
  return `${new Intl.NumberFormat("fr-TN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(areaKm2)} km²`;
}
