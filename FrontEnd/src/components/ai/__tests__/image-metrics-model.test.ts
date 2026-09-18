import { describe, expect, it } from "vitest";

import {
  brightnessChip,
  colorSwatches,
  contrastChip,
  engineLabel,
  formatChip,
  formatShare,
  frameCaption,
  hasInsights,
  isNearlyUniform,
  issueSourceLabel,
  metricChips,
  ocrBadge,
  providerBadge,
  sharpnessChip,
  textCoverageChip,
} from "@/components/ai/image-metrics-model";
import { asReportV2 } from "@/lib/api/endpoints-ia";
import type { AiReport } from "@/lib/api/types";
import type { AiMediaAnalysisV2, ImageMetrics } from "@/lib/api/types-ia";

/** Intl outputs no-break spaces (U+00A0, U+202F): compare with plain spaces. */
const NO_BREAK_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, "g");
const plain = (s: string) => s.replace(NO_BREAK_SPACES, " ");

const metrics: ImageMetrics = {
  width: 1920,
  height: 1080,
  aspectRatio: 1.778,
  aspectFit: "16:9",
  sharpness: 240,
  brightness: 120,
  contrast: 55,
  textCoverage: 0.12,
  dominantColors: [
    { hex: "#1F2937", share: 0.34 },
    { hex: "#f97316", share: 0.2 },
  ],
};

function media(over: Partial<AiMediaAnalysisV2> = {}): AiMediaAnalysisV2 {
  return {
    mediaId: 1,
    fileName: "visuel.png",
    contentType: "IMAGE",
    widthPx: 1920,
    heightPx: 1080,
    durationSeconds: null,
    extractedText: null,
    issues: [],
    ocrEngine: "AUCUN",
    ocrConfidence: null,
    metrics: null,
    frames: [],
    thumbnailUrl: null,
    videoSupported: null,
    containerDurationSeconds: null,
    ...over,
  };
}

describe("metric chips mirror ImageAnalyzer thresholds (§2.4)", () => {
  it("sharpness: blurry < 50, limited < 100", () => {
    expect(sharpnessChip(49.9)).toMatchObject({ label: "Netteté : floue", tone: "danger" });
    expect(sharpnessChip(50)).toMatchObject({ label: "Netteté : limitée", tone: "warning" });
    expect(sharpnessChip(100)).toMatchObject({ label: "Netteté : bonne", tone: "success" });
  });

  it("brightness: dark < 50, overexposed > 215", () => {
    expect(brightnessChip(49).label).toBe("Luminosité : trop sombre");
    expect(brightnessChip(50).label).toBe("Luminosité : correcte");
    expect(brightnessChip(215).tone).toBe("success");
    expect(brightnessChip(216)).toMatchObject({
      label: "Luminosité : surexposée",
      tone: "warning",
    });
  });

  it("contrast: low < 30", () => {
    expect(contrastChip(29).label).toBe("Contraste : faible");
    expect(contrastChip(30).label).toBe("Contraste : correct");
  });

  it("text coverage: percent label, warning > 35 %, danger > 50 %", () => {
    expect(plain(textCoverageChip(0.42).label)).toBe("Texte dans le visuel : 42 %");
    expect(textCoverageChip(0.35).tone).toBe("neutral");
    expect(textCoverageChip(0.36).tone).toBe("warning");
    expect(textCoverageChip(0.51).tone).toBe("danger");
  });

  it("format labels", () => {
    expect(formatChip("16:9", 1920, 1080)).toMatchObject({ label: "Format 16:9", tone: "success" });
    expect(formatChip("9:16", 1080, 1920).label).toBe("Format 9:16");
    expect(formatChip("CARRE", 1000, 1000).label).toBe("Format carré");
    expect(formatChip("PROCHE", 1600, 1000).label).toBe("Format à recadrer");
    expect(formatChip("AUTRE", 3000, 1000)).toMatchObject({
      label: "Format à recadrer",
      tone: "warning",
    });
  });

  it("metricChips keeps the documented order", () => {
    expect(metricChips(metrics).map((c) => c.key)).toEqual([
      "sharpness",
      "brightness",
      "contrast",
      "text",
      "format",
    ]);
  });
});

