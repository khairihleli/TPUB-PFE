/**
 * Image analysis presentation (pure). Thresholds mirror the backend `ImageAnalyzer`
 * (docs/round2-contract.md §2.4); every value shown comes from the AI report.
 */
import type { AiIssueSource, OcrEngine } from "@/lib/api/types";
import type {
  AiEngineV2,
  AiIssueSourceV2,
  AiMediaAnalysisV2,
  AiReportV2,
  AspectFit,
  DominantColor,
  FrameLabel,
  ImageMetrics,
} from "@/lib/api/types-ia";
import { AI_ENGINE_LABEL, AI_ISSUE_SOURCE_LABEL, type Tone } from "@/lib/campaign-status";
import { formatNumber } from "@/lib/format";

export const SHARPNESS_BLURRY = 50;
export const SHARPNESS_LIMITED = 100;
export const BRIGHTNESS_DARK = 50;
export const BRIGHTNESS_OVEREXPOSED = 215;
export const CONTRAST_LOW = 30;
export const TEXT_COVERAGE_HIGH = 0.35;
export const TEXT_COVERAGE_OVERLOAD = 0.5;
export const UNIFORM_SHARE = 0.9;

const HEX = /^#[0-9a-f]{6}$/i;

export const FRAME_LABEL: Record<FrameLabel, string> = {
  DEBUT: "Début",
  MILIEU: "Milieu",
  FIN: "Fin",
};

export const ASPECT_LABEL: Record<AspectFit, string> = {
  "16:9": "Format 16:9",
  "9:16": "Format 9:16",
  CARRE: "Format carré",
  PROCHE: "Format à recadrer",
  AUTRE: "Format à recadrer",
};

/** 0.42 → "42 %" (whole percent). */
export function formatShare(share: number | null | undefined): string {
  if (typeof share !== "number" || !Number.isFinite(share)) return "—";
  return `${formatNumber(Math.round(share * 100))} %`;
}

export interface MetricChip {
  key: "sharpness" | "brightness" | "contrast" | "text" | "format";
  label: string;
  tone: Tone;
  /** Explanation of the reference (title / sr text). */
  hint: string;
}

export function sharpnessChip(value: number): MetricChip {
  const level =
    value < SHARPNESS_BLURRY ? "floue" : value < SHARPNESS_LIMITED ? "limitée" : "bonne";
  return {
    key: "sharpness",
    label: `Netteté : ${level}`,
    tone: value < SHARPNESS_BLURRY ? "danger" : value < SHARPNESS_LIMITED ? "warning" : "success",
    hint: `Indice ${formatNumber(Math.round(value))} (flou sous ${SHARPNESS_BLURRY}, limité sous ${SHARPNESS_LIMITED})`,
  };
}

export function brightnessChip(value: number): MetricChip {
  const dark = value < BRIGHTNESS_DARK;
  const bright = value > BRIGHTNESS_OVEREXPOSED;
  return {
    key: "brightness",
    label: `Luminosité : ${dark ? "trop sombre" : bright ? "surexposée" : "correcte"}`,
    tone: dark || bright ? "warning" : "success",
    hint: `Moyenne ${formatNumber(Math.round(value))} sur 255 (attendu entre ${BRIGHTNESS_DARK} et ${BRIGHTNESS_OVEREXPOSED})`,
  };
}

export function contrastChip(value: number): MetricChip {
  const low = value < CONTRAST_LOW;
  return {
    key: "contrast",
    label: `Contraste : ${low ? "faible" : "correct"}`,
    tone: low ? "warning" : "success",
    hint: `Écart type ${formatNumber(Math.round(value))} (faible sous ${CONTRAST_LOW})`,
  };
}

export function textCoverageChip(value: number): MetricChip {
  return {
    key: "text",
    label: `Texte dans le visuel : ${formatShare(value)}`,
    tone:
      value > TEXT_COVERAGE_OVERLOAD ? "danger" : value > TEXT_COVERAGE_HIGH ? "warning" : "neutral",
    hint: `Surface couverte par le texte lu (trop présent au-delà de ${formatShare(TEXT_COVERAGE_HIGH)})`,
  };
}

