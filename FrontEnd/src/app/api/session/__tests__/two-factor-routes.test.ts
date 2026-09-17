// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as proxyGet } from "@/app/api/[...path]/route";
import { POST as enableRoute } from "@/app/api/session/enrolment/enable/route";
import { POST as setupRoute } from "@/app/api/session/enrolment/setup/route";
import { POST as loginRoute } from "@/app/api/session/login/route";
import { POST as verifyRoute } from "@/app/api/session/login/verify/route";
import { GET as sessionRoute } from "@/app/api/session/route";
import { GET as uploadsGet } from "@/app/uploads/[...path]/route";
import { base64UrlEncode, parseUserCookie, serializeUserCookie } from "@/lib/session-cookie";

const future = Math.floor(Date.now() / 1000) + 3600;
const token = `${base64UrlEncode('{"alg":"HS512"}')}.${base64UrlEncode(JSON.stringify({ exp: future }))}.sig`;
const expiresAt = new Date(Date.now() + 300_000).toISOString();

const fetchMock = vi.fn<typeof fetch>();

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function post(path: string, body: unknown, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      host: "localhost:3000",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function setCookie(res: Response, name: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

function sentBody(call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1];
  return JSON.parse(init?.body as string) as Record<string, unknown>;
}

const auth = {
  status: "AUTHENTICATED",
  token,
  email: "admin@tpub.local",
  nom: "Admin",
  role: "ADMINISTRATEUR",
  userId: 1,
  sessionId: "s1",
  expiresAt: new Date(future * 1000).toISOString(),
  mustChangePassword: false,
  twoFactorEnabled: true,
};

beforeEach(() => {
  process.env.TPUB_API_URL = "http://backend.test";
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TPUB_API_URL;
});

describe("/api/session/login with a TOTP challenge (§3.7)", () => {
  it("keeps the challenge token in an httpOnly cookie and never returns it", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "TOTP_REQUIRED",
        challengeToken: "tpc_secret",
        expiresAt,
        email: "admin@tpub.local",
      }),
    );
    const res = await loginRoute(post("/api/session/login", { email: "a", password: "b" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: "TOTP_REQUIRED", email: "admin@tpub.local", expiresAt });
    expect(JSON.stringify(body)).not.toContain("tpc_secret");
    const challenge = setCookie(res, "tpub_challenge");
    expect(challenge).toMatch(/^tpub_challenge=tpc_secret;/);
    expect(challenge).toMatch(/HttpOnly/i);
    expect(challenge).toMatch(/Path=\/api\/session/i);
    expect(challenge).toMatch(/SameSite=lax/i);
    expect(setCookie(res, "tpub_challenge_actif")).toMatch(/Path=\/connexion/i);
    expect(setCookie(res, "tpub_token")).toMatch(/max-age=0/i);
  });

  it("opens the session directly without 2FA", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...auth, twoFactorEnabled: false }));
    const res = await loginRoute(post("/api/session/login", { email: "a", password: "b" }));
    const body = (await res.json()) as { status: string; user: { role: string } };
    expect(body.status).toBe("AUTHENTICATED");
    expect(body.user.role).toBe("ADMINISTRATEUR");
    expect(setCookie(res, "tpub_token")).toContain(token);
  });
});

