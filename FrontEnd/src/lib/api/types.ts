/**
 * TPUB backend contract types. Names and enum values are verbatim from
 * docs/completion-contract.md §2 (which supersedes docs/api-contract.md).
 * Lowercase enums from the backend (AiReportResponse.aiStatus, DiffusionResponse.type)
 * are normalised to UPPERCASE by the endpoint layer: see `AiReport` and `Diffusion`.
 *
 * Migration rule (contract §6 deviation): fields that v2 ADDS to a DTO that already existed
 * (CampaignResponse, AiReportResponse, ReservationResponse, EmergencyResponse, DiffusionResponse,
 * DashboardResponse, SupportResponse) are declared optional so older payloads and fixtures stay
 * valid. The v2 backend always sends them: read them with `?? null` / `?? 0` / `?? []`.
 * DTOs that are new in v2 are declared exactly as the contract (all fields required).
 */

// ---- Roles
export type RoleCode = "ADMINISTRATEUR" | "ANNONCEUR" | "OPERATEUR" | "SUPERVISEUR";
export const STAFF_ROLES: readonly RoleCode[] = ["ADMINISTRATEUR", "SUPERVISEUR", "OPERATEUR"];
/** Roles an administrator may give to a staff account (never ANNONCEUR). */
export type StaffRoleCode = Exclude<RoleCode, "ANNONCEUR">;

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

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "BROUILLON",
  "PENDING_AI_CHECK",
  "APPROVED_BY_AI",
  "REVIEW_REQUIRED",
  "REJECTED_BY_AI",
  "VALIDATED_BY_ADMIN",
  "ACTIVE",
  "TERMINATED",
  "BLOCKED",
];

export type CampaignAiStatus = "APPROVED" | "REVIEW_REQUIRED" | "REJECTED";
export type CampaignAdminStatus = "PENDING" | "VALIDATED" | "REJECTED";
export type TerminationReason = "PERIODE_TERMINEE" | "BUDGET_EPUISE";

// ---- AI
/** Raw value sent by the backend (lowercase). */
export type AiReportStatus = "approved" | "review_required" | "rejected";
/** Normalised value exposed to the UI. */
export type AiReportStatusUpper = "APPROVED" | "REVIEW_REQUIRED" | "REJECTED";
export type AiSector =
  | "RESTAURATION"
  | "EVENEMENT"
  | "IMMOBILIER"
  | "SERVICE"
  | "COMMERCE"
  | "SANTE"
  | "FORMATION"
  | "TRANSPORT"
  | "AUTRE";
export const AI_SECTORS: readonly AiSector[] = [
  "RESTAURATION",
  "EVENEMENT",
  "IMMOBILIER",
  "SERVICE",
  "COMMERCE",
  "SANTE",
  "FORMATION",
  "TRANSPORT",
  "AUTRE",
];
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AiIssueSource =
  "TEXTE" | "IMAGE" | "VIDEO" | "OCR" | "REGLE" | "OPENAI" | "SECTEUR" | "DOUBLON";
export type AiContentType = "TEXTE" | "IMAGE" | "VIDEO" | "MINIATURE";
export type OcrEngine = "TESSERACT" | "SIMULE" | "AUCUN";
export type AiEngine = "LOCAL" | "OPENAI" | "LOCAL_OPENAI";
export type AiAdminDecision = "VALIDATED" | "REJECTED" | "PENDING";
export type AiRuleType = "KEYWORD" | "REGEX";
export type AiDecisionType = "AI" | "ADMIN";

// ---- Supports
export type SupportType = "ECRAN" | "PANNEAU_NUMERIQUE" | "POINT_WIFI" | "APPLICATION" | "SITE_WEB";
export const SUPPORT_TYPES: readonly SupportType[] = [
  "ECRAN",
  "PANNEAU_NUMERIQUE",
  "POINT_WIFI",
  "APPLICATION",
  "SITE_WEB",
];
export type TechnicalStatus = "ACTIF" | "INACTIF" | "MAINTENANCE" | "HORS_LIGNE";
/** Porteur typology (docs/NETWORK-MAP-SPEC.md §1). */
export type PorteurType = "A" | "B" | "C" | "D";
/** Allowed mast heights, metres (design intention). */
export type MastHeight = 15 | 20 | 25 | 30;
/** Status of a support_availability block. */
export type SupportBlockStatus = "MAINTENANCE" | "HORS_LIGNE" | "OCCUPE";

