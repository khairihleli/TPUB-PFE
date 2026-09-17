/**
 * Streaming bridge for the Server-Sent Events of the backend (docs/round2-contract.md §5.3).
 * It takes precedence over the catch-all `/api/[...path]` route, adds the Bearer token of the
 * session cookie and streams the upstream body untouched (no gzip, no buffering).
 */
import { type NextRequest, NextResponse } from "next/server";

import {
  backendUrl,
  clientContextHeaders,
  errorCodeOf,
  isSafeUploadPath,
  parseJsonSafe,
  SESSION_END_CODES,
  SESSION_EXPIRED_BODY,
  UNREACHABLE_BODY,
} from "@/lib/backend";
import { clearSessionCookies } from "@/lib/session";
import { readSession, TOKEN_COOKIE, USER_COOKIE } from "@/lib/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function sessionExpired(): NextResponse {
  const res = json(SESSION_EXPIRED_BODY, 401);
  clearSessionCookies(res);
  return res;
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params;
  const segments = path.filter(Boolean);
  if (segments.length === 0 || !isSafeUploadPath(segments)) {
    return json({ status: 404, code: "NOT_FOUND", message: "Ressource introuvable." }, 404);
  }

  const tokenCookie = req.cookies.get(TOKEN_COOKIE)?.value;
  const session = readSession(tokenCookie, req.cookies.get(USER_COOKIE)?.value);
  if (!tokenCookie || !session) return sessionExpired();

  const headers = clientContextHeaders(req.headers);
  headers.set("accept", "text/event-stream");
  headers.set("authorization", `Bearer ${tokenCookie}`);

  const dest = `${backendUrl()}/api/realtime/${segments.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(dest, {
      method: "GET",
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: req.signal,
    });
  } catch (e) {
    if (req.signal.aborted || (e as { name?: unknown } | null)?.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    console.error(`[realtime] GET ${dest}: ${(e as Error | null)?.message ?? "unknown error"}`);
    return json(UNREACHABLE_BODY, 502);
  }

  if (upstream.status === 401 || upstream.status === 403) {
    const text = await upstream.text().catch(() => "");
    if (upstream.status === 403 && text.length === 0) return sessionExpired();
    const code = errorCodeOf(parseJsonSafe(text));
    if (code !== null && SESSION_END_CODES.has(code)) return sessionExpired();
    return json(text ? parseJsonSafe(text) : SESSION_EXPIRED_BODY, upstream.status);
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    const body = parseJsonSafe(text);
    return json(body ?? UNREACHABLE_BODY, upstream.ok ? 502 : upstream.status);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      // `no-transform` stops the gzip of Next from buffering the stream.
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
