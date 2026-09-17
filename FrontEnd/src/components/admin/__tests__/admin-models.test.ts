import { describe, expect, it } from "vitest";

import { parseDecimal, parseInteger } from "@/components/admin/form-utils";
import {
  activeFilterCount,
  advertiserName,
  applyReasonPreset,
  bulkEligibility,
  bulkSummary,
  canDecide,
  canRunAiCheck,
  formatWaiting,
  joinReservations,
  matchesQuery,
  type ModerationFilterState,
  moderationSearchFilters,
  moderationSortCaption,
  parseModerationTab,
  parsePriority,
  refusalMessage,
  rejectReasonError,
  reviewNeighbours,
  startCue,
  sumEstimatedCost,
  tabCountsFromDashboard,
  validateSequentially,
  validationBody,
  waitingDays,
} from "@/components/admin/moderation-model";
import {
  countSupportsByZone,
  isZoneInUseError,
  supportFormFrom,
  supportSchema,
  zoneFormFrom,
  zoneSchema,
} from "@/components/admin/network-schemas";
import {
  budgetConsumption,
  buildOverviewGroups,
  coherenceWatch,
  decisionQueueFromDashboard,
  emergenciesWatch,
  liveEmergencies,
  porteursWatch,
  summarizeDecisionQueue,
} from "@/components/admin/overview-model";
import { ApiError } from "@/lib/api/errors";
import type {
  CampaignResponse,
  DashboardResponse,
  EmergencyResponse,
  ReservationResponse,
  SupportResponse,
  ZoneResponse,
} from "@/lib/api/types";

function campaign(over: Partial<CampaignResponse>): CampaignResponse {
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
    ...over,
  };
}

const baseFilters: ModerationFilterState = {
  tab: "a-traiter",
  q: "",
  client: "",
  zoneId: null,
  status: null,
  aiStatus: null,
  from: "",
  to: "",
  supportType: null,
  sort: "attente",
  page: 0,
};

