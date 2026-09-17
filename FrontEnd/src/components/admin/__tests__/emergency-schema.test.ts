import { describe, expect, it } from "vitest";

import {
  activeSupportsInCircle,
  activeSupportsInPolygon,
  activeSupportsInZone,
  emergencySchema,
  emergencyStateOf,
  emergencyTargetLabel,
  emptyEmergencyForm,
  isEmergencyFormDirty,
  normalizeEmergencyDraft,
  parsePolygonField,
  polygonFieldError,
  serializePolygonField,
  sortEmergencies,
} from "@/components/admin/emergency-schema";
import type { EmergencyResponse, SupportResponse } from "@/lib/api/types";

/** 11:00 in Tunis (UTC+1). */
const NOW = new Date("2026-09-17T10:00:00Z");

function form(over: Partial<ReturnType<typeof emptyEmergencyForm>> = {}) {
  return {
    ...emptyEmergencyForm(NOW),
    title: "Route fermée",
    content: "Déviation par l'avenue de la Liberté",
    ...over,
  };
}

function message(over: Partial<EmergencyResponse> = {}): EmergencyResponse {
  return {
    id: 1,
    title: "Alerte",
    content: "Contenu",
    zoneId: 1,
    zoneName: "Tunis Centre",
    latitude: null,
    longitude: null,
    radiusKm: null,
    startDate: "2026-09-17",
    endDate: "2026-09-17",
    startTime: "08:00:00",
    endTime: "20:00:00",
    durationSeconds: 15,
    priority: 1,
    urgencyLevel: "HIGH",
    isActive: true,
    ...over,
  };
}

describe("emergency form", () => {
  it("starts at the next quarter hour today, ends at 23:59, HIGH, 15 s, priority 1", () => {
    expect(emptyEmergencyForm(NOW)).toMatchObject({
      startDate: "2026-09-17",
      startTime: "11:15",
      endDate: "2026-09-17",
      endTime: "23:59",
      durationSeconds: "15",
      priority: "1",
      urgencyLevel: "HIGH",
      radiusKm: "2",
    });
    expect(isEmergencyFormDirty(emptyEmergencyForm(NOW))).toBe(false);
    expect(isEmergencyFormDirty(form())).toBe(true);
  });

  it("outputs a circle target with seconds and integers", () => {
    const parsed = emergencySchema(NOW).safeParse(
      form({ latitude: "36,8", longitude: "10.18", radiusKm: "1.5", zoneId: "" }),
    );
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      title: "Route fermée",
      content: "Déviation par l'avenue de la Liberté",
      startDate: "2026-09-17",
      endDate: "2026-09-17",
      startTime: "11:15:00",
      endTime: "23:59:00",
      durationSeconds: 15,
      priority: 1,
      urgencyLevel: "HIGH",
      latitude: 36.8,
      longitude: 10.18,
      radiusKm: 1.5,
      zoneId: null,
    });
  });

  it("accepts a zone-only target", () => {
    const parsed = emergencySchema(NOW).safeParse(form({ zoneId: "3" }));
    expect(parsed.success && parsed.data).toMatchObject({ zoneId: 3 });
    expect(parsed.success && "latitude" in parsed.data).toBe(false);
  });

  it("requires a target (zone or point) and a complete, bounded circle", () => {
    const none = emergencySchema(NOW).safeParse(form());
    expect(none.error?.issues.map((i) => i.path[0])).toContain("latitude");
    const badRadius = emergencySchema(NOW).safeParse(
      form({ latitude: "36.8", longitude: "10.1", radiusKm: "80" }),
    );
    expect(badRadius.error?.issues[0]?.path).toEqual(["radiusKm"]);
    const halfCircle = emergencySchema(NOW).safeParse(form({ latitude: "36.8", zoneId: "1" }));
    expect(halfCircle.error?.issues.map((i) => i.path[0])).toContain("longitude");
  });

  it("rejects a window that ends before it starts or is already over", () => {
    const inverted = emergencySchema(NOW).safeParse(
      form({ zoneId: "1", startTime: "14:00", endTime: "13:00" }),
    );
    expect(inverted.error?.issues[0]?.message).toBe("La fin doit être postérieure au début.");
    const past = emergencySchema(NOW).safeParse(
      form({ zoneId: "1", startTime: "08:00", endTime: "10:30" }),
    );
    expect(past.error?.issues[0]?.message).toBe("La fin de diffusion est déjà passée.");
    // Multi-day window: the end time may be earlier than the start time.
    const overnight = emergencySchema(NOW).safeParse(
      form({ zoneId: "1", startTime: "22:00", endDate: "2026-09-18", endTime: "06:00" }),
    );
    expect(overnight.success).toBe(true);
  });

  it("bounds duration (5–120 s), priority (≥ 1) and requires the content", () => {
    const issues = emergencySchema(NOW).safeParse(
      form({ zoneId: "1", durationSeconds: "300", priority: "0", content: " " }),
    ).error?.issues;
    expect(issues?.map((i) => i.path[0])).toEqual(
      expect.arrayContaining(["durationSeconds", "priority", "content"]),
    );
  });

  it("keeps only known string fields from an old draft", () => {
    const restored = normalizeEmergencyDraft(
      { title: "Brouillon", zoneIds: ["1"], priority: 3 },
      NOW,
    );
    expect(restored.title).toBe("Brouillon");
    expect(restored.priority).toBe("1");
    expect("zoneIds" in restored).toBe(false);
  });
});

