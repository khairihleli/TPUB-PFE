import { describe, expect, it } from "vitest";

import type { CampaignStatus } from "@/lib/api/types";
import {
  CAMPAIGN_BUCKETS,
  CAMPAIGN_DISPLAY_STATUSES,
  CAMPAIGN_FILTERS,
  CAMPAIGN_STATUS,
  CAMPAIGN_STATUS_ANNONCEUR,
  type CampaignPhase,
  campaignStatusFor,
  canSubmit,
  getCampaignBucket,
  getCampaignDisplayStatus,
  getCampaignStatusMeta,
  getCampaignStep,
  getCampaignTimeCue,
  isAwaitingAdmin,
  isDeadEnd,
  isEditable,
  matchesCampaignFilter,
  parseCampaignFilter,
  PHASE_TONE,
  RESERVATION_STATUS,
} from "@/lib/campaign-status";

const ALL: CampaignStatus[] = [
  "BROUILLON",
  "PENDING_AI_CHECK",
  "APPROVED_BY_AI",
  "REVIEW_REQUIRED",
  "REJECTED_BY_AI",
  "VALIDATED_BY_ADMIN",
  "ACTIVE",
  "TERMINATED",
  "BLOCKED",
];

describe("status semantics (UX-PLAN §4.8)", () => {
  it("gives each lifecycle phase its own tone", () => {
    const tones = Object.values(PHASE_TONE);
    expect(new Set(tones).size).toBe(tones.length);
    expect(PHASE_TONE).toEqual({
      draft: "neutral",
      pending: "warning",
      scheduled: "violet",
      live: "success",
      ended: "muted",
      problem: "danger",
    });
    // blue is for actions/links, info for alerts: never a campaign status tone.
    expect(tones).not.toContain("blue");
    expect(tones).not.toContain("info");
  });

  it("uses the phase tone for every status in both audiences", () => {
    for (const s of CAMPAIGN_DISPLAY_STATUSES) {
      for (const map of [CAMPAIGN_STATUS, CAMPAIGN_STATUS_ANNONCEUR]) {
        expect(map[s].tone).toBe(PHASE_TONE[map[s].phase]);
        expect(map[s].label.length).toBeGreaterThan(2);
      }
      expect(CAMPAIGN_STATUS[s].tone).toBe(CAMPAIGN_STATUS_ANNONCEUR[s].tone);
    }
    expect(CAMPAIGN_STATUS.ACTIVE).toMatchObject({
      tone: "success",
      pulse: true,
      label: "En diffusion",
    });
    expect(CAMPAIGN_STATUS.BLOCKED).toMatchObject({ tone: "danger", label: "Bloquée" });
    expect(CAMPAIGN_STATUS_ANNONCEUR.BLOCKED).toMatchObject({ tone: "danger", label: "Refusée" });
    expect(CAMPAIGN_STATUS.VALIDATED_BY_ADMIN.label).toBe("Programmée");
    expect(CAMPAIGN_STATUS.TERMINATED.label).toBe("Terminée");
  });

  it("labels both AI outcomes « En examen TPUB » for advertisers, precisely for staff", () => {
    expect(campaignStatusFor("APPROVED_BY_AI", "annonceur")).toMatchObject({
      label: "En examen TPUB",
      hint: "Analyse favorable",
    });
    expect(campaignStatusFor("REVIEW_REQUIRED", "annonceur")).toMatchObject({
      label: "En examen TPUB",
      hint: "Quelques points à vérifier par l'équipe",
    });
    expect(campaignStatusFor("APPROVED_BY_AI", "staff").label).toBe("Avis IA favorable");
    expect(campaignStatusFor("REVIEW_REQUIRED", "staff").label).toBe("Revue manuelle");
    expect(campaignStatusFor("VALIDATED_BY_ADMIN", "annonceur").label).toBe("Programmée");
    expect(campaignStatusFor("REJECTED_BY_AI", "annonceur").hint).toBe(
      "Modifiez-la puis soumettez-la à nouveau",
    );
  });

  it("puts the real start date in the scheduled hint", () => {
    const meta = getCampaignStatusMeta(
      { status: "ACTIVE", startDate: "2026-10-01", endDate: "2026-10-31" },
      { audience: "annonceur", today: "2026-09-12" },
    );
    expect(meta.key).toBe("SCHEDULED");
    expect(meta.hint).toMatch(/^Diffusion à partir du 1(er)? oct\. 2026$/);
  });

  it("every bucket tone equals the pill tone of its statuses", () => {
    const phases = new Set<CampaignPhase>();
    for (const bucket of CAMPAIGN_BUCKETS) {
      phases.add(bucket.phase);
      for (const status of bucket.statuses) {
        expect(CAMPAIGN_STATUS_ANNONCEUR[status].tone).toBe(bucket.tone);
        expect(CAMPAIGN_STATUS[status].tone).toBe(bucket.tone);
        // the bucket's list tab contains all of its statuses
        expect(matchesCampaignFilter(status, bucket.filter)).toBe(true);
      }
    }
    const covered = CAMPAIGN_BUCKETS.flatMap((b) => b.statuses);
    expect(new Set(covered).size).toBe(CAMPAIGN_DISPLAY_STATUSES.length);
    expect(phases.size).toBe(6);
  });

  it("reservation pills use the glossary labels", () => {
    expect(RESERVATION_STATUS.TEMPORAIRE).toMatchObject({
      label: "Bloqué",
      longLabel: "Bloqué · en attente de décision TPUB",
      tone: "warning",
    });
    expect(RESERVATION_STATUS.CONFIRMEE.label).toBe("Confirmé");
    expect(RESERVATION_STATUS.ANNULEE.label).toBe("Libéré");
    expect(RESERVATION_STATUS.EXPIREE.label).toBe("Passé");
  });
});

