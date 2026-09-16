/**
 * What an advertiser may do with a campaign, by status (contract §5.2, §6, §7.13).
 * Pure: the detail page, the list and the wizard all branch on this matrix.
 */
import type {
  CampaignRequest,
  CampaignResponse,
  CampaignStatus,
  ReservationRequest,
  ReservationResponse,
  SupportAvailabilitySlot,
} from "@/lib/api/types";
import { canSubmit, isEditable } from "@/lib/campaign-status";
import { isRangeFree } from "@/lib/network/availability";
import {
  parseWizardStepParam,
  routes,
  WIZARD_STEP_NUMBER,
  type WizardStep as WizardStepName,
} from "@/lib/routes";

export interface CampaignActions {
  /** Resume the wizard (reservations, review). */
  resume: boolean;
  /** PUT allowed: /modifier. */
  edit: boolean;
  /** DELETE allowed. */
  remove: boolean;
  /** POST /submit then POST /ai/check-content. Needs at least one reservation. */
  submit: boolean;
  /** Why submit is unavailable although the status allows it. */
  submitBlockedReason: string | null;
  /** Submitted but the AI check never ran (or failed): POST /ai/check-content again. */
  runAiCheck: boolean;
  /** Dead end: POST a new campaign with the same fields. */
  duplicate: boolean;
  /** Waiting for a TPUB expert decision: nothing to do. */
  awaitingDecision: boolean;
}

export function getCampaignActions(
  status: CampaignStatus,
  { reservationCount }: { reservationCount: number },
): CampaignActions {
  const submitAllowed = canSubmit(status);
  const hasReservation = reservationCount > 0;
  return {
    resume: status === "BROUILLON",
    edit: isEditable(status),
    remove: isEditable(status),
    submit: submitAllowed && hasReservation,
    submitBlockedReason:
      submitAllowed && !hasReservation
        ? "Réservez au moins un Porteur avant de soumettre la campagne."
        : null,
    runAiCheck: status === "PENDING_AI_CHECK",
    duplicate: status === "REJECTED_BY_AI" || status === "BLOCKED",
    awaitingDecision: status === "APPROVED_BY_AI" || status === "REVIEW_REQUIRED",
  };
}

/** One-line « what happens next » for lists and the detail header. */
export function nextStepHint(status: CampaignStatus, reservationCount?: number): string {
  switch (status) {
    case "BROUILLON":
      return reservationCount === 0
        ? "Choisissez vos Porteurs pour continuer."
        : "Brouillon à finaliser puis à soumettre.";
    case "PENDING_AI_CHECK":
      return "Soumise : résultat de l'analyse IA en attente.";
    case "APPROVED_BY_AI":
    case "REVIEW_REQUIRED":
      return "Un expert TPUB va statuer.";
    case "REJECTED_BY_AI":
      return "À dupliquer puis corriger avant une nouvelle soumission.";
    case "VALIDATED_BY_ADMIN":
    case "ACTIVE":
      return "Diffusion sur les créneaux réservés.";
    case "TERMINATED":
      return "Période de diffusion achevée.";
    case "BLOCKED":
      return "Refusée : cette campagne ne sera pas diffusée.";
  }
}

// ---------------------------------------------------------------------------
// Wizard steps (URL: ?id=<campaignId>&etape=<1..3>, legacy 4 → 3) — delegates to routes.ts
// ---------------------------------------------------------------------------
export const WIZARD_STEPS = [
  { step: 1, key: "details", label: "Détails", short: "Détails" },
  { step: 2, key: "porteurs", label: "Porteurs", short: "Porteurs" },
  { step: 3, key: "verification", label: "Vérification & envoi", short: "Vérification" },
] as const satisfies readonly {
  step: 1 | 2 | 3;
  key: WizardStepName;
  label: string;
  short: string;
}[];

export type WizardStep = 1 | 2 | 3;

