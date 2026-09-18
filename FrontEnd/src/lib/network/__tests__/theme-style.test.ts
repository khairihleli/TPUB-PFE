import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ATTRIBUTION_CARTO,
  ATTRIBUTION_ESRI_CANVAS,
  ATTRIBUTION_ESRI,
  ATTRIBUTION_OSM,
  BASEMAPS,
  buildMapStyle,
  DEFAULT_LAYER_TOGGLES,
  isBasemapId,
  layerVisibility,
  MAP_LAYER_IDS,
  MAPLIBRE_LOCALE_FR,
  overlayLayers,
  VIEW_PITCH,
} from "@/lib/network/map-style";
import { hexToInt, MAP_COLORS, TOKEN_HEX, tokenInt, withAlpha } from "@/lib/network/theme";

describe("theme tokens mirror globals.css", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));

  it.each(Object.entries(TOKEN_HEX))("--%s = %s", (name, hex) => {
    const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(root);
    expect(match?.[1]?.toLowerCase()).toBe(hex);
  });

  it("every map colour is a token value", () => {
    const values = new Set<string>(Object.values(TOKEN_HEX));
    for (const color of Object.values(MAP_COLORS)) expect(values.has(color)).toBe(true);
  });

  it("converts colours", () => {
    expect(hexToInt("#0a0b10")).toBe(0x0a0b10);
    expect(hexToInt("fff")).toBe(0xffffff);
    expect(() => hexToInt("#zzzzzz")).toThrow(RangeError);
    expect(tokenInt("red")).toBe(0xe11d2a);
    expect(withAlpha("#5aa9f0", 0.5)).toBe("rgba(90, 169, 240, 0.5)");
    expect(withAlpha("#000000", 4)).toBe("rgba(0, 0, 0, 1)");
  });
});

describe("map style", () => {
  it("is an inline v8 style without glyphs or sprite", () => {
    const style = buildMapStyle("sombre");
    expect(style.version).toBe(8);
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
    expect(style.layers.some((l) => l.type === "symbol")).toBe(false);
    const bg = style.layers[0];
    expect(bg?.type === "background" && bg.paint?.["background-color"]).toBe(TOKEN_HEX.bg);
  });

  it("uses keyless Esri Canvas basemaps when no CARTO key is configured", () => {
    const style = buildMapStyle("sombre", { cartoKey: null });
    const s = style.sources["basemap-sombre"];
    const c = style.sources["basemap-clair"];
    const l = style.sources["basemap-satellite-labels"];
    const tilesOf = (x: typeof s) => (x && x.type === "raster" ? (x.tiles ?? []) : []);
    expect(tilesOf(s)[0]).toBe(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    );
    expect(tilesOf(c)[0]).toContain("Canvas/World_Light_Gray_Base");
    expect(tilesOf(l)[0]).toContain("Reference/World_Boundaries_and_Places");
    const all = Object.values(style.sources)
      .flatMap((x) => (x.type === "raster" ? (x.tiles ?? []) : []))
      .join(" ");
    expect(all).not.toContain("cartocdn");
    const attributions = Object.values(style.sources)
      .map((x) => ("attribution" in x ? x.attribution : ""))
      .join(" ");
    expect(attributions).toContain(ATTRIBUTION_ESRI_CANVAS);
    expect(attributions).toContain(ATTRIBUTION_OSM);
  });

  it("declares the 3 basemaps with the spec tile URLs and attributions (CARTO key set)", () => {
    const style = buildMapStyle("satellite", { cartoKey: "demo key" });
    const withKey = (url: string) => `${url}?key=demo%20key`;
    const src = style.sources;
    const tiles = (id: string) => {
      const s = src[id];
      return s && s.type === "raster" ? (s.tiles ?? []) : [];
    };
    expect(tiles("basemap-sombre")).toContain(
      withKey("https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"),
    );
    expect(tiles("basemap-sombre")).toHaveLength(4);
    expect(tiles("basemap-clair")[3]).toBe(
      withKey("https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png"),
    );
    expect(tiles("basemap-satellite")[0]).toBe(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    );
    expect(tiles("basemap-satellite-labels")[0]).toContain("dark_only_labels");
    const attributions = Object.values(src)
      .map((s) => ("attribution" in s ? s.attribution : ""))
      .join(" ");
    expect(attributions).toContain(ATTRIBUTION_OSM);
    expect(attributions).toContain(ATTRIBUTION_CARTO);
    expect(attributions).toContain(ATTRIBUTION_ESRI);
    expect(ATTRIBUTION_OSM).toContain("OpenStreetMap contributors");
    const visible = style.layers.filter(
      (l) => l.layout && "visibility" in l.layout && l.layout.visibility === "visible",
    );
    expect(visible.map((l) => l.id)).toEqual(["basemap-satellite", "basemap-satellite-labels"]);
  });

  it("lists basemaps in French and guards ids", () => {
    expect(BASEMAPS.map((b) => b.label)).toEqual(["Sombre", "Clair", "Satellite"]);
    expect(isBasemapId("clair")).toBe(true);
    expect(isBasemapId("dark")).toBe(false);
  });

  it("overlay layers only reference token colours", () => {
    const tokens = new Set<string>(Object.values(TOKEN_HEX));
    const json = JSON.stringify(overlayLayers());
    const hexes = json.match(/#[0-9a-f]{6}/gi) ?? [];
    expect(hexes.length).toBeGreaterThan(5);
    for (const h of hexes) expect(tokens.has(h.toLowerCase())).toBe(true);
    const ids = overlayLayers().map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("computes layer visibility for toggles and view mode", () => {
    const v2 = layerVisibility("clair", DEFAULT_LAYER_TOGGLES, "2d");
    expect(v2[MAP_LAYER_IDS.clair]).toBe("visible");
    expect(v2[MAP_LAYER_IDS.sombre]).toBe("none");
    expect(v2[MAP_LAYER_IDS.extrusions]).toBe("none");
    expect(v2[MAP_LAYER_IDS.satelliteLabels]).toBe("none");
    const v3 = layerVisibility(
      "satellite",
      { ...DEFAULT_LAYER_TOGGLES, zones: false, orientations: false },
      "3d",
    );
    expect(v3[MAP_LAYER_IDS.extrusions]).toBe("visible");
    expect(v3[MAP_LAYER_IDS.zonesFill]).toBe("none");
    expect(v3[MAP_LAYER_IDS.conesFill]).toBe("none");
    expect(v3[MAP_LAYER_IDS.satelliteLabels]).toBe("visible");
    const noPorteurs = layerVisibility(
      "sombre",
      { ...DEFAULT_LAYER_TOGGLES, porteurs: false },
      "3d",
    );
    expect(noPorteurs[MAP_LAYER_IDS.extrusions]).toBe("none");
    expect(noPorteurs[MAP_LAYER_IDS.conesLine]).toBe("none");
    expect(
      layerVisibility("satellite", { ...DEFAULT_LAYER_TOGGLES, etiquettes: false }, "2d")[
        MAP_LAYER_IDS.satelliteLabels
      ],
    ).toBe("none");
    // every style layer has an entry
    expect(Object.keys(v2).sort()).toEqual(
      buildMapStyle()
        .layers.map((l) => l.id)
        .sort(),
    );
  });

  it("3D pitch is 60° and locale is French", () => {
    expect(VIEW_PITCH).toEqual({ "2d": 0, "3d": 60 });
    expect(MAPLIBRE_LOCALE_FR["NavigationControl.ZoomIn"]).toBe("Zoom avant");
  });
});
