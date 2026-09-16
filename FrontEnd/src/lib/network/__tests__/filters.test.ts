import { describe, expect, it } from "vitest";

import {
  countActiveFilters,
  DEFAULT_FILTERS,
  displayedCountLabel,
  filterSupports,
  hiddenByFiltersLabel,
  matchesFilters,
  normalizeText,
  searchNetwork,
  TECHNICAL_STATUS_CODES,
  toggleStatusFilter,
  toggleTypeFilter,
} from "@/lib/network/filters";

import { SUPPORTS, support, ZONES } from "./fixtures";

const ids = (list: { id: number }[]) => list.map((s) => s.id);

describe("filters", () => {
  it("default filters keep everything", () => {
    expect(ids(filterSupports(SUPPORTS, DEFAULT_FILTERS))).toEqual(ids(SUPPORTS));
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(TECHNICAL_STATUS_CODES).toHaveLength(4);
  });

  it("filters by resolved type (declared or inferred)", () => {
    expect(ids(filterSupports(SUPPORTS, { ...DEFAULT_FILTERS, types: ["C"] }))).toEqual([12, 22]);
    expect(ids(filterSupports(SUPPORTS, { ...DEFAULT_FILTERS, types: ["A", "D"] }))).toEqual([
      11, 13, 31,
    ]);
  });

  it("filters by status and bookable only", () => {
    expect(
      ids(filterSupports(SUPPORTS, { ...DEFAULT_FILTERS, statuses: ["MAINTENANCE"] })),
    ).toEqual([22]);
    expect(ids(filterSupports(SUPPORTS, { ...DEFAULT_FILTERS, bookableOnly: true }))).toEqual([
      11, 12, 21, 31,
    ]);
    const combined = {
      types: ["A" as const, "C" as const],
      statuses: ["ACTIF" as const],
      bookableOnly: true,
    };
    expect(ids(filterSupports(SUPPORTS, combined))).toEqual([11, 12, 31]);
    expect(countActiveFilters(combined)).toBe(4);
    expect(
      matchesFilters(support({ id: 1, porteurType: "D" }), {
        ...DEFAULT_FILTERS,
        bookableOnly: true,
      }),
    ).toBe(false);
  });

  it("toggles immutably", () => {
    const a = toggleTypeFilter(DEFAULT_FILTERS, "B");
    expect(a.types).toEqual(["B"]);
    expect(toggleTypeFilter(a, "B").types).toEqual([]);
    expect(DEFAULT_FILTERS.types).toEqual([]);
    const s = toggleStatusFilter(DEFAULT_FILTERS, "HORS_LIGNE");
    expect(s.statuses).toEqual(["HORS_LIGNE"]);
    expect(toggleStatusFilter(s, "HORS_LIGNE").statuses).toEqual([]);
  });

  it("labels the counter", () => {
    expect(displayedCountLabel(0)).toBe("Aucun Porteur affiché");
    expect(displayedCountLabel(1)).toBe("1 Porteur affiché");
    expect(displayedCountLabel(12)).toBe("12 Porteurs affichés");
  });

  it("labels the counter against the total and what the filters hide", () => {
    expect(displayedCountLabel(8, 8)).toBe("8 Porteurs affichés sur 8");
    expect(displayedCountLabel(1, 8)).toBe("1 Porteur affiché sur 8");
    expect(displayedCountLabel(0, 8)).toBe("Aucun Porteur affiché sur 8");
    expect(hiddenByFiltersLabel(0)).toBe("");
    expect(hiddenByFiltersLabel(1)).toBe("1 masqué par les filtres");
    expect(hiddenByFiltersLabel(6)).toBe("6 masqués par les filtres");
  });

  it("default filters hide nothing: every type A–D and every status, incl. D and offline", () => {
    const all = [
      ...SUPPORTS,
      support({ id: 90, porteurType: "D", technicalStatus: "HORS_LIGNE" }),
      support({ id: 91, technicalStatus: "INACTIF" }),
      support({ id: 92, porteurType: "B", technicalStatus: "MAINTENANCE" }),
    ];
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(filterSupports(all, DEFAULT_FILTERS)).toHaveLength(all.length);
  });
});

describe("search", () => {
  it("normalises accents and punctuation", () => {
    expect(normalizeText("  Écran LED — Avenue  Habib-Bourguiba ")).toBe(
      "ecran led avenue habib bourguiba",
    );
    expect(normalizeText(null)).toBe("");
  });

  it("returns nothing for an empty query", () => {
    expect(searchNetwork("   ", ZONES, SUPPORTS)).toEqual([]);
  });

  it("finds zones and Porteurs, accent-insensitive, zones first on ties", () => {
    const res = searchNetwork("tunis", ZONES, SUPPORTS);
    expect(res[0]).toMatchObject({
      kind: "zone",
      id: 1,
      label: "Tunis Centre",
      detail: "Zone · 3 Porteurs",
    });
    const ecran = searchNetwork("ecran", ZONES, SUPPORTS);
    expect(ecran[0]).toMatchObject({ kind: "support", id: 11, type: "A" });
    expect(ecran[0]?.detail).toBe("Type A · Panoramique · Avenue Habib Bourguiba, Tunis · Actif");
  });

  it("matches addresses and zone names with lower rank than names", () => {
    const res = searchNetwork("bourguiba", ZONES, SUPPORTS);
    expect(res.map((r) => r.id)).toEqual([11]);
    const lac = searchNetwork("lac", ZONES, SUPPORTS);
    expect(lac.map((r) => `${r.kind}-${r.id}`)).toEqual([
      "support-22",
      "zone-2",
      "support-21",
      "support-12",
    ]);
  });

  it("supports multi-word queries in any order, limit and inactive zones", () => {
    expect(searchNetwork("jadida sfax", ZONES, SUPPORTS).map((r) => r.id)).toEqual([31]);
    expect(searchNetwork("e", ZONES, SUPPORTS, 2)).toHaveLength(2);
    expect(searchNetwork("sousse", ZONES, SUPPORTS)[0]?.detail).toBe(
      "Zone · aucun Porteur · inactive",
    );
    expect(searchNetwork("zzz", ZONES, SUPPORTS)).toEqual([]);
  });

  it("skips invalid coordinates", () => {
    const res = searchNetwork(
      "fantome",
      [{ id: 5, name: "Fantome", latitude: Number.NaN, longitude: 0, radiusKm: 1, isActive: true }],
      [support({ id: 7, name: "Fantome", longitude: 999 })],
    );
    expect(res).toEqual([]);
  });

  it("singular zone count", () => {
    expect(searchNetwork("sfax", ZONES, SUPPORTS)[0]?.detail).toBe("Zone · 1 Porteur");
  });
});
