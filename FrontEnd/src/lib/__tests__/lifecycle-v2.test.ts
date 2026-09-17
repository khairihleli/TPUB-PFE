import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  AI_SECTOR_LABEL,
  aiDecisionMeta,
  auditActionLabel,
  AVAILABILITY_STATUS,
  AVAILABILITY_STATUS_ORDER,
  CAMPAIGN_TIMELINE_STEPS,
  canAdminReject,
  canAdminRerunAi,
  canAdminValidate,
  canCancelReservation,
  canEditPriority,
  canReopen,
  canResubmit,
  canRunAiAsOwner,
  editReopens,
  EMERGENCY_STATE,
  getCampaignTimelineStep,
  isClientBlocked,
  isContentEditable,
  isDeletable,
  isReservable,
  OCR_ENGINE_LABEL,
  rejectBlocksDiffusion,
  TERMINATION_REASON_LABEL,
  URGENCY_LEVEL,
  URGENCY_RANK,
  validationNeedsOverride,
} from "@/lib/campaign-status";
import { AI_SECTORS, AVAILABILITY_STATUSES, CAMPAIGN_STATUSES } from "@/lib/api/types";

const ALL = CAMPAIGN_STATUSES;

describe("v2 status machine rules (contract §2.1)", () => {
  it("reopens only REJECTED_BY_AI and BLOCKED, and editing them reopens first", () => {
    expect(ALL.filter(canReopen)).toEqual(["REJECTED_BY_AI", "BLOCKED"]);
    expect(ALL.filter(editReopens)).toEqual(["REJECTED_BY_AI", "BLOCKED"]);
  });

  it("deletes BROUILLON / REJECTED_BY_AI / BLOCKED only", () => {
    expect(ALL.filter(isDeletable)).toEqual(["BROUILLON", "REJECTED_BY_AI", "BLOCKED"]);
  });

  it("allows media and reservations in BROUILLON exactly", () => {
    expect(ALL.filter(isContentEditable)).toEqual(["BROUILLON"]);
  });

  it("offers resubmission from a draft or a reopenable status", () => {
    expect(ALL.filter(canResubmit)).toEqual(["BROUILLON", "REJECTED_BY_AI", "BLOCKED"]);
  });

  it("maps AI eligibility for owner and administrator", () => {
    expect(ALL.filter(canRunAiAsOwner)).toEqual(["BROUILLON", "PENDING_AI_CHECK"]);
    expect(ALL.filter(canAdminRerunAi)).toEqual([
      "PENDING_AI_CHECK",
      "APPROVED_BY_AI",
      "REVIEW_REQUIRED",
    ]);
  });

  it("maps admin decisions", () => {
    expect(ALL.filter(canAdminValidate)).toEqual(["APPROVED_BY_AI", "REVIEW_REQUIRED"]);
    expect(ALL.filter(validationNeedsOverride)).toEqual(["REVIEW_REQUIRED"]);
    expect(ALL.filter(canAdminReject)).toEqual([
      "APPROVED_BY_AI",
      "REVIEW_REQUIRED",
      "REJECTED_BY_AI",
      "VALIDATED_BY_ADMIN",
      "ACTIVE",
    ]);
    expect(ALL.filter(rejectBlocksDiffusion)).toEqual(["VALIDATED_BY_ADMIN", "ACTIVE"]);
    expect(ALL.filter(canEditPriority)).toEqual([
      "APPROVED_BY_AI",
      "REVIEW_REQUIRED",
      "VALIDATED_BY_ADMIN",
      "ACTIVE",
    ]);
  });
});

describe("lifecycle timeline", () => {
  it("has the six contract steps", () => {
    expect(CAMPAIGN_TIMELINE_STEPS).toEqual([
      "Brouillon",
      "Analyse IA",
      "Validation TPUB",
      "Programmée",
      "En diffusion",
      "Terminée",
    ]);
  });

  it.each([
    ["BROUILLON", 0, "current"],
    ["PENDING_AI_CHECK", 1, "current"],
    ["REJECTED_BY_AI", 1, "failed"],
    ["APPROVED_BY_AI", 2, "current"],
    ["REVIEW_REQUIRED", 2, "current"],
    ["BLOCKED", 2, "failed"],
    ["VALIDATED_BY_ADMIN", 3, "current"],
    ["ACTIVE", 4, "current"],
    ["TERMINATED", 5, "complete"],
  ] as const)("%s → step %i (%s)", (status, index, state) => {
    expect(getCampaignTimelineStep(status)).toEqual({ index, state });
  });
});

