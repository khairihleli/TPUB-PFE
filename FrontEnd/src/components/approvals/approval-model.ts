/**
 * Pure rules of the multi-level approval UI (docs/round2-contract.md §5.4).
 */
import type {
  ApprovalReason,
  ApprovalResponse,
  CampaignApprovalStatus,
} from "@/lib/api/types-supervision";

export const APPROVAL_PENDING_TOAST =
  "Approbation enregistrée : un second administrateur doit valider";

/** « Dérogation IA », « Risque 62 ≥ 50 ». */
export function reasonLabels(
  reasons: readonly ApprovalReason[],
  riskScore: number | null,
  riskThreshold: number,
): string[] {
  return reasons.map((reason) =>
    reason === "DEROGATION_IA"
      ? "Dérogation IA"
      : `Risque ${riskScore ?? "?"} ≥ ${riskThreshold}`,
  );
}

/** « 1/2 » of the approvals already given. */
export function progressLabel(approvals: readonly ApprovalResponse[], required: number): string {
  const given = approvals.filter((a) => a.decision === "APPROUVE").length;
  return `${given}/${Math.max(required, given)}`;
}

/** « Amina B., 14:02 · Karim T., 14:20 » (times in the browser locale). */
export function approverLine(approvals: readonly ApprovalResponse[]): string {
  return approvals
    .filter((a) => a.decision === "APPROUVE")
    .map((a) => {
      const time = new Date(a.createdAt);
      const clock = Number.isNaN(time.getTime())
        ? ""
        : `, ${time.toLocaleTimeString("fr-TN", { hour: "2-digit", minute: "2-digit" })}`;
      return `${a.approverName ?? "Administrateur"}${clock}`;
    })
    .join(" · ");
}

/** True when the double validation applies to this campaign and is not complete yet. */
export function isAwaitingApproval(status: CampaignApprovalStatus): boolean {
  const given = status.approvals.filter((a) => a.decision === "APPROUVE").length;
  return status.required && given > 0 && given < status.approvalsRequired;
}

/** « 1 seule approbation : un seul administrateur actif ». */
export function cappedNotice(status: CampaignApprovalStatus): string | null {
  if (status.approvalsRequiredConfigured <= 1) return null;
  if (status.approvalsRequired >= status.approvalsRequiredConfigured) return null;
  return "1 seule approbation : un seul administrateur actif";
}