describe("derived states", () => {
  const today = "2026-09-12";

  it("shows « Programmée » when ACTIVE and startDate > today", () => {
    const c = { status: "ACTIVE" as const, startDate: "2026-10-01", endDate: "2026-10-31" };
    expect(getCampaignDisplayStatus(c, today)).toBe("SCHEDULED");
    expect(getCampaignStatusMeta(c, today).label).toBe("Programmée");
  });

  it("shows « Terminée » when endDate < today", () => {
    const c = { status: "ACTIVE" as const, startDate: "2026-08-01", endDate: "2026-09-11" };
    expect(getCampaignDisplayStatus(c, today)).toBe("ENDED");
    expect(getCampaignBucket(c, today).key).toBe("terminees");
  });

  it("keeps ACTIVE during the period (inclusive bounds)", () => {
    expect(
      getCampaignDisplayStatus({ status: "ACTIVE", startDate: today, endDate: today }, today),
    ).toBe("ACTIVE");
  });

  it("does not derive for other statuses or missing dates", () => {
    expect(
      getCampaignDisplayStatus(
        { status: "BROUILLON", startDate: "2020-01-01", endDate: "2020-01-02" },
        today,
      ),
    ).toBe("BROUILLON");
    expect(
      getCampaignDisplayStatus({ status: "ACTIVE", startDate: null, endDate: null }, today),
    ).toBe("ACTIVE");
  });
});

describe("time cues (real data only)", () => {
  const today = "2026-09-12";
  const now = new Date("2026-09-12T11:00:00Z");
  const base = { submittedAt: null, validatedAt: null, startDate: null, endDate: null };

  it("« Soumise il y a 3 h » from submittedAt, nothing without a timestamp", () => {
    expect(
      getCampaignTimeCue(
        { ...base, status: "APPROVED_BY_AI", submittedAt: "2026-09-12T08:00:00Z" },
        today,
        now,
      ),
    ).toEqual({ label: "Soumise il y a 3 h", tone: null });
    expect(getCampaignTimeCue({ ...base, status: "REVIEW_REQUIRED" }, today, now)).toBeNull();
  });

  it("« Diffusion dans 5 jours » for a future validated campaign", () => {
    expect(
      getCampaignTimeCue(
        { ...base, status: "ACTIVE", startDate: "2026-09-17", endDate: "2026-09-30" },
        today,
        now,
      ),
    ).toEqual({ label: "Diffusion dans 5 jours", tone: null });
  });

  it("« Terminée le … » and a warning for a draft whose start passed", () => {
    expect(
      getCampaignTimeCue({ ...base, status: "TERMINATED", endDate: "2026-09-01" }, today, now)
        ?.label,
    ).toMatch(/^Terminée le 1(er)? sept\. 2026$/);
    expect(
      getCampaignTimeCue({ ...base, status: "BROUILLON", startDate: "2026-09-01" }, today, now),
    ).toEqual({ label: "Date de début dépassée", tone: "warning" });
  });
});

