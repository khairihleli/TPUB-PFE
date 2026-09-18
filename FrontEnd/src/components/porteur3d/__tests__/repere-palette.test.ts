import { describe, expect, it } from "vitest";

import {
  buildPresetDef,
  buildPresetSnippet,
  describeSource,
  formatDims,
  formatMetres,
  formatTriangles,
  formatVec,
} from "@/components/porteur3d/repere-format";
import { computePorteurDimensions } from "@/components/porteur3d/porteur-dimensions";
import {
  localToWorld,
  resolveCameraPreset,
  worldToLocal,
} from "@/components/porteur3d/scene-config";
import {
  STUDIO_PALETTE,
  mixTokens,
  paletteInt,
  paletteRgba,
} from "@/components/porteur3d/studio-palette";
import type { Vec3Tuple } from "@/components/porteur3d/types";
import { TOKEN_HEX } from "@/lib/network/theme";

describe("repère readouts", () => {
  it("formats metres, dimensions, vectors and triangles in French", () => {
    expect(formatMetres(1.5)).toBe("1,50 m");
    expect(formatDims([2.5, 20, 2.5])).toBe("L 2,50 × H 20,00 × P 2,50 m");
    expect(formatVec([1.234, -0.001, -3])).toBe("x 1,23 · y 0,00 · z -3,00");
    expect(formatTriangles(12480)).toBe("12 480 triangles");
    expect(describeSource({ kind: "procedural" })).toMatch(/Procédural/);
    expect(describeSource({ kind: "glb", path: "/models/porteur.glb" })).toBe(
      "GLB · /models/porteur.glb",
    );
  });

  it("builds a « Copier la vue » preset that resolves back to the same camera", () => {
    const heading = 135;
    const dims = computePorteurDimensions("B", 25);
    const worldPosition: Vec3Tuple = [12.345, 6.789, -30.1];
    const worldTarget: Vec3Tuple = [0, 10, 0];
    const def = buildPresetDef(
      worldToLocal(worldPosition, heading),
      worldToLocal(worldTarget, heading),
      25,
    );
    expect(def.kind).toBe("fixed");
    const resolved = resolveCameraPreset(def, { dims, headingDeg: heading });
    // Rounded to the centimetre.
    resolved.position.forEach((v, i) => expect(v).toBeCloseTo(worldPosition[i] ?? 0, 1));
    resolved.target.forEach((v, i) => expect(v).toBeCloseTo(worldTarget[i] ?? 0, 1));

    const snippet = JSON.parse(buildPresetSnippet("orbite", [1, 2, 3], [0, 4, 0], 20)) as {
      id: string;
      def: { kind: string; position: number[]; referenceHeightM: number };
    };
    expect(snippet).toEqual({
      id: "orbite",
      def: { kind: "fixed", position: [1, 2, 3], target: [0, 4, 0], referenceHeightM: 20 },
    });
    expect(localToWorld([0, 0, -1], 0)[2]).toBeCloseTo(-1);
  });
});

describe("studio palette", () => {
  it("derives every colour from the design tokens", () => {
    for (const value of Object.values(STUDIO_PALETTE)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    expect(mixTokens("bg", "ink", 0)).toBe(TOKEN_HEX.bg);
    expect(mixTokens("bg", "ink", 1)).toBe(TOKEN_HEX.ink);
    expect(STUDIO_PALETTE.ledStrip).toBe(TOKEN_HEX["blue-text"]);
    expect(paletteInt("white")).toBe(0xffffff);
    expect(paletteRgba("axisX", 0.5)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.5\)$/);
  });
});
