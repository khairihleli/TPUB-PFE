"use client";

import { MapPinned } from "lucide-react";
import { useMemo } from "react";

import { activeReservations } from "@/components/campaign/campaign-data";
import { circlesAsMapZones, circlesFromZones, circleName } from "@/components/campaign/zone-model";
import { NetworkMap } from "@/components/map";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { supportsApi } from "@/lib/api/endpoints";
import type { CampaignResponse, ReservationResponse } from "@/lib/api/types";
import { formatCount, formatNumber } from "@/lib/format";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { useResource } from "@/lib/use-resource";

/** Read-only map of the campaign circles and the Porteurs it holds (detail page). */
export function CampaignZonesMap({
  campaign,
  reservations,
}: {
  campaign: CampaignResponse;
  reservations: readonly ReservationResponse[];
}) {
  const circles = useMemo(() => circlesFromZones(campaign.zones), [campaign.zones]);
  const zones = useMemo(() => circlesAsMapZones(circles), [circles]);
  const heldIds = useMemo(
    () => new Set(activeReservations(reservations).map((r) => r.supportId)),
    [reservations],
  );
  const supports = useResource(heldIds.size > 0 ? "detail-supports" : null, (signal) =>
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
  );
  const held = useMemo(
    () => (supports.data ?? []).filter((s) => heldIds.has(s.id)),
    [supports.data, heldIds],
  );

  return (
    <SectionCard
      id="zones"
      icon={MapPinned}
      title="Zones ciblées"
      description={
        circles.length > 0
          ? `${formatCount(circles.length, "zone", "zones")} · ${formatCount(heldIds.size, "Porteur réservé", "Porteurs réservés")}`
          : undefined
      }
    >
      {circles.length === 0 ? (
        <EmptyState
          compact
          icon={<MapPinned />}
          title="Aucune zone ciblée"
          description="La zone se choisit sur la carte, à l'étape « Zone & Porteurs » de l'assistant."
        />
      ) : (
        <>
          <NetworkMap
            mode="explore"
            chrome="compact"
            zones={zones}
            supports={held}
            focusZoneId={zones[0]?.id ?? null}
            height="18rem"
            ariaLabel="Carte des zones ciblées par la campagne"
          />
          <ul className="mt-3 flex flex-col gap-1 text-[0.8125rem] text-ink-soft">
            {(campaign.zones ?? []).map((z, i) => (
              <li key={z.id}>
                <span className="font-semibold text-ink-strong">{circleName(z, i)}</span> · rayon{" "}
                {formatNumber(z.radiusKm)} km · zone TPUB {z.zoneName} ·{" "}
                {formatCount(z.supportsInside, "Porteur dans le cercle", "Porteurs dans le cercle")}
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
