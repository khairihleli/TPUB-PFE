"use client";

import { Crosshair } from "lucide-react";
import { useMemo } from "react";

import { NetworkMap } from "@/components/map";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { formatCoordinates } from "@/components/admin/network-schemas";
import { clampRadiusKm } from "@/components/admin/network-map-model";
import { roundCoord } from "@/lib/network/geo";

/** Id of the draft circle drawn by the picker (never sent to the backend). */
const DRAFT_ZONE_ID = -1;

/**
 * Mini-map coordinate picker for the zone form: click to move the centre, drag the radius handle
 * to resize. The latitude/longitude/radius fields stay the keyboard and screen-reader equivalent.
 */
export function ZoneMapPicker({
  name,
  latitude,
  longitude,
  radiusKm,
  otherZones,
  supports,
  onPick,
  onRadius,
}: {
  name: string;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  /** Existing zones drawn for context (the edited zone excluded). */
  otherZones: readonly ZoneResponse[];
  /** Porteurs drawn for context. */
  supports: readonly SupportResponse[];
  onPick: (lat: number, lng: number) => void;
  onRadius: (km: number) => void;
}) {
  const hasPoint = latitude !== null && longitude !== null;

  const zones = useMemo<ZoneResponse[]>(() => {
    const context = otherZones.map((z) => ({ ...z }));
    if (latitude === null || longitude === null) return context;
    return [
      ...context,
      {
        id: DRAFT_ZONE_ID,
        name: name.trim() || "Nouvelle zone",
        latitude,
        longitude,
        radiusKm: radiusKm !== null && radiusKm > 0 ? radiusKm : null,
        isActive: true,
      },
    ];
  }, [otherZones, name, latitude, longitude, radiusKm]);

  const supportList = useMemo(() => [...supports], [supports]);

  return (
    <div className="flex flex-col gap-2">
      <NetworkMap
        mode="admin"
        chrome="compact"
        zones={zones}
        supports={supportList}
        activeZoneId={hasPoint ? DRAFT_ZONE_ID : null}
        focusZoneId={null}
        height="15rem"
        ariaLabel="Carte de positionnement de la zone"
        onMapClick={(p) => onPick(roundCoord(p.lat), roundCoord(p.lng))}
        onZoneRadiusChange={(zoneId, km) => {
          if (zoneId === DRAFT_ZONE_ID) onRadius(clampRadiusKm(km));
        }}
      />
      <p className="flex items-center gap-1.5 text-[0.75rem] text-muted">
        <Crosshair aria-hidden="true" className="size-3.5 shrink-0 text-brand-orange-text" />
        {latitude !== null && longitude !== null
          ? `Centre : ${formatCoordinates(latitude, longitude)}. Cliquez sur la carte pour le déplacer${radiusKm ? ", glissez la poignée pour ajuster le rayon" : ""}.`
          : "Cliquez sur la carte pour placer le centre de la zone, ou saisissez les coordonnées."}
      </p>
    </div>
  );
}
