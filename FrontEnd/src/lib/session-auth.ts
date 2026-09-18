/** Server-only: forwards login/register/logout to Spring and manages the httpOnly cookies. */
import { NextResponse } from "next/server";

import type {
  SessionEnrolmentResult,
  SessionLoginResult,
  SessionResponse,
  SessionVerifyResult,
  TotpSetupResponse,
} from "@/lib/api/types";
import {
  backendUrl,
  clientContextHeaders,
  errorCodeOf,
  parseJsonSafe,
  SESSION_EXPIRED_BODY,
  UNREACHABLE_BODY,
} from "@/lib/backend";
import { applySessionCookies, clearSessionCookies } from "@/lib/session";
import {
  CHALLENGE_COOKIE,
  CHALLENGE_COOKIE_PATH,
  CHALLENGE_MARKER_COOKIE,
  challengeMaxAge,
  isAuthResponse,
  isLoginChallenge,
  readSession,
  sessionUserFromAuth,
  TOKEN_COOKIE,
  USER_COOKIE,
  withAccountFlags,
} from "@/lib/session-cookie";

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * POSTs the JSON body to `/api/auth/<kind>` WITHOUT any Authorization header
 * (a stale token breaks Spring's auth routes), then sets the session cookies.
 * User agent and client IP are forwarded: the backend stores them on the session and in the
 * login history (contract §2.10).
 */
export async function forwardAuth(req: Request, kind: "login" | "register"): Promise<NextResponse> {
  if (!sameOrigin(req)) {
    return noStore({ status: 403, code: "ACCESS_DENIED", message: "Requête refusée." }, 403);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return noStore({ status: 400, code: "INVALID_BODY", message: "Requête invalide." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return noStore({ status: 400, code: "INVALID_BODY", message: "Requête invalide." }, 400);
  }

  const headers = clientContextHeaders(req.headers);
  headers.set("content-type", "application/json");
  headers.set("accept", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl()}/api/auth/${kind}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "manual",
      signal: req.signal,
    });
  } catch (e) {
    console.error(`[session] ${kind}: ${(e as Error | null)?.message ?? "unknown error"}`);
    return noStore(UNREACHABLE_BODY, 502);
  }

  const text = await upstream.text().catch(() => "");
  const data = parseJsonSafe(text);

  if (!upstream.ok) {
    if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
      return noStore(UNREACHABLE_BODY, 502);
    }
    // Pass the Spring error body (with its `code`) through: the browser client translates it.
    const body =
      data && typeof data === "object"
        ? data
        : { status: upstream.status, message: upstream.status >= 500 ? "" : "Requête refusée." };
    return noStore(body, upstream.status);
  }

  if (kind === "login" && isLoginChallenge(data)) {
    // Round 2 §3.7: the challenge token stays in an httpOnly cookie, never in JavaScript.
    const res = noStore(
      { status: data.status, email: data.email, expiresAt: data.expiresAt } satisfies SessionLoginResult,
      200,
    );
    clearSessionCookies(res);
    applyChallengeCookies(res, data.challengeToken, data.expiresAt);
    return res;
  }

  if (!isAuthResponse(data)) {
    return noStore(UNEXPECTED_AUTH_BODY, 502);
  }

  const user = sessionUserFromAuth(data);
  const body =
    kind === "register"
      ? ({ user } satisfies SessionResponse)
      : ({ status: "AUTHENTICATED", user } satisfies SessionLoginResult);
  const res = noStore(body, kind === "register" ? 201 : 200);
  applySessionCookies(res, data.token, user);
  return res;
}

const UNEXPECTED_AUTH_BODY = {
  status: 502,
  message: "Réponse inattendue du service d'authentification.",
} as const;

const CHALLENGE_EXPIRED_BODY = {
  status: 401,
  code: "CHALLENGE_EXPIRED",
  message: "La vérification a expiré. Reconnectez-vous.",
} as const;

function challengeCookieOptions(maxAge: number, path: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "1",
    path,
    maxAge,
  };
}

