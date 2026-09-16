/**
 * Per-advertiser figures, computed client-side ONLY from the caller's own campaigns
 * (`GET /campaigns/mine`) and their reservations (`GET /reservations/campaign/{id}`).
 * `/statistics/dashboard` is platform-wide and must never feed these screens (contract §5.8).
 *
 * Pure functions: no fetch, no Date.now() unless a `today` is omitted.
 */
import type {
  CampaignResponse,
  CampaignStatus,
  ReservationResponse,
  ReservationStatus,
} from "@/lib/api/types";
import {
  CAMPAIGN_BUCKETS,
  type CampaignBucketKey,
  getCampaignBucket,
  getCampaignDisplayStatus,
} from "@/lib/campaign-status";
import { countDaysInclusive, formatCount, todayISO } from "@/lib/format";
import { routes } from "@/lib/routes";

// ---------------------------------------------------------------------------
// Campaign buckets: the shared definition from campaign-status (UX-PLAN §4.8)
// ---------------------------------------------------------------------------
export { CAMPAIGN_BUCKETS, type CampaignBucketKey } from "@/lib/campaign-status";
/** @deprecated alias of CampaignBucketKey. */
export type CampaignBucket = CampaignBucketKey;

type CampaignLike = Pick<CampaignResponse, "status" | "startDate" | "endDate">;

export function campaignBucket(
  campaign: CampaignLike,
  today: string = todayISO(),
): CampaignBucketKey {
  return getCampaignBucket(campaign, today).key;
}

/** Refused campaigns do not commit budget (their reservations are released). */
export function isRefused(status: CampaignStatus): boolean {
  return status === "REJECTED_BY_AI" || status === "BLOCKED";
}

/** Reservations that still hold a slot. */
export const HOLDING_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  "TEMPORAIRE",
  "CONFIRMEE",
];

export function isHoldingReservation(r: Pick<ReservationResponse, "reservationStatus">): boolean {
  return HOLDING_RESERVATION_STATUSES.includes(r.reservationStatus);
}

