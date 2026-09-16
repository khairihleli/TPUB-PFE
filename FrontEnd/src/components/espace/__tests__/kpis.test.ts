import { describe, expect, it } from "vitest";

import { campaign, reservation } from "@/components/espace/__tests__/fixtures";
import {
  bucketSummary,
  budgetByCampaign,
  buildTodos,
  CAMPAIGN_BUCKETS,
  campaignBucket,
  computeAdvertiserKpis,
  daysUntil,
  emptyBuckets,
  firstName,
  inDaysLabel,
  onboardingMilestones,
  roundTND,
  upcomingDeadlines,
} from "@/components/espace/kpis";
import { CAMPAIGN_BUCKETS as LIB_BUCKETS } from "@/lib/campaign-status";

const TODAY = "2026-09-13";

describe("computeAdvertiserKpis", () => {
  it("returns zeros for a first-time advertiser", () => {
    const k = computeAdvertiserKpis([], [], TODAY);
    expect(k).toMatchObject({
      campaignCount: 0,
      totalBudget: 0,
      reservationCount: 0,
      reservedScreens: 0,
      estimatedViews: 0,
      estimatedCost: 0,
    });
    expect(Object.values(k.byBucket).every((n) => n === 0)).toBe(true);
  });

  it("counts campaigns per shared bucket, applying the derived Programmée / Terminée states", () => {
    const campaigns = [
      campaign({ id: 1, status: "BROUILLON" }),
      campaign({ id: 2, status: "PENDING_AI_CHECK" }),
      campaign({ id: 3, status: "REVIEW_REQUIRED" }),
      campaign({ id: 4, status: "ACTIVE", startDate: "2026-10-01", endDate: "2026-10-31" }), // programmée
      campaign({ id: 5, status: "ACTIVE", startDate: "2026-08-01", endDate: "2026-08-31" }), // terminée
      campaign({ id: 6, status: "REJECTED_BY_AI" }),
      campaign({ id: 7, status: "BLOCKED" }),
      campaign({ id: 8, status: "ACTIVE", startDate: "2026-09-01", endDate: "2026-09-30" }), // en diffusion
    ];
    const k = computeAdvertiserKpis(campaigns, [], TODAY);
    expect(k.campaignCount).toBe(8);
    expect(k.byBucket).toEqual({
      brouillons: 1,
      "a-corriger": 1,
      "en-examen": 2,
      programmees: 1,
      "en-diffusion": 1,
      terminees: 1,
      refusees: 1,
    });
  });

  it("sums the declared budget and estimated views without refused campaigns", () => {
    const campaigns = [
      campaign({ id: 1, budget: 2500, estimatedViews: 2000 }),
      campaign({ id: 2, budget: 1000.5, estimatedViews: 1000, status: "ACTIVE" }),
      campaign({ id: 3, budget: 9000, estimatedViews: 5000, status: "BLOCKED" }),
      campaign({ id: 4, budget: 400, estimatedViews: 1000, status: "REJECTED_BY_AI" }),
    ];
    const k = computeAdvertiserKpis(campaigns, [], TODAY);
    expect(k.totalBudget).toBe(3500.5);
    expect(k.estimatedViews).toBe(3000);
  });

  it("counts distinct Porteurs and zones and the estimated cost of holding reservations only", () => {
    const campaigns = [campaign({ id: 1 }), campaign({ id: 2, status: "BLOCKED" })];
    const reservations = [
      reservation({ id: 1, campaignId: 1, supportId: 10, zoneId: 1, estimatedCost: 250.1 }),
      reservation({
        id: 2,
        campaignId: 1,
        supportId: 10,
        zoneId: 1,
        estimatedCost: 250.2,
        reservationStatus: "CONFIRMEE",
      }),
      reservation({ id: 3, campaignId: 1, supportId: 11, zoneId: 2, estimatedCost: 0.3 }),
      reservation({
        id: 4,
        campaignId: 2,
        supportId: 12,
        zoneId: 3,
        estimatedCost: 900,
        reservationStatus: "ANNULEE",
      }),
    ];
    const k = computeAdvertiserKpis(campaigns, reservations, TODAY);
    expect(k.reservationCount).toBe(4);
    expect(k.holdingReservationCount).toBe(3);
    expect(k.reservationsByStatus).toEqual({ TEMPORAIRE: 2, CONFIRMEE: 1, ANNULEE: 1, EXPIREE: 0 });
    expect(k.reservedScreens).toBe(2);
    expect(k.reservedZones).toBe(2);
    expect(k.estimatedCost).toBe(500.6); // no float noise (250.1 + 250.2 + 0.3)
  });

  it("ignores reservations that do not belong to the advertiser's campaigns", () => {
    const k = computeAdvertiserKpis(
      [campaign({ id: 1 })],
      [reservation({ id: 1, campaignId: 99, estimatedCost: 5000 })],
      TODAY,
    );
    expect(k.reservationCount).toBe(0);
    expect(k.estimatedCost).toBe(0);
  });

  it("treats non-finite amounts as zero", () => {
    const k = computeAdvertiserKpis(
      [campaign({ id: 1, budget: Number.NaN })],
      [reservation({ id: 1, campaignId: 1, estimatedCost: Number.POSITIVE_INFINITY })],
      TODAY,
    );
    expect(k.totalBudget).toBe(0);
    expect(k.estimatedCost).toBe(0);
  });
});

