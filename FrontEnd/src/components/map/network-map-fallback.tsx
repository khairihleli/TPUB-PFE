"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from "react";

import {
  createProjection,
  findDenseCluster,
  isValidCoordinate,
  type GeoBounds,
  type Projection,
} from "@/components/espace/map-projection";
import { TunisiaMap } from "@/components/espace/tunisia-map";
import type { SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { bboxOf, formatRadiusKm, type LngLat } from "@/lib/network/geo";
import { gridCluster } from "@/lib/network/geojson";
import { spiderfy, type SpiderPlacement } from "@/lib/network/spiderfy";

import { ClusterMarker, PorteurMarker, SpiderFan, SpiderLeg } from "@/components/map/map-markers";
import type { EngineProps, MapController } from "@/components/map/types";

/** Must match TunisiaMap's internal constants (viewBox height and padding). */
const SVG_HEIGHT = 520;
const SVG_PAD = 14;
/** Grid cell (viewBox units) for the opt-in « Regrouper les Porteurs proches ». */
const CELL = 22;
/** Porteurs closer than this (viewBox units) on the country map form a dense area → inset. */
const DENSE_UNITS = 24;
/** A « Vue rapprochée » inset is drawn from this many Porteurs piled up in one area. */
const DENSE_MIN_PORTEURS = 3;
const INSET_HEIGHT = 240;
/** Fallback marker (size « sm ») diameter + selection ring, px. */
const SVG_MARKER_PX = 30;
/** Grand Tunis (Tunis, Ariana, Ben Arous, La Manouba, La Marsa, Carthage). */
const GRAND_TUNIS: GeoBounds = { minLat: 36.6, maxLat: 37.05, minLng: 9.85, maxLng: 10.45 };

/** Rendered px per viewBox unit of an element (1 until measured, e.g. in tests). */
function useUnitScale(ref: RefObject<HTMLElement | null>, viewBoxWidth: number): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setScale(width / viewBoxWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, viewBoxWidth]);
  return scale;
}

interface ProjectedPorteur {
  support: SupportResponse;
  /** Percent of the frame (left/top). */
  left: number;
  top: number;
}

/**
 * SVG fallback when WebGL is unavailable: wraps the existing `TunisiaMap` and overlays accessible
 * Porteur/zone buttons at their exact projected positions. Every Porteur is drawn individually
 * (grouping only with « Regrouper les Porteurs proches »); overlapping markers are fanned out
 * with a leader line to the exact point, and when Porteurs pile up in one area (Grand Tunis) they
 * are shown in a « Vue rapprochée » inset, like the original network map. Reduced tool set: no
 * zoom/pitch/basemap/measure; selection, search, filters, catchment and click-to-place work.
 */
