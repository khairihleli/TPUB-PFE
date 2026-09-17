import { describe, expect, it } from "vitest";

import {
  checkMediaFile,
  describeMedia,
  formatDuration,
  normalizeDuration,
  previewKind,
  screenFormatOf,
} from "@/components/campaign/media-model";
import {
  alternativeLabel,
  batchConflictMessages,
  campaignWindow,
  circleFromRecommendation,
  circleIndexOfMapId,
  circleMapId,
  circleName,
  circlesAsMapZones,
  circlesFromZones,
  coveringCircle,
  filterByAvailability,
  filterByType,
  isSelectable,
  presentTypes,
  sameCircles,
  selectionTotals,
  snapRadius,
  sortAvailability,
  statusCounts,
  summaryParts,
  toZoneRequests,
} from "@/components/campaign/zone-model";
import type { SupportAvailabilityItem, SupportResponse } from "@/lib/api/types";
import { MEDIA_TYPE_LABEL } from "@/lib/campaign-status";
import { distanceKm } from "@/lib/geo";

function support(id: number, partial: Partial<SupportResponse> = {}): SupportResponse {
  return {
    id,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: `Porteur ${id}`,
    supportType: "ECRAN",
    latitude: 36.8,
    longitude: 10.18,
    technicalStatus: "ACTIF",
    diffusionCapacity: 1,
    ...partial,
  };
}

function item(
  id: number,
  partial: Partial<SupportAvailabilityItem> = {},
  s: Partial<SupportResponse> = {},
): SupportAvailabilityItem {
  return {
    support: support(id, s),
    distanceKm: 1,
    status: "DISPONIBLE",
    remainingCapacity: 1,
    reservedByCampaign: false,
    campaignReservationId: null,
    conflicts: [],
    estimatedViews: 1000,
    estimatedCost: 8,
    ...partial,
  };
}

describe("zone model — circles", () => {
  it("snaps the radius slider to 0.5 km within 0.5..20", () => {
    expect(snapRadius(2.74)).toBe(2.5);
    expect(snapRadius(0.1)).toBe(0.5);
    expect(snapRadius(80)).toBe(20);
    expect(snapRadius(Number.NaN)).toBe(3);
  });

  it("round-trips saved zones to PUT requests and detects changes", () => {
    const circles = circlesFromZones([
      {
        id: 4,
        zoneId: 1,
        zoneName: "Tunis Centre",
        label: "  Centre-ville  ",
        latitude: 36.80012345,
        longitude: 10.1801,
        radiusKm: 2.54,
        supportsInside: 3,
      },
    ]);
    expect(toZoneRequests(circles)).toEqual([
      { latitude: 36.800123, longitude: 10.1801, radiusKm: 2.5, label: "Centre-ville" },
    ]);
    expect(
      sameCircles(
        circles,
        circles.map((c) => ({ ...c })),
      ),
    ).toBe(true);
    expect(sameCircles(circles, [{ ...circles[0]!, radiusKm: 3 }])).toBe(false);
    expect(sameCircles(circles, [])).toBe(false);
  });

  it("names circles and maps them to negative map zone ids", () => {
    const circles = [
      { key: "a", latitude: 1, longitude: 2, radiusKm: 3, label: null },
      { key: "b", latitude: 3, longitude: 4, radiusKm: 1, label: "Lac" },
    ];
    expect(circleName(circles[0]!, 0)).toBe("Zone 1");
    expect(circleName(circles[1]!, 1)).toBe("Lac");
    expect(circlesAsMapZones(circles).map((z) => [z.id, z.name])).toEqual([
      [-1, "Zone 1"],
      [-2, "Lac"],
    ]);
    expect(circleIndexOfMapId(circleMapId(4))).toBe(4);
    expect(circleIndexOfMapId(12)).toBeNull();
  });

  it("prefills a circle from a recommended zone", () => {
    const circle = circleFromRecommendation({
      zone: {
        id: 2,
        name: "Sousse Nord",
        latitude: 35.8,
        longitude: 10.6,
        radiusKm: null,
        isActive: true,
      },
    });
    expect(circle).toMatchObject({
      latitude: 35.8,
      longitude: 10.6,
      radiusKm: 3,
      label: "Sousse Nord",
    });
  });

  it("widens a recommended circle so the zone's own Porteurs are inside", () => {
    const zone = {
      id: 2,
      name: "Les Berges du Lac",
      latitude: 36.838,
      longitude: 10.24,
      radiusKm: 2.5,
      isActive: true,
    };
    const supports = [
      { zoneId: 2, latitude: 36.8455, longitude: 10.273 }, // ≈ 3.06 km from the centre
      { zoneId: 2, latitude: 36.84, longitude: 10.241 },
      { zoneId: 9, latitude: 37.5, longitude: 10.9 }, // other zone: ignored
    ];
    const circle = circleFromRecommendation({ zone }, supports);
    expect(circle.radiusKm).toBe(3.5);
    for (const s of supports.slice(0, 2)) {
      expect(distanceKm(circle.latitude, circle.longitude, s.latitude, s.longitude)).toBeLessThan(
        circle.radiusKm,
      );
    }
    // Porteurs already inside: the zone radius is kept; capped at the slider maximum.
    expect(circleFromRecommendation({ zone }, supports.slice(1)).radiusKm).toBe(2.5);
    expect(
      circleFromRecommendation({ zone }, [{ zoneId: 2, latitude: 37.2, longitude: 10.24 }])
        .radiusKm,
    ).toBe(20);
  });

  it("builds a covering circle of several Porteurs plus 0.5 km", () => {
    const points = [
      { latitude: 36.8, longitude: 10.18 },
      { latitude: 36.81, longitude: 10.19 },
    ];
    const circle = coveringCircle(points)!;
    for (const p of points) {
      expect(
        distanceKm(circle.latitude, circle.longitude, p.latitude, p.longitude),
      ).toBeLessThanOrEqual(circle.radiusKm - 0.5 + 1e-9);
    }
    expect(coveringCircle([{ latitude: 36.8, longitude: 10.18 }])?.radiusKm).toBe(0.5);
    expect(coveringCircle([])).toBeNull();
  });
});

