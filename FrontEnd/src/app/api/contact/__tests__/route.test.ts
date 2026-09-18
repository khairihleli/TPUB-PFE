// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  appendFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("node:fs/promises", () => ({ ...fsMocks, default: fsMocks }));

import { RATE_LIMIT_MAX, resetRateLimit } from "@/app/api/contact/contact-store";
import { POST } from "@/app/api/contact/route";

const valid = {
  nom: "Karim Trabelsi",
  email: "karim@exemple.tn",
  telephone: "",
  societe: "Boulangerie Exemple",
  profil: "commerce",
  besoin: "campagne",
  zones: "La Marsa",
  periode: "",
  message: "Je souhaite être visible dans mon quartier le matin.",
  consentement: true,
};

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    resetRateLimit();
    fsMocks.appendFile.mockClear();
    fsMocks.mkdir.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    delete process.env.CONTACT_WEBHOOK_URL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("stores a valid request as one ndjson line when no webhook is configured", async () => {
    const res = await POST(request(valid));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(fsMocks.appendFile).toHaveBeenCalledTimes(1);
    const [file, line] = fsMocks.appendFile.mock.calls[0] as unknown as [string, string];
    expect(file).toMatch(/\.data[\\/]contact-requests\.ndjson$/);
    expect(line.endsWith("\n")).toBe(true);
    const record = JSON.parse(line) as Record<string, unknown>;
    expect(record).toMatchObject({ id: body.id, email: "karim@exemple.tn", profil: "commerce" });
  });

  it("forwards to CONTACT_WEBHOOK_URL when set", async () => {
    process.env.CONTACT_WEBHOOK_URL = "https://hooks.example.test/zelqane";
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(request(valid));
    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fsMocks.appendFile).not.toHaveBeenCalled();
  });

  it("answers 502 with the brief's error copy when the webhook fails", async () => {
    process.env.CONTACT_WEBHOOK_URL = "https://hooks.example.test/zelqane";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 500 }))),
    );
    const res = await POST(request(valid));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/L'envoi n'a pas abouti/);
  });

  it("returns French field errors on invalid input", async () => {
    const res = await POST(request({ ...valid, email: "faux", consentement: false }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: Record<string, string> };
    expect(body.errors.email).toBe("Adresse e-mail invalide.");
    expect(body.errors.consentement).toBeTruthy();
    expect(fsMocks.appendFile).not.toHaveBeenCalled();
  });

  it("silently drops honeypot submissions", async () => {
    const res = await POST(request({ ...valid, site_web: "http://spam.test" }));
    expect(res.status).toBe(201);
    expect(fsMocks.appendFile).not.toHaveBeenCalled();
  });

  it("rejects bodies over 20 KB, non-JSON and cross-origin requests", async () => {
    const big = await POST(request({ ...valid, message: "a".repeat(21 * 1024) }));
    expect(big.status).toBe(413);
    const declared = await POST(request(valid, { "content-length": String(64 * 1024) }));
    expect(declared.status).toBe(413);
    const notJson = await POST(request("nom=x", { "content-type": "text/plain" }));
    expect(notJson.status).toBe(415);
    const broken = await POST(request("{nope"));
    expect(broken.status).toBe(400);
    const cross = await POST(request(valid, { origin: "https://evil.example" }));
    expect(cross.status).toBe(403);
  });

  it("rate-limits repeated submissions from the same client", async () => {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      const ok = await POST(request(valid, headers));
      expect(ok.status).toBe(201);
    }
    const limited = await POST(request(valid, headers));
    expect(limited.status).toBe(429);
  });
});
