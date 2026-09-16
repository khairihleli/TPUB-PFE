/** Server-only: forwards login/register to Spring and turns the JWT into httpOnly cookies. */
import { NextResponse } from "next/server";

import type { SessionResponse } from "@/lib/api/types";
import { backendUrl, parseJsonSafe, UNREACHABLE_BODY } from "@/lib/backend";
import { applySessionCookies } from "@/lib/session";
import { isAuthResponse, sessionUserFromAuth } from "@/lib/session-cookie";

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
 */
export async function forwardAuth(req: Request, kind: "login" | "register"): Promise<NextResponse> {
  if (!sameOrigin(req)) return noStore({ status: 403, message: "Requête refusée." }, 403);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return noStore({ status: 400, message: "Requête invalide." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return noStore({ status: 400, message: "Requête invalide." }, 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendUrl()}/api/auth/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
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
    // Pass the Spring error body through: the browser client translates it to French.
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
