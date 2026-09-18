"use client";

/**
 * Recovery of expired signed media URLs (docs/round2-contract.md §3.5). A media element that fails
 * to load (or whose link is about to expire) refreshes the owning resource once — the campaign's
 * media list, or the profile for a logo — and retries with the fresh URL. A second failure is
 * final: the component shows its usual error fallback.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { campaignsApi, mediaApi, meApi } from "@/lib/api/endpoints";
import {
  campaignIdOfMediaUrl,
  isExpiringSoon,
  isSignedMediaUrl,
  sameMediaFile,
} from "@/lib/media-url";
import { invalidate, resourceKeys } from "@/lib/resource-cache";

/** Fetches a fresh signed URL for the same stored file, or null when the file is gone. */
export type SignedUrlRefresher = (url: string, signal: AbortSignal) => Promise<string | null>;

/**
 * Default refresher: campaign media (`/uploads/campaigns/{id}/…`) through the media list, then the
 * campaign itself (`mediaUrl`); any other file through the profile (`logoUrl`). The cache entries
 * of the owning resource are invalidated so other consumers refetch too.
 */
export const refreshSignedMediaUrl: SignedUrlRefresher = async (url, signal) => {
  const campaignId = campaignIdOfMediaUrl(url);
  if (campaignId !== null) {
    invalidate(resourceKeys.campaignMedia(campaignId));
    invalidate(resourceKeys.campaign(campaignId));
    const media = await mediaApi.list(campaignId, { signal });
    const match = media.find((m) => sameMediaFile(m.url, url));
    if (match) return match.url;
    const campaign = await campaignsApi.get(campaignId, { signal });
    return sameMediaFile(campaign.mediaUrl, url) ? (campaign.mediaUrl ?? null) : null;
  }
  invalidate(resourceKeys.me);
  const me = await meApi.get({ signal });
  return sameMediaFile(me.logoUrl, url) ? me.logoUrl : null;
};

export interface SignedMediaSource {
  /** URL to render (the fresh one after a refresh); null when there is nothing to show. */
  src: string | null;
  /** The media could not be loaded even after one refresh. */
  failed: boolean;
  /** A refresh is in flight. */
  refreshing: boolean;
  /** Wire to `onError` of the <img>/<video>. */
  onError: () => void;
}

interface State {
  forUrl: string | null;
  override: string | null;
  attempted: boolean;
  failed: boolean;
  refreshing: boolean;
}

function initial(url: string | null): State {
  return { forUrl: url, override: null, attempted: false, failed: false, refreshing: false };
}

export function useSignedMediaSrc(
  url: string | null | undefined,
  refresh: SignedUrlRefresher = refreshSignedMediaUrl,
): SignedMediaSource {
  const base = typeof url === "string" && url.length > 0 ? url : null;
  const [state, setState] = useState<State>(() => initial(base));
  const current = state.forUrl === base ? state : initial(base);
  if (current !== state) setState(current);

  const controllerRef = useRef<AbortController | null>(null);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(() => () => controllerRef.current?.abort(), [base]);

  const stateRef = useRef(current);
  stateRef.current = current;

  const attempt = useCallback(() => {
    const s = stateRef.current;
    if (base === null || s.forUrl !== base || s.refreshing || s.failed) return;
    if (s.attempted || !isSignedMediaUrl(base)) {
      setState((t) => (t.forUrl === base ? { ...t, failed: true } : t));
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    stateRef.current = { ...s, attempted: true, refreshing: true };
    setState((t) => (t.forUrl === base ? { ...t, attempted: true, refreshing: true } : t));
    refreshRef
      .current(base, controller.signal)
      .then((fresh) => {
        if (controller.signal.aborted) return;
        setState((t) =>
          t.forUrl !== base
            ? t
            : fresh
              ? { ...t, override: fresh, refreshing: false }
              : { ...t, failed: true, refreshing: false },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState((t) => (t.forUrl !== base ? t : { ...t, failed: true, refreshing: false }));
      });
  }, [base]);

  const src = current.override ?? base;

  // Proactive refresh: a link that already expired (cached page, long-lived tab) is replaced
  // before the browser requests it.
  useEffect(() => {
    if (base !== null && !current.attempted && isExpiringSoon(base, Date.now())) attempt();
  }, [base, current.attempted, attempt]);

  return {
    src: current.failed ? null : src,
    failed: current.failed,
    refreshing: current.refreshing,
    onError: attempt,
  };
}
