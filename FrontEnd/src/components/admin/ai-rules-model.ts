/**
 * AI moderation rules (pure), contract §2.2 `/api/ai/rules`:
 * form schema mirroring the backend limits, server error mapping, list filters and a local
 * « tester la règle » preview that follows the backend matching (normalised text, whole words).
 */
import { z } from "zod";

import { maxChars, REQUIRED } from "@/components/admin/form-utils";
import { hasErrorCode } from "@/lib/api/errors";
import type { AiCalibrationResponse } from "@/lib/api/types-ia";
import {
  AI_SECTORS,
  type AiRuleRequest,
  type AiRuleResponse,
  type AiRuleType,
  type AiSector,
  type Severity,
} from "@/lib/api/types";

export const RULE_TYPES = ["KEYWORD", "REGEX"] as const satisfies readonly AiRuleType[];
export const SEVERITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const satisfies readonly Severity[];

export const RULE_TYPE_LABEL: Record<AiRuleType, string> = {
  KEYWORD: "Mots-clés",
  REGEX: "Expression régulière",
};

/** Risk points added by a hit (contract §2.2). */
export const SEVERITY_POINTS: Record<Severity, number> = {
  LOW: 10,
  MEDIUM: 25,
  HIGH: 45,
  CRITICAL: 80,
};

export const RULE_NAME_MAX = 150;
export const RULE_PATTERN_MAX = 2000;
export const RULE_DESCRIPTION_MAX = 1000;

