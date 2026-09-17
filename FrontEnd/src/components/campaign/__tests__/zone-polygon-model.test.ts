/**
 * Round-2 zone model (docs/round2-contract.md §4.3): circles and polygons in the wizard.
 */
import { describe, expect, it } from "vitest";

import {
  breakdownExplanations,
  isPolygonZone,
  multiplierLabel,
  sameZones,
  supportsInsideZone,
  toZonesRequest,
  totalBaseCost,
  zoneAreaKm2,
  zoneAreaLabel,
  zoneDraft,
  zoneError,
  zonesAsMapPolygons,
  zonesAsMapZones,
  zonesFromResponse,
  type DraftZone,
} from "@/components/campaign/zone-model";
import { zoneFieldErrors } from "@/components/campaign/step-zones";
import type { CampaignZoneResponseCarte, PriceBreakdown } from "@/lib/api/types-carte";

const SQUARE = {
  type: "Polygon" as const,
  coordinates: [
    [
      [10.17, 36.79],
      [10.19, 36.79],
      [10.19, 36.81],
      [10.17, 36.81],
      [10.17, 36.79],
    ] as [number, number][],
  ],
};

const RESPONSE: CampaignZoneResponseCarte[] = [
  {
    id: 4,
    zoneId: 1,
    zoneName: "Tunis Centre",
    label: "Centre",
    type: "POLYGONE",
    latitude: 36.8,
    longitude: 10.18,
    radiusKm: 1.425,
    polygon: SQUARE,
    areaKm2: 3.96,
    supportsInside: 2,
  },
  {
    id: 5,
    zoneId: 2,
    zoneName: "La Marsa",
    label: null,
    type: "CERCLE",
    latitude: 36.88,
    longitude: 10.32,
    radiusKm: 2,
    polygon: null,
    areaKm2: 12.566,
    supportsInside: 1,
  },
];

