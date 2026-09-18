/**
 * Tiny equirectangular projection for the decorative network mini-map.
 * Latitude/longitude are projected into an SVG viewBox framing Tunisia's bounding box,
 * with a cos(mid-latitude) correction so the country keeps its proportions.
 * Pure: unit-tested in __tests__/map-projection.test.ts.
 */

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Tunisia (mainland + Djerba), slightly padded. */
export const TUNISIA_BOUNDS: GeoBounds = {
  minLat: 30.15,
  maxLat: 37.4,
  minLng: 7.45,
  maxLng: 11.65,
};

/** Kilometres per degree of latitude. */
export const KM_PER_DEG_LAT = 111.32;

export interface ProjectedPoint {
  x: number;
  y: number;
  /** False when the coordinate fell outside the bounds and was clamped to the edge. */
  inside: boolean;
}

export interface Projection {
  bounds: GeoBounds;
  width: number;
  height: number;
  project: (lat: number, lng: number) => ProjectedPoint;
  /** Converts a distance in km to viewBox units (vertical scale). */
  kmToUnits: (km: number) => number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * @param height viewBox height; the width is derived from the bounds' aspect ratio.
 */
export function createProjection(bounds: GeoBounds = TUNISIA_BOUNDS, height = 520): Projection {
  const dLat = bounds.maxLat - bounds.minLat;
  const dLng = bounds.maxLng - bounds.minLng;
  if (!(dLat > 0) || !(dLng > 0) || !(height > 0)) {
    throw new RangeError("Emprise cartographique invalide.");
  }
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const aspect = (dLng * Math.cos((midLat * Math.PI) / 180)) / dLat;
  const width = round1(height * aspect);
  const unitsPerDegLat = height / dLat;

  return {
    bounds,
    width,
    height,
    project(lat, lng) {
      const inside =
        lat >= bounds.minLat &&
        lat <= bounds.maxLat &&
        lng >= bounds.minLng &&
        lng <= bounds.maxLng;
      const cLat = clamp(lat, bounds.minLat, bounds.maxLat);
      const cLng = clamp(lng, bounds.minLng, bounds.maxLng);
      return {
        x: round1(((cLng - bounds.minLng) / dLng) * width),
        y: round1(((bounds.maxLat - cLat) / dLat) * height),
        inside,
      };
    },
    kmToUnits(km) {
      if (!(km > 0)) return 0;
      return round1((km / KM_PER_DEG_LAT) * unitsPerDegLat);
    },
  };
}

export interface ClusterZone {
  id: number;
  latitude: number;
  longitude: number;
  radiusKm: number | null;
}

export interface ZoneCluster {
  /** Zone ids in the cluster, in input order. */
  ids: number[];
  /** Roughly square (in km) frame around the clustered zones and their radii. */
  bounds: GeoBounds;
}

/**
 * Finds the largest group of zones whose markers overlap on the country map (single linkage:
 * two zones closer than `thresholdUnits` in viewBox units are linked). Returns null when no two
 * zones collide. Used to draw a « vue rapprochée » inset instead of a pile of markers.
 */
export function findDenseCluster(
  zones: readonly ClusterZone[],
  projection: Projection,
  thresholdUnits = 16,
): ZoneCluster | null {
  const points = zones
    .filter((z) => isValidCoordinate(z.latitude, z.longitude))
    .map((z) => ({ zone: z, ...projection.project(z.latitude, z.longitude) }))
    .filter((p) => p.inside);

  const parent = points.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    return r;
  };
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < thresholdUnits) {
        parent[find(j)] = find(i);
      }
    }
  }

  const groups = new Map<number, typeof points>();
  points.forEach((p, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), p]);
  });
  let best: typeof points = [];
  for (const g of groups.values()) if (g.length > best.length) best = g;
  if (best.length < 2) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const { zone } of best) {
    const latPad = (zone.radiusKm && zone.radiusKm > 0 ? zone.radiusKm : 1) / KM_PER_DEG_LAT;
    const lngPad = latPad / Math.cos((zone.latitude * Math.PI) / 180);
    minLat = Math.min(minLat, zone.latitude - latPad);
    maxLat = Math.max(maxLat, zone.latitude + latPad);
    minLng = Math.min(minLng, zone.longitude - lngPad);
    maxLng = Math.max(maxLng, zone.longitude + lngPad);
  }
  // breathing room around the halos
  const padLat = Math.max(0.02, (maxLat - minLat) * 0.18);
  const padLng = Math.max(0.02, (maxLng - minLng) * 0.18);
  minLat -= padLat;
  maxLat += padLat;
  minLng -= padLng;
  maxLng += padLng;

  // square it in kilometres so the inset is not distorted
  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const kmLat = (maxLat - minLat) * KM_PER_DEG_LAT;
  const kmLng = (maxLng - minLng) * KM_PER_DEG_LAT * cos;
  if (kmLng < kmLat) {
    const extra = (kmLat - kmLng) / (KM_PER_DEG_LAT * cos) / 2;
    minLng -= extra;
    maxLng += extra;
  } else {
    const extra = (kmLng - kmLat) / KM_PER_DEG_LAT / 2;
    minLat -= extra;
    maxLat += extra;
  }

  return { ids: best.map((p) => p.zone.id), bounds: { minLat, maxLat, minLng, maxLng } };
}

/** [lng, lat] pairs. */
export type LngLat = readonly [number, number];

/** Closed SVG path from [lng, lat] pairs. */
export function outlineToPath(points: readonly LngLat[], projection: Projection): string {
  if (points.length === 0) return "";
  return (
    points
      .map(([lng, lat], i) => {
        const p = projection.project(lat, lng);
        return `${i === 0 ? "M" : "L"}${p.x} ${p.y}`;
      })
      .join(" ") + " Z"
  );
}

/**
 * Deliberately simplified outline of mainland Tunisia (decorative, not a survey).
 * Clockwise from Tabarka.
 */
export const TUNISIA_OUTLINE: readonly LngLat[] = [
  [8.6, 36.94],
  [9.2, 37.15],
  [9.87, 37.33],
  [10.2, 37.2],
  [10.33, 36.95],
  [10.25, 36.78],
  [10.55, 36.78],
  [10.8, 37.05],
  [11.1, 37.08],
  [11.12, 36.85],
  [10.72, 36.45],
  [10.52, 36.3],
  [10.63, 35.85],
  [10.95, 35.7],
  [11.07, 35.5],
  [11.15, 35.22],
  [10.95, 35.05],
  [10.72, 34.73],
  [10.35, 34.4],
  [10.05, 34.15],
  [10.1, 33.88],
  [10.45, 33.62],
  [10.75, 33.6],
  [11.1, 33.3],
  [11.56, 33.17],
  [11.5, 32.65],
  [10.95, 32.25],
  [10.3, 31.7],
  [10.1, 31.2],
  [9.55, 30.23],
  [9.1, 31.0],
  [8.35, 32.5],
  [7.55, 33.2],
  [7.52, 33.85],
  [7.85, 34.4],
  [8.25, 34.65],
  [8.28, 35.25],
  [8.45, 35.75],
  [8.3, 36.45],
  [8.45, 36.75],
];

export const DJERBA_OUTLINE: readonly LngLat[] = [
  [10.75, 33.86],
  [10.95, 33.9],
  [11.06, 33.8],
  [10.96, 33.66],
  [10.76, 33.7],
];
