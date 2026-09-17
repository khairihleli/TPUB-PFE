/**
 * Same-origin passthrough for public campaign media: /uploads/<path> → ${TPUB_API_URL}/uploads/<path>
 * (contract §2.3: `MediaFileResponse.url`, `CampaignResponse.mediaUrl`, `DiffusionResponse.mediaUrl`
 * are "/uploads/…" paths). Public, read-only, streamed (no buffering), Range requests supported
 * so the player can seek in videos. No cookie or token is ever forwarded.
 */
import type { NextRequest } from "next/server";

import { backendUrl, clientContextHeaders, isSafeUploadPath } from "@/lib/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

const FORWARDED_REQUEST_HEADERS = ["range", "if-none-match", "if-modified-since", "if-range"];

const PASSED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
  "expires",
];

function plain(status: number): Response {
  return new Response(null, { status, headers: { "cache-control": "no-store" } });
}

async function handler(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { path = [] } = await ctx.params;
  if (!isSafeUploadPath(path)) return plain(404);

  const dest = `${backendUrl()}/uploads/${path.map(encodeURIComponent).join("/")}`;
  const headers = clientContextHeaders(req.headers);
  for (const h of FORWARDED_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }

  const method = req.method.toUpperCase() === "HEAD" ? "HEAD" : "GET";
  let upstream: Response;
  try {
    upstream = await fetch(dest, {
      method,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: req.signal,
    });
  } catch (e) {
    if (req.signal.aborted || (e as { name?: unknown } | null)?.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    console.error(`[uploads] ${dest}: ${(e as Error | null)?.message ?? "unknown error"}`);
    return plain(502);
  }

  const status = upstream.status;
  // Never expose backend redirects, auth challenges or error pages: a missing file is a 404.
  const passthrough = status === 200 || status === 206 || status === 304 || status === 416;
  if (!passthrough) {
    await upstream.body?.cancel().catch(() => undefined);
    return plain(status === 502 || status === 503 || status === 504 ? 502 : 404);
  }

  const out = new Headers();
  // fetch() transparently decodes compressed bodies: the upstream length would then be wrong.
  const encoded = upstream.headers.has("content-encoding");
  for (const h of PASSED_RESPONSE_HEADERS) {
    if (encoded && h === "content-length") continue;
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  if (!out.has("cache-control")) out.set("cache-control", "public, max-age=86400");
  out.set("x-content-type-options", "nosniff");

  const nullBody = status === 304 || method === "HEAD";
  return new Response(nullBody ? null : upstream.body, { status, headers: out });
}

export const GET = handler;
export const HEAD = handler;