export function NetworkMapFallback({
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
  canSelect,
  onMarkerActivate,
  onToggleSupport,
  onZoneActivate,
  onClusterActivate,
  onMapPoint,
  onHoverSupport,
  onOpenPorteur,
  onReady,
  pickPoints,
}: EngineProps) {
  const projection = useMemo(() => createProjection(undefined, SVG_HEIGHT), []);
  const frameRef = useRef<HTMLDivElement>(null);
  const vbW = projection.width + SVG_PAD * 2;
  const vbH = projection.height + SVG_PAD * 2;
  const frameScale = useUnitScale(frameRef, vbW);

  const toPercent = (lat: number, lng: number) => {
    const p = projection.project(lat, lng);
    return {
      left: ((p.x + SVG_PAD) / vbW) * 100,
      top: ((p.y + SVG_PAD) / vbH) * 100,
      inside: p.inside,
    };
  };

  // Controller: camera operations are no-ops on the static SVG; flyTo opens the card instead.
  const stateRef = useRef({ supports, setCardSupportId });
  stateRef.current = { supports, setCardSupportId };
  useEffect(() => {
    const { bounds } = projection;
    const controller: MapController = {
      kind: "svg",
      canZoom: false,
      zoomIn: () => undefined,
      zoomOut: () => undefined,
      resetView: () => stateRef.current.setCardSupportId(null),
      flyTo: () => undefined,
      fitBounds: () => undefined,
      getCenter: () => ({
        lng: (bounds.minLng + bounds.maxLng) / 2,
        lat: (bounds.minLat + bounds.maxLat) / 2,
      }),
    };
    onReady(controller);
  }, [projection, onReady]);

  const located = useMemo(
    () =>
      ui.layers.porteurs
        ? visibleSupports.filter((s) => isValidCoordinate(s.latitude, s.longitude))
        : [],
    [visibleSupports, ui.layers.porteurs],
  );

  // Dense area → « Vue rapprochée » inset (only when every Porteur is drawn individually).
  const dense = useMemo(() => {
    if (ui.clusterPorteurs || located.length < DENSE_MIN_PORTEURS) return null;
    const cluster = findDenseCluster(
      located.map((s) => ({
        id: s.id,
        latitude: s.latitude,
        longitude: s.longitude,
        radiusKm: 0.8,
      })),
      projection,
      DENSE_UNITS,
    );
    if (!cluster || cluster.ids.length < DENSE_MIN_PORTEURS) return null;
    return { ids: new Set(cluster.ids), bounds: cluster.bounds };
  }, [located, projection, ui.clusterPorteurs]);

  const [mainPorteurs, insetPorteurs] = useMemo(
    () =>
      dense
        ? [located.filter((s) => !dense.ids.has(s.id)), located.filter((s) => dense.ids.has(s.id))]
        : [located, []],
    [dense, located],
  );

  const clusters = useMemo(
    () =>
      ui.clusterPorteurs
        ? gridCluster(
            mainPorteurs,
            (s) => ({ lng: s.longitude, lat: s.latitude }),
            (p) => projection.project(p.lat, p.lng),
            CELL,
            (s) => s.id,
          )
        : null,
    [ui.clusterPorteurs, mainPorteurs, projection],
  );
  const pointPorteurs: ProjectedPorteur[] = (
    clusters ? clusters.flatMap((c) => (c.kind === "point" ? [c.item] : [])) : mainPorteurs
  ).map((support) => ({ support, ...toPercent(support.latitude, support.longitude) }));

  const pointTool = ui.tool !== "none" || pickPoints === true;

  const onFrameClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!pointTool) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const vx = ((e.clientX - rect.left) / rect.width) * vbW - SVG_PAD;
    const vy = ((e.clientY - rect.top) / rect.height) * vbH - SVG_PAD;
    const { bounds, width, height } = projection;
    const point: LngLat = {
      lng: bounds.minLng + (vx / width) * (bounds.maxLng - bounds.minLng),
      lat: bounds.maxLat - (vy / height) * (bounds.maxLat - bounds.minLat),
    };
    onMapPoint(point);
  };

  const selectedZoneId = activeZoneId ?? selection.zoneIds[0] ?? null;
  const zoneCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of supports) m.set(s.zoneId, (m.get(s.zoneId) ?? 0) + 1);
    return m;
  }, [supports]);

  const catchment = ui.tool === "catchment" ? ui.catchment : null;

  const markerProps = {
    selection,
    mode,
    highlightSupportId,
    pulseSupportId,
    cardSupportId,
    setCardSupportId,
    canSelect,
    reducedMotion,
    onMarkerActivate,
    onToggleSupport,
    onHoverSupport,
    onOpenPorteur,
  };

  return (
    <div className="absolute inset-0 bg-bg px-3 pt-[6.5rem] pb-14 md:px-20 md:pt-16 md:pb-12">
      <div
        aria-hidden="true"
        className="app-ground pointer-events-none absolute inset-0 opacity-60"
      />
      <div className="relative flex h-full w-full items-center justify-center gap-3 [container-type:size] md:gap-6">
        {/* the frame keeps the SVG aspect ratio so overlay percentages line up */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- pointer shortcut; keyboard users place points with the tool panel buttons */}
        <div
          ref={frameRef}
          data-map-frame=""
          onClick={onFrameClick}
          className={cx("relative shrink-0", pointTool && "cursor-crosshair")}
          style={{
            aspectRatio: `${vbW} / ${vbH}`,
            width: `min(${dense ? 56 : 100}cqw, calc(100cqh * ${(vbW / vbH).toFixed(4)}))`,
          }}
        >
          <TunisiaMap
            zones={ui.layers.zones ? zones : []}
            supports={[]}
            selectedZoneId={selectedZoneId}
            insetBounds={dense?.bounds ?? null}
            className="absolute inset-0"
          />

          {catchment?.center ? (
            <CatchmentOverlay
              center={catchment.center}
              radiusKm={catchment.radiusKm}
              toPercent={toPercent}
              kmToPercent={(km) => (projection.kmToUnits(km) / vbH) * 100}
            />
          ) : null}

          {ui.layers.zones && ui.layers.etiquettes
            ? zones
                .filter((z) => isValidCoordinate(z.latitude, z.longitude))
                .map((z) => {
                  const pos = toPercent(z.latitude, z.longitude);
                  const selected = selection.zoneIds.includes(z.id);
                  const n = zoneCounts.get(z.id) ?? 0;
                  return (
                    <button
                      key={`zone-${z.id}`}
                      type="button"
                      aria-label={`Zone ${z.name} — ${n === 0 ? "aucun Porteur" : n === 1 ? "1 Porteur" : `${n} Porteurs`}${z.radiusKm ? `, rayon ${formatRadiusKm(z.radiusKm)}` : ""} — ${canSelect ? "sélectionner ou retirer la zone" : "afficher la zone"}`}
                      aria-pressed={canSelect ? selected : undefined}
                      onClick={() => onZoneActivate(z.id)}
                      style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
                      className={cx(
                        "absolute z-[1] size-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
                        selected ? "border-brand-blue-text" : "border-brand-orange-text",
                      )}
                    />
                  );
                })
            : null}

          {/* Porteurs shown in the inset: exact dots only on the country map */}
          {insetPorteurs.map((s) => {
            const pos = toPercent(s.latitude, s.longitude);
            return (
              <span
                key={`dense-${s.id}`}
                aria-hidden="true"
                className="pointer-events-none absolute z-[2] size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-strong"
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              />
            );
          })}

          {clusters?.map((item) => {
            if (item.kind !== "cluster") return null;
            const pos = toPercent(item.lngLat.lat, item.lngLat.lng);
            const selectedCount = item.items.filter((s) =>
              selection.supportIds.includes(s.id),
            ).length;
            const ids = item.items.map((s) => s.id);
            const bbox = bboxOf(item.items.map((s) => ({ lng: s.longitude, lat: s.latitude })));
            return (
              <div
                key={item.key}
                className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              >
                <ClusterMarker
                  size="sm"
                  count={item.count}
                  selectedCount={selectedCount}
                  label={`Groupe de ${item.count} Porteurs${selectedCount ? `, dont ${selectedCount} sélectionnés` : ""} — afficher la liste`}
                  onActivate={() => bbox && onClusterActivate(ids, bbox)}
                />
              </div>
            );
          })}

          <SpiderMarkers
            items={pointPorteurs}
            // px per percent of the frame
            pxPerPercentX={(vbW * frameScale) / 100}
            pxPerPercentY={(vbH * frameScale) / 100}
            cardBelowFrom={45}
            {...markerProps}
          />
        </div>

        {dense ? (
          <DenseInset
            bounds={dense.bounds}
            porteurs={insetPorteurs}
            zones={ui.layers.zones ? zones : []}
            selectedZoneId={selectedZoneId}
            {...markerProps}
          />
        ) : null}
      </div>
    </div>
  );
}

