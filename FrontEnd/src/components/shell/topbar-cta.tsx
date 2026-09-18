"use client";

/**
 * One primary action per viewport (UX-PLAN §1.3): a page that renders its own primary « create »
 * action (first-run hero, empty campaign list) demotes the topbar CTA to `secondary` while mounted.
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface TopbarCtaContextValue {
  demoted: boolean;
  demote: () => () => void;
}

const TopbarCtaContext = createContext<TopbarCtaContextValue | null>(null);

export function TopbarCtaProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const demote = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => Math.max(0, n - 1));
  }, []);
  const value = useMemo(() => ({ demoted: count > 0, demote }), [count, demote]);
  return <TopbarCtaContext.Provider value={value}>{children}</TopbarCtaContext.Provider>;
}

/** True when a page asked the topbar CTA to step back. */
export function useTopbarCtaDemoted(): boolean {
  return useContext(TopbarCtaContext)?.demoted ?? false;
}

/** `useDemoteTopbarCta(isEmpty)` where the page shows its own primary create button. No-op outside AppShell. */
export function useDemoteTopbarCta(active = true): void {
  const demote = useContext(TopbarCtaContext)?.demote;
  useEffect(() => {
    if (!active || !demote) return;
    return demote();
  }, [active, demote]);
}
