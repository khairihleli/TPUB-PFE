"use client";

import { useEffect, useState } from "react";

/** Current epoch ms, refreshed twice a second while `active`. Null until mounted (SSR-safe). */
export function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}
