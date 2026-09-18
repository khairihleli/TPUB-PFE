"use client";

/**
 * Session deadline from the JWT `exp` (UX-PLAN §7.5, FFA-01). No silent refresh exists
 * (backend change deferred): warn at T−10 min, alert at T−2 min, open the expired dialog at T.
 */
import { useEffect, useMemo, useState } from "react";

import { SESSION_EXPIRED_EVENT } from "@/lib/api/client";
import { sessionApi } from "@/lib/api/endpoints";

export const SESSION_WARNING_MS = 10 * 60 * 1000;
export const SESSION_CRITICAL_MS = 2 * 60 * 1000;

export type SessionPhase = "ok" | "warning" | "critical" | "expired";

export function sessionPhase(expSeconds: number, now = Date.now()): SessionPhase {
  const remaining = expSeconds * 1000 - now;
  if (remaining <= 0) return "expired";
  if (remaining <= SESSION_CRITICAL_MS) return "critical";
  if (remaining <= SESSION_WARNING_MS) return "warning";
  return "ok";
}

/** Milliseconds until the next phase boundary (null once expired). */
export function msUntilNextPhase(expSeconds: number, now = Date.now()): number | null {
  const expMs = expSeconds * 1000;
  const boundaries = [expMs - SESSION_WARNING_MS, expMs - SESSION_CRITICAL_MS, expMs];
  const next = boundaries.find((b) => b > now);
  return next === undefined ? null : next - now;
}

export interface SessionDeadline {
  /** JWT exp in seconds (updated when another tab re-logs in). */
  exp: number;
  expiresAt: Date;
  phase: SessionPhase;
}

/** Longest setTimeout delay browsers honour. */
const MAX_TIMEOUT = 2_147_000_000;

/**
 * Tracks the deadline with one timer per phase boundary (no per-second ticking). Re-reads
 * `sessionApi.get` on window focus to pick up a re-login from another tab. At T it dispatches
 * the session-expired event (SessionExpiredListener opens the dialog).
 */
export function useSessionDeadline(initialExp: number): SessionDeadline {
  const [exp, setExp] = useState(initialExp);
  const [phase, setPhase] = useState<SessionPhase>(() => sessionPhase(initialExp));

  useEffect(() => {
    setExp(initialExp);
  }, [initialExp]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const current = sessionPhase(exp);
      setPhase(current);
      if (current === "expired") {
        window.dispatchEvent(
          new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { reason: "deadline" } }),
        );
        return;
      }
      const wait = msUntilNextPhase(exp);
      if (wait !== null) timer = setTimeout(tick, Math.min(wait + 50, MAX_TIMEOUT));
    };
    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [exp]);

  useEffect(() => {
    let lastCheck = 0;
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastCheck < 15_000) return;
      lastCheck = Date.now();
      sessionApi
        .get()
        .then((res) => {
          if (res?.user && typeof res.user.exp === "number" && res.user.exp !== exp) {
            setExp(res.user.exp);
          }
        })
        .catch(() => {
          /* 401 is handled by the expired listener; network errors keep the known deadline */
        });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [exp]);

  return useMemo(() => ({ exp, expiresAt: new Date(exp * 1000), phase }), [exp, phase]);
}
