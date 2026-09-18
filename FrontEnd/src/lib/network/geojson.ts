/**
 * GeoJSON builders for the MapLibre layers + a dependency-free grid clustering.
 * Pure: no MapLibre import, unit-tested.
 */
import type { SupportResponse, TechnicalStatus, ZoneResponse } from "@/lib/api/types";
import {
  bboxOfPointsAndCircles,
  circlePolygon,
  destinationPoint,
  isValidLngLat,
  normalizeHeading,
  toPosition,
  type BBox,
  type BBoxOptions,
  type LngLat,
  type PolygonGeometry,
  type Position,
} from "@/lib/network/geo";
import {
  DEFAULT_MAST_HEIGHT,
  isBookable,
  resolvePorteurType,
  type PorteurType,
} from "@/lib/network/porteur";
import type { Selection } from "@/lib/network/selection";

export interface PointGeometry {
  type: "Point";
  coordinates: Position;
}

export interface LineStringGeometry {
  type: "LineString";
  coordinates: Position[];
}

export type Geometry = PointGeometry | LineStringGeometry | PolygonGeometry;

export interface Feature<G extends Geometry = Geometry, P = Record<string, unknown>> {
  type: "Feature";
  id?: number | string;
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G extends Geometry = Geometry, P = Record<string, unknown>> {
  type: "FeatureCollection";
  features: Feature<G, P>[];
}

export function featureCollection<G extends Geometry, P>(
  features: Feature<G, P>[],
): FeatureCollection<G, P> {
  return { type: "FeatureCollection", features };
}

export const EMPTY_FEATURE_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const supportLngLat = (s: Pick<SupportResponse, "latitude" | "longitude">): LngLat => ({
  lng: s.longitude,
  lat: s.latitude,
});

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
export interface ZoneFeatureProps {
  id: number;
  name: string;
  radiusKm: number;
  active: boolean;
  selected: boolean;
  /** Admin highlight (radius handle). */
  focused: boolean;
}

export interface ZoneFeatureOptions {
  selectedZoneIds?: readonly number[];
  focusedZoneId?: number | null;
  steps?: number;
  /** Radius override per zone id (live preview while dragging a handle). */
  radiusOverrides?: Readonly<Record<number, number>>;
}

/** Circle polygons for zones with a positive radius (zones without radius are skipped). */
export function zonesToFeatureCollection(
  zones: readonly ZoneResponse[],
  options: ZoneFeatureOptions = {},
): FeatureCollection<PolygonGeometry, ZoneFeatureProps> {
  const { selectedZoneIds = [], focusedZoneId = null, steps = 72, radiusOverrides = {} } = options;
  const selected = new Set(selectedZoneIds);
  const features: Feature<PolygonGeometry, ZoneFeatureProps>[] = [];
  for (const z of zones) {
    const center = { lng: z.longitude, lat: z.latitude };
    const radiusKm = radiusOverrides[z.id] ?? z.radiusKm;
    if (!isValidLngLat(center) || radiusKm === null || !(radiusKm > 0)) continue;
    features.push({
      type: "Feature",
      id: z.id,
      geometry: circlePolygon(center, radiusKm, steps),
      properties: {
        id: z.id,
        name: z.name,
        radiusKm,
        active: z.isActive,
        selected: selected.has(z.id),
        focused: focusedZoneId === z.id,
      },
    });
  }
  return featureCollection(features);
}

export interface ZoneLabelProps {
  id: number;
  name: string;
  active: boolean;
  selected: boolean;
  supportCount: number;
}

/** Centroid label points (one per zone with valid coordinates). */
export function zoneLabelsToFeatureCollection(
  zones: readonly ZoneResponse[],
  supports: readonly Pick<SupportResponse, "zoneId">[] = [],
  selectedZoneIds: readonly number[] = [],
): FeatureCollection<PointGeometry, ZoneLabelProps> {
  const counts = new Map<number, number>();
  for (const s of supports) counts.set(s.zoneId, (counts.get(s.zoneId) ?? 0) + 1);
  const selected = new Set(selectedZoneIds);
  return featureCollection(
    zones
      .filter((z) => isValidLngLat({ lng: z.longitude, lat: z.latitude }))
      .map((z) => ({
        type: "Feature" as const,
        id: z.id,
        geometry: { type: "Point" as const, coordinates: [z.longitude, z.latitude] as Position },
        properties: {
          id: z.id,
          name: z.name,
          active: z.isActive,
          selected: selected.has(z.id),
          supportCount: counts.get(z.id) ?? 0,
        },
      })),
  );
}

// ---------------------------------------------------------------------------
// Supports
// ---------------------------------------------------------------------------
export interface SupportFeatureProps {
  id: number;
  name: string;
  type: PorteurType;
  inferred: boolean;
  status: TechnicalStatus;
  bookable: boolean;
  zoneId: number;
  zoneName: string;
  /** Normalised heading or null. */
  heading: number | null;
  /** Declared mast height (m) or null. */
  height: number | null;
  selected: boolean;
}

export function supportFeatureProps(
  s: SupportResponse,
  selection?: Pick<Selection, "supportIds"> | null,
): SupportFeatureProps {
  const { type, inferred } = resolvePorteurType(s);
  return {
    id: s.id,
    name: s.name,
    type,
    inferred,
    status: s.technicalStatus,
    bookable: isBookable(s),
    zoneId: s.zoneId,
    zoneName: s.zoneName,
    heading:
      s.headingDeg === null || s.headingDeg === undefined || !Number.isFinite(s.headingDeg)
        ? null
        : normalizeHeading(s.headingDeg),
    height: s.mastHeightM ?? null,
    selected: selection?.supportIds.includes(s.id) ?? false,
  };
}

export function supportsToFeatureCollection(
  supports: readonly SupportResponse[],
  selection?: Pick<Selection, "supportIds"> | null,
): FeatureCollection<PointGeometry, SupportFeatureProps> {
  return featureCollection(
    supports
      .filter((s) => isValidLngLat(supportLngLat(s)))
      .map((s) => ({
        type: "Feature" as const,
        id: s.id,
        geometry: { type: "Point" as const, coordinates: toPosition(supportLngLat(s)) },
        properties: supportFeatureProps(s, selection),
      })),
  );
}

// ---------------------------------------------------------------------------
// Heading cones
// ---------------------------------------------------------------------------
export interface ConeOptions {
  /** Cone length in metres (default 140). */
  lengthM?: number;
  /** Full opening angle in degrees (default 50). */
  spreadDeg?: number;
  /** Arc vertices (default 10). */
  steps?: number;
}

/** Closed wedge polygon from `center` pointing to `headingDeg`. */
export function headingConePolygon(
  center: LngLat,
  headingDeg: number,
  { lengthM = 140, spreadDeg = 50, steps = 10 }: ConeOptions = {},
): PolygonGeometry {
  const n = Math.max(2, Math.round(steps));
  const start = normalizeHeading(headingDeg) - spreadDeg / 2;
  const ring: Position[] = [toPosition(center)];
  for (let i = 0; i <= n; i++) {
    ring.push(toPosition(destinationPoint(center, start + (spreadDeg / n) * i, lengthM)));
  }
  ring.push(toPosition(center));
  return { type: "Polygon", coordinates: [ring] };
}

export interface ConeFeatureProps {
  id: number;
  type: PorteurType;
  face: 1 | 2;
  selected: boolean;
  bookable: boolean;
}

/**
 * Orientation wedges for A/B/C with a declared heading: A and C get one wedge (main face),
 * B gets two back-to-back wedges (face 1 = heading, face 2 = heading + 180°). D has no screen.
 */
export function headingConesFeatureCollection(
  supports: readonly SupportResponse[],
  selection?: Pick<Selection, "supportIds"> | null,
  options: ConeOptions = {},
): FeatureCollection<PolygonGeometry, ConeFeatureProps> {
  const features: Feature<PolygonGeometry, ConeFeatureProps>[] = [];
  for (const s of supports) {
    const props = supportFeatureProps(s, selection);
    if (props.heading === null || props.type === "D" || !isValidLngLat(supportLngLat(s))) continue;
    const base = { id: s.id, type: props.type, selected: props.selected, bookable: props.bookable };
    features.push({
      type: "Feature",
      id: `${s.id}-1`,
      geometry: headingConePolygon(supportLngLat(s), props.heading, options),
      properties: { ...base, face: 1 },
    });
    if (props.type === "B") {
      features.push({
        type: "Feature",
        id: `${s.id}-2`,
        geometry: headingConePolygon(supportLngLat(s), props.heading + 180, options),
        properties: { ...base, face: 2 },
      });
    }
  }
  return featureCollection(features);
}

// ---------------------------------------------------------------------------
// 3D extrusion footprints
// ---------------------------------------------------------------------------
/** Visual exaggeration of mast height in the 3D map view (height × 10). */
export const EXTRUSION_SCALE = 10;

export interface ExtrusionFeatureProps {
  id: number;
  type: PorteurType;
  status: TechnicalStatus;
  selected: boolean;
  /** Mast height used (declared or default 20 m). */
  mastHeightM: number;
  /** Extrusion height in metres = mastHeightM × EXTRUSION_SCALE. */
  height: number;
  base: number;
}

/** Square polygon of `sizeM` metres centred on a point. */
export function squareFootprint(center: LngLat, sizeM: number): PolygonGeometry {
  const half = Math.max(0.5, sizeM) / 2;
  const diag = half * Math.SQRT2;
  const ring: Position[] = [45, 135, 225, 315].map((b) =>
    toPosition(destinationPoint(center, b, diag)),
  );
  const first = ring[0];
  if (first) ring.push([first[0], first[1]]);
  return { type: "Polygon", coordinates: [ring] };
}

export function extrusionFootprintsFeatureCollection(
  supports: readonly SupportResponse[],
  selection?: Pick<Selection, "supportIds"> | null,
  { sizeM = 36 }: { sizeM?: number } = {},
): FeatureCollection<PolygonGeometry, ExtrusionFeatureProps> {
  return featureCollection(
    supports
      .filter((s) => isValidLngLat(supportLngLat(s)))
      .map((s) => {
        const props = supportFeatureProps(s, selection);
        const mastHeightM =
          props.height !== null && props.height > 0 ? props.height : DEFAULT_MAST_HEIGHT;
        return {
          type: "Feature" as const,
          id: s.id,
          geometry: squareFootprint(supportLngLat(s), sizeM),
          properties: {
            id: s.id,
            type: props.type,
            status: props.status,
            selected: props.selected,
            mastHeightM,
            height: mastHeightM * EXTRUSION_SCALE,
            base: 0,
          },
        };
      }),
  );
}

// ---------------------------------------------------------------------------
// Tools: measure + catchment
// ---------------------------------------------------------------------------
export interface MeasureFeatureProps {
  kind: "line" | "vertex";
  index: number;
}

export function measureFeatureCollection(
  points: readonly LngLat[],
): FeatureCollection<LineStringGeometry | PointGeometry, MeasureFeatureProps> {
  const features: Feature<LineStringGeometry | PointGeometry, MeasureFeatureProps>[] = [];
  if (points.length >= 2) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: points.map(toPosition) },
      properties: { kind: "line", index: 0 },
    });
  }
  points.forEach((p, index) =>
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: toPosition(p) },
      properties: { kind: "vertex", index },
    }),
  );
  return featureCollection(features);
}

