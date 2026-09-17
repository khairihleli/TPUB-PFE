"use client";

import "@/components/map/network-map.css";

import {
  BookOpen,
  Box,
  CircleDashed,
  CirclePlus,
  Crosshair,
  Earth,
  Layers,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPinPlus,
  Maximize,
  Menu,
  Minimize,
  Minus,
  Plus,
  PenTool,
  Ruler,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  type RefObject,
} from "react";

import type { SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  displayedCountLabel,
  filterSupports,
  hiddenByFiltersLabel,
  type SearchResult,
  type SupportFilters,
} from "@/lib/network/filters";
import {
  bboxContains,
  circleBBox,
  isValidLngLat,
  TUNISIA_BOUNDS,
  type BBox,
  type LngLat,
} from "@/lib/network/geo";
import type { BasemapId, ViewMode } from "@/lib/network/map-style";
import { resolvePorteurType } from "@/lib/network/porteur";
import {
  EMPTY_SELECTION,
  normalizeSelection,
  selectWithinRadius,
  toggleSupport,
  toggleZone,
  type Selection,
} from "@/lib/network/selection";
import {
  addDraftVertex,
  closeDraft,
  draftStatus,
  EMPTY_POLYGON_DRAFT,
  removeLastDraftVertex,
  type PolygonDraft,
} from "@/lib/network/overlays";
import { useReducedMotion } from "@/lib/use-reduced-motion";

import { MapLegend } from "@/components/map/map-legend";
import { MapPanel } from "@/components/map/map-panel";
import { MapSearch } from "@/components/map/map-search";
import { BasemapPanel, FiltersPanel, LayersPanel } from "@/components/map/map-settings-panels";
import { CatchmentPanel, MeasurePanel } from "@/components/map/map-tool-panels";
import { MapToolbar, MapToolButton, MapToolDivider } from "@/components/map/map-toolbar";
import {
  createMapUiState,
  mapUiReducer,
  type MapPanelId,
  type MapTool,
} from "@/components/map/map-ui-state";
import { NetworkMapFallback } from "@/components/map/network-map-fallback";
import { NetworkMapSkeleton } from "@/components/map/network-map-skeleton";
import { PorteurList } from "@/components/map/porteur-list";
import type {
  EngineProps,
  MapController,
  NetworkMapProps,
  RecenterTarget,
} from "@/components/map/types";
import { detectWebGL } from "@/components/map/webgl";

const MapLibreView = lazy(() =>
  import("@/components/map/maplibre-view").then((m) => ({ default: m.MapLibreView })),
);

const PULSE_MS = 4300;

