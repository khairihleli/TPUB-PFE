import { describe, expect, it } from "vitest";

import {
  campaignReference,
  clampWizardStep,
  getCampaignActions,
  maxReachableStep,
  nextStepHint,
  parseCampaignId,
  parseWizardStep,
  submitChecklist,
  WIZARD_STEPS,
  wizardHref,
} from "@/components/campaign/campaign-actions";
import type { CampaignResponse, CampaignStatus } from "@/lib/api/types";

type Row = {
  resume: boolean;
  edit: boolean;
  editReopens: boolean;
  reopen: boolean;
  remove: boolean;
  submit: boolean;
  runAiCheck: boolean;
  duplicate: boolean;
  awaitingDecision: boolean;
};

const NONE: Row = {
  resume: false,
  edit: false,
  editReopens: false,
  reopen: false,
  remove: false,
  submit: false,
  runAiCheck: false,
  duplicate: true,
  awaitingDecision: false,
};

/** Expected matrix with at least one reservation (contract §2.1 status machine). */
const MATRIX: Record<CampaignStatus, Row> = {
  BROUILLON: { ...NONE, resume: true, edit: true, remove: true, submit: true },
  PENDING_AI_CHECK: { ...NONE, runAiCheck: true },
  APPROVED_BY_AI: { ...NONE, awaitingDecision: true },
  REVIEW_REQUIRED: { ...NONE, awaitingDecision: true },
  // Resubmission after correction: editing reopens to BROUILLON.
  REJECTED_BY_AI: { ...NONE, edit: true, editReopens: true, reopen: true, remove: true },
  VALIDATED_BY_ADMIN: { ...NONE },
  ACTIVE: { ...NONE },
  TERMINATED: { ...NONE },
  BLOCKED: { ...NONE, edit: true, editReopens: true, reopen: true, remove: true },
};

describe("getCampaignActions — status action matrix", () => {
  for (const [status, expected] of Object.entries(MATRIX) as [CampaignStatus, Row][]) {
    it(status, () => {
      const { submitBlockedReason, ...rest } = getCampaignActions(status, { reservationCount: 2 });
      expect(rest).toEqual(expected);
      expect(submitBlockedReason).toBeNull();
    });
  }

  it("blocks submit for a draft without reservation", () => {
    const actions = getCampaignActions("BROUILLON", { reservationCount: 0 });
    expect(actions.submit).toBe(false);
    expect(actions.submitBlockedReason).toMatch(/au moins un Porteur/);
    expect(actions.resume).toBe(true);
  });

  it("lets the backend flags win over the status fallback", () => {
    const actions = getCampaignActions(
      { status: "BROUILLON", editable: false, submittable: false, deletable: false },
      { reservationCount: 3 },
    );
    expect(actions).toMatchObject({ edit: false, submit: false, remove: false });
    expect(actions.submitBlockedReason).toBeNull();
  });

  it("gives a French next-step hint for every status", () => {
    for (const status of Object.keys(MATRIX) as CampaignStatus[]) {
      expect(nextStepHint(status).length).toBeGreaterThan(5);
    }
    expect(nextStepHint("BROUILLON", 0)).toMatch(/Porteurs/);
    expect(nextStepHint("BLOCKED")).toMatch(/soumettez-la à nouveau/);
  });
});

describe("wizard URL state (4 steps)", () => {
  it("has four steps: Détails · Contenu · Zone & Porteurs · Vérification & envoi", () => {
    expect(WIZARD_STEPS.map((s) => s.label)).toEqual([
      "Détails",
      "Contenu",
      "Zone & Porteurs",
      "Vérification & envoi",
    ]);
  });

  it("parses ?etape= numbers and names with a safe default", () => {
    expect(parseWizardStep("2")).toBe(2);
    expect(parseWizardStep("4")).toBe(4);
    expect(parseWizardStep("porteurs")).toBe(3);
    expect(parseWizardStep("contenu")).toBe(2);
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

  it("opens only « Détails » before the draft exists, every step afterwards", () => {
    expect(maxReachableStep({ hasCampaign: false })).toBe(1);
    expect(maxReachableStep({ hasCampaign: true })).toBe(4);
    expect(clampWizardStep(3, { hasCampaign: false })).toBe(1);
    expect(clampWizardStep(4, { hasCampaign: true })).toBe(4);
  });

  it("builds resumable wizard links (numbers and step names)", () => {
    expect(wizardHref(null, 1)).toBe("/espace/campagnes/nouvelle");
    expect(wizardHref(null)).toBe("/espace/campagnes/nouvelle");
    expect(wizardHref(7, 2)).toBe("/espace/campagnes/nouvelle?id=7&etape=2");
    expect(wizardHref(7, "porteurs")).toBe("/espace/campagnes/nouvelle?id=7&etape=3");
    expect(wizardHref(7, "verification")).toBe("/espace/campagnes/nouvelle?id=7&etape=4");
  });

  it("formats the campaign reference", () => {
    expect(campaignReference(7)).toBe("CAMP-00007");
  });
});

describe("submitChecklist (mirrors SUBMIT_INCOMPLETE keys)", () => {
  const complete: Pick<
    CampaignResponse,
    "startDate" | "endDate" | "startTime" | "endTime" | "budget" | "zones"
  > = {
    startDate: "2026-10-01",
    endDate: "2026-10-10",
    startTime: "07:00:00",
    endTime: "12:00:00",
    budget: 500,
    zones: [
      {
        id: 1,
        zoneId: 2,
        zoneName: "Tunis",
        label: null,
        latitude: 36.8,
        longitude: 10.18,
        radiusKm: 3,
        supportsInside: 4,
      },
    ],
  };

  it("is all green for a complete draft with a reservation", () => {
    const items = submitChecklist(complete, { reservationCount: 1, today: "2026-09-17" });
    expect(items.map((i) => i.key)).toEqual(["period", "times", "budget", "zones", "reservations"]);
    expect(items.every((i) => i.ok)).toBe(true);
  });

  it("flags each missing part with the step that fixes it", () => {
    const items = submitChecklist(
      { ...complete, endDate: "2026-09-01", startTime: "12:00:00", budget: 0, zones: [] },
      { reservationCount: 0, today: "2026-09-17" },
    );
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.period).toMatchObject({ ok: false, step: 1 });
    expect(byKey.times).toMatchObject({ ok: false, step: 1 });
    expect(byKey.budget).toMatchObject({ ok: false, step: 1 });
    expect(byKey.zones).toMatchObject({ ok: false, step: 3 });
    expect(byKey.reservations).toMatchObject({ ok: false, step: 3 });
  });
});
