import type { AvailabilityStatus, SupportResponse, ZoneResponse } from "@/lib/api/types";
import type { SupportFilters } from "@/lib/network/filters";
import type { BBox, LngLat } from "@/lib/network/geo";
import type { BasemapId, ViewMode } from "@/lib/network/map-style";
import type { MapHeatmap, MapPolygon, PolygonDraft } from "@/lib/network/overlays";
import type { Selection } from "@/lib/network/selection";

import type { MapUiAction, MapUiState } from "@/components/map/map-ui-state";

export type NetworkMapMode = "explore" | "select" | "admin";

export type RecenterTarget = "porteurs" | "tunisie";

/** A callback may return a promise: the map keeps the pending visual state until it settles. */
export type MaybeAsync = void | Promise<unknown>;

export interface NetworkMapProps {
  zones: ZoneResponse[];
  supports: SupportResponse[];
  mode: NetworkMapMode;
  /** Controlled selection. Without it the map keeps an internal selection in select mode. */
  selection?: Selection;
  onSelectionChange?: (selection: Selection) => void;
  /** Fly to + pulse this Porteur whenever the value changes. */
  focusSupportId?: number | null;
  /** Click on a Porteur (explore/select/admin). */
  onOpenPorteur?: (supportId: number) => void;
  /** Admin: « Placer un Porteur » tool → click on the map. */
  onPlacePoint?: (lngLat: LngLat) => MaybeAsync;
  /** Admin: marker dragged. Marker stays at the drop point until the returned promise settles. */
  onMoveSupport?: (id: number, lngLat: LngLat) => MaybeAsync;
  /** Admin: radius handle released (km, 0.05 precision). */
  onZoneRadiusChange?: (zoneId: number, radiusKm: number) => MaybeAsync;
  height?: string;
  className?: string;

  // ---- Optional integration props (all additive) ----
  /** Admin: « Créer une zone » tool → click on the map. The tool is shown only when provided. */
  onCreateZoneAt?: (lngLat: LngLat) => MaybeAsync;
  /** Zone shown with a radius handle (admin) / highlighted. */
  activeZoneId?: number | null;
  /** Zone label/fill click (explore & admin; select mode toggles the zone first). */
  onZoneClick?: (zoneId: number) => void;
  /** Visual highlight driven by an external list (hover sync). */
  highlightSupportId?: number | null;
  /** Hover/focus on a marker (for list sync). */
  onHoverSupport?: (supportId: number | null) => void;
  /** Controlled basemap (`?fond=`). */
  basemap?: BasemapId;
  onBasemapChange?: (basemap: BasemapId) => void;
  /** Controlled 2D/3D view (`?vue=3d`). */
  viewMode?: ViewMode;
  onViewModeChange?: (viewMode: ViewMode) => void;
  /** Hide the built-in « Liste » tool when the page renders its own list. */
  showListTool?: boolean;
  /** Controlled Porteur filters (page-level filter bar synced with the map). */
  filters?: SupportFilters;
  /** Called when the map changes its filters (panel, reset, search). */
  onFiltersChange?: (filters: SupportFilters) => void;
  /** Controlled « Regrouper les Porteurs proches » (off by default: every Porteur individually). */
  clusterPorteurs?: boolean;
  onClusterPorteursChange?: (value: boolean) => void;
  /** Force the SVG fallback (tests, low-power mode). */
  forceFallback?: boolean;
  /** Accessible name of the map region. */
  ariaLabel?: string;
  /**
   * Plain map click (no tool active), e.g. a coordinate picker. When provided, clicks inside zone
   * circles also report the point instead of activating the zone, and the SVG fallback accepts
   * clicks on its frame.
   */
  onMapClick?: (lngLat: LngLat) => void;
  /** Fit this zone's circle whenever the value changes (« Localiser » a zone). */
  focusZoneId?: number | null;
  /** "compact" = zoom/recentre only (no search, filters, panels, counters): mini-map pickers. */
  chrome?: "full" | "compact";
  /**
   * Availability of Porteurs for a campaign window (contract §2.7): the marker ring and its
   * accessible name show this status instead of the technical status.
   */
  availability?: ReadonlyMap<number, AvailabilityStatus>;

  // ---- Round 2 (docs/round2-contract.md §4.8) ----
  /** Target polygons drawn as fill + line (SVG fallback: paths). */
  polygons?: readonly MapPolygon[];
  /**
   * Polygon being drawn. When provided, the toolbar shows « Dessiner un polygone »: click adds a
   * vertex, a click on the first vertex / a double-click / Entrée closes the ring, Retour arrière
   * removes the last vertex, Échap cancels, and a closed ring has draggable vertices.
   */
  polygonDraft?: PolygonDraft | null;
  onPolygonDraftChange?: (draft: PolygonDraft) => void;
  /** Density layer (weights are normalised by `maxWeight`; SVG fallback: proportional circles). */
  heatmap?: MapHeatmap | null;
}

/** Imperative camera API implemented by each engine. */
export interface MapController {
  kind: "webgl" | "svg";
  canZoom: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  /** « Recentrer » : every Porteur (default, falls back to Tunisia without Porteurs) or all of Tunisia. */
  resetView: (target?: RecenterTarget) => void;
  flyTo: (point: LngLat, zoom?: number) => void;
  fitBounds: (bbox: BBox, maxZoom?: number) => void;
  getCenter: () => LngLat;
}

/** Props shared by the MapLibre engine and the SVG fallback. */
export interface EngineProps {
  zones: ZoneResponse[];
  /** All supports (for lookups). */
  supports: SupportResponse[];
  /** Supports passing the filters. */
  visibleSupports: SupportResponse[];
  mode: NetworkMapMode;
  selection: Selection;
  ui: MapUiState;
  dispatch: (action: MapUiAction) => void;
  reducedMotion: boolean;
  activeZoneId: number | null;
  highlightSupportId: number | null;
  /** Porteur whose marker pulses (after focus/search). */
  pulseSupportId: number | null;
  /** Porteur whose mini card is open. */
  cardSupportId: number | null;
  setCardSupportId: (id: number | null) => void;
  userLocation: LngLat | null;
  canSelect: boolean;
  onMarkerActivate: (supportId: number) => void;
  onToggleSupport: (supportId: number) => void;
  onZoneActivate: (zoneId: number) => void;
  /** Count bubble activated (only when « Regrouper les Porteurs proches » is on). */
  onClusterActivate: (supportIds: number[], bbox: BBox) => void;
  onMapPoint: (point: LngLat) => void;
  onHoverSupport?: (supportId: number | null) => void;
  onOpenPorteur?: (supportId: number) => void;
  onMoveSupport?: (id: number, lngLat: LngLat) => MaybeAsync;
  onZoneRadiusChange?: (zoneId: number, radiusKm: number) => MaybeAsync;
  onReady: (controller: MapController) => void;
  onFatalError: (error: unknown) => void;
  /** Every click reports a point (coordinate picker), zone hit-testing skipped. */
  pickPoints?: boolean;
  /** Map chrome (framing padding keeps Porteurs clear of the floating tools). */
  chrome?: "full" | "compact";
  availability?: ReadonlyMap<number, AvailabilityStatus>;
  polygons?: readonly MapPolygon[];
  polygonDraft?: PolygonDraft | null;
  /** Set by the map client: applies the draft edits of the engine (click, drag). */
  onDraftChange?: (draft: PolygonDraft) => void;
  heatmap?: MapHeatmap | null;
}
