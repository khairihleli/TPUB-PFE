/**
 * « Qualité de l'IA » (pure, docs/round2-contract.md §2.7, §2.9): labels, KPI tiles, weekly chart points,
 * calibration texts and engine hints. Every number comes from `/ai/quality`, `/ai/calibrations` or
 * `/ai/providers`.
 */
import type { ChartPoint } from "@/components/admin/stats-model";
import type { RoleCode } from "@/lib/api/types";
import type {
  AiAdminDecisionV2,
  AiCalibrationResponse,
  AiCalibrationTrigger,
  AiFeedbackOutcome,
  AiProviderKind,
  AiProvidersResponse,
  AiQualityResponse,
} from "@/lib/api/types-ia";
import type { Tone } from "@/lib/campaign-status";
import { formatDayMonth, formatNumber, normalizeNumberSpaces } from "@/lib/format";

export const FETCH_TESSDATA_HINT =
  "Exécutez BackEnd/scripts/fetch-tessdata.ps1 puis redémarrez le backend";

export const OUTCOME_META: Record<
  AiFeedbackOutcome,
  { label: string; tone: Tone; description: string }
> = {
  FALSE_POSITIVE: {
    label: "Faux positif",
    tone: "warning",
    description: "L'IA a signalé la campagne, l'administrateur l'a validée.",
  },
  FALSE_NEGATIVE: {
    label: "Faux négatif",
    tone: "danger",
    description: "L'IA a approuvé la campagne, l'administrateur l'a refusée.",
  },
  CONFIRMED_FLAG: {
    label: "Signalement confirmé",
    tone: "success",
    description: "L'IA a signalé la campagne, l'administrateur l'a refusée.",
  },
  CONFIRMED_APPROVAL: {
    label: "Approbation confirmée",
    tone: "success",
    description: "L'IA a approuvé la campagne, l'administrateur l'a validée.",
  },
};

export const ADMIN_DECISION_LABEL: Record<AiAdminDecisionV2, string> = {
  VALIDATED: "Validée",
  VALIDATED_OVERRIDE: "Validée par dérogation",
  REJECTED: "Refusée",
};

export const TRIGGER_LABEL: Record<AiCalibrationTrigger, string> = {
  INITIAL: "Initiale",
  PLANIFIE: "Planifiée",
  MANUEL: "Manuelle",
};

export const PROVIDER_LABEL: Record<AiProviderKind, string> = {
  LOCAL: "Analyse locale seule",
  OPENAI: "OpenAI",
  ANTHROPIC: "Claude (Anthropic)",
};

const weightFormatter = new Intl.NumberFormat("fr-TN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const rateFormatter = new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 1 });

/** 0.1234 → "12,3 %", null → "—". */
export function formatRate(rate: number | null | undefined): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";
  return `${normalizeNumberSpaces(rateFormatter.format(rate * 100))} %`;
}

export function canManageCalibration(role: RoleCode | null | undefined): boolean {
  return role === "ADMINISTRATEUR";
}

export interface KpiTile {
  key: string;
  label: string;
  value: string;
  hint: string;
  accent: "orange" | "blue" | "red" | "success" | "warning" | "neutral";
}

export function kpiTiles(q: AiQualityResponse): KpiTile[] {
  return [
    {
      key: "fp",
      label: "Faux positifs",
      value: formatNumber(q.falsePositives),
      hint: `Taux ${formatRate(q.falsePositiveRate)} des signalements`,
      accent: "warning",
    },
    {
      key: "fn",
      label: "Faux négatifs",
      value: formatNumber(q.falseNegatives),
      hint: `Taux ${formatRate(q.falseNegativeRate)} des approbations`,
      accent: "red",
    },
    {
      key: "override",
      label: "Taux de dérogation",
      value: formatRate(q.overrideRate),
      hint: "Validations malgré l'avis de l'IA",
      accent: "orange",
    },
    {
      key: "accuracy",
      label: "Exactitude",
      value: formatRate(q.accuracy),
      hint: "Avis de l'IA confirmés par l'administrateur",
      accent: "success",
    },
    {
      key: "count",
      label: "Décisions analysées",
      value: formatNumber(q.feedbackCount),
      hint: `${formatNumber(q.confirmedApprovals + q.confirmedFlags)} confirmée${q.confirmedApprovals + q.confirmedFlags > 1 ? "s" : ""}`,
      accent: "blue",
    },
  ];
}

/** « Semaine du 31 août ». */
export function weekLabel(weekStart: string): string {
  return `Semaine du ${formatDayMonth(weekStart)}`;
}

export function weeklyDecisionPoints(q: Pick<AiQualityResponse, "weekly">): ChartPoint[] {
  return q.weekly.map((w) => ({
    key: w.weekStart,
    label: formatDayMonth(w.weekStart),
    value: w.feedback,
  }));
}

/** Errors of the AI per week: false positives + false negatives. */
export function weeklyErrorPoints(q: Pick<AiQualityResponse, "weekly">): ChartPoint[] {
  return q.weekly.map((w) => ({
    key: w.weekStart,
    label: formatDayMonth(w.weekStart),
    value: w.falsePositives + w.falseNegatives,
  }));
}

