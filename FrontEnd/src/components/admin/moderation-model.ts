/** Moderation queue model (pure): tabs, search, ordering, reservation joins, bulk validation. */
import type {
  CampaignResponse,
  CampaignStatus,
  ReservationResponse,
  SupportResponse,
  ZoneResponse,
} from "@/lib/api/types";

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

/** Case/accent-insensitive search on name, objective and id (« #12 » or « 12 »). */
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
// Sort (`?tri=attente` default, `?tri=debut`, `-` prefix = descending)
// ---------------------------------------------------------------------------
export const MODERATION_SORT_KEYS = ["attente", "debut"] as const;
export type ModerationSortKey = (typeof MODERATION_SORT_KEYS)[number];

export interface ModerationSort {
  key: string;
  dir: "asc" | "desc";
}

/** Oldest submission first: first in, first decided. */
export const DEFAULT_MODERATION_SORT: ModerationSort = { key: "attente", dir: "asc" };

/** The two orders offered in the sort select. */
export const MODERATION_SORT_OPTIONS = [
  { value: "attente", label: "Attente la plus longue" },
  { value: "debut", label: "Début le plus proche" },
] as const;

/** « Trié par : … » caption. */
export function moderationSortCaption(sort: ModerationSort): string {
  if (sort.key === "debut")
    return sort.dir === "asc" ? "début le plus proche" : "début le plus lointain";
  return sort.dir === "asc" ? "attente la plus longue" : "soumission la plus récente";
}

function compareText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Stable order; missing start dates always last; ties by id. */
export function sortQueue<T extends CampaignResponse>(
  rows: readonly T[],
  sort: ModerationSort = DEFAULT_MODERATION_SORT,
): T[] {
  const dir = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (sort.key === "debut") {
      if (!a.startDate || !b.startDate) {
        const missing = compareText(a.startDate, b.startDate);
        if (missing !== 0) return missing;
      } else {
        const cmp = compareText(a.startDate, b.startDate);
        if (cmp !== 0) return cmp * dir;
      }
      return compareText(queueTime(a), queueTime(b)) || a.id - b.id;
    }
    const cmp = compareText(queueTime(a), queueTime(b));
    return cmp !== 0 ? cmp * dir : (a.id - b.id) * dir;
  });
}

/**
 * Tab + search + sort. `keepId` keeps the campaign under review in place after a decision
 * moved it out of the tab (the review dialog still navigates from its position).
 */
export function filterCampaigns<T extends CampaignResponse>(
  campaigns: readonly T[],
  tab: ModerationTab,
  query: string,
  sort: ModerationSort = DEFAULT_MODERATION_SORT,
  keepId: number | null = null,
): T[] {
  const rows = campaigns.filter(
    (c) => (matchesTab(c.status, tab) && matchesQuery(c, query)) || c.id === keepId,
  );
  return sortQueue(rows, sort);
}

export function countByTab(
  campaigns: readonly Pick<CampaignResponse, "status">[],
): Record<ModerationTab, number> {
  const out = { "a-traiter": 0, revue: 0, ia: 0, toutes: 0 } as Record<ModerationTab, number>;
  for (const c of campaigns) {
    for (const t of MODERATION_TABS) if (matchesTab(c.status, t.value)) out[t.value] += 1;
  }
  return out;
}

/** An admin decision is only accepted for these statuses (contract §5.4). */
export function canDecide(status: CampaignStatus): boolean {
  return status === "APPROVED_BY_AI" || status === "REVIEW_REQUIRED";
}

/** The admin may run the AI check for a stuck PENDING_AI_CHECK campaign (contract §5.3). */
export function canRunAiCheck(status: CampaignStatus): boolean {
  return status === "PENDING_AI_CHECK";
}

/**
 * Contract §7.14: diffusion requires aiStatus === "APPROVED". Validating a campaign whose
 * AI verdict is not APPROVED sets it ACTIVE, but it will never reach a screen.
 */