type MarkerCommonProps = Pick<
  EngineProps,
  | "selection"
  | "mode"
  | "highlightSupportId"
  | "pulseSupportId"
  | "cardSupportId"
  | "setCardSupportId"
  | "canSelect"
  | "reducedMotion"
  | "onMarkerActivate"
  | "onToggleSupport"
  | "onHoverSupport"
  | "onOpenPorteur"
>;

/**
 * Porteur markers at exact percent positions; overlapping ones (in px) are fanned out around
 * their group with a leader line back to the exact point (same spiderfy as the WebGL map).
 */
function SpiderMarkers({
  items,
  pxPerPercentX,
  pxPerPercentY,
  cardBelowFrom,
  selection,
  mode,
  highlightSupportId,
  pulseSupportId,
  cardSupportId,
  setCardSupportId,
  canSelect,
  reducedMotion,
  onMarkerActivate,
  onToggleSupport,
  onHoverSupport,
  onOpenPorteur,
}: MarkerCommonProps & {
  items: ProjectedPorteur[];
  pxPerPercentX: number;
  pxPerPercentY: number;
  /** Cards open below markers above this top percentage. */
  cardBelowFrom: number;
}) {
  const layout = useMemo(
    () =>
      spiderfy(
        items.map((p) => ({
          id: p.support.id,
          x: p.left * pxPerPercentX,
          y: p.top * pxPerPercentY,
        })),
        { markerSize: SVG_MARKER_PX },
      ),
    [items, pxPerPercentX, pxPerPercentY],
  );

  return (
    <>
      {items.map((p) => {
        const place: SpiderPlacement<number> | undefined = layout.byId.get(p.support.id);
        if (!place?.displaced) return null;
        return (
          <span
            key={`leg-${p.support.id}`}
            className="pointer-events-none absolute z-[2] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.left}%`, top: `${p.top}%` }}
          >
            <SpiderLeg
              dx={place.offset.x}
              dy={place.offset.y}
              highlighted={highlightSupportId === p.support.id || cardSupportId === p.support.id}
            />
          </span>
        );
      })}
      {items.map((p) => {
        const s = p.support;
        const place = layout.byId.get(s.id);
        const displaced = place?.displaced === true;
        const dx = displaced ? place.offset.x : 0;
        const dy = displaced ? place.offset.y : 0;
        const open = cardSupportId === s.id;
        const style: CSSProperties = {
          left: `${p.left}%`,
          top: `${p.top}%`,
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
        };
        return (
          <div
            key={`p-${s.id}`}
            className={cx("absolute", open ? "z-30" : displaced ? "z-[4]" : "z-[3]")}
            style={style}
          >
            <SpiderFan
              dx={dx}
              dy={dy}
              group={displaced ? (place.group ?? null) : null}
              reducedMotion={reducedMotion}
            >
              <PorteurMarker
                size="sm"
                support={s}
                selected={selection.supportIds.includes(s.id)}
                highlighted={highlightSupportId === s.id}
                pulse={pulseSupportId === s.id && !reducedMotion}
                cardOpen={open}
                cardBelow={p.top < cardBelowFrom}
                canSelect={canSelect}
                openLabel={mode === "admin" ? "Voir le Porteur" : undefined}
                onActivate={() => onMarkerActivate(s.id)}
                onToggleSelect={() => onToggleSupport(s.id)}
                onOpen={onOpenPorteur ? () => onOpenPorteur(s.id) : undefined}
                onCardChange={(next) => {
                  setCardSupportId(next ? s.id : cardSupportId === s.id ? null : cardSupportId);
                  onHoverSupport?.(next ? s.id : null);
                }}
              />
            </SpiderFan>
          </div>
        );
      })}
    </>
  );
}

