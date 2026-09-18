import { describe, expect, it } from "vitest";

import {
  computeHotspotAnchors,
  computePorteurDimensions,
  mastRadiusAt,
} from "@/components/porteur3d/porteur-dimensions";
import {
  CAMERA_PRESETS,
  CAMERA_PRESET_IDS,
  SCENE_CONFIG,
  bearingLong,
  bearingShort,
  effectiveFace,
  faceOptionsFor,
  getHotspots,
  glbCandidates,
  headingDirection,
  headingToRotationY,
  localToWorld,
  parseRepereParam,
  presetIdForKey,
  resolveCameraPreset,
  resolveHotspotFocus,
  resolvePresetFor,
  worldToLocal,
} from "@/components/porteur3d/scene-config";
import type { StudioPorteurType, Vec3Tuple } from "@/components/porteur3d/types";

function expectVec(actual: Vec3Tuple, expected: Vec3Tuple, digits = 6) {
  expect(actual[0]).toBeCloseTo(expected[0], digits);
  expect(actual[1]).toBeCloseTo(expected[1], digits);
  expect(actual[2]).toBeCloseTo(expected[2], digits);
}

const TYPES: StudioPorteurType[] = ["A", "B", "C", "D"];

describe("heading helpers", () => {
  it("maps 0/90/180/270 to N (−Z), E (+X), S (+Z), W (−X)", () => {
    expectVec(headingDirection(0), [0, 0, -1]);
    expectVec(headingDirection(90), [1, 0, 0]);
    expectVec(headingDirection(180), [0, 0, 1]);
    expectVec(headingDirection(270), [-1, 0, 0]);
  });

  it("gives the three.js Y rotation (clockwise heading = negative rotation)", () => {
    expect(headingToRotationY(90)).toBeCloseTo(-Math.PI / 2);
    expect(headingToRotationY(null)).toBeCloseTo(0);
    expect(headingToRotationY(-90)).toBeCloseTo((-270 * Math.PI) / 180);
  });

  it("round-trips local ↔ world", () => {
    const v: Vec3Tuple = [1.5, 3, -7];
    for (const h of [0, 37, 145, 300]) expectVec(worldToLocal(localToWorld(v, h), h), v);
  });

  it("formats French compass bearings", () => {
    expect(bearingShort(0)).toBe("N");
    expect(bearingShort(44)).toBe("NE");
    expect(bearingShort(225)).toBe("SO");
    expect(bearingShort(359)).toBe("N");
    expect(bearingLong(90)).toBe("est");
    expect(bearingLong(null)).toBe("nord");
  });
});

