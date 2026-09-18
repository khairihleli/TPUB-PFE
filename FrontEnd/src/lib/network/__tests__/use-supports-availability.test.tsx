import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const availability = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/endpoints", () => ({ supportsApi: { availability } }));

import {
  runWithConcurrency,
  useSupportsAvailability,
} from "@/lib/network/use-supports-availability";
import { clearResourceCache } from "@/lib/resource-cache";

beforeEach(() => {
  clearResourceCache();
  availability.mockReset();
});

describe("useSupportsAvailability", () => {
  it("reports free / busy / error per Porteur with bounded concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    availability.mockImplementation(async (id: number) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (id === 3) throw new Error("boom");
      return id === 2
        ? [
            {
              startDate: "2027-09-14",
              endDate: "2027-09-20",
              startTime: "08:00:00",
              endTime: "22:00:00",
              reservationStatus: "TEMPORAIRE",
            },
          ]
        : [];
    });
    const ids = [1, 2, 3, 4, 5, 6];
    const { result } = renderHook(() =>
      useSupportsAvailability(ids, "2027-09-10", "2027-09-30", { concurrency: 2 }),
    );
    expect(result.current.get(1)?.state).toBe("loading");
    await waitFor(() => expect(result.current.get(6)?.state).toBe("free"));
    expect(result.current.get(2)?.state).toBe("busy");
    expect(result.current.get(2)?.slots).toHaveLength(1);
    expect(result.current.get(3)?.state).toBe("error");
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(availability).toHaveBeenCalledWith(
      2,
      { from: "2027-09-10", to: "2027-09-30" },
      expect.anything(),
    );
  });

  it("does not fetch without a period", () => {
    renderHook(() => useSupportsAvailability([1], null, null));
    expect(availability).not.toHaveBeenCalled();
  });

  it("runWithConcurrency visits every item once", async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 3, (n) => {
      seen.push(n);
      return Promise.resolve();
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
