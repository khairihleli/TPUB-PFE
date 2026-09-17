/**
 * Post-authentication redirect: honour ?next= only for same-origin relative paths the role
 * may open, otherwise go to the role home (ANNONCEUR → /espace, staff → /admin).
 */
import type { RoleCode, SessionUser } from "@/lib/api/types";
import { canAccessPath, roleHome, safeNextPath } from "@/lib/session-cookie";

/** Auth screens never make sense as a destination (avoids redirect loops). */
const AUTH_PATHS = ["/connexion", "/inscription", "/mot-de-passe-oublie", "/mot-de-passe-requis"];

const ORIGIN = "https://tpub.invalid";

/** Control characters (C0, DEL) and backslashes are never legitimate in a next path. */
function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * Returns a normalised same-origin path ("/espace/campagnes?x=1#y") or null.
 * Rejects absolute URLs, protocol-relative and backslash tricks, control characters,
 * API routes and auth screens.
 */
export function safeRedirectPath(next: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(next) ? next[0] : next;
  if (typeof raw !== "string") return null;
  const candidate = raw.trim();
  if (candidate.length === 0 || candidate.length > 2048) return null;
  if (hasUnsafeChars(candidate)) return null;
  if (!safeNextPath(candidate)) return null;

  let url: URL;
  try {
    url = new URL(candidate, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;

  const path = url.pathname;
  if (path === "/api" || path.startsWith("/api/")) return null;
  if (AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  return `${path}${url.search}${url.hash}`;
}

/** Where to send a freshly authenticated user. */
export function postAuthDestination(
  next: string | string[] | null | undefined,
  role: RoleCode,
): string {
  const safe = safeRedirectPath(next);
  if (safe && canAccessPath(role, safe)) return safe;
  return roleHome(role);
}

/** Builds an auth link that keeps a valid ?next= (e.g. « Créer un compte » from /connexion). */
export function withNext(href: string, next: string | null | undefined): string {
  const safe = safeRedirectPath(next);
  return safe ? `${href}?next=${encodeURIComponent(safe)}` : href;
}

/** Round 2 §3.2: forced password change screen. */
export const PASSWORD_REQUIRED_PATH = "/mot-de-passe-requis";
/** Round 2 §3.7: second login step and mandatory 2FA enrolment. */
export const VERIFICATION_PATH = "/connexion/verification";
export const ENROLMENT_PATH = "/connexion/activer-2fa";

/**
 * Destination once a session is open: the forced password change first (keeping a valid
 * ?next=), otherwise `postAuthDestination`.
 */
export function sessionDestination(
  next: string | string[] | null | undefined,
  user: Pick<SessionUser, "role" | "mustChangePassword">,
): string {
  if (user.mustChangePassword === true) return withNext(PASSWORD_REQUIRED_PATH, safeRedirectPath(next));
  return postAuthDestination(next, user.role);
}
