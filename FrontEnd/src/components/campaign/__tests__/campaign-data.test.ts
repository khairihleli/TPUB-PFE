import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mine: vi.fn(),
  byCampaign: vi.fn(),
  report: vi.fn(),
  checkContent: vi.fn(),
  submit: vi.fn(),
  supportsAll: vi.fn(),
  zonesAll: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: { mine: mocks.mine, submit: mocks.submit },
  reservationsApi: { byCampaign: mocks.byCampaign },
  aiApi: { report: mocks.report, checkContent: mocks.checkContent },
  supportsApi: { all: mocks.supportsAll },
  zonesApi: { all: mocks.zonesAll, active: vi.fn() },
}));

import {
  activeReservations,
  buildScreenCatalogue,
  campaignReference,
  CampaignNotFoundError,
  joinReservations,
  loadAiReportState,
  loadCampaignDetail,
  loadCampaignWithReservations,
  loadOwnedCampaign,
  PENDING_POLL_MS,
  pollIntervalFor,
  REVIEW_POLL_MS,
  sumEstimatedCost,
} from "@/components/campaign/campaign-data";
import {
  countByFilter,
  DEFAULT_CAMPAIGN_SORT,
  filterCampaigns,
  lastActivityAt,
  matchesSearch,
  parseCampaignSort,
  parseFilter,
  serializeCampaignSort,
  sortCampaigns,
} from "@/components/campaign/campaign-list-model";
import { ApiError } from "@/lib/api/errors";
import type {
  CampaignResponse,
  ReservationResponse,
  SupportResponse,
  ZoneResponse,
} from "@/lib/api/types";
import { clearResourceCache, getCached, resourceKeys } from "@/lib/resource-cache";

const signal = new AbortController().signal;

function campaign(partial: Partial<CampaignResponse>): CampaignResponse {
  return {
    id: 1,
    clientId: 1,
    name: "Campagne",
    objective: null,
    budget: 1000,
    consumedBudget: 0,
    status: "BROUILLON",
    aiStatus: null,
    adminStatus: null,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    startTime: "08:00:00",
    endTime: "22:00:00",
    estimatedViews: 0,
    priorityScore: 0,
    createdAt: "2026-09-01T10:00:00Z",
    submittedAt: null,
    validatedAt: null,
    ...partial,
  };
}

function reservation(partial: Partial<ReservationResponse>): ReservationResponse {
  return {
    id: 1,
    campaignId: 1,
    zoneId: 10,
    supportId: 100,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    startTime: "08:00:00",
    endTime: "22:00:00",
    availabilityStatus: "RESERVE",
    reservationStatus: "TEMPORAIRE",
    estimatedViews: 1000,
    estimatedCost: 100,
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearResourceCache();
});

describe("ownership (contract §7.16)", () => {
  it("returns the campaign only when it belongs to /campaigns/mine", async () => {
    mocks.mine.mockResolvedValue([campaign({ id: 4 }), campaign({ id: 9 })]);
    await expect(loadOwnedCampaign(9, signal)).resolves.toMatchObject({ id: 9 });
    // /mine primes the shared cache (list, badges, palette, not-found suggestions)
    expect(getCached<CampaignResponse[]>(resourceKeys.campaignsMine)?.data).toHaveLength(2);
  });

  it("refuses an id that is not in /mine, without calling other endpoints", async () => {
    mocks.mine.mockResolvedValue([campaign({ id: 4 })]);
    await expect(loadCampaignWithReservations(77, signal)).rejects.toBeInstanceOf(
      CampaignNotFoundError,
    );
    expect(mocks.byCampaign).not.toHaveBeenCalled();
  });

  it("refuses a missing id", async () => {
    await expect(loadOwnedCampaign(null, signal)).rejects.toBeInstanceOf(CampaignNotFoundError);
    expect(mocks.mine).not.toHaveBeenCalled();
  });
});

