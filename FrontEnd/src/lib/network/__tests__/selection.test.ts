import { describe, expect, it } from "vitest";

import {
  addSupports,
  bookableSupportsOfZone,
  clearSelection,
  createSelection,
  EMPTY_SELECTION,
  isSelectionEmpty,
  isSupportSelected,
  isZoneSelected,
  normalizeSelection,
  pruneSelection,
  removeSupports,
  selectionEquals,
  selectWithinRadius,
  summarizeSelection,
  supportsWithinRadius,
  toggleSupport,
  toggleZone,
  type Selection,
} from "@/lib/network/selection";

import { SUPPORTS, support, ZONES } from "./fixtures";

const sel = (zoneIds: number[] = [], supportIds: number[] = []): Selection => ({
  zoneIds,
  supportIds,
});

describe("selection basics", () => {
  it("EMPTY_SELECTION is frozen and empty", () => {
    expect(isSelectionEmpty(EMPTY_SELECTION)).toBe(true);
    expect(Object.isFrozen(EMPTY_SELECTION)).toBe(true);
  });

  it("normalises and dedupes", () => {
    expect(normalizeSelection({ zoneIds: [1, 1, 2], supportIds: [3, 3, Number.NaN] })).toEqual(
      sel([1, 2], [3]),
    );
    expect(normalizeSelection(null)).toEqual(sel());
    expect(normalizeSelection({ zoneIds: [4] })).toEqual(sel([4], []));
    expect(createSelection([2, 2], [5])).toEqual(sel([2], [5]));
    expect(createSelection()).toEqual(sel());
    expect(clearSelection()).toEqual(sel());
  });

  it("predicates", () => {
    const s = sel([1], [11]);
    expect(isZoneSelected(s, 1)).toBe(true);
    expect(isZoneSelected(s, 2)).toBe(false);
    expect(isSupportSelected(s, 11)).toBe(true);
    expect(isSupportSelected(s, 12)).toBe(false);
    expect(isSelectionEmpty(s)).toBe(false);
    expect(isSelectionEmpty(sel([1]))).toBe(false);
    expect(isSelectionEmpty(sel([], [1]))).toBe(false);
  });

  it("selectionEquals compares order-sensitively", () => {
    expect(selectionEquals(sel([1], [2, 3]), sel([1], [2, 3]))).toBe(true);
    expect(selectionEquals(sel([1], [2, 3]), sel([1], [3, 2]))).toBe(false);
    expect(selectionEquals(sel([1]), sel([2]))).toBe(false);
    expect(selectionEquals(sel([1]), sel([1, 2]))).toBe(false);
    expect(selectionEquals(sel([], [1]), sel([], [1, 2]))).toBe(false);
  });

  it("bookableSupportsOfZone skips D and non-ACTIF", () => {
    expect(bookableSupportsOfZone(1, SUPPORTS).map((s) => s.id)).toEqual([11, 12]);
    expect(bookableSupportsOfZone(2, SUPPORTS).map((s) => s.id)).toEqual([21]);
    expect(bookableSupportsOfZone(99, SUPPORTS)).toEqual([]);
  });
});

describe("toggleZone", () => {
  it("selects the zone with its bookable Porteurs only", () => {
    const next = toggleZone(EMPTY_SELECTION, 1, SUPPORTS);
    expect(next).toEqual(sel([1], [11, 12]));
    expect(EMPTY_SELECTION).toEqual(sel());
  });

  it("does not duplicate supports already selected", () => {
    expect(toggleZone(sel([], [12, 31]), 1, SUPPORTS)).toEqual(sel([1], [12, 31, 11]));
  });

  it("deselects the zone and every Porteur of that zone", () => {
    const start = sel([1, 3], [11, 12, 31]);
    const next = toggleZone(start, 1, SUPPORTS);
    expect(next).toEqual(sel([3], [31]));
    expect(start).toEqual(sel([1, 3], [11, 12, 31]));
  });

  it("selects a zone with no bookable Porteur as a flag only", () => {
    expect(toggleZone(EMPTY_SELECTION, 4, SUPPORTS)).toEqual(sel([4], []));
  });
});

describe("toggleSupport", () => {
  it("adds a bookable Porteur", () => {
    expect(toggleSupport(EMPTY_SELECTION, 21, SUPPORTS)).toEqual(sel([], [21]));
  });

  it("never adds a non-bookable or unknown Porteur (same reference)", () => {
    const start = sel([], [11]);
    expect(toggleSupport(start, 13, SUPPORTS)).toBe(start);
    expect(toggleSupport(start, 22, SUPPORTS)).toBe(start);
    expect(toggleSupport(start, 999, SUPPORTS)).toBe(start);
  });

  it("removes a Porteur and drops its zone flag", () => {
    expect(toggleSupport(sel([1, 2], [11, 12, 21]), 11, SUPPORTS)).toEqual(sel([2], [12, 21]));
  });

  it("can remove an id that is no longer in the dataset", () => {
    expect(toggleSupport(sel([2], [999, 21]), 999, SUPPORTS)).toEqual(sel([2], [21]));
  });
});

