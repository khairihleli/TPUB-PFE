import { describe, expect, it } from "vitest";

import { fromPosition, haversineDistance } from "@/lib/network/geo";
import {
  catchmentFeatureCollection,
  CLUSTER_MAX_ZOOM,
  clusterSupports,
  DEFAULT_CLUSTER_PORTEURS,
  porteursBounds,
  EMPTY_FEATURE_COLLECTION,
  EXTRUSION_SCALE,
  extrusionFootprintsFeatureCollection,
  gridCluster,
  headingConePolygon,
  headingConesFeatureCollection,
  lngLatToWorldPx,
  measureFeatureCollection,
  radiusHandlePosition,
  squareFootprint,
  supportsToFeatureCollection,
  zoneLabelsToFeatureCollection,
  zonesToFeatureCollection,
} from "@/lib/network/geojson";

import { SUPPORTS, support, ZONES } from "./fixtures";

describe("zones", () => {
  it("builds circle polygons, skipping zones without radius", () => {
    const fc = zonesToFeatureCollection(ZONES, {
      selectedZoneIds: [2],
      focusedZoneId: 3,
      steps: 16,
    });
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features.map((f) => f.properties.id)).toEqual([1, 2, 3]);
    expect(fc.features[1]?.properties).toMatchObject({
      selected: true,
      focused: false,
      radiusKm: 2,
    });
    expect(fc.features[2]?.properties.focused).toBe(true);
    const ring = fc.features[0]?.geometry.coordinates[0] ?? [];
    expect(ring).toHaveLength(17);
    expect(
      haversineDistance({ lng: 10.18, lat: 36.8 }, fromPosition(ring[3] ?? [0, 0])),
    ).toBeCloseTo(3000, 2);
  });

  it("applies radius overrides (live handle preview)", () => {
    const fc = zonesToFeatureCollection(ZONES, { radiusOverrides: { 1: 5, 4: 1 } });
    expect(fc.features.find((f) => f.properties.id === 1)?.properties.radiusKm).toBe(5);
    expect(fc.features.find((f) => f.properties.id === 4)?.properties).toMatchObject({
      active: false,
      radiusKm: 1,
    });
  });

  it("labels every valid zone with its Porteur count", () => {
    const fc = zoneLabelsToFeatureCollection(
      [
        ...ZONES,
        {
          id: 9,
          name: "Invalide",
          latitude: Number.NaN,
          longitude: 1,
          radiusKm: 1,
          isActive: true,
        },
      ],
      SUPPORTS,
      [1],
    );
    expect(
      fc.features.map((f) => [f.properties.id, f.properties.supportCount, f.properties.selected]),
    ).toEqual([
      [1, 3, true],
      [2, 2, false],
      [3, 1, false],
      [4, 0, false],
    ]);
    expect(fc.features[0]?.geometry.coordinates).toEqual([10.18, 36.8]);
  });
});

describe("supports", () => {
  it("builds points with the spec properties", () => {
    const fc = supportsToFeatureCollection(SUPPORTS, { supportIds: [21] });
    expect(fc.features).toHaveLength(SUPPORTS.length);
    const lac = fc.features.find((f) => f.properties.id === 21);
    expect(lac?.geometry).toEqual({ type: "Point", coordinates: [10.24, 36.84] });
    expect(lac?.properties).toEqual({
      id: 21,
      name: "Corridor Lac 2",
      type: "B",
      inferred: false,
      status: "ACTIF",
      bookable: true,
      zoneId: 2,
      zoneName: "Les Berges du Lac",
      heading: 90,
      height: 30,
      selected: true,
    });
    const barcelone = fc.features.find((f) => f.properties.id === 12)?.properties;
    expect(barcelone).toMatchObject({ type: "C", inferred: true, height: null, selected: false });
    expect(fc.features.find((f) => f.properties.id === 13)?.properties.bookable).toBe(false);
  });

  it("skips invalid coordinates and normalises heading", () => {
    const fc = supportsToFeatureCollection([
      support({ id: 1, latitude: 200 }),
      support({ id: 2, headingDeg: -90 }),
      support({ id: 3, headingDeg: undefined }),
    ]);
    expect(fc.features.map((f) => f.properties.id)).toEqual([2, 3]);
    expect(fc.features[0]?.properties.heading).toBe(270);
    expect(fc.features[1]?.properties.heading).toBeNull();
    expect(fc.features[1]?.properties.selected).toBe(false);
  });
});

