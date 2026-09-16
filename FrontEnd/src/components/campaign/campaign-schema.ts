/**
 * Campaign form (wizard step 1 + edit page): zod schema aligned with the backend rules
 * (contract §5.2) plus the client-side checks the backend does not do:
 * startDate ≥ today, endDate ≥ startDate, endTime > startTime, times sent as HH:mm:ss.
 */
import { z } from "zod";

import type { CampaignRequest, CampaignResponse } from "@/lib/api/types";
import { fromApiTime, toApiTime } from "@/lib/format";

export const CAMPAIGN_FIELDS = [
  "name",
  "objective",
  "budget",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
] as const;

export type CampaignField = (typeof CAMPAIGN_FIELDS)[number];

/** Raw form state: every control holds a string. */
export type CampaignFormValues = Record<CampaignField, string>;

export type CampaignFormErrors = Partial<Record<CampaignField, string>>;

export const EMPTY_CAMPAIGN_FORM: CampaignFormValues = {
  name: "",
  objective: "",
  budget: "",
  startDate: "",
  endDate: "",
  startTime: "08:00",
  endTime: "22:00",
};

export const NAME_MAX = 200;
export const OBJECTIVE_MIN = 10;
export const OBJECTIVE_MAX = 2000;
/** NUMERIC(14,2) → 12 integer digits. */
export const BUDGET_MAX = 999_999_999_999.99;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;

/** "1 500,50" / "1500.5" / "1 500" → 1500.5 ; anything else → NaN. */
export function parseBudget(raw: string): number {
  // \s also matches no-break and narrow no-break spaces (fr-TN grouping).
  const compact = raw.replace(/\s/g, "").replace(",", ".");
  // NUMERIC(14,2): at most two decimals.
  if (!/^-?\d+(\.\d{1,2})?$/.test(compact)) return Number.NaN;
  return Number(compact);
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "08:00" → minutes since midnight; invalid → null. */
export function timeToMinutes(value: string): number | null {
  const m = TIME.exec(value.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface CampaignSchemaOptions {
  /** Today's date in Africa/Tunis ("YYYY-MM-DD"). */
  today: string;
  /**
   * Screens are already booked for the current period (no reservation update endpoint):
   * the period and time range are read-only and are not re-validated against today.
   */
  lockSchedule?: boolean;
}

export function createCampaignSchema({ today, lockSchedule = false }: CampaignSchemaOptions) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, { error: "Donnez un nom à votre campagne." })
        .max(NAME_MAX, { error: `${NAME_MAX} caractères maximum.` }),
      objective: z
        .string()
        .trim()
        .min(1, { error: "Décrivez l'objectif de la campagne." })
        .min(OBJECTIVE_MIN, {
          error: `Précisez l'objectif en quelques mots (${OBJECTIVE_MIN} caractères minimum).`,
        })
        .max(OBJECTIVE_MAX, { error: `${OBJECTIVE_MAX} caractères maximum.` }),
      budget: z
        .string()
        .trim()
        .min(1, { error: "Indiquez un budget en dinars (0 accepté)." })
        .refine((v) => !Number.isNaN(parseBudget(v)), {
          error:
            "Budget invalide : saisissez un montant en dinars (deux décimales au plus), par exemple 2500.",
        })
        .refine((v) => Number.isNaN(parseBudget(v)) || parseBudget(v) >= 0, {
          error: "Le budget ne peut pas être négatif.",
        })
        .refine((v) => Number.isNaN(parseBudget(v)) || parseBudget(v) <= BUDGET_MAX, {
          error: "Montant trop élevé.",
        }),
      startDate: z
        .string()
        .min(1, { error: "Choisissez la date de début." })
        .refine(isRealDate, { error: "Date invalide." }),
      endDate: z
        .string()
        .min(1, { error: "Choisissez la date de fin." })
        .refine(isRealDate, { error: "Date invalide." }),
      startTime: z
        .string()
        .min(1, { error: "Choisissez l'heure de début." })
        .refine((v) => timeToMinutes(v) !== null, { error: "Heure invalide." }),
      endTime: z
        .string()
        .min(1, { error: "Choisissez l'heure de fin." })
        .refine((v) => timeToMinutes(v) !== null, { error: "Heure invalide." }),
    })
    .superRefine((v, ctx) => {
      if (lockSchedule) return;
      if (isRealDate(v.startDate) && v.startDate < today) {
        ctx.addIssue({
          code: "custom",
          path: ["startDate"],
          message: "La date de début ne peut pas être passée.",
        });
      }
      if (isRealDate(v.startDate) && isRealDate(v.endDate) && v.endDate < v.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "La date de fin doit être égale ou postérieure à la date de début.",
        });
      }
      const start = timeToMinutes(v.startTime);
      const end = timeToMinutes(v.endTime);
      if (start !== null && end !== null && end <= start) {
        ctx.addIssue({
          code: "custom",
          path: ["endTime"],
          message: "L'heure de fin doit être postérieure à l'heure de début.",
        });
      }
    });
}

/** Form values → CampaignRequest (times HH:mm:ss, budget number, trimmed text). */
export function toCampaignRequest(values: CampaignFormValues): CampaignRequest {
  return {
    name: values.name.trim(),
    objective: values.objective.trim() || null,
    budget: parseBudget(values.budget),
    startDate: values.startDate || null,
    endDate: values.endDate || null,
    startTime: values.startTime ? toApiTime(values.startTime) : null,
    endTime: values.endTime ? toApiTime(values.endTime) : null,
  };
}

/** CampaignResponse → form values (HH:mm:ss → HH:mm for <input type="time">). */
export function campaignToFormValues(c: CampaignResponse): CampaignFormValues {
  return {
    name: c.name ?? "",
    objective: c.objective ?? "",
    budget: Number.isFinite(c.budget) ? String(c.budget) : "",
    startDate: c.startDate ?? "",
    endDate: c.endDate ?? "",
    startTime: fromApiTime(c.startTime),
    endTime: fromApiTime(c.endTime),
  };
}

export type CampaignValidation =
  | { ok: true; request: CampaignRequest; errors: CampaignFormErrors }
  | { ok: false; request: null; errors: CampaignFormErrors };

/** Validates and converts in one call. One French message per field (first issue wins). */
export function validateCampaignForm(
  values: CampaignFormValues,
  options: CampaignSchemaOptions,
): CampaignValidation {
  const result = createCampaignSchema(options).safeParse(values);
  if (result.success) {
    return { ok: true, request: toCampaignRequest(values), errors: {} };
  }
  const errors: CampaignFormErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && (CAMPAIGN_FIELDS as readonly string[]).includes(key)) {
      errors[key as CampaignField] ??= issue.message;
    }
  }
  return { ok: false, request: null, errors };
}

/** Maps Spring field errors (already French) onto the form fields. */
export function mapServerFieldErrors(fieldErrors: Record<string, string>): CampaignFormErrors {
  const out: CampaignFormErrors = {};
  for (const [key, message] of Object.entries(fieldErrors)) {
    if ((CAMPAIGN_FIELDS as readonly string[]).includes(key)) out[key as CampaignField] = message;
  }
  return out;
}

/** True when a campaign has everything a reservation needs (dates + times). */
export function hasSchedule(
  c: Pick<CampaignResponse, "startDate" | "endDate" | "startTime" | "endTime">,
): c is { startDate: string; endDate: string; startTime: string; endTime: string } {
  return Boolean(c.startDate && c.endDate && c.startTime && c.endTime);
}