describe("zone model — availability", () => {
  it("derives the campaign window only when complete and ordered", () => {
    const base = {
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      startTime: "07:00",
      endTime: "12:00:00",
    };
    expect(campaignWindow(base)).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      startTime: "07:00:00",
      endTime: "12:00:00",
    });
    expect(campaignWindow({ ...base, endTime: null })).toBeNull();
    expect(campaignWindow({ ...base, endDate: "2026-09-01" })).toBeNull();
    expect(campaignWindow({ ...base, startTime: "13:00" })).toBeNull();
  });

  it("sorts reserved-by-campaign first, then by status order and distance; only DISPONIBLE is selectable", () => {
    const items = [
      item(1, { status: "OCCUPE", distanceKm: 0.1 }),
      item(2, { distanceKm: 2 }),
      item(3, { distanceKm: 1 }),
      item(4, { status: "RESERVE", reservedByCampaign: true, campaignReservationId: 9 }),
      item(5, { status: "HORS_LIGNE" }),
    ];
    expect(sortAvailability(items).map((i) => i.support.id)).toEqual([4, 3, 2, 1, 5]);
    expect(items.filter(isSelectable).map((i) => i.support.id)).toEqual([2, 3]);
    expect(statusCounts(items)).toEqual({
      DISPONIBLE: 2,
      RESERVE: 1,
      OCCUPE: 1,
      MAINTENANCE: 0,
      HORS_LIGNE: 1,
    });
  });

  it("filters by Porteur type and lists the present types in API order", () => {
    const items = [
      item(1, {}, { supportType: "POINT_WIFI" }),
      item(2),
      item(3, {}, { supportType: "ECRAN" }),
    ];
    expect(filterByType(items, []).length).toBe(3);
    expect(filterByType(items, ["POINT_WIFI"]).map((i) => i.support.id)).toEqual([1]);
    expect(presentTypes(items.map((i) => i.support))).toEqual(["ECRAN", "POINT_WIFI"]);
  });

  it("keeps only available Porteurs, plus the ones this campaign already holds", () => {
    const items = [
      item(1),
      item(2, { status: "OCCUPE" }),
      item(3, { status: "RESERVE", reservedByCampaign: true }),
      item(4, { status: "MAINTENANCE" }),
    ];
    expect(filterByAvailability(items, false).length).toBe(4);
    expect(filterByAvailability(items, true).map((i) => i.support.id)).toEqual([1, 3]);
  });

  it("totals the selection in millimes and formats summary and alternatives", () => {
    const items = [item(1, { estimatedCost: 0.1 }), item(2, { estimatedCost: 0.2 }), item(3)];
    expect(selectionTotals(items, new Set([1, 2]))).toEqual({ count: 2, views: 2000, cost: 0.3 });
    const parts = summaryParts({
      totalSupports: 6,
      availableSupports: 4,
      reservedSupports: 1,
      occupiedSupports: 1,
      maintenanceSupports: 0,
      offlineSupports: 0,
      estimatedViewsAvailable: 12480,
      estimatedCostAvailable: 99.84,
    });
    expect(parts.available).toBe("4 Porteurs disponibles sur 6");
    expect(parts.views).toMatch(/^12.480 affichages estimés$/);
    expect(
      alternativeLabel({
        startDate: "2026-10-12",
        endDate: "2026-10-18",
        startTime: "18:00:00",
        endTime: "23:00:00",
        preset: "SOIR",
        availableSupports: 1,
        estimatedViewsAvailable: 900,
      }),
    ).toMatch(/^Soir .* · .*oct.* · 1 Porteur disponible$/);
  });

  it("translates BATCH_CONFLICT codes per Porteur", () => {
    const messages = batchConflictMessages({
      12: "SUPPORT_ALREADY_RESERVED",
      13: "SUPPORT_UNAVAILABLE",
    });
    expect([...messages.keys()]).toEqual([12, 13]);
    expect(messages.get(13)).toMatch(/indisponible/);
  });
});

