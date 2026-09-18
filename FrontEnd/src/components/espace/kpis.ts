/**
 * Advertiser figures (contract §5 F2): measured and estimated totals come from
 * `GET /statistics/mine`; only status buckets, to-dos and deadlines are derived from `/mine`.
 * Pure functions: no fetch, no Date.now() unless a `today` is omitted.
 */
import type {
  CampaignResponse,
  CampaignStatus,
  ReservationResponse,
  ReservationStatus,
  StatisticsMineResponse,
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

type CampaignLike = Pick<CampaignResponse, "status" | "startDate" | "endDate">;

export function campaignBucket(
  campaign: CampaignLike,
  today: string = todayISO(),
): CampaignBucketKey {
  return getCampaignBucket(campaign, today).key;
}

/** Refused campaigns (AI or ZELQANE): they need a correction before diffusion. */
export function isRefused(status: CampaignStatus): boolean {
  return status === "REJECTED_BY_AI" || status === "BLOCKED";
}

/** Reservations that still hold a Porteur. */
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
// Campaign counts (client) and KPIs (GET /statistics/mine)
// ---------------------------------------------------------------------------
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

export function countBuckets(
  campaigns: readonly CampaignLike[],
  today: string = todayISO(),
): Record<CampaignBucketKey, number> {
  const byBucket = emptyBuckets();
  for (const c of campaigns) byBucket[campaignBucket(c, today)] += 1;
  return byBucket;
}

export interface KpiTileData {
  key: string;
  label: string;
  value: number;
  /** "money" values are TND. */
  kind: "count" | "money";
  /** Measured from diffusion logs, estimated at booking, or a plain count. */
  source: "mesure" | "estimation" | "compte";
  hint: string;
}

/** Dashboard / statistics tiles from GET /statistics/mine (never aggregated client-side). */
export function mineKpis(stats: Pick<StatisticsMineResponse, "totals">): KpiTileData[] {
  const t = stats.totals;
  return [
    {
      key: "views",
      label: "Affichages",
      value: safeNumber(t.views),
      kind: "count",
      source: "mesure",
      hint: "Passages de vos publicités sur les Porteurs.",
    },
    {
      key: "clicks",
      label: "Clics",
      value: safeNumber(t.clicks),
      kind: "count",
      source: "mesure",
      hint: "Touches sur l'écran pendant une diffusion.",
    },
    {
      key: "interactions",
      label: "Interactions",
      value: safeNumber(t.interactions),
      kind: "count",
      source: "mesure",
      hint: "Autres interactions enregistrées.",
    },
    {
      key: "estimatedCost",
      label: "Coût estimé",
      value: roundTND(safeNumber(t.estimatedCost)),
      kind: "money",
      source: "estimation",
      hint: `${formatCount(safeNumber(t.estimatedViews), "affichage estimé", "affichages estimés")} sur les Porteurs réservés.`,
    },
    {
      key: "consumedBudget",
      label: "Budget consommé",
      value: roundTND(safeNumber(t.consumedBudget)),
      kind: "money",
      source: "mesure",
      hint: "Coût des diffusions réellement effectuées.",
    },
    {
      key: "activeCampaigns",
      label: "Campagnes en diffusion",
      value: safeNumber(t.activeCampaigns),
      kind: "count",
      source: "compte",
      hint: `${formatCount(safeNumber(t.pendingCampaigns), "en attente", "en attente")} · ${formatCount(safeNumber(t.campaigns), "campagne", "campagnes")} au total`,
    },
  ];
}

// ---------------------------------------------------------------------------
// « À faire »
// ---------------------------------------------------------------------------
/** `finalize`: a draft whose reservation count is unknown (older payload). */
export type TodoKind = "submit" | "reserve" | "correct" | "analysis" | "finalize";

export interface TodoItem {
  key: string;
  kind: TodoKind;
  campaignId: number;
  campaignName: string;
  href: string;
}

const TODO_ORDER: Record<TodoKind, number> = {
  correct: 0,
  submit: 1,
  reserve: 2,
  finalize: 3,
  analysis: 4,
};

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
 * - REJECTED_BY_AI / BLOCKED → « Corriger » (detail: reason, reopen, resubmit)
 * - BROUILLON with a reservation → « Soumettre » (wizard, Vérification)
 * - BROUILLON without reservation → « Réserver des Porteurs » (wizard, Zone & Porteurs)
 * - BROUILLON with an unknown count → « Finaliser » (detail)
 * - PENDING_AI_CHECK → analysis not finished (detail)
 */
export function buildTodos(campaigns: readonly CampaignResponse[]): TodoItem[] {
  const items: TodoItem[] = [];
  for (const c of campaigns) {
    let kind: TodoKind | null = null;
    switch (c.status) {
      case "BROUILLON":
        kind =
          c.reservationsCount === undefined
            ? "finalize"
            : c.reservationsCount > 0
              ? "submit"
              : "reserve";
        break;
      case "REJECTED_BY_AI":
      case "BLOCKED":
        kind = "correct";
        break;
      case "PENDING_AI_CHECK":
        kind = "analysis";
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

/** Brouillon créé · Porteurs réservés · Soumise (from /mine only). */
export function onboardingMilestones(
  campaigns: readonly Pick<CampaignResponse, "id" | "status" | "reservationsCount">[],
): Milestone[] {
  const submitted = campaigns.some((c) => c.status !== "BROUILLON");
  const drafts = campaigns.filter((c) => c.status === "BROUILLON");
  const draftWithout = drafts.find((c) => !((c.reservationsCount ?? 0) > 0));
  const draftWith = drafts.find((c) => (c.reservationsCount ?? 0) > 0);
  return [
    {
      key: "brouillon",
      title: "Créer un brouillon",
      description:
        "Nom, objectif, budget, période et créneau. Modifiable tant qu'il n'est pas soumis.",
      href: routes.espace.wizard(null),
      done: campaigns.length > 0,
    },
    {
      key: "porteurs",
      title: "Choisir la zone et les Porteurs",
      description: "Placez votre zone sur la carte et réservez les Porteurs disponibles.",
      href: draftWithout
        ? routes.espace.wizard(draftWithout.id, "porteurs")
        : drafts[0]
          ? routes.espace.wizard(drafts[0].id, "porteurs")
          : routes.espace.wizard(null),
      done: submitted || draftWith !== undefined,
    },
    {
      key: "soumission",
      title: "Soumettre la campagne",
      description: "Analyse IA immédiate, puis validation par l'équipe ZELQANE.",
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
  "start-pending": "Début prévu · en examen ZELQANE",
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
