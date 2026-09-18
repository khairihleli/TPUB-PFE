import { Box3, type BufferGeometry, Mesh } from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { countTriangles, disposeObject3D, indexModel } from "@/components/porteur3d/model-index";
import { buildProceduralPorteur } from "@/components/porteur3d/porteur-procedural";
import { createProceduralPorteur, loadPorteurModel } from "@/components/porteur3d/porteur-model";
import type { FetchLike } from "@/components/porteur3d/glb-naming";

// jsdom has no 2D canvas: optional textures are skipped (and the "not implemented" noise avoided).
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterAll(() => {
  vi.restoreAllMocks();
});

describe("buildProceduralPorteur", () => {
  it("follows the GLB naming convention so the same indexer drives both models", () => {
    const a = indexModel(buildProceduralPorteur("A", 20).root);
    expect(a.screens.map((s) => s.face)).toEqual(["360"]);
    expect(a.energySpheres).toHaveLength(1);
    expect(Object.keys(a.hotspots).sort()).toEqual([
      "base",
      "capteurs",
      "ecran",
      "mat",
      "solaire",
      "sphere",
    ]);

    const b = indexModel(buildProceduralPorteur("B", 30).root);
    expect(b.screens.map((s) => s.face).sort()).toEqual([1, 2]);

    const c = indexModel(buildProceduralPorteur("C", 15).root);
    expect(c.screens.map((s) => s.face)).toEqual([1]);

    const d = indexModel(buildProceduralPorteur("D", 30).root);
    expect(d.screens).toHaveLength(0);
    expect(d.hotspots.ecran).toBeUndefined();
    expect(d.energySpheres).toHaveLength(1);
  });

  it("is built at metric scale within the triangle budget", () => {
    for (const type of ["A", "B", "C", "D"] as const) {
      for (const h of [15, 30]) {
        const { root } = buildProceduralPorteur(type, h);
        const box = new Box3().setFromObject(root);
        expect(box.max.y).toBeGreaterThan(h - 0.2);
        expect(box.max.y).toBeLessThan(h + 0.6);
        expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
        expect(countTriangles(root)).toBeLessThan(150_000);
        disposeObject3D(root);
      }
    }
  });

  it("disposes every geometry once", () => {
    const { root } = buildProceduralPorteur("B", 20);
    const geometries = new Set<BufferGeometry>();
    root.traverse((o) => {
      if (o instanceof Mesh) geometries.add(o.geometry as BufferGeometry);
    });
    const spies = [...geometries].map((g) => vi.spyOn(g, "dispose"));
    disposeObject3D(root);
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
  });
});

describe("porteur-model loading chain", () => {
  it("exposes surfaces with aspects and anchors for the procedural model", () => {
    const loaded = createProceduralPorteur("B", 25);
    expect(loaded.source).toEqual({ kind: "procedural" });
    expect(loaded.surfaces).toHaveLength(2);
    for (const s of loaded.surfaces) expect(s.aspect).toBeCloseTo(9 / 16);
    expect(loaded.anchors.ecran?.position[2]).toBeLessThan(0);
    expect(loaded.size[1]).toBeGreaterThan(24.8);
    loaded.dispose();
  });

  it("falls back to the procedural Porteur when no GLB answers the HEAD probe", async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve({ ok: false, status: 404, headers: { get: () => "text/html" } }),
    );
    const loaded = await loadPorteurModel({ type: "C", mastHeightM: null, fetchImpl });
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      "/models/porteur-type-c.glb",
      "/models/porteur.glb",
    ]);
    expect(loaded.source.kind).toBe("procedural");
    expect(loaded.dims.heightM).toBe(20);
    expect(loaded.surfaces[0]?.aspect).toBeCloseTo(9 / 16);
    loaded.dispose();
  });
});
