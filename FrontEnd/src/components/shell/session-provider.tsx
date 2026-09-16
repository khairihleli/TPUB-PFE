"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { SessionContext, type SessionContextValue } from "@/components/shell/session-context";
import { sessionApi } from "@/lib/api/endpoints";
import type { SessionUser } from "@/lib/api/types";
import { suspendUnsavedGuards } from "@/lib/forms/unsaved-guard";
import { useSessionDeadline } from "@/lib/session-deadline";

export type { SessionContextValue } from "@/components/shell/session-context";

/** Mounted once by the /espace and /admin layouts with the server-validated user. */
export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const deadline = useSessionDeadline(user.exp);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await sessionApi.logout();
    } catch {
      /* cookies may already be gone: navigate anyway */
    }
    suspendUnsavedGuards();
    router.replace("/connexion");
    router.refresh();
  }, [router]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      role: user.role,
      isAdmin: user.role === "ADMINISTRATEUR",
      isStaff: user.role !== "ANNONCEUR",
      canAct: user.role === "ADMINISTRATEUR",
      loggingOut,
      logout,
      deadline,
    }),
    [user, loggingOut, logout, deadline],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** `const { user, role, logout } = useSession();` — only inside /espace or /admin. */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession doit être utilisé dans <SessionProvider>.");
  return ctx;
}

/** Same as useSession but returns null outside a provider. */
export function useOptionalSession(): SessionContextValue | null {
  return useContext(SessionContext);
}
