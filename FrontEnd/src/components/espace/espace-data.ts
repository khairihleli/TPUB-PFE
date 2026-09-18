/**
 * Client-side loaders for the advertiser space (contract §2). Figures come from
 * `/statistics/mine`; these loaders only fetch lists shared by several screens.
 */
import { campaignsApi, supportsApi, zonesApi } from "@/lib/api/endpoints";
import type { CampaignResponse, SupportResponse, ZoneResponse } from "@/lib/api/types";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";

/** `/campaigns/mine` through the shared 30 s cache (same entry as the nav badges and palette). */
export function loadMyCampaigns(
  signal: AbortSignal,
  options: { force?: boolean } = {},
): Promise<CampaignResponse[]> {
  return fetchCached(resourceKeys.campaignsMine, (s) => campaignsApi.mine({ signal: s }), {
    signal,
    force: options.force,
  });
}

export interface NetworkCatalogue {
  zones: ZoneResponse[];
  supports: SupportResponse[];
}

/** Active zones + every Porteur located in one of them. */
export async function loadNetworkCatalogue(signal: AbortSignal): Promise<NetworkCatalogue> {
  const [zones, supports] = await Promise.all([
    zonesApi.active({ signal }),
    supportsApi.all({ signal }),
  ]);
  const activeIds = new Set(zones.map((z) => z.id));
  return {
    zones: [...zones].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    supports: supports
      .filter((s) => activeIds.has(s.zoneId))
      .sort(
        (a, b) => a.zoneName.localeCompare(b.zoneName, "fr") || a.name.localeCompare(b.name, "fr"),
      ),
  };
}
