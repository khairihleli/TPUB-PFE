"use client";

/**
 * Unsaved-changes guard store + hook (UX-PLAN §7.1, FLOW-07). The UI part (link interception,
 * « Quitter sans enregistrer ? » dialog, confirmNavigation) lives in
 * `@/components/shell/navigation-guard` and reads this store.
 */
import { useEffect, useId, useSyncExternalStore } from "react";

export const DEFAULT_UNSAVED_MESSAGE = "Vos modifications seront perdues.";

interface GuardEntry {
  dirty: boolean;
  message?: string;
}

const guards = new Map<string, GuardEntry>();
const listeners = new Set<() => void>();
let suspended = false;
let version = 0;

function emit(): void {
  version++;
  listeners.forEach((cb) => cb());
}

export function subscribeUnsavedChanges(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** True when at least one registered form is dirty (and guards are not suspended). */
export function hasUnsavedChanges(): boolean {
  if (suspended) return false;
  for (const g of guards.values()) if (g.dirty) return true;
  return false;
}

/** Message of the first dirty guard (or the default). */
export function unsavedChangesMessage(): string {
  for (const g of guards.values()) if (g.dirty && g.message) return g.message;
  return DEFAULT_UNSAVED_MESSAGE;
}

export function setGuard(id: string, entry: GuardEntry | null): void {
  if (entry === null) guards.delete(id);
  else guards.set(id, entry);
  emit();
}

/**
 * Lets one deliberate navigation through (confirmed « Quitter », re-login after expiry).
 * Guards re-arm automatically after `ms`.
 */
export function suspendUnsavedGuards(ms = 3000): void {
  suspended = true;
  emit();
  setTimeout(() => {
    suspended = false;
    emit();
  }, ms);
}

/** Test helper. */
export function resetUnsavedGuards(): void {
  guards.clear();
  suspended = false;
  emit();
}

function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (!hasUnsavedChanges()) return;
  e.preventDefault();
  // Legacy browsers need returnValue set to show the native prompt.
  e.returnValue = "";
}

/**
 * `useUnsavedChangesGuard({ dirty: form.isDirty })` in any form. While dirty: `beforeunload`
 * prompt, internal link clicks and shell navigation ask « Quitter sans enregistrer ? ».
 * Back (popstate) cannot be intercepted reliably: pair with useFormDraft.
 */
export function useUnsavedChangesGuard({
  dirty,
  message,
}: {
  dirty: boolean;
  message?: string;
}): void {
  const id = useId();

  useEffect(() => {
    setGuard(id, { dirty, message });
  }, [id, dirty, message]);

  useEffect(() => () => setGuard(id, null), [id]);

  useEffect(() => {
    if (!dirty || typeof window === "undefined") return;
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/** Re-renders when the dirty state of any guard changes. */
export function useHasUnsavedChanges(): boolean {
  return useSyncExternalStore(
    subscribeUnsavedChanges,
    () => hasUnsavedChanges(),
    () => false,
  );
}

/** Internal: store version for tests. */
export function unsavedGuardVersion(): number {
  return version;
}

export interface ClickLike {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/**
 * Pure decision for the capture-phase click listener: intercept same-origin, same-tab links
 * that actually change page (not hash-only), with no modifier key and no download.
 */
export function shouldInterceptLinkClick(
  event: ClickLike,
  anchor: { href: string; target: string; hasDownload: boolean; optOut: boolean },
  location: { origin: string; pathname: string; search: string },
): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (anchor.optOut || anchor.hasDownload) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  let url: URL;
  try {
    url = new URL(anchor.href, location.origin);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;
  if (url.pathname === location.pathname && url.search === location.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