describe("media model", () => {
  it("pre-checks type, size and the 5-file limit like the backend", () => {
    expect(checkMediaFile({ type: "image/png", size: 1000 })).toEqual({
      ok: true,
      family: "image",
    });
    expect(checkMediaFile({ type: "video/webm", size: 1000 })).toEqual({
      ok: true,
      family: "video",
    });
    expect(checkMediaFile({ type: "application/pdf", size: 10 })).toMatchObject({ ok: false });
    expect(checkMediaFile({ type: "image/jpeg", size: 11 * 1024 * 1024 })).toMatchObject({
      ok: false,
      message: "Image trop lourde : 10 Mo maximum.",
    });
    expect(checkMediaFile({ type: "video/mp4", size: 51 * 1024 * 1024 })).toMatchObject({
      ok: false,
    });
    expect(checkMediaFile({ type: "image/png", size: 10 }, { existingCount: 5 })).toMatchObject({
      ok: false,
    });
  });

  it("normalises video durations to the accepted 1..600 s range", () => {
    expect(normalizeDuration(12.4)).toBe(12);
    expect(normalizeDuration(0.2)).toBe(1);
    expect(normalizeDuration(601)).toBeNull();
    expect(normalizeDuration(Number.NaN)).toBeNull();
    expect(formatDuration(75)).toBe("1 min 15 s");
    expect(formatDuration(null)).toBe("durée inconnue");
  });

  it("classifies screen formats and describes a media", () => {
    expect(screenFormatOf(1920, 1080)).toBe("paysage");
    expect(screenFormatOf(1080, 1920)).toBe("portrait");
    expect(screenFormatOf(800, 800)).toBe("carre");
    expect(screenFormatOf(1000, 200)).toBe("autre");
    expect(screenFormatOf(null, 100)).toBeNull();
    expect(
      describeMedia(
        {
          fileType: "VIDEO",
          widthPx: 1080,
          heightPx: 1920,
          durationSeconds: 20,
          fileSizeBytes: 2_500_000,
        },
        MEDIA_TYPE_LABEL,
      ),
    ).toBe("Vidéo · 1080 × 1920 px (9:16) · 20 s · 2,4 Mo");
    expect(previewKind("BANNER")).toBe("image");
    expect(previewKind("VIDEO")).toBe("video");
  });
});
