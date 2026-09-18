import { describe, expect, it } from "vitest";

import {
  CATCHMENT_DEFAULT_KM,
  CATCHMENT_MAX_KM,
  CATCHMENT_MIN_KM,
  clampRadiusKm,
  createMapUiState,
  mapUiReducer,
  type MapUiAction,
  type MapUiState,
} from "@/components/map/map-ui-state";

const run = (actions: MapUiAction[], start: MapUiState = createMapUiState()) =>
  actions.reduce(mapUiReducer, start);

const P1 = { lng: 10, lat: 36 };
const P2 = { lng: 10.1, lat: 36.1 };

describe("createMapUiState", () => {
  it("defaults to dark 2D with every layer on", () => {
    const s = createMapUiState();
    expect(s.basemap).toBe("sombre");
    expect(s.viewMode).toBe("2d");
    expect(Object.values(s.layers).every(Boolean)).toBe(true);
    expect(s.tool).toBe("none");
    expect(s.panel).toBeNull();
    expect(s.catchment).toEqual({ center: null, radiusKm: CATCHMENT_DEFAULT_KM });
    // every Porteur individually by default: no count bubbles
    expect(s.clusterPorteurs).toBe(false);
    expect(s.filters).toEqual({ types: [], statuses: [], bookableOnly: false });
  });

  it("« Regrouper les Porteurs proches » is an opt-in toggle kept in the state", () => {
    const s = createMapUiState();
    expect(mapUiReducer(s, { type: "cluster", value: false })).toBe(s);
    const on = mapUiReducer(s, { type: "cluster" });
    expect(on.clusterPorteurs).toBe(true);
    // survives other UI changes
    const later = run(
      [{ type: "panel", panel: "legend" }, { type: "tool", tool: "measure" }, { type: "escape" }],
      on,
    );
    expect(later.clusterPorteurs).toBe(true);
    expect(mapUiReducer(on, { type: "cluster" }).clusterPorteurs).toBe(false);
    expect(createMapUiState({ clusterPorteurs: true }).clusterPorteurs).toBe(true);
  });

  it("accepts an initial basemap and view", () => {
    expect(createMapUiState({ basemap: "satellite", viewMode: "3d" })).toMatchObject({
      basemap: "satellite",
      viewMode: "3d",
    });
  });
});

