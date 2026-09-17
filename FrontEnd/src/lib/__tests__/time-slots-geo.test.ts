import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_ZONE_LIMITS,
  circlePolygon,
  circlesCollection,
  clampRadiusKm,
  distanceKm,
  insideAnyCircle,
  withinKm,
} from "@/lib/geo";
import {
  formatHour,
  formatSlot,
  isValidSlot,
  normalizeTime,
  PERSONNALISE,
  presetOf,
  SLOT_CHOICES,
  SLOT_PRESETS,
  slotChoiceLabel,
  slotHours,
  slotsOverlap,
  slotWindow,
  validateSlot,
} from "@/lib/time-slots";

describe("time-slot presets (contract §2.4)", () => {
  it("defines the four backend windows with French labels", () => {
    expect(SLOT_PRESETS.map((p) => [p.id, p.startTime, p.endTime, p.label])).toEqual([
      ["MATIN", "07:00:00", "12:00:00", "Matin (7 h – 12 h)"],
      ["APRES_MIDI", "12:00:00", "18:00:00", "Après-midi (12 h – 18 h)"],
      ["SOIR", "18:00:00", "23:00:00", "Soir (18 h – 23 h)"],
      ["JOURNEE", "07:00:00", "23:00:00", "Journée complète (7 h – 23 h)"],
    ]);
    expect(SLOT_CHOICES.map((c) => c.id)).toEqual([
      "MATIN",
      "APRES_MIDI",
      "SOIR",
      "JOURNEE",
      PERSONNALISE,
    ]);
    expect(slotChoiceLabel(PERSONNALISE)).toBe("Personnalisé");
  });

  it("recognises a preset from API or input times", () => {
    expect(presetOf("07:00:00", "12:00:00")).toBe("MATIN");
    expect(presetOf("12:00", "18:00")).toBe("APRES_MIDI");
    expect(presetOf("07:00", "23:00:00")).toBe("JOURNEE");
    expect(presetOf("08:00:00", "12:00:00")).toBe(PERSONNALISE);
    expect(presetOf(null, "12:00:00")).toBe(PERSONNALISE);
    expect(presetOf("7:00", "12:00")).toBe(PERSONNALISE);
    expect(slotWindow("SOIR")).toEqual({ startTime: "18:00:00", endTime: "23:00:00" });
  });

  it("normalises and validates times", () => {
    expect(normalizeTime("09:30")).toBe("09:30:00");
    expect(normalizeTime("24:00")).toBeNull();
    expect(slotHours("08:00", "12:30:00")).toBe(4.5);
    expect(slotHours("12:00", "08:00")).toBe(0);
    expect(isValidSlot("08:00", "08:00")).toBe(false);
    expect(validateSlot("", "10:00")).toMatch(/heure de début/);
    expect(validateSlot("10:00", "09:00")).toMatch(/après l'heure de début/);
    expect(validateSlot("09:00", "10:00")).toBeNull();
  });

  it("formats hours and slots the French way", () => {
    expect(formatHour("07:00:00")).toBe("7 h");
    expect(formatHour("12:05")).toBe("12 h 05");
    expect(formatSlot("18:00:00", "23:00:00")).toBe("Soir (18 h – 23 h)");
    expect(formatSlot("09:30:00", "14:00:00")).toBe("9 h 30 – 14 h");
    expect(formatSlot(null, null)).toBe("Horaires non définis");
  });

  it("uses the backend half-open overlap rule", () => {
    expect(slotsOverlap("07:00", "12:00", "11:00", "13:00")).toBe(true);
    expect(slotsOverlap("07:00", "12:00", "12:00", "18:00")).toBe(false);
    expect(slotsOverlap("07:00", "23:00", "18:00", "19:00")).toBe(true);
  });
});

describe("geo (contract GeoUtils)", () => {
  it("computes haversine kilometres", () => {
    // Tunis Centre → La Marsa ≈ 15.6 km
    const d = distanceKm(36.8008, 10.18, 36.8782, 10.3247);
    expect(d).toBeGreaterThan(15);
    expect(d).toBeLessThan(16.5);
    expect(distanceKm(36.8, 10.18, 36.8, 10.18)).toBe(0);
  });

  it("checks inclusion in one or several circles", () => {
    expect(withinKm(36.8, 10.18, 36.8, 10.18, 0.1)).toBe(true);
    expect(withinKm(36.8782, 10.3247, 36.8008, 10.18, 2)).toBe(false);
    const circles = [
      { latitude: 36.8008, longitude: 10.18, radiusKm: 2 },
      { latitude: 36.8782, longitude: 10.3247, radiusKm: 1 },
    ];
    expect(insideAnyCircle(36.8781, 10.3252, circles)).toBe(true);
    expect(insideAnyCircle(35.8256, 10.636, circles)).toBe(false);
  });

  it("builds closed GeoJSON circles for MapLibre", () => {
    const f = circlePolygon(36.8, 10.18, 1, 32);
    expect(f.type).toBe("Feature");
    const ring = f.geometry.coordinates[0] ?? [];
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    const [lng, lat] = ring[0] ?? [0, 0];
    expect(distanceKm(36.8, 10.18, lat, lng)).toBeCloseTo(1, 2);
    expect(
      circlesCollection([{ latitude: 36.8, longitude: 10.18, radiusKm: 2 }]).features,
    ).toHaveLength(1);
  });

  it("clamps radii to the contract range", () => {
    expect(clampRadiusKm(0)).toBe(CAMPAIGN_ZONE_LIMITS.minRadiusKm);
    expect(clampRadiusKm(80)).toBe(50);
    expect(clampRadiusKm(2.345)).toBe(2.3);
    expect(clampRadiusKm(Number.NaN)).toBe(0.1);
  });
});
