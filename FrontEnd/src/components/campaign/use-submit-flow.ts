"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { aiApi, campaignsApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { AiReport, CampaignResponse } from "@/lib/api/types";

function isAlreadySubmittedError(e: unknown): boolean {
  return (
    e instanceof ApiError &&
    e.status === 400 &&
    (e.rawMessage ?? "").startsWith("Only draft campaigns can be submitted")
  );
}

/** Client-side wait for POST /ai/check-content before telling the advertiser it continues. */
export const ANALYSIS_TIMEOUT_MS = 90_000;

/** Thrown (never sent to the server) when the analysis exceeds the client wait. */
export class AnalysisTimeoutError extends Error {
  override readonly name = "AnalysisTimeoutError";
  constructor() {
    super("L'analyse continue côté serveur.");
  }
}

/**
 * Submission chain (contract §7.12): POST /campaigns/{id}/submit does NOT run the AI, so the
 * UI fires POST /ai/check-content/{id} right after. If the check fails the campaign stays in
 * PENDING_AI_CHECK and the analysis can be run again (check-content accepts that status).
 * After ANALYSIS_TIMEOUT_MS the flow stops waiting (`timedOut`): the request is not aborted, the
 * server keeps analysing, and a late result still replaces the timeout message.
 */
export type SubmitFlowState =
  | { phase: "idle" }
  | { phase: "submitting"; startedAt: number }
  | { phase: "analysing"; startedAt: number }
  | { phase: "done"; report: AiReport }
  | {
      phase: "error";
      stage: "submit" | "analysis";
      error: unknown;
      /** The analysis took longer than the client wait (it continues server-side). */
      timedOut?: boolean;
      campaignId?: number;
    };

export interface SubmitFlowOptions {
  /** Default ANALYSIS_TIMEOUT_MS (90 s). */
  analysisTimeoutMs?: number;
}

export function useSubmitFlow(
  onSettled?: (campaignId: number) => void,
  { analysisTimeoutMs = ANALYSIS_TIMEOUT_MS }: SubmitFlowOptions = {},
) {
  const [state, setState] = useState<SubmitFlowState>({ phase: "idle" });
  const busy = useRef(false);
  const runId = useRef(0);
  const last = useRef<{ id: number; submitted: boolean } | null>(null);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    settledRef.current = onSettled;
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (campaignId: number, needsSubmit: boolean) => {
      if (busy.current) return;
      busy.current = true;
      const token = ++runId.current;
      const startedAt = Date.now();
      last.current = { id: campaignId, submitted: !needsSubmit };
      try {
        if (needsSubmit) {
          setState({ phase: "submitting", startedAt });
          try {
            await campaignsApi.submit(campaignId);
          } catch (error) {
            // Already submitted (e.g. a lost response on a previous attempt): go on with the AI.
            if (!isAlreadySubmittedError(error)) {
              setState({ phase: "error", stage: "submit", error, campaignId });
              return;
            }
          }
          last.current = { id: campaignId, submitted: true };
        }
        setState({ phase: "analysing", startedAt });
        const analysis = aiApi.checkContent(campaignId);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new AnalysisTimeoutError()), analysisTimeoutMs);
        });
        try {
          const report = await Promise.race([analysis, timeout]);
          setState({ phase: "done", report });
        } catch (error) {
          const timedOut = error instanceof AnalysisTimeoutError;
          setState({ phase: "error", stage: "analysis", error, timedOut, campaignId });
          if (timedOut) {
            // Honest continuation: a late answer still shows the result on this page.
            analysis.then(
              (report) => {
                if (mounted.current && runId.current === token) {
                  setState({ phase: "done", report });
                  settledRef.current?.(campaignId);
                }
              },
              () => undefined,
            );
          }
        } finally {
          clearTimeout(timer);
        }
        settledRef.current?.(campaignId);
      } finally {
        busy.current = false;
      }
    },
    [analysisTimeoutMs],
  );

  /** BROUILLON → submit then analyse · PENDING_AI_CHECK → analyse only. */
  const start = useCallback(
    (campaign: Pick<CampaignResponse, "id" | "status">) =>
      run(campaign.id, campaign.status === "BROUILLON"),
    [run],
  );

  /** Re-runs from the step that failed. */
  const retry = useCallback(() => {
    const l = last.current;
    if (!l) return Promise.resolve();
    return run(l.id, !l.submitted);
  }, [run]);

  const reset = useCallback(() => {
    last.current = null;
    runId.current++;
    setState({ phase: "idle" });
  }, []);

  return { state, start, retry, reset };
}