describe("second step routes", () => {
  it("verifies the code with the cookie token, opens the session and clears the challenge", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ...auth, recoveryCodeUsed: true }));
    const res = await verifyRoute(
      post("/api/session/login/verify", { code: " 123 456 " }, "tpub_challenge=tpc_abc"),
    );
    expect(res.status).toBe(200);
    expect(urlOf(fetchMock.mock.calls[0]?.[0])).toBe("http://backend.test/api/auth/login/verify");
    expect(sentBody()).toEqual({ challengeToken: "tpc_abc", code: "123456" });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBeNull();
    const body = (await res.json()) as {
      recoveryCodeUsed: boolean;
      user: { twoFactorEnabled: boolean };
    };
    expect(body.recoveryCodeUsed).toBe(true);
    expect(body.user.twoFactorEnabled).toBe(true);
    expect(setCookie(res, "tpub_token")).toContain(token);
    expect(setCookie(res, "tpub_challenge")).toMatch(/max-age=0/i);
  });

  it("answers CHALLENGE_EXPIRED without a challenge cookie and never calls the backend", async () => {
    const res = await verifyRoute(post("/api/session/login/verify", { code: "123456" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("CHALLENGE_EXPIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the challenge on a wrong code and clears it once expired", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        status: 401,
        code: "TOTP_CODE_INVALID",
        message: "Code de vérification incorrect.",
      }),
    );
    const wrong = await verifyRoute(
      post("/api/session/login/verify", { code: "000000" }, "tpub_challenge=tpc_abc"),
    );
    expect(wrong.status).toBe(401);
    expect(setCookie(wrong, "tpub_challenge")).toBeUndefined();

    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        status: 401,
        code: "CHALLENGE_EXPIRED",
        message: "La vérification a expiré.",
      }),
    );
    const expired = await verifyRoute(
      post("/api/session/login/verify", { code: "000000" }, "tpub_challenge=tpc_abc"),
    );
    expect(setCookie(expired, "tpub_challenge")).toMatch(/max-age=0/i);
  });

  it("refuses a missing code and a cross-origin request", async () => {
    const missing = await verifyRoute(
      post("/api/session/login/verify", {}, "tpub_challenge=tpc_abc"),
    );
    expect(missing.status).toBe(400);
    const cross = new NextRequest("http://localhost:3000/api/session/login/verify", {
      method: "POST",
      headers: { origin: "https://evil.test", host: "localhost:3000", cookie: "tpub_challenge=x" },
      body: JSON.stringify({ code: "123456" }),
    });
    expect((await verifyRoute(cross)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs the mandatory enrolment: setup then enable with recovery codes", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        secret: "JBSWY3DPEHPK3PXP",
        otpauthUri: "otpauth://totp/TPUB:admin?secret=JBSWY3DPEHPK3PXP",
        expiresAt,
      }),
    );
    const setup = await setupRoute(
      post("/api/session/enrolment/setup", undefined, "tpub_challenge=tpc_enrol"),
    );
    expect(urlOf(fetchMock.mock.calls[0]?.[0])).toBe("http://backend.test/api/auth/2fa/setup");
    expect(sentBody()).toEqual({ challengeToken: "tpc_enrol" });
    expect(((await setup.json()) as { secret: string }).secret).toBe("JBSWY3DPEHPK3PXP");

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { ...auth, recoveryCodes: ["abcde-fghjk", 3, "mnpqr-stvwx"] }),
    );
    const enable = await enableRoute(
      post("/api/session/enrolment/enable", { code: "123456" }, "tpub_challenge=tpc_enrol"),
    );
    expect(urlOf(fetchMock.mock.calls[1]?.[0])).toBe("http://backend.test/api/auth/2fa/enable");
    const body = (await enable.json()) as { recoveryCodes: string[]; status: string };
    expect(body.status).toBe("AUTHENTICATED");
    expect(body.recoveryCodes).toEqual(["abcde-fghjk", "mnpqr-stvwx"]);
    expect(setCookie(enable, "tpub_token")).toContain(token);
  });
});

describe("GET /api/session?actualiser=1", () => {
  it("rewrites the user cookie from GET /api/me", async () => {
    const user = serializeUserCookie({
      email: "admin@tpub.local",
      nom: "Admin",
      role: "ADMINISTRATEUR",
      userId: 1,
      exp: future,
      mustChangePassword: true,
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { nom: "Admin", mustChangePassword: false, twoFactorEnabled: true }),
    );
    const req = new NextRequest("http://localhost:3000/api/session?actualiser=1", {
      headers: { cookie: `tpub_token=${token}; tpub_user=${user}` },
    });
    const res = await sessionRoute(req);
    expect(urlOf(fetchMock.mock.calls[0]?.[0])).toBe("http://backend.test/api/me");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      `Bearer ${token}`,
    );
    const body = (await res.json()) as { user: { mustChangePassword: boolean } };
    expect(body.user.mustChangePassword).toBe(false);
    const cookie = setCookie(res, "tpub_user") ?? "";
    const value = decodeURIComponent(cookie.slice("tpub_user=".length, cookie.indexOf(";")));
    expect(parseUserCookie(value)?.twoFactorEnabled).toBe(true);
  });
});

describe("device key and signed media through the Next routes", () => {
  it("forwards the player device key header to the backend", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { type: "defaut" }));
    const key = `tpd_${"k".repeat(43)}`;
    const req = new NextRequest("http://localhost:3000/api/diffusion/next?supportId=3", {
      headers: { "x-tpub-device-key": key },
    });
    await proxyGet(req, { params: Promise.resolve({ path: ["diffusion", "next"] }) });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-tpub-device-key")).toBe(key);
  });

  it("forwards only exp and sig and passes a 403 through as an empty 403", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { code: "MEDIA_URL_EXPIRED", message: "Lien de média expiré" }),
    );
    const req = new NextRequest(
      "http://localhost:3000/uploads/campaigns/1/a.jpg?exp=100&sig=abc&x=1",
    );
    const res = await uploadsGet(req, {
      params: Promise.resolve({ path: ["campaigns", "1", "a.jpg"] }),
    });
    expect(urlOf(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://backend.test/uploads/campaigns/1/a.jpg?exp=100&sig=abc",
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("");
  });

  it("keeps the backend private cache policy on success", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=1200" },
      }),
    );
    const req = new NextRequest("http://localhost:3000/uploads/campaigns/1/a.jpg?exp=1&sig=s");
    const res = await uploadsGet(req, {
      params: Promise.resolve({ path: ["campaigns", "1", "a.jpg"] }),
    });
    expect(res.headers.get("cache-control")).toBe("private, max-age=1200");
  });
});
