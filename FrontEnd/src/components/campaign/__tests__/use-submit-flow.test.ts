import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), checkContent: vi.fn(), report: vi.fn() }));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: { submit: mocks.submit },
  aiApi: { checkContent: mocks.checkContent, report: mocks.report },
}));

import { aiOutcomeOf, useSubmitFlow } from "@/components/campaign/use-submit-flow";
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

describe("useSubmitFlow (submit runs the AI in the same request, contract §2.1)", () => {
  it("submits a draft once, then reads the report of the resulting status", async () => {
    const submitted = { id: 5, status: "REVIEW_REQUIRED" };
    mocks.submit.mockResolvedValue(submitted);
    mocks.report.mockResolvedValue(REPORT);
    const settled = vi.fn();
    const { result } = renderHook(() => useSubmitFlow(settled));

    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));

    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.submit).toHaveBeenCalledWith(5);
    expect(mocks.checkContent).not.toHaveBeenCalled();
    expect(mocks.report).toHaveBeenCalledWith(5);
    expect(result.current.state).toEqual({ phase: "done", campaign: submitted, report: REPORT });
    expect(settled).toHaveBeenCalledWith(5);
  });

  it("keeps the status when the report cannot be read", async () => {
    const submitted = { id: 5, status: "APPROVED_BY_AI" };
    mocks.submit.mockResolvedValue(submitted);
    mocks.report.mockRejectedValue(new ApiError(502, "Indisponible"));
    const { result } = renderHook(() => useSubmitFlow());
    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));
    expect(result.current.state).toEqual({ phase: "done", campaign: submitted, report: null });
  });

  it("does not read a report while the campaign stays PENDING_AI_CHECK", async () => {
    mocks.submit.mockResolvedValue({ id: 5, status: "PENDING_AI_CHECK" });
    const { result } = renderHook(() => useSubmitFlow());
    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));
    expect(mocks.report).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ phase: "done", report: null });
  });

  it("retries the analysis with check-content for PENDING_AI_CHECK", async () => {
    mocks.checkContent.mockResolvedValue(REPORT);
    const { result } = renderHook(() => useSubmitFlow());
    await act(() => result.current.start({ id: 5, status: "PENDING_AI_CHECK" }));
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.checkContent).toHaveBeenCalledWith(5);
    expect(result.current.state).toEqual({ phase: "done", campaign: null, report: REPORT });
  });

  it("exposes the SUBMIT_INCOMPLETE parts on error", async () => {
    mocks.submit.mockRejectedValue(
      new ApiError(400, "Campagne incomplète.", {
        code: "SUBMIT_INCOMPLETE",
        fieldErrors: { zones: "Placez au moins une zone.", reservations: "Réservez un Porteur." },
      }),
    );
    const { result } = renderHook(() => useSubmitFlow());
    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));
    expect(result.current.state).toMatchObject({
      phase: "error",
      stage: "submit",
      campaignId: 5,
      incomplete: { zones: "Placez au moins une zone.", reservations: "Réservez un Porteur." },
    });
  });

  it("retry re-runs the last attempt", async () => {
    mocks.submit
      .mockRejectedValueOnce(new ApiError(502, "Indisponible"))
      .mockResolvedValue({ id: 5, status: "REJECTED_BY_AI" });
    mocks.report.mockResolvedValue({ ...REPORT, aiStatus: "REJECTED" });
    const { result } = renderHook(() => useSubmitFlow());
    await act(() => result.current.start({ id: 5, status: "BROUILLON" }));
    expect(result.current.state).toMatchObject({ phase: "error", incomplete: null });
    await act(() => result.current.retry());
    expect(mocks.submit).toHaveBeenCalledTimes(2);
    expect(result.current.state.phase).toBe("done");
    act(() => result.current.reset());
    expect(result.current.state).toEqual({ phase: "idle" });
  });

  it("maps statuses to AI outcomes", () => {
    expect(aiOutcomeOf("APPROVED_BY_AI")).toBe("APPROVED");
    expect(aiOutcomeOf("REVIEW_REQUIRED")).toBe("REVIEW_REQUIRED");
    expect(aiOutcomeOf("REJECTED_BY_AI")).toBe("REJECTED");
    expect(aiOutcomeOf("PENDING_AI_CHECK")).toBeNull();
  });
});