describe("colours, badges and captions", () => {
  it("swatches are lower-cased, labelled and invalid hex dropped", () => {
    const swatches = colorSwatches([...metrics.dominantColors, { hex: "red", share: 0.1 }]);
    expect(swatches).toHaveLength(2);
    expect(plain(swatches[0]!.label)).toBe("Couleur #1f2937 : 34 %");
    expect(swatches[0]!.hex).toBe("#1f2937");
  });

  it("nearly uniform from a 90 % top share", () => {
    expect(isNearlyUniform([{ hex: "#000000", share: 0.9 }])).toBe(true);
    expect(isNearlyUniform([{ hex: "#000000", share: 0.89 }])).toBe(false);
    expect(isNearlyUniform([])).toBe(false);
  });

  it("formatShare rounds to whole percents and handles missing values", () => {
    expect(plain(formatShare(0.125))).toBe("13 %");
    expect(formatShare(null)).toBe("—");
  });

  it("OCR badge", () => {
    expect(plain(ocrBadge("TESSERACT", 86.6)!.label)).toBe("OCR Tesseract (confiance 87 %)");
    expect(ocrBadge("TESSERACT", null)!.label).toBe("OCR Tesseract");
    expect(ocrBadge("SIMULE", null)).toEqual({
      label: "OCR simulé : données Tesseract absentes",
      tone: "warning",
    });
    expect(ocrBadge("AUCUN", null)).toBeNull();
  });

  it("provider badge only for merged engines", () => {
    expect(providerBadge({ engine: "LOCAL_ANTHROPIC", providerModel: "claude-opus-5" })).toBe(
      "Analyse complémentaire : Claude (claude-opus-5)",
    );
    expect(providerBadge({ engine: "LOCAL_OPENAI", providerModel: "gpt-4o-mini" })).toBe(
      "Analyse complémentaire : OpenAI (gpt-4o-mini)",
    );
    expect(providerBadge({ engine: "LOCAL", providerModel: null })).toBeNull();
  });

  it("engine and issue source labels know the Anthropic values", () => {
    expect(engineLabel("LOCAL_ANTHROPIC")).toBe("Règles ZELQANE et analyse Claude");
    expect(engineLabel(null)).toBe("—");
    expect(issueSourceLabel("ANTHROPIC")).toBe("Analyse complémentaire (Claude)");
  });

  it("frame caption", () => {
    expect(plain(frameCaption("MILIEU", 1.54))).toBe("Milieu · 1,5 s");
    expect(frameCaption("DEBUT", 0)).toBe("Début · 0 s");
  });

  it("hasInsights ignores media without round-2 data", () => {
    expect(hasInsights(media())).toBe(false);
    expect(hasInsights(media({ ocrEngine: "SIMULE" }))).toBe(false);
    expect(hasInsights(media({ metrics }))).toBe(true);
    expect(hasInsights(media({ videoSupported: false }))).toBe(true);
    expect(hasInsights(media({ ocrEngine: "TESSERACT" }))).toBe(true);
  });
});

describe("asReportV2", () => {
  it("fills round-2 fields of a pre-round-2 report", () => {
    const report = {
      campaignId: 1,
      checkId: 2,
      aiStatus: "APPROVED",
      riskScore: 10,
      qualityScore: 80,
      engine: "LOCAL",
      mediaAnalyses: [{ mediaId: 5, fileName: "a.png", contentType: "IMAGE", issues: [] }],
    } as unknown as AiReport;
    const v2 = asReportV2(report);
    expect(v2.providerModel).toBeNull();
    expect(v2.calibrationVersion).toBeNull();
    expect(v2.mediaAnalyses[0]).toMatchObject({
      mediaId: 5,
      ocrEngine: "AUCUN",
      metrics: null,
      frames: [],
      thumbnailUrl: null,
      videoSupported: null,
    });
  });

  it("keeps V2 values and guards missing colour arrays", () => {
    const report = {
      aiStatus: "REVIEW_REQUIRED",
      engine: "LOCAL_ANTHROPIC",
      providerModel: "claude-opus-5",
      calibrationVersion: 3,
      mediaAnalyses: [
        {
          mediaId: 7,
          contentType: "VIDEO",
          metrics: { ...metrics, dominantColors: undefined },
          frames: [{ label: "MILIEU", positionSeconds: 5, extractedText: "SOLDES", metrics: null }],
          thumbnailUrl: "/uploads/campaigns/1/thumbs/7.jpg?exp=1&sig=x",
        },
      ],
    } as unknown as AiReport;
    const v2 = asReportV2(report);
    expect(v2.calibrationVersion).toBe(3);
    expect(v2.mediaAnalyses[0]!.metrics!.dominantColors).toEqual([]);
    expect(v2.mediaAnalyses[0]!.frames).toHaveLength(1);
    expect(v2.mediaAnalyses[0]!.thumbnailUrl).toContain("sig=");
  });

  it("tolerates a report without mediaAnalyses", () => {
    expect(asReportV2({ aiStatus: "APPROVED" } as unknown as AiReport).mediaAnalyses).toEqual([]);
  });
});
