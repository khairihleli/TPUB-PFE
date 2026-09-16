import { describe, expect, it } from "vitest";

import {
  circleSlots,
  minPlacementDistance,
  PORTEUR_MARKER_PX,
  spiderfy,
  spiderSignature,
  spiralSlots,
  type SpiderPoint,
} from "@/lib/network/spiderfy";

const SIZE = PORTEUR_MARKER_PX.full;

/** Deterministic pseudo-random generator (LCG) for dense layouts. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function pairwiseMin(points: { x: number; y: number }[]): number {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      if (a && b) min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return min;
}

describe("slots", () => {
  it("circle slots are evenly spaced, at least size + gap apart", () => {
    for (let n = 2; n <= 8; n++) {
      const slots = circleSlots(n, SIZE, 8);
      expect(slots).toHaveLength(n);
      expect(pairwiseMin(slots)).toBeGreaterThanOrEqual(SIZE + 8 - 1e-9);
      const radii = slots.map((p) => Math.hypot(p.x, p.y));
      for (const r of radii) expect(r).toBeCloseTo(radii[0] ?? 0, 9);
    }
    // first slot at the start angle (0 = up in screen space)
    expect(circleSlots(3, 20, 4)[0]?.x).toBeCloseTo(0, 9);
    expect(circleSlots(3, 20, 4)[0]?.y).toBeLessThan(0);
    expect(circleSlots(0, 20)).toEqual([]);
  });

  it("spiral slots never overlap, even for large groups", () => {
    for (const n of [9, 16, 40, 120]) {
      const slots = spiralSlots(n, SIZE);
      expect(slots).toHaveLength(n);
      expect(pairwiseMin(slots)).toBeGreaterThanOrEqual(SIZE);
    }
  });
});

describe("spiderfy", () => {
  it("leaves isolated markers exactly where they are", () => {
    const r = spiderfy(
      [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 100, y: 0 },
      ],
      { markerSize: SIZE },
    );
    expect(r.groups).toEqual([]);
    for (const p of r.placements) {
      expect(p.displaced).toBe(false);
      expect(p.position).toEqual(p.exact);
      expect(p.offset).toEqual({ x: 0, y: 0 });
      expect(p.leader).toBeNull();
    }
  });

  it("fans two overlapping markers on a circle around their centre, with leaders", () => {
    const r = spiderfy(
      [
        { id: 7, x: 200, y: 100 },
        { id: 3, x: 210, y: 100 },
      ],
      { markerSize: SIZE },
    );
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ key: "spider-3.7", ids: [3, 7], layout: "circle" });
    expect(r.groups[0]?.center).toEqual({ x: 205, y: 100 });
    expect(minPlacementDistance(r.placements)).toBeGreaterThanOrEqual(SIZE);
    for (const p of r.placements) {
      expect(p.displaced).toBe(true);
      // leader endpoints = exact projected point → marker centre
      expect(p.leader?.from).toEqual(p.exact);
      expect(p.leader?.to).toEqual(p.position);
      expect(p.position.x - p.exact.x).toBeCloseTo(p.offset.x, 9);
      expect(p.position.y - p.exact.y).toBeCloseTo(p.offset.y, 9);
    }
    // the fan follows the data: 3 (east) stays east of 7 (west)
    expect(r.byId.get(3)?.position.x).toBeGreaterThan(r.byId.get(7)?.position.x ?? Infinity);
  });

  it("uses a spiral beyond 8 markers", () => {
    const pts: SpiderPoint[] = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, x: 50, y: 50 }));
    const r = spiderfy(pts, { markerSize: SIZE });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]?.layout).toBe("spiral");
    expect(minPlacementDistance(r.placements)).toBeGreaterThanOrEqual(SIZE);
    expect(r.placements.every((p) => p.exact.x === 50 && p.exact.y === 50)).toBe(true);
  });

  it("is deterministic: same layout whatever the input order", () => {
    const rand = lcg(42);
    const pts: SpiderPoint[] = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      x: rand() * 160,
      y: rand() * 120,
    }));
    const a = spiderfy(pts, { markerSize: SIZE });
    const b = spiderfy([...pts].reverse(), { markerSize: SIZE });
    expect(a.placements).toEqual(b.placements);
    expect(a.groups).toEqual(b.groups);
    expect(spiderSignature(a)).toBe(spiderSignature(b));
    expect(spiderSignature(a)).toBe(spiderSignature(spiderfy(pts, { markerSize: SIZE })));
  });

  it("no two markers overlap after layout (dense random networks, merged fans)", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rand = lcg(seed);
      const count = 2 + Math.floor(rand() * 40);
      const spread = 40 + rand() * 400;
      const pts: SpiderPoint[] = Array.from({ length: count }, (_, i) => ({
        id: i,
        x: rand() * spread,
        y: rand() * spread * 0.6,
      }));
      for (const markerSize of [PORTEUR_MARKER_PX.compact, PORTEUR_MARKER_PX.full]) {
        const r = spiderfy(pts, { markerSize });
        expect(r.placements).toHaveLength(count);
        expect(minPlacementDistance(r.placements)).toBeGreaterThanOrEqual(markerSize - 1e-6);
        for (const p of r.placements) {
          const input = pts.find((q) => q.id === p.id);
          expect(p.exact).toEqual({ x: input?.x, y: input?.y });
          if (p.displaced) expect(p.leader?.from).toEqual(p.exact);
          else expect(p.position).toEqual(p.exact);
        }
      }
    }
  });

  it("leader lines never cross inside a fan (each marker reads as tied to its own point)", () => {
    const cross = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      c: { x: number; y: number },
      d: { x: number; y: number },
    ) => {
      const o = (p: typeof a, q: typeof a, r: typeof a) =>
        (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      const eps = 1e-6;
      return (
        o(a, b, c) * o(a, b, d) < -eps && o(c, d, a) * o(c, d, b) < -eps // proper intersection
      );
    };
    for (let seed = 1; seed <= 40; seed++) {
      const rand = lcg(seed * 7919);
      const count = 2 + Math.floor(rand() * 6); // 2..7: one circle fan
      const pts: SpiderPoint[] = Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        x: 100 + rand() * 14,
        y: 100 + rand() * 14,
      }));
      const r = spiderfy(pts, { markerSize: PORTEUR_MARKER_PX.compact });
      const legs = r.placements.flatMap((p) => (p.leader ? [p.leader] : []));
      for (let i = 0; i < legs.length; i++) {
        for (let j = i + 1; j < legs.length; j++) {
          const a = legs[i];
          const b = legs[j];
          if (a && b) expect(cross(a.from, a.to, b.from, b.to)).toBe(false);
        }
      }
    }
  });

  it("ignores non-finite points", () => {
    const r = spiderfy(
      [
        { id: "a", x: Number.NaN, y: 0 },
        { id: "b", x: 1, y: 1 },
      ],
      { markerSize: 20 },
    );
    expect(r.placements.map((p) => p.id)).toEqual(["b"]);
    expect(minPlacementDistance(r.placements)).toBe(Infinity);
  });
});