describe("campaignBucket / roundTND", () => {
  it("uses the shared bucket definition from campaign-status", () => {
    expect(CAMPAIGN_BUCKETS).toBe(LIB_BUCKETS);
    expect(Object.keys(emptyBuckets())).toEqual(LIB_BUCKETS.map((b) => b.key));
  });
  it("maps VALIDATED_BY_ADMIN to « Programmées »", () => {
    expect(campaignBucket(campaign({ id: 1, status: "VALIDATED_BY_ADMIN" }), TODAY)).toBe(
      "programmees",
    );
  });
  it("rounds to millimes", () => {
    expect(roundTND(0.1 + 0.2)).toBe(0.3);
    expect(roundTND(1.23456)).toBe(1.235);
  });
});

describe("buildTodos", () => {
  it("orders actions and points each kind to its screen", () => {
    const campaigns = [
      campaign({ id: 1, status: "BLOCKED" }),
      campaign({ id: 2, status: "BROUILLON" }), // no reservation
      campaign({ id: 3, status: "REJECTED_BY_AI" }),
      campaign({ id: 4, status: "BROUILLON" }), // has a reservation
      campaign({ id: 5, status: "APPROVED_BY_AI" }),
      campaign({ id: 6, status: "PENDING_AI_CHECK" }),
      campaign({ id: 7, status: "BROUILLON" }), // only a cancelled reservation
    ];
    const reservations = [
      reservation({ id: 1, campaignId: 4 }),
      reservation({ id: 2, campaignId: 7, reservationStatus: "ANNULEE" }),
    ];
    const todos = buildTodos(campaigns, reservations);
    expect(todos.map((t) => [t.kind, t.campaignId, t.href])).toEqual([
      ["submit", 4, "/espace/campagnes/nouvelle?id=4&etape=3"],
      ["reserve", 2, "/espace/campagnes/nouvelle?id=2&etape=2"],
      ["reserve", 7, "/espace/campagnes/nouvelle?id=7&etape=2"],
      ["duplicate", 3, "/espace/campagnes/3"],
      ["analysis", 6, "/espace/campagnes/6"],
      ["blocked", 1, "/espace/campagnes/1"],
    ]);
  });

  it("never guesses reserve/submit for drafts whose reservations are unknown", () => {
    const campaigns = [
      campaign({ id: 1, status: "BROUILLON" }),
      campaign({ id: 2, status: "BROUILLON" }),
    ];
    const todos = buildTodos(campaigns, [], { knownCampaignIds: new Set([2]) });
    expect(todos.map((t) => [t.kind, t.campaignId, t.href])).toEqual([
      ["reserve", 2, "/espace/campagnes/nouvelle?id=2&etape=2"],
      ["finalize", 1, "/espace/campagnes/1"],
    ]);
  });
});

describe("budgetByCampaign", () => {
  it("sorts by budget, excludes refused campaigns and sums holding reservation costs", () => {
    const campaigns = [
      campaign({ id: 1, name: "Petite", budget: 500 }),
      campaign({ id: 2, name: "Grande", budget: 4000 }),
      campaign({ id: 3, name: "Refusée", budget: 9000, status: "BLOCKED" }),
    ];
    const reservations = [
      reservation({ id: 1, campaignId: 2, estimatedCost: 400 }),
      reservation({ id: 2, campaignId: 2, estimatedCost: 400, reservationStatus: "ANNULEE" }),
      reservation({ id: 3, campaignId: 1, estimatedCost: 50, reservationStatus: "CONFIRMEE" }),
    ];
    expect(budgetByCampaign(campaigns, reservations)).toEqual([
      { id: 2, name: "Grande", budget: 4000, estimatedCost: 400, reservationCount: 1 },
      { id: 1, name: "Petite", budget: 500, estimatedCost: 50, reservationCount: 1 },
    ]);
    expect(budgetByCampaign(campaigns, reservations, 1)).toHaveLength(1);
  });
});