export function catchmentFeatureCollection(
  center: LngLat | null,
  radiusKm: number,
): FeatureCollection<PolygonGeometry, { radiusKm: number }> {
  if (!center || !isValidLngLat(center) || !(radiusKm > 0)) return featureCollection([]);
  return featureCollection([
    { type: "Feature", geometry: circlePolygon(center, radiusKm, 96), properties: { radiusKm } },
  ]);
}

/** Where a radius handle sits: on the circle, due east of the centre. */
export function radiusHandlePosition(center: LngLat, radiusKm: number): LngLat {
  return destinationPoint(center, 90, Math.max(0, radiusKm) * 1000);
}

// ---------------------------------------------------------------------------
// Framing
// ---------------------------------------------------------------------------
/**
 * Initial frame of the map: every Porteur with valid coordinates plus the circles of the zones
 * they belong to. Null when there is no Porteur (callers fall back to TUNISIA_BOUNDS).
 */
export function porteursBounds(
  supports: readonly Pick<SupportResponse, "latitude" | "longitude" | "zoneId">[],
  zones: readonly Pick<ZoneResponse, "id" | "latitude" | "longitude" | "radiusKm">[] = [],
  options: BBoxOptions = {},
): BBox | null {
  const points = supports.map(supportLngLat).filter((p) => isValidLngLat(p));
  if (points.length === 0) return null;
  const zoneIds = new Set(supports.map((s) => s.zoneId));
  const circles = zones
    .filter((z) => zoneIds.has(z.id) && z.radiusKm !== null && z.radiusKm > 0)
    .map((z) => ({ center: { lng: z.longitude, lat: z.latitude }, radiusKm: z.radiusKm }));
  return bboxOfPointsAndCircles(points, circles, { padding: 0.04, minSpanDeg: 0.01, ...options });
}

