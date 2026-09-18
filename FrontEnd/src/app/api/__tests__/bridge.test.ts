// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as proxyPost, GET as proxyGet } from "@/app/api/[...path]/route";
import { POST as logoutPost } from "@/app/api/session/logout/route";
import { GET as uploadsGet } from "@/app/uploads/[...path]/route";
import { isSafeUploadPath } from "@/lib/backend";
import { base64UrlEncode, serializeUserCookie } from "@/lib/session-cookie";

const future = Math.floor(Date.now() / 1000) + 3600;
const token = `${base64UrlEncode('{"alg":"HS512"}')}.${base64UrlEncode(JSON.stringify({ exp: future }))}.sig`;
const userCookie = serializeUserCookie({
  email: "amira@demo.tn",
  nom: "Amira",
  role: "ANNONCEUR",
  userId: 12,
  exp: future,
});
const cookies = `zelqane_token=${token}; zelqane_user=${userCookie}`;

const fetchMock = vi.fn<typeof fetch>();

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

beforeEach(() => {
  process.env.ZELQANE_API_URL = "http://backend.test";
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
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

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function clearedCookies(res: Response): string[] {
  return res.headers
    .getSetCookie()
    .filter((c) => /^zelqane_(token|user)=;/.test(c) && /max-age=0/i.test(c));
}

describe("/api/[...path] bridge", () => {
  it("streams a multipart upload byte for byte with its boundary and the bearer token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 5 }));
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10])], "a.jpg", { type: "image/jpeg" }),
    );
    form.append("kind", "BANNER");
    const encoded = new Response(form);
    const contentType = encoded.headers.get("content-type") ?? "";
    const raw = new Uint8Array(await encoded.arrayBuffer());

    const req = new NextRequest("http://localhost:3000/api/campaigns/7/media", {
      method: "POST",
      headers: { "content-type": contentType, cookie: cookies, "user-agent": "Vitest UA" },
      body: raw,
    });
    const res = await proxyPost(req, ctx(["campaigns", "7", "media"]));
    expect(res.status).toBe(201);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(urlOf(url)).toBe("http://backend.test/api/campaigns/7/media");
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe(contentType);
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(headers.get("user-agent")).toBe("Vitest UA");
    expect((init as { duplex?: string }).duplex).toBe("half");
    const forwarded = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
    expect(forwarded).toEqual(raw);
  });

  it("refuses dot segments that would escape /api once normalised", async () => {
    for (const path of [
      ["..", "actuator", "health"],
      ["campaigns", "..", "..", "auth", "login"],
      ["a\\b"],
    ]) {
      const req = new NextRequest("http://localhost:3000/api/x", { headers: { cookie: cookies } });
      const res = await proxyGet(req, ctx(path));
      expect(res.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a JSON body unchanged (no re-encoding)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const body = '{"name":"Soldes d\'été",  "budget":1200}';
    const req = new NextRequest("http://localhost:3000/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies },
      body,
    });
    await proxyPost(req, ctx(["campaigns"]));
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(body);
  });

  it("refuses bodies above 60 MB before calling the backend", async () => {
    const req = new NextRequest("http://localhost:3000/api/campaigns/7/media", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(61 * 1024 * 1024),
        cookie: cookies,
      },
      body: "x",
    });
    const res = await proxyPost(req, ctx(["campaigns", "7", "media"]));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ends the session on a JSON 401 with a session code", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { status: 401, code: "SESSION_REVOKED", message: "Session révoquée." }),
    );
    const req = new NextRequest("http://localhost:3000/api/me", { headers: { cookie: cookies } });
    const res = await proxyGet(req, ctx(["me"]));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "SESSION_EXPIRED" });
    expect(clearedCookies(res)).toHaveLength(2);
  });

  it("passes other 401/403 bodies through without touching cookies", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { status: 403, code: "ACCESS_DENIED", message: "Accès refusé." }),
    );
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      headers: { cookie: cookies },
    });
    const res = await proxyGet(req, ctx(["admin", "users"]));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "ACCESS_DENIED" });
    expect(clearedCookies(res)).toHaveLength(0);
  });

  it("keeps the legacy empty-403 rule", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    const req = new NextRequest("http://localhost:3000/api/zones", {
      headers: { cookie: cookies },
    });
    const res = await proxyGet(req, ctx(["zones"]));
    expect(res.status).toBe(401);
    expect(clearedCookies(res)).toHaveLength(2);
  });

  it("streams downloads with their content-disposition", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("﻿Date;Affichages\n", {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=UTF-8",
          "content-disposition": 'attachment; filename="zelqane.csv"',
        },
      }),
    );
    const req = new NextRequest("http://localhost:3000/api/statistics/export.csv?type=mine", {
      headers: { cookie: cookies },
    });
    const res = await proxyGet(req, ctx(["statistics", "export.csv"]));
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="zelqane.csv"');
    expect(await res.text()).toContain("Affichages");
    expect(urlOf(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://backend.test/api/statistics/export.csv?type=mine",
    );
  });
});

