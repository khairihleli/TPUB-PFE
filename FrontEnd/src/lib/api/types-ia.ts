/**
 * Round-2 AI types (docs/round2-contract.md §2.4, §2.7): image metrics, video frames, vision providers,
 * administrator feedback, calibration and engines. Import by path, never through `@/lib/api`.
 */
import type {
  AiIssueSource,
  AiMediaAnalysis,
  AiReport,
  OcrEngine,
  PageQuery,
  Severity,
} from "@/lib/api/types";

export type AiEngineV2 = "LOCAL" | "OPENAI" | "LOCAL_OPENAI" | "ANTHROPIC" | "LOCAL_ANTHROPIC";
export type AiIssueSourceV2 = AiIssueSource | "ANTHROPIC";
export type AspectFit = "16:9" | "9:16" | "CARRE" | "PROCHE" | "AUTRE";
export type FrameLabel = "DEBUT" | "MILIEU" | "FIN";

export interface DominantColor {
  /** `#rrggbb` */
  hex: string;
  /** 0..1, 3 decimals */
  share: number;
}

export interface ImageMetrics {
  width: number;
  height: number;
  aspectRatio: number;
  aspectFit: AspectFit;
  /** Laplacian variance */
  sharpness: number;
  /** Mean luma 0..255 */
  brightness: number;
  /** Luma standard deviation */
  contrast: number;
  /** 0..1 */
  textCoverage: number;
  dominantColors: DominantColor[];
}

export interface AiMediaFrame {
  label: FrameLabel;
  positionSeconds: number;
  extractedText: string | null;
  metrics: ImageMetrics | null;
}

export interface AiMediaAnalysisV2 extends AiMediaAnalysis {
  ocrEngine: OcrEngine;
  /** Mean word confidence 0..100 */
  ocrConfidence: number | null;
  /** Image metrics, or the worst frame of a video */
  metrics: ImageMetrics | null;
  frames: AiMediaFrame[];
  /** Built by the backend through publicUrl (signed once media signing lands). */
  thumbnailUrl: string | null;
  videoSupported: boolean | null;
  containerDurationSeconds: number | null;
}

export type AiReportV2 = Omit<AiReport, "engine" | "mediaAnalyses"> & {
  engine?: AiEngineV2;
  mediaAnalyses: AiMediaAnalysisV2[];
  providerModel: string | null;
  calibrationVersion: number | null;
};

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------
export type AiProviderKind = "LOCAL" | "OPENAI" | "ANTHROPIC";

export interface AiProvidersResponse {
  provider: AiProviderKind;
  configured: boolean;
  model: string | null;
  ocr: {
    engine: "TESSERACT" | "SIMULE";
    languages: string;
    tessdataPresent: boolean;
    reason: string | null;
  };
  video: { mp4: boolean; webm: boolean };
  learning: { enabled: boolean; autoApply: boolean; cron: string };
}

// ---------------------------------------------------------------------------
// Feedback, calibration, quality
// ---------------------------------------------------------------------------
export type AiFeedbackOutcome =
  "CONFIRMED_APPROVAL" | "FALSE_NEGATIVE" | "FALSE_POSITIVE" | "CONFIRMED_FLAG";
export const AI_FEEDBACK_OUTCOMES: readonly AiFeedbackOutcome[] = [
  "FALSE_POSITIVE",
  "FALSE_NEGATIVE",
  "CONFIRMED_FLAG",
  "CONFIRMED_APPROVAL",
];
export type AiAdminDecisionV2 = "VALIDATED" | "VALIDATED_OVERRIDE" | "REJECTED";
export type AiCalibrationTrigger = "INITIAL" | "PLANIFIE" | "MANUEL";

export interface AiCalibrationResponse {
  version: number;
  active: boolean;
  trigger: AiCalibrationTrigger;
  changed: boolean;
  /** Review from risk ≥ this value. */
  approveThreshold: number;
  /** Reject when risk > this value. */
  rejectThreshold: number;
  ruleWeights: { ruleId: number; ruleName: string | null; weight: number }[];
  feedbackCount: number;
  falsePositives: number;
  falseNegatives: number;
  createdByName: string | null;
  createdAt: string;
}

export interface AiRuleQuality {
  ruleId: number;
  ruleName: string;
  severity: Severity;
  active: boolean;
  matches: number;
  confirmed: number;
  falsePositives: number;
  /** Raw TP / (TP + FP), null without matches. */
  precision: number | null;
  weight: number;
}

export interface AiQualityWeek {
  weekStart: string;
  feedback: number;
  falsePositives: number;
  falseNegatives: number;
  overrides: number;
}

export interface AiQualityResponse {
  from: string;
  to: string;
  feedbackCount: number;
  confirmedApprovals: number;
  falseNegatives: number;
  falsePositives: number;
  confirmedFlags: number;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  accuracy: number | null;
  overrideRate: number | null;
  perRule: AiRuleQuality[];
  weekly: AiQualityWeek[];
  activeCalibration: AiCalibrationResponse | null;
}

export interface AiFeedbackResponse {
  id: number;
  campaignId: number;
  campaignName: string;
  checkId: number | null;
  decisionLogId: number;
  aiStatus: "APPROVED" | "REVIEW_REQUIRED" | "REJECTED";
  adminDecision: AiAdminDecisionV2;
  outcome: AiFeedbackOutcome;
  riskScore: number;
  qualityScore: number;
  matchedRuleIds: number[];
  calibrationVersion: number | null;
  decidedByName: string | null;
  createdAt: string;
}

export interface AiFeedbackQuery extends PageQuery {
  outcome?: readonly AiFeedbackOutcome[];
  ruleId?: number;
  from?: string;
  to?: string;
}
