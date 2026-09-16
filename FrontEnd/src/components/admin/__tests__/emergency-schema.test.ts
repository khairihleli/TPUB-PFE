import { describe, expect, it } from "vitest";

import {
  createPerZone,
  EMERGENCY_FIELDS,
  emergencyImpact,
  emergencyRequests,
  isEmergencyFormDirty,
  type EmergencyFormValues,
  emergencyPhase,
  emergencySchema,
  emptyEmergencyForm,
  sortEmergencies,
} from "@/components/admin/emergency-schema";
import { firstIssues } from "@/components/admin/form-utils";
import type { EmergencyResponse } from "@/lib/api/types";

const TODAY = "2026-09-13";

const base: EmergencyResponse = {
  id: 1,
  title: "A",
  content: "…",
  zoneId: 1,
  startDate: "2026-09-10",
  endDate: "2026-09-20",
  startTime: null,
  endTime: null,
  priority: 2,
  urgencyLevel: "HIGH",
  isActive: true,
};

function valid(overrides: Partial<EmergencyFormValues> = {}): EmergencyFormValues {
  return {
    ...emptyEmergencyForm(TODAY),
    title: "  Voie fermée, déviation conseillée  ",
    content: "Travaux sur la voie principale jusqu'à 18 h.",
    zoneIds: ["3"],
    endDate: "2026-09-15",
    ...overrides,
  };
}

function errorsOf(values: EmergencyFormValues) {
  const r = emergencySchema(TODAY).safeParse(values);
  return r.success ? {} : firstIssues(r.error, EMERGENCY_FIELDS);
}

