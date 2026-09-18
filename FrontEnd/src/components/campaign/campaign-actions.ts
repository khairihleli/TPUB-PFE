/**
 * What an advertiser may do with a campaign (contract §2.1, §5 F2). Pure: the detail page, the
 * list and the wizard all branch on this matrix. The backend flags (`editable`, `submittable`,
 * `deletable`) win when present; the status rules of `@/lib/campaign-status` are the fallback.
 */
import type { CampaignResponse, CampaignStatus } from "@/lib/api/types";
import {
  canReopen,
  canSubmit,
  isAwaitingAdmin,
  isDeletable,
  isEditable,
} from "@/lib/campaign-status";
import {
  parseWizardStepV2Param,
  routes,
  WIZARD_V2_STEP_NUMBER,
  type WizardStepV2,
} from "@/lib/routes";

export interface CampaignActions {
  /** Draft: resume the wizard (content, zones, review). */
  resume: boolean;
  /** PUT allowed (REJECTED_BY_AI / BLOCKED are reopened to BROUILLON by the backend). */
  edit: boolean;
  /** Editing sends the campaign back to BROUILLON: ask for confirmation first. */
  editReopens: boolean;
  /** POST /reopen (« Corriger »). */
  reopen: boolean;
  /** DELETE allowed. */
  remove: boolean;
  /** POST /submit (runs the AI analysis). Needs at least one reservation. */
  submit: boolean;
  /** Why submit is unavailable although the status allows it. */
  submitBlockedReason: string | null;
  /** Submitted but the AI result is missing: POST /ai/check-content again. */
  runAiCheck: boolean;
  /** Server duplication (always offered to the owner). */
  duplicate: boolean;
  /** Waiting for a ZELQANE expert decision: nothing to do. */
  awaitingDecision: boolean;
}

type ActionSource =
  CampaignStatus | Pick<CampaignResponse, "status" | "editable" | "submittable" | "deletable">;

export function getCampaignActions(
  campaign: ActionSource,
  { reservationCount }: { reservationCount: number },
): CampaignActions {
  const c = typeof campaign === "string" ? { status: campaign } : campaign;
  const status = c.status;
  const flags = c as Partial<Pick<CampaignResponse, "editable" | "submittable" | "deletable">>;
  const submitAllowed = flags.submittable ?? canSubmit(status);
  const hasReservation = reservationCount > 0;
  return {
    resume: status === "BROUILLON",
    edit: flags.editable ?? isEditable(status),
    editReopens: canReopen(status),
    reopen: canReopen(status),
    remove: flags.deletable ?? isDeletable(status),
    submit: submitAllowed && hasReservation,
    submitBlockedReason:
      submitAllowed && !hasReservation
        ? "Réservez au moins un Porteur avant de soumettre la campagne."
        : null,
    runAiCheck: status === "PENDING_AI_CHECK",
    duplicate: true,
    awaitingDecision: isAwaitingAdmin(status),
  };
}

/** One-line « what happens next » for lists and the detail header. */
export function nextStepHint(status: CampaignStatus, reservationCount?: number): string {
  switch (status) {
    case "BROUILLON":
      return reservationCount === 0
        ? "Choisissez votre zone et vos Porteurs pour continuer."
        : "Brouillon à vérifier puis à soumettre.";
    case "PENDING_AI_CHECK":
      return "Soumise : résultat de l'analyse IA en attente.";
    case "APPROVED_BY_AI":
    case "REVIEW_REQUIRED":
      return "Un expert ZELQANE va statuer.";
    case "REJECTED_BY_AI":
      return "À corriger : modifiez la campagne puis soumettez-la à nouveau.";
    case "VALIDATED_BY_ADMIN":
      return "Programmée : diffusion à partir de la date de début.";
    case "ACTIVE":
      return "Diffusion sur les créneaux réservés.";
    case "TERMINATED":
      return "Diffusion terminée.";
    case "BLOCKED":
      return "Refusée par ZELQANE : corrigez-la selon le motif puis soumettez-la à nouveau.";
  }
}

