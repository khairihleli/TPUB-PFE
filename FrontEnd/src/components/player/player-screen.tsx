"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PlayerOverlay } from "@/components/player/player-overlay";
import {
  contentDelayMs,
  isNewUrgence,
  planAfterError,
  planAfterSuccess,
  type PlayerErrorInfo,
  secondsUntil,
  shouldSendClick,
  simulatedDateTime,
  slideKey,
} from "@/components/player/player-schedule";
import {
  AdSlide,
  BootSlide,
  DefaultSlide,
  OfflineSlide,
  UrgentSlide,
} from "@/components/player/player-slides";
import { useNow } from "@/components/player/use-now";
import { diffusionApi } from "@/lib/api/endpoints";
import { isAbortError } from "@/lib/api/errors";
import type { Diffusion } from "@/lib/api/types";
import { toLocalIsoDateTime } from "@/lib/format";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export interface PlayerState {
  /** Last content successfully received. */
  diffusion: Diffusion | null;
  /** Increments on every successful poll (restarts the spot progress bar). */
  cycle: number;
  /** Error of the last poll, null when it succeeded. */
  error: PlayerErrorInfo | null;
  attempt: number;
  /** Epoch ms of the next poll. */
  nextAt: number | null;
  /** A request is in flight. */
  pending: boolean;
  /** The next poll is due but the tab is hidden (no log written for nobody). */
  paused: boolean;
}

const INITIAL: PlayerState = {
  diffusion: null,
  cycle: 0,
  error: null,
  attempt: 0,
  nextAt: null,
  pending: true,
  paused: false,
};

/**
 * Full-screen demo player for one support (/ecran/[supportId]).
 * Polls GET /api/diffusion/next with the local Tunis date-time, waits `duration` seconds,
 * backs off on errors, pauses while the tab is hidden, retries as soon as the browser is online.
 */
