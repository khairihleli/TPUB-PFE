import { describe, expect, it } from "vitest";

import { campaign } from "@/components/espace/__tests__/fixtures";
import { EMPTY_TOTALS } from "@/components/espace/statistics-model";
import {
  bucketSummary,
  buildTodos,
  CAMPAIGN_BUCKETS,
  campaignBucket,
  countBuckets,
  daysUntil,
  emptyBuckets,
  firstName,
  inDaysLabel,
  mineKpis,
  onboardingMilestones,
  roundTND,
  upcomingDeadlines,
} from "@/components/espace/kpis";
import { CAMPAIGN_BUCKETS as LIB_BUCKETS } from "@/lib/campaign-status";

const TODAY = "2026-09-13";

describe("mineKpis (GET /statistics/mine, never aggregated client-side)", () => {
  it("returns zero tiles for a first-time advertiser", () => {
    const tiles = mineKpis({ totals: EMPTY_TOTALS });
    expect(tiles.map((t) => t.key)).toEqual([
      "views",
      "clicks",
      "interactions",
      "estimatedCost",
      "consumedBudget",
      "activeCampaigns",
    ]);
    expect(tiles.every((t) => t.value === 0)).toBe(true);
  });

  it("labels measured and estimated figures honestly", () => {
    const tiles = mineKpis({
      totals: {
        ...EMPTY_TOTALS,
        views: 1200,
        clicks: 30,
        interactions: 4,
        estimatedViews: 9000,
        estimatedCost: 72.0004,
        consumedBudget: 9.6,
        activeCampaigns: 1,
        pendingCampaigns: 2,
        campaigns: 5,
      },
    });
    const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
    expect(byKey.views).toMatchObject({ value: 1200, source: "mesure", kind: "count" });
    expect(byKey.estimatedCost).toMatchObject({ value: 72, source: "estimation", kind: "money" });
    expect(byKey.estimatedCost?.hint).toMatch(/^9.000 affichages estimés/);
    expect(byKey.consumedBudget).toMatchObject({ value: 9.6, source: "mesure" });
    expect(byKey.activeCampaigns?.hint).toMatch(/2 en attente · 5 campagnes au total/);
  });

  it("treats non-finite totals as zero", () => {
    const tiles = mineKpis({ totals: { ...EMPTY_TOTALS, views: Number.NaN } });
    expect(tiles[0]?.value).toBe(0);
  });
});

describe("countBuckets", () => {
  it("counts campaigns per shared bucket, applying the derived Programmée / Terminée states", () => {
    const campaigns = [
      campaign({ id: 1, status: "BROUILLON" }),
      campaign({ id: 2, status: "PENDING_AI_CHECK" }),
      campaign({ id: 3, status: "REVIEW_REQUIRED" }),
      campaign({ id: 4, status: "ACTIVE", startDate: "2026-10-01", endDate: "2026-10-31" }),
      campaign({ id: 5, status: "ACTIVE", startDate: "2026-08-01", endDate: "2026-08-31" }),
      campaign({ id: 6, status: "REJECTED_BY_AI" }),
      campaign({ id: 7, status: "BLOCKED" }),
      campaign({ id: 8, status: "ACTIVE", startDate: "2026-09-01", endDate: "2026-09-30" }),
    ];
    const byBucket = countBuckets(campaigns, TODAY);
    expect(Object.values(byBucket).reduce((a, b) => a + b, 0)).toBe(8);
    expect(byBucket["en-examen"]).toBe(2);
    expect(byBucket["en-diffusion"]).toBe(1);
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
      campaign({ id: 2, status: "BROUILLON", reservationsCount: 0 }),
      campaign({ id: 3, status: "REJECTED_BY_AI" }),
      campaign({ id: 4, status: "BROUILLON", reservationsCount: 2 }),
      campaign({ id: 5, status: "APPROVED_BY_AI" }),
      campaign({ id: 6, status: "PENDING_AI_CHECK" }),
      campaign({ id: 7, status: "BROUILLON" }), // count unknown (older payload)
    ];
    expect(buildTodos(campaigns).map((t) => [t.kind, t.campaignId, t.href])).toEqual([
      ["correct", 1, "/espace/campagnes/1"],
      ["correct", 3, "/espace/campagnes/3"],
      ["submit", 4, "/espace/campagnes/nouvelle?id=4&etape=4"],
      ["reserve", 2, "/espace/campagnes/nouvelle?id=2&etape=3"],
      ["finalize", 7, "/espace/campagnes/7"],
      ["analysis", 6, "/espace/campagnes/6"],
    ]);
  });
});

describe("onboardingMilestones", () => {
  it("starts at 0 of 3 with no campaign, from real data only", () => {
    const m = onboardingMilestones([]);
    expect(m.map((s) => [s.key, s.done])).toEqual([
      ["brouillon", false],
      ["porteurs", false],
      ["soumission", false],
    ]);
    expect(m[0]?.href).toBe("/espace/campagnes/nouvelle");
  });

  it("marks the draft, then the booking, then the submission", () => {
    const draftOnly = onboardingMilestones([{ id: 3, status: "BROUILLON", reservationsCount: 0 }]);
    expect(draftOnly.map((s) => s.done)).toEqual([true, false, false]);
    expect(draftOnly[1]?.href).toBe("/espace/campagnes/nouvelle?id=3&etape=3");

    const booked = onboardingMilestones([{ id: 3, status: "BROUILLON", reservationsCount: 1 }]);
    expect(booked.map((s) => s.done)).toEqual([true, true, false]);
    expect(booked[2]?.href).toBe("/espace/campagnes/nouvelle?id=3&etape=4");

    const submitted = onboardingMilestones([{ id: 4, status: "PENDING_AI_CHECK" }]);
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
    expect(d[0]?.label).toBe("Début prévu · en examen ZELQANE");
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
