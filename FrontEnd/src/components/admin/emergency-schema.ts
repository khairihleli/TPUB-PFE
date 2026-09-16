/**
 * Priority message (« message prioritaire ») form: client checks aligned with
 * EmergencyRequest (contract §5.9) + the rules the backend only enforces in the DB.
 * One form can target several zones: the backend takes one zone per message, so the
 * form sends one POST per zone (sequentially) with the same body.
 */
import { z } from "zod";

import { maxChars, parseInteger, REQUIRED } from "@/components/admin/form-utils";
import type {
  EmergencyRequest,
  EmergencyResponse,
  SupportResponse,
  UrgencyLevel,
  ZoneResponse,
} from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export const URGENCY_LEVELS = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const satisfies readonly UrgencyLevel[];

export const EMERGENCY_FIELDS = [
  "title",
  "content",
  "zoneIds",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "durationSeconds",
  "priority",
  "urgencyLevel",
] as const;

export type EmergencyField = (typeof EMERGENCY_FIELDS)[number];

/** Raw form state: strings (controls) + the selected zone ids. */
export interface EmergencyFormValues {
  title: string;
  content: string;
  zoneIds: string[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  durationSeconds: string;
  priority: string;
  urgencyLevel: string;
}

export const DURATION_MIN = 5;
export const DURATION_MAX = 300;
export const PRIORITY_MAX = 32767; // SMALLINT
export const TITLE_MAX = 200;
/** Readable from a distance on a street screen. */
export const TITLE_RECOMMENDED = 60;

/**
 * Segmented priority mapped to the numeric field (lower = shown first, DB CHECK >= 1).
 * « Passe en premier » = 1 (the backend default), « Normale » = 2.
 */
export const PRIORITY_OPTIONS = [
  { value: "2", label: "Normale" },
  { value: "1", label: "Passe en premier" },
] as const;
export const PRIORITY_NORMAL = "2";

export function priorityLabel(priority: number): string {
  return priority <= 1 ? "Passe en premier" : priority === 2 ? "Normale" : `Priorité ${priority}`;
}

export function emptyEmergencyForm(today: string): EmergencyFormValues {
  return {
    title: "",
    content: "",
    zoneIds: [],
    startDate: today,
    endDate: today,
    startTime: "",
    endTime: "",
    durationSeconds: "",
    priority: PRIORITY_NORMAL,
    urgencyLevel: "HIGH",
  };
}

/** True when the user typed or changed something compared with the empty form. */
export function isEmergencyFormDirty(values: EmergencyFormValues, today: string): boolean {
  const empty = emptyEmergencyForm(today);
  return (Object.keys(empty) as (keyof EmergencyFormValues)[]).some((k) =>
    k === "zoneIds"
      ? values.zoneIds.length > 0
      : String(values[k]).trim() !== String(empty[k]).trim(),
  );
}

/** Restored drafts may come from an older shape: keep only known, well-typed fields. */
export function normalizeEmergencyDraft(raw: unknown, today: string): EmergencyFormValues {
  const base = emptyEmergencyForm(today);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const str = (k: keyof EmergencyFormValues) =>
    typeof r[k] === "string" ? String(r[k]) : String(base[k]);
  return {
    title: str("title"),
    content: str("content"),
    zoneIds: Array.isArray(r.zoneIds)
      ? r.zoneIds.filter((z): z is string => typeof z === "string")
      : [],
    startDate: str("startDate"),
    endDate: str("endDate"),
    startTime: str("startTime"),
    endTime: str("endTime"),
    durationSeconds: str("durationSeconds"),
    priority: str("priority"),
    urgencyLevel: str("urgencyLevel"),
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function withSeconds(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/** Parsed form: the shared body and the target zones. */
export interface EmergencyDraft {
  zoneIds: number[];
  body: Omit<EmergencyRequest, "zoneId">;
}

/**
 * Builds the schema for a given "today" (Africa/Tunis, YYYY-MM-DD) so the
 * end date can't already be in the past. « Contenu détaillé » is optional in the UI and
 * defaults to the title (the backend requires a non-blank content).
 */
export function emergencySchema(today: string) {
  return z
    .object({
      title: z
        .string({ error: REQUIRED })
        .trim()
        .min(1, { error: REQUIRED })
        .max(TITLE_MAX, maxChars(TITLE_MAX)),
      content: z.string().trim().max(2000, maxChars(2000)),
      zoneIds: z.array(z.string()).refine((ids) => ids.some((v) => (parseInteger(v) ?? 0) > 0), {
        error: "Choisissez au moins une zone.",
      }),
      startDate: z
        .string({ error: REQUIRED })
        .trim()
        .min(1, { error: REQUIRED })
        .regex(ISO_DATE, { error: "Date invalide." }),
      endDate: z
        .string({ error: REQUIRED })
        .trim()
        .min(1, { error: REQUIRED })
        .regex(ISO_DATE, { error: "Date invalide." }),
      startTime: z
        .string()
        .trim()
        .refine((v) => v === "" || TIME.test(v), { error: "Heure invalide." }),
      endTime: z
        .string()
        .trim()
        .refine((v) => v === "" || TIME.test(v), { error: "Heure invalide." }),
      durationSeconds: z
        .string()
        .trim()
        .refine(
          (v) => {
            if (v === "") return true;
            const n = parseInteger(v);
            return n !== null && n >= DURATION_MIN && n <= DURATION_MAX;
          },
          { error: `Entre ${DURATION_MIN} et ${DURATION_MAX} secondes.` },
        ),
      priority: z
        .string()
        .trim()
        .refine(
          (v) => {
            if (v === "") return true;
            const n = parseInteger(v);
            return n !== null && n >= 1 && n <= PRIORITY_MAX;
          },
          { error: "Nombre entier supérieur ou égal à 1." },
        ),
      urgencyLevel: z.enum(URGENCY_LEVELS, { error: "Choisissez un niveau d'urgence." }),
    })
    .superRefine((v, ctx) => {
      if (ISO_DATE.test(v.startDate) && ISO_DATE.test(v.endDate) && v.endDate < v.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "La date de fin doit être postérieure ou égale à la date de début.",
        });
      } else if (ISO_DATE.test(v.endDate) && v.endDate < today) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "La date de fin est déjà passée.",
        });
      }
      const hasStart = v.startTime !== "";
      const hasEnd = v.endTime !== "";
      if (hasStart !== hasEnd) {
        ctx.addIssue({
          code: "custom",
          path: [hasStart ? "endTime" : "startTime"],
          message: "Renseignez les deux heures, ou aucune.",
        });
      } else if (
        hasStart &&
        TIME.test(v.startTime) &&
        TIME.test(v.endTime) &&
        withSeconds(v.endTime) <= withSeconds(v.startTime)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["endTime"],
          message: "L'heure de fin doit être après l'heure de début.",
        });
      }
    })
    .transform((v): EmergencyDraft => ({
      zoneIds: [...new Set(v.zoneIds.map((id) => parseInteger(id) ?? 0).filter((id) => id > 0))],
      body: {
        title: v.title,
        content: v.content || v.title,
        startDate: v.startDate,
        endDate: v.endDate,
        startTime: v.startTime ? withSeconds(v.startTime) : null,
        endTime: v.endTime ? withSeconds(v.endTime) : null,
        durationSeconds: v.durationSeconds ? parseInteger(v.durationSeconds) : null,
        priority: v.priority ? (parseInteger(v.priority) ?? 1) : 1,
        urgencyLevel: v.urgencyLevel,
      },
    }));
}

