import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), checkContent: vi.fn() }));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: { submit: mocks.submit },
  aiApi: { checkContent: mocks.checkContent },
}));

import { useSubmitFlow } from "@/components/campaign/use-submit-flow";
import { ApiError } from "@/lib/api/errors";

const REPORT = {
  campaignId: 5,
  aiStatus: "REVIEW_REQUIRED" as const,
  riskScore: 62,
  qualityScore: 74,
  detectedIssues: ["texte ambigu"],
  recommendation: "Vérification manuelle avant diffusion",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSubmitFlow (submit does not run the AI, contract §7.12)", () => {
  it("chains submit then check-content for a draft", async () => {
    mocks.submit.mockResolvedValue({});
    mocks.checkContent.mockResolvedValue(REPORT);
    const settled = vi.fn();
    const { result } = renderHook(() => useSubmitFlow(settled));

    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));

    expect(mocks.submit).toHaveBeenCalledWith(5);
    expect(mocks.checkContent).toHaveBeenCalledWith(5);
    expect(mocks.submit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkContent.mock.invocationCallOrder[0]!,
    );
    expect(result.current.state).toEqual({ phase: "done", report: REPORT });
    expect(settled).toHaveBeenCalledWith(5);
  });

  it("only runs the analysis for PENDING_AI_CHECK", async () => {
    mocks.checkContent.mockResolvedValue(REPORT);
    const { result } = renderHook(() => useSubmitFlow());
    await act(() => result.current.start({ id: 5, status: "PENDING_AI_CHECK" }));
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(result.current.state.phase).toBe("done");
  });

  it("stops at submit on error and keeps the campaign a draft", async () => {
    mocks.submit.mockRejectedValue(new ApiError(502, "Indisponible"));
    const { result } = renderHook(() => useSubmitFlow());
    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));
    expect(mocks.checkContent).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ phase: "error", stage: "submit" });
  });

  it("retries only the analysis when submit succeeded but the AI failed", async () => {
    mocks.submit.mockResolvedValue({});
    mocks.checkContent.mockRejectedValueOnce(new ApiError(500, "Erreur")).mockResolvedValue(REPORT);
    const { result } = renderHook(() => useSubmitFlow());

    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));
    expect(result.current.state).toMatchObject({ phase: "error", stage: "analysis" });

    await act(() => result.current.retry());
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.checkContent).toHaveBeenCalledTimes(2);
    expect(result.current.state.phase).toBe("done");
  });

  it("stops waiting after the client timeout, then shows a late result", async () => {
    mocks.submit.mockResolvedValue({});
    let resolveReport: (r: typeof REPORT) => void = () => undefined;
    mocks.checkContent.mockReturnValue(
      new Promise((resolve) => {
        resolveReport = resolve;
      }),
    );
    const settled = vi.fn();
    const { result } = renderHook(() => useSubmitFlow(settled, { analysisTimeoutMs: 20 }));

    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));
    expect(result.current.state).toMatchObject({
      phase: "error",
      stage: "analysis",
      timedOut: true,
      campaignId: 5,
    });
    expect(settled).toHaveBeenCalledWith(5);

    // The server kept analysing: its answer replaces the timeout message.
    await act(async () => {
      resolveReport(REPORT);
      await Promise.resolve();
    });
    expect(result.current.state).toEqual({ phase: "done", report: REPORT });
  });

  it("uses a 90 s client timeout by default", async () => {
    const { ANALYSIS_TIMEOUT_MS } = await import("@/components/campaign/use-submit-flow");
    expect(ANALYSIS_TIMEOUT_MS).toBe(90_000);
  });

  it("continues with the analysis when the campaign was already submitted", async () => {
    mocks.submit.mockRejectedValue(
      new ApiError(400, "Seuls les brouillons…", {
        rawMessage: "Only draft campaigns can be submitted",
      }),
    );
    mocks.checkContent.mockResolvedValue(REPORT);
    const { result } = renderHook(() => useSubmitFlow());
    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));
    expect(mocks.checkContent).toHaveBeenCalledWith(5);
    expect(result.current.state.phase).toBe("done");
  });
});
