import { describe, expect, it, vi } from "vitest";

import {
  campaignReference,
  changeCampaignPeriod,
  clampWizardStep,
  getCampaignActions,
  maxReachableStep,
  nextStepHint,
  parseCampaignId,
  parseWizardStep,
  precheckPeriodChange,
  WIZARD_STEPS,
  withoutOwnSlots,
  wizardHref,
} from "@/components/campaign/campaign-actions";
import { ApiError } from "@/lib/api/errors";
import type {
  CampaignResponse,
  CampaignStatus,
  ReservationResponse,
  SupportAvailabilitySlot,
} from "@/lib/api/types";

type Row = {
  resume: boolean;
  edit: boolean;
  remove: boolean;
  submit: boolean;
  runAiCheck: boolean;
  duplicate: boolean;
  awaitingDecision: boolean;
};

/** Expected matrix with at least one reservation (contract §5.2, §6, §7.13). */
const MATRIX: Record<CampaignStatus, Row> = {
  BROUILLON: {
    resume: true,
    edit: true,
    remove: true,
    submit: true,
    runAiCheck: false,
    duplicate: false,
    awaitingDecision: false,
  },
  PENDING_AI_CHECK: {
    resume: false,
    edit: false,
    remove: false,
    submit: false,
    runAiCheck: true,
    duplicate: false,
    awaitingDecision: false,
  },
  APPROVED_BY_AI: {
    resume: false,
    edit: false,
    remove: false,
    submit: false,
    runAiCheck: false,
    duplicate: false,
    awaitingDecision: true,
  },
  REVIEW_REQUIRED: {
    resume: false,
    edit: false,
    remove: false,
    submit: false,
    runAiCheck: false,
    duplicate: false,
    awaitingDecision: true,
  },
  REJECTED_BY_AI: {
    resume: false,
    edit: true,
    remove: true,
    submit: false,
    runAiCheck: false,
    duplicate: true,
    awaitingDecision: false,
  },
  VALIDATED_BY_ADMIN: {
    resume: false,
    edit: false,
    remove: false,
    submit: false,
    runAiCheck: false,
    duplicate: false,
    awaitingDecision: false,
  },
  ACTIVE: {
    resume: false,
    edit: false,
    remove: false,
    submit: false,
    runAiCheck: false,
    duplicate: false,
    awaitingDecision: false,
  },
  TERMINATED: {
    resume: false,
    edit: false,
    remove: false,
    submit: false,
    runAiCheck: false,
    duplicate: false,
    awaitingDecision: false,
  },
  BLOCKED: {
    resume: false,
    edit: false,
    remove: false,
    submit: false,
    runAiCheck: false,
    duplicate: true,
    awaitingDecision: false,
  },
};

describe("getCampaignActions — status action matrix", () => {
  for (const [status, expected] of Object.entries(MATRIX) as [CampaignStatus, Row][]) {
    it(`${status}`, () => {
      const actions = getCampaignActions(status, { reservationCount: 2 });
      const { submitBlockedReason, ...rest } = actions;
      expect(rest).toEqual(expected);
      expect(submitBlockedReason).toBeNull();
    });
  }

  it("blocks submit for a draft without reservation (reserve before submit)", () => {
    const actions = getCampaignActions("BROUILLON", { reservationCount: 0 });
    expect(actions.submit).toBe(false);
    expect(actions.submitBlockedReason).toMatch(/au moins un Porteur/);
    expect(actions.resume).toBe(true);
  });

  it("never offers submit on a REJECTED_BY_AI campaign (dead end → duplicate)", () => {
    const actions = getCampaignActions("REJECTED_BY_AI", { reservationCount: 5 });
    expect(actions.submit).toBe(false);
    expect(actions.submitBlockedReason).toBeNull();
    expect(actions.duplicate).toBe(true);
  });

  it("gives a French next-step hint for every status", () => {
    for (const status of Object.keys(MATRIX) as CampaignStatus[]) {
      expect(nextStepHint(status).length).toBeGreaterThan(5);
    }
    expect(nextStepHint("BROUILLON", 0)).toMatch(/Porteurs/);
  });
});