/** « Revue à partir d'un risque de 31 », « Refus au-delà de 70 ». */
export function thresholdTexts(
  c: Pick<AiCalibrationResponse, "approveThreshold" | "rejectThreshold">,
): {
  review: string;
  reject: string;
} {
  return {
    review: `Revue à partir d'un risque de ${c.approveThreshold}`,
    reject: `Refus au-delà de ${c.rejectThreshold}`,
  };
}

/** Toast after « Recalibrer maintenant ». */
export function recalibrationMessage(
  c: Pick<AiCalibrationResponse, "version" | "active" | "changed">,
): {
  title: string;
  description: string;
} {
  if (!c.changed) {
    return {
      title: `Version ${c.version} enregistrée`,
      description: "Aucun changement : les seuils et les poids restent identiques.",
    };
  }
  if (c.active) {
    return {
      title: `Version ${c.version} activée`,
      description: "Les prochaines analyses utilisent les nouveaux seuils et poids.",
    };
  }
  return {
    title: `Proposition v${c.version} enregistrée`,
    description:
      "L'application automatique est désactivée : activez la version si elle vous convient.",
  };
}

/** Rule weights that differ from 1, as « casino ×0,85 ». */
export function weightSummary(c: Pick<AiCalibrationResponse, "ruleWeights">): string {
  if (c.ruleWeights.length === 0) return "Aucun poids ajusté";
  return c.ruleWeights
    .map((w) => `${w.ruleName ?? `Règle #${w.ruleId}`} ×${weightFormatter.format(w.weight)}`)
    .join(", ");
}

export interface EngineFact {
  label: string;
  value: string;
  tone: Tone;
}

export function engineFacts(p: AiProvidersResponse): EngineFact[] {
  return [
    {
      label: "Analyse complémentaire",
      value:
        p.provider === "LOCAL"
          ? PROVIDER_LABEL.LOCAL
          : p.configured
            ? `${PROVIDER_LABEL[p.provider]}${p.model ? ` (${p.model})` : ""}`
            : `${PROVIDER_LABEL[p.provider]} sans clé : analyse locale seule`,
      tone: p.provider === "LOCAL" ? "neutral" : p.configured ? "success" : "warning",
    },
    {
      label: "OCR",
      value:
        p.ocr.engine === "TESSERACT"
          ? `Tesseract (${p.ocr.languages})`
          : "OCR simulé (texte déduit du nom des fichiers)",
      tone: p.ocr.engine === "TESSERACT" ? "success" : "warning",
    },
    {
      label: "Vidéo",
      value: `${p.video.mp4 ? "MP4 analysé image par image" : "MP4 non analysé"}${p.video.webm ? ", WebM analysé" : ", WebM non analysé"}`,
      tone: p.video.mp4 ? "success" : "warning",
    },
    {
      label: "Apprentissage",
      value: p.learning.enabled
        ? `Actif, ${p.learning.autoApply ? "application automatique" : "propositions à valider"}`
        : "Désactivé",
      tone: p.learning.enabled ? "success" : "neutral",
    },
  ];
}

/** Hint shown when Tesseract data is missing. */
export function ocrHint(p: AiProvidersResponse): string | null {
  return p.ocr.tessdataPresent ? null : FETCH_TESSDATA_HINT;
}

// ---------------------------------------------------------------------------
// Page state
// ---------------------------------------------------------------------------
export const QUALITY_TABS = [
  { value: "synthese", label: "Synthèse" },
  { value: "retours", label: "Retours" },
] as const;
export type QualityTab = (typeof QUALITY_TABS)[number]["value"];
export const QUALITY_TAB_VALUES: readonly QualityTab[] = QUALITY_TABS.map((t) => t.value);

/** Backend limit of `GET /ai/quality` (400 INVALID_RANGE beyond). */
export const MAX_RANGE_DAYS = 366;

/** Inclusive day count of an ISO range, null when a bound is missing or reversed. */
export function rangeDays(from: string, to: string): number | null {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** French message when the period cannot be sent, null when it is valid. */
export function rangeError(from: string, to: string): string | null {
  const days = rangeDays(from, to);
  if (days === null) return "Choisissez une date de fin postérieure à la date de début.";
  if (days > MAX_RANGE_DAYS) return `La période ne peut pas dépasser ${MAX_RANGE_DAYS} jours.`;
  return null;
}

/** Outcome filter from the URL (`?resultat=FALSE_POSITIVE`), empty = every outcome. */
export function parseOutcome(raw: string | null | undefined): AiFeedbackOutcome | "" {
  return raw && Object.hasOwn(OUTCOME_META, raw) ? (raw as AiFeedbackOutcome) : "";
}

/** Rule precision as a percentage, « — » without a match. */
export function formatPrecision(precision: number | null): string {
  return formatRate(precision);
}

/** A week of the chart table: label + the four figures of the backend row. */
export function weeklyTableRows(q: Pick<AiQualityResponse, "weekly">): string[][] {
  return q.weekly.map((w) => [
    weekLabel(w.weekStart),
    formatNumber(w.feedback),
    formatNumber(w.falsePositives),
    formatNumber(w.falseNegatives),
    formatNumber(w.overrides),
  ]);
}