export function formatChip(fit: AspectFit, width: number, height: number): MetricChip {
  return {
    key: "format",
    label: ASPECT_LABEL[fit],
    tone: fit === "16:9" || fit === "9:16" ? "success" : fit === "AUTRE" ? "warning" : "neutral",
    hint: `${formatNumber(width)} × ${formatNumber(height)} px`,
  };
}

export function metricChips(m: ImageMetrics): MetricChip[] {
  return [
    sharpnessChip(m.sharpness),
    brightnessChip(m.brightness),
    contrastChip(m.contrast),
    textCoverageChip(m.textCoverage),
    formatChip(m.aspectFit, m.width, m.height),
  ];
}

/** Valid swatches only, with their accessible label « Couleur #1f2937 : 34 % ». */
export function colorSwatches(colors: readonly DominantColor[]): (DominantColor & { label: string })[] {
  return colors
    .filter((c) => HEX.test(c.hex))
    .map((c) => ({ ...c, hex: c.hex.toLowerCase(), label: `Couleur ${c.hex.toLowerCase()} : ${formatShare(c.share)}` }));
}

export function isNearlyUniform(colors: readonly DominantColor[]): boolean {
  return (colors[0]?.share ?? 0) >= UNIFORM_SHARE;
}

/** « OCR Tesseract (confiance 87 %) », « OCR simulé : données Tesseract absentes », or null when nothing was read. */
export function ocrBadge(
  engine: OcrEngine,
  confidence: number | null,
): { label: string; tone: Tone } | null {
  if (engine === "TESSERACT") {
    return {
      label:
        typeof confidence === "number"
          ? `OCR Tesseract (confiance ${formatNumber(Math.round(confidence))} %)`
          : "OCR Tesseract",
      tone: "info",
    };
  }
  if (engine === "SIMULE") {
    return { label: "OCR simulé : données Tesseract absentes", tone: "warning" };
  }
  return null;
}

/** « Analyse complémentaire : Claude (claude-opus-5) » when a provider was merged. */
export function providerBadge(report: Pick<AiReportV2, "engine" | "providerModel">): string | null {
  const name =
    report.engine === "LOCAL_ANTHROPIC" || report.engine === "ANTHROPIC"
      ? "Claude"
      : report.engine === "LOCAL_OPENAI" || report.engine === "OPENAI"
        ? "OpenAI"
        : null;
  if (!name) return null;
  return `Analyse complémentaire : ${name}${report.providerModel ? ` (${report.providerModel})` : ""}`;
}

const ENGINE_LABEL_V2: Record<AiEngineV2, string> = {
  ...AI_ENGINE_LABEL,
  ANTHROPIC: "Analyse externe (Claude)",
  LOCAL_ANTHROPIC: "Règles TPUB et analyse Claude",
};

export function engineLabel(engine: string | null | undefined): string {
  if (!engine) return "—";
  return ENGINE_LABEL_V2[engine as AiEngineV2] ?? engine;
}

const ISSUE_SOURCE_LABEL_V2: Record<AiIssueSourceV2, string> = {
  ...AI_ISSUE_SOURCE_LABEL,
  ANTHROPIC: "Analyse complémentaire (Claude)",
};

export function issueSourceLabel(source: AiIssueSource | AiIssueSourceV2): string {
  return ISSUE_SOURCE_LABEL_V2[source] ?? source;
}

/** A media analysis carries round-2 data worth a dedicated block. */
export function hasInsights(m: AiMediaAnalysisV2): boolean {
  return (
    m.metrics !== null ||
    m.frames.length > 0 ||
    m.thumbnailUrl !== null ||
    m.videoSupported === false ||
    m.ocrEngine === "TESSERACT"
  );
}

/** « Milieu · 1,5 s ». */
export function frameCaption(label: FrameLabel, positionSeconds: number): string {
  const seconds = Math.round(positionSeconds * 10) / 10;
  return `${FRAME_LABEL[label]} · ${formatNumber(seconds)} s`;
}
