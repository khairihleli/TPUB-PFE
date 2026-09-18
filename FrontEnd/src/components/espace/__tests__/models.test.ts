import { beforeEach, describe, expect, it, vi } from "vitest";

import { campaign, reservation, support, zone } from "@/components/espace/__tests__/fixtures";
import { axisTicks, donutArcs, niceMax, percentOf } from "@/components/espace/chart-scale";
import { loadNetworkCatalogue } from "@/components/espace/espace-data";
import { splitTND } from "@/components/espace/espace-ui";
import {
  filterSupports,
  formatCoordinates,
  presentValues,
  summarizeZones,
} from "@/components/espace/network-model";
import {
  activeScopeFilterCount,
  campaignOptions,
  countByStatus,
  DEFAULT_RESERVATION_SORT,
  filterReservationRows,
  isFiltering,
  joinReservations,
  reservationSortCaption,
  reservationSortValue,
  reservationSummary,
  sortReservationRows,
  zoneOptions,
} from "@/components/espace/reservations-model";
import {
  campaignRows,
  formatRate,
  parsePeriodPreset,
  periodRange,
} from "@/components/espace/statistics-model";
import { sortRows } from "@/components/ui/data-table";
import type * as Endpoints from "@/lib/api/endpoints";
import { formatTND } from "@/lib/format";
import { clearResourceCache } from "@/lib/resource-cache";

const api = vi.hoisted(() => ({ zonesActive: vi.fn(), supportsAll: vi.fn() }));

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof Endpoints>();
  return {
    ...actual,
    zonesApi: { ...actual.zonesApi, active: api.zonesActive },
    supportsApi: { ...actual.supportsApi, all: api.supportsAll },
  };
});

beforeEach(() => {
  clearResourceCache();
  api.zonesActive.mockReset();
  api.supportsAll.mockReset();
});

describe("reservations model", () => {
  const campaigns = [campaign({ id: 1, name: "Rentrée" })];
  const bourguiba = { supportName: "Écran Bourguiba", supportType: "ECRAN" as const };
  const reservations = [
    reservation({
      id: 1,
      campaignId: 1,
      supportId: 10,
      zoneId: 1,
      startDate: "2026-11-01",
      zoneName: "Tunis Centre",
      ...bourguiba,
    }),
    reservation({
      id: 2,
      campaignId: 2,
      supportId: 99,
      zoneId: 2,
      startDate: "2026-10-01",
      reservationStatus: "CONFIRMEE",
      campaignName: "Été",
      zoneName: "La Marsa",
    }),
    reservation({
      id: 3,
      campaignId: 2,
      supportId: 10,
      zoneId: 1,
      reservationStatus: "ANNULEE",
      campaignName: "Été",
      zoneName: "Tunis Centre",
      ...bourguiba,
    }),
  ];

  it("uses the names carried by v2 reservations and falls back to numbered labels", () => {
    const rows = joinReservations(reservations, campaigns);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      campaignName: "Rentrée",
      supportName: "Écran Bourguiba",
      supportType: "ECRAN",
      zoneName: "Tunis Centre",
    });
    expect(rows[1]).toMatchObject({ supportName: "Porteur n° 99", supportType: null });
    expect(joinReservations([reservation({ id: 9, campaignId: 7, zoneId: 3 })])[0]).toMatchObject({
      campaignName: "Campagne n° 7",
      zoneName: "Zone n° 3",
    });
  });

  it("summarises holding slots and their estimated cost (millimes)", () => {
    const rows = joinReservations([
      reservation({ id: 1, campaignId: 1, estimatedCost: 0.1 }),
      reservation({ id: 2, campaignId: 1, estimatedCost: 0.2, reservationStatus: "CONFIRMEE" }),
      reservation({ id: 3, campaignId: 1, estimatedCost: 50, reservationStatus: "EXPIREE" }),
    ]);
    expect(reservationSummary(rows)).toEqual({
      holding: 2,
      temporary: 1,
      confirmed: 1,
      estimatedCost: 0.3,
    });
    expect(campaignOptions(rows)).toEqual([{ id: 1, name: "Campagne n° 1" }]);
  });

  it("filters by status, campaign and zone, and counts by status", () => {
    const rows = joinReservations(reservations, campaigns);
    expect(
      filterReservationRows(rows, { status: "CONFIRMEE", campaignId: null, zoneId: null }),
    ).toHaveLength(1);
    expect(filterReservationRows(rows, { status: null, campaignId: 2, zoneId: 1 })).toHaveLength(1);
    expect(isFiltering({ status: null, campaignId: null, zoneId: null })).toBe(false);
    expect(isFiltering({ status: "ANNULEE", campaignId: null, zoneId: null })).toBe(true);
    expect(activeScopeFilterCount({ campaignId: 2, zoneId: 1 })).toBe(2);
    expect(countByStatus(rows)).toEqual({
      toutes: 3,
      TEMPORAIRE: 1,
      CONFIRMEE: 1,
      ANNULEE: 1,
      EXPIREE: 0,
    });
    expect(zoneOptions(rows)).toEqual([
      { id: 2, name: "La Marsa" },
      { id: 1, name: "Tunis Centre" },
    ]);
  });

  it("sorts holding slots first, soonest first", () => {
    const rows = sortReservationRows(joinReservations(reservations, campaigns));
    expect(rows.map((r) => r.reservation.id)).toEqual([2, 1, 3]);
  });

  it("sorts table rows by période (default), coût, Porteur and statut", () => {
    const rows = joinReservations(
      [
        reservation({
          id: 1,
          campaignId: 1,
          supportId: 10,
          startDate: "2026-11-01",
          estimatedCost: 50,
          reservationStatus: "ANNULEE",
        }),
        reservation({
          id: 2,
          campaignId: 1,
          supportId: 99,
          startDate: "2026-10-01",
          estimatedCost: 300,
          reservationStatus: "CONFIRMEE",
        }),
        reservation({
          id: 3,
          campaignId: 2,
          supportId: 10,
          startDate: "2026-10-15",
          estimatedCost: 120,
        }),
      ].map((r) => (r.supportId === 10 ? { ...r, supportName: "Écran Bourguiba" } : r)),
      campaigns,
    );
    const columns = (["periode", "cout", "porteur", "statut"] as const).map((key) => ({
      key,
      header: key,
      cell: () => null,
      sortable: true,
      sortValue: (row: (typeof rows)[number]) => reservationSortValue(row, key),
    }));
    const ids = (key: string, dir: "asc" | "desc") =>
      sortRows(rows, columns, { key, dir }).map((r) => r.reservation.id);
    expect(ids(DEFAULT_RESERVATION_SORT.key, DEFAULT_RESERVATION_SORT.dir)).toEqual([2, 3, 1]);
    expect(ids("cout", "desc")).toEqual([2, 3, 1]);
    expect(ids("porteur", "asc")).toEqual([1, 3, 2]); // « Écran Bourguiba » before « Porteur n° 99 »
    expect(ids("statut", "asc")).toEqual([3, 2, 1]); // Bloqué, Confirmé, Libéré
    expect(reservationSortCaption(null)).toBe("début, du plus proche au plus lointain");
    expect(reservationSortCaption({ key: "cout", dir: "desc" })).toBe(
      "coût estimé, du plus élevé au plus bas",
    );
  });
});