describe("camera presets", () => {
  it("exposes the five viewpoints in keyboard order 1–5", () => {
    expect(CAMERA_PRESET_IDS).toEqual(["orbite", "pieton", "conducteur", "drone", "face"]);
    expect(CAMERA_PRESETS.map((p) => p.key)).toEqual(["1", "2", "3", "4", "5"]);
    expect(presetIdForKey("3")).toBe("conducteur");
    expect(presetIdForKey("9")).toBeNull();
  });

  it("puts the pedestrian at 1.7 m, 25 m in front of the C screen", () => {
    const dims = computePorteurDimensions("C", 15);
    const view = resolvePresetFor("pieton", "C", 15, 0);
    const offset = dims.screen?.kind === "panel" ? dims.screen.offset : 0;
    expect(offset).toBeCloseTo(mastRadiusAt(dims, 3.1) + 0.26);
    expectVec(view.target, [0, 3.1, -offset]);
    expect(view.position[1]).toBeCloseTo(1.7);
    expect(
      Math.hypot(view.position[0] - view.target[0], view.position[2] - view.target[2]),
    ).toBeCloseTo(25);
    expect(view.position[2]).toBeLessThan(view.target[2]);
  });

  it("puts the driver at 1.2 m, 60 m away with a lane offset", () => {
    const view = resolvePresetFor("conducteur", "B", 30, 0);
    expect(view.position[1]).toBeCloseTo(1.2);
    expect(view.target[2] - view.position[2]).toBeCloseTo(60);
    expect(Math.abs(view.position[0])).toBeCloseTo(4);
  });

  it("rotates presets with the heading", () => {
    const view = resolvePresetFor("pieton", "C", 15, 90);
    // Face points east: the pedestrian stands east of the Porteur.
    expect(view.position[0]).toBeGreaterThan(20);
    expect(Math.abs(view.position[2])).toBeLessThan(1);
  });

  it("frames face 2 of a double-face Porteur from the opposite side", () => {
    const dims = computePorteurDimensions("B", 20);
    const face1 = resolveCameraPreset("face", { dims, headingDeg: 0, face: 1 });
    const face2 = resolveCameraPreset("face", { dims, headingDeg: 0, face: 2 });
    expect(face1.position[2]).toBeLessThan(0);
    expect(face2.position[2]).toBeGreaterThan(0);
    // Face 2 is ignored for a single-screen type.
    const a = resolveCameraPreset("face", {
      dims: computePorteurDimensions("A", 20),
      headingDeg: 0,
      face: 2,
    });
    expect(a.position[2]).toBeLessThan(0);
  });

  it("never places the camera under the ground nor outside the orbit limits", () => {
    for (const type of TYPES) {
      for (const h of [15, 20, 25, 30]) {
        const dims = computePorteurDimensions(type, h);
        const max = Math.max(
          SCENE_CONFIG.controls.maxDistanceMin,
          h * SCENE_CONFIG.controls.maxDistanceFactor,
        );
        for (const id of CAMERA_PRESET_IDS) {
          const v = resolveCameraPreset(id, { dims, headingDeg: 123, face: "all" });
          const d = Math.hypot(
            v.position[0] - v.target[0],
            v.position[1] - v.target[1],
            v.position[2] - v.target[2],
          );
          expect(v.position[1]).toBeGreaterThanOrEqual(SCENE_CONFIG.controls.minCameraY);
          expect(d).toBeGreaterThanOrEqual(SCENE_CONFIG.controls.minDistance);
          expect(d).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it("scales a fixed preset (« Copier la vue » output) with the mast height", () => {
    const dims = computePorteurDimensions("A", 30);
    const view = resolveCameraPreset(
      { kind: "fixed", position: [10, 4, -20], target: [0, 8, 0], referenceHeightM: 20 },
      { dims, headingDeg: 0 },
    );
    expectVec(view.position, [15, 6, -30]);
    expectVec(view.target, [0, 12, 0]);
  });

  it("focuses a hotspot along its outward normal", () => {
    const dims = computePorteurDimensions("A", 20);
    const anchor = computeHotspotAnchors(dims).base;
    expect(anchor).toBeDefined();
    if (!anchor) return;
    const view = resolveHotspotFocus({ distance: 7, azimuthDeg: 0, heightOffset: 1 }, anchor, {
      dims,
      headingDeg: 90,
    });
    expectVec(view.target, localToWorld(anchor.position, 90));
    const local = worldToLocal(view.position, 90);
    expect(local[2]).toBeCloseTo(anchor.position[2] - 7);
    expect(local[1]).toBeCloseTo(anchor.position[1] + 1);
  });
});

describe("faces, hotspots, misc", () => {
  it("offers face choices per type", () => {
    expect(faceOptionsFor("A").map((f) => f.label)).toEqual(["360°"]);
    expect(faceOptionsFor("B").map((f) => f.value)).toEqual(["all", 1, 2]);
    expect(faceOptionsFor("C").map((f) => f.label)).toEqual(["Face unique"]);
    expect(faceOptionsFor("D")).toEqual([]);
    expect(effectiveFace("A", 2)).toBe("all");
    expect(effectiveFace("B", 2)).toBe(2);
  });

  it("lists six hotspots (five for D, without screen)", () => {
    expect(getHotspots("A").map((h) => h.id)).toEqual([
      "ecran",
      "sphere",
      "solaire",
      "capteurs",
      "mat",
      "base",
    ]);
    expect(getHotspots("D").map((h) => h.id)).not.toContain("ecran");
    expect(getHotspots("D")).toHaveLength(5);
  });

  it("keeps hotspot copy honest: French design intention, no power/energy figures", () => {
    const all = JSON.stringify(TYPES.map((t) => getHotspots(t, 25)));
    expect(all).not.toMatch(/kW|kWh|watt/i);
    expect(getHotspots("A", 25).find((h) => h.id === "mat")?.body).toContain("25 m");
    expect(getHotspots("A", null).find((h) => h.id === "mat")?.body).toContain("par défaut");
  });

  it("parses the repère query parameter", () => {
    expect(parseRepereParam("1")).toBe(true);
    expect(parseRepereParam(["oui"])).toBe(true);
    expect(parseRepereParam("0")).toBe(false);
    expect(parseRepereParam(null)).toBe(false);
  });

  it("lists GLB candidates in order", () => {
    expect(glbCandidates("B")).toEqual(["/models/porteur-type-b.glb", "/models/porteur.glb"]);
  });
});
