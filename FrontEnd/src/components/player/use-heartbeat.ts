"use client";

/**
 * Player heartbeat (docs/round2-contract.md §5.2): tells the supervision screen that this Porteur is
 * alive. It keeps beating while the tab is hidden, backs off on errors and stops on 401 (the player
 * handles unpairing). Without a device key nothing is sent.
 */
import { useEffect, useRef } from "react";

import { DEVICE_KEY_HEADER, readDeviceKey } from "@/lib/player/device-key";

/** Interval used before the first answer of the server. */
export const DEFAULT_INTERVAL_SECONDS = 30;
/** Longest delay between two attempts after repeated failures. */
export const MAX_BACKOFF_MS = 300_000;
/** Player version reported to the supervision screen. */
export const PLAYER_VERSION = "web-1.0";

/** Exponential backoff: 30 s, 60 s, 120 s… capped at five minutes (pure, unit-tested). */
export function backoffMs(failures: number, baseMs = DEFAULT_INTERVAL_SECONDS * 1000): number {
  if (failures <= 0) return baseMs;
  return Math.min(MAX_BACKOFF_MS, baseMs * 2 ** failures);
}

export function useHeartbeat(supportId: number | null, currentLogId: number | null): void {
  const logRef = useRef(currentLogId);
  logRef.current = currentLogId;

  useEffect(() => {
    if (supportId === null || typeof window === "undefined") return;
    const key = readDeviceKey(supportId);
    if (!key) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let failures = 0;
    let intervalMs = DEFAULT_INTERVAL_SECONDS * 1000;

    const beat = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`/api/diffusion/heartbeat?supportId=${supportId}`, {
          method: "POST",
          headers: { "content-type": "application/json", [DEVICE_KEY_HEADER]: key },
          body: JSON.stringify({
            playerVersion: PLAYER_VERSION,
            currentDiffusionLogId: logRef.current,
            visible: typeof document === "undefined" ? true : !document.hidden,
          }),
        });
        if (response.status === 401) {
          stopped = true;
          return;
        }
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { nextHeartbeatSeconds?: number };
        failures = 0;
        intervalMs =
          typeof body.nextHeartbeatSeconds === "number" && body.nextHeartbeatSeconds > 0
            ? body.nextHeartbeatSeconds * 1000
            : DEFAULT_INTERVAL_SECONDS * 1000;
      } catch {
        failures += 1;
        intervalMs = backoffMs(failures);
      }
      if (!stopped) timer = setTimeout(() => void beat(), intervalMs);
    };

    void beat();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [supportId]);
}
