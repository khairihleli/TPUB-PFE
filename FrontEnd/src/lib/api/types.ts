/**
 * TPUB backend contract types (docs/api-contract.md). Names are verbatim.
 * Lowercase enums from the backend (AiReportResponse.aiStatus, DiffusionResponse.type)
 * are normalised to UPPERCASE by the endpoint layer: see `AiReport` and `Diffusion`.
 */

// ---- Roles
export type RoleCode = "ADMINISTRATEUR" | "ANNONCEUR" | "OPERATEUR" | "SUPERVISEUR";
export const STAFF_ROLES: readonly RoleCode[] = ["ADMINISTRATEUR", "SUPERVISEUR", "OPERATEUR"];

// ---- Campaign
export type CampaignStatus =
  | "BROUILLON"
  | "PENDING_AI_CHECK"
  | "APPROVED_BY_AI"
  | "REVIEW_REQUIRED"
  | "REJECTED_BY_AI"
  | "VALIDATED_BY_ADMIN"
  | "ACTIVE"
  | "TERMINATED"
  | "BLOCKED";

export type CampaignAiStatus = "APPROVED" | "REVIEW_REQUIRED" | "REJECTED";
export type CampaignAdminStatus = "PENDING" | "VALIDATED" | "REJECTED";

// ---- AI report
/** Raw value sent by the backend (lowercase). */
export type AiReportStatus = "approved" | "review_required" | "rejected";
/** Normalised value exposed to the UI. */
export type AiReportStatusUpper = "APPROVED" | "REVIEW_REQUIRED" | "REJECTED";

// ---- Supports
export type SupportType = "ECRAN" | "PANNEAU_NUMERIQUE" | "POINT_WIFI" | "APPLICATION" | "SITE_WEB";
export type TechnicalStatus = "ACTIF" | "INACTIF" | "MAINTENANCE" | "HORS_LIGNE";
/** Porteur typology (docs/NETWORK-MAP-SPEC.md §1). */
export type PorteurType = "A" | "B" | "C" | "D";
/** Allowed mast heights, metres (design intention). */
export type MastHeight = 15 | 20 | 25 | 30;

// ---- Reservations
export type ReservationStatus = "TEMPORAIRE" | "CONFIRMEE" | "ANNULEE" | "EXPIREE";
export type AvailabilityStatus = "DISPONIBLE" | "RESERVE" | "OCCUPE" | "MAINTENANCE" | "HORS_LIGNE";

// ---- Emergency
export type UrgencyLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ---- Diffusion
/** Raw value sent by the backend (lowercase). */
export type DiffusionType = "publicite" | "urgence" | "defaut";
export type DiffusionTypeUpper = "PUBLICITE" | "URGENCE" | "DEFAUT";

// ---- Internal only (not exposed by DTOs)
export type MediaFileType = "IMAGE" | "VIDEO" | "BANNER";
export type ClientValidationStatus = "PENDING" | "VALIDATED" | "REJECTED" | "SUSPENDED";
export type PaymentStatus = "SIMULATED" | "PENDING" | "COMPLETED" | "CANCELLED" | "FAILED";

// ---------------------------------------------------------------------------
// Errors (raw Spring bodies)
// ---------------------------------------------------------------------------
export interface SpringErrorBody {
  timestamp?: string;
  status?: number;
  message?: string;
  errors?: Record<string, string>;
}

export interface MessageResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface RegisterRequest {
  email: string;
  password: string;
  nom: string;
  societe?: string;
  telephone?: string;
  adresse?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  email: string;
  nom: string;
  role: RoleCode;
  userId: number;
}

/** What the Next session routes return to the browser (never the token). */
export interface SessionUser {
  email: string;
  nom: string;
  role: RoleCode;
  userId: number;
  /** JWT expiry, seconds since epoch. */
  exp: number;
}

