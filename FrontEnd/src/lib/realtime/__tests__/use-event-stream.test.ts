import { describe, expect, it } from "vitest";

import { ERROR_WINDOW_MS, MAX_ERRORS, shouldFallback } from "@/lib/realtime/use-event-stream";

describe("event stream fallback rule", () => {
  const now = 1_000_000;

  it("keeps trying while the failures stay below the threshold", () => {
    expect(shouldFallback([], now)).toBe(false);
    expect(shouldFallback([now - 1000, now - 500], now)).toBe(false);
  });

  it("switches to polling after three failures inside the window", () => {
    expect(shouldFallback([now - 2000, now - 1000, now], now)).toBe(true);
    expect(shouldFallback(Array.from({ length: MAX_ERRORS }, () => now), now)).toBe(true);
  });

  it("forgets the failures older than the window", () => {
    const old = now - ERROR_WINDOW_MS - 1;
    expect(shouldFallback([old, old, now], now)).toBe(false);
  });
});