describe("/api/session/logout", () => {
  it("revokes the backend session with the token, then clears cookies", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const req = new Request("http://localhost:3000/api/session/logout", {
      method: "POST",
      headers: { cookie: cookies, host: "localhost:3000" },
    });
    const res = await logoutPost(req);
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(urlOf(url)).toBe("http://backend.test/api/me/logout");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(clearedCookies(res)).toHaveLength(2);
  });

  it("still clears cookies when the backend answers 401 or is down", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: "SESSION_REVOKED" }));
    const req = () =>
      new Request("http://localhost:3000/api/session/logout", {
        method: "POST",
        headers: { cookie: cookies },
      });
    expect(clearedCookies(await logoutPost(req()))).toHaveLength(2);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const res = await logoutPost(req());
    expect(res.status).toBe(200);
    expect(clearedCookies(res)).toHaveLength(2);
  });

  it("does not call the backend without a token", async () => {
    const res = await logoutPost(
      new Request("http://localhost:3000/api/session/logout", { method: "POST" }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("/uploads/[...path] passthrough", () => {
  it("rejects traversal and odd segments", () => {
    expect(isSafeUploadPath(["campaigns", "12", "a.jpg"])).toBe(true);
    expect(isSafeUploadPath(["..", "etc", "passwd"])).toBe(false);
    expect(isSafeUploadPath(["campaigns", "a\\b.jpg"])).toBe(false);
    expect(isSafeUploadPath(["campaigns", "%2e%2e"])).toBe(false);
    expect(isSafeUploadPath([])).toBe(false);
  });

  it("returns 404 for an unsafe path without calling the backend", async () => {
    const req = new NextRequest("http://localhost:3000/uploads/x");
    const res = await uploadsGet(req, ctx(["..", "secret"]));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards Range and streams a 206 with its headers, never the cookies", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 206,
        headers: {
          "content-type": "video/mp4",
          "content-length": "4",
          "content-range": "bytes 0-3/1000",
          "accept-ranges": "bytes",
          etag: '"v1"',
          "set-cookie": "leak=1",
        },
      }),
    );
    const req = new NextRequest("http://localhost:3000/uploads/campaigns/12/v.mp4", {
      headers: { range: "bytes=0-3", cookie: cookies },
    });
    const res = await uploadsGet(req, ctx(["campaigns", "12", "v.mp4"]));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-3/1000");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("etag")).toBe('"v1"');
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(urlOf(url)).toBe("http://backend.test/uploads/campaigns/12/v.mp4");
    const headers = new Headers(init?.headers);
    expect(headers.get("range")).toBe("bytes=0-3");
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("authorization")).toBeNull();
  });

  it("maps backend errors to 404 / 502", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>401</html>", { status: 401 }));
    const req = () => new NextRequest("http://localhost:3000/uploads/campaigns/1/a.jpg");
    expect((await uploadsGet(req(), ctx(["campaigns", "1", "a.jpg"]))).status).toBe(404);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await uploadsGet(req(), ctx(["campaigns", "1", "a.jpg"]))).status).toBe(502);
  });
});
