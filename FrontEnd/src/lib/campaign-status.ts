/**
 * Status semantics (UX-PLAN §4.8, VD-01/VD-02/FLOW-19). One tone per lifecycle phase; labels
 * depend on the audience (annonceur: what happens next · staff: precise AI/admin wording).
 * Charts, buckets, list tabs and pills all read from this module.
 */
import {
  RESERVATION_HINT,
  RESERVATION_LABEL,
  RESERVATION_LABEL_LONG,
  REVIEW_WAIT_SENTENCE,
} from "@/content/glossary";
import type {
  AiReportStatusUpper,
  CampaignResponse,
  CampaignStatus,
  ReservationStatus,
  RoleCode,
  SupportType,
  TechnicalStatus,
  UrgencyLevel,
} from "@/lib/api/types";
import { formatDate, formatRelative, todayISO } from "@/lib/format";

/**
 * Visual tone shared by every status pill / badge.
 * `violet` = scheduled, `neutral` = draft. `blue` stays for actions/links only (never a status);
 * `info` is for informational alerts, not a campaign status.
 */
export type Tone =
  "info" | "warning" | "blue" | "success" | "muted" | "danger" | "violet" | "neutral";

/** Lifecycle phase of a campaign; each phase owns exactly one tone. */
export type CampaignPhase = "draft" | "pending" | "scheduled" | "live" | "ended" | "problem";

export const PHASE_TONE: Readonly<Record<CampaignPhase, Tone>> = {
  draft: "neutral",
  pending: "warning",
  scheduled: "violet",
  live: "success",
  ended: "muted",
  problem: "danger",
};

/** Who reads the label: advertisers get « what happens next », staff get precise wording. */
export type StatusAudience = "annonceur" | "staff";

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Short explanation for tooltips, detail pages and the public status table. */
  description: string;
  /** Pulsing dot (only "en diffusion"). */
  pulse?: boolean;
}

