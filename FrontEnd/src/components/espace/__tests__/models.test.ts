import { beforeEach, describe, expect, it, vi } from "vitest";

import { campaign, reservation, support, zone } from "@/components/espace/__tests__/fixtures";
import { axisTicks, donutArcs, niceMax, percentOf } from "@/components/espace/chart-scale";
import {
  loadCampaignsWithReservationsSettled,
  loadReservationsSettled,
  mapWithLimit,
} from "@/components/espace/espace-data";
import type * as Endpoints from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import { clearResourceCache } from "@/lib/resource-cache";
import { splitTND } from "@/components/espace/espace-ui";
import {
  filterSupports,
  formatCoordinates,
  presentValues,
  summarizeZones,
} from "@/components/espace/network-model";
import { formatTND } from "@/lib/format";
import {
  activeScopeFilterCount,
  countByStatus,
  DEFAULT_RESERVATION_SORT,
  filterReservationRows,
  isFiltering,
  joinReservations,
  reservationSortCaption,
  reservationSortValue,
  sortReservationRows,
  zoneOptions,
} from "@/components/espace/reservations-model";
import { sortRows } from "@/components/ui/data-table";

const api = vi.hoisted(() => ({ mine: vi.fn(), byCampaign: vi.fn() }));

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof Endpoints>();
  return {
    ...actual,
    campaignsApi: { ...actual.campaignsApi, mine: api.mine },
    reservationsApi: { ...actual.reservationsApi, byCampaign: api.byCampaign },
  };
});

beforeEach(() => {
  clearResourceCache();
  api.mine.mockReset();
  api.byCampaign.mockReset();
});

describe("reservations model", () => {
  const campaigns = [campaign({ id: 1, name: "Rentrée" }), campaign({ id: 2, name: "Été" })];
  const supports = [support({ id: 10, name: "Écran Bourguiba", zoneName: "Tunis Centre" })];
  const zones = [zone({ id: 1, name: "Tunis Centre" }), zone({ id: 2, name: "La Marsa" })];
  const reservations = [
    reservation({ id: 1, campaignId: 1, supportId: 10, zoneId: 1, startDate: "2026-11-01" }),
    reservation({
      id: 2,
      campaignId: 2,
      supportId: 99,
      zoneId: 2,
      startDate: "2026-10-01",
      reservationStatus: "CONFIRMEE",
    }),
    reservation({ id: 3, campaignId: 2, supportId: 10, zoneId: 1, reservationStatus: "ANNULEE" }),
    reservation({ id: 4, campaignId: 42, supportId: 10, zoneId: 1 }), // not ours
  ];

  it("joins names and falls back to numbered labels", () => {
    const rows = joinReservations(reservations, campaigns, supports, zones);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      campaignName: "Rentrée",
      supportName: "Écran Bourguiba",
      supportType: "ECRAN",
      zoneName: "Tunis Centre",
    });
    expect(rows[1]).toMatchObject({ supportName: "Porteur n° 99", supportType: null });

    const noLookups = joinReservations(reservations, campaigns, null, null);
    expect(noLookups[1]?.zoneName).toBe("Zone n° 2");
  });

  it("filters by status, campaign and zone, and counts by status", () => {
    const rows = joinReservations(reservations, campaigns, supports, zones);
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
    const rows = sortReservationRows(joinReservations(reservations, campaigns, supports, zones));
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
      ],
      campaigns,
      supports,
      zones,
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

describe("settled loaders (partial failure)", () => {
  it("keeps successful reservation lists and records failed campaigns", async () => {
    api.mine.mockResolvedValue([campaign({ id: 1 }), campaign({ id: 2 }), campaign({ id: 3 })]);
    api.byCampaign.mockImplementation((id: number) =>
      id === 2
        ? Promise.reject(new ApiError(502, "Le service TPUB est momentanément indisponible."))
        : Promise.resolve([reservation({ id: id * 10, campaignId: id })]),
    );
    const result = await loadCampaignsWithReservationsSettled(new AbortController().signal);
    expect(result.campaigns.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(result.failedCampaignIds).toEqual([2]);
    expect(result.reservations.map((r) => r.id)).toEqual([10, 30]);
    expect([...result.reservationsByCampaign.keys()]).toEqual([1, 3]);
  });

  it("rejects only when /mine fails", async () => {
    api.mine.mockRejectedValue(new ApiError(502, "Indisponible"));
    await expect(
      loadCampaignsWithReservationsSettled(new AbortController().signal),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("serves successful lists from the 30 s cache and retries only the failures", async () => {
    let fail = true;
    api.byCampaign.mockImplementation((id: number) =>
      id === 2 && fail
        ? Promise.reject(new ApiError(500, "Erreur"))
        : Promise.resolve([reservation({ id, campaignId: id })]),
    );
    const list = [campaign({ id: 1 }), campaign({ id: 2 })];
    const first = await loadReservationsSettled(list, new AbortController().signal);
    expect(first.failedCampaignIds).toEqual([2]);
    fail = false;
    const retry = await loadReservationsSettled(list, new AbortController().signal);
    expect(retry.failedCampaignIds).toEqual([]);
    expect(api.byCampaign.mock.calls.map((c: unknown[]) => c[0] as number)).toEqual([1, 2, 2]);
  });

  it("rethrows aborts", async () => {
    const controller = new AbortController();
    api.byCampaign.mockImplementation(() => new Promise(() => undefined));
    const pending = loadReservationsSettled([campaign({ id: 1 })], controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
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

describe("mapWithLimit", () => {
  it("keeps order and never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, (8 - n) * 2));
      inFlight -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(await mapWithLimit([], 4, (n: number) => Promise.resolve(n))).toEqual([]);
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
