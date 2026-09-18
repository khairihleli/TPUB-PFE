import { describe, expect, it } from "vitest";

import {
  bboxContains,
  bboxOf,
  bboxOfPointsAndCircles,
  bearingBetween,
  bearingLabel,
  bearingName,
  circleBBox,
  circlePolygon,
  destinationPoint,
  formatCoordinate,
  formatDistance,
  formatLatLng,
  formatRadiusKm,
  fromPosition,
  haversineDistance,
  isValidLngLat,
  nearestZone,
  normalizeHeading,
  openStreetMapUrl,
  pointInRadius,
  polylineLength,
  roundCoord,
  suggestZoneForPoint,
  toPosition,
  TUNISIA_BOUNDS,
  zonesContaining,
} from "@/lib/network/geo";

const TUNIS = { lng: 10.1815, lat: 36.8065 };
const SFAX = { lng: 10.7603, lat: 34.7406 };

describe("geo — constants & validation", () => {
  it("exposes the spec Tunisia bounds", () => {
    expect(TUNISIA_BOUNDS).toEqual([
      [7.5, 30.2],
      [11.9, 37.6],
    ]);
  });

  it("validates coordinates", () => {
    expect(isValidLngLat(TUNIS)).toBe(true);
    expect(isValidLngLat({ lng: 200, lat: 0 })).toBe(false);
    expect(isValidLngLat({ lng: 0, lat: -91 })).toBe(false);
    expect(isValidLngLat({ lng: Number.NaN, lat: 0 })).toBe(false);
    expect(isValidLngLat(null)).toBe(false);
    expect(isValidLngLat({ lng: 1 })).toBe(false);
  });

  it("converts positions both ways", () => {
    expect(toPosition(TUNIS)).toEqual([10.1815, 36.8065]);
    expect(fromPosition([10, 36])).toEqual({ lng: 10, lat: 36 });
    expect(roundCoord(10.123456789)).toBe(10.123457);
  });
});

describe("haversineDistance", () => {
  it("is zero for the same point and symmetric", () => {
    expect(haversineDistance(TUNIS, TUNIS)).toBe(0);
    expect(haversineDistance(TUNIS, SFAX)).toBeCloseTo(haversineDistance(SFAX, TUNIS), 6);
  });

  it("measures Tunis → Sfax ≈ 236 km", () => {
    const km = haversineDistance(TUNIS, SFAX) / 1000;
    expect(km).toBeGreaterThan(230);
    expect(km).toBeLessThan(242);
  });

  it("one degree of latitude ≈ 111.2 km", () => {
    expect(haversineDistance({ lng: 10, lat: 36 }, { lng: 10, lat: 37 })).toBeCloseTo(111_195, -2);
  });

  it("sums a polyline", () => {
    const a = { lng: 10, lat: 36 };
    const b = { lng: 10, lat: 36.01 };
    const c = { lng: 10, lat: 36.02 };
    expect(polylineLength([a, b, c])).toBeCloseTo(haversineDistance(a, c), 3);
    expect(polylineLength([a])).toBe(0);
    expect(polylineLength([])).toBe(0);
  });
});

describe("bearings & destination", () => {
  it("computes cardinal bearings", () => {
    const o = { lng: 10, lat: 36 };
    expect(bearingBetween(o, { lng: 10, lat: 37 })).toBeCloseTo(0, 5);
    expect(bearingBetween(o, { lng: 11, lat: 36 })).toBeCloseTo(89.7, 0);
    expect(bearingBetween(o, { lng: 10, lat: 35 })).toBeCloseTo(180, 5);
    expect(bearingBetween(o, { lng: 9, lat: 36 })).toBeCloseTo(270.3, 0);
  });

  it("destinationPoint round-trips with haversine", () => {
    for (const bearing of [0, 45, 90, 200, 315]) {
      const d = destinationPoint(TUNIS, bearing, 5000);
      expect(haversineDistance(TUNIS, d)).toBeCloseTo(5000, 3);
      expect(bearingBetween(TUNIS, d)).toBeCloseTo(bearing, 1);
    }
  });

  it("wraps longitude across the antimeridian", () => {
    const d = destinationPoint({ lng: 179.9, lat: 0 }, 90, 50_000);
    expect(d.lng).toBeLessThan(-179);
  });

  it("normalises headings", () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(360)).toBe(0);
    expect(normalizeHeading(-90)).toBe(270);
    expect(normalizeHeading(725)).toBe(5);
    expect(normalizeHeading(Number.NaN)).toBe(0);
  });

  it("labels 8 French compass points", () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(bearingLabel)).toEqual([
      "N",
      "NE",
      "E",
      "SE",
      "S",
      "SO",
      "O",
      "NO",
    ]);
    expect(bearingLabel(22)).toBe("N");
    expect(bearingLabel(23)).toBe("NE");
    expect(bearingLabel(359)).toBe("N");
    expect(bearingLabel(-45)).toBe("NO");
    expect(bearingName(225)).toBe("sud-ouest");
    expect(bearingName(0)).toBe("nord");
  });
});