export interface CampaignStatusMeta extends StatusMeta {
  phase: CampaignPhase;
  /** Secondary line under the pill (« Analyse favorable »…). Null when nothing to add. */
  hint: string | null;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

/** Derived, client-side only (contract §7.15). */
export type DerivedCampaignStatus = "SCHEDULED" | "ENDED";
export type CampaignDisplayStatus = CampaignStatus | DerivedCampaignStatus;

export const CAMPAIGN_DISPLAY_STATUSES: readonly CampaignDisplayStatus[] = [
  "BROUILLON",
  "PENDING_AI_CHECK",
  "APPROVED_BY_AI",
  "REVIEW_REQUIRED",
  "REJECTED_BY_AI",
  "VALIDATED_BY_ADMIN",
  "SCHEDULED",
  "ACTIVE",
  "TERMINATED",
  "ENDED",
  "BLOCKED",
];

const PHASE_OF: Record<CampaignDisplayStatus, CampaignPhase> = {
  BROUILLON: "draft",
  PENDING_AI_CHECK: "pending",
  APPROVED_BY_AI: "pending",
  REVIEW_REQUIRED: "pending",
  REJECTED_BY_AI: "problem",
  VALIDATED_BY_ADMIN: "scheduled",
  SCHEDULED: "scheduled",
  ACTIVE: "live",
  TERMINATED: "ended",
  ENDED: "ended",
  BLOCKED: "problem",
};

function meta(
  key: CampaignDisplayStatus,
  label: string,
  description: string,
  hint: string | null = null,
): CampaignStatusMeta {
  const phase = PHASE_OF[key];
  return {
    label,
    tone: PHASE_TONE[phase],
    description,
    hint,
    phase,
    ...(phase === "live" ? { pulse: true } : {}),
  };
}

/** Staff audience (precise). Also the default map for backward-compatible consumers. */
export const CAMPAIGN_STATUS: Readonly<Record<CampaignDisplayStatus, CampaignStatusMeta>> = {
  BROUILLON: meta("BROUILLON", "Brouillon", "Vous pouvez tout modifier."),
  PENDING_AI_CHECK: meta(
    "PENDING_AI_CHECK",
    "Analyse IA en attente",
    "Le contenu est soumis, l'analyse IA n'a pas encore rendu son avis.",
  ),
  APPROVED_BY_AI: meta(
    "APPROVED_BY_AI",
    "Avis IA favorable",
    "L'analyse est favorable, un expert TPUB doit statuer.",
  ),
  REVIEW_REQUIRED: meta(
    "REVIEW_REQUIRED",
    "Revue manuelle",
    "Certains points demandent un examen humain.",
  ),
  REJECTED_BY_AI: meta(
    "REJECTED_BY_AI",
    "À corriger",
    "Des corrections sont nécessaires, consultez les recommandations.",
  ),
  VALIDATED_BY_ADMIN: meta(
    "VALIDATED_BY_ADMIN",
    "Validée",
    "La campagne a été validée par un expert TPUB.",
  ),
  SCHEDULED: meta(
    "SCHEDULED",
    "Programmée",
    "Validée, la diffusion commencera à la date de début.",
  ),
  ACTIVE: meta("ACTIVE", "En diffusion", "La campagne passe sur ses créneaux."),
  TERMINATED: meta("TERMINATED", "Terminée", "La période de diffusion est achevée."),
  ENDED: meta("ENDED", "Terminée", "La période de diffusion est achevée."),
  BLOCKED: meta("BLOCKED", "Refusée", "La campagne ne sera pas diffusée."),
};

/** Advertiser audience (UX-PLAN §4.8): labels differ only when the required action differs. */
export const CAMPAIGN_STATUS_ANNONCEUR: Readonly<
  Record<CampaignDisplayStatus, CampaignStatusMeta>
> = {
  BROUILLON: meta(
    "BROUILLON",
    "Brouillon",
    "Vous pouvez tout modifier.",
    "Vous pouvez tout modifier.",
  ),
  PENDING_AI_CHECK: meta(
    "PENDING_AI_CHECK",
    "Analyse IA en cours",
    "Votre contenu est en cours d'analyse.",
    "Résultat sur cette page après actualisation",
  ),
  APPROVED_BY_AI: meta(
    "APPROVED_BY_AI",
    "En examen TPUB",
    `L'analyse est favorable. ${REVIEW_WAIT_SENTENCE}`,
    "Analyse favorable",
  ),
  REVIEW_REQUIRED: meta(
    "REVIEW_REQUIRED",
    "En examen TPUB",
    `Quelques points sont à vérifier par l'équipe. ${REVIEW_WAIT_SENTENCE}`,
    "Quelques points à vérifier par l'équipe",
  ),
  REJECTED_BY_AI: meta(
    "REJECTED_BY_AI",
    "À corriger",
    "Des corrections sont nécessaires : dupliquez la campagne pour la corriger.",
    "Dupliquez la campagne pour la corriger",
  ),
  VALIDATED_BY_ADMIN: meta(
    "VALIDATED_BY_ADMIN",
    "Programmée",
    "Validée par TPUB, la diffusion suit la période de la campagne.",
    "Diffusion à partir de la date de début",
  ),
  SCHEDULED: meta(
    "SCHEDULED",
    "Programmée",
    "Validée par TPUB, la diffusion commencera à la date de début.",
    "Diffusion à partir de la date de début",
  ),
  ACTIVE: meta("ACTIVE", "En diffusion", "Votre campagne passe sur ses créneaux."),
  TERMINATED: meta("TERMINATED", "Terminée", "La période de diffusion est achevée."),
  ENDED: meta("ENDED", "Terminée", "La période de diffusion est achevée."),
  BLOCKED: meta(
    "BLOCKED",
    "Refusée",
    "La campagne ne sera pas diffusée.",
    "Contactez TPUB pour connaître le motif",
  ),
};

export function campaignStatusFor(
  status: CampaignDisplayStatus,
  audience: StatusAudience = "staff",
): CampaignStatusMeta {
  return (audience === "annonceur" ? CAMPAIGN_STATUS_ANNONCEUR : CAMPAIGN_STATUS)[status];
}

type CampaignLike = Pick<CampaignResponse, "status" | "startDate" | "endDate">;

/**
 * Applies the derived states: "Programmée" when ACTIVE and startDate > today,
 * "Terminée" when ACTIVE/VALIDATED and endDate < today.
 */
export function getCampaignDisplayStatus(
  campaign: CampaignLike,
  today: string = todayISO(),
): CampaignDisplayStatus {
  const { status, startDate, endDate } = campaign;
  if (status === "ACTIVE" || status === "VALIDATED_BY_ADMIN") {
    if (endDate && endDate < today) return "ENDED";
    if (status === "ACTIVE" && startDate && startDate > today) return "SCHEDULED";
  }
  return status;
}

export function getCampaignPhase(
  campaign: CampaignLike,
  today: string = todayISO(),
): CampaignPhase {
  return PHASE_OF[getCampaignDisplayStatus(campaign, today)];
}

export interface CampaignStatusOptions {
  audience?: StatusAudience;
  today?: string;
}

/**
 * `getCampaignStatusMeta(c)` (staff labels, backward compatible),
 * `getCampaignStatusMeta(c, "2026-09-12")` (legacy today param) or
 * `getCampaignStatusMeta(c, { audience: "annonceur", today })`.
 * For scheduled campaigns the hint carries the real start date.
 */
export function getCampaignStatusMeta(
  campaign: CampaignLike,
  options: string | CampaignStatusOptions = {},
): CampaignStatusMeta & { key: CampaignDisplayStatus } {
  const opts: CampaignStatusOptions = typeof options === "string" ? { today: options } : options;
  const today = opts.today ?? todayISO();
  const key = getCampaignDisplayStatus(campaign, today);
  const base = campaignStatusFor(key, opts.audience);
  let hint = base.hint;
  if (
    opts.audience === "annonceur" &&
    (key === "SCHEDULED" || key === "VALIDATED_BY_ADMIN") &&
    campaign.startDate
  ) {
    hint =
      campaign.startDate > today
        ? `Diffusion à partir du ${formatDate(campaign.startDate, "medium")}`
        : null;
  }
  return { key, ...base, hint };
}

export interface CampaignTimeCue {
  label: string;
  /** Attention tone only when the cue is a problem (e.g. start date already passed on a draft). */
  tone: "warning" | "danger" | null;
}

type TimeCueSource = Pick<
  CampaignResponse,
  "status" | "startDate" | "endDate" | "submittedAt" | "validatedAt"
>;

/**
 * Time cue from real data only (UX-PLAN §6.1): « Soumise il y a 3 h », « Diffusion dans 5 jours »,
 * « Terminée le 12 oct. 2026 », « Jusqu'au 31 oct. 2026 ». Null when no timestamp supports a cue.
 */
export function getCampaignTimeCue(
  campaign: TimeCueSource,
  today: string = todayISO(),
  now: Date = new Date(),
): CampaignTimeCue | null {
  const display = getCampaignDisplayStatus(campaign, today);
  const { startDate, endDate, submittedAt } = campaign;
  switch (display) {
    case "BROUILLON":
      if (!startDate) return null;
      if (startDate < today) return { label: "Date de début dépassée", tone: "warning" };
      return { label: `Début prévu ${formatRelative(startDate, now)}`, tone: null };
    case "PENDING_AI_CHECK":
    case "APPROVED_BY_AI":
    case "REVIEW_REQUIRED":
    case "REJECTED_BY_AI":
    case "BLOCKED":
      return submittedAt
        ? { label: `Soumise ${formatRelative(submittedAt, now)}`, tone: null }
        : null;
    case "VALIDATED_BY_ADMIN":
    case "SCHEDULED":
      if (startDate && startDate > today) {
        return { label: `Diffusion ${formatRelative(startDate, now)}`, tone: null };
      }
      return endDate ? { label: `Jusqu'au ${formatDate(endDate, "medium")}`, tone: null } : null;
    case "ACTIVE":
      return endDate ? { label: `Jusqu'au ${formatDate(endDate, "medium")}`, tone: null } : null;
    case "TERMINATED":
    case "ENDED":
      return endDate ? { label: `Terminée le ${formatDate(endDate, "medium")}`, tone: null } : null;
  }
}

/** Stepper: Brouillon → Analyse IA → Validation TPUB → Diffusion. */
export const CAMPAIGN_STEPS = ["Brouillon", "Analyse IA", "Validation TPUB", "Diffusion"] as const;

export interface CampaignStep {
  /** Index of the current step in CAMPAIGN_STEPS (0..3). */
  index: number;
  /** "failed" = the flow stopped at `index` (rejected). "complete" = all steps done. */
  state: "current" | "failed" | "complete";
}

export function getCampaignStep(status: CampaignStatus): CampaignStep {
  switch (status) {
    case "BROUILLON":
      return { index: 0, state: "current" };
    case "PENDING_AI_CHECK":
      return { index: 1, state: "current" };
    case "REJECTED_BY_AI":
      return { index: 1, state: "failed" };
    case "APPROVED_BY_AI":
    case "REVIEW_REQUIRED":
      return { index: 2, state: "current" };
    case "BLOCKED":
      return { index: 2, state: "failed" };
    case "VALIDATED_BY_ADMIN":
    case "ACTIVE":
      return { index: 3, state: "current" };
    case "TERMINATED":
      return { index: 3, state: "complete" };
  }
}

/** PUT / DELETE allowed (contract §5.2). */
export function isEditable(status: CampaignStatus): boolean {
  return status === "BROUILLON" || status === "REJECTED_BY_AI";
}

/** POST /submit allowed. */
export function canSubmit(status: CampaignStatus): boolean {
  return status === "BROUILLON";
}

/** REJECTED_BY_AI cannot be resubmitted: offer « Dupliquer » (contract §7.13). */
export function isDeadEnd(status: CampaignStatus): boolean {
  return status === "REJECTED_BY_AI";
}

/** Waiting for a TPUB admin decision. */
export function isAwaitingAdmin(status: CampaignStatus): boolean {
  return status === "APPROVED_BY_AI" || status === "REVIEW_REQUIRED";
}

// ---------------------------------------------------------------------------
// List tabs (?statut=) and buckets
// ---------------------------------------------------------------------------

/** Status filter tabs for campaign lists (URL `?statut=`). */
export const CAMPAIGN_FILTERS = [
  { value: "toutes", label: "Toutes", description: null, statuses: null },
  {
    value: "a-finaliser",
    label: "À finaliser",
    description: "Brouillons et campagnes à corriger",
    statuses: ["BROUILLON", "REJECTED_BY_AI"],
  },
  {
    value: "en-examen",
    label: "En examen",
    description: "Analyse IA ou examen par l'équipe TPUB",
    statuses: ["PENDING_AI_CHECK", "APPROVED_BY_AI", "REVIEW_REQUIRED"],
  },
  {
    value: "validees",
    label: "Validées",
    description: "Programmées ou en diffusion",
    statuses: ["VALIDATED_BY_ADMIN", "SCHEDULED", "ACTIVE"],
  },
  {
    value: "terminees",
    label: "Terminées & refusées",
    description: "Période achevée ou campagne refusée",
    statuses: ["TERMINATED", "ENDED", "BLOCKED"],
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  description: string | null;
  statuses: readonly CampaignDisplayStatus[] | null;
}>;

export type CampaignFilterValue = (typeof CAMPAIGN_FILTERS)[number]["value"];

/** Old `?statut=` values still accepted in links and bookmarks. */
export const LEGACY_CAMPAIGN_FILTERS: Readonly<Record<string, CampaignFilterValue>> = {
  brouillons: "a-finaliser",
  validation: "en-examen",
  diffusion: "validees",
  refusees: "terminees",
};

export function isCampaignFilterValue(value: unknown): value is CampaignFilterValue {
  return CAMPAIGN_FILTERS.some((f) => f.value === value);
}

/** `?statut=` → filter value (legacy values mapped, unknown → "toutes"). */
export function parseCampaignFilter(raw: string | null | undefined): CampaignFilterValue {
  if (isCampaignFilterValue(raw)) return raw;
  if (raw && raw in LEGACY_CAMPAIGN_FILTERS)
    return LEGACY_CAMPAIGN_FILTERS[raw] as CampaignFilterValue;
  return "toutes";
}

/**
 * Pass the campaign (not just its status) so derived states land in the right tab:
 * an ACTIVE campaign whose end date passed is « Terminée ». Legacy filter values are accepted.
 */
export function matchesCampaignFilter(
  statusOrCampaign: CampaignDisplayStatus | CampaignLike,
  filter: string,
  today: string = todayISO(),
): boolean {
  const value = parseCampaignFilter(filter);
  const def = CAMPAIGN_FILTERS.find((f) => f.value === value);
  if (!def || def.statuses === null) return true;
  const display =
    typeof statusOrCampaign === "string"
      ? statusOrCampaign
      : getCampaignDisplayStatus(statusOrCampaign, today);
  return (def.statuses as readonly CampaignDisplayStatus[]).includes(display);
}

export type CampaignBucketKey =
  | "brouillons"
  | "a-corriger"
  | "en-examen"
  | "programmees"
  | "en-diffusion"
  | "terminees"
  | "refusees";

export interface CampaignBucketDef {
  key: CampaignBucketKey;
  label: string;
  description: string;
  phase: CampaignPhase;
  /** Read from CAMPAIGN_STATUS (test-enforced): equals every member's pill tone. */
  tone: Tone;
  statuses: readonly CampaignDisplayStatus[];
  /** List tab containing every status of the bucket (for links « Voir ces campagnes »). */
  filter: CampaignFilterValue;
}

function bucket(
  key: CampaignBucketKey,
  label: string,
  description: string,
  statuses: readonly CampaignDisplayStatus[],
  filter: CampaignFilterValue,
): CampaignBucketDef {
  const first = CAMPAIGN_STATUS_ANNONCEUR[statuses[0] as CampaignDisplayStatus];
  return { key, label, description, phase: first.phase, tone: first.tone, statuses, filter };
}

/** Groups for charts, dashboard hints, Statistiques and the admin overview. */
export const CAMPAIGN_BUCKETS: readonly CampaignBucketDef[] = [
  bucket(
    "brouillons",
    "Brouillons",
    "Modifiables, pas encore soumises.",
    ["BROUILLON"],
    "a-finaliser",
  ),
  bucket(
    "a-corriger",
    "À corriger",
    "Rejetées par l'analyse IA : à dupliquer pour corriger.",
    ["REJECTED_BY_AI"],
    "a-finaliser",
  ),
  bucket(
    "en-examen",
    "En examen",
    "Analyse IA ou examen par l'équipe TPUB en cours.",
    ["PENDING_AI_CHECK", "APPROVED_BY_AI", "REVIEW_REQUIRED"],
    "en-examen",
  ),
  bucket(
    "programmees",
    "Programmées",
    "Validées, la diffusion n'a pas commencé.",
    ["VALIDATED_BY_ADMIN", "SCHEDULED"],
    "validees",
  ),
  bucket(
    "en-diffusion",
    "En diffusion",
    "Sur leurs créneaux en ce moment.",
    ["ACTIVE"],
    "validees",
  ),
  bucket(
    "terminees",
    "Terminées",
    "Période de diffusion achevée.",
    ["TERMINATED", "ENDED"],
    "terminees",
  ),
  bucket("refusees", "Refusées", "Refusées par TPUB, non diffusées.", ["BLOCKED"], "terminees"),
];

export function getCampaignBucket(
  campaign: CampaignLike,
  today: string = todayISO(),
): CampaignBucketDef {
  const display = getCampaignDisplayStatus(campaign, today);
  return (CAMPAIGN_BUCKETS.find((b) => b.statuses.includes(display)) ??
    CAMPAIGN_BUCKETS[0]) as CampaignBucketDef;
}

// ---------------------------------------------------------------------------
// AI report
// ---------------------------------------------------------------------------
export const AI_REPORT_STATUS: Record<AiReportStatusUpper, StatusMeta> = {
  APPROVED: {
    label: "Analyse favorable",
    tone: "success",
    description: "Analyse favorable. Votre campagne attend la validation d'un expert TPUB.",
  },
  REVIEW_REQUIRED: {
    label: "Revue manuelle",
    tone: "warning",
    description: "Certains points demandent un examen humain. Un expert TPUB va statuer.",
  },
  REJECTED: {
    label: "À corriger",
    tone: "danger",
    description:
      "Des corrections sont nécessaires. Dupliquez la campagne pour la corriger, puis soumettez la copie.",
  },
};

// ---------------------------------------------------------------------------
// Reservations (labels from the glossary)
// ---------------------------------------------------------------------------
export interface ReservationStatusMeta extends StatusMeta {
  longLabel: string;
}

export const RESERVATION_STATUS: Record<ReservationStatus, ReservationStatusMeta> = {
  TEMPORAIRE: {
    label: RESERVATION_LABEL.TEMPORAIRE,
    longLabel: RESERVATION_LABEL_LONG.TEMPORAIRE,
    tone: "warning",
    description: RESERVATION_HINT.TEMPORAIRE,
  },
  CONFIRMEE: {
    label: RESERVATION_LABEL.CONFIRMEE,
    longLabel: RESERVATION_LABEL_LONG.CONFIRMEE,
    tone: "success",
    description: RESERVATION_HINT.CONFIRMEE,
  },
  ANNULEE: {
    label: RESERVATION_LABEL.ANNULEE,
    longLabel: RESERVATION_LABEL_LONG.ANNULEE,
    tone: "neutral",
    description: RESERVATION_HINT.ANNULEE,
  },
  EXPIREE: {
    label: RESERVATION_LABEL.EXPIREE,
    longLabel: RESERVATION_LABEL_LONG.EXPIREE,
    tone: "muted",
    description: RESERVATION_HINT.EXPIREE,
  },
};

// ---------------------------------------------------------------------------
// Supports
// ---------------------------------------------------------------------------
export const TECHNICAL_STATUS: Record<TechnicalStatus, StatusMeta> = {
  ACTIF: { label: "Actif", tone: "success", description: "L'écran est opérationnel." },
  INACTIF: { label: "Inactif", tone: "muted", description: "L'écran n'est pas en service." },
  MAINTENANCE: {
    label: "Maintenance",
    tone: "warning",
    description: "L'écran est en cours de maintenance.",
  },
  HORS_LIGNE: { label: "Hors ligne", tone: "danger", description: "L'écran ne répond pas." },
};

export const SUPPORT_TYPE_LABEL: Record<SupportType, string> = {
  ECRAN: "Écran",
  PANNEAU_NUMERIQUE: "Panneau numérique",
  POINT_WIFI: "Point Wi-Fi",
  APPLICATION: "Application",
  SITE_WEB: "Site web",
};

// ---------------------------------------------------------------------------
// Emergency
// ---------------------------------------------------------------------------
export const URGENCY_LEVEL: Record<UrgencyLevel, StatusMeta> = {
  LOW: { label: "Faible", tone: "neutral", description: "Message d'information." },
  MEDIUM: { label: "Moyenne", tone: "info", description: "Message à diffuser rapidement." },
  HIGH: { label: "Élevée", tone: "warning", description: "Message prioritaire." },
  CRITICAL: { label: "Critique", tone: "danger", description: "Alerte critique." },
};

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export const ROLE_LABEL: Record<RoleCode, string> = {
  ADMINISTRATEUR: "Administrateur",
  ANNONCEUR: "Annonceur",
  OPERATEUR: "Opérateur",
  SUPERVISEUR: "Superviseur",
};
