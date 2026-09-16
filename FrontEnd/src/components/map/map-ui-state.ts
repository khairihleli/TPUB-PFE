/**
 * Pure reducer for the map chrome: basemap, layers, 2D/3D, filters, active tool and panels.
 * Kept free of React/MapLibre so it is unit-tested directly.
 */
import { DEFAULT_FILTERS, type SupportFilters } from "@/lib/network/filters";
import { DEFAULT_CLUSTER_PORTEURS } from "@/lib/network/geojson";
import { type LngLat } from "@/lib/network/geo";
import {
  DEFAULT_LAYER_TOGGLES,
  type BasemapId,
  type MapLayerToggles,
  type ViewMode,
} from "@/lib/network/map-style";

export type MapTool = "none" | "measure" | "catchment" | "place" | "zone";
export type MapPanelId = "basemap" | "layers" | "filters" | "legend" | "list" | "tools";

export const CATCHMENT_MIN_KM = 0.2;
export const CATCHMENT_MAX_KM = 20;
export const CATCHMENT_DEFAULT_KM = 1;
export const CATCHMENT_PRESETS_KM = [0.5, 1, 2, 5, 10] as const;

export interface MapUiState {
  basemap: BasemapId;
  viewMode: ViewMode;
  layers: MapLayerToggles;
  filters: SupportFilters;
  /** « Regrouper les Porteurs proches » (opt-in): count bubbles below zoom 9. */
  clusterPorteurs: boolean;
  tool: MapTool;
  panel: MapPanelId | null;
  measure: { points: LngLat[]; finished: boolean };
  catchment: { center: LngLat | null; radiusKm: number };
  /** Restricts the « Liste » panel to these ids (group opened in the fallback). */
  listScope: number[] | null;
}

export type MapUiAction =
  | { type: "basemap"; basemap: BasemapId }
  | { type: "view"; viewMode: ViewMode }
  | { type: "layer"; layer: keyof MapLayerToggles; value?: boolean }
  | { type: "filters"; filters: SupportFilters }
  | { type: "cluster"; value?: boolean }
  | { type: "reset-filters" }
  | { type: "tool"; tool: MapTool }
  | { type: "panel"; panel: MapPanelId | null; listScope?: number[] | null }
  | { type: "measure-add"; point: LngLat }
  | { type: "measure-undo" }
  | { type: "measure-finish" }
  | { type: "measure-clear" }
  | { type: "catchment-center"; center: LngLat | null }
  | { type: "catchment-radius"; radiusKm: number }
  | { type: "escape" };

export function createMapUiState(
  init: Partial<Pick<MapUiState, "basemap" | "viewMode" | "clusterPorteurs">> = {},
): MapUiState {
  return {
    basemap: init.basemap ?? "sombre",
    viewMode: init.viewMode ?? "2d",
    layers: { ...DEFAULT_LAYER_TOGGLES },
    filters: { ...DEFAULT_FILTERS, types: [], statuses: [] },
    clusterPorteurs: init.clusterPorteurs ?? DEFAULT_CLUSTER_PORTEURS,
    tool: "none",
    panel: null,
    measure: { points: [], finished: false },
    catchment: { center: null, radiusKm: CATCHMENT_DEFAULT_KM },
    listScope: null,
  };
}

export function clampRadiusKm(km: number): number {
  if (!Number.isFinite(km)) return CATCHMENT_DEFAULT_KM;
  const clamped = Math.min(CATCHMENT_MAX_KM, Math.max(CATCHMENT_MIN_KM, km));
  return Math.round(clamped * 10) / 10;
}

const EMPTY_MEASURE = { points: [], finished: false };

export function mapUiReducer(state: MapUiState, action: MapUiAction): MapUiState {
  switch (action.type) {
    case "basemap":
      return state.basemap === action.basemap ? state : { ...state, basemap: action.basemap };
    case "view":
      return state.viewMode === action.viewMode ? state : { ...state, viewMode: action.viewMode };
    case "layer": {
      const value = action.value ?? !state.layers[action.layer];
      if (state.layers[action.layer] === value) return state;
      return { ...state, layers: { ...state.layers, [action.layer]: value } };
    }
    case "filters":
      return { ...state, filters: action.filters };
    case "cluster": {
      const value = action.value ?? !state.clusterPorteurs;
      return value === state.clusterPorteurs ? state : { ...state, clusterPorteurs: value };
    }
    case "reset-filters":
      return { ...state, filters: { ...DEFAULT_FILTERS, types: [], statuses: [] } };
    case "tool": {
      // selecting the active tool again turns it off
      const tool = state.tool === action.tool ? "none" : action.tool;
      return {
        ...state,
        tool,
        panel: state.panel === "tools" ? null : state.panel,
        measure: tool === "measure" ? state.measure : EMPTY_MEASURE,
        catchment:
          tool === "catchment"
            ? state.catchment
            : { center: null, radiusKm: state.catchment.radiusKm },
      };
    }
    case "panel": {
      const panel = state.panel === action.panel ? null : action.panel;
      return {
        ...state,
        panel,
        listScope: panel === "list" ? (action.listScope ?? null) : null,
      };
    }
    case "measure-add":
      if (state.tool !== "measure") return state;
      if (state.measure.finished) {
        return { ...state, measure: { points: [action.point], finished: false } };
      }
      return {
        ...state,
        measure: { points: [...state.measure.points, action.point], finished: false },
      };
    case "measure-undo":
      if (state.measure.points.length === 0) return state;
      return {
        ...state,
        measure: { points: state.measure.points.slice(0, -1), finished: false },
      };
    case "measure-finish":
      if (state.measure.points.length === 0 || state.measure.finished) return state;
      return { ...state, measure: { ...state.measure, finished: true } };
    case "measure-clear":
      return { ...state, measure: EMPTY_MEASURE };
    case "catchment-center":
      return { ...state, catchment: { ...state.catchment, center: action.center } };
    case "catchment-radius":
      return {
        ...state,
        catchment: { ...state.catchment, radiusKm: clampRadiusKm(action.radiusKm) },
      };
    case "escape":
      if (state.panel !== null) return { ...state, panel: null, listScope: null };
      if (state.tool === "measure" && state.measure.points.length > 0 && !state.measure.finished) {
        return { ...state, measure: { ...state.measure, finished: true } };
      }
      if (state.tool !== "none") return mapUiReducer(state, { type: "tool", tool: state.tool });
      return state;
  }
}