describe("zones: circles and polygons", () => {
  it("reads polygons and circles back from the API", () => {
    const zones = zonesFromResponse(RESPONSE);
    expect(zones).toHaveLength(2);
    const polygon = zones[0]!;
    expect(isPolygonZone(polygon)).toBe(true);
    if (!isPolygonZone(polygon)) return;
    // the closing point is dropped
    expect(polygon.vertices).toHaveLength(4);
    expect(zoneDraft(polygon)).toEqual({ vertices: polygon.vertices, closed: true });
    expect(zoneAreaKm2(polygon)).toBe(3.96);
    expect(zoneAreaLabel(polygon)).toBe("4 km²");
    expect(zoneAreaLabel(zones[1]!)).toBe("12,6 km²");
    expect(zonesFromResponse(undefined)).toEqual([]);
  });

  it("builds the PUT body with both shapes", () => {
    const body = toZonesRequest(zonesFromResponse(RESPONSE));
    expect(body[0]).toMatchObject({ type: "POLYGONE", label: "Centre" });
    expect(body[0]).toHaveProperty("polygon.type", "Polygon");
    expect(body[1]).toEqual({
      type: "CERCLE",
      latitude: 36.88,
      longitude: 10.32,
      radiusKm: 2,
      label: null,
    });
  });

  it("detects changes of shape, geometry and label", () => {
    const zones = zonesFromResponse(RESPONSE);
    expect(sameZones(zones, zonesFromResponse(RESPONSE))).toBe(true);
    const moved = zonesFromResponse(RESPONSE);
    const first = moved[0]!;
    if (isPolygonZone(first)) {
      moved[0] = { ...first, vertices: [...first.vertices.slice(1), { lng: 10.2, lat: 36.82 }] };
    }
    expect(sameZones(zones, moved)).toBe(false);
    expect(sameZones(zones, [zones[1]!, zones[0]!])).toBe(false);
    expect(sameZones(zones, zones.slice(1))).toBe(false);
  });

  it("validates a polygon like the backend", () => {
    const empty: DraftZone = { type: "POLYGONE", key: "p", vertices: [], label: null };
    expect(zoneError(empty)).toBe("Un polygone doit avoir au moins 3 sommets.");
    const bowTie: DraftZone = {
      type: "POLYGONE",
      key: "p",
      label: null,
      vertices: [
        { lng: 10.17, lat: 36.79 },
        { lng: 10.19, lat: 36.81 },
        { lng: 10.19, lat: 36.79 },
        { lng: 10.17, lat: 36.81 },
      ],
    };
    expect(zoneError(bowTie)).toBe("Le tracé du polygone se croise.");
    expect(zoneError(zonesFromResponse(RESPONSE)[0]!)).toBeNull();
    expect(zoneError(zonesFromResponse(RESPONSE)[1]!)).toBeNull();
    expect(zoneAreaLabel(empty)).toBeNull();
  });

  it("counts the Porteurs inside each shape", () => {
    const zones = zonesFromResponse(RESPONSE);
    const supports = [
      { id: 1, latitude: 36.8, longitude: 10.18 },
      { id: 2, latitude: 36.88, longitude: 10.321 },
      { id: 3, latitude: 35.0, longitude: 9.0 },
    ];
    expect(supportsInsideZone(zones[0]!, supports).map((s) => s.id)).toEqual([1]);
    expect(supportsInsideZone(zones[1]!, supports).map((s) => s.id)).toEqual([2]);
  });

  it("splits the map layers: circles as zones, polygons as polygons", () => {
    const zones = zonesFromResponse(RESPONSE);
    expect(zonesAsMapZones(zones)).toHaveLength(1);
    expect(zonesAsMapZones(zones)[0]).toMatchObject({ id: -2, radiusKm: 2 });
    const polygons = zonesAsMapPolygons(zones, { activeKey: zones[0]!.key });
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toMatchObject({ label: "Centre", active: true, tone: "brand" });
    expect(zonesAsMapPolygons(zones, { editingKey: zones[0]!.key })).toEqual([]);
  });

  it("maps server field errors of PUT /zones to their zone", () => {
    const errors = zoneFieldErrors({
      "zones[1].polygon": "Le tracé du polygone se croise.",
      "zones[0].radiusKm": "Rayon obligatoire pour un cercle (0,1 à 50 km).",
      autre: "ignoré",
    });
    expect(errors.get(1)).toBe("Le tracé du polygone se croise.");
    expect(errors.get(0)).toContain("Rayon obligatoire");
    expect(errors.size).toBe(2);
  });
});

describe("dynamic price helpers", () => {
  const pricing: PriceBreakdown = {
    baseCost: 19.2,
    multiplier: 1.18,
    finalCost: 22.66,
    clamped: false,
    enabled: true,
    factors: { hour: 1.25, dayOfWeek: 1, demand: 1.06, scarcity: 1.1 },
    details: {
      supportOccupancy: 0,
      zoneOccupancy: 0.5,
      zoneAvailability: 0.5,
      hourBands: [{ label: "Pointe du soir", minutes: 240, multiplier: 1.25 }],
      days: [{ dayOfWeek: "JEUDI", count: 1, multiplier: 1 }],
    },
    explanations: ["Créneau en pointe du soir : ×1,25"],
  };

  it("labels a multiplier only when it changes the price", () => {
    expect(multiplierLabel(1.18)).toBe("×1,18");
    expect(multiplierLabel(1)).toBeNull();
    expect(multiplierLabel(1.004)).toBeNull();
    expect(multiplierLabel(null)).toBeNull();
  });

  it("totals the base costs and falls back to the final cost", () => {
    expect(totalBaseCost([{ baseCost: 19.2, estimatedCost: 22.66 }, { estimatedCost: 5 }])).toBe(
      24.2,
    );
  });

  it("keeps the backend explanations", () => {
    expect(breakdownExplanations(pricing)).toEqual(["Créneau en pointe du soir : ×1,25"]);
    expect(breakdownExplanations({ ...pricing, enabled: false, explanations: [] })).toEqual([
      "Tarification dynamique désactivée : tarif de base appliqué.",
    ]);
    expect(breakdownExplanations(null)).toEqual([]);
  });
});
