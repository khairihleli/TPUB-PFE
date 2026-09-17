/**
 * Round-2 map overlays (docs/round2-contract.md §4.8): target polygons, the polygon being drawn and
 * heatmap points. Pure GeoJSON builders + the drawing draft model, no MapLibre import.
 */
import {
  featureCollection,
  type Feature,
  type FeatureCollection,
  type LineStringGeometry,
  type PointGeometry,
} from "@/lib/network/geojson";
import { isValidLngLat, toPosition, type LngLat, type PolygonGeometry } from "@/lib/network/geo";
import { TOKEN_HEX, withAlpha } from "@/lib/network/theme";
import {
  DEFAULT_POLYGON_LIMITS,
  validatePolygon,
  type PolygonLimits,
  type PolygonParts,
  type PolygonValidation,
} from "@/lib/polygon";

// ---------------------------------------------------------------------------
// Polygons shown on the map
// ---------------------------------------------------------------------------

export type PolygonTone = "brand" | "urgent" | "muted";

export interface MapPolygon {
  id: string;
  /** parts → rings → vertices (open or closed rings) */
  rings: LngLat[][][];
  label?: string;
  tone?: PolygonTone;
  active?: boolean;
}

export interface PolygonFeatureProps {
  id: string;
  label: string;
  tone: PolygonTone;
  active: boolean;
}

function closed(ring: readonly LngLat[]): [number, number][] {
  const positions = ring.filter(isValidLngLat).map(toPosition);
  const first = positions[0];
  const last = positions[positions.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) positions.push(first);
  return positions;
}

/** One Polygon feature per part (MultiPolygon parts are split, holes kept). */
export function polygonsFeatureCollection(
  polygons: readonly MapPolygon[],
): FeatureCollection<PolygonGeometry, PolygonFeatureProps> {
  const features: Feature<PolygonGeometry, PolygonFeatureProps>[] = [];
  for (const polygon of polygons) {
    for (const part of polygon.rings) {
      const rings = part.map(closed).filter((ring) => ring.length >= 4);
      if (rings.length === 0) continue;
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: rings },
        properties: {
          id: polygon.id,
          label: polygon.label ?? "",
          tone: polygon.tone ?? "brand",
          active: polygon.active === true,
        },
      });
    }
  }
  return featureCollection(features);
}

// ---------------------------------------------------------------------------
// Drawing draft
// ---------------------------------------------------------------------------

export interface PolygonDraft {
  vertices: LngLat[];
  closed: boolean;
}

export const EMPTY_POLYGON_DRAFT: PolygonDraft = { vertices: [], closed: false };

/** Adds a vertex while the ring is open (an identical consecutive point is ignored). */
export function addDraftVertex(draft: PolygonDraft, point: LngLat): PolygonDraft {
  if (draft.closed || !isValidLngLat(point)) return draft;
  const last = draft.vertices[draft.vertices.length - 1];
  if (last && last.lng === point.lng && last.lat === point.lat) return draft;
  return { vertices: [...draft.vertices, point], closed: false };
}

/** Closes the ring (needs 3 vertices). */
export function closeDraft(draft: PolygonDraft): PolygonDraft {
  if (draft.closed || draft.vertices.length < 3) return draft;
  return { vertices: draft.vertices, closed: true };
}

/** « Retour arrière »: removes the last vertex and reopens the ring. */
export function removeLastDraftVertex(draft: PolygonDraft): PolygonDraft {
  if (draft.vertices.length === 0) return draft;
  return { vertices: draft.vertices.slice(0, -1), closed: false };
}

export function moveDraftVertex(draft: PolygonDraft, index: number, point: LngLat): PolygonDraft {
  if (index < 0 || index >= draft.vertices.length || !isValidLngLat(point)) return draft;
  const vertices = draft.vertices.slice();
  vertices[index] = point;
  return { vertices, closed: draft.closed };
}

/** Removes one vertex; a closed ring left with fewer than 3 vertices reopens. */
export function removeDraftVertex(draft: PolygonDraft, index: number): PolygonDraft {
  if (index < 0 || index >= draft.vertices.length) return draft;
  const vertices = draft.vertices.filter((_, i) => i !== index);
  return { vertices, closed: draft.closed && vertices.length >= 3 };
}

/** Inserts a vertex after `index` (−1 → at the start). */
export function insertDraftVertex(draft: PolygonDraft, index: number, point: LngLat): PolygonDraft {
  if (!isValidLngLat(point)) return draft;
  const at = Math.max(0, Math.min(draft.vertices.length, index + 1));
  const vertices = [...draft.vertices.slice(0, at), point, ...draft.vertices.slice(at)];
  return { vertices, closed: draft.closed };
}

/** Midpoint of the edge starting at `index` (for « Ajouter un sommet »). */
export function edgeMidpoint(draft: PolygonDraft, index: number): LngLat | null {
  const a = draft.vertices[index];
  const b = draft.vertices[(index + 1) % draft.vertices.length];
  if (!a || !b) return null;
  return {
    lng: Math.round(((a.lng + b.lng) / 2) * 1e7) / 1e7,
    lat: Math.round(((a.lat + b.lat) / 2) * 1e7) / 1e7,
  };
}

export function draftToParts(draft: PolygonDraft): PolygonParts {
  return [[draft.vertices]];
}

