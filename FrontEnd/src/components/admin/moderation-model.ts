/**
 * Moderation model (pure), contract §2.1 / §5 F3:
 * - tabs mapped to `GET /api/campaigns` status filters, search filters kept in the URL;
 * - decision rules (validate with override for REVIEW_REQUIRED, reject/block with a 3..1000 reason);
 * - review navigation, bulk validation and small display helpers.
 */
import type {
  CampaignAiStatus,
  CampaignResponse,
  CampaignSearchFilters,
  CampaignStatus,
  DashboardResponse,
  ReservationResponse,
  SupportResponse,
  SupportType,
  ZoneResponse,
} from "@/lib/api/types";
import { CAMPAIGN_STATUSES, SUPPORT_TYPES } from "@/lib/api/types";
import {
  canAdminReject,
  canAdminRerunAi,
  canAdminValidate,
  canEditPriority,
  rejectBlocksDiffusion,
  validationNeedsOverride,
} from "@/lib/campaign-status";

export const MODERATION_TABS = [
  {
    value: "a-traiter",
    label: "À traiter",
    statuses: ["APPROVED_BY_AI", "REVIEW_REQUIRED"],
    empty: "Aucune campagne n'attend de décision. La file se remplit après l'analyse IA.",
  },
  {
    value: "revue",
    label: "Revue manuelle",
    statuses: ["REVIEW_REQUIRED"],
    empty: "Aucune campagne signalée pour une revue manuelle.",
  },
  {
    value: "ia",
    label: "Analyse IA en attente",
    statuses: ["PENDING_AI_CHECK"],
    empty: "Aucune campagne soumise sans analyse IA.",
  },
  {
    value: "toutes",
    label: "Toutes",
    statuses: null,
    empty: "Aucune campagne sur la plateforme pour le moment.",
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  statuses: readonly CampaignStatus[] | null;
  empty: string;
}>;

export type ModerationTab = (typeof MODERATION_TABS)[number]["value"];

export const MODERATION_TAB_VALUES: readonly ModerationTab[] = MODERATION_TABS.map((t) => t.value);

/** Old spellings still accepted in `?onglet=`. */
export const LEGACY_MODERATION_TABS: Readonly<Record<string, ModerationTab>> = {
  analyse: "ia",
};

export function isModerationTab(v: string): v is ModerationTab {
  return MODERATION_TABS.some((t) => t.value === v);
}

/** `?onglet=` → tab (legacy values mapped, unknown → « À traiter »). */
export function parseModerationTab(raw: string | null | undefined): ModerationTab {
  if (raw && isModerationTab(raw)) return raw;
  if (raw && raw in LEGACY_MODERATION_TABS) return LEGACY_MODERATION_TABS[raw] ?? "a-traiter";
  return "a-traiter";
}

export function moderationTabDef(tab: ModerationTab) {
  return MODERATION_TABS.find((t) => t.value === tab) ?? MODERATION_TABS[0];
}

export function matchesTab(status: CampaignStatus, tab: ModerationTab): boolean {
  const def = MODERATION_TABS.find((t) => t.value === tab);
  if (!def || def.statuses === null) return true;
  return (def.statuses as readonly CampaignStatus[]).includes(status);
}

/** Tab counters from the dashboard counters (no extra list call). */
export function tabCountsFromDashboard(
  d: Pick<
    DashboardResponse,
    "totalCampaigns" | "aiPendingCampaigns" | "approvedByAiCampaigns" | "reviewRequiredCampaigns"
  >,
): Record<ModerationTab, number> {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    "a-traiter": num(d.approvedByAiCampaigns) + num(d.reviewRequiredCampaigns),
    revue: num(d.reviewRequiredCampaigns),
    ia: num(d.aiPendingCampaigns),
    toutes: num(d.totalCampaigns),
  };
}

