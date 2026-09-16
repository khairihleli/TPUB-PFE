import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearResourceCache,
  fetchCached,
  getCached,
  invalidate,
  isFresh,
  primeCache,
} from "@/lib/resource-cache";
import { useResource } from "@/lib/use-resource";

beforeEach(() => {
  clearResourceCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resource-cache", () => {
  it("deduplicates concurrent fetches and serves fresh data for 30 s", async () => {
    const fetcher = vi.fn(() => Promise.resolve([1, 2]));
    const [a, b] = await Promise.all([fetchCached("k", fetcher), fetchCached("k", fetcher)]);
    expect(a).toEqual([1, 2]);
    expect(b).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await fetchCached("k", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(isFresh("k")).toBe(true);
    expect(isFresh("k", 30_000, Date.now() + 31_000)).toBe(false);
    await fetchCached("k", fetcher, { force: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("never caches errors and invalidates by prefix", async () => {
    await expect(fetchCached("x", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(getCached("x")).toBeUndefined();
    primeCache("campaigns:mine", [1]);
    primeCache("campaigns:all", [2]);
    primeCache("zones:all", [3]);
    invalidate("campaigns:");
    expect(getCached("campaigns:mine")).toBeUndefined();
    expect(getCached("zones:all")?.data).toEqual([3]);
  });

  it("an aborted consumer does not cancel the shared request", async () => {
    let resolve!: (v: string) => void;
    const fetcher = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const controller = new AbortController();
    const first = fetchCached("s", fetcher, { signal: controller.signal });
    const second = fetchCached("s", fetcher);
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    resolve("ok");
    await expect(second).resolves.toBe("ok");
  });
});

describe("useResource freshness", () => {
  it("hits the shared cache across two consumers within 30 s", async () => {
    const fetcher = vi.fn(() => Promise.resolve("données"));
    function Consumer({ id }: { id: string }) {
      const { data } = useResource("a", fetcher, { cacheKey: "shared" });
      return <p data-testid={id}>{data ?? "…"}</p>;
    }
    const { rerender } = render(<Consumer id="one" />);
    expect(await screen.findByText("données")).toBeInTheDocument();
    rerender(
      <>
        <Consumer id="one" />
        <Consumer id="two" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("two")).toHaveTextContent("données"));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("revalidates on visibilitychange, throttled, and records lastUpdatedAt", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetcher = vi.fn(() => Promise.resolve("v"));
    const { result } = renderHook(() => useResource("vis", fetcher, { focusThrottleMs: 30_000 }));
    await waitFor(() => expect(result.current.data).toBe("v"));
    expect(result.current.lastUpdatedAt).toBeInstanceOf(Date);
    expect(fetcher).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(fetcher).toHaveBeenCalledTimes(1); // throttled

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.loading).toBe(false);
  });

  it("polls while enabled and stops when pollInterval becomes null", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetcher = vi.fn(() => Promise.resolve("p"));
    const initialProps: { poll: number | null } = { poll: 10_000 };
    const { result, rerender } = renderHook(
      ({ poll }: { poll: number | null }) =>
        useResource("poll", fetcher, { pollInterval: poll, revalidateOnFocus: false }),
      { initialProps },
    );
    await waitFor(() => expect(result.current.data).toBe("p"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_050);
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    rerender({ poll: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("flags a slow first load", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetcher = vi.fn(() => new Promise<string>(() => undefined));
    const { result } = renderHook(() => useResource("slow", fetcher, { slowAfterMs: 8000 }));
    expect(result.current.slow).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8100);
    });
    expect(result.current.slow).toBe(true);
    expect(result.current.loading).toBe(true);
  });
});