/** Money is TND with 3 decimals (millimes): avoid float noise in sums. */
export function roundTND(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function safeNumber(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
export interface AdvertiserKpis {
  campaignCount: number;
  byBucket: Record<CampaignBucketKey, number>;
  /** « Budget déclaré »: sum of budgets, refused campaigns excluded (TND). */
  totalBudget: number;
  /** Sum of consumedBudget (TND). Always 0 with the current backend: never displayed as a figure. */
  consumedBudget: number;
  reservationCount: number;
  reservationsByStatus: Record<ReservationStatus, number>;
  /** « Créneaux actifs »: TEMPORAIRE + CONFIRMEE. */
  holdingReservationCount: number;
  /** Distinct Porteurs held by a TEMPORAIRE/CONFIRMEE reservation. */
  reservedScreens: number;
  /** Distinct zones held by a TEMPORAIRE/CONFIRMEE reservation. */
  reservedZones: number;
  /** Sum of campaign.estimatedViews, refused campaigns excluded. Hard-coded backend value. */
  estimatedViews: number;
  /** « Coût estimé des créneaux »: estimatedCost of holding reservations (TND). Hard-coded rule. */
  estimatedCost: number;
}

const BUCKET_WORDS: Record<CampaignBucketKey, [string, string]> = {
  brouillons: ["brouillon", "brouillons"],
  "a-corriger": ["à corriger", "à corriger"],
  "en-examen": ["en examen", "en examen"],
  programmees: ["programmée", "programmées"],
  "en-diffusion": ["en diffusion", "en diffusion"],
  terminees: ["terminée", "terminées"],
  refusees: ["refusée", "refusées"],
};

/**
 * « 1 en diffusion · 3 en examen · 1 brouillon · 1 refusée »: every non-empty bucket, in the
 * CAMPAIGN_BUCKETS order, so the parts always add up to the campaign count.
 */
export function bucketSummary(byBucket: Record<CampaignBucketKey, number>): string[] {
  return CAMPAIGN_BUCKETS.filter((b) => (byBucket[b.key] ?? 0) > 0).map((b) => {
    const [one, many] = BUCKET_WORDS[b.key];
    return formatCount(byBucket[b.key], one, many);
  });
}

export function emptyBuckets(): Record<CampaignBucketKey, number> {
  return Object.fromEntries(CAMPAIGN_BUCKETS.map((b) => [b.key, 0])) as Record<
    CampaignBucketKey,
    number
  >;
}

export function emptyReservationCounts(): Record<ReservationStatus, number> {
  return { TEMPORAIRE: 0, CONFIRMEE: 0, ANNULEE: 0, EXPIREE: 0 };
}

/**
 * Only reservations belonging to one of `campaigns` are counted (the reservation
 * endpoint has no ownership check, so never trust stray rows).
 */
export function computeAdvertiserKpis(
  campaigns: readonly CampaignResponse[],
  reservations: readonly ReservationResponse[],
  today: string = todayISO(),
): AdvertiserKpis {
  const byBucket = emptyBuckets();
  let totalBudget = 0;
  let consumedBudget = 0;
  let estimatedViews = 0;
  const ownIds = new Set<number>();

  for (const c of campaigns) {
    ownIds.add(c.id);
    byBucket[campaignBucket(c, today)] += 1;
    consumedBudget += safeNumber(c.consumedBudget);
    if (!isRefused(c.status)) {
      totalBudget += safeNumber(c.budget);
      estimatedViews += safeNumber(c.estimatedViews);
    }
  }

  const reservationsByStatus = emptyReservationCounts();
  const screens = new Set<number>();
  const zones = new Set<number>();
  let reservationCount = 0;
  let holdingReservationCount = 0;
  let estimatedCost = 0;

  for (const r of reservations) {
    if (!ownIds.has(r.campaignId)) continue;
    reservationCount += 1;
    reservationsByStatus[r.reservationStatus] += 1;
    if (isHoldingReservation(r)) {
      holdingReservationCount += 1;
      screens.add(r.supportId);
      zones.add(r.zoneId);
      estimatedCost += safeNumber(r.estimatedCost);
    }
  }

  return {
    campaignCount: campaigns.length,
    byBucket,
    totalBudget: roundTND(totalBudget),
    consumedBudget: roundTND(consumedBudget),
    reservationCount,
    reservationsByStatus,
    holdingReservationCount,
    reservedScreens: screens.size,
    reservedZones: zones.size,
    estimatedViews,
    estimatedCost: roundTND(estimatedCost),
  };
}

// ---------------------------------------------------------------------------
// Budget vs estimated cost, per campaign (statistics chart)
// ---------------------------------------------------------------------------
export interface CampaignBudgetRow {
  id: number;
  name: string;
  budget: number;
  estimatedCost: number;
  reservationCount: number;
}

export function budgetByCampaign(
  campaigns: readonly CampaignResponse[],
  reservations: readonly ReservationResponse[],
  limit = 8,
): CampaignBudgetRow[] {
  const cost = new Map<number, { sum: number; count: number }>();
  for (const r of reservations) {
    if (!isHoldingReservation(r)) continue;
    const entry = cost.get(r.campaignId) ?? { sum: 0, count: 0 };
    entry.sum += safeNumber(r.estimatedCost);
    entry.count += 1;
    cost.set(r.campaignId, entry);
  }
  return campaigns
    .filter((c) => !isRefused(c.status))
    .map((c) => ({
      id: c.id,
      name: c.name,
      budget: roundTND(safeNumber(c.budget)),
      estimatedCost: roundTND(cost.get(c.id)?.sum ?? 0),
      reservationCount: cost.get(c.id)?.count ?? 0,
    }))
    .sort((a, b) => b.budget - a.budget || a.name.localeCompare(b.name, "fr"))
    .slice(0, Math.max(0, limit));
}

// ---------------------------------------------------------------------------
// « À faire »
// ---------------------------------------------------------------------------
/** `finalize`: a draft whose reservations could not be loaded (no guess between reserve/submit). */
export type TodoKind = "submit" | "reserve" | "duplicate" | "analysis" | "blocked" | "finalize";

export interface TodoItem {
  key: string;
  kind: TodoKind;
  campaignId: number;
  campaignName: string;
  /** Navigation target. For `duplicate` the dashboard opens DuplicateCampaignDialog instead. */
  href: string;
}

const TODO_ORDER: Record<TodoKind, number> = {
  submit: 0,
  reserve: 1,
  finalize: 2,
  duplicate: 3,
  analysis: 4,
  blocked: 5,
};

export interface BuildTodosOptions {
  /**
   * Campaigns whose reservations are known (loaded). Drafts outside this set become `finalize`
   * (→ detail page). Omit when every campaign's reservations are loaded.
   */
  knownCampaignIds?: ReadonlySet<number>;
}

function todoHref(kind: TodoKind, id: number): string {
  switch (kind) {
    case "reserve":
      return routes.espace.wizard(id, "porteurs");
    case "submit":
      return routes.espace.wizard(id, "verification");
    default:
      return routes.espace.campaign(id);
  }
}

/**
 * - BROUILLON with a holding reservation → « Soumettre » (wizard, Vérification)
 * - BROUILLON without reservation → « Réserver des créneaux » (wizard, Porteurs)
 * - BROUILLON with unknown reservations → « Finaliser » (detail)
 * - REJECTED_BY_AI → « Dupliquer et corriger » (dead end, contract §7.13)
 * - PENDING_AI_CHECK → analysis not finished (detail)
 * - BLOCKED → refused by TPUB (detail)
 */
export function buildTodos(
  campaigns: readonly CampaignResponse[],
  reservations: readonly ReservationResponse[],
  { knownCampaignIds }: BuildTodosOptions = {},
): TodoItem[] {
  const holding = new Set<number>();
  for (const r of reservations) if (isHoldingReservation(r)) holding.add(r.campaignId);

  const items: TodoItem[] = [];
  for (const c of campaigns) {
    let kind: TodoKind | null = null;
    switch (c.status) {
      case "BROUILLON":
        if (knownCampaignIds && !knownCampaignIds.has(c.id)) kind = "finalize";
        else kind = holding.has(c.id) ? "submit" : "reserve";
        break;
      case "REJECTED_BY_AI":
        kind = "duplicate";
        break;
      case "PENDING_AI_CHECK":
        kind = "analysis";
        break;
      case "BLOCKED":
        kind = "blocked";
        break;
      default:
        kind = null;
    }
    if (kind) {
      items.push({
        key: `${kind}-${c.id}`,
        kind,
        campaignId: c.id,
        campaignName: c.name,
        href: todoHref(kind, c.id),
      });
    }
  }
  // Stable: same kind keeps the incoming order (campaigns are newest first).
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => TODO_ORDER[a.item.kind] - TODO_ORDER[b.item.kind] || a.index - b.index)
    .map(({ item }) => item);
}

// ---------------------------------------------------------------------------
// First run: 3 milestones from real data only (FLOW-10)
// ---------------------------------------------------------------------------
export type MilestoneKey = "brouillon" | "porteurs" | "soumission";

export interface Milestone {
  key: MilestoneKey;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

/**
 * Brouillon créé · Porteurs réservés · Soumise. Nothing is counted from page visits or
 * local flags. A submitted campaign implies Porteurs were reserved (submission requires one).
 */
export function onboardingMilestones(
  campaigns: readonly Pick<CampaignResponse, "id" | "status">[],
  reservations: readonly Pick<ReservationResponse, "campaignId" | "reservationStatus">[],
): Milestone[] {
  const submitted = campaigns.some((c) => c.status !== "BROUILLON");
  const drafts = campaigns.filter((c) => c.status === "BROUILLON");
  const holding = new Set(reservations.filter(isHoldingReservation).map((r) => r.campaignId));
  const draftWithout = drafts.find((c) => !holding.has(c.id));
  const draftWith = drafts.find((c) => holding.has(c.id));
  return [
    {
      key: "brouillon",
      title: "Créer un brouillon",
      description:
        "Nom, objectif, budget et période. Il reste modifiable tant qu'il n'est pas soumis.",
      href: routes.espace.wizard(null),
      done: campaigns.length > 0,
    },
    {
      key: "porteurs",
      title: "Réserver des Porteurs",
      description:
        "Choisissez les Porteurs libres sur votre période : leurs créneaux sont bloqués.",
      href: draftWithout
        ? routes.espace.wizard(draftWithout.id, "porteurs")
        : drafts[0]
          ? routes.espace.wizard(drafts[0].id, "porteurs")
          : routes.espace.wizard(null),
      done: submitted || reservations.length > 0,
    },
    {
      key: "soumission",
      title: "Soumettre à la modération",
      description: "Analyse IA, puis examen par l'équipe TPUB.",
      href: draftWith
        ? routes.espace.wizard(draftWith.id, "verification")
        : drafts[0]
          ? routes.espace.campaign(drafts[0].id)
          : routes.espace.wizard(null),
      done: submitted,
    },
  ];
}

// ---------------------------------------------------------------------------
// « Prochaines échéances »: client-derived from /mine dates (IA-14)
// ---------------------------------------------------------------------------
export type DeadlineKind = "start" | "start-pending" | "start-draft" | "end";

export interface Deadline {
  key: string;
  kind: DeadlineKind;
  campaignId: number;
  campaignName: string;
  /** Real campaign date, YYYY-MM-DD. */
  date: string;
  /** 0 = today. */
  inDays: number;
  label: string;
}

/** Days from `today` to `date` (both YYYY-MM-DD); null when invalid or in the past. */
export function daysUntil(today: string, date: string | null | undefined): number | null {
  if (!date) return null;
  const n = countDaysInclusive(today, date);
  return n === null ? null : n - 1;
}

/** « aujourd'hui », « demain », « dans 5 jours ». */
export function inDaysLabel(days: number): string {
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "demain";
  return `dans ${days} jours`;
}

const DEADLINE_LABEL: Record<DeadlineKind, string> = {
  start: "Début de diffusion",
  "start-pending": "Début prévu · en examen TPUB",
  "start-draft": "Début prévu · brouillon à finaliser",
  end: "Fin de diffusion",
};

/**
 * Starts within 7 days (validated or under review), ends within 7 days (on air or validated),
 * drafts whose start is within 14 days. Soonest first. Only real dates, nothing inferred.
 */
export function upcomingDeadlines(
  campaigns: readonly CampaignResponse[],
  today: string = todayISO(),
  limit = 5,
): Deadline[] {
  const out: Deadline[] = [];
  const push = (c: CampaignResponse, kind: DeadlineKind, date: string, inDays: number) =>
    out.push({
      key: `${kind}-${c.id}`,
      kind,
      campaignId: c.id,
      campaignName: c.name,
      date,
      inDays,
      label: DEADLINE_LABEL[kind],
    });

  for (const c of campaigns) {
    const display = getCampaignDisplayStatus(c, today);
    const toStart = daysUntil(today, c.startDate);
    const toEnd = daysUntil(today, c.endDate);
    switch (display) {
      case "BROUILLON":
        if (toStart !== null && toStart <= 14)
          push(c, "start-draft", c.startDate ?? today, toStart);
        break;
      case "PENDING_AI_CHECK":
      case "APPROVED_BY_AI":
      case "REVIEW_REQUIRED":
        if (toStart !== null && toStart <= 7)
          push(c, "start-pending", c.startDate ?? today, toStart);
        break;
      case "VALIDATED_BY_ADMIN":
      case "SCHEDULED":
      case "ACTIVE":
        if (toStart !== null && toStart <= 7) {
          push(c, "start", c.startDate ?? today, toStart);
        } else if (toEnd !== null && toEnd <= 7 && toStart === null) {
          push(c, "end", c.endDate ?? today, toEnd);
        }
        break;
      default:
        break;
    }
  }
  return out
    .sort((a, b) => a.inDays - b.inDays || a.campaignName.localeCompare(b.campaignName, "fr"))
    .slice(0, Math.max(0, limit));
}

/** First word of the display name (« Sami Ben Salah » → « Sami »). */
export function firstName(nom: string | null | undefined): string {
  const first = (nom ?? "").trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : "";
}
