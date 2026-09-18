/**
 * Inline MapLibre style for the network map (never a remote style.json: our own layers keep
 * rendering when tiles are unreachable). No glyphs/sprites: texts are HTML markers.
 * All paint colours come from `@/lib/network/theme`.
 */
import type {
  DataDrivenPropertyValueSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

import { HEATMAP_RAMP } from "@/lib/network/overlays";
import { BASEMAP_PAINT, MAP_COLORS, MAP_OPACITY } from "@/lib/network/theme";

export type BasemapId = "sombre" | "clair" | "satellite";

export const ATTRIBUTION_OSM =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
export const ATTRIBUTION_CARTO =
  '© <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
export const ATTRIBUTION_ESRI =
  '© <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics';
export const ATTRIBUTION_ESRI_CANVAS =
  '© <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a>, HERE, Garmin';

/**
 * CARTO raster basemaps now require an API key (without one every tile carries an « API KEY
 * REQUIRED » watermark). Set NEXT_PUBLIC_CARTO_API_KEY at build time to use the spec CARTO
 * basemaps; otherwise the keyless Esri Canvas grey basemaps are used for Sombre/Clair.
 */
export const CARTO_API_KEY: string | null = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim() || null;

export interface BasemapMeta {
  id: BasemapId;
  label: string;
  description: string;
}

export const BASEMAPS: readonly BasemapMeta[] = [
  { id: "sombre", label: "Sombre", description: "Fond sombre, idéal pour lire les Porteurs" },
  { id: "clair", label: "Clair", description: "Fond clair, rues et quartiers lisibles" },
  { id: "satellite", label: "Satellite", description: "Imagerie satellite avec étiquettes" },
];

export function isBasemapId(value: unknown): value is BasemapId {
  return value === "sombre" || value === "clair" || value === "satellite";
}

const cartoTiles = (variant: string, key: string | null) =>
  ["a", "b", "c", "d"].map(
    (s) =>
      `https://${s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}@2x.png${key ? `?key=${encodeURIComponent(key)}` : ""}`,
  );

const esriTiles = (service: string) => [
  `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`,
];

export const MAP_SOURCE_IDS = {
  sombre: "basemap-sombre",
  clair: "basemap-clair",
  satellite: "basemap-satellite",
  satelliteLabels: "basemap-satellite-labels",
  zones: "zelqane-zones",
  cones: "zelqane-cones",
  extrusions: "zelqane-extrusions",
  catchment: "zelqane-catchment",
  measure: "zelqane-measure",
  /** Round 2 (docs/round2-contract.md §4.8). */
  polygons: "zelqane-polygons",
  polygonDraft: "zelqane-polygon-draft",
  heatmap: "zelqane-heatmap",
} as const;

export const MAP_LAYER_IDS = {
  background: "background",
  sombre: "basemap-sombre",
  clair: "basemap-clair",
  satellite: "basemap-satellite",
  satelliteLabels: "basemap-satellite-labels",
  zonesFill: "zones-fill",
  zonesLine: "zones-line",
  zonesLineSelected: "zones-line-selected",
  catchmentFill: "catchment-fill",
  catchmentLine: "catchment-line",
  conesFill: "cones-fill",
  conesLine: "cones-line",
  extrusions: "porteurs-extrusions",
  measureHalo: "measure-halo",
  measureLine: "measure-line",
  measureVertices: "measure-vertices",
  heatmap: "heatmap-density",
  heatmapPoints: "heatmap-points",
  polygonsFill: "polygons-fill",
  polygonsLine: "polygons-line",
  polygonDraftFill: "polygon-draft-fill",
  polygonDraftLine: "polygon-draft-line",
  polygonDraftVertices: "polygon-draft-vertices",
} as const;

export type MapLayerId = (typeof MAP_LAYER_IDS)[keyof typeof MAP_LAYER_IDS];

const EMPTY_GEOJSON = { type: "FeatureCollection" as const, features: [] };

export interface MapStyleOptions {
  /** CARTO API key; null → keyless Esri Canvas basemaps. Defaults to NEXT_PUBLIC_CARTO_API_KEY. */
  cartoKey?: string | null;
}

export function buildMapStyle(
  basemap: BasemapId = "sombre",
  { cartoKey = CARTO_API_KEY }: MapStyleOptions = {},
): StyleSpecification {
  const vis = (id: BasemapId) => (id === basemap ? "visible" : "none");
  const carto = cartoKey !== null && cartoKey !== "";
  const cartoAttribution = `${ATTRIBUTION_OSM} ${ATTRIBUTION_CARTO}`;
  const canvasAttribution = `${ATTRIBUTION_ESRI_CANVAS}, ${ATTRIBUTION_OSM}`;
  return {
    version: 8,
    name: "ZELQANE réseau",
    sources: {
      [MAP_SOURCE_IDS.sombre]: {
        type: "raster",
        tiles: carto ? cartoTiles("dark_all", cartoKey) : esriTiles("Canvas/World_Dark_Gray_Base"),
        tileSize: 256,
        maxzoom: carto ? 20 : 16,
        attribution: carto ? cartoAttribution : canvasAttribution,
      },
      [MAP_SOURCE_IDS.clair]: {
        type: "raster",
        tiles: carto
          ? cartoTiles("light_all", cartoKey)
          : esriTiles("Canvas/World_Light_Gray_Base"),
        tileSize: 256,
        maxzoom: carto ? 20 : 16,
        attribution: carto ? cartoAttribution : canvasAttribution,
      },
      [MAP_SOURCE_IDS.satellite]: {
        type: "raster",
        tiles: esriTiles("World_Imagery"),
        tileSize: 256,
        maxzoom: 19,
        attribution: ATTRIBUTION_ESRI,
      },
      [MAP_SOURCE_IDS.satelliteLabels]: {
        type: "raster",
        tiles: carto
          ? cartoTiles("dark_only_labels", cartoKey)
          : esriTiles("Reference/World_Boundaries_and_Places"),
        tileSize: 256,
        maxzoom: carto ? 20 : 16,
        attribution: carto ? cartoAttribution : ATTRIBUTION_ESRI_CANVAS,
      },
      [MAP_SOURCE_IDS.zones]: { type: "geojson", data: EMPTY_GEOJSON },
      [MAP_SOURCE_IDS.cones]: { type: "geojson", data: EMPTY_GEOJSON },
      [MAP_SOURCE_IDS.extrusions]: { type: "geojson", data: EMPTY_GEOJSON },
      [MAP_SOURCE_IDS.catchment]: { type: "geojson", data: EMPTY_GEOJSON },
      [MAP_SOURCE_IDS.measure]: { type: "geojson", data: EMPTY_GEOJSON },
      [MAP_SOURCE_IDS.polygons]: { type: "geojson", data: EMPTY_GEOJSON },
      [MAP_SOURCE_IDS.polygonDraft]: { type: "geojson", data: EMPTY_GEOJSON },
      [MAP_SOURCE_IDS.heatmap]: { type: "geojson", data: EMPTY_GEOJSON },
    },
    layers: [
      {
        id: MAP_LAYER_IDS.background,
        type: "background",
        paint: { "background-color": MAP_COLORS.background },
      },
      {
        id: MAP_LAYER_IDS.sombre,
        type: "raster",
        source: MAP_SOURCE_IDS.sombre,
        layout: { visibility: vis("sombre") },
        paint: { ...BASEMAP_PAINT.dark },
      },
      {
        id: MAP_LAYER_IDS.clair,
        type: "raster",
        source: MAP_SOURCE_IDS.clair,
        layout: { visibility: vis("clair") },
        paint: { ...BASEMAP_PAINT.light },
      },
      {
        id: MAP_LAYER_IDS.satellite,
        type: "raster",
        source: MAP_SOURCE_IDS.satellite,
        layout: { visibility: vis("satellite") },
        paint: { ...BASEMAP_PAINT.satellite },
      },
      {
        id: MAP_LAYER_IDS.satelliteLabels,
        type: "raster",
        source: MAP_SOURCE_IDS.satelliteLabels,
        layout: { visibility: vis("satellite") },
        paint: { "raster-opacity": 0.95 },
      },
      ...overlayLayers(),
    ],
  };
}

/** `tone` → colour (same tokens as the zone circles). */
const polygonColor = (): DataDrivenPropertyValueSpecification<string> => [
  "match",
  ["get", "tone"],
  "urgent",
  MAP_COLORS.typeC,
  "muted",
  MAP_COLORS.zoneInactive,
  MAP_COLORS.zoneLine,
];

/** ZELQANE overlay layers, bottom → top. */
export function overlayLayers(): LayerSpecification[] {
  return [
    {
      id: MAP_LAYER_IDS.heatmap,
      type: "heatmap",
      source: MAP_SOURCE_IDS.heatmap,
      paint: {
        "heatmap-weight": ["get", "w"],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 6, 0.8, 14, 1.6],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 6, 12, 14, 40],
        "heatmap-opacity": 0.75,
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          ...HEATMAP_RAMP.flatMap(([stop, color]) => [stop, color]),
        ],
      },
    },
    {
      id: MAP_LAYER_IDS.heatmapPoints,
      type: "circle",
      source: MAP_SOURCE_IDS.heatmap,
      minzoom: 13,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["get", "w"], 0, 4, 1, 14],
        "circle-color": [
          "interpolate",
          ["linear"],
          ["get", "w"],
          ...HEATMAP_RAMP.flatMap(([stop, color]) => [stop, color]),
        ],
        "circle-opacity": 0.85,
        "circle-stroke-color": MAP_COLORS.background,
        "circle-stroke-width": 1,
      },
    },
    {
      id: MAP_LAYER_IDS.zonesFill,
      type: "fill",
      source: MAP_SOURCE_IDS.zones,
      paint: {
        "fill-color": [
          "case",
          ["get", "selected"],
          MAP_COLORS.zoneSelected,
          ["get", "active"],
          MAP_COLORS.zoneFill,
          MAP_COLORS.zoneInactive,
        ],
        "fill-opacity": [
          "case",
          ["get", "selected"],
          MAP_OPACITY.zoneFillSelected,
          MAP_OPACITY.zoneFill,
        ],
      },
    },
    {
      id: MAP_LAYER_IDS.zonesLine,
      type: "line",
      source: MAP_SOURCE_IDS.zones,
      filter: ["!", ["get", "selected"]],
      layout: { "line-join": "round" },
      paint: {
        "line-color": ["case", ["get", "active"], MAP_COLORS.zoneLine, MAP_COLORS.zoneInactive],
        "line-opacity": MAP_OPACITY.zoneLine,
        "line-width": ["case", ["get", "focused"], 2.4, 1.4],
        "line-dasharray": [2, 1.6],
      },
    },
    {
      id: MAP_LAYER_IDS.zonesLineSelected,
      type: "line",
      source: MAP_SOURCE_IDS.zones,
      filter: ["get", "selected"],
      layout: { "line-join": "round" },
      paint: { "line-color": MAP_COLORS.zoneSelected, "line-width": 2.2, "line-opacity": 0.95 },
    },
    {
      id: MAP_LAYER_IDS.catchmentFill,
      type: "fill",
      source: MAP_SOURCE_IDS.catchment,
      paint: { "fill-color": MAP_COLORS.catchment, "fill-opacity": MAP_OPACITY.catchmentFill },
    },
    {
      id: MAP_LAYER_IDS.catchmentLine,
      type: "line",
      source: MAP_SOURCE_IDS.catchment,
      paint: {
        "line-color": MAP_COLORS.catchment,
        "line-width": 2,
        "line-dasharray": [3, 2],
      },
    },
    {
      id: MAP_LAYER_IDS.conesFill,
      type: "fill",
      source: MAP_SOURCE_IDS.cones,
      minzoom: 11,
      paint: {
        "fill-color": [
          "case",
          ["get", "selected"],
          MAP_COLORS.selected,
          [
            "match",
            ["get", "type"],
            "A",
            MAP_COLORS.typeA,
            "B",
            MAP_COLORS.typeB,
            "C",
            MAP_COLORS.typeC,
            MAP_COLORS.typeD,
          ],
        ],
        "fill-opacity": ["case", ["get", "selected"], MAP_OPACITY.coneSelected, MAP_OPACITY.cone],
      },
    },
    {
      id: MAP_LAYER_IDS.conesLine,
      type: "line",
      source: MAP_SOURCE_IDS.cones,
      minzoom: 11,
      paint: {
        "line-color": [
          "case",
          ["get", "selected"],
          MAP_COLORS.selected,
          [
            "match",
            ["get", "type"],
            "A",
            MAP_COLORS.typeA,
            "B",
            MAP_COLORS.typeB,
            "C",
            MAP_COLORS.typeC,
            MAP_COLORS.typeD,
          ],
        ],
        "line-width": 1,
        "line-opacity": 0.55,
      },
    },
    {
      id: MAP_LAYER_IDS.extrusions,
      type: "fill-extrusion",
      source: MAP_SOURCE_IDS.extrusions,
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": [
          "case",
          ["get", "selected"],
          MAP_COLORS.selected,
          [
            "match",
            ["get", "status"],
            "ACTIF",
            MAP_COLORS.statusActif,
            "MAINTENANCE",
            MAP_COLORS.statusMaintenance,
            "HORS_LIGNE",
            MAP_COLORS.statusHorsLigne,
            MAP_COLORS.statusInactif,
          ],
        ],
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": ["get", "base"],
        "fill-extrusion-opacity": MAP_OPACITY.extrusion,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    {
      id: MAP_LAYER_IDS.measureHalo,
      type: "line",
      source: MAP_SOURCE_IDS.measure,
      filter: ["==", ["get", "kind"], "line"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": MAP_COLORS.measureHalo, "line-width": 6, "line-opacity": 0.7 },
    },
    {
      id: MAP_LAYER_IDS.measureLine,
      type: "line",
      source: MAP_SOURCE_IDS.measure,
      filter: ["==", ["get", "kind"], "line"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": MAP_COLORS.measure, "line-width": 2.5 },
    },
    {
      id: MAP_LAYER_IDS.polygonsFill,
      type: "fill",
      source: MAP_SOURCE_IDS.polygons,
      paint: {
        "fill-color": polygonColor(),
        "fill-opacity": ["case", ["get", "active"], MAP_OPACITY.zoneFillSelected, MAP_OPACITY.zoneFill],
      },
    },
    {
      id: MAP_LAYER_IDS.polygonsLine,
      type: "line",
      source: MAP_SOURCE_IDS.polygons,
      layout: { "line-join": "round" },
      paint: {
        "line-color": polygonColor(),
        "line-width": ["case", ["get", "active"], 2.4, 1.4],
        "line-opacity": MAP_OPACITY.zoneLine,
      },
    },
    {
      id: MAP_LAYER_IDS.polygonDraftFill,
      type: "fill",
      source: MAP_SOURCE_IDS.polygonDraft,
      filter: ["==", ["get", "kind"], "fill"],
      paint: { "fill-color": MAP_COLORS.selected, "fill-opacity": MAP_OPACITY.zoneFillSelected },
    },
    {
      id: MAP_LAYER_IDS.polygonDraftLine,
      type: "line",
      source: MAP_SOURCE_IDS.polygonDraft,
      filter: ["==", ["get", "kind"], "line"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": MAP_COLORS.selected, "line-width": 2.2, "line-dasharray": [2, 1.4] },
    },
    {
      id: MAP_LAYER_IDS.polygonDraftVertices,
      type: "circle",
      source: MAP_SOURCE_IDS.polygonDraft,
      filter: ["==", ["get", "kind"], "vertex"],
      paint: {
        "circle-radius": ["case", ["get", "first"], 7, 5],
        "circle-color": ["case", ["get", "first"], MAP_COLORS.zoneLine, MAP_COLORS.selected],
        "circle-stroke-color": MAP_COLORS.background,
        "circle-stroke-width": 2,
      },
    },
    {
      id: MAP_LAYER_IDS.measureVertices,
      type: "circle",
      source: MAP_SOURCE_IDS.measure,
      filter: ["==", ["get", "kind"], "vertex"],
      paint: {
        "circle-radius": 4.5,
        "circle-color": MAP_COLORS.measure,
        "circle-stroke-color": MAP_COLORS.measureHalo,
        "circle-stroke-width": 2,
      },
    },
  ];
}

export interface MapLayerToggles {
  zones: boolean;
  porteurs: boolean;
  orientations: boolean;
  etiquettes: boolean;
}

export const DEFAULT_LAYER_TOGGLES: MapLayerToggles = {
  zones: true,
  porteurs: true,
  orientations: true,
  etiquettes: true,
};

export const LAYER_TOGGLE_LABELS: Record<keyof MapLayerToggles, string> = {
  zones: "Zones",
  porteurs: "Porteurs",
  orientations: "Orientations des écrans",
  etiquettes: "Étiquettes",
};

export type ViewMode = "2d" | "3d";

/** Layout visibility for every style layer given the basemap, toggles and 2D/3D view. */
export function layerVisibility(
  basemap: BasemapId,
  toggles: MapLayerToggles,
  viewMode: ViewMode,
): Record<MapLayerId, "visible" | "none"> {
  const v = (on: boolean) => (on ? "visible" : "none");
  return {
    [MAP_LAYER_IDS.background]: "visible",
    [MAP_LAYER_IDS.sombre]: v(basemap === "sombre"),
    [MAP_LAYER_IDS.clair]: v(basemap === "clair"),
    [MAP_LAYER_IDS.satellite]: v(basemap === "satellite"),
    [MAP_LAYER_IDS.satelliteLabels]: v(basemap === "satellite" && toggles.etiquettes),
    [MAP_LAYER_IDS.zonesFill]: v(toggles.zones),
    [MAP_LAYER_IDS.zonesLine]: v(toggles.zones),
    [MAP_LAYER_IDS.zonesLineSelected]: v(toggles.zones),
    [MAP_LAYER_IDS.catchmentFill]: "visible",
    [MAP_LAYER_IDS.catchmentLine]: "visible",
    [MAP_LAYER_IDS.conesFill]: v(toggles.orientations && toggles.porteurs),
    [MAP_LAYER_IDS.conesLine]: v(toggles.orientations && toggles.porteurs),
    [MAP_LAYER_IDS.extrusions]: v(viewMode === "3d" && toggles.porteurs),
    [MAP_LAYER_IDS.measureHalo]: "visible",
    [MAP_LAYER_IDS.measureLine]: "visible",
    [MAP_LAYER_IDS.measureVertices]: "visible",
    [MAP_LAYER_IDS.heatmap]: "visible",
    [MAP_LAYER_IDS.heatmapPoints]: "visible",
    [MAP_LAYER_IDS.polygonsFill]: v(toggles.zones),
    [MAP_LAYER_IDS.polygonsLine]: v(toggles.zones),
    [MAP_LAYER_IDS.polygonDraftFill]: "visible",
    [MAP_LAYER_IDS.polygonDraftLine]: "visible",
    [MAP_LAYER_IDS.polygonDraftVertices]: "visible",
  };
}

/** Camera pitch per view mode. */
export const VIEW_PITCH: Record<ViewMode, number> = { "2d": 0, "3d": 60 };

/** French UI strings for MapLibre's built-in controls. */
export const MAPLIBRE_LOCALE_FR: Record<string, string> = {
  "AttributionControl.ToggleAttribution": "Afficher ou masquer les attributions",
  "AttributionControl.MapFeedback": "Signaler une erreur de carte",
  "FullscreenControl.Enter": "Plein écran",
  "FullscreenControl.Exit": "Quitter le plein écran",
  "GeolocateControl.FindMyLocation": "Ma position",
  "GeolocateControl.LocationNotAvailable": "Position indisponible",
  "LogoControl.Title": "Logo MapLibre",
  "Map.Title": "Carte interactive du réseau ZELQANE",
  "Marker.Title": "Repère",
  "NavigationControl.ResetBearing": "Réinitialiser l'orientation",
  "NavigationControl.ZoomIn": "Zoom avant",
  "NavigationControl.ZoomOut": "Zoom arrière",
  "Popup.Close": "Fermer",
  "ScaleControl.Feet": "ft",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
  "ScaleControl.Miles": "mi",
  "ScaleControl.NauticalMiles": "nm",
  "CooperativeGesturesHandler.WindowsHelpText": "Utilisez Ctrl + molette pour zoomer",
  "CooperativeGesturesHandler.MacHelpText": "Utilisez ⌘ + molette pour zoomer",
  "CooperativeGesturesHandler.MobileHelpText": "Utilisez deux doigts pour déplacer la carte",
};
