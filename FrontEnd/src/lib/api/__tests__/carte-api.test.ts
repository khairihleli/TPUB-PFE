import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetSessionExpiredGuard } from "@/lib/api/client";
import {
  campaignZonesApi,
  emergencyCarteApi,
  estimatesCarteApi,
  heatmapApi,
  pricingApi,
} from "@/lib/api/endpoints-carte";

const fetchMock = vi.fn<typeof fetch>();

function respond(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  const input = call?.[0];
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  return { url, init: call?.[1] ?? {} };
}

function bodyOf(init: RequestInit): string {
  return typeof init.body === "string" ? init.body : "";
}

beforeEach(() => {
  resetSessionExpiredGuard();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(() => Promise.resolve(respond({})));
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("lane L3 endpoints (docs/round2-contract.md §4)", () => {
  it("replaces the campaign zones with circles and polygons", async () => {
    await campaignZonesApi.set(7, {
      zones: [
        { type: "CERCLE", latitude: 36.8, longitude: 10.18, radiusKm: 2, label: null },
        {
          type: "POLYGONE",
          polygon: {
            type: "Polygon",
            coordinates: [
              [
                [10.17, 36.79],
                [10.19, 36.79],
                [10.19, 36.81],
                [10.17, 36.79],
              ],
            ],
          },
        },
      ],
    });
    const { url, init } = lastCall();
    expect(url).toContain("/api/campaigns/7/zones");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(bodyOf(init)) as { zones: { type: string }[] };
    expect(body.zones.map((z) => z.type)).toEqual(["CERCLE", "POLYGONE"]);
  });

  it("queries the heatmaps with their filters", async () => {
    await heatmapApi.diffusions({
      from: "2026-09-01",
      to: "2026-09-30",
      contentType: ["PUBLICITE", "URGENCE"],
      zoneId: 3,
    });
    expect(lastCall().url).toContain(
      "/api/heatmap/diffusions?from=2026-09-01&to=2026-09-30&contentType=PUBLICITE%2CURGENCE&zoneId=3",
    );
    await heatmapApi.demand({});
    expect(lastCall().url).toContain("/api/heatmap/demand");
    await heatmapApi.demandPublic({
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      startTime: "18:00:00",
      endTime: "23:00:00",
    });
    expect(lastCall().url).toContain("/api/heatmap/demand/public?startDate=2026-10-01");
    expect(lastCall().url).toContain("startTime=18%3A00%3A00");
  });

  it("reads the pricing configuration and the estimates", async () => {
    await pricingApi.config();
    expect(lastCall().url).toContain("/api/pricing/config");
    await estimatesCarteApi.compute({
      supportIds: [1, 2],
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      startTime: "18:00:00",
      endTime: "22:00:00",
      campaignId: 7,
    });
    expect(lastCall().init.method).toBe("POST");
    expect(JSON.parse(bodyOf(lastCall().init))).toMatchObject({ campaignId: 7 });
    await estimatesCarteApi.campaign(7);
    expect(lastCall().url).toContain("/api/estimates/campaign/7");
  });

  it("posts a polygon-targeted emergency", async () => {
    await emergencyCarteApi.create({
      title: "Alerte",
      content: "Contenu",
      startDate: "2026-10-01",
      endDate: "2026-10-01",
      polygon: {
        type: "Polygon",
        coordinates: [
          [
            [10.17, 36.79],
            [10.19, 36.79],
            [10.19, 36.81],
            [10.17, 36.79],
          ],
        ],
      },
    });
    const { url, init } = lastCall();
    expect(url).toContain("/api/emergency");
    expect(JSON.parse(bodyOf(init))).toMatchObject({ polygon: { type: "Polygon" } });
  });
});
