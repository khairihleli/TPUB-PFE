import { describe, expect, it } from "vitest";

import {
  canManageCalibration,
  engineFacts,
  FETCH_TESSDATA_HINT,
  formatRate,
  kpiTiles,
  ocrHint,
  parseOutcome,
  rangeDays,
  rangeError,
  recalibrationMessage,
  thresholdTexts,
  weeklyDecisionPoints,
  weeklyErrorPoints,
  weeklyTableRows,
  weightSummary,
} from "@/components/admin/ai-quality-model";
import {
  activeCalibration,
  formatWeight,
  learnedWeight,
  SEVERITY_POINTS,
  weightedPoints,
} from "@/components/admin/ai-rules-model";
import type {
  AiCalibrationResponse,
  AiProvidersResponse,
  AiQualityResponse,
} from "@/lib/api/types-ia";

/** Intl outputs no-break spaces (U+00A0, U+202F): compare with plain spaces. */
const NO_BREAK_SPACES = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, "g");
const plain = (s: string) => s.replace(NO_BREAK_SPACES, " ");

const calibration: AiCalibrationResponse = {
  version: 2,
  active: true,
  trigger: "MANUEL",
  changed: true,
  approveThreshold: 34,
  rejectThreshold: 72,
  ruleWeights: [{ ruleId: 4, ruleName: "casino", weight: 0.85 }],
  feedbackCount: 25,
  falsePositives: 6,
  falseNegatives: 1,
  createdByName: "Admin",
  createdAt: "2026-09-10T08:00:00Z",
};

const quality: AiQualityResponse = {
  from: "2026-06-20",
  to: "2026-09-17",
  feedbackCount: 25,
  confirmedApprovals: 12,
  falseNegatives: 1,
  falsePositives: 6,
  confirmedFlags: 6,
  falsePositiveRate: 0.5,
  falseNegativeRate: 1 / 13,
  accuracy: 0.72,
  overrideRate: null,
  perRule: [],
  weekly: [
    { weekStart: "2026-09-07", feedback: 4, falsePositives: 1, falseNegatives: 1, overrides: 2 },
    { weekStart: "2026-09-14", feedback: 0, falsePositives: 0, falseNegatives: 0, overrides: 0 },
  ],
  activeCalibration: calibration,
};

const providers: AiProvidersResponse = {
  provider: "ANTHROPIC",
  configured: true,
  model: "claude-opus-5",
  ocr: {
    engine: "SIMULE",
    languages: "fra+eng+ara",
    tessdataPresent: false,
    reason: "fra.traineddata absent",
  },
  video: { mp4: true, webm: false },
  learning: { enabled: true, autoApply: false, cron: "0 30 3 * * *" },
};

describe("rates and KPI tiles", () => {
  it("formats rates and null as a dash", () => {
    expect(plain(formatRate(0.1234))).toBe("12,3 %");
    expect(plain(formatRate(1))).toBe("100 %");
    expect(formatRate(null)).toBe("—");
  });

  it("builds the five tiles in the contract order", () => {
    const tiles = kpiTiles(quality);
    expect(tiles.map((t) => t.label)).toEqual([
      "Faux positifs",
      "Faux négatifs",
      "Taux de dérogation",
      "Exactitude",
      "Décisions analysées",
    ]);
    expect(tiles[2]!.value).toBe("—");
    expect(plain(tiles[3]!.value)).toBe("72 %");
    expect(tiles[4]!.hint).toBe("18 confirmées");
  });
});

describe("weekly series", () => {
  it("decisions and errors per week", () => {
    expect(weeklyDecisionPoints(quality).map((p) => p.value)).toEqual([4, 0]);
    expect(weeklyErrorPoints(quality).map((p) => p.value)).toEqual([2, 0]);
    const row = weeklyTableRows(quality)[0]!;
    expect(row[0]).toMatch(/^Semaine du 7/);
    expect(row.slice(1)).toEqual(["4", "1", "1", "2"]);
  });
});

describe("calibration texts", () => {
  it("thresholds", () => {
    expect(thresholdTexts(calibration)).toEqual({
      review: "Revue à partir d'un risque de 34",
      reject: "Refus au-delà de 72",
    });
  });

  it("recalibration toast by outcome", () => {
    expect(recalibrationMessage({ version: 3, active: false, changed: false }).title).toBe(
      "Version 3 enregistrée",
    );
    expect(recalibrationMessage({ version: 3, active: true, changed: true }).title).toBe(
      "Version 3 activée",
    );
    expect(recalibrationMessage({ version: 3, active: false, changed: true }).title).toBe(
      "Proposition v3 enregistrée",
    );
  });

  it("weight summary", () => {
    expect(weightSummary(calibration)).toBe("casino ×0,85");
    expect(weightSummary({ ruleWeights: [] })).toBe("Aucun poids ajusté");
    expect(weightSummary({ ruleWeights: [{ ruleId: 9, ruleName: null, weight: 1.2 }] })).toBe(
      "Règle #9 ×1,20",
    );
  });

  it("only administrators manage calibrations", () => {
    expect(canManageCalibration("ADMINISTRATEUR")).toBe(true);
    expect(canManageCalibration("SUPERVISEUR")).toBe(false);
    expect(canManageCalibration(null)).toBe(false);
  });
});

describe("engines", () => {
  it("facts and tessdata hint", () => {
    const facts = engineFacts(providers);
    expect(facts[0]).toEqual({
      label: "Analyse complémentaire",
      value: "Claude (Anthropic) (claude-opus-5)",
      tone: "success",
    });
    expect(facts[1]!.tone).toBe("warning");
    expect(facts[3]!.value).toBe("Actif, propositions à valider");
    expect(ocrHint(providers)).toBe(FETCH_TESSDATA_HINT);
    expect(ocrHint({ ...providers, ocr: { ...providers.ocr, tessdataPresent: true } })).toBeNull();
  });

  it("a provider without key degrades to local", () => {
    expect(engineFacts({ ...providers, provider: "OPENAI", configured: false })[0]).toMatchObject({
      value: "OpenAI sans clé : analyse locale seule",
      tone: "warning",
    });
  });
});

describe("page state", () => {
  it("range length and errors", () => {
    expect(rangeDays("2026-01-01", "2026-01-01")).toBe(1);
    expect(rangeDays("2025-09-17", "2026-09-17")).toBe(366);
    expect(rangeError("2025-09-17", "2026-09-17")).toBeNull();
    expect(rangeError("2025-09-16", "2026-09-17")).toBe(
      "La période ne peut pas dépasser 366 jours.",
    );
    expect(rangeError("2026-09-17", "2026-09-01")).toMatch(/postérieure/);
  });

  it("outcome filter", () => {
    expect(parseOutcome("FALSE_POSITIVE")).toBe("FALSE_POSITIVE");
    expect(parseOutcome("toString")).toBe("");
    expect(parseOutcome(null)).toBe("");
  });
});

describe("learnt weights of the rules page", () => {
  it("active version, default weight, formatting and points", () => {
    expect(activeCalibration([{ ...calibration, active: false, version: 1 }, calibration])).toBe(
      calibration,
    );
    expect(activeCalibration(undefined)).toBeUndefined();
    expect(learnedWeight(calibration, 4)).toBe(0.85);
    expect(learnedWeight(calibration, 5)).toBe(1);
    expect(learnedWeight(null, 4)).toBe(1);
    expect(formatWeight(1)).toBe("1,00");
    expect(weightedPoints("HIGH", 0.85)).toBe(Math.round(SEVERITY_POINTS.HIGH * 0.85));
  });
});
