"use client";

import { useCallback, useEffect, useState } from "react";

import { useOptionalSessionContext as useOptionalSession } from "@/components/shell/session-context";

/** localStorage key for a dismissible hint, per user. */
export function dismissibleStorageKey(
  key: string,
  userId: number | string | null | undefined,
): string {
  return `tpub:dismissed:${userId ?? "anon"}:${key}`;
}

function read(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

/**
 * `const [dismissed, dismiss] = useDismissible("hint:studio");`
 * Per user (session userId), stored in localStorage, every access in try/catch. SSR renders
 * « not dismissed » and the stored value applies right after hydration. `restore()` shows it again.
 */
export function useDismissible(key: string): [boolean, () => void, () => void] {
  const session = useOptionalSession();
  const storageKey = dismissibleStorageKey(key, session?.user.userId);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(read(storageKey));
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* storage unavailable: dismissal lasts for this render only */
    }
  }, [storageKey]);

  const restore = useCallback(() => {
    setDismissed(false);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  return [dismissed, dismiss, restore];
}