describe("statistics model", () => {
  const TODAY = "2026-09-17";

  it("computes preset ranges ending today", () => {
    expect(periodRange("7", { from: "", to: "" }, TODAY)).toEqual({
      ok: true,
      range: { from: "2026-09-11", to: TODAY },
    });
    expect(periodRange("90", { from: "", to: "" }, TODAY)).toMatchObject({
      range: { from: "2026-06-20" },
    });
  });

  it("validates a custom range (complete, ordered, at most 366 days)", () => {
    expect(periodRange("perso", { from: "", to: "2026-09-01" }, TODAY)).toMatchObject({
      ok: false,
    });
    expect(periodRange("perso", { from: "2026-09-10", to: "2026-09-01" }, TODAY)).toMatchObject({
      ok: false,
      message: "La date de fin doit suivre la date de début.",
    });
    expect(periodRange("perso", { from: "2024-01-01", to: "2026-01-01" }, TODAY)).toMatchObject({
      ok: false,
    });
    expect(periodRange("perso", { from: "2026-09-01", to: "2026-09-10" }, TODAY)).toEqual({
      ok: true,
      range: { from: "2026-09-01", to: "2026-09-10" },
    });
  });

  it("parses the preset param with a 30-day default", () => {
    expect(parsePeriodPreset("90")).toBe("90");
    expect(parsePeriodPreset("365")).toBe("30");
    expect(parsePeriodPreset(null)).toBe("30");
  });

  it("sorts campaign rows by views then name and formats the click rate", () => {
    const row = (campaignId: number, name: string, views: number) => ({
      campaignId,
      name,
      status: "ACTIVE" as const,
      views,
      clicks: 0,
      interactions: 0,
      estimatedViews: 0,
      estimatedCost: 0,
      budget: 0,
      consumedBudget: 0,
    });
    const rows = campaignRows({
      byCampaign: [row(1, "Zèbre", 5), row(2, "Abeille", 5), row(3, "Mouette", 9)],
    });
    expect(rows.map((r) => r.campaignId)).toEqual([3, 2, 1]);
    expect(formatRate(0, 3)).toBe("—");
    expect(formatRate(400, 5)).toMatch(/^1,25\s?%$/);
  });
});