// ---- Reservations / availability
export type ReservationStatus = "TEMPORAIRE" | "CONFIRMEE" | "ANNULEE" | "EXPIREE";
export type AvailabilityStatus = "DISPONIBLE" | "RESERVE" | "OCCUPE" | "MAINTENANCE" | "HORS_LIGNE";
export const AVAILABILITY_STATUSES: readonly AvailabilityStatus[] = [
  "DISPONIBLE",
  "RESERVE",
  "OCCUPE",
  "MAINTENANCE",
  "HORS_LIGNE",
];
/** Time-slot presets shared with the backend (contract §2.4, src/lib/time-slots.ts). */
export type SlotPreset = "MATIN" | "APRES_MIDI" | "SOIR" | "JOURNEE";
export type ConflictSeverity = "CONFLIT" | "SATURE";

// ---- Emergency
export type UrgencyLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EmergencyState = "PROGRAMME" | "EN_COURS" | "TERMINE" | "DESACTIVE";
export type EmergencyStopReason = "MANUEL" | "AUTO";

// ---- Diffusion
/** Raw value sent by the backend (lowercase). */
export type DiffusionType = "publicite" | "urgence" | "defaut";
export type DiffusionTypeUpper = "PUBLICITE" | "URGENCE" | "DEFAUT";
export type DiffusionContentType = "PUBLICITE" | "URGENCE" | "DEFAUT";
export type InteractionType = "CLIC" | "INTERACTION";

// ---- Media, clients, payments
export type MediaFileType = "IMAGE" | "VIDEO" | "BANNER";
export type ClientValidationStatus = "PENDING" | "VALIDATED" | "REJECTED" | "SUSPENDED";
export type PaymentStatus = "SIMULATED" | "PENDING" | "COMPLETED" | "CANCELLED" | "FAILED";

// ---- Accounts
export type SessionRevokeReason =
  "LOGOUT" | "REVOKED_BY_USER" | "REVOKED_BY_ADMIN" | "PASSWORD_CHANGED" | "ACCOUNT_DISABLED";
export type LoginFailureReason =
  | "BAD_CREDENTIALS"
  | "ACCOUNT_DISABLED"
  | "UNKNOWN_USER"
  /** Round 2: wrong TOTP or recovery code on the second login step. */
  | "TOTP_INVALID";

// ---- Audit (contract §2.10 catalog)
export type AuditAction =
  | "CAMPAIGN_VALIDATED"
  | "CAMPAIGN_VALIDATED_OVERRIDE"
  | "CAMPAIGN_REJECTED"
  | "CAMPAIGN_PRIORITY_CHANGED"
  | "AI_CHECK_RERUN"
  | "AI_RULE_CREATED"
  | "AI_RULE_UPDATED"
  | "AI_RULE_DELETED"
  | "ZONE_CREATED"
  | "ZONE_UPDATED"
  | "ZONE_DELETED"
  | "SUPPORT_CREATED"
  | "SUPPORT_UPDATED"
  | "SUPPORT_BLOCK_CREATED"
  | "SUPPORT_BLOCK_DELETED"
  | "RESERVATION_CANCELLED"
  | "EMERGENCY_CREATED"
  | "EMERGENCY_DEACTIVATED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "CLIENT_VALIDATION_CHANGED"
  | "USER_SESSIONS_REVOKED"
  // Round 2 (L2): account security and player device keys
  | "USER_PASSWORD_CHANGE_REQUIRED"
  | "USER_PASSWORD_RESET"
  | "USER_2FA_ENABLED"
  | "USER_2FA_DISABLED"
  | "USER_2FA_RESET"
  | "SUPPORT_DEVICE_KEY_ISSUED"
  | "SUPPORT_DEVICE_KEY_ROTATED"
  | "SUPPORT_DEVICE_KEY_REVOKED";
export type AuditEntityType =
  "CAMPAIGN" | "AI_RULE" | "ZONE" | "SUPPORT" | "RESERVATION" | "EMERGENCY" | "USER" | "CLIENT" | "SUPPORT_DEVICE";

// ---------------------------------------------------------------------------
// Errors and paging
// ---------------------------------------------------------------------------
/** Error body of every backend error (contract §2.0). Older bodies may lack `code`/`path`. */
export interface ApiErrorBody {
  timestamp?: string;
  status?: number;
  code?: string;
  message?: string;
  path?: string;
  errors?: Record<string, string>;
}

/** @deprecated Use `ApiErrorBody` (same shape, now with `code`). */
export type SpringErrorBody = ApiErrorBody;

export interface MessageResponse {
  message: string;
}

export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

/** `page` (0-based), `size` (default 20, max 100), `sort` ("field,asc|desc"). */
export interface PageQuery {
  page?: number;
  size?: number;
  sort?: string;
}