// ---------------------------------------------------------------------------
// Grid clustering (supercluster-like, no dependency)
// ---------------------------------------------------------------------------
/** MapLibre tile size in CSS px. */
export const TILE_SIZE = 512;
/** Porteurs are clustered strictly below this zoom. */
export const CLUSTER_MAX_ZOOM = 9;

/** Web Mercator world pixel coordinates at a zoom level. */
export function lngLatToWorldPx(p: LngLat, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

export type ClusterItem<T> =
  | { kind: "point"; key: string; item: T; lngLat: LngLat }
  | {
      kind: "cluster";
      key: string;
      items: T[];
      count: number;
      /** Mean position of the members. */
      lngLat: LngLat;
      bbox: BBox;
    };

/**
 * Generic grid clustering: items whose projected coordinates fall in the same `cellSize` cell
 * are grouped. Cells with one item stay points. Output order: clusters and points sorted by key
 * so marker identity stays stable across renders.
 */
export function gridCluster<T>(
  items: readonly T[],
  getLngLat: (item: T) => LngLat,
  project: (p: LngLat) => { x: number; y: number },
  cellSize: number,
  getId: (item: T) => number | string,
): ClusterItem<T>[] {
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const p = getLngLat(item);
    if (!isValidLngLat(p)) continue;
    const { x, y } = project(p);
    const key = `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    const cell = cells.get(key);
    if (cell) cell.push(item);
    else cells.set(key, [item]);
  }
  const out: ClusterItem<T>[] = [];
  for (const [cellKey, members] of cells) {
    if (members.length === 1) {
      const item = members[0] as T;
      out.push({ kind: "point", key: `p-${getId(item)}`, item, lngLat: getLngLat(item) });
      continue;
    }
    let lng = 0;
    let lat = 0;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const m of members) {
      const p = getLngLat(m);
      lng += p.lng;
      lat += p.lat;
      west = Math.min(west, p.lng);
      east = Math.max(east, p.lng);
      south = Math.min(south, p.lat);
      north = Math.max(north, p.lat);
    }
    const ids = members.map(getId).sort();
    out.push({
      kind: "cluster",
      key: `c-${cellKey}-${ids.join(".")}`,
      items: members,
      count: members.length,
      lngLat: { lng: lng / members.length, lat: lat / members.length },
      bbox: [
        [west, south],
        [east, north],
      ],
    });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Porteur grouping is opt-in (« Regrouper les Porteurs proches »): by default every Porteur is
 * drawn individually at its exact position, overlaps being fanned out (spiderfy.ts).
 */
export const DEFAULT_CLUSTER_PORTEURS = false;

export interface ClusterSupportsOptions {
  /** Group nearby Porteurs into count bubbles (default DEFAULT_CLUSTER_PORTEURS = false). */
  enabled?: boolean;
  cellPx?: number;
  maxZoom?: number;
}

/**
 * Porteur items for the map. Clustering disabled (default) or zoom ≥ CLUSTER_MAX_ZOOM: one point
 * per Porteur with valid coordinates. Enabled below CLUSTER_MAX_ZOOM: 64 px grid clusters.
 */
export function clusterSupports<S extends Pick<SupportResponse, "id" | "latitude" | "longitude">>(
  supports: readonly S[],
  zoom: number,
  {
    enabled = DEFAULT_CLUSTER_PORTEURS,
    cellPx = 64,
    maxZoom = CLUSTER_MAX_ZOOM,
  }: ClusterSupportsOptions = {},
): ClusterItem<S>[] {
  const z = Math.max(0, Math.floor(zoom));
  if (!enabled || zoom >= maxZoom) {
    return supports
      .filter((s) => isValidLngLat(supportLngLat(s)))
      .map((item): ClusterItem<S> => ({
        kind: "point",
        key: `p-${item.id}`,
        item,
        lngLat: supportLngLat(item),
      }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  return gridCluster(
    supports,
    supportLngLat,
    (p) => lngLatToWorldPx(p, z),
    cellPx,
    (s) => s.id,
  );
}
