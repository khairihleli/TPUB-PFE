import { describe, expect, it } from "vitest";

import { parseDecimal, parseInteger } from "@/components/admin/form-utils";
import {
  applyReasonPreset,
  bulkEligibility,
  bulkSummary,
  canDecide,
  countByTab,
  DEFAULT_MODERATION_SORT,
  filterCampaigns,
  formatWaiting,
  joinReservations,
  matchesQuery,
  moderationSortCaption,
  parseModerationTab,
  refusalMessage,
  reviewNeighbours,
  sortQueue,
  startCue,
  sumEstimatedCost,
  validateSequentially,
  validationWillNotAir,
  waitingDays,
} from "@/components/admin/moderation-model";
import {
  countSupportsByZone,
  isZoneInUseError,
  supportSchema,
  zoneFormFrom,
  zoneSchema,
} from "@/components/admin/network-schemas";
import {
  buildOverviewGroups,
  coherenceWatch,
  emergenciesWatch,
  porteursWatch,
  summarizeDecisionQueue,
} from "@/components/admin/overview-model";
import { ApiError } from "@/lib/api/errors";
import type {
  CampaignResponse,
  DashboardResponse,
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

describe("moderation model", () => {
  const list = [
    campaign({
      id: 1,
      status: "APPROVED_BY_AI",
      aiStatus: "APPROVED",
      submittedAt: "2026-09-05T08:00:00Z",
      createdAt: "2026-09-04T08:00:00Z",
    }),
    campaign({
      id: 2,
      name: "Promo Été gratuit",
      status: "REVIEW_REQUIRED",
      aiStatus: "REVIEW_REQUIRED",
      submittedAt: "2026-09-02T08:00:00Z",
      createdAt: "2026-09-02T07:00:00Z",
    }),
    campaign({
      id: 3,
      status: "PENDING_AI_CHECK",
      submittedAt: "2026-09-06T08:00:00Z",
      createdAt: "2026-09-06T07:00:00Z",
    }),
    campaign({ id: 4, status: "ACTIVE", createdAt: "2026-09-10T07:00:00Z" }),
    campaign({ id: 5, status: "BROUILLON", createdAt: "2026-09-11T07:00:00Z" }),
  ];

  it("queues APPROVED_BY_AI and REVIEW_REQUIRED, oldest submission first", () => {
    expect(filterCampaigns(list, "a-traiter", "").map((c) => c.id)).toEqual([2, 1]);
    expect(filterCampaigns(list, "revue", "").map((c) => c.id)).toEqual([2]);
    expect(filterCampaigns(list, "ia", "").map((c) => c.id)).toEqual([3]);
    // « Attente la plus longue » is the default order on every tab (caption is truthful).
    expect(filterCampaigns(list, "toutes", "").map((c) => c.id)).toEqual([2, 1, 3, 4, 5]);
    expect(
      filterCampaigns(list, "toutes", "", { key: "attente", dir: "desc" }).map((c) => c.id),
    ).toEqual([5, 4, 3, 1, 2]);
    expect(countByTab(list)).toEqual({ "a-traiter": 2, revue: 1, ia: 1, toutes: 5 });
  });

  it("parses ?onglet= with the legacy value and sorts by nearest start", () => {
    expect(parseModerationTab("analyse")).toBe("ia");
    expect(parseModerationTab("revue")).toBe("revue");
    expect(parseModerationTab("nimporte")).toBe("a-traiter");
    const rows = [
      campaign({ id: 1, startDate: "2026-10-20" }),
      campaign({ id: 2, startDate: null }),
      campaign({ id: 3, startDate: "2026-09-15" }),
    ];
    expect(sortQueue(rows, { key: "debut", dir: "asc" }).map((c) => c.id)).toEqual([3, 1, 2]);
    expect(sortQueue(rows, { key: "debut", dir: "desc" }).map((c) => c.id)).toEqual([1, 3, 2]);
    expect(moderationSortCaption({ key: "debut", dir: "asc" })).toBe("début le plus proche");
    expect(moderationSortCaption(DEFAULT_MODERATION_SORT)).toBe("attente la plus longue");
  });

  it("keeps the campaign under review in place after it left the tab", () => {
    const decided = list.map((c) => (c.id === 2 ? { ...c, status: "BLOCKED" as const } : c));
    expect(filterCampaigns(decided, "a-traiter", "").map((c) => c.id)).toEqual([1]);
    expect(filterCampaigns(decided, "a-traiter", "", undefined, 2).map((c) => c.id)).toEqual([
      2, 1,
    ]);
  });

  it("gives the start-date urgency tone", () => {
    const today = "2026-09-13";
    expect(startCue("2026-09-12", today)).toMatchObject({ tone: "danger", days: -1 });
    expect(startCue("2026-09-13", today)).toMatchObject({
      tone: "warning",
      label: "Commence aujourd'hui",
    });
    expect(startCue("2026-09-15", today)).toMatchObject({ tone: "warning", label: "Dans 2 j" });
    expect(startCue("2026-09-16", today)).toMatchObject({ tone: "neutral", label: "Dans 3 j" });
    expect(startCue(null, today)).toMatchObject({ tone: "neutral", days: null });
  });

  it("finds the neighbours and the next campaign awaiting a decision", () => {
    const rows = [
      { id: 1, status: "APPROVED_BY_AI" as const },
      { id: 2, status: "ACTIVE" as const },
      { id: 3, status: "REVIEW_REQUIRED" as const },
    ];
    expect(reviewNeighbours(rows, 1)).toMatchObject({
      index: 0,
      previous: null,
      next: 2,
      nextDecidable: 3,
      remaining: 1,
    });
    expect(reviewNeighbours(rows, 3)).toMatchObject({ previous: 2, next: null, nextDecidable: 1 });
    expect(reviewNeighbours([{ id: 1, status: "APPROVED_BY_AI" as const }], 1)).toMatchObject({
      nextDecidable: null,
      remaining: 0,
    });
  });

  it("restricts bulk validation and summarises results", async () => {
    const approved = { status: "APPROVED_BY_AI" as const, aiStatus: "APPROVED" as const };
    const slot = (reservationStatus: ReservationResponse["reservationStatus"]) => ({
      state: "ready" as const,
      list: [{ reservationStatus }],
    });
    expect(bulkEligibility(approved, slot("TEMPORAIRE"))).toBe("eligible");
    expect(bulkEligibility(approved, slot("ANNULEE"))).toBe("no-slot");
    expect(bulkEligibility(approved, { state: "error" })).toBe("unknown");
    expect(
      bulkEligibility(
        { status: "REVIEW_REQUIRED", aiStatus: "REVIEW_REQUIRED" },
        slot("TEMPORAIRE"),
      ),
    ).toBe("not-approved");

    const order: number[] = [];
    const results = await validateSequentially([4, 5, 6], (id) => {
      order.push(id);
      return id === 5 ? Promise.reject(new Error("x")) : Promise.resolve(campaign({ id }));
    });
    expect(order).toEqual([4, 5, 6]);
    expect(bulkSummary(results)).toBe("2 validées · 1 échec : #5");
    expect(bulkSummary([{ id: 1, ok: true }])).toBe("1 validée");
  });

  it("builds the refusal message and appends presets once", () => {
    const text = refusalMessage({ id: 7, name: "Promo", clientId: 3 }, " Objectif trop vague ");
    expect(text).toContain("« Promo » (référence CAMP-00007)");
    expect(text).toContain("Motif : Objectif trop vague");
    expect(applyReasonPreset("", "Objectif trop vague")).toBe("Objectif trop vague");
    expect(applyReasonPreset("Objectif trop vague", "Objectif trop vague")).toBe(
      "Objectif trop vague",
    );
    expect(applyReasonPreset("Texte ambigu.", "Période incohérente")).toBe(
      "Texte ambigu ; Période incohérente",
    );
  });

  it("searches name/objective without accents and by id", () => {
    expect(matchesQuery(list[1]!, "ete")).toBe(true);
    expect(matchesQuery(list[1]!, "#2")).toBe(true);
    expect(matchesQuery(list[1]!, "3")).toBe(false);
    expect(filterCampaigns(list, "toutes", "GRATUIT").map((c) => c.id)).toEqual([2]);
  });

  it("only allows a decision after the AI check", () => {
    expect(canDecide("APPROVED_BY_AI")).toBe(true);
    expect(canDecide("REVIEW_REQUIRED")).toBe(true);
    expect(canDecide("PENDING_AI_CHECK")).toBe(false);
    expect(canDecide("ACTIVE")).toBe(false);
  });

  it("flags validations that will never air (contract §7.14)", () => {
    expect(validationWillNotAir(list[1]!)).toBe(true);
    expect(validationWillNotAir(list[0]!)).toBe(false);
    expect(validationWillNotAir(list[3]!)).toBe(false);
  });

  it("formats the waiting time", () => {
    const now = new Date("2026-09-13T09:00:00Z");
    expect(waitingDays(list[1]!, now)).toBe(11);
    expect(formatWaiting(0)).toBe("Aujourd'hui");
    expect(formatWaiting(1)).toBe("Depuis 1 jour");
    expect(formatWaiting(11)).toBe("Depuis 11 jours");
  });

  it("joins reservations with support and zone names", () => {
    const reservations: ReservationResponse[] = [
      {
        id: 9,
        campaignId: 1,
        zoneId: 1,
        supportId: 7,
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        startTime: "08:00:00",
        endTime: "22:00:00",
        availabilityStatus: "RESERVE",
        reservationStatus: "TEMPORAIRE",
        estimatedViews: 1000,
        estimatedCost: 100,
      },
      {
        id: 10,
        campaignId: 1,
        zoneId: 2,
        supportId: 99,
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        startTime: "08:00:00",
        endTime: "22:00:00",
        availabilityStatus: "RESERVE",
        reservationStatus: "TEMPORAIRE",
        estimatedViews: 1000,
        estimatedCost: 100,
      },
    ];
    const supports = [
      { id: 7, zoneId: 1, zoneName: "Tunis Centre", name: "Écran Bourguiba" },
    ] as SupportResponse[];
    const zones = [{ id: 1, name: "Tunis Centre" }] as ZoneResponse[];
    const rows = joinReservations(reservations, supports, zones);
    expect(rows.map((r) => [r.supportName, r.zoneName])).toEqual([
      ["Écran Bourguiba", "Tunis Centre"],
      ["Porteur n° 99", "Zone n° 2"],
    ]);
    expect(sumEstimatedCost(rows)).toBe(200);
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

describe("overview model", () => {
  const d: DashboardResponse = {
    totalCampaigns: 12,
    activeCampaigns: 3,
    pendingCampaigns: 2,
    aiPendingCampaigns: 1,
    aiRejectedCampaigns: 1,
    availableSupports: 4,
    confirmedReservations: 6,
    totalViews: 5321,
    estimatedBudget: 25000,
    consumedBudget: 0,
  };

  it("labels diffusion log rows honestly (never « vues » or audience)", () => {
    const items = buildOverviewGroups(d).flatMap((g) => g.items);
    const views = items.find((i) => i.key === "totalViews");
    expect(views?.label.toLowerCase()).toContain("lignes du journal de diffusion");
    expect(views?.source).toContain("pas une audience");
    for (const item of items) expect(item.label.toLowerCase()).not.toMatch(/\bvues?\b|audience/);
    expect(items).toHaveLength(9);
    // No quoted enum wording, glossary labels.
    for (const item of items) expect(item.hint).not.toMatch(/« active »/);
    expect(items.find((i) => i.key === "estimatedBudget")?.label).toBe("Budget déclaré");
    expect(items.find((i) => i.key === "availableSupports")?.label).toBe("Porteurs actifs");
    expect(items.find((i) => i.key === "activeCampaigns")?.label).toBe(
      "Validées (programmées ou en diffusion)",
    );
  });

  it("derives the hero and the campaign cards from the same list", () => {
    const list = [
      campaign({ id: 1, status: "APPROVED_BY_AI" }),
      campaign({ id: 2, status: "REVIEW_REQUIRED" }),
      campaign({ id: 3, status: "PENDING_AI_CHECK" }),
      campaign({ id: 4, status: "ACTIVE" }),
      campaign({ id: 5, status: "VALIDATED_BY_ADMIN" }),
    ];
    expect(summarizeDecisionQueue(list)).toMatchObject({
      total: 2,
      breakdown: "1 avis IA favorable · 1 revue manuelle",
    });
    const items = buildOverviewGroups(d, list).flatMap((g) => g.items);
    expect(items.find((i) => i.key === "aiPendingCampaigns")?.value).toBe(1);
    expect(items.find((i) => i.key === "totalCampaigns")?.value).toBe(5);
    expect(items.find((i) => i.key === "activeCampaigns")?.value).toBe(2);
    expect(items.find((i) => i.key === "aiRejectedCampaigns")).toMatchObject({
      value: 0,
      dimmed: true,
    });
  });

  it("builds « À surveiller » with attention tones only above zero", () => {
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
    expect(porteursWatch([])).toMatchObject({ count: 0, tone: "neutral" });
    expect(coherenceWatch(zones, supports)).toMatchObject({ count: 0, tone: "neutral" });
    expect(coherenceWatch(zones, supports).href).toBe(
      "/admin/reseau?onglet=ecrans&panneau=coherence",
    );
    const today = "2026-09-13";
    const msg = { isActive: true, startDate: "2026-09-10", endDate: "2026-09-20" };
    expect(emergenciesWatch([msg, { ...msg, startDate: "2026-09-15" }], today)).toMatchObject({
      count: 2,
      detail: "1 en cours · 1 programmé",
      tone: "warning",
    });
    expect(emergenciesWatch([{ ...msg, isActive: false }], today)).toMatchObject({
      count: 0,
      tone: "neutral",
    });
  });

  it("formats budgets as TND and keeps raw values", () => {
    const items = buildOverviewGroups({ ...d, estimatedBudget: Number.NaN }).flatMap(
      (g) => g.items,
    );
    expect(items.find((i) => i.key === "estimatedBudget")).toMatchObject({
      format: "tnd",
      value: 0,
    });
    expect(items.find((i) => i.key === "totalCampaigns")?.value).toBe(12);
  });
});