describe("onboardingMilestones", () => {
  it("starts at 0 of 3 with no campaign, from real data only", () => {
    const m = onboardingMilestones([], []);
    expect(m.map((s) => [s.key, s.done])).toEqual([
      ["brouillon", false],
      ["porteurs", false],
      ["soumission", false],
    ]);
    expect(m[0]?.href).toBe("/espace/campagnes/nouvelle");
  });

  it("marks the draft, then the booking, then the submission", () => {
    const draftOnly = onboardingMilestones([{ id: 3, status: "BROUILLON" }], []);
    expect(draftOnly.map((s) => s.done)).toEqual([true, false, false]);
    expect(draftOnly[1]?.href).toBe("/espace/campagnes/nouvelle?id=3&etape=2");

    const booked = onboardingMilestones(
      [{ id: 3, status: "BROUILLON" }],
      [{ campaignId: 3, reservationStatus: "TEMPORAIRE" }],
    );
    expect(booked.map((s) => s.done)).toEqual([true, true, false]);
    expect(booked[2]?.href).toBe("/espace/campagnes/nouvelle?id=3&etape=3");

    const submitted = onboardingMilestones([{ id: 4, status: "PENDING_AI_CHECK" }], []);
    expect(submitted.every((s) => s.done)).toBe(true);
  });
});

describe("upcomingDeadlines", () => {
  it("derives real dates: starts ≤ 7 d, ends ≤ 7 d, drafts starting ≤ 14 d; soonest first", () => {
    const campaigns = [
      campaign({
        id: 1,
        name: "Brouillon proche",
        status: "BROUILLON",
        startDate: "2026-09-25",
        endDate: "2026-10-05",
      }),
      campaign({
        id: 2,
        name: "Brouillon lointain",
        status: "BROUILLON",
        startDate: "2026-10-30",
        endDate: "2026-11-05",
      }),
      campaign({
        id: 3,
        name: "Validée",
        status: "VALIDATED_BY_ADMIN",
        startDate: "2026-09-15",
        endDate: "2026-09-30",
      }),
      campaign({
        id: 4,
        name: "En diffusion",
        status: "ACTIVE",
        startDate: "2026-09-01",
        endDate: "2026-09-18",
      }),
      campaign({
        id: 5,
        name: "En examen",
        status: "REVIEW_REQUIRED",
        startDate: "2026-09-14",
        endDate: "2026-09-20",
      }),
      campaign({
        id: 6,
        name: "Programmée loin",
        status: "ACTIVE",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
      }),
      campaign({
        id: 7,
        name: "Refusée",
        status: "BLOCKED",
        startDate: "2026-09-14",
        endDate: "2026-09-20",
      }),
      campaign({
        id: 8,
        name: "Brouillon dépassé",
        status: "BROUILLON",
        startDate: "2026-09-01",
        endDate: "2026-09-20",
      }),
    ];
    const d = upcomingDeadlines(campaigns, TODAY);
    expect(d.map((x) => [x.campaignId, x.kind, x.date, x.inDays])).toEqual([
      [5, "start-pending", "2026-09-14", 1],
      [3, "start", "2026-09-15", 2],
      [4, "end", "2026-09-18", 5],
      [1, "start-draft", "2026-09-25", 12],
    ]);
    expect(d[0]?.label).toBe("Début prévu · en examen TPUB");
    expect(upcomingDeadlines(campaigns, TODAY, 2)).toHaveLength(2);
  });

  it("formats day distances", () => {
    expect(daysUntil(TODAY, "2026-09-13")).toBe(0);
    expect(daysUntil(TODAY, "2026-09-12")).toBeNull();
    expect(daysUntil(TODAY, null)).toBeNull();
    expect([0, 1, 5].map(inDaysLabel)).toEqual(["aujourd'hui", "demain", "dans 5 jours"]);
  });
});

describe("firstName", () => {
  it("keeps the first word of the display name", () => {
    expect(firstName("  Sami Ben Salah ")).toBe("Sami");
    expect(firstName("")).toBe("");
    expect(firstName(null)).toBe("");
  });
});

describe("bucketSummary", () => {
  it("lists every non-empty bucket in the shared order so the parts add up", () => {
    expect(
      bucketSummary({
        ...emptyBuckets(),
        brouillons: 1,
        "en-examen": 3,
        "en-diffusion": 1,
        refusees: 1,
      }),
    ).toEqual(["1 brouillon", "3 en examen", "1 en diffusion", "1 refusée"]);
    expect(
      bucketSummary({ ...emptyBuckets(), "a-corriger": 2, programmees: 2, terminees: 2 }),
    ).toEqual(["2 à corriger", "2 programmées", "2 terminées"]);
    expect(bucketSummary(emptyBuckets())).toEqual([]);
  });
});