describe("AI report state", () => {
  it("treats 400 « No AI report found » as not analysed yet", async () => {
    mocks.report.mockRejectedValue(
      new ApiError(400, "Aucune analyse", { rawMessage: "No AI report found for campaign: 3" }),
    );
    await expect(loadAiReportState(3, signal)).resolves.toEqual({ kind: "none" });
  });

  it("keeps other errors as a section error (never a page error)", async () => {
    const error = new ApiError(502, "Indisponible");
    mocks.report.mockRejectedValue(error);
    await expect(loadAiReportState(3, signal)).resolves.toEqual({ kind: "error", error });
  });

  it("never calls GET /ai/report for a draft (FLOW-18, FFA-16)", async () => {
    await expect(loadAiReportState({ id: 3, status: "BROUILLON" }, signal)).resolves.toEqual({
      kind: "none",
    });
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("loads the detail of a draft without the AI report request", async () => {
    mocks.mine.mockResolvedValue([campaign({ id: 3, status: "BROUILLON" })]);
    mocks.byCampaign.mockResolvedValue([reservation({ campaignId: 3 })]);
    mocks.supportsAll.mockResolvedValue([]);
    mocks.zonesAll.mockResolvedValue([]);
    const data = await loadCampaignDetail(3, signal);
    expect(data.ai).toEqual({ kind: "none" });
    expect(data.reservations).toHaveLength(1);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("still asks for the report once submitted", async () => {
    mocks.mine.mockResolvedValue([campaign({ id: 3, status: "PENDING_AI_CHECK" })]);
    mocks.byCampaign.mockResolvedValue([]);
    mocks.supportsAll.mockResolvedValue([]);
    mocks.zonesAll.mockResolvedValue([]);
    mocks.report.mockRejectedValue(
      new ApiError(400, "Aucune analyse", { rawMessage: "No AI report found for campaign: 3" }),
    );
    await expect(loadCampaignDetail(3, signal)).resolves.toMatchObject({ ai: { kind: "none" } });
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it("returns the report", async () => {
    const report = {
      campaignId: 3,
      aiStatus: "APPROVED",
      riskScore: 20,
      qualityScore: 75,
      detectedIssues: [],
      recommendation: "Contenu conforme pour diffusion",
    };
    mocks.report.mockResolvedValue(report);
    await expect(loadAiReportState(3, signal)).resolves.toEqual({ kind: "report", report });
  });
});

describe("joins and aggregates", () => {
  const supports = new Map<number, SupportResponse>([
    [
      100,
      {
        id: 100,
        zoneId: 10,
        zoneName: "Tunis Centre",
        name: "Écran LED Avenue",
        supportType: "ECRAN",
        latitude: 0,
        longitude: 0,
        technicalStatus: "ACTIF",
        diffusionCapacity: 6,
      },
    ],
  ]);
  const zones = new Map<number, ZoneResponse>([
    [10, { id: 10, name: "Tunis Centre", latitude: 0, longitude: 0, radiusKm: 3, isActive: true }],
  ]);

  it("joins reservation with Porteur and zone names, with honest fallbacks", () => {
    const [known, unknown] = joinReservations(
      [reservation({ id: 1 }), reservation({ id: 2, supportId: 555, zoneId: 66 })],
      { supports, zones },
    );
    expect(known).toMatchObject({
      supportName: "Écran LED Avenue",
      zoneName: "Tunis Centre",
      supportType: "ECRAN",
    });
    expect(unknown).toMatchObject({
      supportName: "Porteur n° 555",
      zoneName: "Zone n° 66",
      supportType: null,
    });
  });

  it("degrades names when lookups failed", () => {
    const [r] = joinReservations([reservation({})], { supports: null, zones: null });
    expect(r?.supportName).toBe("Porteur n° 100");
  });

  it("sums estimated cost of reservations that still hold a Porteur", () => {
    const list = [
      reservation({ id: 1, estimatedCost: 250 }),
      reservation({ id: 2, estimatedCost: 250, reservationStatus: "CONFIRMEE" }),
      reservation({ id: 3, estimatedCost: 250, reservationStatus: "ANNULEE" }),
    ];
    expect(sumEstimatedCost(activeReservations(list))).toBe(500);
    expect(sumEstimatedCost([reservation({ estimatedCost: Number.NaN })])).toBe(0);
  });

  it("keeps only ACTIF screens located in active zones", () => {
    const catalogue = buildScreenCatalogue(
      [
        { id: 2, name: "Sousse", latitude: 0, longitude: 0, radiusKm: null, isActive: true },
        { id: 1, name: "Ariana", latitude: 0, longitude: 0, radiusKm: null, isActive: true },
      ],
      [
        { ...supports.get(100)!, id: 1, zoneId: 1, name: "B" },
        { ...supports.get(100)!, id: 2, zoneId: 1, name: "A", technicalStatus: "MAINTENANCE" },
        { ...supports.get(100)!, id: 3, zoneId: 99, name: "C" },
        { ...supports.get(100)!, id: 4, zoneId: 2, name: "D" },
      ],
    );
    expect(catalogue.zones.map((z) => z.name)).toEqual(["Ariana", "Sousse"]);
    expect(catalogue.screens.map((s) => s.id)).toEqual([1, 4]);
    // the map shows every Porteur of the open zones (non-ACTIF included), never other zones
    expect(catalogue.network.map((s) => s.id)).toEqual([2, 1, 4]);
  });
});

describe("list model", () => {
  const TODAY = "2026-09-13";
  const list = [
    campaign({ id: 1, name: "Été à La Marsa", status: "BROUILLON" }),
    campaign({ id: 2, name: "Rentrée", status: "REVIEW_REQUIRED" }),
    campaign({ id: 3, name: "Soldes", status: "REJECTED_BY_AI" }),
    // ACTIVE with a future start date: « Programmée », in the « Validées » tab
    campaign({ id: 4, name: "Festival", status: "ACTIVE" }),
    campaign({ id: 5, name: "Marché", status: "BLOCKED" }),
    // ACTIVE whose end date passed: « Terminée »
    campaign({
      id: 6,
      name: "Braderie",
      status: "ACTIVE",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    }),
  ];

  it("searches by name, accent and case insensitive", () => {
    expect(matchesSearch(list[0]!, "ete a la")).toBe(true);
    expect(matchesSearch(list[0]!, "  MARSA ")).toBe(true);
    expect(matchesSearch(list[0]!, "sousse")).toBe(false);
  });

  it("counts per status tab, with derived states", () => {
    expect(countByFilter(list, TODAY)).toEqual({
      toutes: 6,
      "a-finaliser": 2,
      "en-examen": 1,
      validees: 1,
      terminees: 2,
    });
  });

  it("combines tab and search, and maps legacy tab values", () => {
    expect(filterCampaigns(list, "a-finaliser", "", TODAY).map((c) => c.id)).toEqual([1, 3]);
    expect(filterCampaigns(list, "validees", "", TODAY).map((c) => c.id)).toEqual([4]);
    expect(filterCampaigns(list, "terminees", "marche", TODAY).map((c) => c.id)).toEqual([5]);
    // legacy ?statut=refusees → « Terminées & refusées »; REJECTED_BY_AI is « À finaliser »
    expect(filterCampaigns(list, "refusees", "", TODAY).map((c) => c.id)).toEqual([5, 6]);
    expect(filterCampaigns(list, "brouillons", "", TODAY).map((c) => c.id)).toEqual([1, 3]);
  });

  it("parses the ?statut= param safely", () => {
    expect(parseFilter("brouillons")).toBe("a-finaliser");
    expect(parseFilter("validation")).toBe("en-examen");
    expect(parseFilter("diffusion")).toBe("validees");
    expect(parseFilter("en-examen")).toBe("en-examen");
    expect(parseFilter("inconnu")).toBe("toutes");
    expect(parseFilter(null)).toBe("toutes");
  });

  it("parses and serializes ?tri= (default omitted)", () => {
    expect(parseCampaignSort(null)).toEqual(DEFAULT_CAMPAIGN_SORT);
    expect(parseCampaignSort("debut")).toEqual({ key: "debut", dir: "asc" });
    expect(parseCampaignSort("-nom")).toEqual({ key: "nom", dir: "desc" });
    expect(parseCampaignSort("budget")).toEqual(DEFAULT_CAMPAIGN_SORT);
    expect(serializeCampaignSort({ key: "maj", dir: "desc" })).toBe("");
    expect(serializeCampaignSort({ key: "debut", dir: "desc" })).toBe("-debut");
  });

  it("uses the latest real timestamp as « mise à jour »", () => {
    expect(
      lastActivityAt(
        campaign({ createdAt: "2026-09-01T10:00:00Z", submittedAt: "2026-09-05T10:00:00Z" }),
      ),
    ).toBe("2026-09-05T10:00:00Z");
    expect(lastActivityAt(campaign({ createdAt: "2026-09-01T10:00:00Z" }))).toBe(
      "2026-09-01T10:00:00Z",
    );
  });

  it("sorts by start date (nulls last), name and last activity", () => {
    const items = [
      campaign({ id: 1, name: "Bêta", startDate: "2026-11-01", createdAt: "2026-09-01T00:00:00Z" }),
      campaign({ id: 2, name: "alpha", startDate: null, createdAt: "2026-09-03T00:00:00Z" }),
      campaign({
        id: 3,
        name: "Gamma",
        startDate: "2026-10-01",
        createdAt: "2026-08-01T00:00:00Z",
        validatedAt: "2026-09-10T00:00:00Z",
      }),
    ];
    expect(sortCampaigns(items, { key: "debut", dir: "asc" }).map((c) => c.id)).toEqual([3, 1, 2]);
    expect(sortCampaigns(items, { key: "debut", dir: "desc" }).map((c) => c.id)).toEqual([1, 3, 2]);
    expect(sortCampaigns(items, { key: "nom", dir: "asc" }).map((c) => c.id)).toEqual([2, 1, 3]);
    expect(sortCampaigns(items, { key: "maj", dir: "desc" }).map((c) => c.id)).toEqual([3, 2, 1]);
  });
});

describe("status freshness", () => {
  it("polls every 10 s while the AI check is pending, only within the 2-minute window", () => {
    expect(pollIntervalFor("PENDING_AI_CHECK")).toBe(PENDING_POLL_MS);
    expect(pollIntervalFor("PENDING_AI_CHECK", { pendingWindowOver: true })).toBeNull();
  });

  it("polls every 60 s while waiting for TPUB, never otherwise", () => {
    expect(pollIntervalFor("APPROVED_BY_AI")).toBe(REVIEW_POLL_MS);
    expect(pollIntervalFor("REVIEW_REQUIRED")).toBe(REVIEW_POLL_MS);
    for (const s of ["BROUILLON", "REJECTED_BY_AI", "ACTIVE", "BLOCKED", "TERMINATED"] as const) {
      expect(pollIntervalFor(s)).toBeNull();
    }
  });

  it("formats the campaign reference", () => {
    expect(campaignReference(7)).toBe("CAMP-00007");
  });
});
