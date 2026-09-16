"use client";

/**
 * Local drafts in sessionStorage before a server draft exists (UX-PLAN §7.2, FFA-07).
 * Key: `tpub:draft:v{version}:{userId}:{key}`. Ignored after 24 h. Every storage access is
 * wrapped in try/catch: without storage the form simply never shows the restore notice.
 */
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { useOptionalSessionContext as useOptionalSession } from "@/components/shell/session-context";

export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DRAFT_SAVE_DELAY_MS = 500;

interface StoredDraft<T> {
  savedAt: number;
  value: T;
}

export function draftStorageKey(
  key: string,
  userId: number | string | null | undefined,
  version = 1,
): string {
  return `tpub:draft:v${version}:${userId ?? "anon"}:${key}`;
}

export function readDraft<T>(
  storageKey: string,
  now = Date.now(),
  maxAgeMs = DRAFT_MAX_AGE_MS,
): { value: T; savedAt: Date } | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDraft<T>>;
    if (typeof parsed.savedAt !== "number" || !("value" in parsed)) return null;
    if (now - parsed.savedAt > maxAgeMs) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }
    return { value: parsed.value as T, savedAt: new Date(parsed.savedAt) };
  } catch {
    return null;
  }
}

export function writeDraft<T>(storageKey: string, value: T, now = Date.now()): boolean {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify({ savedAt: now, value }));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(storageKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    /* storage unavailable */
  }
}

// ---- dirty-draft registry (read by SessionExpiredDialog) -------------------
const dirtyDrafts = new Set<string>();
const draftListeners = new Set<() => void>();

function setDraftDirty(id: string, dirty: boolean): void {
  const had = dirtyDrafts.has(id);
  if (dirty) dirtyDrafts.add(id);
  else dirtyDrafts.delete(id);
  if (had !== dirty) draftListeners.forEach((cb) => cb());
}

/** True when a form with useFormDraft currently holds unsaved typed input on this device. */
export function hasDirtyDrafts(): boolean {
  return dirtyDrafts.size > 0;
}

export function useHasDirtyDrafts(): boolean {
  return useSyncExternalStore(
    (cb) => {
      draftListeners.add(cb);
      return () => {
        draftListeners.delete(cb);
      };
    },
    hasDirtyDrafts,
    () => false,
  );
}

export interface UseFormDraftOptions<T> {
  /** Stable key, e.g. "campaign:new", "campaign:7:edit" (UX-PLAN §7.2). */
  key: string;
  value: T;
  /** Saves only while dirty. */
  dirty: boolean;
  /** Defaults to the session user id. */
  userId?: number | string | null;
  /** Bump when the stored shape changes (old drafts are ignored). */
  version?: number;
  /** Set false to disable (e.g. once the server draft exists and autosave takes over). */
  enabled?: boolean;
  /** Called once after mount when a stored draft (< 24 h) exists: apply it to the form. */
  onRestore?: (value: T, savedAt: Date) => void;
  delay?: number;
}

export interface FormDraftState<T> {
  restoredValue: T | null;
  restoredAt: Date | null;
  /** Removes the stored draft and hides the notice (the consumer resets its fields). */
  discard: () => void;
  /** Call after a successful save/submit. */
  clear: () => void;
}

/**
 * ```ts
 * const draft = useFormDraft({ key: "campaign:new", value: values, dirty, onRestore: setValues });
 * {draft.restoredAt ? <DraftRestoreNotice restoredAt={draft.restoredAt} onDiscard={() => { draft.discard(); reset(); }} /> : null}
 * ```
 */
export function useFormDraft<T>({
  key,
  value,
  dirty,
  userId,
  version = 1,
  enabled = true,
  onRestore,
  delay = DRAFT_SAVE_DELAY_MS,
}: UseFormDraftOptions<T>): FormDraftState<T> {
  const session = useOptionalSession();
  const storageKey = draftStorageKey(key, userId ?? session?.user.userId ?? null, version);
  const id = useId();
  const [restored, setRestored] = useState<{ value: T; savedAt: Date } | null>(null);
  const onRestoreRef = useRef(onRestore);
  useEffect(() => {
    onRestoreRef.current = onRestore;
  });

  useEffect(() => {
    if (!enabled) return;
    const found = readDraft<T>(storageKey);
    if (found) {
      setRestored(found);
      onRestoreRef.current?.(found.value, found.savedAt);
    }
  }, [storageKey, enabled]);

  useEffect(() => {
    if (!enabled || !dirty) return;
    const timer = setTimeout(() => {
      writeDraft(storageKey, value);
    }, delay);
    return () => clearTimeout(timer);
  }, [storageKey, value, dirty, enabled, delay]);

  useEffect(() => {
    setDraftDirty(id, enabled && dirty);
    return () => setDraftDirty(id, false);
  }, [id, enabled, dirty]);

  const clear = useCallback(() => {
    removeDraft(storageKey);
    setRestored(null);
    setDraftDirty(id, false);
  }, [id, storageKey]);

  return {
    restoredValue: restored?.value ?? null,
    restoredAt: restored?.savedAt ?? null,
    discard: clear,
    clear,
  };
}
