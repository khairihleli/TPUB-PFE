/**
 * Pure session cookie helpers, shared by route handlers, middleware (edge) and server
 * components. No Node-only APIs (no Buffer): works on every runtime.
 */
import type { AuthResponse, RoleCode, SessionUser } from "@/lib/api/types";

export const TOKEN_COOKIE = "tpub_token";
export const USER_COOKIE = "tpub_user";

/** Fallback lifetime when the JWT has no readable `exp` (backend default 24 h). */
export const DEFAULT_SESSION_SECONDS = 24 * 60 * 60;

const ROLES: readonly RoleCode[] = ["ADMINISTRATEUR", "ANNONCEUR", "OPERATEUR", "SUPERVISEUR"];

export function isRoleCode(v: unknown): v is RoleCode {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function isStaffRole(role: RoleCode): boolean {
  return role === "ADMINISTRATEUR" || role === "SUPERVISEUR" || role === "OPERATEUR";
}

/** Home of each role after login. */
export function roleHome(role: RoleCode): "/espace" | "/admin" {
  return role === "ANNONCEUR" ? "/espace" : "/admin";
}

// ---------------------------------------------------------------------------
// base64url (UTF-8 safe)
// ---------------------------------------------------------------------------
export function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(input: string): string | null {
  try {
    let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Reads the `exp` claim (seconds) of a JWT without verifying it. */
export function decodeJwtExp(token: string | null | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  const json = base64UrlDecode(parts[1]);
  if (!json) return null;
  try {
    const payload = JSON.parse(json) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}

export function nowSeconds(now: number = Date.now()): number {
  return Math.floor(now / 1000);
}

/** Session user derived from a Spring AuthResponse (token stays server-side). */
export function sessionUserFromAuth(auth: AuthResponse, now: number = Date.now()): SessionUser {
  const exp = decodeJwtExp(auth.token) ?? nowSeconds(now) + DEFAULT_SESSION_SECONDS;
  return { email: auth.email, nom: auth.nom, role: auth.role, userId: auth.userId, exp };
}

/** Cookie max-age in seconds (JWT exp − now, fallback 24 h, never negative). */
export function sessionMaxAge(exp: number | null, now: number = Date.now()): number {
  if (exp === null) return DEFAULT_SESSION_SECONDS;
  return Math.max(0, exp - nowSeconds(now));
}

export function isAuthResponse(v: unknown): v is AuthResponse {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.token === "string" &&
    o.token.length > 0 &&
    typeof o.email === "string" &&
    typeof o.nom === "string" &&
    isRoleCode(o.role) &&
    typeof o.userId === "number"
  );
}

export function serializeUserCookie(user: SessionUser): string {
  return base64UrlEncode(JSON.stringify(user));
}

/** Parses + validates the `tpub_user` cookie. Invalid or malformed → null. */
export function parseUserCookie(value: string | null | undefined): SessionUser | null {
  if (!value) return null;
  const json = base64UrlDecode(value);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    if (
      typeof o.email !== "string" ||
      typeof o.nom !== "string" ||
      !isRoleCode(o.role) ||
      typeof o.userId !== "number" ||
      typeof o.exp !== "number"
    ) {
      return null;
    }
    return { email: o.email, nom: o.nom, role: o.role, userId: o.userId, exp: o.exp };
  } catch {
    return null;
  }
}

export function isSessionExpired(
  user: Pick<SessionUser, "exp">,
  now: number = Date.now(),
): boolean {
  return user.exp <= nowSeconds(now);
}

/**
 * Validates both cookies. Returns the user only when a token exists, the user cookie is
 * well-formed and neither the user nor the token is expired.
 */
export function readSession(
  token: string | null | undefined,
  userCookie: string | null | undefined,
  now: number = Date.now(),
): SessionUser | null {
  if (!token) return null;
  const user = parseUserCookie(userCookie);
  if (!user || isSessionExpired(user, now)) return null;
  const tokenExp = decodeJwtExp(token);
  if (tokenExp !== null && tokenExp <= nowSeconds(now)) return null;
  return user;
}

/** Only accepts a relative in-app path for `?next=` (no open redirect). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/api/")) return null;
  return next;
}

/** Whether `path` is allowed for `role` (used after login to honour ?next=). */
export function canAccessPath(role: RoleCode, path: string): boolean {
  if (path === "/espace" || path.startsWith("/espace/")) return role === "ANNONCEUR";
  if (path === "/admin" || path.startsWith("/admin/")) return isStaffRole(role);
  return true;
}