/** Case/accent-insensitive text (search boxes). */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export function matchesQuery(
  c: Pick<CampaignResponse, "id" | "name" | "objective">,
  query: string,
): boolean {
  const q = normalizeText(query).replace(/^#/, "");
  if (!q) return true;
  if (/^\d+$/.test(q) && String(c.id) === q) return true;
  return normalizeText(`${c.name} ${c.objective ?? ""}`).includes(q);
}

export function queueTime(c: Pick<CampaignResponse, "submittedAt" | "createdAt">): string {
  return c.submittedAt ?? c.createdAt;
}

// ---------------------------------------------------------------------------
// Search filters (URL ⇄ GET /api/campaigns)
// ---------------------------------------------------------------------------
export const MODERATION_SORT_OPTIONS = [
  { value: "attente", label: "Attente la plus longue", api: "submittedAt,asc" },
  { value: "recentes", label: "Soumission la plus récente", api: "submittedAt,desc" },
  { value: "debut", label: "Début le plus proche", api: "startDate,asc" },
  { value: "creation", label: "Création la plus récente", api: "createdAt,desc" },
  { value: "budget", label: "Budget le plus élevé", api: "budget,desc" },
  { value: "nom", label: "Nom (A → Z)", api: "name,asc" },
] as const;

export type ModerationSortKey = (typeof MODERATION_SORT_OPTIONS)[number]["value"];
export const MODERATION_SORT_KEYS: readonly ModerationSortKey[] = MODERATION_SORT_OPTIONS.map(
  (o) => o.value,
);
export const DEFAULT_MODERATION_SORT: ModerationSortKey = "attente";

export function moderationSortApi(key: ModerationSortKey): string {
  return MODERATION_SORT_OPTIONS.find((o) => o.value === key)?.api ?? "submittedAt,asc";
}

/** « Trié par : … » caption. */
export function moderationSortCaption(key: ModerationSortKey): string {
  return (MODERATION_SORT_OPTIONS.find((o) => o.value === key)?.label ?? "").toLowerCase();
}

export const AI_STATUS_FILTERS: readonly CampaignAiStatus[] = [
  "APPROVED",
  "REVIEW_REQUIRED",
  "REJECTED",
];

export const MODERATION_PAGE_SIZE = 20;

export interface ModerationFilterState {
  tab: ModerationTab;
  q: string;
  client: string;
  zoneId: number | null;
  /** Only on « Toutes »: the tab statuses win otherwise. */
  status: CampaignStatus | null;
  aiStatus: CampaignAiStatus | null;
  from: string;
  to: string;
  supportType: SupportType | null;
  sort: ModerationSortKey;
  page: number;
}

export function isCampaignStatus(v: string | null | undefined): v is CampaignStatus {
  return typeof v === "string" && (CAMPAIGN_STATUSES as readonly string[]).includes(v);
}

export function isAiStatusFilter(v: string | null | undefined): v is CampaignAiStatus {
  return typeof v === "string" && (AI_STATUS_FILTERS as readonly string[]).includes(v);
}

export function isSupportType(v: string | null | undefined): v is SupportType {
  return typeof v === "string" && (SUPPORT_TYPES as readonly string[]).includes(v);
}

/** URL state → the exact query sent to `campaignsApi.search`. */
export function moderationSearchFilters(state: ModerationFilterState): CampaignSearchFilters {
  const def = moderationTabDef(state.tab);
  const statuses: readonly CampaignStatus[] | undefined = def.statuses
    ? def.statuses
    : state.status
      ? [state.status]
      : undefined;
  const from = state.from || undefined;
  const to = state.to || undefined;
  return {
    q: state.q.trim() || undefined,
    client: state.client.trim() || undefined,
    zoneId: state.zoneId ?? undefined,
    status: statuses,
    aiStatus: state.aiStatus ? [state.aiStatus] : undefined,
    // A single bound becomes a one-sided range.
    from: from ?? (to ? to : undefined),
    to: to ?? (from ? from : undefined),
    supportType: state.supportType ? [state.supportType] : undefined,
    sort: moderationSortApi(state.sort),
    page: Math.max(0, state.page),
    size: MODERATION_PAGE_SIZE,
  };
}

/** Filters that narrow the tab (search excluded), for « Filtres (n) » and reset. */
export function activeFilterCount(state: ModerationFilterState): number {
  return [
    state.client.trim(),
    state.zoneId,
    state.tab === "toutes" ? state.status : null,
    state.aiStatus,
    state.from || state.to,
    state.supportType,
  ].filter(Boolean).length;
}

/** Stable key of a search (resource cache key). */
export function moderationSearchKey(filters: CampaignSearchFilters): string {
  return JSON.stringify(filters);
}

// ---------------------------------------------------------------------------
// Decisions (contract §2.1 admin decisions)
// ---------------------------------------------------------------------------
export const REJECT_REASON_MIN = 3;
export const REJECT_REASON_MAX = 1000;
export const COMMENT_MAX = 1000;
export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 10;

/** An admin validation is only accepted for APPROVED_BY_AI and REVIEW_REQUIRED. */
export function canDecide(status: CampaignStatus): boolean {
  return canAdminValidate(status);
}

/** The admin may (re-)run the AI analysis on PENDING_AI_CHECK / APPROVED_BY_AI / REVIEW_REQUIRED. */
export function canRunAiCheck(status: CampaignStatus): boolean {
  return canAdminRerunAi(status);
}

export { canAdminReject, canEditPriority, rejectBlocksDiffusion, validationNeedsOverride };

/** Reason check: 3..1000 characters after trimming. Null when valid. */
export function rejectReasonError(reason: string): string | null {
  const t = reason.trim();
  if (t.length === 0) return "Indiquez le motif du refus.";
  if (t.length < REJECT_REASON_MIN) return `Au moins ${REJECT_REASON_MIN} caractères.`;
  if (t.length > REJECT_REASON_MAX) return `${REJECT_REASON_MAX} caractères maximum.`;
  return null;
}

/** "7" → 7 · "" → null · out of 0..10 or not an integer → NaN (invalid). */
export function parsePriority(raw: string): number | null {
  const v = raw.trim();
  if (v === "") return null;
  if (!/^\d{1,2}$/.test(v)) return Number.NaN;
  const n = Number(v);
  return n >= PRIORITY_MIN && n <= PRIORITY_MAX ? n : Number.NaN;
}

export interface ValidationDraft {
  comment: string;
  priority: string;
  override: boolean;
}

export type ValidationCheck =
  | {
      ok: true;
      body: { overrideAi?: boolean; comment?: string | null; priorityScore?: number | null };
    }
  | { ok: false; field: "override" | "priority" | "comment"; message: string };

/** Body of POST /admin/campaigns/{id}/validate, or the first blocking problem. */
export function validationBody(
  campaign: Pick<CampaignResponse, "status">,
  draft: ValidationDraft,
): ValidationCheck {
  if (validationNeedsOverride(campaign.status) && !draft.override) {
    return {
      ok: false,
      field: "override",
      message: "Cochez la dérogation : l'IA a demandé une revue manuelle.",
    };
  }
  const priority = parsePriority(draft.priority);
  if (priority !== null && Number.isNaN(priority)) {
    return { ok: false, field: "priority", message: "Priorité entière de 0 à 10." };
  }
  const comment = draft.comment.trim();
  if (comment.length > COMMENT_MAX) {
    return { ok: false, field: "comment", message: `${COMMENT_MAX} caractères maximum.` };
  }
  return {
    ok: true,
    body: {
      ...(validationNeedsOverride(campaign.status) ? { overrideAi: true } : {}),
      comment: comment || null,
      ...(priority !== null ? { priorityScore: priority } : {}),
    },
  };
}

/** Whole days elapsed since submission (or creation), never negative. */
export function waitingDays(
  c: Pick<CampaignResponse, "submittedAt" | "createdAt">,
  now: Date = new Date(),
): number {
  const t = Date.parse(queueTime(c));
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

export function formatWaiting(days: number): string {
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Depuis 1 jour";
  return `Depuis ${days} jours`;
}

/** « CAMP-00007 »: the reference advertisers see in their space and quote in e-mails. */
export function campaignReference(id: number): string {
  return `CAMP-${String(id).padStart(5, "0")}`;
}

/** « Annonceur n° 12 » when the payload has no name (pre-v2 backend). */
export function advertiserLabel(clientId: number | null | undefined): string {
  return typeof clientId === "number" ? `Annonceur n° ${clientId}` : "Annonceur inconnu";
}

/** Company name, then contact name, then « Annonceur n° 12 ». */
export function advertiserName(
  c: Pick<CampaignResponse, "clientId"> & {
    clientCompanyName?: string | null;
    clientName?: string | null;
  },
): string {
  const company = c.clientCompanyName?.trim();
  if (company) return company;
  const name = c.clientName?.trim();
  return name ? name : advertiserLabel(c.clientId);
}

// ---------------------------------------------------------------------------
// Start-date urgency (« dans 2 j », warning < 3 days, danger when already started)
// ---------------------------------------------------------------------------
export interface StartCue {
  label: string;
  tone: "danger" | "warning" | "neutral";
  /** Days from today to the start date (negative = past), null when unknown. */
  days: number | null;
}

function isoNoon(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

export function startCue(startDate: string | null | undefined, today: string): StartCue {
  const start = startDate ? isoNoon(startDate) : null;
  const now = isoNoon(today);
  if (start === null || now === null)
    return { label: "Date non définie", tone: "neutral", days: null };
  const days = Math.round((start - now) / 86_400_000);
  if (days < 0) {
    return {
      label: days === -1 ? "Début passé d'1 jour" : `Début passé de ${-days} jours`,
      tone: "danger",
      days,
    };
  }
  if (days === 0) return { label: "Commence aujourd'hui", tone: "warning", days };
  if (days === 1) return { label: "Commence demain", tone: "warning", days };
  return { label: `Dans ${days} j`, tone: days < 3 ? "warning" : "neutral", days };
}

// ---------------------------------------------------------------------------
// Review navigation (J / K, next after a decision)
// ---------------------------------------------------------------------------
export interface ReviewNeighbours {
  index: number;
  total: number;
  previous: number | null;
  next: number | null;
  /** Next campaign still awaiting a decision (after current, then wrapping to the start). */
  nextDecidable: number | null;
  /** Campaigns awaiting a decision in the list, the current one excluded. */
  remaining: number;
}

export function reviewNeighbours(
  rows: readonly Pick<CampaignResponse, "id" | "status">[],
  currentId: number,
): ReviewNeighbours {
  const index = rows.findIndex((r) => r.id === currentId);
  const others = rows.filter((r) => r.id !== currentId && canDecide(r.status));
  let nextDecidable: number | null = null;
  if (index >= 0) {
    const after = rows.slice(index + 1).find((r) => canDecide(r.status));
    const before = rows.slice(0, index).find((r) => canDecide(r.status));
    nextDecidable = (after ?? before)?.id ?? null;
  } else {
    nextDecidable = others[0]?.id ?? null;
  }
  return {
    index,
    total: rows.length,
    previous: index > 0 ? (rows[index - 1]?.id ?? null) : null,
    next: index >= 0 && index < rows.length - 1 ? (rows[index + 1]?.id ?? null) : null,
    nextDecidable,
    remaining: others.length,
  };
}

// ---------------------------------------------------------------------------
// Refusal: reason presets (the reason is shown to the advertiser in their space)
// ---------------------------------------------------------------------------
export const REJECT_REASON_PRESETS = [
  "Allégation « gratuit » non justifiée",
  "Objectif trop vague",
  "Période incohérente",
  "Visuel ou texte non conforme",
] as const;

/** Appends a preset to the reason (no duplicate, separated by « ; »). */
export function applyReasonPreset(reason: string, preset: string, max = REJECT_REASON_MAX): string {
  const current = reason.trim();
  if (current.toLowerCase().includes(preset.toLowerCase())) return reason;
  const next = current ? `${current.replace(/[.;,]\s*$/, "")} ; ${preset}` : preset;
  return next.slice(0, max);
}

/** Optional e-mail the moderator may send in addition to the in-app « Motif du refus ». */
export function refusalMessage(
  campaign: Pick<CampaignResponse, "id" | "name">,
  reason: string,
): string {
  return [
    "Bonjour,",
    "",
    `Votre campagne « ${campaign.name} » (référence ${campaignReference(campaign.id)}) n'a pas été validée par l'équipe TPUB.`,
    "",
    `Motif : ${reason.trim()}`,
    "",
    "Prochaine étape : dans votre espace TPUB, ouvrez la campagne et choisissez « Corriger ». Elle repasse en brouillon : corrigez le point signalé, vérifiez vos Porteurs puis soumettez-la de nouveau.",
    "",
    "Les créneaux réservés pour cette campagne ont été libérés.",
    "",
    "Cordialement,",
    "L'équipe TPUB",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Bulk validation (« Valider la sélection »)
// ---------------------------------------------------------------------------
export type BulkEligibility = "eligible" | "not-approved" | "no-slot";

/**
 * Only APPROVED_BY_AI campaigns holding at least one reservation can be validated in bulk:
 * REVIEW_REQUIRED needs a human look and an explicit override.
 */
export function bulkEligibility(
  c: Pick<CampaignResponse, "status" | "aiStatus"> & { reservationsCount?: number },
): BulkEligibility {
  if (c.status !== "APPROVED_BY_AI" || c.aiStatus !== "APPROVED") return "not-approved";
  return (c.reservationsCount ?? 0) > 0 ? "eligible" : "no-slot";
}

export const BULK_INELIGIBLE_REASON: Record<Exclude<BulkEligibility, "eligible">, string> = {
  "not-approved": "Validation groupée réservée aux avis IA favorables : examinez cette campagne.",
  "no-slot": "Aucun créneau réservé : examinez cette campagne avant de la valider.",
};

export interface BulkResult {
  id: number;
  ok: boolean;
  campaign?: CampaignResponse;
  error?: unknown;
}

/** One request at a time, in order; a failure never stops the next ones. */
export async function validateSequentially(
  ids: readonly number[],
  validate: (id: number) => Promise<CampaignResponse>,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  for (const id of ids) {
    try {
      results.push({ id, ok: true, campaign: await validate(id) });
    } catch (error) {
      results.push({ id, ok: false, error });
    }
    onProgress?.(results.length, ids.length);
  }
  return results;
}

/** « 3 validées · 1 échec : #5 ». */
export function bulkSummary(results: readonly Pick<BulkResult, "id" | "ok">[]): string {
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).map((r) => `#${r.id}`);
  const parts = [`${ok} validée${ok > 1 ? "s" : ""}`];
  if (failed.length > 0) {
    parts.push(`${failed.length} échec${failed.length > 1 ? "s" : ""} : ${failed.join(", ")}`);
  }
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Reservations (v2 responses carry names; older payloads are joined locally)
// ---------------------------------------------------------------------------
export interface ReservationRow extends ReservationResponse {
  supportName: string;
  zoneName: string;
}

export function joinReservations(
  reservations: readonly ReservationResponse[],
  supports: readonly SupportResponse[] = [],
  zones: readonly ZoneResponse[] = [],
): ReservationRow[] {
  const supportById = new Map(supports.map((s) => [s.id, s]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  return reservations.map((r) => {
    const s = supportById.get(r.supportId);
    return {
      ...r,
      supportName: r.supportName ?? s?.name ?? `Porteur n° ${r.supportId}`,
      zoneName: r.zoneName ?? zoneById.get(r.zoneId)?.name ?? s?.zoneName ?? `Zone n° ${r.zoneId}`,
    };
  });
}

export const ACTIVE_RESERVATION_STATUSES = ["TEMPORAIRE", "CONFIRMEE"] as const;

export function sumEstimatedCost(
  reservations: readonly Pick<ReservationResponse, "estimatedCost" | "reservationStatus">[],
): number {
  return reservations.reduce(
    (acc, r) =>
      (ACTIVE_RESERVATION_STATUSES as readonly string[]).includes(r.reservationStatus) &&
      Number.isFinite(r.estimatedCost)
        ? acc + r.estimatedCost
        : acc,
    0,
  );
}
