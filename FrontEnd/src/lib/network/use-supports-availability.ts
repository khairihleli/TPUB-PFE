"use client";

/**
 * Availability of many Porteurs for one period (FLOW-02, FFA-08). Requests run with bounded
 * concurrency and go through the shared 30 s cache, so re-renders and several consumers never
 * multiply `GET /supports/{id}/availability`.
 */
import { useEffect, useMemo, useState } from "react";

import { isAbortError } from "@/lib/api/errors";
import { supportsApi } from "@/lib/api/endpoints";
import type { SupportAvailabilitySlot } from "@/lib/api/types";
import { isRangeFree } from "@/lib/network/availability";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";

export type SupportAvailabilityState = "loading" | "free" | "busy" | "error";

export interface SupportAvailabilityEntry {
  state: SupportAvailabilityState;
  /** Blocking slots overlapping [from, to] (empty while loading or on error). */
  slots: readonly SupportAvailabilitySlot[];
  error?: unknown;
}

export interface UseSupportsAvailabilityOptions {
  /** Parallel requests. Default 4. */
  concurrency?: number;
  /** Skip fetching (e.g. period not chosen yet). Default true. */
  enabled?: boolean;
}

/** Runs `worker` over `items` with at most `limit` in flight. Stops early when aborted. */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length && !signal?.aborted) {
      const item = items[next++] as T;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}

/**
 * `const availability = useSupportsAvailability(ids, campaign.startDate, campaign.endDate);`
 * `availability.get(id)?.state` → "loading" | "free" | "busy" | "error".
 * `from`/`to` are "YYYY-MM-DD"; null disables fetching (every id stays "loading").
 */
export function useSupportsAvailability(
  ids: readonly number[],
  from: string | null | undefined,
  to: string | null | undefined,
  { concurrency = 4, enabled = true }: UseSupportsAvailabilityOptions = {},
): Map<number, SupportAvailabilityEntry> {
  const idsKey = useMemo(() => [...new Set(ids)].sort((a, b) => a - b).join(","), [ids]);
  const [entries, setEntries] = useState<Map<number, SupportAvailabilityEntry>>(() => new Map());

  useEffect(() => {
    const list = idsKey ? idsKey.split(",").map(Number) : [];
    const initial = new Map<number, SupportAvailabilityEntry>();
    for (const id of list) initial.set(id, { state: "loading", slots: [] });
    setEntries(initial);
    if (!enabled || !from || !to || list.length === 0) return;

    const controller = new AbortController();
    const update = (id: number, entry: SupportAvailabilityEntry) => {
      if (controller.signal.aborted) return;
      setEntries((prev) => {
        const next = new Map(prev);
        next.set(id, entry);
        return next;
      });
    };

    void runWithConcurrency(
      list,
      concurrency,
      async (id) => {
        try {
          const slots = await fetchCached(
            resourceKeys.supportAvailability(id, from, to),
            (signal) => supportsApi.availability(id, { from, to }, { signal }),
            { signal: controller.signal },
          );
          update(id, { state: isRangeFree(slots, from, to) ? "free" : "busy", slots });
        } catch (e) {
          if (isAbortError(e) || controller.signal.aborted) return;
          update(id, { state: "error", slots: [], error: e });
        }
      },
      controller.signal,
    );

    return () => controller.abort();
  }, [idsKey, from, to, concurrency, enabled]);

  return entries;
}
