"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;
}

/**
 * Single source for the reduced-motion preference in JS-driven animation (framer-motion,
 * intervals, count-ups). The global CSS rule does NOT cover inline/JS animation: always guard.
 * Hydration-safe: the server snapshot is `false`, the real value applies right after hydration.
 * framer-motion: `transition={reduce ? { duration: 0 } : …}`.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
