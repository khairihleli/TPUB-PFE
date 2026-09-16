/**
 * Server-only session access (route handlers, server components, layouts).
 * Do not import from client components: it reads httpOnly cookies via next/headers.
 */
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import type { SessionUser } from "@/lib/api/types";
import {
  readSession,
  serializeUserCookie,
  sessionMaxAge,
  TOKEN_COOKIE,
  USER_COOKIE,
} from "@/lib/session-cookie";

export {
  TOKEN_COOKIE,
  USER_COOKIE,
  roleHome,
  isStaffRole,
  safeNextPath,
  canAccessPath,
} from "@/lib/session-cookie";

/** Current session user, or null when absent/invalid/expired. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return readSession(store.get(TOKEN_COOKIE)?.value, store.get(USER_COOKIE)?.value);
}

/** Raw JWT for the bridge. Null when absent or expired. */
export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  const user = readSession(token, store.get(USER_COOKIE)?.value);
  return user && token ? token : null;
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "1",
    path: "/",
  };
}

/** Sets tpub_token + tpub_user on a response. */
export function applySessionCookies(res: NextResponse, token: string, user: SessionUser): void {
  const maxAge = sessionMaxAge(user.exp);
  const opts = { ...baseCookieOptions(), maxAge };
  res.cookies.set(TOKEN_COOKIE, token, opts);
  res.cookies.set(USER_COOKIE, serializeUserCookie(user), opts);
}

/** Clears both session cookies on a response. */
export function clearSessionCookies(res: NextResponse): void {
  const opts = { ...baseCookieOptions(), maxAge: 0 };
  res.cookies.set(TOKEN_COOKIE, "", opts);
  res.cookies.set(USER_COOKIE, "", opts);
}
