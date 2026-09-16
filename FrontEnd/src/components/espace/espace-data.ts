/**
 * Client-side loaders for the advertiser space. Always start from `/campaigns/mine`
 * (never trust URL ids: the backend has no ownership checks, contract §7.16).
 */
import { campaignsApi, reservationsApi, supportsApi, zonesApi } from "@/lib/api/endpoints";
import { isAbortError } from "@/lib/api/errors";
import type {
  CampaignResponse,
  ReservationResponse,
  SupportResponse,
  ZoneResponse,
} from "@/lib/api/types";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";

export interface CampaignsWithReservations {
  campaigns: CampaignResponse[];
  reservations: ReservationResponse[];
}

/** Runs `worker` over `items` with at most `limit` requests in flight; keeps input order. */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * All-or-nothing loader (one failing reservation call fails everything).
 * Kept unchanged for existing consumers; advertiser screens use the settled variant below.
 */
export async function loadCampaignsWithReservations(
  signal: AbortSignal,
): Promise<CampaignsWithReservations> {
  const campaigns = await campaignsApi.mine({ signal });
  const lists = await mapWithLimit(campaigns, 4, (c) =>
    reservationsApi.byCampaign(c.id, { signal }),
  );
  return { campaigns, reservations: lists.flat() };
}

// ---------------------------------------------------------------------------
// Partial-failure loaders (FFA-05, FLOW-12)
// ---------------------------------------------------------------------------

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

export interface ReservationsSettled {
  /** Every loaded reservation (campaigns whose call failed contribute nothing). */
  reservations: ReservationResponse[];
  /** Loaded lists only: a missing id means « unknown », never « no reservation ». */
  reservationsByCampaign: ReadonlyMap<number, ReservationResponse[]>;
  /** Campaigns whose reservation call failed (render a PartialNotice on dependent tiles). */
  failedCampaignIds: number[];
}

export interface CampaignsWithReservationsSettled extends ReservationsSettled {
  campaigns: CampaignResponse[];
}

type Settled<T> = { ok: true; value: T } | { ok: false; reason: unknown };

/**
 * Reservations of each campaign with `Promise.allSettled` semantics (at most 4 in flight).
 * Successful lists are cached 30 s per campaign, so « Réessayer » only refetches the failures.
 * Aborts are rethrown (the consumer went away); every other failure is recorded per campaign.
 */
export async function loadReservationsSettled(
  campaigns: readonly Pick<CampaignResponse, "id">[],
  signal: AbortSignal,
  options: { force?: boolean } = {},
): Promise<ReservationsSettled> {
  const results = await mapWithLimit(campaigns, 4, (c): Promise<Settled<ReservationResponse[]>> =>
    fetchCached(
      resourceKeys.reservationsByCampaign(c.id),
      (s) => reservationsApi.byCampaign(c.id, { signal: s }),
      { signal, force: options.force },
    ).then(
      (value) => ({ ok: true, value }),
      (reason: unknown) => ({ ok: false, reason }),
    ),
  );
  const reservationsByCampaign = new Map<number, ReservationResponse[]>();
  const failedCampaignIds: number[] = [];
  results.forEach((result, index) => {
    const id = (campaigns[index] as Pick<CampaignResponse, "id">).id;
    if (result.ok) {
      reservationsByCampaign.set(id, result.value);
      return;
    }
    if (isAbortError(result.reason) || signal.aborted) throw result.reason;
    failedCampaignIds.push(id);
  });
  return {
    reservations: [...reservationsByCampaign.values()].flat(),
    reservationsByCampaign,
    failedCampaignIds,
  };
}

/**
 * `/mine` then every campaign's reservations, settled: only a `/mine` failure rejects.
 * Screens that must show campaigns before reservations arrive call the two halves separately
 * (see use-advertiser-data.ts).
 */
export async function loadCampaignsWithReservationsSettled(
  signal: AbortSignal,
  options: { force?: boolean } = {},
): Promise<CampaignsWithReservationsSettled> {
  const campaigns = await loadMyCampaigns(signal, options);
  const settled = await loadReservationsSettled(campaigns, signal, options);
  return { campaigns, ...settled };
}

export interface NetworkLookups {
  /** null when the lookup failed: names fall back to « Porteur n° … ». */
  supports: SupportResponse[] | null;
  zones: ZoneResponse[] | null;
}

/** Name lookups are a nice-to-have: a failure degrades names, it never blocks the page. */
export async function loadNetworkLookups(signal: AbortSignal): Promise<NetworkLookups> {
  const [supports, zones] = await Promise.allSettled([
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
    fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
  ]);
  for (const result of [supports, zones]) {
    if (result.status === "rejected" && isAbortError(result.reason)) throw result.reason;
  }
  return {
    supports: supports.status === "fulfilled" ? supports.value : null,
    zones: zones.status === "fulfilled" ? zones.value : null,
  };
}

export interface NetworkCatalogue {
  zones: ZoneResponse[];
  supports: SupportResponse[];
}

/** Active zones + every screen located in one of them. */
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
