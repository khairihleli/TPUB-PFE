/**
 * Endpoints of lane L4 (docs/round2-contract.md §5.3–§5.6). Callers import this module by path.
 */
import { apiFetch, downloadAndSave } from "@/lib/api/client";
import type {
  AdminValidateRequest,
  CampaignResponse,
  StatisticsExportQuery,
} from "@/lib/api/types";
import type {
  AlertPage,
  AlertQuery,
  CampaignApprovalStatus,
  EmergencyWithApproval,
  NotificationPage,
  NotificationQuery,
  PendingApprovals,
  SupervisionAlert,
  SupervisionSnapshot,
} from "@/lib/api/types-supervision";

export interface CallOptions {
  signal?: AbortSignal;
}

/** Result of a campaign validation: applied, or waiting for another administrator (202). */
export type ValidationResult =
  | { kind: "validated"; campaign: CampaignResponse }
  | { kind: "pending"; approval: CampaignApprovalStatus };

/** 202 bodies carry `pending: true`; a validated campaign never does. */
export function isPendingApproval(
  body: unknown,
): body is { pending: true; approval: CampaignApprovalStatus } {
  return typeof body === "object" && body !== null && "pending" in body;
}

export const supervisionApi = {
  snapshot: (o: CallOptions = {}) => apiFetch<SupervisionSnapshot>("/supervision/snapshot", o),
  alerts: (q: AlertQuery & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<AlertPage>("/supervision/alerts", {
      query: { status: q.status, type: q.type, page: q.page, size: q.size },
      signal: q.signal ?? o.signal,
    }),
  acknowledge: (id: number, o: CallOptions = {}) =>
    apiFetch<SupervisionAlert>(`/supervision/alerts/${id}/acknowledge`, { method: "POST", ...o }),
};

export const approvalsApi = {
  pending: (o: CallOptions = {}) => apiFetch<PendingApprovals>("/approvals/pending", o),
  campaign: (campaignId: number, o: CallOptions = {}) =>
    apiFetch<CampaignApprovalStatus>(`/approvals/campaigns/${campaignId}`, o),
  /** POST /admin/campaigns/{id}/validate: 200 validated, 202 « approbation enregistrée ». */
  validateCampaign: async (
    campaignId: number,
    body: AdminValidateRequest = {},
    o: CallOptions = {},
  ): Promise<ValidationResult> => {
    const answer = await apiFetch<CampaignResponse | { pending: true; approval: CampaignApprovalStatus }>(
      `/admin/campaigns/${campaignId}/validate`,
      { method: "POST", body, ...o },
    );
    return isPendingApproval(answer)
      ? { kind: "pending", approval: answer.approval }
      : { kind: "validated", campaign: answer };
  },
  approveEmergency: (id: number, comment?: string | null, o: CallOptions = {}) =>
    apiFetch<EmergencyWithApproval>(`/emergency/${id}/approve`, {
      method: "POST",
      body: { comment: comment?.trim() || null },
      ...o,
    }),
  refuseEmergency: (id: number, reason: string, o: CallOptions = {}) =>
    apiFetch<EmergencyWithApproval>(`/emergency/${id}/refuse`, {
      method: "POST",
      body: { reason: reason.trim() },
      ...o,
    }),
};

export const notificationsApi = {
  list: (q: NotificationQuery & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<NotificationPage>("/notifications", {
      query: { unreadOnly: q.unreadOnly ? true : undefined, page: q.page, size: q.size },
      signal: q.signal ?? o.signal,
    }),
  unreadCount: (o: CallOptions = {}) => apiFetch<{ count: number }>("/notifications/unread-count", o),
  markRead: (id: number, o: CallOptions = {}) =>
    apiFetch<void>(`/notifications/${id}/read`, { method: "POST", ...o }),
  markAllRead: (o: CallOptions = {}) =>
    apiFetch<{ updated: number }>("/notifications/read-all", { method: "POST", ...o }),
};

function exportQuery(q: StatisticsExportQuery) {
  return { type: q.type, from: q.from, to: q.to, groupBy: q.groupBy, campaignId: q.campaignId };
}

export const exportsApi = {
  /** Downloads the A4 report and saves it; resolves to the file name. */
  pdf: (q: StatisticsExportQuery, o: CallOptions = {}) =>
    downloadAndSave("/statistics/export.pdf", exportQuery(q), {
      signal: o.signal,
      fallbackName: `tpub-statistiques-${q.type}.pdf`,
    }),
  xlsx: (q: StatisticsExportQuery, o: CallOptions = {}) =>
    downloadAndSave("/statistics/export.xlsx", exportQuery(q), {
      signal: o.signal,
      fallbackName: `tpub-statistiques-${q.type}.xlsx`,
    }),
};
