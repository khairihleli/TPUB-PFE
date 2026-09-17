"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { MapMarker } from "@/components/map/map-marker";
import { PRESENCE_LABEL } from "@/components/supervision/supervision-model";
import type { SupervisionSupportRow } from "@/lib/api/types-supervision";
import { cx } from "@/lib/cx";
import { buildMapStyle, MAPLIBRE_LOCALE_FR } from "@/lib/network/map-style";

const TUNIS: [number, number] = [10.18, 36.8];

const DOT_TONE: Record<SupervisionSupportRow["presence"], string> = {
  EN_LIGNE: "border-success bg-success/80",
  HORS_LIGNE: "border-danger bg-danger/80",
  INCONNU: "border-line-strong bg-surface-3",
};

export interface SupervisionMapProps {
  supports: readonly SupervisionSupportRow[];
  /** Porteur focused by `?porteur=` or by a click in the table. */
  selectedId: number | null;
  onSelect: (supportId: number) => void;
  /** Porteur that just diffused: its marker pulses. */
  pulsingId: number | null;
}

/**
 * Live map of the supervision screen (docs/round2-contract.md §5.8). Markers are coloured by
 * presence and pulse on a new diffusion. Every interaction has a keyboard equivalent: the markers
 * are buttons, and the « Porteurs » table below is the non-visual equivalent of the map.
 */
export function SupervisionMap({ supports, selectedId, onSelect, pulsingId }: SupervisionMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const instance = new MapLibreMap({
      container,
      style: buildMapStyle("sombre"),
      center: TUNIS,
      zoom: 9,
      attributionControl: { compact: true },
      locale: MAPLIBRE_LOCALE_FR,
      cooperativeGestures: true,
    });
    instance.addControl(new NavigationControl({ visualizePitch: false }), "top-right");
    instance.on("load", () => setMap(instance));
    return () => {
      setMap(null);
      instance.remove();
    };
  }, []);

  useEffect(() => {
    if (!map || selectedId === null) return;
    const target = supports.find((s) => s.supportId === selectedId);
    if (!target) return;
    map.easeTo({ center: [target.longitude, target.latitude], zoom: Math.max(map.getZoom(), 12) });
  }, [map, selectedId, supports]);

  return (
    <div className="relative h-[24rem] overflow-hidden rounded-card border border-line bg-surface-2 sm:h-[28rem]">
      <div ref={containerRef} className="absolute inset-0" />
      {map
        ? supports.map((support) => (
            <MapMarker key={support.supportId} map={map} lngLat={{ lng: support.longitude, lat: support.latitude }}>
              <button
                type="button"
                onClick={() => onSelect(support.supportId)}
                aria-label={`${support.name} · ${PRESENCE_LABEL[support.presence]}`}
                aria-pressed={selectedId === support.supportId}
                className={cx(
                  "size-4 rounded-full border-2 shadow-lift transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
                  DOT_TONE[support.presence],
                  selectedId === support.supportId && "scale-150",
                  pulsingId === support.supportId && "animate-pulse-dot",
                )}
              />
            </MapMarker>
          ))
        : null}
      {map === null ? (
        <p role="status" className="absolute inset-0 grid place-items-center text-sm text-muted">
          Chargement de la carte…
        </p>
      ) : null}
    </div>
  );
}