export const RULE_FIELDS = [
  "ruleName",
  "ruleType",
  "pattern",
  "severity",
  "sector",
  "isActive",
  "description",
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export interface RuleFormValues {
  ruleName: string;
  ruleType: AiRuleType;
  pattern: string;
  severity: Severity;
  /** "" = every sector. */
  sector: AiSector | "";
  isActive: boolean;
  description: string;
}

export function ruleFormFrom(rule?: AiRuleResponse | null): RuleFormValues {
  return {
    ruleName: rule?.ruleName ?? "",
    ruleType: rule?.ruleType ?? "KEYWORD",
    pattern: rule?.pattern ?? "",
    severity: rule?.severity ?? "MEDIUM",
    sector: rule?.sector ?? "",
    isActive: rule?.isActive ?? true,
    description: rule?.description ?? "",
  };
}

/** Same normalisation as the backend `TextNormalizer`: lowercase, accents stripped. */
export function normalizeRuleText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** « gratuit, 100% garanti » → ["gratuit", "100% garanti"] (normalised, blanks dropped). */
export function keywordList(pattern: string): string[] {
  return pattern
    .split(",")
    .map((k) => normalizeRuleText(k).trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

/** Compile check with the browser engine (the backend compiles with Java: `INVALID_REGEX` wins). */
export function regexError(pattern: string): string | null {
  try {
    new RegExp(pattern, "iu");
    return null;
  } catch {
    return "Expression régulière invalide.";
  }
}

export const ruleSchema = z
  .object({
    ruleName: z
      .string({ error: REQUIRED })
      .trim()
      .min(1, { error: REQUIRED })
      .max(RULE_NAME_MAX, maxChars(RULE_NAME_MAX)),
    ruleType: z.enum(RULE_TYPES, { error: "Choisissez un type de règle." }),
    pattern: z
      .string({ error: REQUIRED })
      .trim()
      .min(1, { error: REQUIRED })
      .max(RULE_PATTERN_MAX, maxChars(RULE_PATTERN_MAX)),
    severity: z.enum(SEVERITIES, { error: "Choisissez une gravité." }),
    sector: z.enum(["", ...AI_SECTORS] as [string, ...string[]]),
    isActive: z.boolean(),
    description: z.string().trim().max(RULE_DESCRIPTION_MAX, maxChars(RULE_DESCRIPTION_MAX)),
  })
  .superRefine((v, ctx) => {
    if (v.ruleType === "REGEX" && v.pattern && regexError(v.pattern)) {
      ctx.addIssue({
        code: "custom",
        path: ["pattern"],
        message: "Expression régulière invalide.",
      });
    }
    if (v.ruleType === "KEYWORD" && v.pattern && keywordList(v.pattern).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["pattern"],
        message: "Indiquez au moins un mot ou une expression, séparés par des virgules.",
      });
    }
  })
  .transform((v): AiRuleRequest => ({
    ruleName: v.ruleName,
    ruleType: v.ruleType,
    pattern: v.pattern,
    severity: v.severity,
    sector: v.sector === "" ? null : (v.sector as AiSector),
    isActive: v.isActive,
    description: v.description ? v.description : null,
  }));

/** Backend conflicts mapped onto the form fields. */
export function ruleServerErrors(e: unknown): Partial<Record<RuleField, string>> {
  if (hasErrorCode(e, "AI_RULE_NAME_TAKEN")) {
    return { ruleName: "Une règle porte déjà ce nom." };
  }
  if (hasErrorCode(e, "INVALID_REGEX")) {
    return { pattern: "Expression régulière refusée par le moteur de modération." };
  }
  return {};
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches of a rule in a sample text (« Tester la règle »): whole words/phrases for KEYWORD,
 * case-insensitive regex for REGEX, both on the normalised text.
 */
export function testRule(
  rule: Pick<RuleFormValues, "ruleType" | "pattern">,
  sample: string,
): string[] {
  const text = normalizeRuleText(sample);
  if (!text.trim() || !rule.pattern.trim()) return [];
  if (rule.ruleType === "KEYWORD") {
    return keywordList(rule.pattern).filter((k) =>
      new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(k)}($|[^\\p{L}\\p{N}])`, "u").test(text),
    );
  }
  if (regexError(rule.pattern)) return [];
  const found = text.match(new RegExp(rule.pattern, "giu"));
  return found ? [...new Set(found.map((m) => m.trim()).filter(Boolean))] : [];
}

// ---------------------------------------------------------------------------
// List filters
// ---------------------------------------------------------------------------
export interface RuleFilters {
  q: string;
  type: AiRuleType | "";
  severity: Severity | "";
  active: "" | "actives" | "inactives";
}

export function filterRules(rules: readonly AiRuleResponse[], f: RuleFilters): AiRuleResponse[] {
  const q = normalizeRuleText(f.q).trim();
  const rank: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return rules
    .filter(
      (r) =>
        (!q ||
          normalizeRuleText(`${r.ruleName} ${r.pattern} ${r.description ?? ""}`).includes(q)) &&
        (!f.type || r.ruleType === f.type) &&
        (!f.severity || r.severity === f.severity) &&
        (!f.active || (f.active === "actives") === r.isActive),
    )
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        rank[a.severity] - rank[b.severity] ||
        a.ruleName.localeCompare(b.ruleName, "fr"),
    );
}

/** « 6 règles actives sur 8 ». */
export function rulesSummary(rules: readonly Pick<AiRuleResponse, "isActive">[]): string {
  const active = rules.filter((r) => r.isActive).length;
  return `${active} règle${active > 1 ? "s" : ""} active${active > 1 ? "s" : ""} sur ${rules.length}`;
}

// ---------------------------------------------------------------------------
// Learnt weights (docs/round2-contract.md §2.6)
// ---------------------------------------------------------------------------
const weightFormatter = new Intl.NumberFormat("fr-TN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** The active calibration of a version list, if any. */
export function activeCalibration(
  versions: readonly AiCalibrationResponse[] | undefined,
): AiCalibrationResponse | undefined {
  return versions?.find((v) => v.active);
}

/** Learnt weight of a rule: absent from the calibration = 1 (neutral). */
export function learnedWeight(
  calibration: Pick<AiCalibrationResponse, "ruleWeights"> | undefined | null,
  ruleId: number,
): number {
  return calibration?.ruleWeights.find((w) => w.ruleId === ruleId)?.weight ?? 1;
}

/** 1 → "1,00", 0.85 → "0,85". */
export function formatWeight(weight: number): string {
  return weightFormatter.format(weight);
}

/** Effective risk points of a rule after its learnt weight (backend rounding). */
export function weightedPoints(severity: Severity, weight: number): number {
  return Math.round(SEVERITY_POINTS[severity] * weight);
}

/** Full PUT body from a stored rule (activation toggle). */
export function ruleRequestFrom(
  rule: AiRuleResponse,
  patch: Partial<AiRuleRequest> = {},
): AiRuleRequest {
  return {
    ruleName: rule.ruleName,
    ruleType: rule.ruleType,
    pattern: rule.pattern,
    severity: rule.severity,
    sector: rule.sector,
    isActive: rule.isActive,
    description: rule.description,
    ...patch,
  };
}
