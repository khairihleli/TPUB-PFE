import { describe, expect, it, vi } from "vitest";

import { reservation } from "@/components/espace/__tests__/fixtures";
import {
  CAMPAIGN_ZONE_LABEL,
  planZoneCoverage,
  RESERVATION_CONFLICT_MESSAGE,
  runBatchBooking,
  ZONE_LIMIT_MESSAGE,
} from "@/components/network/booking-plan";
import { studioCreativeOf } from "@/components/network/creative-preview-import";
import { ApiError } from "@/lib/api/errors";
import type { CampaignZoneResponse, ReservationBatchRequest } from "@/lib/api/types";

const TUNIS = { id: 6, latitude: 36.8, longitude: 10.18 };
const LAC = { id: 7, latitude: 36.835, longitude: 10.235 };

function zone(partial: Partial<CampaignZoneResponse> = {}): CampaignZoneResponse {
  return {
    id: 1,
    zoneId: 1,
    zoneName: "Tunis Centre",
    label: "Centre",
    latitude: 36.8,
    longitude: 10.18,
    radiusKm: 1,
    supportsInside: 1,
    ...partial,
  };
}

const REQUEST = {
  campaignId: 5,
  zoneId: 1,
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  startTime: "07:00:00",
  endTime: "12:00:00",
};

describe("planZoneCoverage", () => {
  it("keeps the zones when every Porteur is already covered", () => {
    expect(planZoneCoverage([zone()], [TUNIS])).toEqual({ zones: null, uncovered: [] });
  });

  it("keeps existing circles and adds one around the uncovered Porteurs", () => {
    const plan = planZoneCoverage([zone()], [TUNIS, LAC]);
    expect(plan.uncovered).toEqual([7]);
    expect(plan.zones).toHaveLength(2);
    expect(plan.zones?.[0]).toEqual({
      latitude: 36.8,
      longitude: 10.18,
      radiusKm: 1,
      label: "Centre",
    });
    expect(plan.zones?.[1]).toMatchObject({
      latitude: 36.835,
      longitude: 10.235,
      radiusKm: 0.5,
      label: CAMPAIGN_ZONE_LABEL,
    });
  });

  it("refuses a sixth circle", () => {
    const five = [1, 2, 3, 4, 5].map((id) => zone({ id, latitude: 30 + id }));
    expect(() => planZoneCoverage(five, [TUNIS])).toThrow(ZONE_LIMIT_MESSAGE);
  });
});

describe("runBatchBooking", () => {
  const deps = () => ({
    zones: vi.fn().mockResolvedValue([]),
    setZones: vi.fn().mockResolvedValue({}),
    createBatch: vi.fn((body: ReservationBatchRequest) =>
      Promise.resolve(
        body.supportIds.map((supportId, i) =>
          reservation({ id: 100 + i, campaignId: body.campaignId, supportId }),
        ),
      ),
    ),
  });

  it("saves a covering zone, then books every Porteur in one batch", async () => {
    const d = deps();
    const outcomes = await runBatchBooking(
      [
        { ...REQUEST, supportId: 6 },
        { ...REQUEST, supportId: 7 },
      ],
      [TUNIS, LAC],
      d,
    );
    expect(d.setZones).toHaveBeenCalledWith(5, [
      expect.objectContaining({ label: CAMPAIGN_ZONE_LABEL }),
    ]);
    expect(d.createBatch).toHaveBeenCalledTimes(1);
    expect(d.createBatch).toHaveBeenCalledWith({
      campaignId: 5,
      supportIds: [6, 7],
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      startTime: "07:00:00",
      endTime: "12:00:00",
    });
    expect([...outcomes.values()].every((o) => o.status === "reserved")).toBe(true);
  });

  it("marks BATCH_CONFLICT Porteurs and books the others in a second batch", async () => {
    const d = deps();
    d.createBatch.mockRejectedValueOnce(
      new ApiError(409, "Conflit", {
        code: "BATCH_CONFLICT",
        rawFieldErrors: { "7": "SUPPORT_ALREADY_RESERVED" },
      }),
    );
    d.zones.mockResolvedValue([zone({ radiusKm: 10 })]);
    const outcomes = await runBatchBooking(
      [
        { ...REQUEST, supportId: 6 },
        { ...REQUEST, supportId: 7 },
      ],
      [TUNIS, LAC],
      d,
    );
    expect(d.setZones).not.toHaveBeenCalled();
    expect(d.createBatch).toHaveBeenCalledTimes(2);
    expect(d.createBatch.mock.calls[1]?.[0].supportIds).toEqual([6]);
    expect(outcomes.get(6)?.status).toBe("reserved");
    expect(outcomes.get(7)).toMatchObject({ status: "conflict" });
  });

  it("maps a non-batch failure to every Porteur", async () => {
    const d = deps();
    d.createBatch.mockRejectedValue(new ApiError(409, "x", { code: "SUPPORT_ALREADY_RESERVED" }));
    const outcomes = await runBatchBooking([{ ...REQUEST, supportId: 6 }], [TUNIS], d);
    expect(outcomes.get(6)).toEqual({ status: "conflict", message: RESERVATION_CONFLICT_MESSAGE });
  });

  it("stops before booking when the zone limit is reached", async () => {
    const d = deps();
    d.zones.mockResolvedValue([1, 2, 3, 4, 5].map((id) => zone({ id, latitude: 30 + id })));
    const outcomes = await runBatchBooking([{ ...REQUEST, supportId: 6 }], [TUNIS], d);
    expect(d.createBatch).not.toHaveBeenCalled();
    expect(outcomes.get(6)).toMatchObject({ status: "error", message: ZONE_LIMIT_MESSAGE });
  });

  it("does nothing without requests", async () => {
    const d = deps();
    expect((await runBatchBooking([], [], d)).size).toBe(0);
    expect(d.zones).not.toHaveBeenCalled();
  });
});

describe("studioCreativeOf", () => {
  const local = { url: "blob:1", kind: "image" as const, name: "essai.png", size: 2048 };

  it("prefers the campaign's uploaded media over a local preview", () => {
    expect(
      studioCreativeOf(
        { id: 5, name: "Rentrée", mediaUrl: "/uploads/campaigns/5/a.mp4", mediaType: "VIDEO" },
        local,
      ),
    ).toEqual({
      creative: {
        url: "/uploads/campaigns/5/a.mp4",
        kind: "video",
        name: "Visuel de « Rentrée »",
        size: null,
      },
      source: "campaign",
      campaignId: 5,
    });
  });

  it("falls back to the local preview, then to nothing", () => {
    expect(studioCreativeOf({ id: 5, name: "R", mediaUrl: null, mediaType: null }, local)).toEqual({
      creative: local,
      source: "explorer",
      campaignId: 5,
    });
    expect(studioCreativeOf(null, null)).toEqual({
      creative: null,
      source: null,
      campaignId: null,
    });
  });
});
