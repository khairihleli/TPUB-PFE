/**
 * Round-2 AI endpoints (docs/round2-contract.md §2.7): engines, quality dashboard, feedback and calibration,
 * plus the narrowing of an AI report to its V2 shape. Import by path.
 */
import { apiFetch } from "@/lib/api/client";
import { type CallOptions, listParam, normalizePage } from "@/lib/api/endpoints";
import type { AiReport, PageResponse } from "@/lib/api/types";
import type {
  AiCalibrationResponse,
  AiFeedbackQuery,
  AiFeedbackResponse,
  AiMediaAnalysisV2,
  AiProvidersResponse,
  AiQualityResponse,
  AiReportV2,
} from "@/lib/api/types-ia";

function arrayOr<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Narrows a (normalised) report to V2: round-2 fields default to null / empty so reports stored before
 * round 2, or served by an older backend, render safely.
 */
export function asReportV2(report: AiReport): AiReportV2 {
  const raw = report as AiReport & Partial<Pick<AiReportV2, "providerModel" | "calibrationVersion">>;
  const media = arrayOr(report.mediaAnalyses as Partial<AiMediaAnalysisV2>[] | undefined);
  return {
    ...report,
    engine: report.engine,
    providerModel: raw.providerModel ?? null,
    calibrationVersion: raw.calibrationVersion ?? null,
    mediaAnalyses: media.map((m) => ({
      mediaId: m.mediaId ?? 0,
      fileName: m.fileName ?? "",
      contentType: m.contentType ?? "IMAGE",
      widthPx: m.widthPx ?? null,
      heightPx: m.heightPx ?? null,
      durationSeconds: m.durationSeconds ?? null,
      extractedText: m.extractedText ?? null,
      issues: arrayOr(m.issues),
      ocrEngine: m.ocrEngine ?? "AUCUN",
      ocrConfidence: m.ocrConfidence ?? null,
      metrics: m.metrics ? { ...m.metrics, dominantColors: arrayOr(m.metrics.dominantColors) } : null,
      frames: arrayOr(m.frames),
      thumbnailUrl: m.thumbnailUrl ?? null,
      videoSupported: m.videoSupported ?? null,
      containerDurationSeconds: m.containerDurationSeconds ?? null,
    })),
  };
}

export const aiQualityApi = {
  /** Effective engines (never a key). ADMINISTRATEUR, SUPERVISEUR. */
  providers: (o: CallOptions = {}) => apiFetch<AiProvidersResponse>("/ai/providers", o),
  /** Defaults: last 90 days. More than 366 days → 400 INVALID_RANGE. */
  quality: async (q: { from?: string; to?: string } = {}, o: CallOptions = {}) => {
    const res = await apiFetch<AiQualityResponse>("/ai/quality", {
      query: { from: q.from, to: q.to },
      ...o,
    });
    return { ...res, perRule: arrayOr(res.perRule), weekly: arrayOr(res.weekly) };
  },
  /** Newest first. */
  feedback: async (
    q: AiFeedbackQuery = {},
    o: CallOptions = {},
  ): Promise<PageResponse<AiFeedbackResponse>> =>
    normalizePage(
      await apiFetch<PageResponse<AiFeedbackResponse>>("/ai/feedback", {
        query: {
          outcome: listParam(q.outcome),
          ruleId: q.ruleId,
          from: q.from,
          to: q.to,
          page: q.page,
          size: q.size,
        },
        ...o,
      }),
    ),
  /** Versions, newest first (at most 50). */
  calibrations: async (o: CallOptions = {}) =>
    arrayOr(await apiFetch<AiCalibrationResponse[]>("/ai/calibrations", o)),
  /** ADMINISTRATEUR: 201 with the new version (active only when auto-applied and changed). */
  recalibrate: (o: CallOptions = {}) =>
    apiFetch<AiCalibrationResponse>("/ai/calibrations/recalibrate", { method: "POST", ...o }),
  /** ADMINISTRATEUR: 404 CALIBRATION_NOT_FOUND for an unknown version. */
  activate: (version: number, o: CallOptions = {}) =>
    apiFetch<AiCalibrationResponse>(`/ai/calibrations/${version}/activate`, {
      method: "POST",
      ...o,
    }),
};