// ---------------------------------------------------------------------------
// Wizard steps (URL: ?id=<campaignId>&etape=<1..4>) — delegates to routes.ts
// ---------------------------------------------------------------------------
export const WIZARD_STEPS = [
  { step: 1, key: "details", label: "Détails", short: "Détails" },
  { step: 2, key: "contenu", label: "Contenu", short: "Contenu" },
  { step: 3, key: "porteurs", label: "Zone & Porteurs", short: "Porteurs" },
  { step: 4, key: "verification", label: "Vérification & envoi", short: "Vérification" },
] as const satisfies readonly {
  step: 1 | 2 | 3 | 4;
  key: WizardStepV2;
  label: string;
  short: string;
}[];

export type WizardStep = 1 | 2 | 3 | 4;

/** "?etape=3" → 3 ; step names accepted ; missing/invalid → 1. */
export function parseWizardStep(raw: string | null | undefined): WizardStep {
  return WIZARD_V2_STEP_NUMBER[parseWizardStepV2Param(raw)];
}

/** "?id=12" → 12 ; missing/invalid → null. Never trusted: always checked against /mine. */
export function parseCampaignId(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Highest step the advertiser may open: only « Détails » before the draft exists, every step
 * afterwards (the review step lists what is still missing before submission).
 */
export function maxReachableStep({ hasCampaign }: { hasCampaign: boolean }): WizardStep {
  return hasCampaign ? 4 : 1;
}

export function clampWizardStep(requested: WizardStep, ctx: { hasCampaign: boolean }): WizardStep {
  const max = maxReachableStep(ctx);
  return requested > max ? max : requested;
}

/** Wizard link. Accepts numbers 1–4 and step names. A new campaign on step 1 has no query. */
export function wizardHref(id: number | null, step: WizardStep | WizardStepV2 = 1): string {
  const number = typeof step === "number" ? step : WIZARD_V2_STEP_NUMBER[step];
  return routes.espace.wizard(id, id === null && number === 1 ? undefined : number);
}

/** Campaign reference shown to advertisers and in mails: CAMP-00007. */
export function campaignReference(id: number): string {
  return `CAMP-${String(id).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Submission checklist (mirrors the 400 SUBMIT_INCOMPLETE keys, contract §2.1)
// ---------------------------------------------------------------------------
export type ChecklistKey = "period" | "times" | "budget" | "zones" | "reservations";

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  ok: boolean;
  /** What to do when not ok. */
  hint: string;
  /** Wizard step that fixes it. */
  step: WizardStep;
}

export function submitChecklist(
  campaign: Pick<
    CampaignResponse,
    "startDate" | "endDate" | "startTime" | "endTime" | "budget" | "zones"
  >,
  { reservationCount, today }: { reservationCount: number; today: string },
): ChecklistItem[] {
  const periodOk =
    Boolean(campaign.startDate && campaign.endDate) &&
    (campaign.endDate as string) >= today &&
    (campaign.endDate as string) >= (campaign.startDate as string);
  const timesOk =
    Boolean(campaign.startTime && campaign.endTime) &&
    (campaign.startTime as string) < (campaign.endTime as string);
  return [
    {
      key: "period",
      label: "Période de diffusion",
      ok: periodOk,
      hint: "Renseignez des dates de début et de fin à venir.",
      step: 1,
    },
    {
      key: "times",
      label: "Créneau horaire",
      ok: timesOk,
      hint: "Choisissez un créneau (matin, après-midi, soir, journée ou personnalisé).",
      step: 1,
    },
    {
      key: "budget",
      label: "Budget",
      ok: Number.isFinite(campaign.budget) && campaign.budget > 0,
      hint: "Indiquez un budget supérieur à 0 TND.",
      step: 1,
    },
    {
      key: "zones",
      label: "Zone de diffusion",
      ok: (campaign.zones?.length ?? 0) > 0,
      hint: "Placez au moins une zone sur la carte.",
      step: 3,
    },
    {
      key: "reservations",
      label: "Porteurs réservés",
      ok: reservationCount > 0,
      hint: "Réservez au moins un Porteur disponible dans la zone.",
      step: 3,
    },
  ];
}