describe("addSupports / removeSupports", () => {
  it("adds only bookable known ids, deduped", () => {
    expect(addSupports(sel([], [11]), [11, 12, 13, 22, 404, 31], SUPPORTS)).toEqual(
      sel([], [11, 12, 31]),
    );
  });

  it("returns the same reference when nothing changes", () => {
    const start = sel([], [11]);
    expect(addSupports(start, [11, 13], SUPPORTS)).toBe(start);
    expect(addSupports(start, [], SUPPORTS)).toBe(start);
  });

  it("removes ids and the zone flags of their zones", () => {
    expect(removeSupports(sel([1, 3], [11, 12, 31]), [12, 404], SUPPORTS)).toEqual(
      sel([3], [11, 31]),
    );
    const start = sel([1], [11]);
    expect(removeSupports(start, [21], SUPPORTS)).toBe(start);
  });
});

describe("radius selection", () => {
  const center = { lng: 10.1857, lat: 36.7995 };

  it("lists Porteurs within the radius, nearest first", () => {
    const res = supportsWithinRadius(center, 1, SUPPORTS);
    expect(res.map((d) => d.support.id)).toEqual([11, 12]);
    expect(res[0]?.distanceM).toBeCloseTo(0, 3);
    expect(res[1]?.distanceM).toBeGreaterThan(0);
  });

  it("includes non-bookable ones in the list but only selects bookable", () => {
    const res = supportsWithinRadius(center, 3.5, SUPPORTS).map((d) => d.support.id);
    expect(res).toContain(13);
    expect(selectWithinRadius(EMPTY_SELECTION, center, 3.5, SUPPORTS)).toEqual(sel([], [11, 12]));
  });

  it("wide radius reaches the Lac zone, bookable only", () => {
    expect(selectWithinRadius(sel([], [31]), center, 10, SUPPORTS)).toEqual(
      sel([], [31, 11, 12, 21]),
    );
  });

  it("invalid radius and invalid coordinates are ignored", () => {
    expect(supportsWithinRadius(center, Number.NaN, SUPPORTS)).toEqual([]);
    expect(supportsWithinRadius(center, -1, SUPPORTS)).toEqual([]);
    const broken = [support({ id: 1, latitude: Number.NaN })];
    expect(supportsWithinRadius(center, 1000, broken)).toEqual([]);
  });

  it("ties are ordered by id", () => {
    const twins = [
      support({ id: 2, latitude: 36, longitude: 10 }),
      support({ id: 1, latitude: 36, longitude: 10 }),
    ];
    expect(supportsWithinRadius({ lng: 10, lat: 36 }, 1, twins).map((d) => d.support.id)).toEqual([
      1, 2,
    ]);
  });
});

describe("pruneSelection", () => {
  it("drops unknown zones, unknown and non-bookable supports", () => {
    expect(pruneSelection(sel([1, 99], [11, 13, 22, 404]), SUPPORTS, ZONES)).toEqual(
      sel([1], [11]),
    );
  });

  it("returns the same reference when already clean", () => {
    const start = sel([1], [11]);
    expect(pruneSelection(start, SUPPORTS, ZONES)).toBe(start);
  });
});

describe("summarizeSelection", () => {
  it("summarises an empty selection", () => {
    const s = summarizeSelection(EMPTY_SELECTION, SUPPORTS, ZONES);
    expect(s.label).toBe("Aucun Porteur sélectionné");
    expect(s.supportCount).toBe(0);
    expect(s.zoneCount).toBe(0);
    expect(s.byType).toEqual({ A: 0, B: 0, C: 0, D: 0 });
  });

  it("groups by zone and type, flags missing and no-longer-bookable", () => {
    const s = summarizeSelection(sel([1, 4], [11, 12, 22, 404]), SUPPORTS, ZONES);
    expect(s.supports.map((x) => x.id)).toEqual([11, 12, 22]);
    expect(s.missingSupportIds).toEqual([404]);
    expect(s.notBookable.map((x) => x.id)).toEqual([22]);
    expect(s.bookableCount).toBe(2);
    expect(s.byType).toEqual({ A: 1, B: 0, C: 2, D: 0 });
    expect(s.byZone).toEqual([
      { zoneId: 1, zoneName: "Tunis Centre", count: 2, zoneSelected: true },
      { zoneId: 2, zoneName: "Les Berges du Lac", count: 1, zoneSelected: false },
      { zoneId: 4, zoneName: "Sousse Nord", count: 0, zoneSelected: true },
    ]);
    expect(s.zones.map((z) => z.id)).toEqual([1, 4]);
    expect(s.label).toBe("3 Porteurs dans 3 zones");
  });

  it("uses singular forms and falls back to support zoneName / generic zone label", () => {
    const one = summarizeSelection(sel([], [21]), SUPPORTS);
    expect(one.label).toBe("1 Porteur dans 1 zone");
    expect(one.byZone[0]?.zoneName).toBe("Les Berges du Lac");
    const flagOnly = summarizeSelection(sel([77]), SUPPORTS);
    expect(flagOnly.byZone[0]?.zoneName).toBe("Zone 77");
    expect(flagOnly.label).toBe("0 Porteur dans 1 zone");
  });
});
