import { describe, expect, it } from "vitest";

import {
  approverLine,
  cappedNotice,
  isAwaitingApproval,
  progressLabel,
  reasonLabels,
} from "@/components/approvals/approval-model";
import type { ApprovalResponse, CampaignApprovalStatus } from "@/lib/api/types-supervision";

function approval(id: number, name: string, createdAt: string): ApprovalResponse {
  return {
    id,
    approverUserId: id,
    approverName: name,
    decision: "APPROUVE",
    comment: null,
    createdAt,
  };
}

function status(overrides: Partial<CampaignApprovalStatus> = {}): CampaignApprovalStatus {
  return {
    campaignId: 3,
    required: true,
    reasons: ["DEROGATION_IA"],
    riskScore: 62,
    riskThreshold: 50,
    approvalsRequired: 2,
    approvalsRequiredConfigured: 2,
    approvals: [approval(1, "Amina B.", "2026-09-16T13:02:00Z")],
    cycleKey: "check:70",
    canApprove: true,
    ...overrides,
  };
}

describe("approval model", () => {
  it("explains why several administrators are needed", () => {
    expect(reasonLabels(["DEROGATION_IA"], 12, 50)).toEqual(["Dérogation IA"]);
    expect(reasonLabels(["RISQUE_ELEVE"], 62, 50)).toEqual(["Risque 62 ≥ 50"]);
    expect(reasonLabels(["RISQUE_ELEVE"], null, 50)).toEqual(["Risque ? ≥ 50"]);
    expect(reasonLabels(["DEROGATION_IA", "RISQUE_ELEVE"], 80, 50)).toHaveLength(2);
  });

  it("counts the approvals already given", () => {
    expect(progressLabel([], 2)).toBe("0/2");
    expect(progressLabel([approval(1, "A", "2026-09-16T13:00:00Z")], 2)).toBe("1/2");
    // A configuration lowered after the approvals never shows « 3/2 ».
    expect(
      progressLabel(
        [approval(1, "A", "2026-09-16T13:00:00Z"), approval(2, "B", "2026-09-16T13:10:00Z")],
        1,
      ),
    ).toBe("2/2");
    expect(
      progressLabel(
        [{ ...approval(1, "A", "2026-09-16T13:00:00Z"), decision: "REFUSE" }],
        2,
      ),
    ).toBe("0/2");
  });

  it("names the approvers", () => {
    expect(approverLine([])).toBe("");
    expect(approverLine([approval(1, "Amina B.", "invalide")])).toBe("Amina B.");
    expect(
      approverLine([approval(1, "Amina B.", "2026-09-16T13:02:00Z")]).startsWith("Amina B., "),
    ).toBe(true);
  });

  it("knows when a cycle is still waiting", () => {
    expect(isAwaitingApproval(status())).toBe(true);
    expect(isAwaitingApproval(status({ required: false }))).toBe(false);
    expect(isAwaitingApproval(status({ approvals: [] }))).toBe(false);
    expect(
      isAwaitingApproval(
        status({
          approvals: [
            approval(1, "A", "2026-09-16T13:00:00Z"),
            approval(2, "B", "2026-09-16T13:10:00Z"),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("explains a policy capped by the number of administrators", () => {
    expect(cappedNotice(status())).toBeNull();
    expect(cappedNotice(status({ approvalsRequired: 1 }))).toBe(
      "1 seule approbation : un seul administrateur actif",
    );
    expect(cappedNotice(status({ approvalsRequiredConfigured: 1, approvalsRequired: 1 }))).toBeNull();
  });
});