/** `zelqane_challenge` (token, path /api/session) + the page marker (no token, path /connexion). */
export function applyChallengeCookies(res: NextResponse, token: string, expiresAt: string): void {
  const maxAge = challengeMaxAge(expiresAt);
  res.cookies.set(CHALLENGE_COOKIE, token, challengeCookieOptions(maxAge, CHALLENGE_COOKIE_PATH));
  res.cookies.set(CHALLENGE_MARKER_COOKIE, "1", challengeCookieOptions(maxAge, "/connexion"));
}

export function clearChallengeCookies(res: NextResponse): void {
  res.cookies.set(CHALLENGE_COOKIE, "", challengeCookieOptions(0, CHALLENGE_COOKIE_PATH));
  res.cookies.set(CHALLENGE_MARKER_COOKIE, "", challengeCookieOptions(0, "/connexion"));
}

/** Second-step routes of round 2 §3.7 (Next path → Spring path). */
export type ChallengeStep = "verify" | "enrolment-setup" | "enrolment-enable";

const CHALLENGE_TARGETS: Record<ChallengeStep, string> = {
  verify: "/api/auth/login/verify",
  "enrolment-setup": "/api/auth/2fa/setup",
  "enrolment-enable": "/api/auth/2fa/enable",
};

/** A code typed by a person: 6 digits or a recovery code, spaces removed. */
function readCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const code = (payload as { code?: unknown }).code;
  if (typeof code !== "string") return null;
  const clean = code.replace(/\s+/g, "");
  return clean.length > 0 && clean.length <= 20 ? clean : null;
}

/**
 * Forwards a second login step to Spring with the token of the `zelqane_challenge` cookie.
 * Success of `verify` / `enrolment-enable` opens the session (cookies) and clears the challenge;
 * `CHALLENGE_EXPIRED` clears it too. `enrolment-setup` returns the pending secret.
 */
export async function forwardChallenge(req: Request, step: ChallengeStep): Promise<NextResponse> {
  if (!sameOrigin(req)) {
    return noStore({ status: 403, code: "ACCESS_DENIED", message: "Requête refusée." }, 403);
  }
  const challengeToken = cookieValue(req, CHALLENGE_COOKIE);
  if (!challengeToken) {
    const res = noStore(CHALLENGE_EXPIRED_BODY, 401);
    clearChallengeCookies(res);
    return res;
  }

  let body: Record<string, string> = { challengeToken };
  if (step !== "enrolment-setup") {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      payload = null;
    }
    const code = readCode(payload);
    if (!code) {
      return noStore(
        {
          status: 400,
          code: "VALIDATION_FAILED",
          message: "Saisissez le code de vérification.",
          errors: { code: "Champ obligatoire." },
        },
        400,
      );
    }
    body = { challengeToken, code };
  }

  const headers = clientContextHeaders(req.headers);
  headers.set("content-type", "application/json");
  headers.set("accept", "application/json");

  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl()}${CHALLENGE_TARGETS[step]}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "manual",
      signal: req.signal,
    });
  } catch (e) {
    console.error(`[session] ${step}: ${(e as Error | null)?.message ?? "unknown error"}`);
    return noStore(UNREACHABLE_BODY, 502);
  }

  const text = await upstream.text().catch(() => "");
  const data = parseJsonSafe(text);

  if (!upstream.ok) {
    if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
      return noStore(UNREACHABLE_BODY, 502);
    }
    const errorBody =
      data && typeof data === "object"
        ? data
        : { status: upstream.status, message: upstream.status >= 500 ? "" : "Requête refusée." };
    const res = noStore(errorBody, upstream.status);
    if (errorCodeOf(data) === "CHALLENGE_EXPIRED") clearChallengeCookies(res);
    return res;
  }

  if (step === "enrolment-setup") {
    if (!isTotpSetup(data)) return noStore(UNEXPECTED_AUTH_BODY, 502);
    return noStore(
      { secret: data.secret, otpauthUri: data.otpauthUri, expiresAt: data.expiresAt },
      200,
    );
  }

  if (!isAuthResponse(data)) return noStore(UNEXPECTED_AUTH_BODY, 502);
  const user = sessionUserFromAuth(data);
  const result =
    step === "verify"
      ? ({
          status: "AUTHENTICATED",
          user,
          recoveryCodeUsed: data.recoveryCodeUsed === true,
        } satisfies SessionVerifyResult)
      : ({
          status: "AUTHENTICATED",
          user,
          recoveryCodes: Array.isArray(data.recoveryCodes)
            ? data.recoveryCodes.filter((c): c is string => typeof c === "string")
            : [],
        } satisfies SessionEnrolmentResult);
  const res = noStore(result, 200);
  applySessionCookies(res, data.token, user);
  clearChallengeCookies(res);
  return res;
}

