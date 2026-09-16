import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";

import { lightingFor, sunDirection } from "@/components/porteur3d/lighting";
import { computeNormalization } from "@/components/porteur3d/normalize";
import { facingFactor, projectToScreen, separateLabels } from "@/components/porteur3d/projection";
import {
  bandAspect,
  canvasSizeForAspect,
  coverUv,
  estimateScreenAspect,
  wrapBandUv,
} from "@/components/porteur3d/texture-math";
import { easeInOutCubic, interpolateView, tweenDuration } from "@/components/porteur3d/tween";

describe("computeNormalization", () => {
  it("scales to the mast height and moves the base centre to the origin", () => {
    const n = computeNormalization(
      { min: { x: -1, y: 2, z: -3 }, max: { x: 1, y: 12, z: -1 } },
      { targetHeightM: 20, autoScale: true },
    );
    expect(n.scale).toBeCloseTo(2);
    expect(n.offset[0]).toBeCloseTo(0);
    expect(n.offset[1]).toBeCloseTo(-4);
    expect(n.offset[2]).toBeCloseTo(4);
    expect(n.size).toEqual([4, 20, 4]);
    expect(n.warnings.join(" ")).toMatch(/recentrage/);
  });

  it("warns about units and keeps the scale without autoScale", () => {
    const cm = computeNormalization(
      { min: { x: -50, y: 0, z: -50 }, max: { x: 50, y: 2000, z: 50 } },
      { targetHeightM: 20, autoScale: true },
    );
    expect(cm.scale).toBeCloseTo(0.01);
    expect(cm.warnings.join(" ")).toMatch(/unité/);
    const fixed = computeNormalization(
      { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 10, z: 1 } },
      { targetHeightM: 20, autoScale: false },
    );
    expect(fixed.scale).toBe(1);
    expect(fixed.warnings.join(" ")).toMatch(/différente/);
  });

  it("handles an empty box", () => {
    const n = computeNormalization(
      {
        min: { x: Infinity, y: Infinity, z: Infinity },
        max: { x: -Infinity, y: -Infinity, z: -Infinity },
      },
      { targetHeightM: 20, autoScale: true },
    );
    expect(n.scale).toBe(1);
    expect(n.warnings).toHaveLength(1);
  });
});

describe("texture math", () => {
  it("cover-crops content like object-fit: cover", () => {
    const wideOnPortrait = coverUv(16 / 9, 9 / 16);
    expect(wideOnPortrait.repeatX).toBeCloseTo(9 / 16 / (16 / 9));
    expect(wideOnPortrait.offsetX).toBeCloseTo((1 - wideOnPortrait.repeatX) / 2);
    expect(wideOnPortrait.repeatY).toBe(1);
    const tallOnWide = coverUv(9 / 16, 16 / 9);
    expect(tallOnWide.repeatY).toBeCloseTo(9 / 16 / (16 / 9));
    expect(coverUv(1, 1)).toEqual({ repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 });
    // Sampling the surface centre always hits the content centre.
    expect(0.5 * wideOnPortrait.repeatX + wideOnPortrait.offsetX).toBeCloseTo(0.5);
  });

  it("tiles creatives around a 360° band with one copy centred on the front", () => {
    const wide = wrapBandUv(16 / 9, 3);
    expect(wide.copies).toBe(2);
    expect(wide.repeatX).toBe(2);
    expect(wide.stretchX).toBeCloseTo(1.5 / (16 / 9));
    expect((0.5 * wide.repeatX + wide.offsetX) % 1).toBeCloseTo(0.5);
    const tall = wrapBandUv(9 / 16, 3);
    expect(tall.copies).toBe(5);
    expect(tall.repeatY).toBeCloseTo(0.5625 / 0.6);
    expect(tall.offsetY).toBeCloseTo((1 - tall.repeatY) / 2);
    expect((0.5 * tall.repeatX + tall.offsetX) % 1).toBeCloseTo(0.5);
  });

  it("computes screen aspects", () => {
    expect(bandAspect(1, 2 * Math.PI)).toBeCloseTo(1);
    expect(estimateScreenAspect([2, 4, 0.1], 1)).toBeCloseTo(0.5);
    expect(estimateScreenAspect([2, 1, 2], "360")).toBeCloseTo(2 * Math.PI);
    expect(canvasSizeForAspect(3, 1536)).toEqual({ width: 1536, height: 512 });
    expect(canvasSizeForAspect(9 / 16, 1024)).toEqual({ width: 576, height: 1024 });
  });
});

