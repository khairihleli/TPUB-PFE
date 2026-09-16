"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Per-user onboarding flags kept in localStorage (a convenience only: nothing breaks
 * when storage is unavailable). Read after mount to stay hydration-safe.
 */
export interface OnboardingFlags {
  hidden: boolean;
  visitedProfile: boolean;
  visitedNetwork: boolean;
}

const DEFAULT_FLAGS: OnboardingFlags = {
  hidden: false,
  visitedProfile: false,
  visitedNetwork: false,
};

const EVENT = "tpub:onboarding-change";

function storageKey(userId: number): string {
  return `tpub:onboarding:${userId}`;
}

export function readOnboardingFlags(userId: number): OnboardingFlags {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_FLAGS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof OnboardingFlags, unknown>>;
    return {
      hidden: parsed.hidden === true,
      visitedProfile: parsed.visitedProfile === true,
      visitedNetwork: parsed.visitedNetwork === true,
    };
  } catch {
    return DEFAULT_FLAGS;
  }
}

export function writeOnboardingFlags(userId: number, patch: Partial<OnboardingFlags>): void {
  try {
    const next = { ...readOnboardingFlags(userId), ...patch };
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage unavailable: ignore */
  }
}

export function useOnboardingFlags(userId: number) {
  const [flags, setFlags] = useState<OnboardingFlags>(DEFAULT_FLAGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setFlags(readOnboardingFlags(userId));
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId]);

  const update = useCallback(
    (patch: Partial<OnboardingFlags>) => writeOnboardingFlags(userId, patch),
    [userId],
  );

  return { flags, ready, update };
}

/** Records that a checklist page was visited (renders nothing). */
export function useMarkOnboardingVisit(
  userId: number,
  step: "visitedProfile" | "visitedNetwork",
): void {
  useEffect(() => {
    writeOnboardingFlags(userId, { [step]: true });
  }, [userId, step]);
}
