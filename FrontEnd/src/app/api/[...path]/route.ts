/**
 * Same-origin bridge to the Spring backend: /api/<path> → ${TPUB_API_URL}/api/<path>.
 * Adds `Authorization: Bearer` from the httpOnly `tpub_token` cookie.
 * /api/auth/* is refused: authentication goes through /api/session/*.
 */
import { type NextRequest, NextResponse } from "next/server";

import { backendUrl, HOP_BY_HOP, SESSION_EXPIRED_BODY, UNREACHABLE_BODY } from "@/lib/backend";
import { clearSessionCookies } from "@/lib/session";
import { readSession, TOKEN_COOKIE, USER_COOKIE } from "@/lib/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

const FORWARDED_REQUEST_HEADERS = ["accept", "accept-language", "content-type", "x-request-id"];

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function handler(req: NextRequest, ctx: Ctx): Promise<NextResponse | Response> {
  const { path = [] } = await ctx.params;
  const segments = path.filter(Boolean);

  if (segments.length === 0 || segments[0] === "auth") {
    return json({ status: 404, message: "Ressource introuvable." }, 404);
  }

  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !sameOrigin(req)) {
    return json({ status: 403, message: "Requête refusée." }, 403);
  }

  const tokenCookie = req.cookies.get(TOKEN_COOKIE)?.value;
  const session = readSession(tokenCookie, req.cookies.get(USER_COOKIE)?.value);

  // A token cookie that is expired (or whose user cookie is invalid) means the session ended.
  if (tokenCookie && !session) {
    const res = json(SESSION_EXPIRED_BODY, 401);
    clearSessionCookies(res);
    return res;
  }

  const dest = `${backendUrl()}/api/${segments.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARDED_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const xff = req.headers.get("x-forwarded-for");
  if (xff) headers.set("x-forwarded-for", xff);
  if (session && tokenCookie) headers.set("authorization", `Bearer ${tokenCookie}`);

  let upstream: Response;
  try {
    const hasBody = method !== "GET" && method !== "HEAD";
    const body = hasBody ? await req.arrayBuffer() : undefined;
    upstream = await fetch(dest, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: req.signal,
    });
  } catch (e) {
    if (req.signal.aborted || (e as { name?: unknown } | null)?.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    console.error(`[api] ${method} ${dest}: ${(e as Error | null)?.message ?? "unknown error"}`);
    return json(UNREACHABLE_BODY, 502);
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await upstream.arrayBuffer();
  } catch {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return json(UNREACHABLE_BODY, 502);
  }

  // Spring answers an invalid/expired token with an EMPTY 403 (security filter).
  if (upstream.status === 403 && buffer.byteLength === 0 && tokenCookie) {
    const res = json(SESSION_EXPIRED_BODY, 401);
    clearSessionCookies(res);
    return res;
  }

  // Backend gateway errors look like "unreachable" to the user.
  if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
    return json(UNREACHABLE_BODY, 502);
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders.set(key, value);
  });
  outHeaders.set("cache-control", "no-store");

  const status = upstream.status;
  const nullBody = status === 204 || status === 205 || status === 304 || method === "HEAD";
  return new Response(nullBody ? null : buffer, { status, headers: outHeaders });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
