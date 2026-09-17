/** Server-only: forwards login/register/logout to Spring and manages the httpOnly cookies. */
import { NextResponse } from "next/server";

import type { SessionResponse } from "@/lib/api/types";
import { backendUrl, clientContextHeaders, parseJsonSafe, UNREACHABLE_BODY } from "@/lib/backend";
import { applySessionCookies, clearSessionCookies } from "@/lib/session";
import { isAuthResponse, sessionUserFromAuth, TOKEN_COOKIE } from "@/lib/session-cookie";

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

  if (!isAuthResponse(data)) {
    return noStore(
      { status: 502, message: "Réponse inattendue du service d'authentification." },
      502,
    );
  }

  const user = sessionUserFromAuth(data);
  const res = noStore({ user } satisfies SessionResponse, kind === "register" ? 201 : 200);
  applySessionCookies(res, data.token, user);
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