/** « Vue rapprochée » of the densest area: exact positions at a closer scale. */
function DenseInset({
  bounds,
  porteurs,
  zones,
  selectedZoneId,
  ...markerProps
}: MarkerCommonProps & {
  bounds: GeoBounds;
  porteurs: SupportResponse[];
  zones: EngineProps["zones"];
  selectedZoneId: number | null;
}) {
  const projection: Projection = useMemo(() => createProjection(bounds, INSET_HEIGHT), [bounds]);
  const frameRef = useRef<HTMLDivElement>(null);
  const scale = useUnitScale(frameRef, projection.width);
  const { width, height } = projection;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const grandTunis =
    centerLat >= GRAND_TUNIS.minLat &&
    centerLat <= GRAND_TUNIS.maxLat &&
    centerLng >= GRAND_TUNIS.minLng &&
    centerLng <= GRAND_TUNIS.maxLng;
  const title = grandTunis ? "Vue rapprochée — Grand Tunis" : "Vue rapprochée";

  const items: ProjectedPorteur[] = porteurs.map((support) => {
    const p = projection.project(support.latitude, support.longitude);
    return { support, left: (p.x / width) * 100, top: (p.y / height) * 100 };
  });
  const halos = zones
    .filter((z) => isValidCoordinate(z.latitude, z.longitude))
    .map((z) => ({ zone: z, ...projection.project(z.latitude, z.longitude) }))
    .filter((z) => z.inside);
  const cols = 4;

  return (
    <section
      aria-label={`${title} : ${porteurs.length} Porteurs à leur position exacte`}
      data-map-inset=""
      className="tpub-map-surface relative flex shrink-0 flex-col rounded-card"
      style={{ width: "min(40cqw, 22rem, calc(100cqh - 2.5rem))" }}
    >
      <p className="border-b border-line px-3 py-2 font-label text-[0.75rem] font-semibold text-muted-2">
        {title}
      </p>
      <div
        ref={frameRef}
        className="relative w-full"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0 block h-full w-full"
        >
          {Array.from({ length: cols - 1 }, (_, i) => (
            <g key={i}>
              <line
                x1={(width / cols) * (i + 1)}
                x2={(width / cols) * (i + 1)}
                y1={0}
                y2={height}
                strokeWidth={0.6}
                className="stroke-line"
              />
              <line
                x1={0}
                x2={width}
                y1={(height / cols) * (i + 1)}
                y2={(height / cols) * (i + 1)}
                strokeWidth={0.6}
                className="stroke-line"
              />
            </g>
          ))}
          {halos.map((h) => (
            <circle
              key={h.zone.id}
              cx={h.x}
              cy={h.y}
              r={Math.max(6, projection.kmToUnits(h.zone.radiusKm ?? 0))}
              strokeWidth={1}
              strokeDasharray={h.zone.id === selectedZoneId ? undefined : "3 3"}
              className={
                h.zone.id === selectedZoneId
                  ? "fill-brand-blue-text/15 stroke-brand-blue-text"
                  : "fill-brand-orange/10 stroke-brand-orange-text/50"
              }
            />
          ))}
        </svg>
        <SpiderMarkers
          items={items}
          pxPerPercentX={(width * scale) / 100}
          pxPerPercentY={(height * scale) / 100}
          cardBelowFrom={50}
          {...markerProps}
        />
      </div>
    </section>
  );
}

function CatchmentOverlay({
  center,
  radiusKm,
  toPercent,
  kmToPercent,
}: {
  center: LngLat;
  radiusKm: number;
  toPercent: (lat: number, lng: number) => { left: number; top: number };
  kmToPercent: (km: number) => number;
}) {
  const pos = toPercent(center.lat, center.lng);
  // height-relative diameter; aspect-square keeps it round
  const diameter = Math.max(1.2, kmToPercent(radiusKm) * 2);
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute z-[1] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-brand-blue-text bg-brand-blue-text/12"
      style={{ left: `${pos.left}%`, top: `${pos.top}%`, height: `${diameter}%` }}
    />
  );
}
