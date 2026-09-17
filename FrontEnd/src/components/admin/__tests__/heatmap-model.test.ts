import { describe, expect, it } from "vitest";

import {
  defaultRange,
  demandHeatmap,
  diffusionHeatmap,
  emptyMessage,
  hoursLabel,
  percentLabel,
  rangeError,
  topDiffusions,
  topReservations,
  zonesByDemand,
} from "@/components/admin/heatmap-model";
import type {
  DemandHeatmapResponse,
  DiffusionHeatProps,
  HeatmapResponse,
} from "@/lib/api/types-carte";

const diffusions: HeatmapResponse<DiffusionHeatProps> = {
  from: "2026-09-01",
  to: "2026-09-30",
  maxWeight: 40,
  totalWeight: 55,
  points: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [10.18, 36.8] },
        properties: {
          supportId: 1,
          supportName: "Bourguiba",
          zoneId: 1,
          zoneName: "Tunis Centre",
          weight: 15,
          clicks: 3,
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [10.33, 36.88] },
        properties: {
          supportId: 2,
          supportName: "Marsa Plage",
          zoneId: 2,
          zoneName: "La Marsa",
          weight: 40,
          clicks: 9,
        },
      },
    ],
  },
};

const demand: DemandHeatmapResponse = {
  from: "2026-10-01",
  to: "2026-10-30",
  maxReservationWeight: 18,
  reservations: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [10.18, 36.8] },
        properties: {
          supportId: 1,
          supportName: "Bourguiba",
          zoneId: 1,
          zoneName: "Tunis Centre",
          weight: 18,
          occupancy: 0.0563,
        },
      },
    ],
  },
  targets: { type: "FeatureCollection", features: [] },
  byZone: [
    {
      zoneId: 1,
      zoneName: "Tunis Centre",
      reservedHours: 18,
      capacityHours: 320,
      occupancy: 0.0563,
      targets: 1,
    },
    {
      zoneId: 2,
      zoneName: "La Marsa",
      reservedHours: 40,
      capacityHours: 80,
      occupancy: 0.5,
      targets: 0,
    },
  ],
};

describe("heatmap model", () => {
  it("defaults the period per tab", () => {
    expect(defaultRange("diffusions", "2026-09-30")).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(defaultRange("demande", "2026-10-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-30",
    });
  });

  it("mirrors the backend range rules", () => {
    expect(rangeError("2026-09-01", "2026-09-30")).toBeNull();
    expect(rangeError("2026-09-30", "2026-09-01")).toBe(
      "La date de fin doit être postérieure ou égale à la date de début.",
    );
    expect(rangeError("2026-01-01", "2027-06-01")).toBe(
      "La période ne peut pas dépasser 366 jours.",
    );
    expect(rangeError("", "2026-09-01")).toBeNull();
  });

  it("builds the map layers with their French labels", () => {
    expect(diffusionHeatmap(diffusions)).toMatchObject({
      maxWeight: 40,
      label: "Diffusions par Porteur",
    });
    expect(demandHeatmap(demand)).toMatchObject({
      maxWeight: 18,
      label: "Heures réservées par Porteur",
    });
    expect(diffusionHeatmap(null)).toBeNull();
    expect(demandHeatmap(undefined)).toBeNull();
  });

  it("ranks the side table by weight", () => {
    expect(topDiffusions(diffusions).map((r) => [r.supportName, r.weight, r.detail])).toEqual([
      ["Marsa Plage", 40, 9],
      ["Bourguiba", 15, 3],
    ]);
    expect(topReservations(demand)[0]).toMatchObject({ supportId: 1, weight: 18, detail: 0.0563 });
    expect(topDiffusions(null)).toEqual([]);
  });

  it("sorts zones by occupancy and formats the figures", () => {
    expect(zonesByDemand(demand).map((z) => z.zoneName)).toEqual(["La Marsa", "Tunis Centre"]);
    expect(percentLabel(0.6412)).toBe("64 %");
    expect(hoursLabel(18.04)).toBe("18 h");
    expect(emptyMessage("diffusions")).toBe("Aucune diffusion sur la période.");
    expect(emptyMessage("demande")).toBe("Aucune réservation sur la période.");
  });
});