function isTotpSetup(v: unknown): v is TotpSetupResponse {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.secret === "string" &&
    typeof o.otpauthUri === "string" &&
    o.otpauthUri.startsWith("otpauth://") &&
    typeof o.expiresAt === "string"
  );
}

/**
 * `GET /api/session?actualiser=1` (round 2): re-reads `GET /api/me` with the session token and
 * rewrites the user cookie (`mustChangePassword`, `twoFactorEnabled`). A refused token ends the
 * session like the bridge does.
 */
export async function refreshSession(req: Request): Promise<NextResponse> {
  const token = cookieValue(req, TOKEN_COOKIE);
  const user = readSession(token, cookieValue(req, USER_COOKIE));
  if (!token || !user) {
    const res = noStore({ status: 401, message: "Vous n'êtes pas connecté." }, 401);
    if (token) clearSessionCookies(res);
    return res;
  }
  const headers = clientContextHeaders(req.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept", "application/json");
  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl()}/api/me`, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: req.signal,
    });
  } catch (e) {
    console.error(`[session] refresh: ${(e as Error | null)?.message ?? "unknown error"}`);
    return noStore(UNREACHABLE_BODY, 502);
  }
  const data = parseJsonSafe(await upstream.text().catch(() => ""));
  if (upstream.status === 401) {
    const res = noStore(SESSION_EXPIRED_BODY, 401);
    clearSessionCookies(res);
    return res;
  }
  if (!upstream.ok || !data || typeof data !== "object") {
    // 5xx or an unreadable profile: unreachable. Another refusal keeps the cookie user as is.
    return upstream.ok || upstream.status >= 500
      ? noStore(UNREACHABLE_BODY, 502)
      : noStore({ user } satisfies SessionResponse, 200);
  }
  const refreshed = withAccountFlags(user, data);
  const res = noStore({ user: refreshed } satisfies SessionResponse, 200);
  applySessionCookies(res, token, refreshed);
  return res;
}

/** Budget for the backend logout call: logging out must never hang on a slow backend. */
export const LOGOUT_TIMEOUT_MS = 3_000;

/** Cookie value of `name` in a raw Cookie header. */
function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

/**
 * Revokes the backend session (`POST /api/me/logout` with the token, best-effort: an expired or
 * revoked session answers a JSON 401, an unreachable backend is ignored), then clears the cookies.
 * Always answers `{ ok: true }`: the browser session ends whatever the backend said.
 */
export async function logoutSession(req: Request): Promise<NextResponse> {
  if (!sameOrigin(req)) {
    return noStore({ status: 403, code: "ACCESS_DENIED", message: "Requête refusée." }, 403);
  }
  const token = cookieValue(req, TOKEN_COOKIE);
  if (token) {
    const headers = clientContextHeaders(req.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("accept", "application/json");
    try {
      const upstream = await fetch(`${backendUrl()}/api/me/logout`, {
        method: "POST",
        headers,
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
      });
      await upstream.body?.cancel().catch(() => undefined);
      if (!upstream.ok && upstream.status !== 401 && upstream.status !== 403) {
        console.warn(`[session] logout: backend answered ${upstream.status}`);
      }
    } catch (e) {
      console.warn(`[session] logout: ${(e as Error | null)?.message ?? "unknown error"}`);
    }
  }
  const res = noStore({ ok: true }, 200);
  clearSessionCookies(res);
  return res;
}