/** "?etape=2" → 2 ; legacy "3" (créatif) and "4" → 3 ; names accepted ; missing/invalid → 1. */
export function parseWizardStep(raw: string | null | undefined): WizardStep {
  return WIZARD_STEP_NUMBER[parseWizardStepParam(raw)];
}

/** "?id=12" → 12 ; missing/invalid → null. Never trusted: always checked against /mine. */
export function parseCampaignId(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Highest step the advertiser may open, enforcing the backend ordering (contract §6):
 * create (1) → reserve (2) → submit (3).
 */
export function maxReachableStep({
  hasCampaign,
  reservationCount,
}: {
  hasCampaign: boolean;
  reservationCount: number;
}): WizardStep {
  if (!hasCampaign) return 1;
  if (reservationCount < 1) return 2;
  return 3;
}

export function clampWizardStep(
  requested: WizardStep,
  ctx: { hasCampaign: boolean; reservationCount: number },
): WizardStep {
  const max = maxReachableStep(ctx);
  return requested > max ? max : requested;
}

/**
 * Wizard link. Accepts numbers 1–3 (legacy 4 → 3) and step names. A new campaign on step 1 has
 * no query string.
 */
export function wizardHref(id: number | null, step: WizardStep | 4 | WizardStepName = 1): string {
  const number =
    typeof step === "number" ? parseWizardStep(String(step)) : WIZARD_STEP_NUMBER[step];
  return routes.espace.wizard(id, id === null && number === 1 ? undefined : number);
}

/** Campaign reference shown to advertisers and in mails: CAMP-00007. */
export function campaignReference(id: number): string {
  return `CAMP-${String(id).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// « Changer de période » (FLOW-01): no reservation update/delete endpoint (§7.7), so the draft
// is duplicated on the new period, the original is deleted (its créneaux are freed), then the
// Porteurs that are free on the new period are booked again.
// ---------------------------------------------------------------------------
export interface NewPeriod {
  startDate: string;
  endDate: string;
  /** "HH:mm" or "HH:mm:ss" */
  startTime: string;
  /** "HH:mm" or "HH:mm:ss" */
  endTime: string;
}

type OwnSlot = Pick<
  ReservationResponse,
  "supportId" | "startDate" | "endDate" | "startTime" | "endTime"
>;

function sameTime(a: string, b: string): boolean {
  return a.slice(0, 5) === b.slice(0, 5);
}

/**
 * Slots of `supportId` minus the ones identical to this campaign's own créneaux on it (they are
 * freed when the original draft is deleted).
 */
export function withoutOwnSlots(
  slots: readonly SupportAvailabilitySlot[],
  supportId: number,
  own: readonly OwnSlot[],
): SupportAvailabilitySlot[] {
  const mine = own.filter((r) => r.supportId === supportId);
  return slots.filter(
    (s) =>
      !mine.some(
        (r) =>
          r.startDate === s.startDate &&
          r.endDate === s.endDate &&
          sameTime(r.startTime, s.startTime) &&
          sameTime(r.endTime, s.endTime),
      ),
  );
}

export type PrecheckState = "loading" | "free" | "busy" | "error";

export interface PeriodPrecheck {
  /** Per booked Porteur. */
  bySupport: Map<number, { state: PrecheckState; slots: SupportAvailabilitySlot[] }>;
  available: number[];
  unavailable: number[];
  /** Availability could not be read (treated as « not kept » unless retried). */
  errored: number[];
  loading: boolean;
}

/**
 * Availability pre-check of the campaign's booked Porteurs for a new period, ignoring the
 * campaign's own créneaux. `entries` comes from useSupportsAvailability.
 */
export function precheckPeriodChange(
  own: readonly OwnSlot[],
  entries: ReadonlyMap<number, { state: PrecheckState; slots: readonly SupportAvailabilitySlot[] }>,
  start: string,
  end: string,
): PeriodPrecheck {
  const ids = [...new Set(own.map((r) => r.supportId))];
  const bySupport = new Map<number, { state: PrecheckState; slots: SupportAvailabilitySlot[] }>();
  const available: number[] = [];
  const unavailable: number[] = [];
  const errored: number[] = [];
  let loading = false;
  for (const id of ids) {
    const entry = entries.get(id);
    if (!entry || entry.state === "loading") {
      loading = true;
      bySupport.set(id, { state: "loading", slots: [] });
      continue;
    }
    if (entry.state === "error") {
      errored.push(id);
      bySupport.set(id, { state: "error", slots: [] });
      continue;
    }
    const slots = withoutOwnSlots(entry.slots, id, own);
    const free = isRangeFree(slots, start, end);
    bySupport.set(id, { state: free ? "free" : "busy", slots });
    (free ? available : unavailable).push(id);
  }
  return { bySupport, available, unavailable, errored, loading };
}

export interface PeriodChangeApi {
  duplicate: (
    source: CampaignResponse,
    overrides: Partial<CampaignRequest>,
  ) => Promise<CampaignResponse>;
  remove: (id: number) => Promise<unknown>;
  reserve: (body: ReservationRequest) => Promise<ReservationResponse>;
}

export type PeriodChangeResult =
  /** The copy could not be created: nothing changed. */
  | { ok: false; stage: "duplicate"; error: unknown }
  /**
   * The original could not be deleted: the copy is deleted again (`rollbackFailed` when that
   * also failed, the copy then still exists as `copy`).
   */
  | {
      ok: false;
      stage: "delete";
      error: unknown;
      copy: CampaignResponse;
      rollbackFailed: boolean;
    }
  | {
      ok: true;
      campaign: CampaignResponse;
      rebooked: ReservationResponse[];
      failed: { supportId: number; error: unknown }[];
      /** Not kept because busy (or unreadable) on the new period. */
      skipped: number[];
    };

function toHms(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

/**
 * duplicate(source, period) → remove(original) → reserve each available Porteur (concurrency ≤ 2,
 * the SUPPORT's own zone as recorded on the original créneau).
 */
export async function changeCampaignPeriod(
  {
    source,
    period,
    reservations,
    availableSupportIds,
    concurrency = 2,
  }: {
    source: CampaignResponse;
    period: NewPeriod;
    /** Active créneaux of the original draft. */
    reservations: readonly ReservationResponse[];
    availableSupportIds: readonly number[];
    concurrency?: 1 | 2;
  },
  api: PeriodChangeApi,
): Promise<PeriodChangeResult> {
  let copy: CampaignResponse;
  try {
    copy = await api.duplicate(source, {
      startDate: period.startDate,
      endDate: period.endDate,
      startTime: toHms(period.startTime),
      endTime: toHms(period.endTime),
    });
  } catch (error) {
    return { ok: false, stage: "duplicate", error };
  }

  try {
    await api.remove(source.id);
  } catch (error) {
    let rollbackFailed = false;
    try {
      await api.remove(copy.id);
    } catch {
      rollbackFailed = true;
    }
    return { ok: false, stage: "delete", error, copy, rollbackFailed };
  }

  const wanted = new Set(availableSupportIds);
  const seen = new Set<number>();
  const targets: ReservationResponse[] = [];
  const skipped: number[] = [];
  for (const r of reservations) {
    if (seen.has(r.supportId)) continue;
    seen.add(r.supportId);
    if (wanted.has(r.supportId)) targets.push(r);
    else skipped.push(r.supportId);
  }

  const rebooked: ReservationResponse[] = [];
  const failed: { supportId: number; error: unknown }[] = [];
  let next = 0;
  const lane = async () => {
    while (next < targets.length) {
      const r = targets[next++] as ReservationResponse;
      try {
        rebooked.push(
          await api.reserve({
            campaignId: copy.id,
            zoneId: r.zoneId,
            supportId: r.supportId,
            startDate: period.startDate,
            endDate: period.endDate,
            startTime: toHms(period.startTime),
            endTime: toHms(period.endTime),
          }),
        );
      } catch (error) {
        failed.push({ supportId: r.supportId, error });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, targets.length)) }, lane),
  );

  return { ok: true, campaign: copy, rebooked, failed, skipped };
}
