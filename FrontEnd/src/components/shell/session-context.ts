"use client";

/**
 * Session context object, kept in its own module so shared primitives (StatusPill, useFormDraft,
 * useDismissible) can read it optionally without importing the provider (and its router/API
 * dependencies). Tests that mock `session-provider` leave this module intact.
 */
import { createContext, useContext } from "react";

import type { RoleCode, SessionUser } from "@/lib/api/types";
import type { SessionDeadline } from "@/lib/session-deadline";

export interface SessionContextValue {
  user: SessionUser;
  role: RoleCode;
  isAdmin: boolean;
  /** ADMINISTRATEUR | SUPERVISEUR | OPERATEUR */
  isStaff: boolean;
  /** ADMINISTRATEUR only can act (validate, create zones, emergency…). */
  canAct: boolean;
  loggingOut: boolean;
  /** Clears the httpOnly cookies then navigates to /connexion. */
  logout: () => Promise<void>;
  /** JWT deadline (phase ok → warning T−10 min → critical T−2 min → expired). */
  deadline: SessionDeadline;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

/** Session or null outside a provider (marketing, isolated tests). */
export function useOptionalSessionContext(): SessionContextValue | null {
  return useContext(SessionContext);
}
