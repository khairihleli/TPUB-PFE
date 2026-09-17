/**
 * Shared vectors with BackEnd `util/PolygonGeometryTest.java`: keep both files in sync.
 */
import { describe, expect, it } from "vitest";

import type { LngLat } from "@/lib/network/geo";
import {
  centroid,
  circumscribedRadiusKm,
  DEFAULT_POLYGON_LIMITS,
  formatAreaKm2,
  formatFr,
  geoJsonToRings,
  pointInPolygon,
  polygonAreaKm2,
  POLYGON_MESSAGES,
  ringsToGeoJson,
  validateGeoJson,
  validatePolygon,
  type PolygonParts,
} from "@/lib/polygon";

const ring = (...lngLat: number[]): LngLat[] => {
  const out: LngLat[] = [];
  for (let i = 0; i < lngLat.length; i += 2) out.push({ lng: lngLat[i]!, lat: lngLat[i + 1]! });
  return out;
};

const SQUARE = ring(10.17, 36.79, 10.19, 36.79, 10.19, 36.81, 10.17, 36.81, 10.17, 36.79);
const HOLE = ring(10.175, 36.795, 10.185, 36.795, 10.185, 36.805, 10.175, 36.805);
const MARSA = ring(10.3, 36.87, 10.33, 36.87, 10.33, 36.89, 10.3, 36.89);

const reason = (parts: PolygonParts, limits = DEFAULT_POLYGON_LIMITS) => {
  const result = validatePolygon(parts, limits);
  return result.ok ? null : result.reason;
};

describe("polygon measures (backend vectors)", () => {
  it("square around Tunis", () => {
    const result = validatePolygon([[SQUARE]]);
    expect(result).toMatchObject({
      ok: true,
      areaKm2: 3.96,
      centroid: { lat: 36.8, lng: 10.18 },
      radiusKm: 1.425,
    });
    expect(polygonAreaKm2([[SQUARE]])).toBe(3.96);
    expect(centroid([[SQUARE]])).toEqual({ lat: 36.8, lng: 10.18 });
    expect(circumscribedRadiusKm([[SQUARE]])).toBe(1.425);
  });

  it("normalises unclosed rings, duplicates and rounding", () => {
    const result = validatePolygon([
      [ring(10.17, 36.79, 10.19, 36.79, 10.19, 36.79, 10.19, 36.81, 10.170000001, 36.81)],
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ringsToGeoJson(result.parts)).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [10.17, 36.79],
          [10.19, 36.79],
          [10.19, 36.81],
          [10.17, 36.81],
          [10.17, 36.79],
        ],
      ],
    });
  });

  it("polygon with a hole and MultiPolygon", () => {
    const holed = validatePolygon([[SQUARE, HOLE]]);
    expect(holed).toMatchObject({ ok: true, areaKm2: 2.97 });
    expect(pointInPolygon({ lat: 36.8, lng: 10.18 }, [[SQUARE, HOLE]])).toBe(false);
    expect(pointInPolygon({ lat: 36.792, lng: 10.172 }, [[SQUARE, HOLE]])).toBe(true);

    const multi = validatePolygon([[SQUARE], [MARSA]]);
    expect(multi).toMatchObject({
      ok: true,
      areaKm2: 9.895,
      centroid: { lat: 36.848, lng: 10.261 },
      radiusKm: 10.354,
    });
    expect(pointInPolygon({ lat: 36.88, lng: 10.31 }, [[SQUARE], [MARSA]])).toBe(true);
    expect(pointInPolygon({ lat: 36.84, lng: 10.25 }, [[SQUARE], [MARSA]])).toBe(false);
    expect(ringsToGeoJson([[SQUARE], [MARSA]]).type).toBe("MultiPolygon");
  });

  it("a point on an edge or a vertex is inside", () => {
    expect(pointInPolygon({ lat: 36.8, lng: 10.17 }, [[SQUARE]])).toBe(true);
    expect(pointInPolygon({ lat: 36.79, lng: 10.19 }, [[SQUARE]])).toBe(true);
    expect(pointInPolygon({ lat: 36.8, lng: 10.1699 }, [[SQUARE]])).toBe(false);
  });
});

