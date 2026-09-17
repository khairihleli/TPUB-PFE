/**
 * Module-level stale-while-revalidate cache (UX-PLAN §11.5), shared by the command palette,
 * nav badges and list screens so one `/campaigns/mine` serves several consumers.
 * Keys are free strings; use the `resourceKeys` helpers so consumers share entries.
 * Client-only in practice (state lives per browser tab); harmless on the server.
 */

import { earliestSignedUrlExpiry } from "@/lib/media-url";

export const DEFAULT_STALE_TIME = 30_000;

/**
 * Round 2 (docs/round2-contract.md §3.5): an entry whose payload contains signed media URLs is
 * dropped after this age, so a stale copy never serves links that are about to expire.
 */
export const SIGNED_MEDIA_TTL_MS = 30 * 60_000;

interface Entry {
  data: unknown;
  updatedAt: number;
  /** Epoch ms after which the entry is dropped (payload with signed media URLs), else null. */
  expiresAt: number | null;
}

const entries = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

/** Canonical keys for shared resources. */
export const resourceKeys = {
  campaignsMine: "campaigns:mine",
  campaignsAll: "campaigns:all",
  supportsAll: "supports:all",
  zonesAll: "zones:all",
  zonesActive: "zones:active",
  emergencies: "emergency:all",
  reservationsByCampaign: (id: number) => `reservations:campaign:${id}`,
  supportAvailability: (id: number, from: string, to: string) =>
    `supports:${id}:availability:${from}:${to}`,
  me: "me",
  statisticsMine: "statistics:mine",
  reservationsMine: "reservations:mine",
  aiDashboard: "ai:dashboard",
  reservationConflicts: "reservations:conflicts",
  campaign: (id: number) => `campaign:${id}`,
  campaignMedia: (id: number) => `campaign:${id}:media`,
  campaignZones: (id: number) => `campaign:${id}:zones`,
  campaignEstimate: (id: number) => `campaign:${id}:estimate`,
  aiReport: (campaignId: number) => `ai:report:${campaignId}`,
} as const;

function notify(key: string): void {
  listeners.get(key)?.forEach((cb) => cb());
}

/** The entry, unless its signed media URLs made it expire (then it is removed). */
function liveEntry(key: string, now = Date.now()): Entry | undefined {
  const entry = entries.get(key);
  if (entry && entry.expiresAt !== null && now >= entry.expiresAt) {
    entries.delete(key);
    return undefined;
  }
  return entry;
}

/** Hard expiry of a payload: `updatedAt + SIGNED_MEDIA_TTL_MS` when it holds signed media URLs. */
export function signedPayloadExpiry(data: unknown, updatedAt: number): number | null {
  return earliestSignedUrlExpiry(data) === null ? null : updatedAt + SIGNED_MEDIA_TTL_MS;
}

export function getCached<T>(key: string): { data: T; updatedAt: number } | undefined {
  const entry = liveEntry(key);
  return entry ? { data: entry.data as T, updatedAt: entry.updatedAt } : undefined;
}

export function isFresh(key: string, staleTime = DEFAULT_STALE_TIME, now = Date.now()): boolean {
  const entry = liveEntry(key, now);
  return entry !== undefined && now - entry.updatedAt < staleTime;
}

/** Store a value (e.g. after a mutation or a fetch done elsewhere). */
export function primeCache<T>(key: string, data: T, updatedAt = Date.now()): void {
  entries.set(key, { data, updatedAt, expiresAt: signedPayloadExpiry(data, updatedAt) });
  notify(key);
}

/** Drops every entry whose key starts with `prefix` ("" clears all). Subscribers are notified. */
export function invalidate(prefix: string): void {
  for (const key of [...entries.keys()]) {
    if (key.startsWith(prefix)) {
      entries.delete(key);
      notify(key);
    }
  }
}

/** Test helper: clears data, in-flight requests and listeners. */
export function clearResourceCache(): void {
  entries.clear();
  inFlight.clear();
  listeners.clear();
}

/** Re-render hook point: called when the entry changes. Returns the unsubscribe function. */
export function subscribeCache(key: string, cb: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

export interface FetchCachedOptions {
  staleTime?: number;
  /** Ignore a fresh entry and fetch again. */
  force?: boolean;
  /** Aborts this consumer's wait only; the shared request keeps running for other consumers. */
  signal?: AbortSignal;
}

function abortError(): Error {
  const e = new Error("Requête annulée.");
  e.name = "AbortError";
  return e;
}

/**
 * Returns fresh cached data, or fetches once (deduplicated across concurrent consumers)
 * and primes the cache on success. Errors are never cached.
 */
export function fetchCached<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  { staleTime = DEFAULT_STALE_TIME, force = false, signal }: FetchCachedOptions = {},
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  const cached = liveEntry(key);
  if (!force && cached && Date.now() - cached.updatedAt < staleTime) {
    return Promise.resolve(cached.data as T);
  }
  let shared = inFlight.get(key) as Promise<T> | undefined;
  if (!shared) {
    const controller = new AbortController();
    shared = fetcher(controller.signal).then(
      (data) => {
        inFlight.delete(key);
        primeCache(key, data);
        return data;
      },
      (e: unknown) => {
        inFlight.delete(key);
        throw e;
      },
    );
    inFlight.set(key, shared);
  }
  if (!signal) return shared;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    shared.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