describe("heading cones", () => {
  it("builds a closed wedge pointing at the heading", () => {
    const center = { lng: 10, lat: 36 };
    const ring =
      headingConePolygon(center, 90, { lengthM: 200, spreadDeg: 40, steps: 4 }).coordinates[0] ??
      [];
    expect(ring).toHaveLength(7);
    expect(ring[0]).toEqual([10, 36]);
    expect(ring[ring.length - 1]).toEqual([10, 36]);
    const mid = fromPosition(ring[3] ?? [0, 0]);
    expect(haversineDistance(center, mid)).toBeCloseTo(200, 3);
    expect(mid.lng).toBeGreaterThan(10);
    expect(mid.lat).toBeCloseTo(36, 3);
  });

  it("A/C one wedge, B two back-to-back, D and headless none", () => {
    const fc = headingConesFeatureCollection(SUPPORTS, { supportIds: [11] });
    expect(fc.features.map((f) => f.id)).toEqual(["11-1", "12-1", "21-1", "21-2", "31-1"]);
    expect(fc.features[0]?.properties).toEqual({
      id: 11,
      type: "A",
      face: 1,
      selected: true,
      bookable: true,
    });
    const face2 = fc.features[3]?.geometry.coordinates[0]?.[3];
    expect(face2 && face2[0]).toBeLessThan(10.24);
  });
});

describe("extrusions", () => {
  it("uses mast height × 10 with default 20 m", () => {
    const fc = extrusionFootprintsFeatureCollection(SUPPORTS, { supportIds: [31] }, { sizeM: 20 });
    const a = fc.features.find((f) => f.properties.id === 11)?.properties;
    const c = fc.features.find((f) => f.properties.id === 12)?.properties;
    expect(EXTRUSION_SCALE).toBe(10);
    expect(a).toMatchObject({
      mastHeightM: 25,
      height: 250,
      base: 0,
      type: "A",
      status: "ACTIF",
      selected: false,
    });
    expect(c).toMatchObject({ mastHeightM: 20, height: 200 });
    expect(fc.features.find((f) => f.properties.id === 31)?.properties.selected).toBe(true);
    expect(supportsToFeatureCollection([]).features).toEqual([]);
  });

  it("squareFootprint is a closed square of the right size", () => {
    const ring = squareFootprint({ lng: 10, lat: 36 }, 20).coordinates[0] ?? [];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(
      haversineDistance(fromPosition(ring[0] ?? [0, 0]), fromPosition(ring[1] ?? [0, 0])),
    ).toBeCloseTo(20, 1);
  });
});

describe("tools", () => {
  it("measure: vertices always, line from 2 points", () => {
    expect(measureFeatureCollection([]).features).toEqual([]);
    expect(
      measureFeatureCollection([{ lng: 1, lat: 2 }]).features.map((f) => f.properties.kind),
    ).toEqual(["vertex"]);
    const fc = measureFeatureCollection([
      { lng: 1, lat: 2 },
      { lng: 3, lat: 4 },
    ]);
    expect(fc.features.map((f) => f.properties)).toEqual([
      { kind: "line", index: 0 },
      { kind: "vertex", index: 0 },
      { kind: "vertex", index: 1 },
    ]);
  });

  it("catchment circle", () => {
    expect(catchmentFeatureCollection(null, 2).features).toEqual([]);
    expect(catchmentFeatureCollection({ lng: 10, lat: 36 }, 0).features).toEqual([]);
    const fc = catchmentFeatureCollection({ lng: 10, lat: 36 }, 1.5);
    expect(fc.features[0]?.properties.radiusKm).toBe(1.5);
    expect(fc.features[0]?.geometry.coordinates[0]).toHaveLength(97);
    expect(EMPTY_FEATURE_COLLECTION.features).toEqual([]);
  });

  it("radius handle sits due east on the circle", () => {
    const c = { lng: 10, lat: 36 };
    const h = radiusHandlePosition(c, 2);
    expect(haversineDistance(c, h)).toBeCloseTo(2000, 3);
    expect(h.lat).toBeCloseTo(36, 3);
    expect(h.lng).toBeGreaterThan(10);
  });
});