describe("moderation model (server search)", () => {
  it("maps tabs and filters to GET /api/campaigns", () => {
    expect(moderationSearchFilters(baseFilters)).toEqual({
      q: undefined,
      client: undefined,
      zoneId: undefined,
      status: ["APPROVED_BY_AI", "REVIEW_REQUIRED"],
      aiStatus: undefined,
      from: undefined,
      to: undefined,
      supportType: undefined,
      sort: "submittedAt,asc",
      page: 0,
      size: 20,
    });
    // The status filter only applies on « Toutes »; a single date bound becomes a one-day range.
    expect(
      moderationSearchFilters({
        ...baseFilters,
        tab: "revue",
        status: "ACTIVE",
        q: "  soldes ",
        client: "Café",
        zoneId: 4,
        aiStatus: "REVIEW_REQUIRED",
        from: "2026-10-01",
        supportType: "ECRAN",
        sort: "budget",
        page: 2,
      }),
    ).toMatchObject({
      q: "soldes",
      client: "Café",
      zoneId: 4,
      status: ["REVIEW_REQUIRED"],
      aiStatus: ["REVIEW_REQUIRED"],
      from: "2026-10-01",
      to: "2026-10-01",
      supportType: ["ECRAN"],
      sort: "budget,desc",
      page: 2,
    });
    expect(
      moderationSearchFilters({ ...baseFilters, tab: "toutes", status: "BLOCKED" }).status,
    ).toEqual(["BLOCKED"]);
    expect(moderationSearchFilters({ ...baseFilters, tab: "toutes" }).status).toBeUndefined();
    expect(
      activeFilterCount({
        ...baseFilters,
        tab: "revue",
        status: "ACTIVE",
        client: "x",
        to: "2026-10-02",
      }),
    ).toBe(2);
    expect(moderationSortCaption("debut")).toBe("début le plus proche");
  });

  it("parses ?onglet= with the legacy value and counts tabs from the dashboard", () => {
    expect(parseModerationTab("analyse")).toBe("ia");
    expect(parseModerationTab("nope")).toBe("a-traiter");
    expect(
      tabCountsFromDashboard({
        totalCampaigns: 40,
        aiPendingCampaigns: 3,
        approvedByAiCampaigns: 2,
        reviewRequiredCampaigns: 5,
      }),
    ).toEqual({ "a-traiter": 7, revue: 5, ia: 3, toutes: 40 });
  });

  it("allows decisions after the AI check and a re-run on pending or reviewable campaigns", () => {
    expect(canDecide("APPROVED_BY_AI")).toBe(true);
    expect(canDecide("REVIEW_REQUIRED")).toBe(true);
    expect(canDecide("PENDING_AI_CHECK")).toBe(false);
    expect(canRunAiCheck("PENDING_AI_CHECK")).toBe(true);
    expect(canRunAiCheck("REVIEW_REQUIRED")).toBe(true);
    expect(canRunAiCheck("ACTIVE")).toBe(false);
  });

  it("requires the explicit override for REVIEW_REQUIRED and validates comment and priority", () => {
    const review = campaign({ status: "REVIEW_REQUIRED" });
    expect(validationBody(review, { comment: "", priority: "", override: false })).toMatchObject({
      ok: false,
      field: "override",
    });
    expect(validationBody(review, { comment: " ok ", priority: "7", override: true })).toEqual({
      ok: true,
      body: { overrideAi: true, comment: "ok", priorityScore: 7 },
    });
    const approved = campaign({ status: "APPROVED_BY_AI" });
    expect(validationBody(approved, { comment: "", priority: "", override: false })).toEqual({
      ok: true,
      body: { comment: null },
    });
    expect(
      validationBody(approved, { comment: "", priority: "11", override: false }),
    ).toMatchObject({ ok: false, field: "priority" });
    expect(parsePriority("")).toBeNull();
    expect(parsePriority("0")).toBe(0);
    expect(parsePriority("-1")).toBeNaN();
    expect(parsePriority("3.5")).toBeNaN();
  });

  it("checks the refusal reason (3..1000) and appends presets once", () => {
    expect(rejectReasonError("")).toBe("Indiquez le motif du refus.");
    expect(rejectReasonError(" ab ")).toBe("Au moins 3 caractères.");
    expect(rejectReasonError("abc")).toBeNull();
    expect(rejectReasonError("x".repeat(1001))).toBe("1000 caractères maximum.");
    const once = applyReasonPreset("Visuel flou.", "Objectif trop vague");
    expect(once).toBe("Visuel flou ; Objectif trop vague");
    expect(applyReasonPreset(once, "objectif trop vague")).toBe(once);
    const msg = refusalMessage({ id: 7, name: "Soldes" }, " Visuel flou ");
    expect(msg).toContain("CAMP-00007");
    expect(msg).toContain("Motif : Visuel flou");
  });

  it("restricts bulk validation to APPROVED_BY_AI campaigns holding a reservation", async () => {
    expect(
      bulkEligibility({ status: "APPROVED_BY_AI", aiStatus: "APPROVED", reservationsCount: 2 }),
    ).toBe("eligible");
    expect(
      bulkEligibility({ status: "APPROVED_BY_AI", aiStatus: "APPROVED", reservationsCount: 0 }),
    ).toBe("no-slot");
    expect(
      bulkEligibility({
        status: "REVIEW_REQUIRED",
        aiStatus: "REVIEW_REQUIRED",
        reservationsCount: 1,
      }),
    ).toBe("not-approved");
    const results = await validateSequentially([1, 2, 3], (id) =>
      id === 2 ? Promise.reject(new Error("x")) : Promise.resolve(campaign({ id })),
    );
    expect(bulkSummary(results)).toBe("2 validées · 1 échec : #2");
  });

  it("finds neighbours and the next campaign awaiting a decision", () => {
    const rows = [
      campaign({ id: 1, status: "APPROVED_BY_AI" }),
      campaign({ id: 2, status: "ACTIVE" }),
      campaign({ id: 3, status: "REVIEW_REQUIRED" }),
    ];
    expect(reviewNeighbours(rows, 1)).toMatchObject({
      index: 0,
      previous: null,
      next: 2,
      nextDecidable: 3,
      remaining: 1,
    });
    expect(reviewNeighbours(rows, 3)).toMatchObject({ next: null, nextDecidable: 1 });
  });

  it("names advertisers, searches without accents and computes waiting and start cues", () => {
    expect(advertiserName(campaign({ clientId: 3, clientCompanyName: " Café Démo " }))).toBe(
      "Café Démo",
    );
    expect(advertiserName(campaign({ clientId: 3, clientName: "Salma" }))).toBe("Salma");
    expect(advertiserName(campaign({ clientId: 3 }))).toBe("Annonceur n° 3");
    expect(matchesQuery(campaign({ id: 12, name: "Promo Été" }), "ete")).toBe(true);
    expect(matchesQuery(campaign({ id: 12 }), "#12")).toBe(true);
    const now = new Date("2026-09-10T12:00:00Z");
    expect(formatWaiting(waitingDays(campaign({ submittedAt: "2026-09-08T10:00:00Z" }), now))).toBe(
      "Depuis 2 jours",
    );
    expect(startCue("2026-09-11", "2026-09-10")).toMatchObject({
      label: "Commence demain",
      tone: "warning",
    });
    expect(startCue("2026-09-08", "2026-09-10")).toMatchObject({ tone: "danger" });
    expect(startCue(null, "2026-09-10").days).toBeNull();
  });

  it("uses v2 reservation names and sums only holding reservations", () => {
    const r = (over: Partial<ReservationResponse>): ReservationResponse => ({
      id: 1,
      campaignId: 1,
      zoneId: 2,
      supportId: 9,
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      startTime: "08:00:00",
      endTime: "12:00:00",
      availabilityStatus: "RESERVE",
      reservationStatus: "TEMPORAIRE",
      estimatedViews: 100,
      estimatedCost: 12.5,
      ...over,
    });
    const rows = joinReservations(
      [r({ supportName: "Porteur Lac", zoneName: "Lac" }), r({ id: 2 })],
      [{ id: 9, name: "Ancien nom", zoneName: "Z" } as SupportResponse],
    );
    expect(rows[0]).toMatchObject({ supportName: "Porteur Lac", zoneName: "Lac" });
    expect(rows[1]).toMatchObject({ supportName: "Ancien nom", zoneName: "Z" });
    expect(
      sumEstimatedCost([
        r({}),
        r({ reservationStatus: "ANNULEE" }),
        r({ reservationStatus: "CONFIRMEE", estimatedCost: 7.5 }),
      ]),
    ).toBe(20);
  });
});

