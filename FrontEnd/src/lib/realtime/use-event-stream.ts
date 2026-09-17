"use client";

/**
 * Server-Sent Events client (docs/round2-contract.md §5.3). Wraps `EventSource` on the Next route
 * `/api/realtime/**`, and falls back to periodic polling when the stream keeps failing.
 */
import { useEffect, useRef, useState } from "react";

export type EventStreamStatus = "connecting" | "open" | "fallback";

export interface EventStreamOptions {
  /** Called every `fallbackIntervalMs` while the stream is down (and once when it fails). */
  fallback?: () => Promise<void> | void;
  fallbackIntervalMs?: number;
  /** Set to false to close the stream (e.g. the user may not read it). */
  enabled?: boolean;
}

/** Errors within this window count towards the fallback switch. */
export const ERROR_WINDOW_MS = 60_000;
/** Consecutive errors before the polling fallback takes over. */
export const MAX_ERRORS = 3;
/** Delay before a new stream attempt while polling. */
export const RETRY_INTERVAL_MS = 60_000;

export const FALLBACK_MESSAGE = "Flux temps réel interrompu : actualisation toutes les 15 s";

/** True once `errors` failures happened inside the window (pure, unit-tested). */
export function shouldFallback(errorTimes: readonly number[], now: number): boolean {
  const recent = errorTimes.filter((t) => now - t <= ERROR_WINDOW_MS);
  return recent.length >= MAX_ERRORS;
}

export type EventHandlers = Record<string, (data: unknown) => void>;

/**
 * `useEventStream("/api/realtime/supervision", { snapshot: onSnapshot }, { fallback })`.
 * Handlers are read from a ref, so a new inline object never reopens the stream.
 */
export function useEventStream(
  path: string | null,
  handlers: EventHandlers,
  options: EventStreamOptions = {},
): EventStreamStatus {
  const { fallback, fallbackIntervalMs = 15_000, enabled = true } = options;
  const [status, setStatus] = useState<EventStreamStatus>("connecting");
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    if (!path || !enabled || typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let errorTimes: number[] = [];

    const runFallback = () => {
      void Promise.resolve(fallbackRef.current?.()).catch(() => undefined);
    };

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const startPolling = () => {
      if (pollTimer || closed) return;
      setStatus("fallback");
      runFallback();
      pollTimer = setInterval(runFallback, fallbackIntervalMs);
      retryTimer = setTimeout(() => {
        errorTimes = [];
        open();
      }, RETRY_INTERVAL_MS);
    };

    const open = () => {
      if (closed) return;
      source?.close();
      setStatus((s) => (s === "fallback" ? s : "connecting"));
      const es = new EventSource(path, { withCredentials: true });
      source = es;
      es.onopen = () => {
        if (closed) return;
        errorTimes = [];
        stopPolling();
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        setStatus("open");
      };
      es.onerror = () => {
        if (closed) return;
        errorTimes = [...errorTimes.filter((t) => Date.now() - t <= ERROR_WINDOW_MS), Date.now()];
        if (shouldFallback(errorTimes, Date.now())) {
          es.close();
          startPolling();
        } else {
          setStatus("connecting");
        }
      };
      for (const name of Object.keys(handlersRef.current)) {
        es.addEventListener(name, (event) => {
          const message = event as MessageEvent<string>;
          let payload: unknown = null;
          try {
            payload = message.data ? (JSON.parse(message.data) as unknown) : null;
          } catch {
            return;
          }
          handlersRef.current[name]?.(payload);
        });
      }
    };

    open();

    return () => {
      closed = true;
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
    // Handlers live in a ref on purpose: only the path and the switches reopen the stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, fallbackIntervalMs]);

  return status;
}
