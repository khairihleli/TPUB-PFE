"use client";

import { useMemo } from "react";

import { loadMyCampaigns } from "@/components/espace/espace-data";
import { statisticsApi } from "@/lib/api/endpoints";
import type { CampaignResponse, StatisticsMineResponse, StatisticsRange } from "@/lib/api/types";
import { resourceKeys } from "@/lib/resource-cache";
import { useResource } from "@/lib/use-resource";

export interface AdvertiserData {
  /** `/campaigns/mine` (undefined until it resolves). */
  campaigns: CampaignResponse[] | undefined;
  /** `/mine` failure: the only case that deserves a page-level ErrorState. */
  error: unknown;
  loading: boolean;
  slow: boolean;
  /** Reloads `/mine`. */
  reload: () => void;
  /** `/statistics/mine` for `range` (undefined while loading or failed). */
  stats: StatisticsMineResponse | undefined;
  statsError: unknown;
  statsLoading: boolean;
  reloadStats: () => void;
  refreshing: boolean;
}

/**
 * Advertiser data in two independent halves (FFA-05): campaigns render as soon as `/mine`
 * resolves; figures come from `GET /statistics/mine` (a failure only degrades the figures).
 * Without a range, the backend default applies (last 30 days) and the result is shared cache.
 */
export function useAdvertiserData(range: StatisticsRange = {}): AdvertiserData {
  const mine = useResource("espace:campagnes", (signal) => loadMyCampaigns(signal), {
    cacheKey: resourceKeys.campaignsMine,
  });
  const rangeKey = `${range.from ?? ""}_${range.to ?? ""}`;
  const custom = Boolean(range.from || range.to);
  const stats = useResource(
    `espace:statistiques:${rangeKey}`,
    (signal) => statisticsApi.mine({ from: range.from, to: range.to, signal }),
    custom ? {} : { cacheKey: resourceKeys.statisticsMine },
  );

  return useMemo(
    () => ({
      campaigns: mine.data,
      error: mine.data === undefined ? mine.error : null,
      loading: mine.loading,
      slow: mine.slow ?? false,
      reload: mine.reload,
      stats: stats.data,
      statsError: stats.data === undefined ? stats.error : null,
      statsLoading: stats.data === undefined && !stats.error,
      reloadStats: stats.reload,
      refreshing:
        (mine.loading && mine.data !== undefined) || (stats.loading && stats.data !== undefined),
    }),
    [
      mine.data,
      mine.error,
      mine.loading,
      mine.slow,
      mine.reload,
      stats.data,
      stats.error,
      stats.loading,
      stats.reload,
    ],
  );
}
