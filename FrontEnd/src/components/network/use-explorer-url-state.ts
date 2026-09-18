"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  buildExplorerQuery,
  explorerHistoryMethod,
  parseExplorerUrlState,
  type ExplorerUrlState,
} from "@/components/network/explorer-url-state";

/**
 * Explorer URL state (`?zone=`, `?porteur=`, `?vue=3d`, `?fond=`, `?repere=1`, `?regrouper=1`)
 * read from and written to the address bar without scroll jumps. History (IA-08, see
 * `explorerHistoryMethod`): opening the Studio pushes, closing a Studio opened here goes back,
 * everything else replaces. Escape, the close button and browser Back all end on the same URL.
 */
export function useExplorerUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  const state = useMemo(() => parseExplorerUrlState(new URLSearchParams(query)), [query]);

  // Several updates can happen before Next commits the new URL: chain them on the last write.
  const latest = useRef(query);
  useEffect(() => {
    latest.current = query;
  }, [query]);

  // True once this component pushed the Studio entry; reset whenever the Studio is closed
  // (by us or by browser Back).
  const openedInSession = useRef(false);
  useEffect(() => {
    if (state.porteurId === null) openedInSession.current = false;
  }, [state.porteurId]);

  const update = useCallback(
    (patch: Partial<ExplorerUrlState>) => {
      const base = latest.current;
      const next = buildExplorerQuery(base, patch);
      if (next === base) return;
      const method = explorerHistoryMethod(base, patch, {
        openedInSession: openedInSession.current,
      });
      latest.current = next;
      if (method === "back") {
        openedInSession.current = false;
        router.back();
        return;
      }
      if (method === "push") openedInSession.current = true;
      const href = next ? `${pathname}?${next}` : pathname;
      if (method === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router, pathname],
  );

  return { state, update };
}