export function validationWillNotAir(c: Pick<CampaignResponse, "status" | "aiStatus">): boolean {
  return canDecide(c.status) && c.aiStatus !== "APPROVED";
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

/** « Annonceur n° 12 » (the admin payload has no advertiser name yet, contract §7.5). */
export function advertiserLabel(clientId: number | null | undefined): string {
  return typeof clientId === "number" ? `Annonceur n° ${clientId}` : "Annonceur inconnu";
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
// Refusal: reason presets and advertiser message template (not sent automatically)
// ---------------------------------------------------------------------------
export const REJECT_REASON_PRESETS = [
  "Allégation « gratuit » non justifiée",
  "Objectif trop vague",
  "Période incohérente",
  "Visuel ou texte non conforme",
] as const;

/** Appends a preset to the reason (no duplicate, separated by « ; »). */
export function applyReasonPreset(reason: string, preset: string, max = 500): string {
  const current = reason.trim();
  if (current.toLowerCase().includes(preset.toLowerCase())) return reason;
  const next = current ? `${current.replace(/[.;,]\s*$/, "")} ; ${preset}` : preset;
  return next.slice(0, max);
}

/** French message the moderator pastes into their e-mail to the advertiser. */
export function refusalMessage(
  campaign: Pick<CampaignResponse, "id" | "name" | "clientId">,
  reason: string,
): string {
  return [
    "Bonjour,",
    "",
    `Votre campagne « ${campaign.name} » (référence ${campaignReference(campaign.id)}) n'a pas été validée par l'équipe TPUB.`,
    "",
    `Motif : ${reason.trim()}`,
    "",
    "Prochaine étape : dans votre espace TPUB, ouvrez la campagne et choisissez « Dupliquer et corriger ». Corrigez le point signalé sur la copie, réservez vos Porteurs puis soumettez-la de nouveau à la modération.",
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
export const ACTIVE_RESERVATION_STATUSES = ["TEMPORAIRE", "CONFIRMEE"] as const;

export function hasActiveSlot(
  reservations: readonly Pick<ReservationResponse, "reservationStatus">[] | null | undefined,
): boolean {
  return (reservations ?? []).some((r) =>
    (ACTIVE_RESERVATION_STATUSES as readonly string[]).includes(r.reservationStatus),
  );
}

export type BulkEligibility = "eligible" | "not-approved" | "no-slot" | "loading" | "unknown";

/**
 * Only APPROVED_BY_AI campaigns with at least one active créneau can be validated in bulk:
 * REVIEW_REQUIRED needs a human look (and would never air, §7.14).
 */
export function bulkEligibility(
  c: Pick<CampaignResponse, "status" | "aiStatus">,
  reservations:
    | { state: "loading" | "error" }
    | { state: "ready"; list: readonly Pick<ReservationResponse, "reservationStatus">[] }
    | undefined,
): BulkEligibility {
  if (c.status !== "APPROVED_BY_AI" || c.aiStatus !== "APPROVED") return "not-approved";
  if (!reservations) return "loading";
  if (reservations.state !== "ready") return reservations.state === "error" ? "unknown" : "loading";
  return hasActiveSlot(reservations.list) ? "eligible" : "no-slot";
}

export const BULK_INELIGIBLE_REASON: Record<Exclude<BulkEligibility, "eligible">, string> = {
  "not-approved": "Validation groupée réservée aux avis IA favorables : examinez cette campagne.",
  "no-slot": "Aucun créneau actif : examinez cette campagne avant de la valider.",
  loading: "Vérification des créneaux en cours…",
  unknown: "Créneaux non vérifiés : examinez cette campagne.",
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
// Reservations joined with names (no names in ReservationResponse, contract §5.7)
// ---------------------------------------------------------------------------
export interface ReservationRow extends ReservationResponse {
  supportName: string;
  zoneName: string;
}

export function joinReservations(
  reservations: readonly ReservationResponse[],
  supports: readonly SupportResponse[],
  zones: readonly ZoneResponse[],
): ReservationRow[] {
  const supportById = new Map(supports.map((s) => [s.id, s]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  return reservations.map((r) => {
    const s = supportById.get(r.supportId);
    return {
      ...r,
      supportName: s?.name ?? `Porteur n° ${r.supportId}`,
      zoneName: zoneById.get(r.zoneId)?.name ?? s?.zoneName ?? `Zone n° ${r.zoneId}`,
    };
  });
}

export function sumEstimatedCost(
  reservations: readonly Pick<ReservationResponse, "estimatedCost">[],
): number {
  return reservations.reduce(
    (acc, r) => acc + (Number.isFinite(r.estimatedCost) ? r.estimatedCost : 0),
    0,
  );
}