class EngineErrorBoundary extends Component<
  { onError(error: unknown): void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown, _info: ErrorInfo) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  const supported =
    typeof document !== "undefined" &&
    typeof document.documentElement.requestFullscreen === "function";
  useEffect(() => {
    const onChange = () =>
      setActive(document.fullscreenElement === target.current && target.current !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [target]);
  const toggle = useCallback(() => {
    if (!target.current) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void target.current.requestFullscreen().catch(() => undefined);
  }, [target]);
  return { supported, active, toggle };
}

/**
 * The network map (client-only). Chooses the MapLibre engine when WebGL works, otherwise the
 * accessible SVG fallback. Import `NetworkMap` from `@/components/map` (dynamic, ssr:false).
 */
export function NetworkMapClient(props: NetworkMapProps) {
  const {
    zones,
    supports,
    mode,
    onSelectionChange,
    focusSupportId = null,
    onOpenPorteur,
    onPlacePoint,
    onMoveSupport,
    onZoneRadiusChange,
    onCreateZoneAt,
    activeZoneId = null,
    onZoneClick,
    highlightSupportId = null,
    onHoverSupport,
    onBasemapChange,
    onViewModeChange,
    showListTool = true,
    forceFallback = false,
    ariaLabel = "Carte du réseau TPUB",
    onMapClick,
    focusZoneId = null,
    chrome = "full",
    availability,
    polygons,
    polygonDraft = null,
    onPolygonDraftChange,
    heatmap = null,
    height,
    className,
  } = props;
  const canDrawPolygon = polygonDraft !== null && onPolygonDraftChange !== undefined;

  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | null>(null);
  const [engine, setEngine] = useState<"webgl" | "svg">(() =>
    forceFallback || !detectWebGL() ? "svg" : "webgl",
  );
  const [controllerKind, setControllerKind] = useState<MapController["kind"] | null>(null);
  const [ui, dispatch] = useReducer(mapUiReducer, undefined, () =>
    createMapUiState({
      basemap: props.basemap,
      viewMode: props.viewMode,
      clusterPorteurs: props.clusterPorteurs,
    }),
  );
  const [cardSupportId, setCardSupportId] = useState<number | null>(null);
  const [pulseSupportId, setPulseSupportId] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [internalSelection, setInternalSelection] = useState<Selection>(EMPTY_SELECTION);
  const fullscreen = useFullscreen(rootRef);

  const selection = useMemo(
    () => normalizeSelection(props.selection ?? internalSelection),
    [props.selection, internalSelection],
  );
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const visibleSupports = useMemo(
    () => filterSupports(supports, ui.filters),
    [supports, ui.filters],
  );
  const canSelect = mode === "select";

  const announce = useCallback((message: string) => {
    // re-announce identical messages
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 30);
  }, []);

  // ---- controlled basemap / view -------------------------------------------------------
  useEffect(() => {
    if (props.basemap) dispatch({ type: "basemap", basemap: props.basemap });
  }, [props.basemap]);
  useEffect(() => {
    if (props.viewMode) dispatch({ type: "view", viewMode: props.viewMode });
  }, [props.viewMode]);
  // controlled filters (additive): the page's filter bar and the map panel stay in sync
  useEffect(() => {
    if (props.filters) dispatch({ type: "filters", filters: props.filters });
  }, [props.filters]);
  useEffect(() => {
    if (props.clusterPorteurs !== undefined) {
      dispatch({ type: "cluster", value: props.clusterPorteurs });
    }
  }, [props.clusterPorteurs]);
  const onFiltersChange = props.onFiltersChange;
  const setFilters = useCallback(
    (filters: SupportFilters) => {
      const next = { ...filters, types: [...filters.types], statuses: [...filters.statuses] };
      dispatch({ type: "filters", filters: next });
      onFiltersChange?.(next);
    },
    [onFiltersChange],
  );

  const onClusterPorteursChange = props.onClusterPorteursChange;
  const setClusterPorteurs = (value: boolean) => {
    dispatch({ type: "cluster", value });
    onClusterPorteursChange?.(value);
    announce(
      value
        ? "Porteurs proches regroupés en dessous du zoom 9."
        : "Chaque Porteur est affiché individuellement à sa position exacte.",
    );
  };

  const recenter = (target: RecenterTarget) => {
    controllerRef.current?.resetView(target);
    announce(
      target === "tunisie"
        ? "Vue recentrée sur toute la Tunisie."
        : "Vue recentrée sur tous les Porteurs.",
    );
  };

  const setBasemap = (basemap: BasemapId) => {
    dispatch({ type: "basemap", basemap });
    onBasemapChange?.(basemap);
  };
  const setViewMode = (viewMode: ViewMode) => {
    dispatch({ type: "view", viewMode });
    onViewModeChange?.(viewMode);
    announce(viewMode === "3d" ? "Vue 3D activée" : "Vue 2D activée");
  };

  // ---- selection -------------------------------------------------------------------------
  const commitSelection = useCallback(
    (next: Selection) => {
      if (next === selectionRef.current) return;
      if (props.selection === undefined) setInternalSelection(next);
      onSelectionChange?.(next);
    },
    [props.selection, onSelectionChange],
  );

  const onToggleSupport = useCallback(
    (supportId: number) => {
      const before = selectionRef.current;
      const next = toggleSupport(before, supportId, supports);
      const s = supports.find((x) => x.id === supportId);
      if (next === before) {
        announce("Ce Porteur n'est pas réservable.");
        return;
      }
      commitSelection(next);
      if (s) {
        announce(
          next.supportIds.includes(supportId)
            ? `${s.name} ajouté à la sélection`
            : `${s.name} retiré de la sélection`,
        );
      }
    },
    [supports, commitSelection, announce],
  );

  // ---- camera helpers -----------------------------------------------------------------
  const pulse = useCallback((id: number) => {
    setPulseSupportId(id);
  }, []);
  useEffect(() => {
    if (pulseSupportId === null) return;
    const t = window.setTimeout(() => setPulseSupportId(null), PULSE_MS);
    return () => window.clearTimeout(t);
  }, [pulseSupportId]);

  const locateSupport = useCallback(
    (supportId: number, openCard = true) => {
      const s = supports.find((x) => x.id === supportId);
      if (!s) return;
      controllerRef.current?.flyTo({ lng: s.longitude, lat: s.latitude }, 15);
      if (!reducedMotion) pulse(supportId);
      if (openCard) setCardSupportId(supportId);
    },
    [supports, reducedMotion, pulse],
  );

  useEffect(() => {
    if (focusSupportId === null || controllerKind === null) return;
    locateSupport(focusSupportId, false);
  }, [focusSupportId, controllerKind, locateSupport]);

  useEffect(() => {
    if (focusZoneId === null || controllerKind === null) return;
    const zone = zones.find((z) => z.id === focusZoneId);
    if (!zone) return;
    controllerRef.current?.fitBounds(
      circleBBox({ lng: zone.longitude, lat: zone.latitude }, zone.radiusKm ?? 1),
      14,
    );
    // zones intentionally omitted: refit only when the requested zone changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusZoneId, controllerKind]);

  // ---- engine callbacks ----------------------------------------------------------------
  const onMarkerActivate = useCallback(
    (supportId: number) => {
      const s = supports.find((x) => x.id === supportId);
      if (!s) return;
      if (ui.tool === "measure") {
        dispatch({ type: "measure-add", point: { lng: s.longitude, lat: s.latitude } });
        return;
      }
      if (ui.tool === "catchment") {
        dispatch({ type: "catchment-center", center: { lng: s.longitude, lat: s.latitude } });
        return;
      }
      if (onOpenPorteur) onOpenPorteur(supportId);
      else if (canSelect) onToggleSupport(supportId);
      else setCardSupportId((id) => (id === supportId ? null : supportId));
    },
    [supports, ui.tool, onOpenPorteur, canSelect, onToggleSupport],
  );

  const onZoneActivate = useCallback(
    (zoneId: number) => {
      const zone = zones.find((z) => z.id === zoneId);
      if (!zone) return;
      if (canSelect) {
        const next = toggleZone(selectionRef.current, zoneId, supports);
        commitSelection(next);
        announce(
          next.zoneIds.includes(zoneId)
            ? `Zone ${zone.name} sélectionnée avec ses Porteurs réservables`
            : `Zone ${zone.name} retirée de la sélection`,
        );
      } else {
        controllerRef.current?.fitBounds(
          circleBBox({ lng: zone.longitude, lat: zone.latitude }, zone.radiusKm ?? 1),
          14,
        );
      }
      onZoneClick?.(zoneId);
    },
    [zones, supports, canSelect, commitSelection, announce, onZoneClick],
  );

  const onClusterActivate = useCallback((supportIds: number[], bbox: BBox) => {
    if (controllerRef.current?.kind === "webgl") {
      controllerRef.current.fitBounds(bbox, 12);
    } else {
      dispatch({ type: "panel", panel: "list", listScope: supportIds });
    }
  }, []);

  const runPlace = useCallback(
    (tool: MapTool, point: LngLat) => {
      dispatch({ type: "tool", tool });
      if (tool === "place") {
        announce("Position choisie pour le nouveau Porteur.");
        void onPlacePoint?.(point);
      } else {
        announce("Position choisie pour la nouvelle zone.");
        void onCreateZoneAt?.(point);
      }
    },
    [onPlacePoint, onCreateZoneAt, announce],
  );

  const applyDraft = useCallback(
    (next: PolygonDraft) => {
      if (next !== polygonDraft) onPolygonDraftChange?.(next);
    },
    [polygonDraft, onPolygonDraftChange],
  );

  const onMapPoint = useCallback(
    (point: LngLat) => {
      if (ui.tool === "polygon") {
        if (polygonDraft) applyDraft(addDraftVertex(polygonDraft, point));
        return;
      }
      switch (ui.tool) {
        case "measure":
          dispatch({ type: "measure-add", point });
          break;
        case "catchment":
          dispatch({ type: "catchment-center", center: point });
          break;
        case "place":
        case "zone":
          runPlace(ui.tool, point);
          break;
        case "none":
          setCardSupportId(null);
          onMapClick?.(point);
          break;
      }
    },
    [ui.tool, runPlace, onMapClick, polygonDraft, applyDraft],
  );

  const onReady = useCallback((controller: MapController) => {
    controllerRef.current = controller;
    setControllerKind(controller.kind);
  }, []);

  const onFatalError = useCallback(
    (_error: unknown) => {
      controllerRef.current = null;
      setControllerKind(null);
      setEngine("svg");
      announce("Carte simplifiée affichée : WebGL indisponible.");
    },
    [announce],
  );

  // ---- search ------------------------------------------------------------------------------
  const onSearchSelect = (result: SearchResult) => {
    if (result.kind === "zone") {
      controllerRef.current?.fitBounds(circleBBox(result.lngLat, result.radiusKm ?? 1), 14);
      announce(`Zone ${result.label}`);
      return;
    }
    if (!visibleSupports.some((s) => s.id === result.id)) {
      setFilters(DEFAULT_FILTERS);
      announce("Filtres réinitialisés pour afficher ce Porteur.");
    }
    if (!ui.layers.porteurs) dispatch({ type: "layer", layer: "porteurs", value: true });
    locateSupport(result.id, true);
  };

  // ---- geolocation ----------------------------------------------------------------------
  const [locating, setLocating] = useState(false);
  const locate = () => {
    if (!("geolocation" in navigator)) {
      announce("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setUserLocation(p);
        controllerRef.current?.flyTo(p, 13);
        announce(
          bboxContains(TUNISIA_BOUNDS, p)
            ? "Carte centrée sur votre position."
            : "Votre position semble hors de Tunisie : la carte y est centrée.",
        );
      },
      (err) => {
        setLocating(false);
        announce(
          err.code === err.PERMISSION_DENIED
            ? "Localisation refusée. Autorisez l'accès à votre position dans le navigateur pour utiliser cet outil."
            : err.code === err.TIMEOUT
              ? "La localisation a pris trop de temps. Réessayez."
              : "Votre position est indisponible pour le moment.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  // ---- tools / panels ------------------------------------------------------------------
  const openPanel = (panel: MapPanelId | null) => dispatch({ type: "panel", panel });
  const setTool = (tool: MapTool) => {
    const turningOn = ui.tool !== tool;
    dispatch({ type: "tool", tool });
    if (!turningOn) return;
    const messages: Record<MapTool, string> = {
      none: "",
      polygon:
        "Dessin de polygone activé. Cliquez pour ajouter des sommets, Entrée pour fermer, Retour arrière pour annuler le dernier, Échap pour tout effacer.",
      measure:
        "Outil de mesure activé. Cliquez sur la carte pour ajouter des points, Échap pour terminer.",
      catchment: "Zone de chalandise : cliquez sur la carte pour placer le centre.",
      place: "Cliquez sur la carte pour placer le nouveau Porteur. Échap pour annuler.",
      zone: "Cliquez sur la carte pour placer le centre de la nouvelle zone. Échap pour annuler.",
    };
    announce(messages[tool]);
  };

  // keyboard shortcuts + Escape on the map root
  const shortcutState = useRef({ ui, engine, setTool, openPanel, polygonDraft, applyDraft, announce });
  shortcutState.current = { ui, engine, setTool, openPanel, polygonDraft, applyDraft, announce };
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const draw = shortcutState.current;
      if (draw.ui.tool === "polygon" && draw.polygonDraft) {
        if (e.key === "Enter") {
          e.preventDefault();
          const next = closeDraft(draw.polygonDraft);
          draw.applyDraft(next);
          draw.announce(
            next.closed
              ? "Polygone fermé."
              : "Ajoutez au moins 3 sommets avant de fermer le polygone.",
          );
          return;
        }
        if (e.key === "Backspace") {
          e.preventDefault();
          draw.applyDraft(removeLastDraftVertex(draw.polygonDraft));
          draw.announce("Dernier sommet supprimé.");
          return;
        }
        if (e.key === "Escape" && draw.polygonDraft.vertices.length > 0) {
          e.preventDefault();
          draw.applyDraft(EMPTY_POLYGON_DRAFT);
          draw.announce("Tracé du polygone annulé.");
          return;
        }
      }
      if (e.key === "Escape") {
        const s = shortcutState.current.ui;
        if (s.panel !== null || s.tool !== "none") {
          e.preventDefault();
          dispatch({ type: "escape" });
        } else {
          setCardSupportId(null);
        }
        return;
      }
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (typing) return;
      const onCanvas = target instanceof HTMLCanvasElement;
      const webgl = shortcutState.current.engine === "webgl";
      switch (e.key) {
        case "+":
        case "=":
          if (!onCanvas && webgl) controllerRef.current?.zoomIn();
          break;
        case "-":
          if (!onCanvas && webgl) controllerRef.current?.zoomOut();
          break;
        case "m":
        case "M":
          if (webgl) shortcutState.current.setTool("measure");
          break;
        case "c":
        case "C":
          shortcutState.current.setTool("catchment");
          break;
        case "f":
        case "F":
          shortcutState.current.openPanel("filters");
          break;
        case "l":
        case "L":
          shortcutState.current.openPanel("legend");
          break;
        default:
          return;
      }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, []);

  // restore focus to the map root region when a panel closes (keeps keyboard users oriented)
  const lastPanel = useRef<MapPanelId | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (ui.panel !== null && lastPanel.current === null) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    if (ui.panel === null && lastPanel.current !== null) {
      const trigger = triggerRef.current;
      if (trigger && rootRef.current?.contains(trigger) && trigger.isConnected) trigger.focus();
    }
    lastPanel.current = ui.panel;
  }, [ui.panel]);

  // ---- counts --------------------------------------------------------------------------
  const counts = useMemo(() => {
    const types: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    const statuses: Record<string, number> = {};
    for (const s of supports) {
      const t = resolvePorteurType(s).type;
      types[t] = (types[t] ?? 0) + 1;
      statuses[s.technicalStatus] = (statuses[s.technicalStatus] ?? 0) + 1;
    }
    return { types, statuses };
  }, [supports]);

  const activeFilters = countActiveFilters(ui.filters);
  const locatedTotal = useMemo(
    () => supports.filter((s) => isValidLngLat({ lng: s.longitude, lat: s.latitude })).length,
    [supports],
  );
  const displayedCount = ui.layers.porteurs
    ? visibleSupports.filter((s) => isValidLngLat({ lng: s.longitude, lat: s.latitude })).length
    : 0;
  const hiddenByFilters = supports.length - visibleSupports.length;
  const unlocated = supports.length - locatedTotal;
  const showEverything = () => {
    if (activeFilters > 0) setFilters(DEFAULT_FILTERS);
    if (!ui.layers.porteurs) dispatch({ type: "layer", layer: "porteurs", value: true });
    announce(`${displayedCountLabel(locatedTotal, supports.length)} : filtres réinitialisés.`);
  };
  const isWebgl = engine === "webgl";
  const canMeasure = isWebgl;

  const engineProps: EngineProps = {
    zones,
    supports,
    visibleSupports,
    mode,
    selection,
    ui,
    dispatch,
    reducedMotion,
    activeZoneId,
    highlightSupportId,
    pulseSupportId,
    cardSupportId,
    setCardSupportId,
    userLocation,
    canSelect,
    onMarkerActivate,
    onToggleSupport,
    onZoneActivate,
    onClusterActivate,
    onMapPoint,
    onHoverSupport,
    onOpenPorteur,
    onMoveSupport,
    onZoneRadiusChange,
    onReady,
    onFatalError,
    pickPoints: onMapClick !== undefined,
    chrome,
    availability,
    polygons,
    polygonDraft,
    onDraftChange: canDrawPolygon ? applyDraft : undefined,
    heatmap,
  };
  const compact = chrome === "compact";

  const listItems = (
    ui.listScope ? visibleSupports.filter((s) => ui.listScope?.includes(s.id)) : visibleSupports
  ).map((support: SupportResponse) => ({ support }));

  const tools = (sheet: boolean) => {
    const side = sheet ? undefined : "left";
    const common = { showLabel: sheet, tooltipSide: side } as const;
    return (
      <>
        {isWebgl ? (
          <>
            <MapToolButton
              {...common}
              label="Zoom avant"
              shortcut="+"
              icon={<Plus />}
              onClick={() => controllerRef.current?.zoomIn()}
            />
            <MapToolButton
              {...common}
              label="Zoom arrière"
              shortcut="−"
              icon={<Minus />}
              onClick={() => controllerRef.current?.zoomOut()}
            />
            <MapToolDivider />
          </>
        ) : null}
        <MapToolButton
          {...common}
          label="Recentrer : tous les Porteurs"
          icon={<Crosshair />}
          onClick={() => recenter("porteurs")}
        />
        {isWebgl ? (
          <MapToolButton
            {...common}
            label="Recentrer : toute la Tunisie"
            icon={<Earth />}
            onClick={() => recenter("tunisie")}
          />
        ) : null}
        {isWebgl ? (
          <MapToolButton
            {...common}
            label={locating ? "Localisation en cours…" : "Ma position"}
            icon={<LocateFixed />}
            aria-busy={locating}
            onClick={locate}
          />
        ) : null}
        {fullscreen.supported ? (
          <MapToolButton
            {...common}
            label={fullscreen.active ? "Quitter le plein écran" : "Plein écran"}
            icon={fullscreen.active ? <Minimize /> : <Maximize />}
            onClick={fullscreen.toggle}
          />
        ) : null}
        <MapToolDivider />
        {isWebgl ? (
          <MapToolButton
            {...common}
            label="Fond de carte"
            icon={<MapIcon />}
            aria-expanded={ui.panel === "basemap"}
            active={ui.panel === "basemap"}
            onClick={() => openPanel("basemap")}
          />
        ) : null}
        <MapToolButton
          {...common}
          label="Couches"
          icon={<Layers />}
          aria-expanded={ui.panel === "layers"}
          active={ui.panel === "layers"}
          onClick={() => openPanel("layers")}
        />
        {isWebgl ? (
          <MapToolButton
            {...common}
            label={ui.viewMode === "3d" ? "Passer en vue 2D" : "Passer en vue 3D"}
            icon={<Box />}
            active={ui.viewMode === "3d"}
            onClick={() => setViewMode(ui.viewMode === "3d" ? "2d" : "3d")}
          />
        ) : null}
        <MapToolDivider />
        {canMeasure ? (
          <MapToolButton
            {...common}
            label="Mesurer une distance"
            shortcut="M"
            icon={<Ruler />}
            active={ui.tool === "measure"}
            onClick={() => setTool("measure")}
          />
        ) : null}
        <MapToolButton
          {...common}
          label="Zone de chalandise"
          shortcut="C"
          icon={<CircleDashed />}
          active={ui.tool === "catchment"}
          onClick={() => setTool("catchment")}
        />
        {canDrawPolygon ? (
          <>
            <MapToolDivider />
            <MapToolButton
              {...common}
              label="Dessiner un polygone"
              icon={<PenTool />}
              active={ui.tool === "polygon"}
              onClick={() => setTool("polygon")}
            />
          </>
        ) : null}
        {mode === "admin" && (onPlacePoint || onCreateZoneAt) ? (
          <>
            <MapToolDivider />
            {onPlacePoint ? (
              <MapToolButton
                {...common}
                label="Placer un Porteur"
                icon={<MapPinPlus />}
                active={ui.tool === "place"}
                onClick={() => setTool("place")}
              />
            ) : null}
            {onCreateZoneAt ? (
              <MapToolButton
                {...common}
                label="Créer une zone"
                icon={<CirclePlus />}
                active={ui.tool === "zone"}
                onClick={() => setTool("zone")}
              />
            ) : null}
          </>
        ) : null}
        <MapToolDivider />
        <MapToolButton
          {...common}
          label="Légende"
          shortcut="L"
          icon={<BookOpen />}
          aria-expanded={ui.panel === "legend"}
          active={ui.panel === "legend"}
          onClick={() => openPanel("legend")}
        />
        {showListTool ? (
          <MapToolButton
            {...common}
            label="Liste des Porteurs"
            icon={<List />}
            aria-expanded={ui.panel === "list"}
            active={ui.panel === "list"}
            onClick={() => openPanel("list")}
          />
        ) : null}
      </>
    );
  };

  const placeHint =
    ui.tool === "place"
      ? "Cliquez sur la carte pour placer le nouveau Porteur."
      : ui.tool === "zone"
        ? "Cliquez sur la carte pour placer le centre de la nouvelle zone."
        : null;
  const drawStatus = ui.tool === "polygon" && polygonDraft ? draftStatus(polygonDraft) : null;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={ariaLabel}
      aria-roledescription="carte"
      data-map-engine={engine}
      data-map-mode={mode}
      data-map-chrome={compact ? "compact" : "full"}
      className={cx(
        "tpub-map relative isolate h-full w-full overflow-hidden rounded-panel border border-line bg-bg text-ink",
        fullscreen.active && "rounded-none",
        className,
      )}
      style={height ? { height } : undefined}
    >
      {isWebgl ? (
        <EngineErrorBoundary onError={onFatalError}>
          <Suspense
            fallback={<NetworkMapSkeleton className="absolute inset-0 rounded-none border-0" />}
          >
            <MapLibreView {...engineProps} />
          </Suspense>
        </EngineErrorBoundary>
      ) : (
        <NetworkMapFallback {...engineProps} />
      )}

      {/* keyboard helper crosshair while a point tool is active */}
      {isWebgl && ui.tool !== "none" ? (
        <span
          aria-hidden="true"
          className="tpub-map-crosshair pointer-events-none absolute inset-0 z-[5]"
        />
      ) : null}

      {compact ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          <MapToolbar
            label="Outils de la carte"
            className="pointer-events-auto absolute top-2 right-2 flex"
          >
            {isWebgl ? (
              <>
                <MapToolButton
                  label="Zoom avant"
                  icon={<Plus />}
                  tooltipSide="left"
                  onClick={() => controllerRef.current?.zoomIn()}
                />
                <MapToolButton
                  label="Zoom arrière"
                  icon={<Minus />}
                  tooltipSide="left"
                  onClick={() => controllerRef.current?.zoomOut()}
                />
              </>
            ) : null}
            <MapToolButton
              label="Recentrer : tous les Porteurs"
              icon={<Crosshair />}
              tooltipSide="left"
              onClick={() => controllerRef.current?.resetView("porteurs")}
            />
            {isWebgl ? (
              <MapToolButton
                label="Recentrer : toute la Tunisie"
                icon={<Earth />}
                tooltipSide="left"
                onClick={() => controllerRef.current?.resetView("tunisie")}
              />
            ) : null}
          </MapToolbar>
          {engine === "svg" ? (
            <p
              role="note"
              className="tpub-map-surface pointer-events-auto absolute bottom-2 left-2 rounded-full px-3 py-1 font-label text-[0.75rem] font-semibold text-warning"
            >
              Carte simplifiée (WebGL indisponible)
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={cx("pointer-events-none absolute inset-0 z-10", compact && "hidden")}>
        {/* search + filters */}
        <div className="pointer-events-auto absolute top-3 right-[4.25rem] left-3 flex items-start gap-2 md:right-auto">
          <MapSearch
            zones={zones}
            supports={supports}
            onSelect={onSearchSelect}
            className="min-w-0 flex-1 md:w-80 md:flex-none"
          />
          <div className="tpub-map-surface shrink-0 rounded-[14px] p-0">
            <MapToolButton
              label={
                activeFilters > 0
                  ? `Filtres (${activeFilters} actif${activeFilters > 1 ? "s" : ""})`
                  : "Filtres"
              }
              shortcut="F"
              tooltipSide="bottom"
              icon={<SlidersHorizontal />}
              badge={activeFilters}
              aria-expanded={ui.panel === "filters"}
              active={ui.panel === "filters"}
              onClick={() => openPanel("filters")}
            />
          </div>
        </div>

        {/* desktop toolbar */}
        <MapToolbar
          label="Outils de la carte"
          className="pointer-events-auto absolute top-3 right-3 hidden max-h-[calc(100%-1.5rem)] overflow-y-auto no-scrollbar md:flex"
        >
          {tools(false)}
        </MapToolbar>

        {/* mobile tools button */}
        <div className="tpub-map-surface pointer-events-auto absolute top-3 right-3 rounded-[14px] md:hidden">
          <MapToolButton
            label="Outils de la carte"
            icon={ui.panel === "tools" ? <X /> : <Menu />}
            aria-expanded={ui.panel === "tools"}
            onClick={() => openPanel("tools")}
          />
        </div>

        {engine === "svg" ? (
          <p
            role="note"
            className="tpub-map-surface pointer-events-auto absolute top-[4.25rem] left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-full px-3.5 py-1.5 text-center font-label text-[0.75rem] font-semibold text-warning"
          >
            Carte simplifiée (WebGL indisponible)
          </p>
        ) : null}

        {drawStatus ? (
          <div className="tpub-map-surface pointer-events-auto absolute top-[4.25rem] left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-card px-3 py-2 text-xs text-ink">
            <span
              aria-live="polite"
              className={cx(drawStatus.state === "invalid" && "font-semibold text-warning")}
            >
              {drawStatus.message}
            </span>
            {polygonDraft && polygonDraft.vertices.length >= 3 && !polygonDraft.closed ? (
              <button
                type="button"
                onClick={() => applyDraft(closeDraft(polygonDraft))}
                className="min-h-8 cursor-pointer rounded-control border border-line-strong px-2.5 font-label font-semibold hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-brand-blue-text"
              >
                Fermer le polygone
              </button>
            ) : null}
            {polygonDraft && polygonDraft.vertices.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  applyDraft(EMPTY_POLYGON_DRAFT);
                  announce("Tracé du polygone effacé.");
                }}
                className="min-h-8 cursor-pointer rounded-control px-2.5 font-label font-semibold text-muted hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text"
              >
                Effacer le tracé
              </button>
            ) : null}
          </div>
        ) : null}

        {placeHint ? (
          <div className="tpub-map-surface pointer-events-auto absolute top-[4.25rem] left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-card px-3 py-2 text-xs text-ink">
            <span>{placeHint}</span>
            {isWebgl ? (
              <button
                type="button"
                onClick={() => {
                  const c = controllerRef.current?.getCenter();
                  if (c && (ui.tool === "place" || ui.tool === "zone")) runPlace(ui.tool, c);
                }}
                className="min-h-8 cursor-pointer rounded-control border border-line-strong px-2.5 font-label font-semibold hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-brand-blue-text"
              >
                Utiliser le centre de la vue
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dispatch({ type: "tool", tool: ui.tool })}
              className="min-h-8 cursor-pointer rounded-control px-2.5 font-label font-semibold text-muted hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text"
            >
              Annuler
            </button>
          </div>
        ) : null}

        {/* bottom-left status chips */}
        <div className="pointer-events-auto absolute bottom-3 left-3 flex max-w-[calc(100%-7rem)] flex-wrap items-center gap-2">
          <p
            aria-live="polite"
            data-map-counter=""
            className="tpub-map-surface rounded-full px-3 py-1.5 font-label text-[0.75rem] font-semibold text-ink-soft tabular"
          >
            {displayedCountLabel(displayedCount, supports.length)}
            {unlocated > 0 ? (
              <span className="text-muted-2"> · {unlocated} sans position</span>
            ) : null}
          </p>
          {hiddenByFilters > 0 || !ui.layers.porteurs ? (
            <p className="tpub-map-surface flex items-center gap-2 rounded-full py-1 pr-1 pl-3 font-label text-[0.75rem] font-semibold text-warning tabular">
              {ui.layers.porteurs
                ? hiddenByFiltersLabel(hiddenByFilters)
                : "Couche « Porteurs » masquée"}
              <button
                type="button"
                onClick={showEverything}
                className="min-h-7 cursor-pointer rounded-full px-2 text-brand-blue-text hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-brand-blue-text"
              >
                Tout afficher
              </button>
            </p>
          ) : null}
          {canSelect && selection.supportIds.length + selection.zoneIds.length > 0 ? (
            <p className="tpub-map-surface flex items-center gap-2 rounded-full py-1 pr-1 pl-3 font-label text-[0.75rem] font-semibold text-brand-blue-text tabular">
              {selection.supportIds.length} sélectionné{selection.supportIds.length > 1 ? "s" : ""}
              <button
                type="button"
                onClick={() => {
                  commitSelection({ zoneIds: [], supportIds: [] });
                  announce("Sélection effacée.");
                }}
                className="min-h-7 cursor-pointer rounded-full px-2 text-muted hover:bg-overlay-hover hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text"
              >
                Effacer
              </button>
            </p>
          ) : null}
        </div>

        {/* panels */}
        {ui.panel === "tools" ? (
          <MapPanel title="Outils de la carte" onClose={() => openPanel(null)}>
            <MapToolbar label="Outils de la carte" bare>
              {tools(true)}
            </MapToolbar>
          </MapPanel>
        ) : null}
        {ui.panel === "basemap" ? (
          <BasemapPanel value={ui.basemap} onChange={setBasemap} onClose={() => openPanel(null)} />
        ) : null}
        {ui.panel === "layers" ? (
          <LayersPanel
            value={ui.layers}
            onToggle={(layer) => dispatch({ type: "layer", layer })}
            clusterPorteurs={ui.clusterPorteurs}
            onClusterPorteursChange={setClusterPorteurs}
            onClose={() => openPanel(null)}
          />
        ) : null}
        {ui.panel === "filters" ? (
          <FiltersPanel
            value={ui.filters}
            counts={counts}
            displayedCount={visibleSupports.length}
            totalCount={supports.length}
            onChange={setFilters}
            onReset={() => setFilters(DEFAULT_FILTERS)}
            onClose={() => openPanel(null)}
          />
        ) : null}
        {ui.panel === "legend" ? (
          <MapPanel title="Légende" onClose={() => openPanel(null)}>
            <MapLegend
              showSelection={canSelect || ui.tool === "catchment"}
              show3d={ui.viewMode === "3d"}
              showClusters={ui.clusterPorteurs}
              heatmapLabel={heatmap?.label ?? null}
            />
          </MapPanel>
        ) : null}
        {ui.panel === "list" ? (
          <MapPanel
            title={ui.listScope ? "Porteurs du groupe" : "Liste des Porteurs"}
            description={
              ui.listScope
                ? displayedCountLabel(listItems.length)
                : displayedCountLabel(listItems.length, supports.length)
            }
            onClose={() => openPanel(null)}
          >
            <PorteurList
              label="Porteurs affichés sur la carte"
              items={listItems}
              selectedIds={selection.supportIds}
              highlightId={highlightSupportId}
              onLocate={(id) => locateSupport(id, true)}
              onOpen={onOpenPorteur}
              onToggleSelect={canSelect ? onToggleSupport : undefined}
              onHover={onHoverSupport}
              emptyText="Aucun Porteur ne correspond aux filtres."
            />
          </MapPanel>
        ) : null}

        {ui.panel === null && ui.tool === "measure" ? (
          <MeasurePanel
            points={ui.measure.points}
            finished={ui.measure.finished}
            canAddCenter={isWebgl}
            onAddCenter={() => {
              const c = controllerRef.current?.getCenter();
              if (c) dispatch({ type: "measure-add", point: c });
            }}
            onUndo={() => dispatch({ type: "measure-undo" })}
            onClear={() => dispatch({ type: "measure-clear" })}
            onFinish={() => dispatch({ type: "measure-finish" })}
            onClose={() => setTool("measure")}
          />
        ) : null}
        {ui.panel === null && ui.tool === "catchment" ? (
          <CatchmentPanel
            center={ui.catchment.center}
            radiusKm={ui.catchment.radiusKm}
            supports={visibleSupports}
            selectedIds={selection.supportIds}
            canUseCenter={isWebgl}
            onRadiusChange={(km) => dispatch({ type: "catchment-radius", radiusKm: km })}
            onUseCenter={() => {
              const c = controllerRef.current?.getCenter();
              if (c) dispatch({ type: "catchment-center", center: c });
            }}
            onSelectBookable={
              canSelect || onSelectionChange
                ? () => {
                    const center = ui.catchment.center;
                    if (!center) return;
                    const next = selectWithinRadius(
                      selectionRef.current,
                      center,
                      ui.catchment.radiusKm,
                      visibleSupports,
                    );
                    const added = next.supportIds.length - selectionRef.current.supportIds.length;
                    commitSelection(next);
                    announce(
                      added === 0
                        ? "Aucun nouveau Porteur réservable dans ce rayon."
                        : `${added} Porteur${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""} à la sélection.`,
                    );
                  }
                : undefined
            }
            onLocate={(id) => locateSupport(id, true)}
            onOpen={onOpenPorteur}
            onClose={() => setTool("catchment")}
          />
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