describe("emergencySchema", () => {
  it("defaults to a HIGH « Normale » message starting today, no zone", () => {
    expect(emptyEmergencyForm(TODAY)).toMatchObject({
      startDate: TODAY,
      endDate: TODAY,
      priority: "2",
      urgencyLevel: "HIGH",
      zoneIds: [],
    });
    expect(isEmergencyFormDirty(emptyEmergencyForm(TODAY), TODAY)).toBe(false);
    expect(isEmergencyFormDirty({ ...emptyEmergencyForm(TODAY), title: "x" }, TODAY)).toBe(true);
  });

  it("outputs the EmergencyRequest body (trimmed, typed, optional fields null)", () => {
    const r = emergencySchema(TODAY).safeParse(valid());
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(emergencyRequests(r.data)).toEqual([
      {
        title: "Voie fermée, déviation conseillée",
        content: "Travaux sur la voie principale jusqu'à 18 h.",
        zoneId: 3,
        startDate: TODAY,
        endDate: "2026-09-15",
        startTime: null,
        endTime: null,
        durationSeconds: null,
        priority: 2,
        urgencyLevel: "HIGH",
      },
    ]);
  });

  it("sends times as HH:mm:ss and numbers as integers", () => {
    const r = emergencySchema(TODAY).safeParse(
      valid({
        startTime: "08:00",
        endTime: "20:30",
        durationSeconds: "20",
        priority: "2",
        urgencyLevel: "CRITICAL",
      }),
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.body).toMatchObject({
      startTime: "08:00:00",
      endTime: "20:30:00",
      durationSeconds: 20,
      priority: 2,
      urgencyLevel: "CRITICAL",
    });
  });

  it("requires title and at least one zone; content defaults to the title", () => {
    expect(errorsOf(valid({ title: "   ", content: "", zoneIds: [] }))).toEqual({
      title: "Ce champ est requis.",
      zoneIds: "Choisissez au moins une zone.",
    });
    const r = emergencySchema(TODAY).safeParse(valid({ content: "  " }));
    expect(r.success && r.data.body.content).toBe("Voie fermée, déviation conseillée");
  });

  it("builds one request per selected zone (duplicates removed)", () => {
    const r = emergencySchema(TODAY).safeParse(valid({ zoneIds: ["3", "5", "3"] }));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(emergencyRequests(r.data).map((b) => b.zoneId)).toEqual([3, 5]);
  });

  it("posts zone by zone and keeps going after a failure", async () => {
    const r = emergencySchema(TODAY).safeParse(valid({ zoneIds: ["1", "2", "3"] }));
    if (!r.success) throw new Error("invalid");
    const calls: number[] = [];
    const out = await createPerZone(emergencyRequests(r.data), (body) => {
      calls.push(body.zoneId);
      return body.zoneId === 2
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ ...base, id: body.zoneId * 10, zoneId: body.zoneId });
    });
    expect(calls).toEqual([1, 2, 3]);
    expect(out.map((x) => x.ok)).toEqual([true, false, true]);
  });

  it("describes the impact from active Porteurs", () => {
    const zones = [
      { id: 1, name: "Tunis Centre" },
      { id: 2, name: "La Marsa" },
    ];
    const supports = [
      { id: 7, zoneId: 1, technicalStatus: "ACTIF" as const },
      { id: 8, zoneId: 1, technicalStatus: "MAINTENANCE" as const },
      { id: 9, zoneId: 2, technicalStatus: "ACTIF" as const },
    ];
    expect(emergencyImpact(["1", "2"], zones, supports, TODAY, TODAY)).toMatchObject({
      porteurs: 2,
      sampleSupportId: 7,
      sentence: "Visible sur 2 Porteurs actifs à La Marsa et Tunis Centre, dès aujourd'hui.",
    });
    expect(emergencyImpact([2], zones, supports, "2026-09-20", TODAY).sentence).toMatch(
      /^Visible sur 1 Porteur actif à La Marsa, à partir du /,
    );
    expect(emergencyImpact([], zones, supports, TODAY, TODAY).sentence).toBe("");
  });

  it("enforces DB lengths", () => {
    expect(errorsOf(valid({ title: "x".repeat(201) })).title).toBe("200 caractères maximum.");
  });

  it("rejects an end date before the start date (DB CHECK start <= end)", () => {
    expect(errorsOf(valid({ startDate: "2026-09-20", endDate: "2026-09-18" })).endDate).toBe(
      "La date de fin doit être postérieure ou égale à la date de début.",
    );
  });

  it("rejects a message that would already be over", () => {
    expect(errorsOf(valid({ startDate: "2026-09-01", endDate: "2026-09-12" })).endDate).toBe(
      "La date de fin est déjà passée.",
    );
    // A one-day message today is fine.
    expect(errorsOf(valid({ startDate: TODAY, endDate: TODAY }))).toEqual({});
  });

  it("requires both times or none, in order", () => {
    expect(errorsOf(valid({ startTime: "08:00" })).endTime).toBe(
      "Renseignez les deux heures, ou aucune.",
    );
    expect(errorsOf(valid({ endTime: "08:00" })).startTime).toBe(
      "Renseignez les deux heures, ou aucune.",
    );
    expect(errorsOf(valid({ startTime: "18:00", endTime: "09:00" })).endTime).toBe(
      "L'heure de fin doit être après l'heure de début.",
    );
    expect(errorsOf(valid({ startTime: "25:00", endTime: "26:00" })).startTime).toBe(
      "Heure invalide.",
    );
  });

  it("bounds priority (>= 1, SMALLINT) and duration", () => {
    expect(errorsOf(valid({ priority: "0" })).priority).toBeDefined();
    expect(errorsOf(valid({ priority: "1.5" })).priority).toBeDefined();
    expect(errorsOf(valid({ priority: "40000" })).priority).toBeDefined();
    expect(errorsOf(valid({ durationSeconds: "2" })).durationSeconds).toBe(
      "Entre 5 et 300 secondes.",
    );
    expect(errorsOf(valid({ durationSeconds: "301" })).durationSeconds).toBeDefined();
    // Empty priority falls back to the backend default.
    const r = emergencySchema(TODAY).safeParse(valid({ priority: "" }));
    expect(r.success && r.data.body.priority).toBe(1);
  });

  it("only accepts known urgency levels", () => {
    expect(errorsOf(valid({ urgencyLevel: "EXTREME" })).urgencyLevel).toBe(
      "Choisissez un niveau d'urgence.",
    );
  });
});

describe("emergency list model", () => {
  it("derives the phase from isActive and the dates", () => {
    expect(emergencyPhase(base, TODAY)).toBe("current");
    expect(emergencyPhase({ ...base, startDate: TODAY, endDate: TODAY }, TODAY)).toBe("current");
    expect(emergencyPhase({ ...base, startDate: "2026-09-14" }, TODAY)).toBe("scheduled");
    expect(emergencyPhase({ ...base, endDate: "2026-09-12" }, TODAY)).toBe("expired");
    expect(emergencyPhase({ ...base, isActive: false }, TODAY)).toBe("inactive");
  });

  it("lists current messages first, lower priority number first", () => {
    const items: EmergencyResponse[] = [
      { ...base, id: 1, isActive: false },
      { ...base, id: 2, priority: 5 },
      { ...base, id: 3, startDate: "2026-09-30", endDate: "2026-10-01" },
      { ...base, id: 4, priority: 1 },
      { ...base, id: 5, endDate: "2026-09-01", startDate: "2026-08-01" },
    ];
    expect(sortEmergencies(items, TODAY).map((m) => m.id)).toEqual([4, 2, 3, 5, 1]);
  });
});