describe("polygon validation (same order and French reasons as the backend)", () => {
  it("rejects malformed, out-of-bounds, degenerate and crossing shapes", () => {
    expect(validateGeoJson({ type: "Point", coordinates: [10, 36] })).toEqual({
      ok: false,
      reason: POLYGON_MESSAGES.geometry,
    });
    expect(validateGeoJson({ type: "Polygon", coordinates: [[["a", "b"]]] })).toEqual({
      ok: false,
      reason: POLYGON_MESSAGES.geometry,
    });
    expect(reason([[ring(10.17, 96, 10.19, 36.79, 10.19, 36.81)]])).toBe(POLYGON_MESSAGES.bounds);
    expect(reason([[ring(10.17, 36.79, 10.19, 36.79, 10.17, 36.79)]])).toBe(
      POLYGON_MESSAGES.minVertices,
    );
    // bow tie
    expect(reason([[ring(10.17, 36.79, 10.19, 36.81, 10.19, 36.79, 10.17, 36.81)]])).toBe(
      POLYGON_MESSAGES.crossing,
    );
    // hole outside its outer ring
    expect(reason([[SQUARE, MARSA]])).toBe(POLYGON_MESSAGES.crossing);
  });

  it("area and extent limits", () => {
    expect(reason([[ring(10.17, 36.79, 10.1701, 36.79, 10.1701, 36.7901)]])).toBe(
      "Zone trop petite (0,01 km² minimum).",
    );
    expect(reason([[ring(9, 36, 10, 36, 10, 37, 9, 37)]])).toBe(
      "Zone trop grande (2 000 km² maximum).",
    );
    expect(reason([[ring(9, 36.8, 10.2, 36.8, 10.2, 36.81, 9, 36.81)]])).toBe(
      "Zone trop étendue (50 km autour de son centre au maximum).",
    );
  });

  it("detail limits state the limit reached", () => {
    const many: LngLat[] = [];
    for (let i = 0; i < 101; i += 1) {
      const angle = (2 * Math.PI * i) / 101;
      many.push({ lng: 10.18 + 0.02 * Math.cos(angle), lat: 36.8 + 0.02 * Math.sin(angle) });
    }
    expect(reason([[many]])).toBe("Polygone trop détaillé (100 sommets au plus).");
    expect(reason(Array.from({ length: 6 }, () => [SQUARE]))).toBe(
      "Polygone trop détaillé (5 parties au plus).",
    );
    expect(reason([[SQUARE, HOLE, HOLE, HOLE, HOLE, HOLE, HOLE]])).toBe(
      "Polygone trop détaillé (5 trous au plus par partie).",
    );
    expect(reason([[SQUARE, HOLE]], { ...DEFAULT_POLYGON_LIMITS, maxTotalVertices: 6 })).toBe(
      "Polygone trop détaillé (6 sommets au plus au total).",
    );
  });

  it("round-trips GeoJSON", () => {
    const geo = ringsToGeoJson([[SQUARE.slice(0, 4)]]);
    expect(geoJsonToRings(geo)?.[0]?.[0]).toHaveLength(5);
    expect(validateGeoJson(geo)).toMatchObject({ ok: true, areaKm2: 3.96 });
    expect(geoJsonToRings(null)).toBeNull();
    expect(geoJsonToRings({ type: "MultiPolygon", coordinates: [] })).toBeNull();
  });
});

describe("French numbers", () => {
  it("formats limits and areas", () => {
    expect(formatFr(0.01)).toBe("0,01");
    expect(formatFr(2000)).toBe("2 000");
    expect(formatFr(50)).toBe("50");
    expect(formatFr(1234567.5)).toBe("1 234 567,5");
    expect(formatAreaKm2(3.2)).toBe("3,2 km²");
    expect(formatAreaKm2(0.456)).toBe("0,46 km²");
  });
});
