import { describe, expect, it } from "vitest";

import {
  createProjection,
  DJERBA_OUTLINE,
  findDenseCluster,
  isValidCoordinate,
  outlineToPath,
  TUNISIA_BOUNDS,
  TUNISIA_OUTLINE,
} from "@/components/espace/map-projection";

describe("createProjection", () => {
  const p = createProjection(TUNISIA_BOUNDS, 520);

  it("derives a portrait width from the bounds with a cos(latitude) correction", () => {
    const dLat = TUNISIA_BOUNDS.maxLat - TUNISIA_BOUNDS.minLat;
    const dLng = TUNISIA_BOUNDS.maxLng - TUNISIA_BOUNDS.minLng;
    const mid = ((TUNISIA_BOUNDS.maxLat + TUNISIA_BOUNDS.minLat) / 2) * (Math.PI / 180);
    expect(p.height).toBe(520);
    expect(p.width).toBeCloseTo((520 * dLng * Math.cos(mid)) / dLat, 0);
    expect(p.width).toBeLessThan(p.height);
  });

  it("maps the north-west corner to the origin and the south-east corner to (width, height)", () => {
    expect(p.project(TUNISIA_BOUNDS.maxLat, TUNISIA_BOUNDS.minLng)).toEqual({
      x: 0,
      y: 0,
      inside: true,
    });
    expect(p.project(TUNISIA_BOUNDS.minLat, TUNISIA_BOUNDS.maxLng)).toEqual({
      x: p.width,
      y: p.height,
      inside: true,
    });
  });

  it("puts north above south and west left of east", () => {
    const tunis = p.project(36.8008, 10.18);
    const sfax = p.project(34.7406, 10.7603);
    expect(tunis.y).toBeLessThan(sfax.y);
    expect(tunis.x).toBeLessThan(sfax.x);
    expect(tunis.inside && sfax.inside).toBe(true);
    // Tunis sits in the northern fifth of the country.
    expect(tunis.y / p.height).toBeLessThan(0.2);
  });

  it("clamps out-of-bounds coordinates to the frame and flags them", () => {
    const paris = p.project(48.85, 2.35);
    expect(paris.inside).toBe(false);
    expect(paris.x).toBe(0);
    expect(paris.y).toBe(0);
  });

  it("converts kilometres with the vertical scale", () => {
    const unitsPerKm = 520 / (TUNISIA_BOUNDS.maxLat - TUNISIA_BOUNDS.minLat) / 111.32;
    expect(p.kmToUnits(10)).toBeCloseTo(10 * unitsPerKm, 1);
    expect(p.kmToUnits(0)).toBe(0);
    expect(p.kmToUnits(-3)).toBe(0);
  });

  it("rejects an empty or inverted bounding box", () => {
    expect(() => createProjection({ minLat: 1, maxLat: 1, minLng: 0, maxLng: 1 })).toThrow();
    expect(() => createProjection(TUNISIA_BOUNDS, 0)).toThrow();
  });
});

describe("outlines", () => {
  it("keeps every outline vertex inside the bounding box", () => {
    for (const [lng, lat] of [...TUNISIA_OUTLINE, ...DJERBA_OUTLINE]) {
      expect(lat).toBeGreaterThanOrEqual(TUNISIA_BOUNDS.minLat);
      expect(lat).toBeLessThanOrEqual(TUNISIA_BOUNDS.maxLat);
      expect(lng).toBeGreaterThanOrEqual(TUNISIA_BOUNDS.minLng);
      expect(lng).toBeLessThanOrEqual(TUNISIA_BOUNDS.maxLng);
    }
  });

  it("builds a closed SVG path", () => {
    const p = createProjection();
    const d = outlineToPath(
      [
        [TUNISIA_BOUNDS.minLng, TUNISIA_BOUNDS.maxLat],
        [TUNISIA_BOUNDS.maxLng, TUNISIA_BOUNDS.minLat],
      ],
      p,
    );
    expect(d).toBe(`M0 0 L${p.width} ${p.height} Z`);
    expect(outlineToPath([], p)).toBe("");
  });
});

describe("isValidCoordinate", () => {
  it("accepts finite lat/lng in range only", () => {
    expect(isValidCoordinate(36.8, 10.18)).toBe(true);
    expect(isValidCoordinate(91, 10)).toBe(false);
    expect(isValidCoordinate(Number.NaN, 10)).toBe(false);
    expect(isValidCoordinate(null, 10)).toBe(false);
  });
});

describe("findDenseCluster", () => {
  const p = createProjection(TUNISIA_BOUNDS, 520);
  const tunis = { id: 1, latitude: 36.8008, longitude: 10.18, radiusKm: 2.5 };
  const lac = { id: 2, latitude: 36.838, longitude: 10.233, radiusKm: 2 };
  const marsa = { id: 3, latitude: 36.8782, longitude: 10.3247, radiusKm: 2 };
  const sousse = { id: 4, latitude: 35.8256, longitude: 10.636, radiusKm: 3 };
  const sfax = { id: 5, latitude: 34.7406, longitude: 10.7603, radiusKm: 3 };

  it("returns null when no markers collide", () => {
    expect(findDenseCluster([tunis, sousse, sfax], p)).toBeNull();
    expect(findDenseCluster([], p)).toBeNull();
  });

  it("groups overlapping zones and frames them in a square (km) box covering their radii", () => {
    const cluster = findDenseCluster([sousse, marsa, tunis, sfax, lac], p);
    expect(cluster?.ids).toEqual([3, 1, 2]);
    const b = cluster!.bounds;
    for (const z of [tunis, lac, marsa]) {
      const latPad = z.radiusKm / 111.32;
      expect(b.minLat).toBeLessThan(z.latitude - latPad);
      expect(b.maxLat).toBeGreaterThan(z.latitude + latPad);
      expect(b.minLng).toBeLessThan(z.longitude - latPad);
      expect(b.maxLng).toBeGreaterThan(z.longitude + latPad);
    }
    const cos = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180);
    expect((b.maxLng - b.minLng) * cos).toBeCloseTo(b.maxLat - b.minLat, 6);
  });
});
