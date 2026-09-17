/**
 * Back-office journal (pure), contract §2.10 audit, §2.2 AI decisions, §2.5 diffusion logs:
 * URL filters → API queries, pretty-printed audit details and AI / admin disagreement badges.
 */
import type {
  AiDecisionLogResponse,
  AiDecisionQuery,
  AuditAction,
  AuditEntityType,
  AuditQuery,
  DiffusionContentType,
  DiffusionLogQuery,
} from "@/lib/api/types";
import { AUDIT_ACTION_LABEL, AUDIT_ENTITY_LABEL } from "@/lib/campaign-status";

export const JOURNAL_TABS = ["audit", "decisions-ia", "diffusions"] as const;
export type JournalTab = (typeof JOURNAL_TABS)[number];

export const JOURNAL_PAGE_SIZE = 25;

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABEL) as AuditAction[];
export const AUDIT_ENTITIES = Object.keys(AUDIT_ENTITY_LABEL) as AuditEntityType[];
export const DECISION_TYPES = ["AI", "ADMIN"] as const;
export const DECISION_VALUES = [
  "APPROVED",
  "REVIEW_REQUIRED",
  "REJECTED",
  "VALIDATED",
  "VALIDATED_OVERRIDE",
] as const;
export const DIFFUSION_CONTENT_TYPES: readonly DiffusionContentType[] = [
  "PUBLICITE",
  "URGENCE",
  "DEFAUT",
];

/** Tabs a role may open: OPERATEUR only sees the diffusion journal (contract §5 F3). */
export function journalTabsFor(role: string): readonly JournalTab[] {
  return role === "OPERATEUR" ? ["diffusions"] : JOURNAL_TABS;
}

export interface JournalFilterState {
  action: AuditAction | null;
  entity: AuditEntityType | null;
  entityId: string;
  actorId: number | null;
  decisionType: (typeof DECISION_TYPES)[number] | null;
  decision: (typeof DECISION_VALUES)[number] | null;
  campaignId: number | null;
  supportId: number | null;
  zoneId: number | null;
  contentType: DiffusionContentType | null;
  from: string;
  to: string;
  page: number;
}

function range(s: Pick<JournalFilterState, "from" | "to">) {
  const from = s.from || undefined;
  const to = s.to || undefined;
  return { from: from ?? to, to: to ?? from };
}

function paging(s: Pick<JournalFilterState, "page">) {
  return { page: Math.max(0, s.page), size: JOURNAL_PAGE_SIZE };
}

export function auditQuery(s: JournalFilterState): AuditQuery {
  return {
    action: s.action ? [s.action] : undefined,
    entityType: s.entity ?? undefined,
    entityId: s.entityId.trim() || undefined,
    actorId: s.actorId ?? undefined,
    ...range(s),
    sort: "createdAt,desc",
    ...paging(s),
  };
}

export function decisionsQuery(s: JournalFilterState): AiDecisionQuery {
  return {
    campaignId: s.campaignId ?? undefined,
    decisionType: s.decisionType ?? undefined,
    decision: s.decision ?? undefined,
    ...range(s),
    sort: "createdAt,desc",
    ...paging(s),
  };
}

export function diffusionsQuery(s: JournalFilterState): DiffusionLogQuery {
  return {
    supportId: s.supportId ?? undefined,
    zoneId: s.zoneId ?? undefined,
    campaignId: s.campaignId ?? undefined,
    contentType: s.contentType ? [s.contentType] : undefined,
    ...range(s),
    sort: "diffusedAt,desc",
    ...paging(s),
  };
}

/** Active filters of a tab (for « Filtres (n) »). */
export function journalFilterCount(tab: JournalTab, s: JournalFilterState): number {
  const dates = s.from || s.to ? 1 : 0;
  if (tab === "audit") {
    return (
      [s.action, s.entity, s.entityId.trim() || null, s.actorId].filter((v) => v !== null).length +
      dates
    );
  }
  if (tab === "decisions-ia") {
    return [s.decisionType, s.decision, s.campaignId].filter((v) => v !== null).length + dates;
  }
  return (
    [s.supportId, s.zoneId, s.campaignId, s.contentType].filter((v) => v !== null).length + dates
  );
}

/** Audit `details` as indented JSON, null when empty. */
export function prettyDetails(details: Record<string, unknown> | null | undefined): string | null {
  if (!details || Object.keys(details).length === 0) return null;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return null;
  }
}

export type DecisionFlag = "override" | "disagreement";

/**
 * Badges of admin decisions: « dérogation » (VALIDATED_OVERRIDE) and « désaccord » when the
 * decision went against the AI verdict (AI APPROVED → REJECTED, AI REVIEW_REQUIRED/REJECTED →
 * validated). The AI verdict is the latest earlier non-preview AI row of the same campaign in the
 * list; without it on the page, no « désaccord » is claimed.
 */
export function decisionFlags(rows: readonly AiDecisionLogResponse[]): Map<number, DecisionFlag[]> {
  const out = new Map<number, DecisionFlag[]>();
  const byTime = [...rows].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1,
  );
  const lastAi = new Map<number, string>();
  for (const row of byTime) {
    const flags: DecisionFlag[] = [];
    if (row.decisionType === "AI") {
      if (!row.preview) lastAi.set(row.campaignId, row.decision);
    } else {
      if (row.decision === "VALIDATED_OVERRIDE") flags.push("override");
      const ai = lastAi.get(row.campaignId);
      const validated = row.decision === "VALIDATED" || row.decision === "VALIDATED_OVERRIDE";
      if (
        ai !== undefined &&
        ((ai === "APPROVED" && row.decision === "REJECTED") ||
          ((ai === "REVIEW_REQUIRED" || ai === "REJECTED") && validated))
      ) {
        flags.push("disagreement");
      }
    }
    out.set(row.id, flags);
  }
  return out;
}