describe("framing", () => {
  it("frames every Porteur plus the circles of their zones, not all of Tunisia", () => {
    const bbox = porteursBounds(SUPPORTS, ZONES);
    expect(bbox).not.toBeNull();
    if (!bbox) return;
    const [[west, south], [east, north]] = bbox;
    for (const s of SUPPORTS) {
      expect(s.longitude).toBeGreaterThanOrEqual(west);
      expect(s.longitude).toBeLessThanOrEqual(east);
      expect(s.latitude).toBeGreaterThanOrEqual(south);
      expect(s.latitude).toBeLessThanOrEqual(north);
    }
    // Sfax Centre circle (4 km) is included: ≈ 0.036° south of its centre
    expect(south).toBeLessThan(34.74 - 0.035);
    // zone 4 (Sousse Nord) has no Porteur: not framed; Tunisia spans 7.5 → 11.9
    expect(east - west).toBeLessThan(1);
    expect(north - south).toBeLessThan(2.5);
  });

  it("returns null without any valid Porteur (callers fall back to Tunisia)", () => {
    expect(porteursBounds([], ZONES)).toBeNull();
    expect(porteursBounds([support({ id: 1, latitude: Number.NaN })], ZONES)).toBeNull();
  });
});

describe("clustering", () => {
  it("projects to Web Mercator world pixels (512 tiles)", () => {
    expect(lngLatToWorldPx({ lng: 0, lat: 0 }, 0)).toEqual({ x: 256, y: 256 });
    const p = lngLatToWorldPx({ lng: 180, lat: 0 }, 1);
    expect(p.x).toBe(1024);
    expect(lngLatToWorldPx({ lng: 0, lat: 90 }, 0).y).toBeCloseTo(0, 3);
  });

  it("is off by default: every valid Porteur is its own point, at any zoom", () => {
    expect(DEFAULT_CLUSTER_PORTEURS).toBe(false);
    for (const zoom of [4, 6, 8.9, 12]) {
      const items = clusterSupports([...SUPPORTS, support({ id: 99, latitude: Number.NaN })], zoom);
      expect(items.every((i) => i.kind === "point")).toBe(true);
      expect(items.map((i) => i.key)).toEqual(["p-11", "p-12", "p-13", "p-21", "p-22", "p-31"]);
      // exact coordinates, never a mean position
      const bourguiba = items.find((i) => i.key === "p-11");
      expect(bourguiba?.lngLat).toEqual({ lng: 10.1857, lat: 36.7995 });
    }
  });

  it("opt-in: clusters nearby Porteurs below zoom 9 and keeps isolated ones as points", () => {
    const items = clusterSupports(SUPPORTS, 6, { enabled: true });
    const clusters = items.filter((i) => i.kind === "cluster");
    const points = items.filter((i) => i.kind === "point");
    expect(clusters).toHaveLength(1);
    const tunis = clusters[0];
    expect(tunis?.kind === "cluster" && tunis.count).toBe(5);
    expect(points.map((p) => (p.kind === "point" ? p.item.id : 0))).toEqual([31]);
    if (tunis?.kind === "cluster") {
      expect(tunis.bbox[0][0]).toBeCloseTo(10.16);
      expect(tunis.bbox[1][1]).toBeCloseTo(36.84);
      expect(tunis.lngLat.lat).toBeGreaterThan(36.79);
    }
  });

  it("returns only points at or above CLUSTER_MAX_ZOOM, sorted by key", () => {
    const items = clusterSupports(
      [...SUPPORTS, support({ id: 99, latitude: Number.NaN })],
      CLUSTER_MAX_ZOOM,
      { enabled: true },
    );
    expect(items.every((i) => i.kind === "point")).toBe(true);
    expect(items.map((i) => i.key)).toEqual(["p-11", "p-12", "p-13", "p-21", "p-22", "p-31"]);
  });

  it("is stable: identical input gives identical keys", () => {
    const a = clusterSupports(SUPPORTS, 7, { enabled: true }).map((i) => i.key);
    const b = clusterSupports([...SUPPORTS].reverse(), 7, { enabled: true }).map((i) => i.key);
    expect(a).toEqual(b);
  });

  it("gridCluster works with any projection (SVG fallback)", () => {
    const pts = [
      { id: "a", x: 1, y: 1 },
      { id: "b", x: 5, y: 5 },
      { id: "c", x: 50, y: 50 },
    ];
    const out = gridCluster(
      pts,
      (p) => ({ lng: p.x, lat: p.y }),
      (ll) => ({ x: ll.lng, y: ll.lat }),
      10,
      (p) => p.id,
    );
    expect(out.map((o) => o.kind)).toEqual(["cluster", "point"]);
    expect(out[0]?.kind === "cluster" && out[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
