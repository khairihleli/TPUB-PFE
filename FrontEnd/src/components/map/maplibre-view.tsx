"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import {
  AttributionControl,
  Map as MapLibreMap,
  ScaleControl,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import {
  destinationPoint,
  formatDistance,
  formatRadiusKm,
  haversineDistance,
  polylineLength,
  TUNISIA_BOUNDS,
  type LngLat,
} from "@/lib/network/geo";
import {
  catchmentFeatureCollection,
  clusterSupports,
  extrusionFootprintsFeatureCollection,
  headingConesFeatureCollection,
  measureFeatureCollection,
  porteursBounds,
  radiusHandlePosition,
  zonesToFeatureCollection,
} from "@/lib/network/geojson";
import {
  closeDraft,
  heatmapFeatureCollection,
  moveDraftVertex,
  polygonDraftFeatureCollection,
  polygonsFeatureCollection,
} from "@/lib/network/overlays";
import {
  buildMapStyle,
  layerVisibility,
  MAP_LAYER_IDS,
  MAP_SOURCE_IDS,
  MAPLIBRE_LOCALE_FR,
  VIEW_PITCH,
} from "@/lib/network/map-style";
import {
  FULL_MARKER_MIN_ZOOM,
  PORTEUR_MARKER_PX,
  spiderfy,
  spiderSignature,
  type SpiderResult,
} from "@/lib/network/spiderfy";

import { MapMarker } from "@/components/map/map-marker";
import {
  ClusterMarker,
  PorteurMarker,
  SpiderFan,
  SpiderLeg,
  ZoneLabel,
} from "@/components/map/map-markers";
import type { EngineProps, MapController, RecenterTarget } from "@/components/map/types";

type SourceData = Parameters<GeoJSONSource["setData"]>[0];

/** Zone labels appear from this zoom. */
const ZONE_LABEL_MIN_ZOOM = 8;
const RADIUS_MIN_KM = 0.1;
const RADIUS_MAX_KM = 50;
/** Closest zoom used when framing Porteurs (a single Porteur still shows its street). */
const FRAME_MAX_ZOOM = 15;

type FramePadding = { top: number; right: number; bottom: number; left: number };

/** Keeps framed Porteurs clear of the floating search bar, tool rail and status chips. */
function framePadding(container: HTMLElement | null, compactChrome: boolean): FramePadding {
  const width = container?.clientWidth ?? 0;
  const height = container?.clientHeight ?? 0;
  // Narrow viewports lift scale + attribution above the status chips (network-map.css): the
  // bottom chrome is then ~100 px tall and would cover the southernmost Porteur.
  const narrow =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 47.99rem)").matches;
  const base = compactChrome
    ? { top: 56, right: 64, bottom: narrow ? 96 : 36, left: 36 }
    : { top: 84, right: 80, bottom: narrow ? 112 : 64, left: 40 };
  // never more than ~40 % of the canvas, or MapLibre refuses to fit
  const fitX = width > 0 ? Math.min(1, (width * 0.4) / (base.left + base.right)) : 1;
  const fitY = height > 0 ? Math.min(1, (height * 0.4) / (base.top + base.bottom)) : 1;
  return {
    top: Math.round(base.top * fitY),
    bottom: Math.round(base.bottom * fitY),
    left: Math.round(base.left * fitX),
    right: Math.round(base.right * fitX),
  };
}

/** « Recentrer » target: every Porteur (+ their zones), or Tunisia without Porteurs. */
function recenterBounds(
  target: RecenterTarget,
  zones: readonly ZoneResponse[],
  supports: readonly SupportResponse[],
) {
  if (target === "tunisie") return TUNISIA_BOUNDS;
  return porteursBounds(supports, zones) ?? TUNISIA_BOUNDS;
}

const EMPTY_SPIDER: SpiderResult<number> = { placements: [], groups: [], byId: new Map() };

const roundKm = (km: number) =>
  Math.round(Math.min(RADIUS_MAX_KM, Math.max(RADIUS_MIN_KM, km)) * 20) / 20;

