/**
 * Types of lane L4 (docs/round2-contract.md §5.3–§5.6): realtime supervision, multi-level approval,
 * notifications and the PDF/Excel exports. Imported by path, never through `@/lib/api`.
 */
import type {
  CampaignStatus,
  EmergencyResponse,
  PageResponse,
  TechnicalStatus,
  UrgencyLevel,
} from "@/lib/api/types";

// ---------------------------------------------------------------------------
// Supervision
// ---------------------------------------------------------------------------
export type PresenceState = "EN_LIGNE" | "HORS_LIGNE" | "INCONNU";
export type DiffusionContentType = "PUBLICITE" | "URGENCE" | "DEFAUT";
export type AlertSeverity = "INFO" | "AVERTISSEMENT" | "CRITIQUE";
export type SupervisionAlertType =
  | "SUPPORT_OFFLINE"
  | "ZONE_SATURATION"
  | "EMERGENCY_PENDING_APPROVAL"
  | "CAMPAIGN_PENDING_APPROVAL";

/** States of an emergency message after round 2 (two new values). */
export type EmergencyStateV2 =
  | "PROGRAMME"
  | "EN_COURS"
  | "TERMINE"
  | "DESACTIVE"
  | "EN_ATTENTE_APPROBATION"
  | "REFUSE";

export type EmergencyApprovalStatus = "EN_ATTENTE" | "APPROUVE" | "REFUSE";

export interface DiffusionLiveEvent {
  diffusionLogId: number;
  supportId: number;
  supportName: string;
  zoneName: string | null;
  contentType: DiffusionContentType;
  campaignId: number | null;
  campaignName: string | null;
  emergencyId: number | null;
  title: string | null;
  diffusedAt: string;
}

export interface PresenceEvent {
  supportId: number;
  presence: "EN_LIGNE" | "HORS_LIGNE";
  lastHeartbeatAt: string | null;
  changedAt: string;
}

export interface EmergencyLiveEvent {
  emergencyId: number;
  title: string;
  urgencyLevel: UrgencyLevel;
  state: EmergencyStateV2;
  approvalStatus: EmergencyApprovalStatus;
  approvalsCount: number;
  approvalsRequired: number;
  affectedSupports: number;
}

export interface SupervisionAlert {
  id: number;
  type: SupervisionAlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  supportId: number | null;
  zoneId: number | null;
  emergencyId: number | null;
  campaignId: number | null;
  createdAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
}

export interface SupervisionSupportRow {
  supportId: number;
  name: string;
  zoneId: number | null;
  zoneName: string | null;
  latitude: number;
  longitude: number;
  technicalStatus: TechnicalStatus;
  presence: PresenceState;
  lastHeartbeatAt: string | null;
  playerVersion: string | null;
  current: {
    contentType: DiffusionContentType;
    title: string | null;
    campaignId: number | null;
    emergencyId: number | null;
    diffusedAt: string;
  } | null;
}

export interface SupervisionStats {
  onlineSupports: number;
  offlineSupports: number;
  unknownSupports: number;
  diffusionsLastHour: number;
  activeEmergencies: number;
  openAlerts: number;
}

export interface SupervisionSnapshot {
  serverTime: string;
  supports: SupervisionSupportRow[];
  emergencies: EmergencyLiveEvent[];
  alerts: SupervisionAlert[];
  recentDiffusions: DiffusionLiveEvent[];
  stats: SupervisionStats;
}

export type AlertStatusFilter = "OUVERTE" | "RESOLUE" | "TOUTES";

export interface AlertQuery {
  status?: AlertStatusFilter;
  type?: SupervisionAlertType;
  page?: number;
  size?: number;
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------
export type ApprovalDecision = "APPROUVE" | "REFUSE";
export type ApprovalReason = "DEROGATION_IA" | "RISQUE_ELEVE";

export interface ApprovalResponse {
  id: number;
  approverUserId: number;
  approverName: string | null;
  decision: ApprovalDecision;
  comment: string | null;
  createdAt: string;
}

export interface CampaignApprovalStatus {
  campaignId: number;
  required: boolean;
  reasons: ApprovalReason[];
  riskScore: number | null;
  riskThreshold: number;
  approvalsRequired: number;
  approvalsRequiredConfigured: number;
  approvals: ApprovalResponse[];
  cycleKey: string | null;
  canApprove: boolean;
}

export interface PendingCampaignApproval extends CampaignApprovalStatus {
  campaignName: string;
  clientName: string | null;
  status: CampaignStatus;
  requestedAt: string;
}

export interface PendingEmergencyApproval {
  emergencyId: number;
  title: string;
  urgencyLevel: UrgencyLevel;
  zoneName: string | null;
  startDate: string;
  endDate: string;
  createdByName: string | null;
  approvalsRequired: number;
  approvals: ApprovalResponse[];
  canApprove: boolean;
  requestedAt: string;
}

export interface PendingApprovals {
  campaigns: PendingCampaignApproval[];
  emergencies: PendingEmergencyApproval[];
}

/** Emergency message with the round-2 approval fields (the core type keeps the round-1 states). */
export type EmergencyWithApproval = Omit<EmergencyResponse, "state" | "stopReason"> & {
  state?: EmergencyStateV2;
  stopReason?: "MANUEL" | "AUTO" | "REFUSE" | null;
  approvalStatus?: EmergencyApprovalStatus;
  approvalsRequired?: number;
  approvalsRequiredConfigured?: number;
  approvals?: ApprovalResponse[];
  approvedAt?: string | null;
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export type NotificationType =
  | "EMERGENCY_APPROVAL_REQUIRED"
  | "EMERGENCY_BROADCAST"
  | "EMERGENCY_REFUSED"
  | "CAMPAIGN_APPROVAL_REQUIRED"
  | "SUPPORT_OFFLINE"
  | "ZONE_SATURATION";

export interface NotificationResponse {
  id: number;
  /** One of {@link NotificationType}; kept open so a new backend type never breaks the list. */
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationQuery {
  unreadOnly?: boolean;
  page?: number;
  size?: number;
}

export type NotificationPage = PageResponse<NotificationResponse>;
export type AlertPage = PageResponse<SupervisionAlert>;
