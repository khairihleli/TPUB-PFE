"use client";

import { Marker, type Map as MapLibreMap, type PositionAnchor } from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { LngLat } from "@/lib/network/geo";

export interface MapMarkerProps {
  map: MapLibreMap;
  /** Exact position: with the default « center » anchor, the centre of the content sits here. */
  lngLat: LngLat;
  children: ReactNode;
  anchor?: PositionAnchor;
  /** Pixel offset [x, y] from the anchor (kept in sync: fanned-out markers). */
  offset?: [number, number];
  draggable?: boolean;
  zIndex?: number;
  /** False = decorative marker that lets clicks through to the map (leader lines, dots). */
  interactive?: boolean;
  onDragStart?: () => void;
  onDrag?: (lngLat: LngLat) => void;
  onDragEnd?: (lngLat: LngLat) => void;
}

/**
 * React-rendered HTML marker: MapLibre positions a detached element, React portals the content
 * (accessible buttons, cards) into it. MapLibre's default role/aria-label on the wrapper are
 * removed so the inner button is the only interactive node. The element carries no CSS
 * translate of its own: MapLibre's transform places the content's centre exactly on `lngLat`
 * (+ `offset`), whatever the zoom.
 */
export function MapMarker({
  map,
  lngLat,
  children,
  anchor = "center",
  offset,
  draggable = false,
  zIndex,
  interactive = true,
  onDragStart,
  onDrag,
  onDragEnd,
}: MapMarkerProps) {
  const [element] = useState(() => {
    const el = document.createElement("div");
    el.className = "tpub-map-marker";
    return el;
  });
  const markerRef = useRef<Marker | null>(null);
  const handlers = useRef({ onDragStart, onDrag, onDragEnd });
  handlers.current = { onDragStart, onDrag, onDragEnd };
  const initial = useRef({ lngLat, draggable });
  const dx = offset?.[0] ?? 0;
  const dy = offset?.[1] ?? 0;
  const offsetRef = useRef<[number, number]>([dx, dy]);
  offsetRef.current = [dx, dy];

  useEffect(() => {
    const init = initial.current;
    const marker = new Marker({
      element,
      anchor,
      offset: offsetRef.current,
      draggable: init.draggable,
    })
      .setLngLat([init.lngLat.lng, init.lngLat.lat])
      .addTo(map);
    element.removeAttribute("role");
    element.removeAttribute("aria-label");
    element.removeAttribute("tabindex");
    const read = (): LngLat => {
      const p = marker.getLngLat();
      return { lng: p.lng, lat: p.lat };
    };
    marker.on("dragstart", () => handlers.current.onDragStart?.());
    marker.on("drag", () => handlers.current.onDrag?.(read()));
    marker.on("dragend", () => handlers.current.onDragEnd?.(read()));
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
  }, [map, element, anchor]);

  useEffect(() => {
    markerRef.current?.setLngLat([lngLat.lng, lngLat.lat]);
  }, [lngLat.lng, lngLat.lat]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const current = marker.getOffset();
    if (current.x !== dx || current.y !== dy) marker.setOffset([dx, dy]);
  }, [dx, dy]);

  useEffect(() => {
    markerRef.current?.setDraggable(draggable);
  }, [draggable]);

  useEffect(() => {
    element.style.zIndex = zIndex === undefined ? "" : String(zIndex);
  }, [element, zIndex]);

  useEffect(() => {
    element.style.pointerEvents = interactive ? "" : "none";
  }, [element, interactive]);

  return createPortal(children, element);
}