/** One EmergencyRequest per zone, in the order of `zones` (alphabetical in the form). */
export function emergencyRequests(draft: EmergencyDraft): EmergencyRequest[] {
  return draft.zoneIds.map((zoneId) => ({ ...draft.body, zoneId }));
}

export interface ZonePostResult {
  zoneId: number;
  ok: boolean;
  message?: EmergencyResponse;
  error?: unknown;
}

/** POST one message per zone, one at a time; a failure never stops the next zones. */
export async function createPerZone(
  requests: readonly EmergencyRequest[],
  create: (body: EmergencyRequest) => Promise<EmergencyResponse>,
  onProgress?: (done: number, total: number) => void,
): Promise<ZonePostResult[]> {
  const results: ZonePostResult[] = [];
  for (const body of requests) {
    try {
      results.push({ zoneId: body.zoneId, ok: true, message: await create(body) });
    } catch (error) {
      results.push({ zoneId: body.zoneId, ok: false, error });
    }
    onProgress?.(results.length, requests.length);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Impact (« Visible sur 4 Porteurs actifs à Tunis Centre, dès aujourd'hui »)
// ---------------------------------------------------------------------------
export interface EmergencyImpact {
  porteurs: number;
  zoneNames: string[];
  /** First active Porteur of the targeted zones (player check link). */
  sampleSupportId: number | null;
  sentence: string;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length > 3)
    return `${names.slice(0, 3).join(", ")} et ${names.length - 3} autre${names.length - 3 > 1 ? "s" : ""} zone${names.length - 3 > 1 ? "s" : ""}`;
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

export function emergencyImpact(
  zoneIds: readonly (string | number)[],
  zones: readonly Pick<ZoneResponse, "id" | "name">[],
  supports: readonly Pick<SupportResponse, "id" | "zoneId" | "technicalStatus">[],
  startDate: string,
  today: string,
): EmergencyImpact {
  const ids = new Set(zoneIds.map((z) => Number(z)));
  const zoneNames = zones
    .filter((z) => ids.has(z.id))
    .map((z) => z.name)
    .sort((a, b) => a.localeCompare(b, "fr"));
  const active = supports.filter((s) => ids.has(s.zoneId) && s.technicalStatus === "ACTIF");
  const when =
    !ISO_DATE.test(startDate) || startDate <= today
      ? "dès aujourd'hui"
      : `à partir du ${formatDate(startDate, "medium")}`;
  const n = active.length;
  return {
    porteurs: n,
    zoneNames,
    sampleSupportId: active[0]?.id ?? null,
    sentence:
      zoneNames.length === 0
        ? ""
        : n === 0
          ? `Aucun Porteur actif à ${joinNames(zoneNames)} : le message ne sera visible sur aucun écran pour l'instant.`
          : `Visible sur ${n} Porteur${n > 1 ? "s" : ""} actif${n > 1 ? "s" : ""} à ${joinNames(zoneNames)}, ${when}.`,
  };
}

// ---------------------------------------------------------------------------
// List model
// ---------------------------------------------------------------------------

/** Where a message stands today. Only « en cours » can reach the screens. */
export type EmergencyPhase = "current" | "scheduled" | "expired" | "inactive";

export const EMERGENCY_PHASE: Record<
  EmergencyPhase,
  { label: string; tone: "warning" | "violet" | "muted" | "neutral"; description: string }
> = {
  current: {
    label: "En cours",
    tone: "warning",
    description: "Actif et dans sa période : il prend la main sur les écrans de sa zone.",
  },
  scheduled: {
    label: "Programmé",
    tone: "violet",
    description: "Actif, sa période n'a pas encore commencé.",
  },
  expired: { label: "Période passée", tone: "muted", description: "La date de fin est dépassée." },
  inactive: { label: "Désactivé", tone: "neutral", description: "Retiré de la diffusion." },
};

export function emergencyPhase(
  e: Pick<EmergencyResponse, "isActive" | "startDate" | "endDate">,
  today: string,
): EmergencyPhase {
  if (!e.isActive) return "inactive";
  if (e.endDate < today) return "expired";
  if (e.startDate > today) return "scheduled";
  return "current";
}

const PHASE_ORDER: Record<EmergencyPhase, number> = {
  current: 0,
  scheduled: 1,
  expired: 2,
  inactive: 3,
};

/** Current first (by priority ascending: lower = shown first), then scheduled, then the rest. */
export function sortEmergencies<T extends EmergencyResponse>(
  items: readonly T[],
  today: string,
): T[] {
  return [...items].sort((a, b) => {
    const pa = PHASE_ORDER[emergencyPhase(a, today)];
    const pb = PHASE_ORDER[emergencyPhase(b, today)];
    if (pa !== pb) return pa - pb;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : b.id - a.id;
  });
}