describe("network schemas", () => {
  it("accepts comma decimals and rounds to the DB precision", () => {
    const r = zoneSchema.safeParse({
      name: " Tunis Centre ",
      latitude: "36,80080004",
      longitude: "10.18",
      radiusKm: "2,5",
      isActive: true,
    });
    expect(r.success && r.data).toEqual({
      name: "Tunis Centre",
      latitude: 36.8008,
      longitude: 10.18,
      radiusKm: 2.5,
      isActive: true,
    });
  });

  it("validates latitude, longitude and radius bounds", () => {
    const r = zoneSchema.safeParse({
      name: "",
      latitude: "91",
      longitude: "-181",
      radiusKm: "0",
      isActive: false,
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const paths = r.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["name", "latitude", "longitude", "radiusKm"]));
    expect(
      zoneSchema.safeParse({ ...zoneFormFrom(null), name: "Z", latitude: "abc", longitude: "10" })
        .success,
    ).toBe(false);
    expect(
      zoneSchema.safeParse({
        ...zoneFormFrom(null),
        name: "Z",
        latitude: "0",
        longitude: "0",
        radiusKm: "",
      }).success,
    ).toBe(true);
  });

  it("builds a support body with defaults", () => {
    const r = supportSchema.safeParse({
      zoneId: "1",
      name: "Écran LED",
      supportType: "ECRAN",
      latitude: "36.7998",
      longitude: "10.1817",
      technicalStatus: "MAINTENANCE",
      diffusionCapacity: "",
    });
    expect(r.success && r.data).toMatchObject({
      zoneId: 1,
      diffusionCapacity: 1,
      technicalStatus: "MAINTENANCE",
    });
    expect(
      supportSchema.safeParse({
        zoneId: "",
        name: "x",
        supportType: "ECRAN",
        latitude: "1",
        longitude: "1",
        technicalStatus: "ACTIF",
        diffusionCapacity: "0",
      }).success,
    ).toBe(false);
  });

  it("recognises the FK violation on zone delete", () => {
    expect(
      isZoneInUseError(
        new ApiError(400, "x", { rawMessage: "Invalid data — check dates and times format" }),
      ),
    ).toBe(true);
    expect(isZoneInUseError(new ApiError(404, "x", { rawMessage: "Zone not found: 3" }))).toBe(
      false,
    );
    expect(
      countSupportsByZone([{ zoneId: 1 }, { zoneId: 1 }, { zoneId: 2 }] as SupportResponse[]).get(
        1,
      ),
    ).toBe(2);
  });

  it("parses numbers strictly", () => {
    expect(parseDecimal("-10,5")).toBe(-10.5);
    expect(parseDecimal("1e3")).toBeNull();
    expect(parseInteger("12")).toBe(12);
    expect(parseInteger("12.0")).toBeNull();
  });
});

describe("support schema v2", () => {
  it("accepts an optional visibility score 0..100", () => {
    const base = {
      ...supportFormFrom(null),
      zoneId: "1",
      name: "P",
      latitude: "36.8",
      longitude: "10.1",
    };
    expect(
      supportSchema.safeParse({ ...base, visibilityScore: "" }).data?.visibilityScore,
    ).toBeNull();
    expect(supportSchema.safeParse({ ...base, visibilityScore: "80" }).data?.visibilityScore).toBe(
      80,
    );
    expect(supportSchema.safeParse({ ...base, visibilityScore: "101" }).success).toBe(false);
    expect(supportFormFrom({ visibilityScore: 35 } as SupportResponse).visibilityScore).toBe("35");
    expect(isZoneInUseError(new ApiError(409, "x", { code: "ZONE_IN_USE" }))).toBe(true);
  });
});

