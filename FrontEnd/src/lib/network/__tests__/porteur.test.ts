import { describe, expect, it } from "vitest";

import type { SupportType, TechnicalStatus } from "@/lib/api/types";
import {
  bookingBlockReason,
  DEFAULT_MAST_HEIGHT,
  DESIGN_INTENTION_NOTICE,
  formatMastHeight,
  isBookable,
  isMastHeight,
  isPorteurType,
  MAST_HEIGHTS,
  MAST_HEIGHT_VALUES,
  mastHeightMeta,
  orientationLabel,
  orientationSpoken,
  PORTEUR_TYPE_CODES,
  PORTEUR_TYPES,
  porteurAriaLabel,
  previewFaces,
  resolvePorteurType,
  technicalStatusLabel,
} from "@/lib/network/porteur";

import { support } from "./fixtures";

describe("PORTEUR_TYPES", () => {
  it("defines A–D with faces A:1 wrap, B:2, C:1, D:0", () => {
    expect(PORTEUR_TYPE_CODES).toEqual(["A", "B", "C", "D"]);
    expect(PORTEUR_TYPES.A.faces).toBe(1);
    expect(PORTEUR_TYPES.A.faceLayout).toBe("wrap");
    expect(PORTEUR_TYPES.B.faces).toBe(2);
    expect(PORTEUR_TYPES.C.faces).toBe(1);
    expect(PORTEUR_TYPES.D.faces).toBe(0);
    expect(PORTEUR_TYPES.D.hasScreen).toBe(false);
    for (const code of PORTEUR_TYPE_CODES) {
      const t = PORTEUR_TYPES[code];
      expect(t.code).toBe(code);
      expect(t.label.length).toBeGreaterThan(3);
      expect(t.context.length).toBeGreaterThan(3);
      expect(t.screen.length).toBeGreaterThan(3);
      expect(t.image).toBe(`/porteur/porteur-type-${code.toLowerCase()}.png`);
    }
  });

  it("uses design-intention wording and no invented figures", () => {
    expect(DESIGN_INTENTION_NOTICE).toContain("intention de conception");
    const copy = JSON.stringify({ PORTEUR_TYPES, MAST_HEIGHTS });
    expect(copy).not.toMatch(/kW|kWh|watt|impressions|contacts|audience de|garanti|leader/i);
    const values = [
      ...Object.values(PORTEUR_TYPES).flatMap((t) => [
        t.name,
        t.label,
        t.context,
        t.screen,
        t.flow,
        t.description,
      ]),
      ...MAST_HEIGHTS.map((m) => `${m.tier} ${m.description}`),
    ].join(" ");
    // French only
    expect(values).not.toMatch(/\b(the|with|screen|and)\b/i);
  });

  it("guards type values", () => {
    expect(isPorteurType("A")).toBe(true);
    expect(isPorteurType("E")).toBe(false);
    expect(isPorteurType(null)).toBe(false);
  });
});

describe("MAST_HEIGHTS", () => {
  it("lists 15/20/25/30 with tier names", () => {
    expect(MAST_HEIGHT_VALUES).toEqual([15, 20, 25, 30]);
    expect(MAST_HEIGHTS.map((m) => m.tier)).toEqual(["Compact", "Urbain", "Majeur", "Phare"]);
    expect(DEFAULT_MAST_HEIGHT).toBe(20);
  });

  it("looks up and formats heights", () => {
    expect(isMastHeight(25)).toBe(true);
    expect(isMastHeight(18)).toBe(false);
    expect(mastHeightMeta(30)?.tier).toBe("Phare");
    expect(mastHeightMeta(null)).toBeNull();
    expect(formatMastHeight(25)).toBe("25 m · Majeur");
    expect(formatMastHeight(18)).toBe("18 m");
    expect(formatMastHeight(null)).toBeNull();
    expect(formatMastHeight(undefined)).toBeNull();
  });
});

describe("resolvePorteurType", () => {
  it("declared porteurType wins, not inferred", () => {
    expect(resolvePorteurType({ supportType: "POINT_WIFI", porteurType: "B" })).toEqual({
      type: "B",
      inferred: false,
    });
  });

  it.each<[SupportType, string]>([
    ["ECRAN", "A"],
    ["PANNEAU_NUMERIQUE", "C"],
    ["POINT_WIFI", "D"],
    ["APPLICATION", "C"],
    ["SITE_WEB", "C"],
  ])("infers %s → %s", (supportType, type) => {
    expect(resolvePorteurType({ supportType, porteurType: null })).toEqual({
      type,
      inferred: true,
    });
    expect(resolvePorteurType({ supportType })).toEqual({ type, inferred: true });
  });

  it("ignores garbage declared values", () => {
    expect(resolvePorteurType({ supportType: "ECRAN", porteurType: "Z" })).toEqual({
      type: "A",
      inferred: true,
    });
  });
});

