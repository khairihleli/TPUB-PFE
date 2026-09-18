// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as realtimeGet } from "@/app/api/realtime/[...path]/route";
import { base64UrlEncode, serializeUserCookie } from "@/lib/session-cookie";

const future = Math.floor(Date.now() / 1000) + 3600;
const token = `${base64UrlEncode('{"alg":"HS512"}')}.${base64UrlEncode(JSON.stringify({ exp: future }))}.sig`;
const userCookie = serializeUserCookie({
  email: "superviseur@zelqane.test",
  nom: "Superviseur",
  role: "SUPERVISEUR",
  userId: 4,
  exp: future,
});
const cookies = `zelqane_token=${token}; zelqane_user=${userCookie}`;

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  process.env.ZELQANE_API_URL = "http://backend.test";
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ZELQANE_API_URL;
});

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function request(cookie = cookies): NextRequest {
  return new NextRequest("http://localhost:3000/api/realtime/supervision", {
    method: "GET",
    headers: cookie ? { cookie } : {},
  });
}

/** Upstream that sends one event, waits, then sends a second one and closes. */
function streamingUpstream(): { response: Response; push: (chunk: string) => void; end: () => void } {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    push: (chunk: string) => controller.enqueue(encoder.encode(chunk)),
    end: () => controller.close(),
  };
}

describe("/api/realtime/[...path]", () => {
  it("streams chunks as they arrive, before the upstream closes", async () => {
    const upstream = streamingUpstream();
    fetchMock.mockResolvedValueOnce(upstream.response);

    const res = await realtimeGet(request(), ctx(["supervision"]));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    upstream.push("retry: 5000\n\nevent: snapshot\ndata: {}\n\n");
    const first = await reader.read();
    expect(decoder.decode(first.value)).toContain("event: snapshot");

    upstream.push("event: presence\ndata: {}\n\n");
    const second = await reader.read();
    expect(decoder.decode(second.value)).toContain("event: presence");

    upstream.end();
    expect((await reader.read()).done).toBe(true);

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(headers.get("accept")).toBe("text/event-stream");
  });

  it("refuses a request without a session and clears the cookies", async () => {
    const res = await realtimeGet(request(""), ctx(["supervision"]));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie().some((c) => /^zelqane_token=;/.test(c))).toBe(true);
  });

  it("ends the session when the backend rejects the token", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "TOKEN_EXPIRED", message: "Session expirée" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const res = await realtimeGet(request(), ctx(["supervision"]));
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().some((c) => /^zelqane_user=;/.test(c))).toBe(true);
  });

  it("refuses a path that could escape the realtime routes", async () => {
    const res = await realtimeGet(request(), ctx(["..", "auth"]));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 502 when the backend is unreachable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await realtimeGet(request(), ctx(["supervision"]));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "BACKEND_UNREACHABLE" });
  });
});
