"use client";

import { type RefObject, useEffect } from "react";

/** CSS variable read by the toast viewport (and anything that must clear a sticky bottom bar). */
export const TOAST_OFFSET_VAR = "--toast-offset";

/**
 * Heights of every sticky bottom bar currently registered. Several bars can be mounted at once
 * (e.g. the /espace/reseau mobile bottom bar under the Studio footer); the published offset is
 * the tallest one, so closing one bar no longer resets the offset while another is still shown.
 */
const bars = new Map<symbol, number>();

function publish(): void {
  if (typeof document === "undefined") return;
  const max = bars.size === 0 ? 0 : Math.max(...bars.values());
  document.documentElement.style.setProperty(TOAST_OFFSET_VAR, `${max}px`);
}

/**
 * Publishes the height of a sticky bottom bar as `--toast-offset` on <html> so toasts sit above
 * it (FLOW-09, FFA-11). The bar stops counting on unmount or when `active` is false; the offset
 * falls back to the tallest remaining bar, or 0px.
 * `const barRef = useRef<HTMLDivElement>(null); useStickyBarOffset(barRef, visible);`
 */
export function useStickyBarOffset(
  ref: RefObject<HTMLElement | null>,
  active = true,
  gap = 12,
): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = ref.current;
    if (!active || !el) {
      publish();
      return;
    }
    const key = Symbol("sticky-bar");
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      bars.set(key, Math.max(0, Math.round(h + gap)));
      publish();
    };
    apply();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(apply);
      observer.observe(el);
    }
    return () => {
      observer?.disconnect();
      bars.delete(key);
      publish();
    };
  }, [ref, active, gap]);
}