describe("stepper index", () => {
  it.each([
    ["BROUILLON", 0, "current"],
    ["PENDING_AI_CHECK", 1, "current"],
    ["REJECTED_BY_AI", 1, "failed"],
    ["APPROVED_BY_AI", 2, "current"],
    ["REVIEW_REQUIRED", 2, "current"],
    ["BLOCKED", 2, "failed"],
    ["ACTIVE", 3, "current"],
    ["TERMINATED", 3, "complete"],
  ] as const)("%s → step %i (%s)", (status, index, state) => {
    expect(getCampaignStep(status)).toEqual({ index, state });
  });
});

describe("action rules", () => {
  it("isEditable for BROUILLON and the reopenable REJECTED_BY_AI / BLOCKED", () => {
    expect(ALL.filter(isEditable)).toEqual(["BROUILLON", "REJECTED_BY_AI", "BLOCKED"]);
  });
  it("canSubmit only for BROUILLON", () => {
    expect(ALL.filter(canSubmit)).toEqual(["BROUILLON"]);
  });
  it("keeps the legacy isDeadEnd for REJECTED_BY_AI (duplicate still offered)", () => {
    expect(ALL.filter(isDeadEnd)).toEqual(["REJECTED_BY_AI"]);
  });
  it("isAwaitingAdmin for AI-approved and review-required", () => {
    expect(ALL.filter(isAwaitingAdmin)).toEqual(["APPROVED_BY_AI", "REVIEW_REQUIRED"]);
  });
});

describe("list filters", () => {
  it("exposes the new tabs", () => {
    expect(CAMPAIGN_FILTERS.map((f) => f.value)).toEqual([
      "toutes",
      "a-finaliser",
      "en-examen",
      "validees",
      "terminees",
    ]);
  });

  it("groups statuses into tabs", () => {
    expect(matchesCampaignFilter("BLOCKED", "toutes")).toBe(true);
    expect(matchesCampaignFilter("REJECTED_BY_AI", "a-finaliser")).toBe(true);
    expect(matchesCampaignFilter("REVIEW_REQUIRED", "en-examen")).toBe(true);
    expect(matchesCampaignFilter("VALIDATED_BY_ADMIN", "validees")).toBe(true);
    expect(matchesCampaignFilter("BLOCKED", "terminees")).toBe(true);
    expect(matchesCampaignFilter("ACTIVE", "a-finaliser")).toBe(false);
  });

  it("classifies derived states from the campaign dates", () => {
    const today = "2026-09-12";
    const future = { status: "ACTIVE" as const, startDate: "2026-10-01", endDate: "2026-10-31" };
    const past = { status: "ACTIVE" as const, startDate: "2026-08-01", endDate: "2026-09-01" };
    expect(matchesCampaignFilter(future, "validees", today)).toBe(true);
    expect(matchesCampaignFilter(past, "validees", today)).toBe(false);
    expect(matchesCampaignFilter(past, "terminees", today)).toBe(true);
  });

  it("maps legacy ?statut= values", () => {
    expect(parseCampaignFilter("brouillons")).toBe("a-finaliser");
    expect(parseCampaignFilter("validation")).toBe("en-examen");
    expect(parseCampaignFilter("diffusion")).toBe("validees");
    expect(parseCampaignFilter("refusees")).toBe("terminees");
    expect(parseCampaignFilter("en-examen")).toBe("en-examen");
    expect(parseCampaignFilter("nimporte")).toBe("toutes");
    expect(parseCampaignFilter(null)).toBe("toutes");
    expect(matchesCampaignFilter("REVIEW_REQUIRED", "validation")).toBe(true);
  });
});