describe("loadNetworkCatalogue", () => {
  it("keeps Porteurs of active zones, sorted by zone then name", async () => {
    api.zonesActive.mockResolvedValue([
      zone({ id: 2, name: "Sousse" }),
      zone({ id: 1, name: "Ariana" }),
    ]);
    api.supportsAll.mockResolvedValue([
      support({ id: 1, zoneId: 2, zoneName: "Sousse", name: "B" }),
      support({ id: 2, zoneId: 1, zoneName: "Ariana", name: "C" }),
      support({ id: 3, zoneId: 9, zoneName: "Fermée", name: "A" }),
    ]);
    const catalogue = await loadNetworkCatalogue(new AbortController().signal);
    expect(catalogue.zones.map((z) => z.name)).toEqual(["Ariana", "Sousse"]);
    expect(catalogue.supports.map((s) => s.id)).toEqual([2, 1]);
  });
});

describe("network model", () => {
  const supports = [
    support({ id: 1, zoneId: 1, supportType: "ECRAN", technicalStatus: "ACTIF" }),
    support({ id: 2, zoneId: 1, supportType: "PANNEAU_NUMERIQUE", technicalStatus: "MAINTENANCE" }),
    support({ id: 3, zoneId: 2, supportType: "ECRAN", technicalStatus: "ACTIF" }),
  ];

  it("filters supports by zone, type and status", () => {
    expect(filterSupports(supports, { zoneId: "1", type: "", status: "" })).toHaveLength(2);
    expect(filterSupports(supports, { zoneId: "", type: "ECRAN", status: "ACTIF" })).toHaveLength(
      2,
    );
    expect(
      filterSupports(supports, { zoneId: "2", type: "PANNEAU_NUMERIQUE", status: "" }),
    ).toEqual([]);
  });

  it("summarises zones with total and active screens", () => {
    const s = summarizeZones([zone({ id: 1 }), zone({ id: 3 })], supports);
    expect(s.map((z) => [z.zone.id, z.supportCount, z.activeCount])).toEqual([
      [1, 2, 1],
      [3, 0, 0],
    ]);
  });

  it("lists present values in display order and formats coordinates", () => {
    expect(presentValues(["MAINTENANCE", "ACTIF"], ["ACTIF", "INACTIF", "MAINTENANCE"])).toEqual([
      "ACTIF",
      "MAINTENANCE",
    ]);
    expect(formatCoordinates(36.8008, 10.18)).toMatch(/36,8008° N · 10,1800° E/);
  });
});

describe("chart scale", () => {
  it("rounds axis maxima to clean values", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(0.87)).toBe(1);
    expect(niceMax(1234)).toBe(2000);
    expect(niceMax(2400)).toBe(2500);
    expect(niceMax(4100)).toBe(5000);
    expect(niceMax(7000)).toBe(10000);
    expect(axisTicks(5000, 2)).toEqual([0, 2500, 5000]);
    expect(percentOf(250, 1000)).toBe(25);
    expect(percentOf(2000, 1000)).toBe(100);
    expect(percentOf(-1, 1000)).toBe(0);
  });

  it("computes donut arcs with a surface gap between visible segments", () => {
    const arcs = donutArcs([1, 0, 3], 100, 2);
    expect(arcs.map((a) => a.share)).toEqual([0.25, 0, 0.75]);
    expect(arcs[0]).toEqual({ length: 23, offset: 0, share: 0.25 });
    expect(arcs[1]?.length).toBe(0);
    expect(arcs[2]).toEqual({ length: 73, offset: -25, share: 0.75 });
    // a single visible segment closes the ring without a gap
    expect(donutArcs([0, 5], 100, 2)[1]?.length).toBe(100);
    expect(donutArcs([0, 0], 100, 2).every((a) => a.length === 0)).toBe(true);
  });
});

describe("splitTND", () => {
  it("keeps formatTND's digits while separating millimes and currency", () => {
    const parts = splitTND(14700);
    expect(`${parts.integer}${parts.fraction} ${parts.currency}`.replace(/\s/g, " ")).toBe(
      formatTND(14700).replace(/\s/g, " "),
    );
    expect(parts.fraction).toBe("");
    expect(splitTND(14700.5).fraction).toBe(",500");
    expect(parts.currency).toBe("DT");
    expect(splitTND(Number.NaN).integer).toBe("0");
  });
});