describe("circlePolygon & radius", () => {
  it("builds a closed ring whose vertices sit on the radius", () => {
    const poly = circlePolygon(TUNIS, 2, 32);
    const ring = poly.coordinates[0] ?? [];
    expect(poly.type).toBe("Polygon");
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    for (const p of ring) {
      expect(haversineDistance(TUNIS, fromPosition(p))).toBeCloseTo(2000, 3);
    }
  });

  it("enforces at least 8 steps and non-negative radius", () => {
    expect(circlePolygon(TUNIS, 1, 3).coordinates[0]).toHaveLength(9);
    const zero = circlePolygon(TUNIS, -4, 8).coordinates[0] ?? [];
    expect(
      zero.every(
        ([lng, lat]) => Math.abs(lng - TUNIS.lng) < 1e-9 && Math.abs(lat - TUNIS.lat) < 1e-9,
      ),
    ).toBe(true);
  });

  it("pointInRadius is inclusive and rejects invalid radii", () => {
    const edge = destinationPoint(TUNIS, 30, 1500);
    expect(pointInRadius(edge, TUNIS, 1.5)).toBe(true);
    expect(pointInRadius(edge, TUNIS, 1.4)).toBe(false);
    expect(pointInRadius(TUNIS, TUNIS, 0)).toBe(true);
    expect(pointInRadius(TUNIS, TUNIS, Number.NaN)).toBe(false);
    expect(pointInRadius(TUNIS, TUNIS, -1)).toBe(false);
  });

  it("circleBBox contains the circle", () => {
    const bbox = circleBBox(TUNIS, 3);
    for (const p of circlePolygon(TUNIS, 2.99, 16).coordinates[0] ?? []) {
      expect(bboxContains(bbox, fromPosition(p))).toBe(true);
    }
  });
});

describe("bboxOf", () => {
  it("returns null without valid points", () => {
    expect(bboxOf([])).toBeNull();
    expect(bboxOf([{ lng: Number.NaN, lat: 1 }])).toBeNull();
  });

  it("pads the span", () => {
    const bbox = bboxOf(
      [
        { lng: 10, lat: 36 },
        { lng: 11, lat: 37 },
      ],
      { padding: 0.1 },
    );
    expect(bbox?.[0][0]).toBeCloseTo(9.9);
    expect(bbox?.[0][1]).toBeCloseTo(35.9);
    expect(bbox?.[1][0]).toBeCloseTo(11.1);
    expect(bbox?.[1][1]).toBeCloseTo(37.1);
  });

  it("gives a single point a minimum span", () => {
    const bbox = bboxOf([TUNIS], { padding: 0, minSpanDeg: 0.04 });
    expect(bbox).not.toBeNull();
    expect((bbox?.[1][0] ?? 0) - (bbox?.[0][0] ?? 0)).toBeCloseTo(0.04);
    expect((bbox?.[1][1] ?? 0) - (bbox?.[0][1] ?? 0)).toBeCloseTo(0.04);
    expect(bboxContains(bbox ?? TUNISIA_BOUNDS, TUNIS)).toBe(true);
  });

  it("clamps to world bounds and ignores invalid points", () => {
    const bbox = bboxOf(
      [
        { lng: 179.99, lat: 89.99 },
        { lng: 500, lat: 0 },
      ],
      { padding: 1 },
    );
    expect(bbox?.[1][0]).toBeLessThanOrEqual(180);
    expect(bbox?.[1][1]).toBeLessThanOrEqual(90);
  });
});

describe("formatDistance", () => {
  it.each([
    [0, "0 m"],
    [42.4, "42 m"],
    [850, "850 m"],
    [854, "850 m"],
    [996, "1 km"],
    [1000, "1 km"],
    [1540, "1,5 km"],
    [12_400, "12,4 km"],
    [99_960, "100 km"],
    [123_600, "124 km"],
  ])("%s m → %s", (m, expected) => {
    expect(formatDistance(m)).toBe(expected);
  });

  it("handles invalid input", () => {
    expect(formatDistance(-1)).toBe("—");
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatRadiusKm(2.5)).toBe("2,5 km");
  });
});

describe("zones lookup", () => {
  const zones = [
    { id: 1, latitude: 36.8, longitude: 10.18, radiusKm: 5 },
    { id: 2, latitude: 36.81, longitude: 10.19, radiusKm: 3 },
    { id: 3, latitude: 34.74, longitude: 10.76, radiusKm: 4 },
    { id: 4, latitude: 36.805, longitude: 10.185, radiusKm: null },
  ];

  it("lists containing zones, nearest centre first", () => {
    const p = { lng: 10.188, lat: 36.808 };
    expect(zonesContaining(p, zones).map((z) => z.id)).toEqual([2, 1]);
    expect(suggestZoneForPoint(p, zones)?.id).toBe(2);
  });

  it("returns null when no zone radius contains the point", () => {
    expect(suggestZoneForPoint({ lng: 9, lat: 33 }, zones)).toBeNull();
  });

  it("finds the nearest zone centre regardless of radius", () => {
    const res = nearestZone({ lng: 10.185, lat: 36.805 }, zones);
    expect(res?.zone.id).toBe(4);
    expect(res?.distanceM).toBeCloseTo(0, 3);
    expect(nearestZone({ lng: 0, lat: 0 }, [])).toBeNull();
  });
});

describe("exact coordinates", () => {
  it("formats latitude, longitude with 5 decimals", () => {
    expect(formatLatLng(36.7998, 10.1817)).toBe("36.79980, 10.18170");
    expect(formatCoordinate(-0.000001)).toBe("0.00000");
    expect(formatCoordinate(Number.NaN)).toBe("—");
  });

  it("builds an OpenStreetMap link centred on the exact point", () => {
    expect(openStreetMapUrl(36.7998, 10.1817)).toBe(
      "https://www.openstreetmap.org/?mlat=36.7998&mlon=10.1817#map=18/36.7998/10.1817",
    );
  });

  it("bboxOfPointsAndCircles includes circle extents", () => {
    const bbox = bboxOfPointsAndCircles([TUNIS], [{ center: SFAX, radiusKm: 10 }], { padding: 0 });
    expect(bbox?.[0][1]).toBeLessThan(SFAX.lat - 0.08);
    expect(bbox?.[1][1]).toBeCloseTo(TUNIS.lat, 6);
    expect(bboxOfPointsAndCircles([], [])).toBeNull();
  });
});
