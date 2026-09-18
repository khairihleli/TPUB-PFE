"use client";

/**
 * Server-draft autosave (UX-PLAN §7.3). Enable only for BROUILLON/REJECTED_BY_AI campaigns with
 * an id and a value that validates. Never books, submits or changes locked dates.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveState = "idle" | "saving" | "saved" | "error";

export interface UseAutosaveOptions<T> {
  value: T;
  save: (value: T) => Promise<unknown>;
  enabled: boolean;
  /** Debounce after the last change. Default 1500 ms. */
  delay?: number;
  /** Default: JSON equality. */
  isEqual?: (a: T, b: T) => boolean;
}

export interface AutosaveResult {
  state: AutosaveState;
  savedAt: Date | null;
  /** Saves the latest value now (after an error). */
  retry: () => void;
  /** Saves immediately if there is a pending change; resolves when done. */
  flush: () => Promise<void>;
  /** A change is waiting for the debounce or a save is running. */
  pending: boolean;
}

function jsonEqual<T>(a: T, b: T): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function useAutosave<T>({
  value,
  save,
  enabled,
  delay = 1500,
  isEqual = jsonEqual,
}: UseAutosaveOptions<T>): AutosaveResult {
  const [state, setState] = useState<AutosaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pending, setPending] = useState(false);
  const [rearm, setRearm] = useState(0);

  const baseline = useRef<T>(value);
  const latest = useRef<T>(value);
  const saveRef = useRef(save);
  const isEqualRef = useRef(isEqual);
  const running = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  latest.current = value;
  useEffect(() => {
    saveRef.current = save;
    isEqualRef.current = isEqual;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // When autosave gets enabled, the current value is the saved baseline.
  const wasEnabled = useRef(enabled);
  useEffect(() => {
    if (enabled && !wasEnabled.current) baseline.current = latest.current;
    wasEnabled.current = enabled;
  }, [enabled]);

  const run = useCallback(async (): Promise<void> => {
    if (running.current) {
      await running.current;
    }
    const snapshot = latest.current;
    if (isEqualRef.current(snapshot, baseline.current)) {
      if (mounted.current) setPending(false);
      return;
    }
    if (mounted.current) setState("saving");
    let failed = false;
    const task = (async () => {
      try {
        await saveRef.current(snapshot);
        baseline.current = snapshot;
        if (!mounted.current) return;
        setSavedAt(new Date());
        setState("saved");
      } catch {
        failed = true;
        if (mounted.current) setState("error");
      }
    })();
    running.current = task;
    await task;
    running.current = null;
    if (!mounted.current) return;
    // A change arrived while saving: save again after the debounce (effect below re-arms).
    const changed = !isEqualRef.current(latest.current, baseline.current);
    setPending(changed);
    // After a failure, wait for retry() or the next edit instead of looping.
    if (changed && !failed) setRearm((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (isEqualRef.current(value, baseline.current)) return;
    setPending(true);
    const timer = setTimeout(() => {
      void run();
    }, delay);
    return () => clearTimeout(timer);
  }, [value, enabled, delay, run, rearm]);

  const retry = useCallback(() => {
    void run();
  }, [run]);

  const flush = useCallback(async () => {
    if (!enabled) return;
    await run();
  }, [enabled, run]);

  return { state, savedAt, retry, flush, pending };
}