describe("wizard URL state (3 steps)", () => {
  it("has three steps: Détails · Porteurs · Vérification & envoi", () => {
    expect(WIZARD_STEPS.map((s) => s.label)).toEqual([
      "Détails",
      "Porteurs",
      "Vérification & envoi",
    ]);
  });

  it("parses ?etape= with a safe default and maps legacy 3/4 to Vérification", () => {
    expect(parseWizardStep("2")).toBe(2);
    expect(parseWizardStep("3")).toBe(3);
    expect(parseWizardStep("4")).toBe(3);
    expect(parseWizardStep("porteurs")).toBe(2);
    expect(parseWizardStep("0")).toBe(1);
    expect(parseWizardStep("9")).toBe(1);
    expect(parseWizardStep("deux")).toBe(1);
    expect(parseWizardStep(null)).toBe(1);
  });

  it("parses ?id= strictly", () => {
    expect(parseCampaignId("12")).toBe(12);
    expect(parseCampaignId("0")).toBeNull();
    expect(parseCampaignId("-3")).toBeNull();
    expect(parseCampaignId("12abc")).toBeNull();
    expect(parseCampaignId("1.5")).toBeNull();
    expect(parseCampaignId("")).toBeNull();
    expect(parseCampaignId(undefined)).toBeNull();
  });

  it("enforces create → reserve → submit", () => {
    expect(maxReachableStep({ hasCampaign: false, reservationCount: 0 })).toBe(1);
    expect(maxReachableStep({ hasCampaign: true, reservationCount: 0 })).toBe(2);
    expect(maxReachableStep({ hasCampaign: true, reservationCount: 1 })).toBe(3);
    expect(clampWizardStep(3, { hasCampaign: true, reservationCount: 0 })).toBe(2);
    expect(clampWizardStep(parseWizardStep("4"), { hasCampaign: true, reservationCount: 2 })).toBe(
      3,
    );
    expect(clampWizardStep(3, { hasCampaign: false, reservationCount: 0 })).toBe(1);
    expect(clampWizardStep(2, { hasCampaign: true, reservationCount: 3 })).toBe(2);
  });

  it("builds resumable wizard links through routes.espace.wizard (numbers and legacy 4)", () => {
    expect(wizardHref(null, 1)).toBe("/espace/campagnes/nouvelle");
    expect(wizardHref(null)).toBe("/espace/campagnes/nouvelle");
    expect(wizardHref(7, 2)).toBe("/espace/campagnes/nouvelle?id=7&etape=2");
    expect(wizardHref(7, 1)).toBe("/espace/campagnes/nouvelle?id=7&etape=1");
    expect(wizardHref(7, 3)).toBe("/espace/campagnes/nouvelle?id=7&etape=3");
    expect(wizardHref(7, 4)).toBe("/espace/campagnes/nouvelle?id=7&etape=3");
    expect(wizardHref(7, "verification")).toBe("/espace/campagnes/nouvelle?id=7&etape=3");
  });

  it("formats the campaign reference", () => {
    expect(campaignReference(7)).toBe("CAMP-00007");
  });
});

// ---------------------------------------------------------------------------
// « Changer de période » (FLOW-01)
// ---------------------------------------------------------------------------
const SOURCE: CampaignResponse = {
  id: 7,
  clientId: 1,
  name: "Lancement Café Démo",
  objective: "Notoriété de la nouvelle gamme",
  budget: 2500,
  consumedBudget: 0,
  status: "BROUILLON",
  aiStatus: null,
  adminStatus: null,
  startDate: "2026-10-01",
  endDate: "2026-10-10",
  startTime: "08:00:00",
  endTime: "22:00:00",
  estimatedViews: 2000,
  priorityScore: 0,
  createdAt: "2026-09-01T10:00:00Z",
  submittedAt: null,
  validatedAt: null,
};

function resa(over: Partial<ReservationResponse>): ReservationResponse {
  return {
    id: 100,
    campaignId: 7,
    zoneId: 1,
    supportId: 11,
    startDate: "2026-10-01",
    endDate: "2026-10-10",
    startTime: "08:00:00",
    endTime: "22:00:00",
    availabilityStatus: "RESERVE",
    reservationStatus: "TEMPORAIRE",
    estimatedViews: 1000,
    estimatedCost: 250,
    ...over,
  };
}

const RESAS = [
  resa({ id: 100, supportId: 11, zoneId: 1 }),
  resa({ id: 101, supportId: 31, zoneId: 3 }),
  resa({ id: 102, supportId: 12, zoneId: 1 }),
];
const PERIOD = {
  startDate: "2026-10-08",
  endDate: "2026-10-20",
  startTime: "09:00",
  endTime: "18:00",
};

function slot(over: Partial<SupportAvailabilitySlot>): SupportAvailabilitySlot {
  return {
    startDate: "2026-10-01",
    endDate: "2026-10-10",
    startTime: "08:00:00",
    endTime: "22:00:00",
    reservationStatus: "TEMPORAIRE",
    ...over,
  };
}

describe("period change pre-check", () => {
  it("ignores slots identical to the campaign's own créneaux", () => {
    const own = slot({});
    const other = slot({ startDate: "2026-10-15", endDate: "2026-10-18" });
    expect(withoutOwnSlots([own, other], 11, RESAS)).toEqual([other]);
    // Same dates on another Porteur are not « own » slots.
    expect(withoutOwnSlots([own], 99, RESAS)).toEqual([own]);
  });

  it("classifies booked Porteurs as available / unavailable / errored / loading", () => {
    const entries = new Map([
      // Only its own créneau overlaps → free on the new period.
      [11, { state: "busy" as const, slots: [slot({})] }],
      [
        31,
        {
          state: "busy" as const,
          slots: [slot({ startDate: "2026-10-15", endDate: "2026-10-16" })],
        },
      ],
      [12, { state: "error" as const, slots: [] }],
    ]);
    const result = precheckPeriodChange(RESAS, entries, PERIOD.startDate, PERIOD.endDate);
    expect(result.available).toEqual([11]);
    expect(result.unavailable).toEqual([31]);
    expect(result.errored).toEqual([12]);
    expect(result.loading).toBe(false);
    expect(precheckPeriodChange(RESAS, new Map(), PERIOD.startDate, PERIOD.endDate).loading).toBe(
      true,
    );
  });
});

