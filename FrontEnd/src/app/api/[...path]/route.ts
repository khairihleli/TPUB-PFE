/**
 * Same-origin bridge to the Spring backend: /api/<path> → ${TPUB_API_URL}/api/<path>.
 * Adds `Authorization: Bearer` from the httpOnly `tpub_token` cookie.
 * /api/auth/* is refused: authentication goes through /api/session/*.
 *
 * Bodies are forwarded byte for byte: JSON is never re-encoded and multipart uploads keep their
 * `content-type` boundary. Non-JSON request bodies (multipart, binary) are streamed; responses
 * are streamed too (CSV exports), except 401/403 which are inspected for the session rules.
 */
import { type NextRequest, NextResponse } from "next/server";

import {
  backendUrl,
  clientContextHeaders,
  declaredContentLength,
  errorCodeOf,
  HOP_BY_HOP,
  isSafeUploadPath,
  MAX_FORWARDED_BODY_BYTES,
  PAYLOAD_TOO_LARGE_BODY,
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

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "x-request-id",
  "range",
  "if-none-match",
  "if-modified-since",
];

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

function sessionExpired(): NextResponse {
  const res = json(SESSION_EXPIRED_BODY, 401);
  clearSessionCookies(res);
  return res;
}

/** JSON bodies are small: buffer them (keeps the « empty body → no body » rule). */
function isStreamable(contentType: string | null): boolean {
  if (!contentType) return false;
  const type = contentType.toLowerCase();
  return !(type.includes("application/json") || type.includes("+json") || type.startsWith("text/"));
}

type ForwardBody = { body: BodyInit | undefined; stream: boolean };

async function requestBody(req: NextRequest, method: string): Promise<ForwardBody> {
  if (method === "GET" || method === "HEAD") return { body: undefined, stream: false };
  if (isStreamable(req.headers.get("content-type")) && req.body) {
    return { body: req.body, stream: true };
  }
  const buffer = await req.arrayBuffer();
  return { body: buffer.byteLength > 0 ? buffer : undefined, stream: false };
}

async function handler(req: NextRequest, ctx: Ctx): Promise<NextResponse | Response> {
  const { path = [] } = await ctx.params;
  const segments = path.filter(Boolean);

  // Dot or encoded-separator segments would be normalised by fetch into another backend path
  // (e.g. `../auth` or outside /api): refuse them like an unknown route.
  if (segments.length === 0 || segments[0] === "auth" || !isSafeUploadPath(segments)) {
    return json({ status: 404, code: "NOT_FOUND", message: "Ressource introuvable." }, 404);
  }

  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !sameOrigin(req)) {
    return json({ status: 403, code: "ACCESS_DENIED", message: "Requête refusée." }, 403);
  }

  const declared = declaredContentLength(req.headers);
  if (declared !== null && declared > MAX_FORWARDED_BODY_BYTES) {
    return json(PAYLOAD_TOO_LARGE_BODY, 413);
  }

  const tokenCookie = req.cookies.get(TOKEN_COOKIE)?.value;
  const session = readSession(tokenCookie, req.cookies.get(USER_COOKIE)?.value);

  // A token cookie that is expired (or whose user cookie is invalid) means the session ended.
  if (tokenCookie && !session) return sessionExpired();

  const dest = `${backendUrl()}/api/${segments.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = clientContextHeaders(req.headers);
  for (const h of FORWARDED_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (session && tokenCookie) headers.set("authorization", `Bearer ${tokenCookie}`);

  let upstream: Response;
  try {
    const { body, stream } = await requestBody(req, method);
    const init: RequestInit & { duplex?: "half" } = {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: req.signal,
    };
    // Node fetch requires `duplex: "half"` to send a ReadableStream body.
    if (stream) init.duplex = "half";
    upstream = await fetch(dest, init);
  } catch (e) {
    if (req.signal.aborted || (e as { name?: unknown } | null)?.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    console.error(`[api] ${method} ${dest}: ${(e as Error | null)?.message ?? "unknown error"}`);
    return json(UNREACHABLE_BODY, 502);
  }

  // Backend gateway errors look like "unreachable" to the user.
  if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
    await upstream.body?.cancel().catch(() => undefined);
    return json(UNREACHABLE_BODY, 502);
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) outHeaders.set(key, value);
  });
  outHeaders.set("cache-control", "no-store");

  const status = upstream.status;
  const nullBody = status === 204 || status === 205 || status === 304 || method === "HEAD";

  if (status === 401 || status === 403) {
    let text: string;
    try {
      text = await upstream.text();
    } catch {
      if (req.signal.aborted) return new Response(null, { status: 499 });
      return json(UNREACHABLE_BODY, 502);
    }
    if (tokenCookie) {
      // Pre-v2 Spring answers an invalid/expired token with an EMPTY 403 (security filter).
      if (status === 403 && text.length === 0) return sessionExpired();
      // v2: JSON 401 whose code says the session is over (revoked, expired, account disabled).
      const code = errorCodeOf(parseJsonSafe(text));
      if (status === 401 && code !== null && SESSION_END_CODES.has(code)) return sessionExpired();
    }
    return new Response(nullBody ? null : text, { status, headers: outHeaders });
  }

  return new Response(nullBody ? null : upstream.body, { status, headers: outHeaders });
}

export const GET = handler;
export const HEAD = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