describe("hotspot projection", () => {
  const camera = new PerspectiveCamera(50, 2, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  it("projects the look-at point to the centre", () => {
    const p = projectToScreen([0, 0, 0], camera, 200, 100);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
    expect(p.inView).toBe(true);
    expect(p.behind).toBe(false);
  });

  it("flags points behind the camera and clamps off-screen points", () => {
    expect(projectToScreen([0, 0, 20], camera, 200, 100).behind).toBe(true);
    const right = projectToScreen([100, 0, 0], camera, 200, 100, 18);
    expect(right.inView).toBe(false);
    expect(right.x).toBe(182);
    const up = projectToScreen([0, 50, 0], camera, 200, 100, 18);
    expect(up.y).toBe(18);
  });

  it("measures whether an anchor faces the camera", () => {
    expect(facingFactor([0, 0, -1], [0, 0, -1], [0, 0, -10])).toBeCloseTo(1);
    expect(facingFactor([0, 0, -1], [0, 0, -1], [0, 0, 10])).toBeCloseTo(-1);
  });

  it("separates overlapping labels", () => {
    const out = separateLabels([
      { key: "a", x: 10, y: 10 },
      { key: "b", x: 12, y: 15 },
      { key: "c", x: 300, y: 12 },
    ]);
    expect(out.find((l) => l.key === "b")?.y).toBe(40);
    expect(out.find((l) => l.key === "c")?.y).toBe(12);
  });
});

describe("tween + lighting", () => {
  const a = { position: [0, 2, -30] as const, target: [0, 5, 0] as const };
  const b = { position: [30, 20, 0] as const, target: [0, 10, 0] as const };

  it("eases and hits both ends exactly", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    const start = interpolateView(a, b, 0);
    const end = interpolateView(a, b, 1);
    expect(start.position[1]).toBeCloseTo(2);
    expect(end.position[0]).toBeCloseTo(30);
    expect(end.target[1]).toBeCloseTo(10);
    // Arc lift in the middle of the move.
    expect(interpolateView(a, b, 0.5).position[1]).toBeGreaterThan(11);
  });

  it("collapses durations under reduced motion", () => {
    expect(tweenDuration(a, b, true)).toBe(0);
    expect(tweenDuration(a, a, false)).toBe(0);
    const d = tweenDuration(a, b, false);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(1150 * 1.4);
  });

  it("switches the rig between jour and nuit", () => {
    const day = lightingFor(0);
    const night = lightingFor(1);
    expect(day.streetLightIntensity).toBe(0);
    expect(night.streetLightIntensity).toBeGreaterThan(0);
    expect(night.screenEmissive).toBeGreaterThan(day.screenEmissive);
    expect(night.sunIntensity).toBeLessThan(day.sunIntensity);
    expect(lightingFor(0, 40).fogFar).toBeCloseTo(day.fogFar * 2);
    expect(lightingFor(0.5).exposure).toBeCloseTo((day.exposure + night.exposure) / 2);
  });

  it("points the sun from elevation/azimuth (0 = north = −Z)", () => {
    const up = sunDirection(90, 0);
    expect(up[1]).toBeCloseTo(1);
    const east = sunDirection(0, 90);
    expect(east[0]).toBeCloseTo(1);
    expect(sunDirection(0, 0)[2]).toBeCloseTo(-1);
  });
});
