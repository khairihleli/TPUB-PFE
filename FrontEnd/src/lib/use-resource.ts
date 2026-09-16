"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isAbortError } from "@/lib/api/errors";
import {
  DEFAULT_STALE_TIME,
  fetchCached,
  getCached,
  isFresh,
  primeCache,
} from "@/lib/resource-cache";

export interface ResourceState<T> {
  data: T | undefined;
  /** Last error (ApiError | ApiTransportError | unknown). Use presentError() to render it. */
  error: unknown;
  /** True while the first load or a manual reload is in flight (not for focus/poll revalidation). */
  loading: boolean;
  /** Re-runs the fetcher (keeps current data visible while reloading). */
  reload: () => void;
  /** Local update after a mutation (e.g. remove an item without refetching). Primes the cache. */
  setData: (updater: T | ((prev: T | undefined) => T)) => void;
  /** True when a foreground load takes longer than `slowAfterMs`. Always set by useResource. */
  slow?: boolean;
  /** When data was last received (null before the first success). Always set by useResource. */
  lastUpdatedAt?: Date | null;
  /** Background revalidation (focus, visibility, polling) in flight. Always set by useResource. */
  revalidating?: boolean;
}

export interface ResourceOptions {
  /** Refetch in the background on window focus / tab visible, throttled. Default true. */
  revalidateOnFocus?: boolean;
  /** Minimum delay between two focus revalidations. Default 30 s. */
  focusThrottleMs?: number;
  /** Background polling interval (ms); paused while the tab is hidden. null/0 = off. */
  pollInterval?: number | null;
  /** Delay before `slow` becomes true. Default 8 s. */
  slowAfterMs?: number;
  /** Shared cache key (resource-cache.ts): consumers with the same key share one request. */
  cacheKey?: string;
  /** Cache freshness when `cacheKey` is set. Default 30 s. */
  staleTime?: number;
}

type Mode = "initial" | "reload" | "background";

/**
 * Client data hook: `useResource(key, fetcher, options?)`.
 * - `key` identifies the request; pass `null` to skip (e.g. waiting for an id).
 * - The fetcher receives an AbortSignal; the previous request is aborted on key change/unmount.
 * - StrictMode guard: the request starts on a macrotask, so the synchronous
 *   mount → unmount → mount of React StrictMode never fires a duplicate call.
 * - Freshness (UX-PLAN §6.3): focus/visibility revalidation (throttled), optional polling,
 *   `slow` flag and `lastUpdatedAt`. Background failures keep the previous data.
 */
export function useResource<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: ResourceOptions = {},
): ResourceState<T> {
  const {
    revalidateOnFocus = true,
    focusThrottleMs = 30_000,
    pollInterval = null,
    slowAfterMs = 8000,
    cacheKey,
    staleTime = DEFAULT_STALE_TIME,
  } = options;
  const cacheId = key === null ? null : (cacheKey ?? null);

  const [data, setDataState] = useState<T | undefined>(() =>
    cacheId ? getCached<T>(cacheId)?.data : undefined,
  );
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(
    () => key !== null && !(cacheId && isFresh(cacheId, staleTime)),
  );
  const [slow, setSlow] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(() => {
    const cached = cacheId ? getCached<T>(cacheId) : undefined;
    return cached ? new Date(cached.updatedAt) : null;
  });
  const [nonce, setNonce] = useState(0);

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const modeRef = useRef<Mode>("initial");
  const lastStartRef = useRef(0);
  const hasDataRef = useRef(data !== undefined);

  useEffect(() => {
    if (key === null) {
      setLoading(false);
      setSlow(false);
      return;
    }
    const mode = modeRef.current;
    modeRef.current = "initial";
    let active = true;

    const cached = cacheId ? getCached<T>(cacheId) : undefined;
    if (mode === "initial" && cacheId && cached && isFresh(cacheId, staleTime)) {
      setDataState(cached.data);
      hasDataRef.current = true;
      setError(null);
      setLoading(false);
      setLastUpdatedAt(new Date(cached.updatedAt));
      lastStartRef.current = cached.updatedAt;
      return () => {
        active = false;
      };
    }

    const controller = new AbortController();
    if (mode === "background") {
      setRevalidating(true);
    } else {
      setLoading(true);
      if (cached) {
        setDataState(cached.data);
        hasDataRef.current = true;
      }
    }
    const slowTimer =
      mode !== "background" && slowAfterMs > 0
        ? setTimeout(() => {
            if (active) setSlow(true);
          }, slowAfterMs)
        : null;

    const timer = setTimeout(() => {
      lastStartRef.current = Date.now();
      const request = cacheId
        ? fetchCached<T>(cacheId, (s) => fetcherRef.current(s), {
            staleTime,
            force: mode !== "initial" || cached !== undefined,
            signal: controller.signal,
          })
        : fetcherRef.current(controller.signal);
      request
        .then((result) => {
          if (!active) return;
          setDataState(result);
          hasDataRef.current = true;
          setError(null);
          setLoading(false);
          setRevalidating(false);
          setSlow(false);
          setLastUpdatedAt(new Date());
        })
        .catch((e: unknown) => {
          if (!active || isAbortError(e) || controller.signal.aborted) return;
          setRevalidating(false);
          setSlow(false);
          if (mode === "background" && hasDataRef.current) return;
          setError(e);
          setLoading(false);
        });
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
      if (slowTimer) clearTimeout(slowTimer);
      controller.abort();
    };
  }, [key, nonce, cacheId, staleTime, slowAfterMs]);

  // Focus / visibility revalidation (throttled).
  useEffect(() => {
    if (key === null || !revalidateOnFocus || typeof window === "undefined") return;
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastStartRef.current < focusThrottleMs) return;
      lastStartRef.current = Date.now();
      modeRef.current = "background";
      setNonce((n) => n + 1);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [key, revalidateOnFocus, focusThrottleMs]);

  // Polling, paused while hidden.
  useEffect(() => {
    if (key === null || !pollInterval || pollInterval <= 0) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      modeRef.current = "background";
      setNonce((n) => n + 1);
    }, pollInterval);
    return () => clearInterval(id);
  }, [key, pollInterval]);

  const reload = useCallback(() => {
    modeRef.current = "reload";
    setNonce((n) => n + 1);
  }, []);

  const setData = useCallback(
    (updater: T | ((prev: T | undefined) => T)) => {
      setDataState((prev) => {
        const next =
          typeof updater === "function" ? (updater as (p: T | undefined) => T)(prev) : updater;
        if (cacheId) primeCache(cacheId, next);
        hasDataRef.current = true;
        return next;
      });
    },
    [cacheId],
  );

  return { data, error, loading, reload, setData, slow, lastUpdatedAt, revalidating };
}