describe("overview model (dashboard v2)", () => {
  const d: DashboardResponse = {
    totalCampaigns: 12,
    activeCampaigns: 3,
    pendingCampaigns: 5,
    aiPendingCampaigns: 1,
    aiRejectedCampaigns: 1,
    availableSupports: 4,
    confirmedReservations: 6,
    totalViews: 5321,
    estimatedBudget: 2000,
    consumedBudget: 250,
    approvedByAiCampaigns: 2,
    reviewRequiredCampaigns: 2,
    aiFlaggedCampaigns: 3,
    supportsByStatus: { ACTIF: 4, MAINTENANCE: 1, HORS_LIGNE: 1, INACTIF: 0 },
    totalSupports: 6,
  };

  it("shows every CdC §6 figure, grouped, with honest labels", () => {
    const groups = buildOverviewGroups(d);
    expect(groups.map((g) => g.id)).toEqual([
      "campagnes",
      "ia",
      "reseau",
      "reservations",
      "diffusion",
      "budgets",
    ]);
    const items = groups.flatMap((g) => g.items);
    for (const key of [
      "totalCampaigns",
      "activeCampaigns",
      "pendingCampaigns",
      "aiPendingCampaigns",
      "aiFlaggedCampaigns",
      "availableSupports",
      "confirmedReservations",
      "totalViews",
      "estimatedBudget",
      "consumedBudget",
    ] as const) {
      expect(items.some((i) => i.key === key)).toBe(true);
    }
    expect(items.find((i) => i.key === "aiFlaggedCampaigns")?.label).toBe(
      "Refusées ou signalées par l'IA",
    );
    expect(items.find((i) => i.key === "outOfServiceSupports")).toMatchObject({
      value: 2,
      accent: "warning",
    });
    expect(items.find((i) => i.key === "simulatedRevenue")?.source).toContain("simulés");
    for (const item of items) expect(item.label.toLowerCase()).not.toMatch(/audience/);
    // Missing v2 counters are zero and dimmed, never invented.
    expect(items.find((i) => i.key === "expiredReservations")).toMatchObject({
      value: 0,
      dimmed: true,
    });
  });

  it("summarises the decision queue from the list or the counters", () => {
    expect(decisionQueueFromDashboard(d)).toMatchObject({
      total: 4,
      breakdown: "2 avis IA favorables · 2 revues manuelles",
    });
    expect(
      summarizeDecisionQueue([
        campaign({ status: "APPROVED_BY_AI" }),
        campaign({ status: "REVIEW_REQUIRED" }),
        campaign({ status: "ACTIVE" }),
      ]),
    ).toMatchObject({ total: 2, breakdown: "1 avis IA favorable · 1 revue manuelle" });
  });

  it("compares the estimated and consumed budgets", () => {
    expect(budgetConsumption(d)).toMatchObject({
      ratio: 0.125,
      label: "12,5 % du budget estimé consommé",
    });
    expect(budgetConsumption({ estimatedBudget: 0, consumedBudget: 0 })).toMatchObject({
      ratio: null,
      label: "Aucun budget engagé",
    });
  });

  it("builds « À surveiller » and the live messages strip", () => {
    const zones = [
      { id: 1, name: "Z", isActive: true, latitude: 36.8, longitude: 10.18, radiusKm: null },
    ] as ZoneResponse[];
    const supports = [
      {
        id: 7,
        zoneId: 1,
        zoneName: "Z",
        name: "P",
        supportType: "ECRAN",
        latitude: 36.8,
        longitude: 10.18,
        technicalStatus: "MAINTENANCE",
        diffusionCapacity: 1,
        porteurType: "A",
        headingDeg: 90,
      },
    ] as SupportResponse[];
    expect(porteursWatch(supports)).toMatchObject({ count: 1, tone: "warning" });
    expect(coherenceWatch(zones, supports).href).toBe(
      "/admin/reseau?onglet=ecrans&panneau=coherence",
    );
    const msg = (over: Partial<EmergencyResponse>): EmergencyResponse => ({
      id: 1,
      title: "Route",
      content: "Déviation",
      zoneId: 1,
      startDate: "2026-09-10",
      endDate: "2026-09-20",
      startTime: "00:00:00",
      endTime: "23:59:59",
      priority: 1,
      urgencyLevel: "HIGH",
      isActive: true,
      ...over,
    });
    const now = new Date("2026-09-13T10:00:00Z");
    const list = [
      msg({ id: 1, state: "EN_COURS" }),
      msg({ id: 2, state: "PROGRAMME" }),
      msg({ id: 3, state: "TERMINE" }),
    ];
    expect(emergenciesWatch(list, now)).toMatchObject({
      count: 2,
      detail: "1 en cours · 1 programmé",
      tone: "warning",
    });
    expect(liveEmergencies([...list].reverse(), now).map((m) => m.id)).toEqual([1, 2]);
  });
});