describe("emergency impact", () => {
  const supports = [
    { zoneId: 1, latitude: 36.8, longitude: 10.18, technicalStatus: "ACTIF" },
    { zoneId: 1, latitude: 36.801, longitude: 10.181, technicalStatus: "MAINTENANCE" },
    { zoneId: 2, latitude: 36.9, longitude: 10.3, technicalStatus: "ACTIF" },
  ] as SupportResponse[];

  it("counts ACTIF Porteurs inside the circle or the zone", () => {
    expect(activeSupportsInCircle(supports, 36.8, 10.18, 1)).toBe(1);
    expect(activeSupportsInCircle(supports, 36.8, 10.18, 30)).toBe(2);
    expect(activeSupportsInCircle(supports, null, 10.18, 1)).toBe(0);
    expect(activeSupportsInZone(supports, 1)).toBe(1);
    expect(activeSupportsInZone(supports, null)).toBe(0);
  });
});

describe("emergency list model", () => {
  it("uses the backend state, or derives it from the datetime window", () => {
    expect(emergencyStateOf(message({ state: "TERMINE" }), NOW)).toBe("TERMINE");
    expect(emergencyStateOf(message(), NOW)).toBe("EN_COURS");
    expect(emergencyStateOf(message({ startTime: "12:00:00" }), NOW)).toBe("PROGRAMME");
    expect(emergencyStateOf(message({ endTime: "10:59:00" }), NOW)).toBe("TERMINE");
    expect(emergencyStateOf(message({ isActive: false }), NOW)).toBe("DESACTIVE");
    expect(emergencyStateOf(message({ isActive: false, stopReason: "AUTO" }), NOW)).toBe("TERMINE");
  });

  it("lists on-air messages first, critical before high, then priority", () => {
    const sorted = sortEmergencies(
      [
        message({ id: 1, state: "TERMINE", urgencyLevel: "CRITICAL" }),
        message({ id: 2, state: "EN_COURS", urgencyLevel: "HIGH", priority: 2 }),
        message({ id: 3, state: "EN_COURS", urgencyLevel: "CRITICAL", priority: 5 }),
        message({ id: 4, state: "PROGRAMME" }),
        message({ id: 5, state: "EN_COURS", urgencyLevel: "HIGH", priority: 1 }),
      ],
      NOW,
    );
    expect(sorted.map((m) => m.id)).toEqual([3, 5, 2, 4, 1]);
  });

  it("labels the target", () => {
    const name = (id: number) => `Zone ${id}`;
    expect(emergencyTargetLabel(message(), name)).toBe("Zone Tunis Centre");
    expect(
      emergencyTargetLabel(message({ latitude: 36.8, longitude: 10.1, radiusKm: 2.5 }), name),
    ).toBe("Cercle de 2,5 km · Tunis Centre");
  });
});

describe("emergency polygon target (docs/round2-contract.md §4.4)", () => {
  const SQUARE = "10.17,36.79;10.19,36.79;10.19,36.81;10.17,36.81";

  it("serialises and parses the polygon field", () => {
    expect(parsePolygonField(SQUARE)).toHaveLength(4);
    expect(serializePolygonField(parsePolygonField(SQUARE))).toBe(SQUARE);
    expect(parsePolygonField("")).toEqual([]);
    expect(parsePolygonField("abc")).toEqual([]);
  });

  it("posts a GeoJSON polygon and keeps the zone optional", () => {
    const parsed = emergencySchema(NOW).safeParse(form({ polygon: SQUARE }));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({ zoneId: null });
    expect(parsed.data).toHaveProperty("polygon.type", "Polygon");
  });

  it("refuses a polygon together with a circle and an invalid tracing", () => {
    const conflict = emergencySchema(NOW).safeParse(
      form({ polygon: SQUARE, latitude: "36.8", longitude: "10.18" }),
    );
    expect(conflict.success).toBe(false);
    if (!conflict.success) {
      expect(conflict.error.issues[0]?.message).toBe(
        "Choisissez un cercle ou un polygone, pas les deux.",
      );
    }
    expect(polygonFieldError("10.17,36.79;10.19,36.81;10.19,36.79;10.17,36.81")).toBe(
      "Le tracé du polygone se croise.",
    );
    expect(polygonFieldError("10.17,36.79;10.19,36.79")).toBe(
      "Un polygone doit avoir au moins 3 sommets.",
    );
    expect(polygonFieldError(SQUARE)).toBeNull();
  });

  it("counts the active Porteurs inside the polygon and labels the target", () => {
    const vertices = parsePolygonField(SQUARE);
    expect(
      activeSupportsInPolygon(
        [
          { latitude: 36.8, longitude: 10.18, technicalStatus: "ACTIF" },
          { latitude: 36.8, longitude: 10.18, technicalStatus: "MAINTENANCE" },
          { latitude: 36.9, longitude: 10.4, technicalStatus: "ACTIF" },
        ] as SupportResponse[],
        vertices,
      ),
    ).toBe(1);
    expect(
      emergencyTargetLabel(
        {
          ...message(),
          targetPolygon: { type: "Polygon", coordinates: [] },
        },
        () => "Tunis Centre",
      ),
    ).toBe("Polygone · Tunis Centre");
  });
});