export function PlayerScreen({
  supportId,
  simulatedAt = null,
}: {
  supportId: number;
  /** `?datetime=` base (normalised local "YYYY-MM-DDTHH:mm:ss"): the clock starts there. */
  simulatedAt?: string | null;
}) {
  const reduce = useReducedMotion();
  const animate = !reduce;
  const [state, setState] = useState<PlayerState>(INITIAL);
  const [announcement, setAnnouncement] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const lastRef = useRef<Diffusion | null>(null);
  /** Asks for the next content now (a video ended before its planned duration). */
  const advanceRef = useRef<(() => void) | null>(null);
  const clickedRef = useRef<Set<number>>(new Set());
  const [clickedLogs, setClickedLogs] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let attempt = 0;
    let dueWhileHidden = false;
    const startedAt = Date.now();
    let inFlight = false;
    const clock = () =>
      simulatedAt ? simulatedDateTime(simulatedAt, Date.now() - startedAt) : toLocalIsoDateTime();

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(fire, ms);
    };

    const poll = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setState((s) => ({ ...s, pending: true, paused: false }));
      inFlight = true;
      try {
        const d = await diffusionApi.next(
          { supportId, datetime: clock() },
          { signal: current.signal },
        );
        if (cancelled) return;
        const plan = planAfterSuccess(d);
        attempt = 0;
        if (isNewUrgence(lastRef.current, d)) {
          setAnnouncement(`Message prioritaire : ${d.title}. Zone : ${d.zone}.`);
        } else if (d.type !== "URGENCE") {
          setAnnouncement("");
        }
        lastRef.current = d;
        setState((s) => ({
          diffusion: d,
          cycle: s.cycle + 1,
          error: null,
          attempt: 0,
          nextAt: Date.now() + plan.delayMs,
          pending: false,
          paused: false,
        }));
        schedule(plan.delayMs);
      } catch (e) {
        if (cancelled || current.signal.aborted || isAbortError(e)) return;
        const plan = planAfterError(e, attempt, supportId, Math.random);
        attempt = plan.attempt;
        setState((s) => ({
          ...s,
          error: plan.ok ? null : plan.error,
          attempt: plan.attempt,
          nextAt: Date.now() + plan.delayMs,
          pending: false,
        }));
        schedule(plan.delayMs);
      } finally {
        if (controller === current) inFlight = false;
      }
    };

    function fire() {
      if (document.visibilityState === "hidden") {
        dueWhileHidden = true;
        setState((s) => ({ ...s, paused: true }));
        return;
      }
      void poll();
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible" && dueWhileHidden) {
        dueWhileHidden = false;
        void poll();
      }
    };
    const onOnline = () => {
      if (attempt > 0) {
        window.clearTimeout(timer);
        void poll();
      }
    };

    advanceRef.current = () => {
      if (cancelled || inFlight) return;
      window.clearTimeout(timer);
      fire();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    // Macrotask start: React StrictMode's mount → unmount → mount never fires two calls.
    timer = window.setTimeout(fire, 0);

    return () => {
      cancelled = true;
      advanceRef.current = null;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [supportId, retryNonce, simulatedAt]);

  const retryNow = useCallback(() => {
    setState((s) => ({ ...s, pending: true }));
    setRetryNonce((n) => n + 1);
  }, []);

  const onVideoEnded = useCallback((logId: number | undefined) => {
    // Only the video still on screen may advance the loop (a late `ended` event is ignored).
    if (lastRef.current?.diffusionLogId === logId) advanceRef.current?.();
  }, []);

  const sendClick = useCallback((d: Diffusion) => {
    if (!shouldSendClick(d, clickedRef.current) || typeof d.diffusionLogId !== "number") return;
    const logId = d.diffusionLogId;
    clickedRef.current.add(logId);
    setClickedLogs(new Set(clickedRef.current));
    void diffusionApi.interaction({ diffusionLogId: logId, type: "CLIC" }).catch(() => {
      // Expired or unknown log: nothing to show on a street screen.
    });
  }, []);

  const { diffusion, error } = state;
  const offlineError =
    error !== null && (diffusion === null || error.kind === "not-found") ? error : null;
  const now = useNow(offlineError !== null);

  let slide;
  if (offlineError) {
    slide = (
      <OfflineSlide
        error={offlineError}
        secondsLeft={secondsUntil(state.nextAt, now)}
        attempt={state.attempt}
        onRetry={retryNow}
        retrying={state.pending}
      />
    );
  } else if (error !== null) {
    // Transient failure after content was shown: fall back to the brand loop, never a stale ad.
    slide = (
      <DefaultSlide
        key="fallback"
        zone={diffusion?.zone}
        animate={animate}
        notice={
          <p className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-2 text-center font-label text-[0.8125rem] font-semibold text-warning backdrop-blur-sm">
            {error.title} · le lecteur réessaie automatiquement
          </p>
        }
      />
    );
  } else if (diffusion === null) {
    slide = <BootSlide />;
  } else if (diffusion.type === "URGENCE") {
    slide = <UrgentSlide key={slideKey(diffusion)} diffusion={diffusion} animate={animate} />;
  } else if (diffusion.type === "PUBLICITE") {
    slide = (
      <AdSlide
        key={slideKey(diffusion)}
        diffusion={diffusion}
        cycle={state.cycle}
        durationMs={contentDelayMs(diffusion.duration)}
        animate={animate}
        onMediaEnded={() => onVideoEnded(diffusion.diffusionLogId)}
        onActivate={
          typeof diffusion.diffusionLogId === "number" ? () => sendClick(diffusion) : undefined
        }
        clicked={
          typeof diffusion.diffusionLogId === "number" && clickedLogs.has(diffusion.diffusionLogId)
        }
      />
    );
  } else {
    slide = (
      <DefaultSlide
        key="default"
        zone={diffusion.zone}
        title={diffusion.title}
        content={diffusion.content}
        animate={animate}
      />
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <h1 className="sr-only">Écran de diffusion n° {supportId}</h1>
      {/* Announced once per new priority message (never on each poll). */}
      <div role="alert" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <p aria-live="polite" className="sr-only">
        {offlineError ? `${offlineError.title}. ${offlineError.message}` : ""}
      </p>

      {slide}

      <PlayerOverlay
        supportId={supportId}
        state={state}
        onRetry={retryNow}
        simulated={simulatedAt !== null}
      />
    </div>
  );
}