/** MapLibre GL engine of the network map. Loaded lazily, only when WebGL is available. */
export function MapLibreView(props: EngineProps) {
  const {
    zones,
    supports,
    visibleSupports,
    mode,
    selection,
    ui,
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
    dispatch,
    chrome = "full",
    availability,
    polygons,
    polygonDraft = null,
    onDraftChange,
    heatmap = null,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [zoom, setZoom] = useState(6);
  const [pendingMoves, setPendingMoves] = useState<Record<number, LngLat>>({});
  const [radiusPreview, setRadiusPreview] = useState<{ zoneId: number; radiusKm: number } | null>(
    null,
  );
  const draggingRef = useRef(false);

  // latest values for MapLibre listeners registered once
  const drawing = { polygonDraft, onDraftChange };
  const latest = useRef({
    onMapPoint,
    onZoneActivate,
    ui,
    reducedMotion,
    zones,
    supports,
    dispatch,
    setCardSupportId,
    pickPoints: props.pickPoints === true,
    compactChrome: chrome === "compact",
    ...drawing,
  });
  latest.current = {
    onMapPoint,
    onZoneActivate,
    ui,
    reducedMotion,
    zones,
    supports,
    dispatch,
    setCardSupportId,
    pickPoints: props.pickPoints === true,
    compactChrome: chrome === "compact",
    ...drawing,
  };
  const [initialValues] = useState(() => ({
    basemap: ui.basemap,
    // every Porteur (+ their zone circles); Tunisia only when there is no Porteur
    bounds: recenterBounds("porteurs", zones, supports),
    onFatalError,
    onReady,
  }));
  const initial = useRef(initialValues);

  // ---- create the map once ----------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const init = initial.current;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container,
        style: buildMapStyle(init.basemap),
        bounds: init.bounds,
        fitBoundsOptions: {
          padding: framePadding(container, latest.current.compactChrome),
          maxZoom: FRAME_MAX_ZOOM,
        },
        attributionControl: false,
        locale: MAPLIBRE_LOCALE_FR,
        minZoom: 4,
        maxZoom: 19,
        maxPitch: 70,
        fadeDuration: latest.current.reducedMotion ? 0 : 250,
        dragRotate: true,
        touchPitch: true,
        refreshExpiredTiles: false,
      });
    } catch (error) {
      init.onFatalError(error);
      return;
    }
    instance.addControl(new AttributionControl({ compact: true }), "bottom-right");
    instance.addControl(new ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-right");
    instance
      .getCanvas()
      .setAttribute(
        "aria-label",
        "Carte interactive du réseau TPUB. Flèches pour se déplacer, plus et moins pour zoomer. Les Porteurs sont accessibles comme boutons après la carte.",
      );

    // "style.load" (inline style parsed, sources exist) — not "load", which waits for every
    // basemap tile: with slow or blocked tile hosts the zones/cones/measure layers stayed empty.
    const onLoad = () => setStyleReady(true);
    const onZoomEnd = () => setZoom(instance.getZoom());
    const onClick = (e: MapMouseEvent) => {
      const target = e.originalEvent.target;
      if (target instanceof Element && target.closest(".maplibregl-marker")) return;
      const l = latest.current;
      const point = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      // click on the first vertex closes the ring (docs/round2-contract.md §4.8)
      if (l.ui.tool === "polygon" && l.polygonDraft && !l.polygonDraft.closed && l.onDraftChange) {
        const hit = instance.getLayer(MAP_LAYER_IDS.polygonDraftVertices)
          ? instance.queryRenderedFeatures(
              [
                [e.point.x - 8, e.point.y - 8],
                [e.point.x + 8, e.point.y + 8],
              ],
              { layers: [MAP_LAYER_IDS.polygonDraftVertices] },
            )
          : [];
        if (hit.some((f) => f.properties?.first === true) && l.polygonDraft.vertices.length >= 3) {
          l.onDraftChange(closeDraft(l.polygonDraft));
          return;
        }
      }
      if (l.ui.tool !== "none" || l.pickPoints) {
        l.onMapPoint(point);
        return;
      }
      if (l.ui.layers.zones && instance.getLayer(MAP_LAYER_IDS.zonesFill)) {
        const hit = instance.queryRenderedFeatures(e.point, { layers: [MAP_LAYER_IDS.zonesFill] });
        const id = hit[0]?.properties?.id as unknown;
        if (typeof id === "number") {
          l.onZoneActivate(id);
          return;
        }
      }
      l.onMapPoint(point);
    };
    const onDblClick = (e: MapMouseEvent) => {
      const l = latest.current;
      if (l.ui.tool === "measure") {
        e.preventDefault();
        l.dispatch({ type: "measure-finish" });
      }
      if (l.ui.tool === "polygon" && l.polygonDraft && l.onDraftChange) {
        e.preventDefault();
        l.onDraftChange(closeDraft(l.polygonDraft));
      }
    };
    const onMouseMove = (e: MapMouseEvent) => {
      const l = latest.current;
      if (l.ui.tool !== "none" || !l.ui.layers.zones || !instance.getLayer(MAP_LAYER_IDS.zonesFill))
        return;
      const hit = instance.queryRenderedFeatures(e.point, { layers: [MAP_LAYER_IDS.zonesFill] });
      instance.getCanvas().style.cursor = hit.length > 0 ? "pointer" : "";
    };

    // drag a vertex of a closed draft (custom handles, no MapLibre plugin)
    let dragIndex: number | null = null;
    const onVertexDown = (e: MapMouseEvent) => {
      const l = latest.current;
      if (!l.polygonDraft?.closed || !l.onDraftChange) return;
      if (!instance.getLayer(MAP_LAYER_IDS.polygonDraftVertices)) return;
      const hit = instance.queryRenderedFeatures(
        [
          [e.point.x - 8, e.point.y - 8],
          [e.point.x + 8, e.point.y + 8],
        ],
        { layers: [MAP_LAYER_IDS.polygonDraftVertices] },
      );
      const index = hit[0]?.properties?.index;
      if (typeof index !== "number") return;
      e.preventDefault();
      dragIndex = index;
      instance.dragPan.disable();
      instance.getCanvas().style.cursor = "grabbing";
    };
    const onVertexMove = (e: MapMouseEvent) => {
      const l = latest.current;
      if (dragIndex === null || !l.polygonDraft || !l.onDraftChange) return;
      l.onDraftChange(
        moveDraftVertex(l.polygonDraft, dragIndex, { lng: e.lngLat.lng, lat: e.lngLat.lat }),
      );
    };
    const onVertexUp = () => {
      if (dragIndex === null) return;
      dragIndex = null;
      instance.dragPan.enable();
      instance.getCanvas().style.cursor = latest.current.ui.tool === "none" ? "" : "crosshair";
    };
    instance.on("mousedown", onVertexDown);
    instance.on("mousemove", onVertexMove);
    instance.on("mouseup", onVertexUp);

    instance.on("style.load", onLoad);
    instance.on("load", onLoad);
    if (instance.isStyleLoaded()) onLoad();
    instance.on("zoomend", onZoomEnd);
    instance.on("click", onClick);
    instance.on("dblclick", onDblClick);
    instance.on("mousemove", onMouseMove);
    // tile/network errors are expected offline: our own layers still render
    instance.on("error", () => undefined);

    const controller: MapController = {
      kind: "webgl",
      canZoom: true,
      zoomIn: () => instance.zoomIn({ animate: !latest.current.reducedMotion }),
      zoomOut: () => instance.zoomOut({ animate: !latest.current.reducedMotion }),
      resetView: (target = "porteurs") => {
        const l = latest.current;
        instance.fitBounds(recenterBounds(target, l.zones, l.supports), {
          padding: framePadding(container, l.compactChrome),
          maxZoom: FRAME_MAX_ZOOM,
          animate: !l.reducedMotion,
          pitch: instance.getPitch(),
          bearing: 0,
        });
      },
      flyTo: (p, z) => {
        const target = {
          center: [p.lng, p.lat] as [number, number],
          zoom: Math.max(instance.getZoom(), z ?? 14),
        };
        if (latest.current.reducedMotion) instance.jumpTo(target);
        else instance.flyTo({ ...target, duration: 1100, essential: false });
      },
      fitBounds: (bbox, maxZoom = 14) =>
        // 88 px keeps the framed zone (and its label) clear of the floating search bar,
        // toolbar and status chips.
        instance.fitBounds(bbox, { padding: 88, maxZoom, animate: !latest.current.reducedMotion }),
      getCenter: () => {
        const c = instance.getCenter();
        return { lng: c.lng, lat: c.lat };
      },
    };
    init.onReady(controller);
    setMap(instance);
    setZoom(instance.getZoom());

    return () => {
      instance.remove();
      setMap(null);
      setStyleReady(false);
    };
  }, []);

  // ---- data → sources ---------------------------------------------------------------------
  const setData = useCallback(
    (id: string, data: unknown) => {
      if (!map || !styleReady) return;
      map.getSource<GeoJSONSource>(id)?.setData(data as SourceData);
    },
    [map, styleReady],
  );

  const radiusOverrides = useMemo(
    () => (radiusPreview ? { [radiusPreview.zoneId]: radiusPreview.radiusKm } : {}),
    [radiusPreview],
  );

  useEffect(() => {
    setData(
      MAP_SOURCE_IDS.zones,
      zonesToFeatureCollection(zones, {
        selectedZoneIds: selection.zoneIds,
        focusedZoneId: activeZoneId,
        radiusOverrides,
      }),
    );
  }, [setData, zones, selection.zoneIds, activeZoneId, radiusOverrides]);

  useEffect(() => {
    setData(MAP_SOURCE_IDS.cones, headingConesFeatureCollection(visibleSupports, selection));
    setData(
      MAP_SOURCE_IDS.extrusions,
      extrusionFootprintsFeatureCollection(visibleSupports, selection, { sizeM: 70 }),
    );
  }, [setData, visibleSupports, selection]);

  useEffect(() => {
    setData(
      MAP_SOURCE_IDS.catchment,
      catchmentFeatureCollection(
        ui.tool === "catchment" ? ui.catchment.center : null,
        ui.catchment.radiusKm,
      ),
    );
  }, [setData, ui.tool, ui.catchment]);

  useEffect(() => {
    setData(
      MAP_SOURCE_IDS.measure,
      measureFeatureCollection(ui.tool === "measure" ? ui.measure.points : []),
    );
  }, [setData, ui.tool, ui.measure.points]);

  // ---- round 2 overlays --------------------------------------------------------------------
  useEffect(() => {
    setData(MAP_SOURCE_IDS.polygons, polygonsFeatureCollection(polygons ?? []));
  }, [setData, polygons]);

  useEffect(() => {
    setData(MAP_SOURCE_IDS.polygonDraft, polygonDraftFeatureCollection(polygonDraft));
  }, [setData, polygonDraft]);

  useEffect(() => {
    setData(MAP_SOURCE_IDS.heatmap, heatmapFeatureCollection(heatmap));
  }, [setData, heatmap]);

  // ---- style state -----------------------------------------------------------------------
  useEffect(() => {
    if (!map || !styleReady) return;
    const vis = layerVisibility(ui.basemap, ui.layers, ui.viewMode);
    for (const [layerId, value] of Object.entries(vis)) {
      if (map.getLayer(layerId) && map.getLayoutProperty(layerId, "visibility") !== value) {
        map.setLayoutProperty(layerId, "visibility", value);
      }
    }
  }, [map, styleReady, ui.basemap, ui.layers, ui.viewMode]);

  useEffect(() => {
    if (!map) return;
    const pitch = VIEW_PITCH[ui.viewMode];
    if (Math.abs(map.getPitch() - pitch) < 0.5) return;
    if (reducedMotion) map.jumpTo({ pitch, bearing: ui.viewMode === "2d" ? 0 : map.getBearing() });
    else
      map.easeTo({
        pitch,
        bearing: ui.viewMode === "3d" ? (map.getBearing() === 0 ? -18 : map.getBearing()) : 0,
        duration: 900,
      });
  }, [map, ui.viewMode, reducedMotion]);

  useEffect(() => {
    if (!map) return;
    const measuring = ui.tool === "measure";
    if (measuring) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    map.getCanvas().style.cursor = ui.tool === "none" ? "" : "crosshair";
  }, [map, ui.tool]);

  // ---- markers -----------------------------------------------------------------------------
  const zoomBucket = Math.floor(zoom);
  // Every Porteur individually at its exact position unless « Regrouper les Porteurs proches ».
  const clusterItems = useMemo(
    () =>
      ui.layers.porteurs
        ? clusterSupports(visibleSupports, zoomBucket, { enabled: ui.clusterPorteurs })
        : [],
    [visibleSupports, zoomBucket, ui.layers.porteurs, ui.clusterPorteurs],
  );

  // ---- overlaps: fan out markers that would cover each other (spiderfy) --------------------
  const spiderInput = useMemo(
    () =>
      clusterItems.flatMap((item) =>
        item.kind === "point"
          ? [{ id: item.item.id, lngLat: pendingMoves[item.item.id] ?? item.lngLat }]
          : [],
      ),
    [clusterItems, pendingMoves],
  );
  const spiderInputRef = useRef(spiderInput);
  spiderInputRef.current = spiderInput;
  const [spider, setSpider] = useState<{
    compact: boolean;
    result: SpiderResult<number>;
    signature: string;
  }>({ compact: true, result: EMPTY_SPIDER, signature: "" });

  const recomputeSpider = useCallback(() => {
    if (!map) return;
    const compact = map.getZoom() < FULL_MARKER_MIN_ZOOM;
    const markerSize = compact ? PORTEUR_MARKER_PX.compact : PORTEUR_MARKER_PX.full;
    const points = spiderInputRef.current.map((p) => {
      const q = map.project([p.lngLat.lng, p.lngLat.lat]);
      return { id: p.id, x: q.x, y: q.y };
    });
    const result = spiderfy(points, { markerSize });
    const signature = `${compact ? "compact" : "full"}#${points.map((p) => p.id).join(".")}#${spiderSignature(result)}`;
    setSpider((prev) => (prev.signature === signature ? prev : { compact, result, signature }));
  }, [map]);

  // recomputed on zoom / rotate / pitch (every frame, throttled) and after any move or resize
  useEffect(() => {
    if (!map) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        recomputeSpider();
      });
    };
    const events = ["zoom", "rotate", "pitch", "moveend", "resize"] as const;
    for (const e of events) map.on(e, schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      for (const e of events) map.off(e, schedule);
    };
  }, [map, recomputeSpider]);

  useEffect(() => {
    recomputeSpider();
  }, [recomputeSpider, spiderInput]);

  const exactById = useMemo(() => new Map(spiderInput.map((p) => [p.id, p.lngLat])), [spiderInput]);

  const canDrag = mode === "admin" && !!onMoveSupport && ui.tool === "none";

  const commitMove = async (id: number, lngLat: LngLat) => {
    setPendingMoves((m) => ({ ...m, [id]: lngLat }));
    try {
      await onMoveSupport?.(id, lngLat);
    } finally {
      setPendingMoves((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    }
  };

  const activeZone =
    mode === "admin" && onZoneRadiusChange ? zones.find((z) => z.id === activeZoneId) : undefined;

  const commitRadius = async (zoneId: number, radiusKm: number) => {
    setRadiusPreview({ zoneId, radiusKm });
    try {
      await onZoneRadiusChange?.(zoneId, radiusKm);
    } finally {
      setRadiusPreview(null);
    }
  };

  const zoneCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of supports) m.set(s.zoneId, (m.get(s.zoneId) ?? 0) + 1);
    return m;
  }, [supports]);

  const cardBelow = (s: SupportResponse, dy = 0) => {
    if (!map) return false;
    return map.project([s.longitude, s.latitude]).y + dy < 260;
  };

  const measurePoints = ui.tool === "measure" ? ui.measure.points : [];
  const lastMeasure = measurePoints[measurePoints.length - 1];

  return (
    <>
      {/* maplibre-gl.css forces position:relative on the container: size it from a wrapper */}
      <div className="absolute inset-0 isolate z-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      {map && ui.layers.zones && ui.layers.etiquettes && zoom >= ZONE_LABEL_MIN_ZOOM
        ? zones.map((z) => {
            const anchorPoint =
              z.radiusKm && z.radiusKm > 0
                ? destinationPoint(
                    { lng: z.longitude, lat: z.latitude },
                    0,
                    (radiusOverrides[z.id] ?? z.radiusKm) * 1000,
                  )
                : { lng: z.longitude, lat: z.latitude };
            const selected = selection.zoneIds.includes(z.id);
            return (
              <MapMarker
                key={`zone-${z.id}`}
                map={map}
                lngLat={anchorPoint}
                anchor="bottom"
                offset={[0, -6]}
                zIndex={5}
              >
                <ZoneLabel
                  zone={z}
                  supportCount={zoneCounts.get(z.id) ?? 0}
                  selected={selected}
                  focused={activeZoneId === z.id}
                  toggles={canSelect}
                  actionHint={canSelect ? "sélectionner ou retirer la zone" : "cadrer la zone"}
                  onActivate={() => onZoneActivate(z.id)}
                />
              </MapMarker>
            );
          })
        : null}

      {/* exact-position dots + leader lines of fanned-out Porteurs (below the markers) */}
      {map
        ? spider.result.placements.map((p) => {
            const exact = exactById.get(p.id);
            if (!p.displaced || !exact) return null;
            return (
              <MapMarker
                key={`leg-${p.id}`}
                map={map}
                lngLat={exact}
                zIndex={7}
                interactive={false}
              >
                <SpiderLeg
                  dx={p.offset.x}
                  dy={p.offset.y}
                  highlighted={highlightSupportId === p.id || cardSupportId === p.id}
                />
              </MapMarker>
            );
          })
        : null}

      {map
        ? clusterItems.map((item) => {
            if (item.kind === "cluster") {
              const selectedCount = item.items.filter((s) =>
                selection.supportIds.includes(s.id),
              ).length;
              return (
                <MapMarker key={item.key} map={map} lngLat={item.lngLat} zIndex={8}>
                  <ClusterMarker
                    count={item.count}
                    selectedCount={selectedCount}
                    label={`Groupe de ${item.count} Porteurs${selectedCount ? `, dont ${selectedCount} sélectionnés` : ""} — zoomer`}
                    onActivate={() =>
                      onClusterActivate(
                        item.items.map((s) => s.id),
                        item.bbox,
                      )
                    }
                  />
                </MapMarker>
              );
            }
            const s = item.item;
            const open = cardSupportId === s.id;
            const selected = selection.supportIds.includes(s.id);
            const placement = spider.result.byId.get(s.id);
            const displaced = placement?.displaced === true;
            const dx = displaced ? placement.offset.x : 0;
            const dy = displaced ? placement.offset.y : 0;
            return (
              <MapMarker
                key={item.key}
                map={map}
                lngLat={pendingMoves[s.id] ?? item.lngLat}
                offset={[dx, dy]}
                // a fanned-out marker is not at its true position: zoom in to drag it
                draggable={canDrag && !spider.compact && !displaced}
                zIndex={open ? 30 : highlightSupportId === s.id ? 25 : selected ? 20 : 10}
                onDragStart={() => {
                  draggingRef.current = true;
                  setCardSupportId(null);
                }}
                onDragEnd={(lngLat) => {
                  window.setTimeout(() => {
                    draggingRef.current = false;
                  }, 0);
                  if (haversineDistance(lngLat, item.lngLat) < 0.5) return;
                  void commitMove(s.id, lngLat);
                }}
              >
                <SpiderFan
                  dx={dx}
                  dy={dy}
                  group={displaced ? (placement.group ?? null) : null}
                  reducedMotion={reducedMotion}
                >
                  <PorteurMarker
                    support={s}
                    availability={availability?.get(s.id)}
                    compact={spider.compact}
                    selected={selected}
                    highlighted={highlightSupportId === s.id}
                    pulse={pulseSupportId === s.id && !reducedMotion}
                    cardOpen={open}
                    cardBelow={open && cardBelow(s, dy)}
                    canSelect={canSelect}
                    openLabel={mode === "admin" ? "Voir le Porteur" : undefined}
                    onActivate={() => {
                      if (draggingRef.current) return;
                      onMarkerActivate(s.id);
                    }}
                    onToggleSelect={() => onToggleSupport(s.id)}
                    onOpen={onOpenPorteur ? () => onOpenPorteur(s.id) : undefined}
                    onCardChange={(next) => {
                      if (draggingRef.current) return;
                      setCardSupportId(next ? s.id : cardSupportId === s.id ? null : cardSupportId);
                      onHoverSupport?.(next ? s.id : null);
                    }}
                  />
                </SpiderFan>
              </MapMarker>
            );
          })
        : null}

      {map && lastMeasure && measurePoints.length >= 2 ? (
        <MapMarker map={map} lngLat={lastMeasure} anchor="bottom" offset={[0, -10]} zIndex={35}>
          <span className="tpub-map-surface pointer-events-none block rounded-full px-2.5 py-1 font-display text-xs font-semibold text-ink-strong tabular">
            {formatDistance(polylineLength(measurePoints))}
          </span>
        </MapMarker>
      ) : null}

      {map && ui.tool === "catchment" && ui.catchment.center ? (
        <CatchmentHandles
          key="catchment"
          map={map}
          center={ui.catchment.center}
          radiusKm={ui.catchment.radiusKm}
          onCenter={(c) => dispatch({ type: "catchment-center", center: c })}
          onRadius={(km) => dispatch({ type: "catchment-radius", radiusKm: km })}
        />
      ) : null}

      {map && activeZone && activeZone.radiusKm !== null && ui.tool === "none" ? (
        <ZoneRadiusHandle
          key={`radius-${activeZone.id}`}
          map={map}
          zone={activeZone}
          previewKm={radiusPreview?.zoneId === activeZone.id ? radiusPreview.radiusKm : null}
          onPreview={(km) =>
            setRadiusPreview(km === null ? null : { zoneId: activeZone.id, radiusKm: km })
          }
          onCommit={(km) => void commitRadius(activeZone.id, km)}
        />
      ) : null}

      {map && userLocation ? (
        <MapMarker map={map} lngLat={userLocation} zIndex={4}>
          <span className="relative block size-4" role="img" aria-label="Votre position">
            <span
              aria-hidden="true"
              className="tpub-map-pulse absolute inset-0 rounded-full bg-brand-blue-text/50"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-ink-strong bg-brand-blue-text shadow-blue"
            />
          </span>
        </MapMarker>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------
const HANDLE_CLASS =
  "grid size-6 cursor-grab place-items-center rounded-full border-2 border-ink-strong bg-brand-blue-text shadow-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue-text active:cursor-grabbing";

function CatchmentHandles({
  map,
  center,
  radiusKm,
  onCenter,
  onRadius,
}: {
  map: MapLibreMap;
  center: LngLat;
  radiusKm: number;
  onCenter: (c: LngLat) => void;
  onRadius: (km: number) => void;
}) {
  const [dragPos, setDragPos] = useState<LngLat | null>(null);
  const handle = dragPos ?? radiusHandlePosition(center, radiusKm);
  const nudge = (key: string, shift: boolean) => {
    const step = shift ? 1 : 0.1;
    if (key === "ArrowRight" || key === "ArrowUp") onRadius(radiusKm + step);
    else if (key === "ArrowLeft" || key === "ArrowDown") onRadius(radiusKm - step);
    else return false;
    return true;
  };
  return (
    <>
      <MapMarker map={map} lngLat={center} draggable zIndex={36} onDragEnd={onCenter}>
        <span
          role="img"
          aria-label="Centre de la zone de chalandise (déplaçable)"
          className="grid size-7 cursor-grab place-items-center rounded-full border-2 border-brand-blue-text bg-bg shadow-blue"
        >
          <span aria-hidden="true" className="size-2 rounded-full bg-brand-blue-text" />
        </span>
      </MapMarker>
      <MapMarker
        map={map}
        lngLat={handle}
        draggable
        zIndex={37}
        onDrag={(p) => {
          setDragPos(p);
          onRadius(haversineDistance(center, p) / 1000);
        }}
        onDragEnd={(p) => {
          setDragPos(null);
          onRadius(haversineDistance(center, p) / 1000);
        }}
      >
        <button
          type="button"
          role="slider"
          aria-label="Rayon de la zone de chalandise"
          aria-valuemin={0.2}
          aria-valuemax={20}
          aria-valuenow={radiusKm}
          aria-valuetext={formatRadiusKm(radiusKm)}
          onKeyDown={(e) => {
            if (nudge(e.key, e.shiftKey)) e.preventDefault();
          }}
          className={HANDLE_CLASS}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-bg" />
        </button>
      </MapMarker>
    </>
  );
}

function ZoneRadiusHandle({
  map,
  zone,
  previewKm,
  onPreview,
  onCommit,
}: {
  map: MapLibreMap;
  zone: ZoneResponse;
  previewKm: number | null;
  onPreview: (km: number | null) => void;
  onCommit: (km: number) => void;
}) {
  const center = { lng: zone.longitude, lat: zone.latitude };
  const radius = previewKm ?? zone.radiusKm ?? 1;
  const [dragPos, setDragPos] = useState<LngLat | null>(null);
  const dragging = dragPos !== null;
  return (
    <MapMarker
      map={map}
      lngLat={dragPos ?? radiusHandlePosition(center, radius)}
      draggable
      zIndex={38}
      onDrag={(p) => {
        setDragPos(p);
        onPreview(roundKm(haversineDistance(center, p) / 1000));
      }}
      onDragEnd={(p) => {
        setDragPos(null);
        onCommit(roundKm(haversineDistance(center, p) / 1000));
      }}
    >
      <div className="relative">
        <button
          type="button"
          role="slider"
          aria-label={`Rayon de la zone ${zone.name}. Flèches pour ajuster, Entrée pour valider, Échap pour annuler.`}
          aria-valuemin={RADIUS_MIN_KM}
          aria-valuemax={RADIUS_MAX_KM}
          aria-valuenow={radius}
          aria-valuetext={formatRadiusKm(radius)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 1 : 0.1;
            if (e.key === "ArrowRight" || e.key === "ArrowUp") onPreview(roundKm(radius + step));
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
              onPreview(roundKm(radius - step));
            else if (e.key === "Enter" && previewKm !== null) onCommit(previewKm);
            else if (e.key === "Escape" && previewKm !== null) onPreview(null);
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
          className={cx(HANDLE_CLASS, "bg-brand-orange-text")}
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-bg" />
        </button>
        {dragging || previewKm !== null ? (
          <span className="tpub-map-surface pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded-full px-2 py-0.5 font-display text-[0.75rem] font-semibold whitespace-nowrap text-ink-strong tabular">
            {formatRadiusKm(radius)}
          </span>
        ) : null}
      </div>
    </MapMarker>
  );
}