export function partsToDraft(parts: PolygonParts | null | undefined): PolygonDraft {
  const ring = parts?.[0]?.[0] ?? [];
  const vertices = ring.slice();
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (vertices.length > 1 && first && last && first.lng === last.lng && first.lat === last.lat) {
    vertices.pop();
  }
  return { vertices, closed: vertices.length >= 3 };
}

export type DraftStatus =
  | { state: "empty"; message: string }
  | { state: "drawing"; message: string }
  | { state: "invalid"; message: string }
  | { state: "valid"; message: string; validation: Extract<PolygonValidation, { ok: true }> };

/** Live status shown under the map while drawing. */
export function draftStatus(
  draft: PolygonDraft,
  limits: PolygonLimits = DEFAULT_POLYGON_LIMITS,
): DraftStatus {
  const n = draft.vertices.length;
  if (n === 0) {
    return { state: "empty", message: "Cliquez sur la carte pour placer le premier sommet." };
  }
  if (!draft.closed) {
    return {
      state: "drawing",
      message:
        n < 3
          ? `${n} sommet${n > 1 ? "s" : ""} placé${n > 1 ? "s" : ""} : ajoutez-en au moins ${3 - n} autre${3 - n > 1 ? "s" : ""}.`
          : `${n} sommets placés : cliquez sur le premier sommet, double-cliquez ou appuyez sur Entrée pour fermer le polygone.`,
    };
  }
  const validation = validatePolygon(draftToParts(draft), limits);
  if (!validation.ok) return { state: "invalid", message: validation.reason };
  return { state: "valid", message: `Polygone valide (${n} sommets).`, validation };
}

export interface DraftFeatureProps {
  kind: "fill" | "line" | "vertex";
  index: number;
  first: boolean;
}

export function polygonDraftFeatureCollection(
  draft: PolygonDraft | null | undefined,
): FeatureCollection<PolygonGeometry | LineStringGeometry | PointGeometry, DraftFeatureProps> {
  const features: Feature<
    PolygonGeometry | LineStringGeometry | PointGeometry,
    DraftFeatureProps
  >[] = [];
  if (!draft) return featureCollection(features);
  const vertices = draft.vertices.filter(isValidLngLat);
  if (draft.closed && vertices.length >= 3) {
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [closed(vertices)] },
      properties: { kind: "fill", index: -1, first: false },
    });
  }
  if (vertices.length >= 2) {
    const line = vertices.map(toPosition);
    if (draft.closed && vertices[0]) line.push(toPosition(vertices[0]));
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: line },
      properties: { kind: "line", index: -1, first: false },
    });
  }
  vertices.forEach((v, index) =>
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: toPosition(v) },
      properties: { kind: "vertex", index, first: index === 0 },
    }),
  );
  return featureCollection(features);
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------

export interface HeatPointInput {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { weight: number };
  }[];
}

export interface MapHeatmap {
  points: HeatPointInput;
  maxWeight: number;
  /** Accessible name / legend title. */
  label: string;
}

export interface HeatFeatureProps {
  weight: number;
  /** weight / maxWeight, 0..1 */
  w: number;
}

/** Normalised weights (`w = weight / maxWeight`); invalid points and weight ≤ 0 skipped. */
export function heatmapFeatureCollection(
  heatmap: MapHeatmap | null | undefined,
): FeatureCollection<PointGeometry, HeatFeatureProps> {
  if (!heatmap) return featureCollection([]);
  const max =
    heatmap.maxWeight > 0
      ? heatmap.maxWeight
      : Math.max(0, ...heatmap.points.features.map((f) => f.properties.weight));
  const features: Feature<PointGeometry, HeatFeatureProps>[] = [];
  for (const f of heatmap.points.features) {
    const [lng, lat] = f.geometry.coordinates;
    const weight = f.properties.weight;
    if (!isValidLngLat({ lng, lat }) || !(weight > 0) || !(max > 0)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: { weight, w: Math.min(1, weight / max) },
    });
  }
  return featureCollection(features);
}

/** Colour ramp of the heatmap (density 0 → 1), token colours only. */
export const HEATMAP_RAMP: readonly [number, string][] = [
  [0, withAlpha(TOKEN_HEX["blue-text"], 0)],
  [0.2, withAlpha(TOKEN_HEX["blue-text"], 0.6)],
  [0.45, TOKEN_HEX.info],
  [0.65, TOKEN_HEX.warning],
  [0.85, TOKEN_HEX["orange-text"]],
  [1, TOKEN_HEX["red-text"]],
];

/** CSS gradient of the legend (same stops as the layer). */
export function heatmapGradientCss(): string {
  return `linear-gradient(to right, ${HEATMAP_RAMP.map(([stop, color]) => `${color} ${Math.round(stop * 100)}%`).join(", ")})`;
}

/** Ramp colour at a normalised weight (SVG fallback circles). */
export function heatmapColorAt(w: number): string {
  const value = Math.max(0, Math.min(1, w));
  let color = HEATMAP_RAMP[HEATMAP_RAMP.length - 1]![1];
  for (const [stop, c] of HEATMAP_RAMP) {
    if (value <= stop) {
      color = c;
      break;
    }
  }
  return value === 0 ? TOKEN_HEX["blue-text"] : color;
}
