import { describe, expect, it } from "vitest";

import {
  PANEL_ASPECT,
  computeHotspotAnchors,
  computePorteurDimensions,
  flutedRadiusFactor,
  mastRadiusAt,
  normalizeHeading,
  resolveMastHeight,
  wingAngles,
} from "@/components/porteur3d/porteur-dimensions";

describe("resolveMastHeight / normalizeHeading", () => {
  it("defaults to 20 m and clamps implausible values", () => {
    expect(resolveMastHeight(null)).toBe(20);
    expect(resolveMastHeight(undefined)).toBe(20);
    expect(resolveMastHeight(Number.NaN)).toBe(20);
    expect(resolveMastHeight(0)).toBe(20);
    expect(resolveMastHeight(25)).toBe(25);
    expect(resolveMastHeight(3)).toBe(8);
    expect(resolveMastHeight(100)).toBe(40);
  });

  it("normalises headings to [0, 360)", () => {
    expect(normalizeHeading(-90)).toBe(270);
    expect(normalizeHeading(720)).toBe(0);
    expect(normalizeHeading(null)).toBe(0);
  });
});

describe("computePorteurDimensions", () => {
  it("keeps the C screen at eye level (2.2–4 m) whatever the mast height", () => {
    for (const h of [15, 30]) {
      const s = computePorteurDimensions("C", h).screen;
      expect(s?.kind).toBe("panel");
      if (s?.kind !== "panel") return;
      expect(s.centerY - s.height / 2).toBeCloseTo(2.2);
      expect(s.centerY + s.height / 2).toBeCloseTo(4.0);
      expect(s.width / s.height).toBeCloseTo(PANEL_ASPECT);
      expect(s.faces).toEqual([1]);
    }
  });

  it("gives B two back-to-back 9:16 panels and A a 360° band", () => {
    const b = computePorteurDimensions("B", 30).screen;
    expect(b?.kind === "panel" && b.faces).toEqual([1, 2]);
    if (b?.kind === "panel") expect(b.width / b.height).toBeCloseTo(9 / 16);
    const a = computePorteurDimensions("A", 20).screen;
    expect(a?.kind).toBe("band");
  });

  it("has no screen but a sensor cabinet for D", () => {
    const d = computePorteurDimensions("D", 30);
    expect(d.screen).toBeNull();
    expect(d.sensorCabinet).not.toBeNull();
  });

  it("stacks the parts in the order of the renders", () => {
    for (const type of ["A", "B", "C", "D"] as const) {
      const d = computePorteurDimensions(type, 25);
      expect(d.sphereY + d.sphereRadius).toBeCloseTo(25);
      expect(d.headY).toBeLessThan(d.sphereY - d.sphereRadius);
      expect(d.plinthHeight).toBeLessThan(d.headY);
      if (d.screen?.kind === "band")
        expect(d.screen.centerY + d.screen.height / 2).toBeLessThan(d.headY);
      expect(d.mastTopRadius).toBeLessThan(d.mastBaseRadius);
    }
  });

  it("tapers the mast linearly between plinth and head", () => {
    const d = computePorteurDimensions("A", 20);
    expect(mastRadiusAt(d, d.plinthHeight)).toBeCloseTo(d.mastBaseRadius);
    expect(mastRadiusAt(d, d.headY)).toBeCloseTo(d.mastTopRadius);
    expect(mastRadiusAt(d, 100)).toBeCloseTo(d.mastTopRadius);
  });
});

describe("hotspot anchors", () => {
  it("places every anchor on the Porteur and omits the screen for D", () => {
    for (const type of ["A", "B", "C", "D"] as const) {
      const d = computePorteurDimensions(type, 20);
      const anchors = computeHotspotAnchors(d);
      expect(Boolean(anchors.ecran)).toBe(type !== "D");
      for (const a of Object.values(anchors)) {
        expect(a.position[1]).toBeGreaterThan(0);
        expect(a.position[1]).toBeLessThanOrEqual(20);
        expect(Math.hypot(...a.normal)).toBeCloseTo(1);
      }
    }
    const b = computeHotspotAnchors(computePorteurDimensions("B", 20));
    expect(b.ecran?.position[2]).toBeLessThan(0);
  });

  it("orients solar wings left/right (2) or as an X (4)", () => {
    expect(wingAngles(2)).toEqual([0, Math.PI]);
    expect(wingAngles(4)).toHaveLength(4);
  });
});

describe("flutedRadiusFactor", () => {
  it("cuts grooves of the given depth and leaves lands intact", () => {
    const flutes = 18;
    const depth = 0.07;
    const grooveCentre = (0.5 / flutes) * 2 * Math.PI;
    expect(flutedRadiusFactor(grooveCentre, flutes, depth)).toBeCloseTo(1 - depth);
    expect(flutedRadiusFactor(0, flutes, depth)).toBeCloseTo(1);
    for (let t = -Math.PI; t < Math.PI; t += 0.01) {
      const f = flutedRadiusFactor(t, flutes, depth);
      expect(f).toBeGreaterThanOrEqual(1 - depth - 1e-9);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