// ---------------------------------------------------------------------------
// Auth, session, profile
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
  /** Round 2 (docs/round2-contract.md §3.3). Absent from pre-round-2 backends. */
  status?: "AUTHENTICATED";
  token: string;
  email: string;
  nom: string;
  role: RoleCode;
  userId: number;
  /** Absent from pre-v2 backends: treat as unknown. */
  sessionId?: string;
  /** ISO instant. Absent from pre-v2 backends. */
  expiresAt?: string;
  /** Round 2: every other action is refused until a new password is set. */
  mustChangePassword?: boolean;
  twoFactorEnabled?: boolean;
  /** The second login step used a recovery code. */
  recoveryCodeUsed?: boolean;
  /** Only from `POST /api/auth/2fa/enable`. */
  recoveryCodes?: string[];
}

export type LoginChallengeStatus = "TOTP_REQUIRED" | "TOTP_ENROLMENT_REQUIRED";

/** Password accepted, second step pending (round 2 §3.3). Never reaches the browser as is. */
export interface LoginChallengeResponse {
  status: LoginChallengeStatus;
  challengeToken: string;
  expiresAt: string;
  email: string;
}

export type LoginResponse = AuthResponse | LoginChallengeResponse;

export interface TotpSetupResponse {
  /** Base32, upper case, no padding. */
  secret: string;
  otpauthUri: string;
  expiresAt: string;
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
  enabledAt: string | null;
  required: boolean;
  recoveryCodesRemaining: number;
  pendingSetup: boolean;
}

export interface RecoveryCodesResponse {
  recoveryCodes: string[];
}

export interface TwoFactorDisableRequest {
  password: string;
  /** 6-digit TOTP code or a recovery code. */
  code: string;
}

/** What the Next session routes return to the browser (never the token). */
export interface SessionUser {
  email: string;
  nom: string;
  role: RoleCode;
  userId: number;
  /** Session expiry, seconds since epoch. */
  exp: number;
  /** Round 2: absent from cookies written before round 2 (read as false). */
  mustChangePassword?: boolean;
  twoFactorEnabled?: boolean;
}

export interface SessionResponse {
  user: SessionUser;
}

/** `POST /api/session/login`: a session, or a second step whose token stays in an httpOnly cookie. */
export type SessionLoginResult =
  | { status: "AUTHENTICATED"; user: SessionUser }
  | { status: LoginChallengeStatus; email: string; expiresAt: string };

/** `POST /api/session/login/verify`. */
export interface SessionVerifyResult {
  status: "AUTHENTICATED";
  user: SessionUser;
  recoveryCodeUsed: boolean;
}

/** `POST /api/session/enrolment/enable`. */
export interface SessionEnrolmentResult {
  status: "AUTHENTICATED";
  user: SessionUser;
  recoveryCodes: string[];
}

export interface MeClient {
  clientId: number;
  companyName: string | null;
  validationStatus: ClientValidationStatus;
  trustLevel: number;
}

export interface MeResponse {
  userId: number;
  email: string;
  nom: string;
  role: RoleCode;
  societe: string | null;
  telephone: string | null;
  adresse: string | null;
  logoUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  client: MeClient | null;
  /** Round 2 (§3.3). Optional for pre-round-2 payloads and fixtures: read with `?? false`. */
  twoFactorEnabled?: boolean;
  /** TOTP mandatory for this role (`tpub.security.totp.required-roles`). */
  twoFactorRequired?: boolean;
  mustChangePassword?: boolean;
}

export interface MeUpdateRequest {
  /** 1..150 */
  nom: string;
  /** ≤200 */
  societe?: string | null;
  /** ^[+0-9 ().-]{6,30}$ */
  telephone?: string | null;
  /** ≤1000 */
  adresse?: string | null;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  /** 8..100, ≥1 letter and ≥1 digit */
  newPassword: string;
}