export interface SessionResponse {
  user: SessionUser;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------
export interface CampaignRequest {
  name: string;
  objective?: string | null;
  budget: number;
  startDate?: string | null;
  endDate?: string | null;
  /** "HH:mm:ss" strict */
  startTime?: string | null;
  /** "HH:mm:ss" strict */
  endTime?: string | null;
}

export interface CampaignResponse {
  id: number;
  clientId: number;
  name: string;
  objective: string | null;
  budget: number;
  consumedBudget: number;
  status: CampaignStatus;
  aiStatus: CampaignAiStatus | null;
  adminStatus: CampaignAdminStatus | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  estimatedViews: number;
  priorityScore: number;
  createdAt: string;
  submittedAt: string | null;
  validatedAt: string | null;
}

// ---------------------------------------------------------------------------
// AI moderation
// ---------------------------------------------------------------------------
export interface AiReportResponse {
  campaignId: number;
  aiStatus: AiReportStatus;
  riskScore: number;
  qualityScore: number;
  detectedIssues: string[];
  recommendation: string | null;
}

/** Normalised AI report (aiStatus uppercase). */
export interface AiReport extends Omit<AiReportResponse, "aiStatus"> {
  aiStatus: AiReportStatusUpper;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
export interface ZoneRequest {
  name: string;
  latitude: number;
  longitude: number;
  radiusKm?: number | null;
  isActive?: boolean | null;
}

export interface ZoneResponse {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number | null;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Supports
// ---------------------------------------------------------------------------
export interface SupportRequest {
  zoneId: number;
  name: string;
  supportType: SupportType;
  latitude: number;
  longitude: number;
  technicalStatus?: TechnicalStatus | null;
  diffusionCapacity?: number | null;
  /** On update, null/omitted = unchanged (like technicalStatus). */
  porteurType?: PorteurType | null;
  mastHeightM?: MastHeight | null;
  /** 0–359, direction the main screen face points (0 = north, clockwise). */
  headingDeg?: number | null;
  address?: string | null;
}

export interface SupportResponse {
  id: number;
  zoneId: number;
  zoneName: string;
  name: string;
  supportType: SupportType;
  latitude: number;
  longitude: number;
  technicalStatus: TechnicalStatus;
  diffusionCapacity: number;
  /**
   * Porteur fields (spec §1). Nullable in the backend; declared optional here so older
   * payloads and existing fixtures stay valid — treat `undefined` exactly like `null`.
   */
  porteurType?: PorteurType | null;
  mastHeightM?: number | null;
  headingDeg?: number | null;
  address?: string | null;
}

/** GET /api/supports/{id}/availability item: a booked period (no campaign/client data). */
export interface SupportAvailabilitySlot {
  startDate: string;
  endDate: string;
  /** "HH:mm:ss" */
  startTime: string;
  /** "HH:mm:ss" */
  endTime: string;
  reservationStatus: "TEMPORAIRE" | "CONFIRMEE";
}

export interface SupportAvailabilityQuery {
  /** YYYY-MM-DD, default today (backend). */
  from?: string;
  /** YYYY-MM-DD, default today + 90 (backend). */
  to?: string;
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------
export interface ReservationRequest {
  campaignId: number;
  zoneId: number;
  supportId: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

export interface ReservationResponse {
  id: number;
  campaignId: number;
  zoneId: number;
  supportId: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  availabilityStatus: AvailabilityStatus;
  reservationStatus: ReservationStatus;
  estimatedViews: number;
  estimatedCost: number;
}

// ---------------------------------------------------------------------------
// Statistics (platform-wide — never show to an ANNONCEUR)
// ---------------------------------------------------------------------------
export interface DashboardResponse {
  totalCampaigns: number;
  activeCampaigns: number;
  pendingCampaigns: number;
  aiPendingCampaigns: number;
  aiRejectedCampaigns: number;
  availableSupports: number;
  confirmedReservations: number;
  totalViews: number;
  estimatedBudget: number;
  consumedBudget: number;
}

// ---------------------------------------------------------------------------
// Emergency messages
// ---------------------------------------------------------------------------
export interface EmergencyRequest {
  title: string;
  content: string;
  zoneId: number;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  durationSeconds?: number | null;
  priority?: number | null;
  urgencyLevel?: UrgencyLevel | null;
}

export interface EmergencyResponse {
  id: number;
  title: string;
  content: string;
  zoneId: number;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  priority: number;
  urgencyLevel: UrgencyLevel;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Diffusion (player)
// ---------------------------------------------------------------------------
export interface DiffusionResponse {
  type: DiffusionType;
  campaignId: number | null;
  title: string;
  mediaUrl: string | null;
  duration: number;
  zone: string;
  priority: number;
}

/** Normalised diffusion (type uppercase). */
export interface Diffusion extends Omit<DiffusionResponse, "type"> {
  type: DiffusionTypeUpper;
}

export interface DiffusionQuery {
  supportId: number;
  /** Local ISO date-time without timezone, e.g. 2026-09-12T14:30:00 */
  datetime: string;
  zone?: string;
}
