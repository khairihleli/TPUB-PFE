import { describe, expect, it } from "vitest";

import type { LngLat } from "@/lib/network/geo";
import {
  addDraftVertex,
  closeDraft,
  draftStatus,
  edgeMidpoint,
  EMPTY_POLYGON_DRAFT,
  heatmapColorAt,
  heatmapFeatureCollection,
  heatmapGradientCss,
  insertDraftVertex,
  moveDraftVertex,
  partsToDraft,
  polygonDraftFeatureCollection,
  polygonsFeatureCollection,
  removeDraftVertex,
  removeLastDraftVertex,
  type MapHeatmap,
  type PolygonDraft,
} from "@/lib/network/overlays";
import { TOKEN_HEX } from "@/lib/network/theme";

const p = (lng: number, lat: number): LngLat => ({ lng, lat });
const SQUARE = [p(10.17, 36.79), p(10.19, 36.79), p(10.19, 36.81), p(10.17, 36.81)];

describe("polygon features", () => {
  it("closes every ring and keeps the tone", () => {
    const fc = polygonsFeatureCollection([
      { id: "z1", rings: [[SQUARE]], tone: "urgent", active: true, label: "Urgence" },
      { id: "z2", rings: [[SQUARE.slice(0, 2)]] },
    ]);
    expect(fc.features).toHaveLength(1);
    const feature = fc.features[0]!;
    expect(feature.geometry.coordinates[0]).toHaveLength(5);
    expect(feature.geometry.coordinates[0]?.[0]).toEqual(feature.geometry.coordinates[0]?.[4]);
    expect(feature.properties).toEqual({ id: "z1", label: "Urgence", tone: "urgent", active: true });
  });

  it("splits MultiPolygon parts and keeps holes", () => {
    const hole = [p(10.175, 36.795), p(10.185, 36.795), p(10.185, 36.805)];
    const fc = polygonsFeatureCollection([
      { id: "multi", rings: [[SQUARE, hole], [SQUARE]] },
    ]);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]?.geometry.coordinates).toHaveLength(2);
    expect(fc.features[0]?.properties.tone).toBe("brand");
  });
});

describe("polygon draft", () => {
  const drawn: PolygonDraft = { vertices: SQUARE, closed: false };

  it("adds, closes, removes and moves vertices", () => {
    let draft = EMPTY_POLYGON_DRAFT;
    draft = addDraftVertex(draft, p(10.17, 36.79));
    draft = addDraftVertex(draft, p(10.17, 36.79));
    expect(draft.vertices).toHaveLength(1);
    draft = addDraftVertex(draft, p(10.19, 36.79));
    expect(closeDraft(draft)).toBe(draft);
    draft = addDraftVertex(draft, p(10.19, 36.81));
    draft = closeDraft(draft);
    expect(draft.closed).toBe(true);
    expect(addDraftVertex(draft, p(10.2, 36.8))).toBe(draft);
    expect(removeLastDraftVertex(draft)).toEqual({ vertices: draft.vertices.slice(0, 2), closed: false });
    expect(moveDraftVertex(draft, 1, p(10.2, 36.8)).vertices[1]).toEqual(p(10.2, 36.8));
    expect(moveDraftVertex(draft, 9, p(10.2, 36.8))).toBe(draft);
    expect(removeDraftVertex(draft, 0)).toEqual({ vertices: draft.vertices.slice(1), closed: false });
    expect(insertDraftVertex(drawn, 0, p(10.18, 36.79)).vertices[1]).toEqual(p(10.18, 36.79));
    expect(edgeMidpoint(drawn, 0)).toEqual(p(10.18, 36.79));
  });

  it("reads a draft back from parts (closing point dropped)", () => {
    expect(partsToDraft([[[...SQUARE, SQUARE[0]!]]])).toEqual({ vertices: SQUARE, closed: true });
    expect(partsToDraft(null)).toEqual({ vertices: [], closed: false });
  });

  it("reports the drawing status in French", () => {
    expect(draftStatus(EMPTY_POLYGON_DRAFT).state).toBe("empty");
    expect(draftStatus({ vertices: SQUARE.slice(0, 2), closed: false }).message).toContain(
      "au moins 1 autre",
    );
    expect(draftStatus({ vertices: SQUARE, closed: false }).message).toContain("Entrée");
    const valid = draftStatus({ vertices: SQUARE, closed: true });
    expect(valid.state).toBe("valid");
    if (valid.state === "valid") expect(valid.validation.areaKm2).toBe(3.96);
    const bowTie = draftStatus({
      vertices: [p(10.17, 36.79), p(10.19, 36.81), p(10.19, 36.79), p(10.17, 36.81)],
      closed: true,
    });
    expect(bowTie).toMatchObject({ state: "invalid", message: "Le tracé du polygone se croise." });
  });

  it("builds fill, line and vertex features", () => {
    const open = polygonDraftFeatureCollection({ vertices: SQUARE, closed: false });
    expect(open.features.map((f) => f.properties.kind)).toEqual([
      "line",
      "vertex",
      "vertex",
      "vertex",
      "vertex",
    ]);
    expect(open.features[1]?.properties.first).toBe(true);
    const closed = polygonDraftFeatureCollection({ vertices: SQUARE, closed: true });
    expect(closed.features[0]?.properties.kind).toBe("fill");
    expect(polygonDraftFeatureCollection(null).features).toEqual([]);
  });
});

describe("heatmap", () => {
  const heatmap: MapHeatmap = {
    label: "Diffusions",
    maxWeight: 20,
    points: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [10.18, 36.8] },
          properties: { weight: 20 },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [10.3, 36.87] },
          properties: { weight: 5 },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [10.3, 36.87] },
          properties: { weight: 0 },
        },
      ],
    },
  };

  it("normalises the weights and drops empty points", () => {
    const fc = heatmapFeatureCollection(heatmap);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]?.properties).toEqual({ weight: 20, w: 1 });
    expect(fc.features[1]?.properties.w).toBe(0.25);
    expect(heatmapFeatureCollection(null).features).toEqual([]);
    expect(heatmapFeatureCollection({ ...heatmap, maxWeight: 0 }).features[0]?.properties.w).toBe(1);
  });

  it("exposes a token-based ramp for the legend and the SVG fallback", () => {
    expect(heatmapGradientCss()).toContain("linear-gradient(to right,");
    expect(heatmapColorAt(1)).toBe(TOKEN_HEX["red-text"]);
    expect(heatmapColorAt(0.5)).toBe(TOKEN_HEX.warning);
    expect(heatmapColorAt(0)).toBe(TOKEN_HEX["blue-text"]);
  });
});