/** An active login session (GET /api/me/sessions). Not the Next `SessionResponse`. */
export interface UserSessionResponse {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface LoginHistoryResponse {
  id: number;
  email: string;
  success: boolean;
  failureReason: LoginFailureReason | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface RevokedCountResponse {
  revoked: number;
}

/** POST /api/admin/users/{id}/password/reset — the temporary password is returned once. */
export interface TemporaryPasswordResponse {
  userId: number;
  email: string;
  temporaryPassword: string;
  mustChangePassword: boolean;
  revokedSessions: number;
}

// ---------------------------------------------------------------------------
// Admin users, roles, audit
// ---------------------------------------------------------------------------
export interface AdminUserResponse extends MeResponse {
  activeSessions: number;
  /** 0 for staff. */
  campaignsCount: number;
  clientNotes: string | null;
}

export interface AdminUserQuery extends PageQuery {
  q?: string;
  role?: readonly RoleCode[];
  active?: boolean;
  validationStatus?: readonly ClientValidationStatus[];
}

export interface AdminUserCreateRequest {
  email: string;
  /** 8..100 */
  password: string;
  nom: string;
  role: StaffRoleCode;
  societe?: string | null;
  telephone?: string | null;
}

export interface AdminUserUpdateRequest {
  nom: string;
  societe?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  role?: StaffRoleCode | null;
}

export interface ClientValidationRequest {
  validationStatus: ClientValidationStatus;
  /** 0..100 */
  trustLevel?: number;
  /** ≤2000 */
  notes?: string | null;
}

export interface RoleResponse {
  code: RoleCode;
  name: string;
  description: string;
  permissions: string[];
}

export interface AuditLogResponse {
  id: number;
  actorUserId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: RoleCode | null;
  action: AuditAction | (string & {});
  entityType: AuditEntityType | (string & {});
  entityId: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditQuery extends PageQuery {
  actorId?: number;
  action?: readonly string[];
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------
export interface CampaignRequest {
  /** 1..200 */
  name: string;
  /** ≤5000 */
  objective?: string | null;
  /** ≥0 */
  budget: number;
  startDate?: string | null;
  endDate?: string | null;
  /** "HH:mm:ss" (the backend also accepts "HH:mm") */
  startTime?: string | null;
  /** "HH:mm:ss" (the backend also accepts "HH:mm") */
  endTime?: string | null;
}

export interface CampaignZoneResponse {
  id: number;
  zoneId: number;
  zoneName: string;
  label: string | null;
  latitude: number;
  longitude: number;
  radiusKm: number;
  supportsInside: number;
}

export interface CampaignZoneRequest {
  latitude: number;
  longitude: number;
  /** 0.1..50 */
  radiusKm: number;
  /** ≤150 */
  label?: string | null;
}

export interface CampaignZonesRequest {
  /** 1..5 circles */
  zones: CampaignZoneRequest[];
}

export interface CampaignZonesUpdateResponse {
  zones: CampaignZoneResponse[];
  cancelledReservationIds: number[];
}

export interface CampaignResponse {
  id: number;
  clientId: number;
  clientName?: string;
  clientCompanyName?: string | null;
  clientValidationStatus?: ClientValidationStatus;
  name: string;
  objective: string | null;
  budget: number;
  consumedBudget: number;
  remainingBudget?: number;
  /** Σ TEMPORAIRE|CONFIRMEE reservations. */
  estimatedCost?: number;
  status: CampaignStatus;
  aiStatus: CampaignAiStatus | null;
  adminStatus: CampaignAdminStatus | null;
  aiOverride?: boolean;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  estimatedViews: number;
  /** 0..10 */
  priorityScore: number;
  /** Latest non-preview AI check. */
  aiRiskScore?: number | null;
  aiQualityScore?: number | null;
  aiSector?: AiSector | null;
  rejectionReason?: string | null;
  adminComment?: string | null;
  terminationReason?: TerminationReason | null;
  /** First media by sortOrder, id. Same-origin "/uploads/…" path. */
  mediaUrl?: string | null;
  mediaType?: MediaFileType | null;
  mediaCount?: number;
  zones?: CampaignZoneResponse[];
  /** TEMPORAIRE|CONFIRMEE */
  reservationsCount?: number;
  duplicatedFromId?: number | null;
  editable?: boolean;
  submittable?: boolean;
  deletable?: boolean;
  createdAt: string;
  updatedAt?: string;
  submittedAt: string | null;
  validatedAt: string | null;
  activatedAt?: string | null;
  terminatedAt?: string | null;
}

/** GET /api/campaigns/mine filters. Lists are sent comma-separated. */
export interface CampaignMineFilters {
  q?: string;
  status?: readonly CampaignStatus[];
  aiStatus?: readonly CampaignAiStatus[];
  from?: string;
  to?: string;
  zoneId?: number;
}

/** GET /api/campaigns (staff search). */
export interface CampaignSearchFilters extends CampaignMineFilters, PageQuery {
  client?: string;
  clientId?: number;
  supportType?: readonly SupportType[];
}

export interface DuplicateCampaignRequest {
  /** Default true. */
  includeMedia?: boolean;
}

export interface AdminValidateRequest {
  overrideAi?: boolean;
  /** ≤1000 */
  comment?: string | null;
  /** 0..10 */
  priorityScore?: number | null;
}

export interface AdminRejectRequest {
  /** 3..1000 */
  reason: string;
}

export interface PriorityRequest {
  /** 0..10 */
  priorityScore: number;
}

/** Keys of `errors` on 400 SUBMIT_INCOMPLETE. */
export type SubmitIncompleteKey = "period" | "times" | "budget" | "zones" | "reservations";

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------
export interface MediaFileResponse {
  id: number;
  campaignId: number;
  fileName: string;
  fileType: MediaFileType;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number | null;
  widthPx: number | null;
  heightPx: number | null;
  /** "/uploads/campaigns/12/<uuid>.jpg" */
  url: string;
  checksum: string;
  sortOrder: number;
  createdAt: string;
}

export interface MediaUploadOptions {
  /** Images only. */
  kind?: "BANNER" | null;
  /** Videos, 1..600. */
  durationSeconds?: number | null;
}

// ---------------------------------------------------------------------------
// AI moderation
// ---------------------------------------------------------------------------
export interface AiIssue {
  label: string;
  severity: Severity;
  source: AiIssueSource;
}

export interface AiMediaAnalysis {
  mediaId: number;
  fileName: string;
  contentType: "IMAGE" | "VIDEO" | "MINIATURE";
  widthPx: number | null;
  heightPx: number | null;
  durationSeconds: number | null;
  extractedText: string | null;
  issues: string[];
}

export interface AiMatchedRule {
  ruleId: number | null;
  ruleName: string;
  severity: Severity;
}

export interface AiReportResponse {
  campaignId: number;
  checkId?: number;
  aiStatus: AiReportStatus;
  riskScore: number;
  qualityScore: number;
  detectedIssues: string[];
  issues?: AiIssue[];
  recommendation: string | null;
  recommendations?: string[];
  reason?: string | null;
  sector?: AiSector | null;
  contentType?: AiContentType;
  extractedText?: string | null;
  ocrEngine?: OcrEngine;
  engine?: AiEngine;
  mediaAnalyses?: AiMediaAnalysis[];
  matchedRules?: AiMatchedRule[];
  preview?: boolean;
  adminDecision?: AiAdminDecision | null;
  checkedAt?: string;
}

/** Normalised AI report (aiStatus uppercase, arrays never null). */
export interface AiReport extends Omit<AiReportResponse, "aiStatus"> {
  aiStatus: AiReportStatusUpper;
}

export interface AiIssuesResponse {
  campaignId: number;
  checkId: number;
  aiStatus: string;
  issues: AiIssue[];
}

export interface AiRuleRequest {
  /** 1..150 */
  ruleName: string;
  ruleType: AiRuleType;
  /** 1..2000 */
  pattern: string;
  severity: Severity;
  sector?: AiSector | null;
  /** Default true. */
  isActive?: boolean;
  description?: string | null;
}

export interface AiRuleResponse {
  id: number;
  ruleName: string;
  ruleType: AiRuleType;
  pattern: string;
  severity: Severity;
  sector: AiSector | null;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiRuleQuery {
  active?: boolean;
  ruleType?: AiRuleType;
}

export interface AiDecisionLogResponse {
  id: number;
  campaignId: number;
  campaignName: string;
  checkId: number;
  decisionType: AiDecisionType;
  /** AI status name, or VALIDATED / VALIDATED_OVERRIDE / REJECTED for ADMIN. */
  decision: string;
  reason: string | null;
  decidedByUserId: number | null;
  decidedByName: string | null;
  riskScore: number;
  qualityScore: number;
  preview: boolean;
  createdAt: string;
}

export interface AiDecisionQuery extends PageQuery {
  campaignId?: number;
  decisionType?: AiDecisionType;
  decision?: string;
  from?: string;
  to?: string;
}

export interface AiDashboardResponse {
  totalChecks: number;
  avgRiskScore: number;
  avgQualityScore: number;
  approvedCount: number;
  reviewRequiredCount: number;
  rejectedCount: number;
  adminValidatedCount: number;
  adminRejectedCount: number;
  /** 0..1 over admin decisions */
  validationRate: number;
  rejectionRate: number;
  overrideCount: number;
  disagreementCount: number;
  bySector: { sector: AiSector; count: number }[];
  topIssues: { label: string; count: number }[];
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

export interface ZoneRecommendationQuery {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  supportType?: readonly SupportType[];
  /** Default 3, max 10. */
  limit?: number;
}

export interface ZoneRecommendation {
  zone: ZoneResponse;
  score: number;
  totalSupports: number;
  availableSupports: number;
  estimatedViewsAvailable: number;
  estimatedCostAvailable: number;
  recentViewsPerSupport: number;
  reasons: string[];
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
  /** 0..100 */
  visibilityScore?: number | null;
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
  /** 0..100 (contract §2.4). Optional for the same reason as the Porteur fields. */
  visibilityScore?: number | null;
  /** Filled only by availability searches. */
  distanceKm?: number | null;
}

export interface SupportFilters {
  zoneId?: readonly number[] | number;
  supportType?: readonly SupportType[];
  technicalStatus?: readonly TechnicalStatus[];
}

/** GET /api/supports/{id}/availability item: a reservation or an availability block. */
export interface SupportAvailabilitySlot {
  startDate: string;
  endDate: string;
  /** "HH:mm:ss" */
  startTime: string;
  /** "HH:mm:ss" */
  endTime: string;
  /** Absent from pre-v2 backends: treat as "RESERVATION". */
  kind?: "RESERVATION" | "BLOCAGE";
  /** Null for blocks. */
  reservationStatus: "TEMPORAIRE" | "CONFIRMEE" | null;
  availabilityStatus?: AvailabilityStatus | null;
  reason?: string | null;
}

export interface SupportAvailabilityQuery {
  /** YYYY-MM-DD, default today (backend). */
  from?: string;
  /** YYYY-MM-DD, default today + 90 (backend). */
  to?: string;
  /** "HH:mm:ss" — both times together enable the time-overlap filter. */
  startTime?: string;
  endTime?: string;
}

export interface SupportBlockRequest {
  startDate: string;
  /** ≤92 days after startDate */
  endDate: string;
  startTime: string;
  endTime: string;
  availabilityStatus: SupportBlockStatus;
  /** ≤255 */
  reason?: string | null;
}

export interface SupportBlockResponse {
  id: number;
  supportId: number;
  date: string;
  startTime: string;
  endTime: string;
  availabilityStatus: SupportBlockStatus;
  reason: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Availability & estimates
// ---------------------------------------------------------------------------
export interface AvailabilityWindow {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

/**
 * GET /api/availability. Exactly one target: `campaignId`, or `lat`+`lng`+`radiusKm`, or `zoneId`.
 */
export interface AvailabilityQuery extends AvailabilityWindow {
  campaignId?: number;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  zoneId?: number;
  supportType?: readonly SupportType[];
  status?: readonly AvailabilityStatus[];
}

export interface SupportAvailabilityItem {
  support: SupportResponse;
  distanceKm: number | null;
  status: AvailabilityStatus;
  remainingCapacity: number;
  reservedByCampaign: boolean;
  campaignReservationId: number | null;
  conflicts: SupportAvailabilitySlot[];
  estimatedViews: number;
  estimatedCost: number;
}

export interface AvailabilitySummary {
  totalSupports: number;
  availableSupports: number;
  reservedSupports: number;
  occupiedSupports: number;
  maintenanceSupports: number;
  offlineSupports: number;
  estimatedViewsAvailable: number;
  estimatedCostAvailable: number;
}

export interface AlternativeSlot extends AvailabilityWindow {
  preset: SlotPreset | null;
  availableSupports: number;
  estimatedViewsAvailable: number;
}

export interface AvailabilityResponse extends AvailabilityWindow {
  days: number;
  hoursPerDay: number;
  supports: SupportAvailabilityItem[];
  summary: AvailabilitySummary;
  alternatives: AlternativeSlot[];
}

export interface EstimateRequest extends AvailabilityWindow {
  /** 1..100 */
  supportIds: number[];
}

export interface EstimateLine {
  supportId: number;
  supportName: string;
  supportType: SupportType;
  zoneName: string;
  estimatedViews: number;
  estimatedCost: number;
}

export interface EstimateResponse {
  days: number;
  hoursPerDay: number;
  lines: EstimateLine[];
  totalViews: number;
  totalCost: number;
}

export interface CampaignEstimateLine extends AvailabilityWindow {
  reservationId: number;
  supportId: number;
  supportName: string;
  zoneName: string;
  reservationStatus: "TEMPORAIRE" | "CONFIRMEE";
  estimatedViews: number;
  estimatedCost: number;
}

export interface CampaignEstimateResponse {
  campaignId: number;
  budget: number;
  consumedBudget: number;
  remainingBudget: number;
  lines: CampaignEstimateLine[];
  totalViews: number;
  totalCost: number;
  /** budget / totalCost, null when totalCost is 0. */
  budgetCoverage: number | null;
  budgetSufficient: boolean;
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------
export interface ReservationRequest {
  campaignId: number;
  supportId: number;
  /** Ignored by the backend (zone = support.zone). */
  zoneId?: number | null;
  /** Window fields default to the campaign values. */
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ReservationBatchRequest {
  campaignId: number;
  /** 1..50 */
  supportIds: number[];
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ReservationCancelRequest {
  /** ≤255 */
  reason?: string | null;
}

export interface ReservationResponse {
  id: number;
  campaignId: number;
  campaignName?: string;
  campaignStatus?: CampaignStatus;
  clientCompanyName?: string | null;
  zoneId: number;
  zoneName?: string;
  supportId: number;
  supportName?: string;
  /** Nullable only for older joined view-models; the backend always sends it. */
  supportType?: SupportType | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  availabilityStatus: AvailabilityStatus;
  reservationStatus: ReservationStatus;
  estimatedViews: number;
  estimatedCost: number;
  createdAt?: string;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  expiredAt?: string | null;
  /** For the caller. */
  cancellable?: boolean;
}

export interface ReservationSearchQuery extends PageQuery {
  status?: readonly ReservationStatus[];
  campaignId?: number;
  supportId?: number;
  zoneId?: number;
  clientId?: number;
  from?: string;
  to?: string;
}

export interface ReservationMineQuery {
  status?: readonly ReservationStatus[];
  campaignId?: number;
}

export interface ReservationConflictQuery {
  from?: string;
  to?: string;
  zoneId?: number;
  supportId?: number;
}

export interface ReservationConflict {
  supportId: number;
  supportName: string;
  zoneId: number;
  zoneName: string;
  capacity: number;
  severity: ConflictSeverity;
  overlapStartDate: string;
  overlapEndDate: string;
  overlapStartTime: string;
  overlapEndTime: string;
  reservations: ReservationResponse[];
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
export interface DashboardResponse {
  totalCampaigns: number;
  activeCampaigns: number;
  /** PENDING_AI_CHECK + APPROVED_BY_AI + REVIEW_REQUIRED */
  pendingCampaigns: number;
  aiPendingCampaigns: number;
  aiRejectedCampaigns: number;
  availableSupports: number;
  confirmedReservations: number;
  /** PUBLICITE logs only. */
  totalViews: number;
  estimatedBudget: number;
  consumedBudget: number;
  aiFlaggedCampaigns?: number;
  reviewRequiredCampaigns?: number;
  approvedByAiCampaigns?: number;
  validatedCampaigns?: number;
  terminatedCampaigns?: number;
  blockedCampaigns?: number;
  draftCampaigns?: number;
  totalClients?: number;
  pendingClients?: number;
  totalSupports?: number;
  supportsByStatus?: Record<TechnicalStatus, number>;
  totalZones?: number;
  activeZones?: number;
  temporaryReservations?: number;
  cancelledReservations?: number;
  expiredReservations?: number;
  totalDiffusions?: number;
  emergencyViews?: number;
  defaultViews?: number;
  viewsToday?: number;
  totalClicks?: number;
  totalInteractions?: number;
  estimatedCost?: number;
  simulatedRevenue?: number;
  activeEmergencies?: number;
}

export type StatisticsGroupBy = "day" | "campaign" | "support" | "zone";

export interface StatisticsRange {
  from?: string;
  to?: string;
}

export interface StatisticsViewsQuery extends StatisticsRange {
  groupBy?: StatisticsGroupBy;
  campaignId?: number;
  supportId?: number;
  zoneId?: number;
  contentType?: DiffusionContentType;
}

export interface StatisticsTotals {
  views: number;
  clicks: number;
  interactions: number;
  cost: number;
}

export interface StatisticsViewsRow extends StatisticsTotals {
  /** "YYYY-MM-DD" for day rows, the id otherwise. */
  key: string;
  /** "dd/MM" for day rows, the name otherwise. */
  label: string;
}

export interface StatisticsViewsResponse {
  from: string;
  to: string;
  groupBy: StatisticsGroupBy;
  rows: StatisticsViewsRow[];
  totals: StatisticsTotals;
}

export interface StatisticsDailyRow {
  date: string;
  views: number;
  clicks: number;
  interactions: number;
  cost: number;
}

export interface StatisticsBySupportRow {
  supportId: number;
  name: string;
  zoneName: string;
  views: number;
}

export interface StatisticsByZoneRow {
  zoneId: number;
  name: string;
  views: number;
}

export interface StatisticsMineResponse {
  from: string;
  to: string;
  totals: {
    campaigns: number;
    activeCampaigns: number;
    pendingCampaigns: number;
    views: number;
    clicks: number;
    interactions: number;
    estimatedViews: number;
    estimatedCost: number;
    estimatedBudget: number;
    consumedBudget: number;
    confirmedReservations: number;
  };
  statusCounts: Record<CampaignStatus, number>;
  daily: StatisticsDailyRow[];
  byCampaign: {
    campaignId: number;
    name: string;
    status: CampaignStatus;
    views: number;
    clicks: number;
    interactions: number;
    estimatedViews: number;
    estimatedCost: number;
    budget: number;
    consumedBudget: number;
  }[];
  bySupport: StatisticsBySupportRow[];
  byZone: StatisticsByZoneRow[];
}

export interface StatisticsCampaignResponse {
  campaignId: number;
  name: string;
  status: CampaignStatus;
  budget: number;
  consumedBudget: number;
  remainingBudget: number;
  estimatedViews: number;
  estimatedCost: number;
  views: number;
  clicks: number;
  interactions: number;
  lastDiffusionAt: string | null;
  daily: StatisticsDailyRow[];
  bySupport: StatisticsBySupportRow[];
  byZone: StatisticsByZoneRow[];
}

export interface StatisticsHistoryRow {
  date: string;
  totalCampaigns: number;
  activeCampaigns: number;
  pendingCampaigns: number;
  aiPendingCampaigns: number;
  aiRejectedCampaigns: number;
  availableSupports: number;
  confirmedReservations: number;
  views: number;
  clicks: number;
  interactions: number;
  estimatedBudget: number;
  consumedBudget: number;
  avgRiskScore: number | null;
  avgQualityScore: number | null;
}

export type StatisticsExportType = "views" | "dashboard" | "mine" | "campaign";

export interface StatisticsExportQuery extends StatisticsRange {
  type: StatisticsExportType;
  groupBy?: StatisticsGroupBy;
  campaignId?: number;
}

// ---------------------------------------------------------------------------
// Emergency messages
// ---------------------------------------------------------------------------
/**
 * Zone-targeted message (the zone may also carry an optional circle). For a message targeted
 * only by a circle, use `EmergencyCircleRequest`; `emergencyApi.create` accepts both.
 */
export interface EmergencyRequest {
  /** 1..200 */
  title: string;
  /** 1..2000 */
  content: string;
  zoneId: number;
  /** latitude, longitude and radiusKm (0.1..50): all three or none. */
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
  startDate: string;
  endDate: string;
  /** Default 00:00:00 */
  startTime?: string | null;
  /** Default 23:59:59 */
  endTime?: string | null;
  /** 5..120, default 15 */
  durationSeconds?: number | null;
  /** ≥1, default 1 */
  priority?: number | null;
  /** Default HIGH */
  urgencyLevel?: UrgencyLevel | null;
}

/** Circle-targeted message: `zoneId` optional (backend resolves the containing/nearest zone). */
export interface EmergencyCircleRequest extends Omit<
  EmergencyRequest,
  "zoneId" | "latitude" | "longitude" | "radiusKm"
> {
  zoneId?: number | null;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

/** Body of POST /api/emergency (contract §2.8: a zone, a complete circle, or both). */
export type EmergencyCreateRequest = EmergencyRequest | EmergencyCircleRequest;

export interface EmergencyResponse {
  id: number;
  title: string;
  content: string;
  zoneId: number;
  zoneName?: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
  startDate: string;
  endDate: string;
  /** Always set by v2 (defaults 00:00:00 / 23:59:59); null only in pre-v2 payloads. */
  startTime: string | null;
  endTime: string | null;
  durationSeconds?: number;
  priority: number;
  urgencyLevel: UrgencyLevel;
  isActive: boolean;
  state?: EmergencyState;
  stoppedAt?: string | null;
  stopReason?: EmergencyStopReason | null;
  affectedSupports?: number;
  diffusionCount?: number;
  createdByName?: string;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Diffusion (player) and logs
// ---------------------------------------------------------------------------
export interface DiffusionResponse {
  type: DiffusionType;
  diffusionLogId?: number;
  supportId?: number;
  campaignId: number | null;
  emergencyId?: number | null;
  title: string;
  content?: string | null;
  mediaUrl: string | null;
  mediaType?: MediaFileType | null;
  duration: number;
  zone: string;
  priority: number;
  urgencyLevel?: UrgencyLevel | null;
  /** Local "YYYY-MM-DDTHH:mm:ss" used by the engine. */
  datetime?: string;
  /** Round 2: true when the requested `datetime` was honoured (backend `local` profile only). */
  simulatedTime?: boolean;
}

/** Normalised diffusion (type uppercase). */
export interface Diffusion extends Omit<DiffusionResponse, "type"> {
  type: DiffusionTypeUpper;
}

export interface DiffusionQuery {
  supportId: number;
  /** Local ISO date-time without timezone, e.g. 2026-09-12T14:30:00. Default: now (backend). */
  datetime?: string;
  zone?: string;
}

// ---------------------------------------------------------------------------
// Player device keys (round 2 §3.4)
// ---------------------------------------------------------------------------
export interface DeviceKeyIssuedResponse {
  supportId: number;
  /** Shown once: never stored by the back-office. */
  deviceKey: string;
  /** First 12 characters of the key. */
  keyPrefix: string;
  createdAt: string;
  /** "/ecran/{id}?cle={deviceKey}" */
  pairingPath: string;
}

export interface DeviceKeyStatusResponse {
  supportId: number;
  supportName: string;
  paired: boolean;
  keyPrefix: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
}

export interface InteractionRequest {
  diffusionLogId: number;
  type: InteractionType;
}

export interface DiffusionLogResponse {
  id: number;
  supportId: number;
  supportName: string;
  zoneId: number | null;
  zoneName: string | null;
  campaignId: number | null;
  campaignName: string | null;
  emergencyId: number | null;
  contentType: DiffusionContentType;
  title: string | null;
  mediaUrl: string | null;
  durationSeconds: number | null;
  priority: number;
  cost: number;
  clicks: number;
  interactions: number;
  diffusedAt: string;
  createdAt: string;
}

export interface DiffusionLogQuery extends PageQuery {
  supportId?: number;
  zoneId?: number;
  campaignId?: number;
  contentType?: readonly DiffusionContentType[];
  from?: string;
  to?: string;
}
