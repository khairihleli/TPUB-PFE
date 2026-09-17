import { describe, expect, it } from "vitest";

import { backoffMs, MAX_BACKOFF_MS } from "@/components/player/use-heartbeat";

describe("heartbeat backoff", () => {
  it("keeps the normal cadence while everything works", () => {
    expect(backoffMs(0)).toBe(30_000);
  });

  it("doubles after each failure and stops at five minutes", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(2)).toBe(120_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(4)).toBe(MAX_BACKOFF_MS);
    expect(backoffMs(20)).toBe(MAX_BACKOFF_MS);
  });
});
