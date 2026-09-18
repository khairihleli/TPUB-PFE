"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { aiApi, campaignsApi } from "@/lib/api/endpoints";
import { isAbortError, submitIncompleteErrors } from "@/lib/api/errors";
import type { AiReport, CampaignResponse, CampaignStatus } from "@/lib/api/types";

/**
 * Submission (contract §2.1): POST /campaigns/{id}/submit moves the draft to PENDING_AI_CHECK and
 * runs the AI analysis in the same request (no client timeout). The answer carries the resulting
 * status; the full report (issues, OCR, recommendations) is then read with GET /ai/report.
 * A campaign left in PENDING_AI_CHECK (analysis failure) is retried with POST /ai/check-content.
 */
export type SubmitFlowState =
  | { phase: "idle" }
  | { phase: "submitting"; startedAt: number }
  | {
      phase: "done";
      campaign: CampaignResponse | null;
      /** null when the report could not be read (the status is still known). */
      report: AiReport | null;
    }
  | {
      phase: "error";
      stage: "submit" | "analysis";
      error: unknown;
      /** 400 SUBMIT_INCOMPLETE: missing parts keyed by period/times/budget/zones/reservations. */
      incomplete: Record<string, string> | null;
      campaignId: number;
    };

/** AI outcome of a submitted campaign status (null while not analysed). */
export function aiOutcomeOf(status: CampaignStatus): AiReport["aiStatus"] | null {
  switch (status) {
    case "APPROVED_BY_AI":
      return "APPROVED";
    case "REVIEW_REQUIRED":
      return "REVIEW_REQUIRED";
    case "REJECTED_BY_AI":
      return "REJECTED";
    default:
      return null;
  }
}

export function useSubmitFlow(onSettled?: (campaignId: number) => void) {
  const [state, setState] = useState<SubmitFlowState>({ phase: "idle" });
  const busy = useRef(false);
  const last = useRef<Pick<CampaignResponse, "id" | "status"> | null>(null);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });

  const start = useCallback(async (campaign: Pick<CampaignResponse, "id" | "status">) => {
    if (busy.current) return;
    busy.current = true;
    last.current = campaign;
    const draft = campaign.status === "BROUILLON";
    setState({ phase: "submitting", startedAt: Date.now() });
    try {
      let result: CampaignResponse | null = null;
      let report: AiReport | null = null;
      if (draft) {
        result = await campaignsApi.submit(campaign.id);
        last.current = result;
        if (aiOutcomeOf(result.status) !== null) {
          report = await aiApi.report(campaign.id).catch((e: unknown) => {
            if (isAbortError(e)) throw e;
            return null;
          });
        }
      } else {
        report = await aiApi.checkContent(campaign.id);
      }
      setState({ phase: "done", campaign: result, report });
    } catch (error) {
      setState({
        phase: "error",
        stage: draft ? "submit" : "analysis",
        error,
        incomplete: submitIncompleteErrors(error),
        campaignId: campaign.id,
      });
    } finally {
      busy.current = false;
      settledRef.current?.(campaign.id);
    }
  }, []);

  /** Re-runs the last attempt (submit again, or the pending analysis). */
  const retry = useCallback(() => {
    const l = last.current;
    return l ? start(l) : Promise.resolve();
  }, [start]);

  const reset = useCallback(() => {
    last.current = null;
    setState({ phase: "idle" });
  }, []);

  return { state, start, retry, reset };
}