describe("reservation cancellation", () => {
  it("trusts the backend flag when present", () => {
    expect(
      canCancelReservation(
        { reservationStatus: "CONFIRMEE", campaignStatus: "ACTIVE", cancellable: true },
        "ANNONCEUR",
      ),
    ).toBe(true);
    expect(
      canCancelReservation(
        { reservationStatus: "TEMPORAIRE", campaignStatus: "BROUILLON", cancellable: false },
        "ANNONCEUR",
      ),
    ).toBe(false);
  });

  it("falls back to the contract rule", () => {
    const temp = { reservationStatus: "TEMPORAIRE" as const };
    expect(canCancelReservation({ ...temp, campaignStatus: "BROUILLON" }, "ANNONCEUR")).toBe(true);
    expect(canCancelReservation({ ...temp, campaignStatus: "REJECTED_BY_AI" }, "ANNONCEUR")).toBe(
      true,
    );
    expect(canCancelReservation({ ...temp, campaignStatus: "APPROVED_BY_AI" }, "ANNONCEUR")).toBe(
      false,
    );
    expect(
      canCancelReservation(
        { reservationStatus: "CONFIRMEE", campaignStatus: "ACTIVE" },
        "ANNONCEUR",
      ),
    ).toBe(false);
    expect(
      canCancelReservation(
        { reservationStatus: "CONFIRMEE", campaignStatus: "ACTIVE" },
        "ADMINISTRATEUR",
      ),
    ).toBe(true);
    expect(canCancelReservation({ reservationStatus: "ANNULEE" }, "ADMINISTRATEUR")).toBe(false);
    expect(canCancelReservation({ ...temp, campaignStatus: "BROUILLON" }, "SUPERVISEUR")).toBe(
      false,
    );
  });
});

describe("labels", () => {
  it("labels the five availability states in bookable order", () => {
    expect(AVAILABILITY_STATUS_ORDER).toEqual(AVAILABILITY_STATUSES);
    expect(AVAILABILITY_STATUSES.map((s) => AVAILABILITY_STATUS[s].label)).toEqual([
      "Disponible",
      "Réservé",
      "Occupé",
      "Maintenance",
      "Hors ligne",
    ]);
    expect(AVAILABILITY_STATUSES.filter(isReservable)).toEqual(["DISPONIBLE"]);
  });

  it("labels urgency levels and ranks them like the engine", () => {
    expect(Object.values(URGENCY_LEVEL).map((m) => m.label)).toEqual([
      "Faible",
      "Moyen",
      "Élevé",
      "Critique",
    ]);
    expect(URGENCY_RANK.CRITICAL).toBeGreaterThan(URGENCY_RANK.HIGH);
    expect(URGENCY_RANK.MEDIUM).toBeGreaterThan(URGENCY_RANK.LOW);
  });

  it("labels emergency states, sectors, OCR engines and terminations in French", () => {
    expect(EMERGENCY_STATE.EN_COURS).toMatchObject({ label: "En cours", pulse: true });
    expect(EMERGENCY_STATE.DESACTIVE.label).toBe("Désactivé");
    expect(AI_SECTORS.every((s) => AI_SECTOR_LABEL[s].length > 2)).toBe(true);
    expect(OCR_ENGINE_LABEL.SIMULE).toBe("OCR simulé");
    expect(TERMINATION_REASON_LABEL.BUDGET_EPUISE).toBe("Budget épuisé");
  });

  it("labels every audit action and entity, with a raw fallback", () => {
    for (const label of [
      ...Object.values(AUDIT_ACTION_LABEL),
      ...Object.values(AUDIT_ENTITY_LABEL),
    ]) {
      expect(label).not.toMatch(/_/);
    }
    expect(auditActionLabel("CAMPAIGN_VALIDATED_OVERRIDE")).toBe(
      "Campagne validée par dérogation à l'IA",
    );
    expect(auditActionLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("labels AI and admin decisions (REJECTED depends on who decided)", () => {
    expect(aiDecisionMeta("AI", "REJECTED").label).toBe("IA : à corriger");
    expect(aiDecisionMeta("ADMIN", "REJECTED").label).toBe("Refusée");
    expect(aiDecisionMeta("ADMIN", "VALIDATED_OVERRIDE").tone).toBe("warning");
    expect(aiDecisionMeta("ADMIN", "OTHER").label).toBe("OTHER");
  });

  it("blocks only rejected or suspended clients", () => {
    expect(isClientBlocked("REJECTED")).toBe(true);
    expect(isClientBlocked("SUSPENDED")).toBe(true);
    expect(isClientBlocked("PENDING")).toBe(false);
    expect(isClientBlocked(null)).toBe(false);
  });
});
