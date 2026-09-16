import { describe, expect, it, vi } from "vitest";

import {
  classifyNodeName,
  hotspotIdFromSuffix,
  isFaceLit,
  looksLikeGlbResponse,
  resolveGlbPath,
  type FetchLike,
} from "@/components/porteur3d/glb-naming";

describe("classifyNodeName", () => {
  it("recognises screens and their faces", () => {
    expect(classifyNodeName("Screen_360")).toEqual({ kind: "screen", face: "360" });
    expect(classifyNodeName("Screen_Face_1")).toEqual({ kind: "screen", face: 1 });
    expect(classifyNodeName("screen_face_2")).toEqual({ kind: "screen", face: 2 });
    expect(classifyNodeName("Screen")).toEqual({ kind: "screen", face: null });
  });

  it("tolerates GLTFLoader duplicate suffixes and sanitised Blender suffixes", () => {
    expect(classifyNodeName("Screen_Face_2_1")).toEqual({ kind: "screen", face: 2 });
    expect(classifyNodeName("Screen_Face_1001")).toEqual({ kind: "screen", face: 1 });
    expect(classifyNodeName("Screen_Face_2.001")).toEqual({ kind: "screen", face: 2 });
    expect(classifyNodeName("Screen_Face_12")).toEqual({ kind: "screen", face: null });
  });

  it("falls back on the M_Screen material name", () => {
    expect(classifyNodeName("Panel_Mesh", ["M_Metal", "M_Screen_Face_2"])).toEqual({
      kind: "screen",
      face: 2,
    });
    expect(classifyNodeName("Panel_Mesh", ["M_Metal"])).toBeNull();
  });

  it("recognises the energy sphere and hotspot empties", () => {
    expect(classifyNodeName("Porteur_Energy_Sphere")).toEqual({ kind: "energy-sphere" });
    expect(classifyNodeName("Hotspot_capteurs")).toEqual({
      kind: "hotspot",
      id: "capteurs",
      raw: "capteurs",
    });
    expect(classifyNodeName("Hotspot_Solar_2")).toEqual({
      kind: "hotspot",
      id: "solaire",
      raw: "Solar_2",
    });
    expect(classifyNodeName("Hotspot_Antenne")).toEqual({
      kind: "hotspot",
      id: null,
      raw: "Antenne",
    });
    expect(classifyNodeName("Mast")).toBeNull();
  });

  it("maps French and English hotspot aliases", () => {
    expect(hotspotIdFromSuffix("ecran")).toBe("ecran");
    expect(hotspotIdFromSuffix("Screen")).toBe("ecran");
    expect(hotspotIdFromSuffix("Mast1")).toBe("mat");
    expect(hotspotIdFromSuffix("socle")).toBe("base");
    expect(hotspotIdFromSuffix("foo")).toBeNull();
  });
});

describe("isFaceLit", () => {
  it("dims only the non-selected face of a double-face screen", () => {
    expect(isFaceLit(1, "all")).toBe(true);
    expect(isFaceLit(2, 1)).toBe(false);
    expect(isFaceLit(2, 2)).toBe(true);
    expect(isFaceLit("360", 1)).toBe(true);
    expect(isFaceLit(null, 2)).toBe(true);
  });
});

function response(status: number, contentType: string | null) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => contentType } };
}

describe("resolveGlbPath", () => {
  it("rejects HTML fallbacks and non-2xx answers", () => {
    expect(looksLikeGlbResponse(200, "model/gltf-binary")).toBe(true);
    expect(looksLikeGlbResponse(200, null)).toBe(true);
    expect(looksLikeGlbResponse(200, "text/html; charset=utf-8")).toBe(false);
    expect(looksLikeGlbResponse(404, null)).toBe(false);
  });

  it("HEAD-probes the candidates in order", async () => {
    const fetchImpl = vi.fn<FetchLike>((url) =>
      Promise.resolve(
        url.endsWith("porteur.glb")
          ? response(200, "model/gltf-binary")
          : response(404, "text/html"),
      ),
    );
    await expect(
      resolveGlbPath(["/models/porteur-type-a.glb", "/models/porteur.glb"], fetchImpl),
    ).resolves.toBe("/models/porteur.glb");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("HEAD");
  });

  it("returns null when nothing exists and skips network errors", async () => {
    const none = vi.fn<FetchLike>(() => Promise.resolve(response(404, null)));
    await expect(resolveGlbPath(["/a.glb", "/b.glb"], none)).resolves.toBeNull();
    const flaky = vi.fn<FetchLike>((url) =>
      url === "/a.glb"
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(response(200, "application/octet-stream")),
    );
    await expect(resolveGlbPath(["/a.glb", "/b.glb"], flaky)).resolves.toBe("/b.glb");
  });

  it("rejects when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(response(200, null)));
    await expect(resolveGlbPath(["/a.glb"], fetchImpl, controller.signal)).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
