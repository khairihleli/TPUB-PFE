"use client";

import { CheckCheck } from "lucide-react";

import {
  approverLine,
  cappedNotice,
  progressLabel,
  reasonLabels,
} from "@/components/approvals/approval-model";
import { Alert } from "@/components/ui/alert";
import type { CampaignApprovalStatus } from "@/lib/api/types-supervision";

/**
 * « Double validation requise » banner of the review dialog and of the approvals page
 * (docs/round2-contract.md §5.8).
 */
export function ApprovalNotice({ status }: { status: CampaignApprovalStatus }) {
  if (!status.required) return null;
  const reasons = reasonLabels(status.reasons, status.riskScore, status.riskThreshold);
  const capped = cappedNotice(status);
  const approvers = approverLine(status.approvals);
  return (
    <Alert tone="warning" icon={<CheckCheck aria-hidden="true" />}>
      <p className="font-label font-semibold">
        Double validation requise ({progressLabel(status.approvals, status.approvalsRequired)})
      </p>
      {reasons.length > 0 ? <p className="text-[0.8125rem]">Motif : {reasons.join(" · ")}</p> : null}
      {approvers ? <p className="text-[0.8125rem]">Déjà approuvée par {approvers}.</p> : null}
      {capped ? <p className="text-[0.8125rem]">{capped}</p> : null}
    </Alert>
  );
}
