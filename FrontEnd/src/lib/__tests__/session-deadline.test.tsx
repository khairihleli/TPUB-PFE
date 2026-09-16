import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/endpoints", () => ({ sessionApi: { get: vi.fn() } }));

import { SESSION_EXPIRED_EVENT } from "@/lib/api/client";
import { msUntilNextPhase, sessionPhase, useSessionDeadline } from "@/lib/session-deadline";

afterEach(() => {
  vi.useRealTimers();
});

describe("session deadline", () => {
  const now = Date.parse("2026-09-12T12:00:00Z");
  const exp = (minutes: number) => Math.floor((now + minutes * 60_000) / 1000);

  it("computes phases at T−10 min and T−2 min", () => {
    expect(sessionPhase(exp(30), now)).toBe("ok");
    expect(sessionPhase(exp(10), now)).toBe("warning");
    expect(sessionPhase(exp(2), now)).toBe("critical");
    expect(sessionPhase(exp(0), now)).toBe("expired");
    expect(msUntilNextPhase(exp(30), now)).toBe(20 * 60_000);
    expect(msUntilNextPhase(exp(-1), now)).toBeNull();
  });

  it("moves through phases with timers and dispatches the expired event at T", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);
    const { result } = renderHook(() => useSessionDeadline(exp(11)));
    expect(result.current.phase).toBe("ok");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_100);
    });
    expect(result.current.phase).toBe("warning");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * 60_000);
    });
    expect(result.current.phase).toBe("critical");
    expect(listener).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(result.current.phase).toBe("expired");
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });
});
