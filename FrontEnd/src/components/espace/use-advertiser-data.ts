"use client";

import { useMemo } from "react";

import {
  loadMyCampaigns,
  loadReservationsSettled,
  type ReservationsSettled,
} from "@/components/espace/espace-data";
import type { CampaignResponse, ReservationResponse } from "@/lib/api/types";
import { resourceKeys } from "@/lib/resource-cache";
import { useResource } from "@/lib/use-resource";

export interface AdvertiserData {
  /** `/campaigns/mine` (undefined until it resolves). */
  campaigns: CampaignResponse[] | undefined;
  /** `/mine` failure: the only case that deserves a page-level ErrorState. */
  error: unknown;
  loading: boolean;
  slow: boolean;
  /** Reloads `/mine` (and, when the ids change, the reservations). */
  reload: () => void;
  /** Loaded reservations; undefined while the reservation calls are in flight. */
  reservations: ReservationResponse[] | undefined;
  reservationsByCampaign: ReadonlyMap<number, ReservationResponse[]> | undefined;
  failedCampaignIds: readonly number[];
  reservationsLoading: boolean;
  /** Some reservation calls failed: dependent tiles show a PartialNotice. */
  partial: boolean;
  /** Refetches the failed reservation calls only (successful lists stay cached). */
  retryReservations: () => void;
  refreshing: boolean;
}

const NO_FAILURES: readonly number[] = [];

/**
 * Two-stage advertiser data (FFA-05, FLOW-12): campaigns render as soon as `/mine` resolves;
 * reservations follow with allSettled semantics, so one failing call only degrades the tiles
 * that depend on it.
 */
export function useAdvertiserData(): AdvertiserData {
  const mine = useResource("espace:campagnes", (signal) => loadMyCampaigns(signal), {
    cacheKey: resourceKeys.campaignsMine,
  });
  const campaigns = mine.data;
  const idsKey = campaigns ? campaigns.map((c) => c.id).join(",") : null;
  const resa = useResource<ReservationsSettled>(
    idsKey === null ? null : `espace:reservations:${idsKey}`,
    (signal) => loadReservationsSettled(campaigns ?? [], signal),
  );

  const failedCampaignIds = resa.data?.failedCampaignIds ?? NO_FAILURES;
  const reservationsError = resa.data === undefined && !resa.loading && Boolean(resa.error);

  return useMemo(
    () => ({
      campaigns,
      error: campaigns === undefined ? mine.error : null,
      loading: mine.loading,
      slow: mine.slow ?? false,
      reload: mine.reload,
      reservations: resa.data?.reservations,
      reservationsByCampaign: resa.data?.reservationsByCampaign,
      failedCampaignIds,
      reservationsLoading: campaigns !== undefined && resa.data === undefined && !reservationsError,
      partial: failedCampaignIds.length > 0 || reservationsError,
      retryReservations: resa.reload,
      refreshing:
        (mine.loading && campaigns !== undefined) || (resa.loading && resa.data !== undefined),
    }),
    [
      campaigns,
      mine.error,
      mine.loading,
      mine.slow,
      mine.reload,
      resa.data,
      resa.loading,
      resa.reload,
      failedCampaignIds,
      reservationsError,
    ],
  );
}