describe("mapUiReducer", () => {
  it("keeps the same reference for no-op basemap/view/layer changes", () => {
    const s = createMapUiState();
    expect(mapUiReducer(s, { type: "basemap", basemap: "sombre" })).toBe(s);
    expect(mapUiReducer(s, { type: "view", viewMode: "2d" })).toBe(s);
    expect(mapUiReducer(s, { type: "layer", layer: "zones", value: true })).toBe(s);
  });

  it("switches basemap, view and toggles layers", () => {
    const s = run([
      { type: "basemap", basemap: "clair" },
      { type: "view", viewMode: "3d" },
      { type: "layer", layer: "orientations" },
    ]);
    expect(s.basemap).toBe("clair");
    expect(s.viewMode).toBe("3d");
    expect(s.layers.orientations).toBe(false);
    expect(mapUiReducer(s, { type: "layer", layer: "orientations" }).layers.orientations).toBe(
      true,
    );
  });

  it("sets and resets filters", () => {
    const s = run([
      { type: "filters", filters: { types: ["A"], statuses: [], bookableOnly: true } },
    ]);
    expect(s.filters.types).toEqual(["A"]);
    expect(mapUiReducer(s, { type: "reset-filters" }).filters).toEqual({
      types: [],
      statuses: [],
      bookableOnly: false,
    });
  });

  it("tool toggles off when selected again and clears tool data", () => {
    const measuring = run([
      { type: "tool", tool: "measure" },
      { type: "measure-add", point: P1 },
    ]);
    expect(measuring.measure.points).toHaveLength(1);
    const off = mapUiReducer(measuring, { type: "tool", tool: "measure" });
    expect(off.tool).toBe("none");
    expect(off.measure.points).toEqual([]);
    const switched = mapUiReducer(measuring, { type: "tool", tool: "catchment" });
    expect(switched.tool).toBe("catchment");
    expect(switched.measure.points).toEqual([]);
  });

  it("choosing a tool closes the mobile tools sheet only", () => {
    const s = run([
      { type: "panel", panel: "tools" },
      { type: "tool", tool: "catchment" },
    ]);
    expect(s.panel).toBeNull();
    const legend = run([
      { type: "panel", panel: "legend" },
      { type: "tool", tool: "catchment" },
    ]);
    expect(legend.panel).toBe("legend");
  });

  it("panels toggle and carry a list scope only for the list", () => {
    const s = run([{ type: "panel", panel: "list", listScope: [1, 2] }]);
    expect(s.panel).toBe("list");
    expect(s.listScope).toEqual([1, 2]);
    expect(mapUiReducer(s, { type: "panel", panel: "list" }).panel).toBeNull();
    expect(mapUiReducer(s, { type: "panel", panel: "legend" }).listScope).toBeNull();
    expect(mapUiReducer(s, { type: "panel", panel: null }).panel).toBeNull();
  });

  it("measure: ignores points when the tool is off, undo, finish, restart, clear", () => {
    const idle = createMapUiState();
    expect(mapUiReducer(idle, { type: "measure-add", point: P1 })).toBe(idle);
    let s = run([
      { type: "tool", tool: "measure" },
      { type: "measure-add", point: P1 },
      { type: "measure-add", point: P2 },
    ]);
    expect(s.measure.points).toEqual([P1, P2]);
    s = mapUiReducer(s, { type: "measure-undo" });
    expect(s.measure.points).toEqual([P1]);
    s = mapUiReducer(s, { type: "measure-finish" });
    expect(s.measure.finished).toBe(true);
    expect(mapUiReducer(s, { type: "measure-finish" })).toBe(s);
    s = mapUiReducer(s, { type: "measure-add", point: P2 });
    expect(s.measure).toEqual({ points: [P2], finished: false });
    s = mapUiReducer(s, { type: "measure-clear" });
    expect(s.measure.points).toEqual([]);
    expect(mapUiReducer(s, { type: "measure-undo" })).toBe(s);
    expect(mapUiReducer(s, { type: "measure-finish" })).toBe(s);
  });

  it("catchment: centre and clamped radius", () => {
    const s = run([
      { type: "tool", tool: "catchment" },
      { type: "catchment-center", center: P1 },
      { type: "catchment-radius", radiusKm: 99 },
    ]);
    expect(s.catchment).toEqual({ center: P1, radiusKm: CATCHMENT_MAX_KM });
    expect(mapUiReducer(s, { type: "catchment-radius", radiusKm: 0 }).catchment.radiusKm).toBe(
      CATCHMENT_MIN_KM,
    );
    // leaving the tool drops the centre but keeps the radius
    const off = mapUiReducer(s, { type: "tool", tool: "catchment" });
    expect(off.catchment).toEqual({ center: null, radiusKm: CATCHMENT_MAX_KM });
  });

  it("escape unwinds panel → unfinished measure → tool", () => {
    let s = run([
      { type: "tool", tool: "measure" },
      { type: "measure-add", point: P1 },
      { type: "panel", panel: "legend" },
    ]);
    s = mapUiReducer(s, { type: "escape" });
    expect(s.panel).toBeNull();
    expect(s.tool).toBe("measure");
    s = mapUiReducer(s, { type: "escape" });
    expect(s.measure.finished).toBe(true);
    s = mapUiReducer(s, { type: "escape" });
    expect(s.tool).toBe("none");
    expect(mapUiReducer(s, { type: "escape" })).toBe(s);
  });

  it("clampRadiusKm rounds to 0.1 and handles NaN", () => {
    expect(clampRadiusKm(2.345)).toBe(2.3);
    expect(clampRadiusKm(Number.NaN)).toBe(CATCHMENT_DEFAULT_KM);
  });
});