describe("isBookable & bookingBlockReason", () => {
  it.each<[TechnicalStatus, boolean]>([
    ["ACTIF", true],
    ["MAINTENANCE", false],
    ["INACTIF", false],
    ["HORS_LIGNE", false],
  ])("status %s → %s", (technicalStatus, expected) => {
    const s = support({ id: 1, technicalStatus, porteurType: "A" });
    expect(isBookable(s)).toBe(expected);
    expect(bookingBlockReason(s) === null).toBe(expected);
  });

  it("type D is never bookable, even ACTIF, and says why", () => {
    const declared = support({ id: 1, porteurType: "D" });
    const inferred = support({ id: 2, supportType: "POINT_WIFI" });
    expect(isBookable(declared)).toBe(false);
    expect(isBookable(inferred)).toBe(false);
    expect(bookingBlockReason(declared)).toMatch(/type D/);
    expect(
      bookingBlockReason(support({ id: 3, porteurType: "D", technicalStatus: "HORS_LIGNE" })),
    ).toMatch(/type D/);
  });

  it("gives French reasons per status", () => {
    expect(bookingBlockReason(support({ id: 1, technicalStatus: "MAINTENANCE" }))).toMatch(
      /maintenance/,
    );
    expect(bookingBlockReason(support({ id: 1, technicalStatus: "HORS_LIGNE" }))).toMatch(
      /hors ligne/,
    );
    expect(bookingBlockReason(support({ id: 1, technicalStatus: "INACTIF" }))).toMatch(/inactif/);
    expect(technicalStatusLabel("HORS_LIGNE")).toBe("Hors ligne");
  });
});

describe("labels", () => {
  it("orientation label per type", () => {
    expect(orientationLabel(45, "B")).toBe("Écran principal orienté NE");
    expect(orientationLabel(45)).toBe("Écran principal orienté NE");
    expect(orientationLabel(270, "A")).toBe("Écran 360°, face principale orientée O");
    expect(orientationLabel(90, "D")).toBeNull();
    expect(orientationLabel(null, "C")).toBeNull();
    expect(orientationLabel(undefined)).toBeNull();
    expect(orientationSpoken(225.4)).toBe("orienté sud-ouest (225°)");
    expect(orientationSpoken(null)).toBeNull();
  });

  it("builds the marker aria-label", () => {
    const s = support({ id: 1, name: "Écran LED Avenue Habib Bourguiba", porteurType: "A" });
    expect(porteurAriaLabel(s)).toBe("Porteur Type A — Écran LED Avenue Habib Bourguiba — Actif");
    expect(
      porteurAriaLabel(
        { ...s, porteurType: null, technicalStatus: "MAINTENANCE" },
        { selected: true },
      ),
    ).toBe(
      "Porteur Type A (typologie estimée) — Écran LED Avenue Habib Bourguiba — Maintenance — sélectionné",
    );
  });

  it("lists preview faces", () => {
    expect(previewFaces("A").map((f) => f.label)).toEqual(["360°"]);
    expect(previewFaces("B").map((f) => f.value)).toEqual(["all", 1, 2]);
    expect(previewFaces("C").map((f) => f.label)).toEqual(["Face unique"]);
    expect(previewFaces("D")).toEqual([]);
  });
});

describe("Porteur type tones are categorical (VD-07)", () => {
  it("maps A–D to --cat-1..4 and never to a status tone", () => {
    expect(PORTEUR_TYPES.A.tone).toBe("cat-1");
    expect(PORTEUR_TYPES.B.tone).toBe("cat-2");
    expect(PORTEUR_TYPES.C.tone).toBe("cat-4");
    expect(PORTEUR_TYPES.D.tone).toBe("cat-3");
    const tones = Object.values(PORTEUR_TYPES).map((t) => t.tone);
    expect(new Set(tones).size).toBe(4);
    for (const t of tones) expect(["danger", "success", "warning"]).not.toContain(t);
  });
});
