/**
 * Network map public API. Import from "@/components/map".
 * `NetworkMap` is the dynamic (ssr:false) entry point; the other exports are light, reusable
 * pieces (no MapLibre import) for pages that want the same list, card, legend or toolbar.
 */
export { NetworkMap } from "@/components/map/network-map";
export { NetworkMapSkeleton } from "@/components/map/network-map-skeleton";
export {
  AvailabilityLegend,
  HeatmapLegend,
  MapLegend,
  type MapLegendProps,
} from "@/components/map/map-legend";
export { PolygonVertexEditor } from "@/components/map/polygon-vertex-editor";
export {
  MapToolbar,
  MapToolButton,
  MapToolDivider,
  type MapToolbarProps,
  type MapToolButtonProps,
} from "@/components/map/map-toolbar";
export { MapPanel, type MapPanelProps } from "@/components/map/map-panel";
export { MapSearch, type MapSearchProps } from "@/components/map/map-search";
export { PorteurCard, type PorteurCardProps } from "@/components/map/porteur-card";
export {
  PorteurList,
  type PorteurListItem,
  type PorteurListProps,
} from "@/components/map/porteur-list";
export {
  ACCENT_BG_SOFT,
  TONE_BG,
  TONE_BG_SOFT,
  TONE_TEXT,
  ACCENT_TEXT,
  AVAILABILITY_DOT,
  AVAILABILITY_RING,
  PORTEUR_ICONS,
  STATUS_DOT,
  STATUS_RING,
} from "@/components/map/porteur-visuals";
export type {
  MapController,
  MaybeAsync,
  NetworkMapMode,
  NetworkMapProps,
} from "@/components/map/types";