describe("changeCampaignPeriod orchestration", () => {
  function api() {
    const copy = { ...SOURCE, id: 12, startDate: PERIOD.startDate, endDate: PERIOD.endDate };
    return {
      copy,
      duplicate: vi.fn().mockResolvedValue(copy),
      remove: vi.fn().mockResolvedValue(undefined),
      reserve: vi.fn((body: { supportId: number }) =>
        Promise.resolve(
          resa({ id: 500 + body.supportId, campaignId: 12, supportId: body.supportId }),
        ),
      ),
    };
  }

  it("duplicates on the new period, deletes the original, then rebooks available Porteurs", async () => {
    const a = api();
    const result = await changeCampaignPeriod(
      { source: SOURCE, period: PERIOD, reservations: RESAS, availableSupportIds: [11, 12] },
      a,
    );
    expect(a.duplicate).toHaveBeenCalledWith(SOURCE, {
      startDate: "2026-10-08",
      endDate: "2026-10-20",
      startTime: "09:00:00",
      endTime: "18:00:00",
    });
    expect(a.remove).toHaveBeenCalledWith(7);
    expect(a.duplicate.mock.invocationCallOrder[0]).toBeLessThan(
      a.remove.mock.invocationCallOrder[0]!,
    );
    expect(a.remove.mock.invocationCallOrder[0]).toBeLessThan(
      a.reserve.mock.invocationCallOrder[0]!,
    );
    expect(a.reserve).toHaveBeenCalledTimes(2);
    expect(a.reserve).toHaveBeenCalledWith({
      campaignId: 12,
      zoneId: 1,
      supportId: 11,
      startDate: "2026-10-08",
      endDate: "2026-10-20",
      startTime: "09:00:00",
      endTime: "18:00:00",
    });
    expect(result).toMatchObject({ ok: true, skipped: [31], failed: [] });
    if (result.ok) {
      expect(result.campaign.id).toBe(12);
      expect(result.rebooked.map((r) => r.supportId).sort()).toEqual([11, 12]);
    }
  });

  it("duplicate fails → nothing changed (no delete, no booking)", async () => {
    const a = api();
    a.duplicate.mockRejectedValue(new ApiError(500, "Erreur"));
    const result = await changeCampaignPeriod(
      { source: SOURCE, period: PERIOD, reservations: RESAS, availableSupportIds: [11] },
      a,
    );
    expect(result).toMatchObject({ ok: false, stage: "duplicate" });
    expect(a.remove).not.toHaveBeenCalled();
    expect(a.reserve).not.toHaveBeenCalled();
  });

  it("delete fails → the duplicate is deleted again and nothing is booked", async () => {
    const a = api();
    a.remove.mockRejectedValueOnce(new ApiError(500, "Erreur")).mockResolvedValueOnce(undefined);
    const result = await changeCampaignPeriod(
      { source: SOURCE, period: PERIOD, reservations: RESAS, availableSupportIds: [11] },
      a,
    );
    expect(result).toMatchObject({ ok: false, stage: "delete", rollbackFailed: false });
    expect(a.remove).toHaveBeenNthCalledWith(1, 7);
    expect(a.remove).toHaveBeenNthCalledWith(2, 12);
    expect(a.reserve).not.toHaveBeenCalled();
  });

  it("delete fails and the rollback fails too → reported with the leftover copy", async () => {
    const a = api();
    a.remove.mockRejectedValue(new ApiError(500, "Erreur"));
    const result = await changeCampaignPeriod(
      { source: SOURCE, period: PERIOD, reservations: RESAS, availableSupportIds: [11] },
      a,
    );
    expect(result).toMatchObject({
      ok: false,
      stage: "delete",
      rollbackFailed: true,
      copy: { id: 12 },
    });
    expect(a.reserve).not.toHaveBeenCalled();
  });

  it("booking failures are listed, the others are kept", async () => {
    const a = api();
    a.reserve.mockImplementation((body: { supportId: number }) =>
      body.supportId === 12
        ? Promise.reject(new ApiError(400, "Conflit", { rawMessage: "Support already reserved" }))
        : Promise.resolve(resa({ id: 900, campaignId: 12, supportId: body.supportId })),
    );
    const result = await changeCampaignPeriod(
      {
        source: SOURCE,
        period: PERIOD,
        reservations: RESAS,
        availableSupportIds: [11, 12, 31],
        concurrency: 1,
      },
      a,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rebooked.map((r) => r.supportId).sort()).toEqual([11, 31]);
      expect(result.failed.map((f) => f.supportId)).toEqual([12]);
      expect(result.skipped).toEqual([]);
    }
  });
});
