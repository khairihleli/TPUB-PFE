import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiFetch,
  buildApiUrl,
  GET_RETRY_DELAY_MS,
  resetSessionExpiredGuard,
  SESSION_EXPIRED_EVENT,
} from "@/lib/api/client";
import { ApiError, ApiTransportError, presentError } from "@/lib/api/errors";

function respond(status: number, body?: unknown, contentType = "application/json") {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text || null, {
    status,
    headers: text ? { "content-type": contentType } : {},
  });
}

describe("buildApiUrl", () => {
  it("prefixes /api and appends the query", () => {
    expect(buildApiUrl("/campaigns/mine")).toBe("/api/campaigns/mine");
    expect(buildApiUrl("/api/zones")).toBe("/api/zones");
    expect(buildApiUrl("/admin/campaigns/1/reject", { reason: "Texte ambigu", x: undefined })).toBe(
      "/api/admin/campaigns/1/reject?reason=Texte+ambigu",
    );
  });
});

describe("apiFetch", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    resetSessionExpiredGuard();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, [{ id: 1 }]));
    await expect(apiFetch<{ id: number }[]>("/zones")).resolves.toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/zones");
    expect(init?.method).toBe("GET");
  });

  it("returns undefined for 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiFetch<void>("/campaigns/3", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("throws a French ApiError with field errors", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(400, {
        status: 400,
        message: "Validation failed",
        errors: { email: "must not be blank" },
      }),
    );
    const err = await apiFetch("/campaigns", { body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(
      "Certains champs sont invalides. Vérifiez le formulaire.",
    );
    expect((err as ApiError).fieldErrors).toEqual({ email: "Ce champ est requis." });
    expect((err as ApiError).rawMessage).toBe("Validation failed");
  });

  it("dispatches a single session-expired event on 401", async () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    fetchMock.mockResolvedValue(respond(401, { status: 401, message: "Session expirée" }));
    await apiFetch("/campaigns/mine").catch(() => undefined);
    await apiFetch("/zones").catch(() => undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it("does not dispatch session-expired for session routes (bad credentials)", async () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    fetchMock.mockResolvedValueOnce(
      respond(401, { status: 401, message: "Invalid email or password" }),
    );
    const err = await apiFetch("/api/session/login", { body: {} }).catch((e: unknown) => e);
    expect((err as ApiError).message).toBe("E-mail ou mot de passe incorrect.");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it("turns a network failure into a transport error (never « Failed to fetch »)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await apiFetch("/zones", { retry: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiTransportError);
    expect((err as Error).message).not.toMatch(/fetch/i);
    // Online browser: honest « unreachable », not « offline » (FLOW-12).
    expect(presentError(err).category).toBe("unreachable");
  });

  it("reports offline only when the browser is offline", async () => {
    const spy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await apiFetch("/zones", { retry: false }).catch((e: unknown) => e);
    expect(presentError(err).category).toBe("offline");
    spy.mockRestore();
  });

  it("maps a timeout to the slow category (no offline wording)", () => {
    const p = presentError(new ApiTransportError("timeout"));
    expect(p.category).toBe("slow");
    expect(p.title).toBe("Le service met trop de temps à répondre");
    expect(p.retryable).toBe(true);
  });

  it("retries an idempotent GET once after a transport error", async () => {
    vi.useFakeTimers();
    try {
      fetchMock
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(respond(200, [{ id: 2 }]));
      const promise = apiFetch<{ id: number }[]>("/zones");
      await vi.advanceTimersByTimeAsync(GET_RETRY_DELAY_MS);
      await expect(promise).resolves.toEqual([{ id: 2 }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never replays a mutation", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await apiFetch("/campaigns", { body: {} }).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a 2xx HTML body as unexpected", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, "<html></html>", "text/html"));
    const err = await apiFetch("/zones").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiTransportError);
    expect((err as ApiTransportError).kind).toBe("unexpected-response");
  });

  it("distinguishes 502 unreachable from 400 invalid", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(502, { status: 502, message: "Le service ZELQANE est momentanément indisponible." }),
    );
    const e502 = await apiFetch("/zones").catch((e: unknown) => e);
    expect(presentError(e502).category).toBe("unreachable");
    fetchMock.mockResolvedValueOnce(
      respond(400, { message: "Support already reserved for the selected period" }),
    );
    const e400 = await apiFetch("/reservations", { body: {} }).catch((e: unknown) => e);
    expect(presentError(e400).category).toBe("invalid");
  });
});
