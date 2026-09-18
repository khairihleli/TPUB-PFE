import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch, resetPasswordChangeGuard } from "@/lib/api/client";
import { useSignedMediaSrc } from "@/lib/use-signed-media";

const future = () => Math.floor(Date.now() / 1000) + 3600;
const signed = (name: string, exp = future()) => `/uploads/campaigns/4/${name}?exp=${exp}&sig=s`;

describe("useSignedMediaSrc (§3.5)", () => {
  it("refreshes an expired link once, then gives up", async () => {
    const first = signed("a.jpg");
    const fresh = signed("a.jpg") + "2";
    const refresh = vi.fn().mockResolvedValue(fresh);
    const { result } = renderHook(() => useSignedMediaSrc(first, refresh));
    expect(result.current.src).toBe(first);

    act(() => result.current.onError());
    await waitFor(() => expect(result.current.src).toBe(fresh));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(false);

    act(() => result.current.onError());
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.src).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("fails immediately for an unsigned URL and when the file is gone", async () => {
    const refresh = vi.fn().mockResolvedValue(null);
    const unsigned = renderHook(() => useSignedMediaSrc("blob:http://localhost/x", refresh));
    act(() => unsigned.result.current.onError());
    await waitFor(() => expect(unsigned.result.current.failed).toBe(true));
    expect(refresh).not.toHaveBeenCalled();

    const gone = renderHook(() => useSignedMediaSrc(signed("b.jpg"), refresh));
    act(() => gone.result.current.onError());
    await waitFor(() => expect(gone.result.current.failed).toBe(true));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("replaces a link that already expired before the browser requests it", async () => {
    const expired = signed("c.jpg", Math.floor(Date.now() / 1000) - 10);
    const fresh = signed("c.jpg");
    const refresh = vi.fn().mockResolvedValue(fresh);
    const { result } = renderHook(() => useSignedMediaSrc(expired, refresh));
    await waitFor(() => expect(result.current.src).toBe(fresh));
  });
});

describe("apiFetch — PASSWORD_CHANGE_REQUIRED (§3.2)", () => {
  const assign = vi.fn();
  const original = window.location;

  beforeEach(() => {
    resetPasswordChangeGuard();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, pathname: "/admin", assign },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
    vi.unstubAllGlobals();
    assign.mockReset();
  });

  it("redirects once to the forced password change screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              status: 403,
              code: "PASSWORD_CHANGE_REQUIRED",
              message: "Vous devez définir un nouveau mot de passe avant de continuer.",
            }),
            { status: 403, headers: { "content-type": "application/json" } },
          ),
        ),
      ),
    );
    await expect(apiFetch("/campaigns", { retry: false })).rejects.toMatchObject({
      status: 403,
      code: "PASSWORD_CHANGE_REQUIRED",
    });
    await expect(apiFetch("/campaigns", { retry: false })).rejects.toBeDefined();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/mot-de-passe-requis");
  });

  it("sends extra headers (player device key) and exposes Retry-After", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 429, code: "DEVICE_RATE_LIMITED", message: "x" }), {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "12" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      apiFetch("/diffusion/next", { retry: false, headers: { "x-zelqane-device-key": "tpd_k" } }),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 12 });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("x-zelqane-device-key")).toBe("tpd_k");
  });
});
