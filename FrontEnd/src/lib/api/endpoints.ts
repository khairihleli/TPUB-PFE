/**
 * One typed function per backend endpoint used by the UI (docs/completion-contract.md §2, §5 F1).
 * All calls go through the same-origin bridge. Lowercase enums are normalised here, list
 * filters are sent comma-separated and paginated answers are normalised to `PageResponse`.
 */
import {
  apiFetch,
  apiUpload,
  downloadAndSave,
  type QueryValue,
  resetSessionExpiredGuard,
} from "@/lib/api/client";
import { ApiTransportError } from "@/lib/api/errors";
import { DEVICE_KEY_HEADER } from "@/lib/player/device-key";
import type {
  AdminRejectRequest,
  AdminUserCreateRequest,
  AdminUserQuery,
  AdminUserResponse,
  AdminUserUpdateRequest,
  AdminValidateRequest,
  AiDashboardResponse,
  AiDecisionLogResponse,
  AiDecisionQuery,
  AiIssuesResponse,
  AiReport,
  AiReportResponse,
  AiRuleQuery,
  AiRuleRequest,
  AiRuleResponse,
  AuditLogResponse,
  AuditQuery,
  AvailabilityQuery,
  AvailabilityResponse,
  CampaignEstimateResponse,
  CampaignMineFilters,
  CampaignRequest,
  CampaignResponse,
  CampaignSearchFilters,
  CampaignZoneRequest,
  CampaignZoneResponse,
  CampaignZonesUpdateResponse,
  ClientValidationRequest,
  DashboardResponse,
  DeviceKeyIssuedResponse,
  DeviceKeyStatusResponse,
  Diffusion,
  DiffusionLogQuery,
  DiffusionLogResponse,
  DiffusionQuery,
  DiffusionResponse,
  DuplicateCampaignRequest,
  EmergencyCreateRequest,
  EmergencyResponse,
  EmergencyState,
  EstimateRequest,
  EstimateResponse,
  InteractionRequest,
  LoginHistoryResponse,
  LoginRequest,
  MediaFileResponse,
  MediaUploadOptions,
  MeResponse,
  MeUpdateRequest,
  PageQuery,
  PageResponse,
  PasswordChangeRequest,
  RecoveryCodesResponse,
  RegisterRequest,
  ReservationBatchRequest,
  ReservationConflict,
  ReservationConflictQuery,
  ReservationMineQuery,
  ReservationRequest,
  ReservationResponse,
  ReservationSearchQuery,
  RevokedCountResponse,
  RoleResponse,
  SessionEnrolmentResult,
  SessionLoginResult,
  SessionResponse,
  SessionVerifyResult,
  StatisticsCampaignResponse,
  StatisticsExportQuery,
  StatisticsHistoryRow,
  StatisticsMineResponse,
  StatisticsRange,
  StatisticsViewsQuery,
  StatisticsViewsResponse,
  SupportAvailabilityQuery,
  SupportAvailabilitySlot,
  SupportBlockRequest,
  SupportBlockResponse,
  SupportFilters,
  SupportRequest,
  SupportResponse,
  TemporaryPasswordResponse,
  TotpSetupResponse,
  TwoFactorDisableRequest,
  TwoFactorStatusResponse,
  UserSessionResponse,
  ZoneRecommendation,
  ZoneRecommendationQuery,
  ZoneRequest,
  ZoneResponse,
} from "@/lib/api/types";

export interface CallOptions {
  signal?: AbortSignal;
}

/** Multipart uploads: `onProgress` switches to XMLHttpRequest to report the sent fraction. */
export interface UploadCallOptions extends CallOptions {
  onProgress?: (fraction: number) => void;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------
type ListValue = readonly (string | number)[] | string | number | null | undefined;

/** `["A","B"]` → "A,B"; a scalar passes through; empty lists are omitted. */
export function listParam(value: ListValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s ? s : undefined;
  }
  const joined = value
    .map((v) => String(v).trim())
    .filter(Boolean)
    .join(",");
  return joined || undefined;
}

function pageQuery(q: PageQuery): Record<string, QueryValue> {
  return { page: q.page, size: q.size, sort: q.sort };
}

/**
 * Filters and call options may be passed in one object (`mine({ status, signal })`) or apart
 * (`mine({ status }, { signal })`). The explicit options win.
 */
function signalOf(q: CallOptions, o: CallOptions): AbortSignal | undefined {
  return o.signal ?? q.signal;
}

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------
function arrayOr<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeAiReport(report: AiReportResponse): AiReport {
  return {
    ...report,
    aiStatus: String(report.aiStatus).toUpperCase() as AiReport["aiStatus"],
    detectedIssues: arrayOr(report.detectedIssues),
    issues: arrayOr(report.issues),
    recommendations: arrayOr(report.recommendations),
    mediaAnalyses: arrayOr(report.mediaAnalyses),
    matchedRules: arrayOr(report.matchedRules),
  };
}

export function normalizeDiffusion(d: DiffusionResponse): Diffusion {
  return { ...d, type: String(d.type).toUpperCase() as Diffusion["type"] };
}

/**
 * Accepts a v2 `PageResponse` or a legacy bare array (pre-v2 backend) and always returns a page.
 */
export function normalizePage<T>(data: PageResponse<T> | T[] | null | undefined): PageResponse<T> {
  if (Array.isArray(data)) {
    return { items: data, page: 0, size: data.length, totalItems: data.length, totalPages: 1 };
  }
  if (!data || !Array.isArray(data.items)) {
    return { items: [], page: 0, size: 0, totalItems: 0, totalPages: 0 };
  }
  return data;
}

/** Sorts campaigns newest first (the backend returns them unsorted). */
export function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

/** Largest page size accepted by the backend. */
export const MAX_PAGE_SIZE = 100;
/** Safety cap when walking every page of a search. */
const MAX_PAGES = 50;

async function fetchAllPages<T>(load: (page: number) => Promise<PageResponse<T>>): Promise<T[]> {
  const first = await load(0);
  const items = [...first.items];
  const last = Math.min(first.totalPages, MAX_PAGES);
  for (let page = 1; page < last; page++) {
    items.push(...(await load(page)).items);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Session (Next route handlers — cookies are httpOnly, the token never reaches JS)
// ---------------------------------------------------------------------------
/**
 * A pre-round-2 bridge answers `{ user }` without `status`: that is an opened session.
 */
export function normalizeSessionLogin(
  res: SessionLoginResult | SessionResponse | null | undefined,
): SessionLoginResult {
  if (res && "status" in res && res.status !== "AUTHENTICATED") return res;
  if (res && "user" in res) return { status: "AUTHENTICATED", user: res.user };
  throw new ApiTransportError("unexpected-response");
}

export const sessionApi = {
  /** `refresh: true` re-reads the account from the backend (round 2: after a forced password change). */
  get: (o: CallOptions & { refresh?: boolean } = {}) =>
    apiFetch<SessionResponse>("/api/session", {
      query: { actualiser: o.refresh ? 1 : undefined },
      signal: o.signal,
    }),
  /** Round 2: a session, or a second step (TOTP code / mandatory enrolment). */
  login: async (body: LoginRequest, o: CallOptions = {}): Promise<SessionLoginResult> => {
    const res = normalizeSessionLogin(
      await apiFetch<SessionLoginResult | SessionResponse>("/api/session/login", {
        method: "POST",
        body,
        ...o,
      }),
    );
    if (res.status === "AUTHENTICATED") resetSessionExpiredGuard();
    return res;
  },
  /** Second login step: 6-digit TOTP code or a recovery code `xxxxx-xxxxx`. */
  verifyTotp: async (code: string, o: CallOptions = {}) => {
    const res = await apiFetch<SessionVerifyResult>("/api/session/login/verify", {
      method: "POST",
      body: { code },
      ...o,
    });
    resetSessionExpiredGuard();
    return res;
  },
  /** Mandatory enrolment: the pending secret of the challenge's account. */
  enrolmentSetup: (o: CallOptions = {}) =>
    apiFetch<TotpSetupResponse>("/api/session/enrolment/setup", { method: "POST", ...o }),
  /** Mandatory enrolment: confirms the first code, opens the session, returns the recovery codes. */
  enrolmentEnable: async (code: string, o: CallOptions = {}) => {
    const res = await apiFetch<SessionEnrolmentResult>("/api/session/enrolment/enable", {
      method: "POST",
      body: { code },
      ...o,
    });
    resetSessionExpiredGuard();
    return res;
  },
  register: async (body: RegisterRequest, o: CallOptions = {}) => {
    const res = await apiFetch<SessionResponse>("/api/session/register", {
      method: "POST",
      body,
      ...o,
    });
    resetSessionExpiredGuard();
    return res;
  },
  /** Revokes the backend session (best-effort) then clears the cookies. */
  logout: (o: CallOptions = {}) =>
    apiFetch<{ ok: true }>("/api/session/logout", { method: "POST", ...o }),
};

// ---------------------------------------------------------------------------
// Profile, sessions, login history (any authenticated user)
// ---------------------------------------------------------------------------
export const meApi = {
  get: (o: CallOptions = {}) => apiFetch<MeResponse>("/me", o),
  update: (body: MeUpdateRequest, o: CallOptions = {}) =>
    apiFetch<MeResponse>("/me", { method: "PUT", body, ...o }),
  /** 204. Revokes the other sessions (PASSWORD_CHANGED). */
  changePassword: (body: PasswordChangeRequest, o: CallOptions = {}) =>
    apiFetch<void>("/me/password", { method: "POST", body, ...o }),
  /** png/jpeg/webp ≤ 2 MB. */
  uploadLogo: (file: Blob, o: UploadCallOptions = {}) => {
    const form = new FormData();
    form.append("file", file, fileNameOf(file, "logo"));
    return o.onProgress
      ? apiUpload<MeResponse>("/me/logo", form, o)
      : apiFetch<MeResponse>("/me/logo", { method: "POST", body: form, signal: o.signal });
  },
  removeLogo: (o: CallOptions = {}) => apiFetch<MeResponse>("/me/logo", { method: "DELETE", ...o }),
  sessions: (o: CallOptions = {}) => apiFetch<UserSessionResponse[]>("/me/sessions", o),
  revokeSession: (sessionId: string, o: CallOptions = {}) =>
    apiFetch<void>(`/me/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE", ...o }),
  revokeOtherSessions: (o: CallOptions = {}) =>
    apiFetch<RevokedCountResponse>("/me/sessions/revoke-others", { method: "POST", ...o }),
  /**
   * Revokes the current backend session only. To log out of the app (cookies included) use
   * `sessionApi.logout`, which calls this endpoint server-side.
   */
  logoutCurrent: (o: CallOptions = {}) => apiFetch<void>("/me/logout", { method: "POST", ...o }),
  /** Newest first; default 20, max 100. */
  loginHistory: (limit?: number, o: CallOptions = {}) =>
    apiFetch<LoginHistoryResponse[]>("/me/login-history", { query: { limit }, ...o }),
  // Round 2 — self-service two-factor authentication (§3.3)
  twoFactor: (o: CallOptions = {}) => apiFetch<TwoFactorStatusResponse>("/me/2fa", o),
  /** Pending secret valid 10 minutes; a new setup replaces it. 409 TOTP_ALREADY_ENABLED. */
  twoFactorSetup: (o: CallOptions = {}) =>
    apiFetch<TotpSetupResponse>("/me/2fa/setup", { method: "POST", ...o }),
  /** Returns the 10 recovery codes, shown once. */
  twoFactorEnable: (code: string, o: CallOptions = {}) =>
    apiFetch<RecoveryCodesResponse>("/me/2fa/enable", { method: "POST", body: { code }, ...o }),
  /** 204. Closes the other sessions. 403 TOTP_REQUIRED_FOR_ROLE. */
  twoFactorDisable: (body: TwoFactorDisableRequest, o: CallOptions = {}) =>
    apiFetch<void>("/me/2fa/disable", { method: "POST", body, ...o }),
  /** TOTP code only (not a recovery code). Replaces every previous code. */
  regenerateRecoveryCodes: (code: string, o: CallOptions = {}) =>
    apiFetch<RecoveryCodesResponse>("/me/2fa/recovery-codes", {
      method: "POST",
      body: { code },
      ...o,
    }),
};

function fileNameOf(file: Blob, fallback: string): string {
  const name = (file as { name?: unknown }).name;
  return typeof name === "string" && name ? name : fallback;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------
function campaignFilterQuery(f: CampaignMineFilters): Record<string, QueryValue> {
  return {
    q: f.q?.trim() || undefined,
    status: listParam(f.status),
    aiStatus: listParam(f.aiStatus),
    from: f.from,
    to: f.to,
    zoneId: f.zoneId,
  };
}

function campaignSearchQuery(f: CampaignSearchFilters): Record<string, QueryValue> {
  return {
    ...campaignFilterQuery(f),
    client: f.client?.trim() || undefined,
    clientId: f.clientId,
    supportType: listParam(f.supportType),
    ...pageQuery(f),
  };
}

type DuplicateOverrides = Partial<CampaignRequest>;

async function duplicateCampaign(
  source: number | CampaignResponse,
  second?: DuplicateCampaignRequest | DuplicateOverrides | CallOptions,
  third: CallOptions = {},
): Promise<CampaignResponse> {
  if (typeof source === "number") {
    const body = (second ?? {}) as DuplicateCampaignRequest & CallOptions;
    return apiFetch<CampaignResponse>(`/campaigns/${source}/duplicate`, {
      method: "POST",
      body: { includeMedia: body.includeMedia ?? true } satisfies DuplicateCampaignRequest,
      signal: third.signal ?? body.signal,
    });
  }
  // Legacy client-side copy (pre-v2 callers): a new draft with the same fields.
  const overrides = (second ?? {}) as DuplicateOverrides;
  return apiFetch<CampaignResponse>("/campaigns", {
    method: "POST",
    body: {
      name: source.name,
      objective: source.objective,
      budget: source.budget,
      startDate: source.startDate,
      endDate: source.endDate,
      startTime: source.startTime,
      endTime: source.endTime,
      ...overrides,
    } satisfies CampaignRequest,
    ...third,
  });
}

interface CampaignDuplicate {
  /** Server duplication (v2): copies zones, times, media (default) — never reservations. */
  (id: number, body?: DuplicateCampaignRequest, o?: CallOptions): Promise<CampaignResponse>;
  /** @deprecated Client-side copy kept for pre-v2 callers: use `duplicate(id, { includeMedia })`. */
  (
    source: CampaignResponse,
    overrides?: DuplicateOverrides,
    o?: CallOptions,
  ): Promise<CampaignResponse>;
}

export const campaignsApi = {
  /** ANNONCEUR — campaigns of the caller, newest first. */
  mine: async (filters: CampaignMineFilters & CallOptions = {}, o: CallOptions = {}) =>
    sortByCreatedAtDesc(
      await apiFetch<CampaignResponse[]>("/campaigns/mine", {
        query: campaignFilterQuery(filters),
        signal: signalOf(filters, o),
      }),
    ),
  /** ADMINISTRATEUR, SUPERVISEUR — paginated search. */
  search: async (filters: CampaignSearchFilters & CallOptions = {}, o: CallOptions = {}) =>
    normalizePage(
      await apiFetch<PageResponse<CampaignResponse> | CampaignResponse[]>("/campaigns", {
        query: campaignSearchQuery(filters),
        signal: signalOf(filters, o),
      }),
    ),
  /**
   * Every campaign matching `filters` (walks the pages, newest first). For the back-office
   * overview, badges and command palette; screens with a table use `search` + pagination.
   */
  all: async (filters: CampaignSearchFilters & CallOptions = {}, o: CallOptions = {}) => {
    const signal = signalOf(filters, o);
    const items = await fetchAllPages((page) =>
      campaignsApi.search({ ...filters, page, size: MAX_PAGE_SIZE }, { signal }),
    );
    return sortByCreatedAtDesc(items);
  },
  get: (id: number, o: CallOptions = {}) => apiFetch<CampaignResponse>(`/campaigns/${id}`, o),
  create: (body: CampaignRequest, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>("/campaigns", { method: "POST", body, ...o }),
  /** Full replace: omitted optional fields become null. Reopens REJECTED_BY_AI/BLOCKED first. */
  update: (id: number, body: CampaignRequest, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>(`/campaigns/${id}`, { method: "PUT", body, ...o }),
  remove: (id: number, o: CallOptions = {}) =>
    apiFetch<void>(`/campaigns/${id}`, { method: "DELETE", ...o }),
  /**
   * BROUILLON → PENDING_AI_CHECK → AI analysis in the same request: the answer carries the
   * resulting status (APPROVED_BY_AI | REVIEW_REQUIRED | REJECTED_BY_AI). Slow: no timeout.
   * 400 SUBMIT_INCOMPLETE lists the missing parts (see `submitIncompleteErrors`).
   */
  submit: (id: number, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>(`/campaigns/${id}/submit`, {
      method: "POST",
      timeoutMs: null,
      ...o,
    }),
  /** REJECTED_BY_AI | BLOCKED → BROUILLON. */
  reopen: (id: number, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>(`/campaigns/${id}/reopen`, { method: "POST", ...o }),
  duplicate: duplicateCampaign as CampaignDuplicate,
  zones: (id: number, o: CallOptions = {}) =>
    apiFetch<CampaignZoneResponse[]>(`/campaigns/${id}/zones`, o),
  /** Replaces every circle (1..5). TEMPORAIRE reservations outside the new circles are cancelled. */
  setZones: (id: number, zones: readonly CampaignZoneRequest[], o: CallOptions = {}) =>
    apiFetch<CampaignZonesUpdateResponse>(`/campaigns/${id}/zones`, {
      method: "PUT",
      body: { zones: [...zones] },
      ...o,
    }),
};

// ---------------------------------------------------------------------------
// Media (campaign content)
// ---------------------------------------------------------------------------
export const mediaApi = {
  list: (campaignId: number, o: CallOptions = {}) =>
    apiFetch<MediaFileResponse[]>(`/campaigns/${campaignId}/media`, o),
  /** Multipart upload (BROUILLON only). Images ≤ 10 MB, videos ≤ 50 MB, 5 files max. */
  upload: (
    campaignId: number,
    file: Blob,
    options: MediaUploadOptions = {},
    o: UploadCallOptions = {},
  ) => {
    const form = new FormData();
    form.append("file", file, fileNameOf(file, "media"));
    if (options.kind) form.append("kind", options.kind);
    if (options.durationSeconds !== null && options.durationSeconds !== undefined) {
      form.append("durationSeconds", String(Math.round(options.durationSeconds)));
    }
    const path = `/campaigns/${campaignId}/media`;
    return o.onProgress
      ? apiUpload<MediaFileResponse>(path, form, o)
      : apiFetch<MediaFileResponse>(path, { method: "POST", body: form, signal: o.signal });
  },
  remove: (campaignId: number, mediaId: number, o: CallOptions = {}) =>
    apiFetch<void>(`/campaigns/${campaignId}/media/${mediaId}`, { method: "DELETE", ...o }),
};

// ---------------------------------------------------------------------------
// AI moderation
// ---------------------------------------------------------------------------
export const aiApi = {
  /**
   * Synchronous and possibly slow: no client timeout. On a BROUILLON (owner) it is a
   * pre-analysis (`preview: true`) that does not change the campaign status.
   */
  checkContent: async (campaignId: number, o: CallOptions = {}) =>
    normalizeAiReport(
      await apiFetch<AiReportResponse>(`/ai/check-content/${campaignId}`, {
        method: "POST",
        timeoutMs: null,
        ...o,
      }),
    ),
  /** Latest check (preview or not). 404 AI_REPORT_NOT_FOUND = never analysed (isNoAiReportError). */
  report: async (campaignId: number, o: CallOptions = {}) =>
    normalizeAiReport(await apiFetch<AiReportResponse>(`/ai/report/${campaignId}`, o)),
  issues: async (campaignId: number, o: CallOptions = {}) => {
    const res = await apiFetch<AiIssuesResponse>(`/ai/issues/${campaignId}`, o);
    return { ...res, issues: arrayOr(res.issues) };
  },
  /** Every check, newest first. */
  checks: async (campaignId: number, o: CallOptions = {}) =>
    arrayOr(await apiFetch<AiReportResponse[]>(`/ai/checks/${campaignId}`, o)).map(
      normalizeAiReport,
    ),
  rules: {
    list: (q: AiRuleQuery & CallOptions = {}, o: CallOptions = {}) =>
      apiFetch<AiRuleResponse[]>("/ai/rules", {
        query: { active: q.active, ruleType: q.ruleType },
        signal: signalOf(q, o),
      }),
    create: (body: AiRuleRequest, o: CallOptions = {}) =>
      apiFetch<AiRuleResponse>("/ai/rules", { method: "POST", body, ...o }),
    update: (id: number, body: AiRuleRequest, o: CallOptions = {}) =>
      apiFetch<AiRuleResponse>(`/ai/rules/${id}`, { method: "PUT", body, ...o }),
    remove: (id: number, o: CallOptions = {}) =>
      apiFetch<void>(`/ai/rules/${id}`, { method: "DELETE", ...o }),
  },
  decisions: async (q: AiDecisionQuery & CallOptions = {}, o: CallOptions = {}) =>
    normalizePage(
      await apiFetch<PageResponse<AiDecisionLogResponse>>("/ai/decisions", {
        query: {
          campaignId: q.campaignId,
          decisionType: q.decisionType,
          decision: q.decision,
          from: q.from,
          to: q.to,
          ...pageQuery(q),
        },
        signal: signalOf(q, o),
      }),
    ),
  dashboard: (o: CallOptions = {}) => apiFetch<AiDashboardResponse>("/ai/dashboard", o),
};

// ---------------------------------------------------------------------------
// Admin decisions (ADMINISTRATEUR)
// ---------------------------------------------------------------------------
export const adminApi = {
  /** REVIEW_REQUIRED needs `overrideAi: true` (400 AI_OVERRIDE_REQUIRED otherwise). */
  validate: (campaignId: number, body: AdminValidateRequest = {}, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>(`/admin/campaigns/${campaignId}/validate`, {
      method: "POST",
      body,
      ...o,
    }),
  /** Reason 3..1000 characters, sent as a JSON body. Also blocks VALIDATED_BY_ADMIN/ACTIVE. */
  reject: (campaignId: number, reason: string, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>(`/admin/campaigns/${campaignId}/reject`, {
      method: "POST",
      body: { reason: reason.trim() } satisfies AdminRejectRequest,
      ...o,
    }),
  setPriority: (campaignId: number, priorityScore: number, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>(`/admin/campaigns/${campaignId}/priority`, {
      method: "PUT",
      body: { priorityScore },
      ...o,
    }),
};

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
export const zonesApi = {
  all: (o: CallOptions = {}) => apiFetch<ZoneResponse[]>("/zones", o),
  active: (o: CallOptions = {}) => apiFetch<ZoneResponse[]>("/zones/active", o),
  get: (id: number, o: CallOptions = {}) => apiFetch<ZoneResponse>(`/zones/${id}`, o),
  create: (body: ZoneRequest, o: CallOptions = {}) =>
    apiFetch<ZoneResponse>("/zones", { method: "POST", body, ...o }),
  update: (id: number, body: ZoneRequest, o: CallOptions = {}) =>
    apiFetch<ZoneResponse>(`/zones/${id}`, { method: "PUT", body, ...o }),
  /** 409 ZONE_IN_USE if Porteurs/reservations still reference the zone. */
  remove: (id: number, o: CallOptions = {}) =>
    apiFetch<void>(`/zones/${id}`, { method: "DELETE", ...o }),
  /** Best zones for a window (score desc; zones without available Porteurs excluded). */
  recommendations: (q: ZoneRecommendationQuery & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<ZoneRecommendation[]>("/zones/recommendations", {
      query: {
        startDate: q.startDate,
        endDate: q.endDate,
        startTime: q.startTime,
        endTime: q.endTime,
        supportType: listParam(q.supportType),
        limit: q.limit,
      },
      signal: signalOf(q, o),
    }),
};

// ---------------------------------------------------------------------------
// Supports (Porteurs) — no DELETE endpoint
// ---------------------------------------------------------------------------
export const supportsApi = {
  all: (filters: SupportFilters & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<SupportResponse[]>("/supports", {
      query: {
        zoneId: listParam(filters.zoneId),
        supportType: listParam(filters.supportType),
        technicalStatus: listParam(filters.technicalStatus),
      },
      signal: signalOf(filters, o),
    }),
  byZone: (zoneId: number, o: CallOptions = {}) =>
    apiFetch<SupportResponse[]>(`/supports/zone/${zoneId}`, o),
  get: (id: number, o: CallOptions = {}) => apiFetch<SupportResponse>(`/supports/${id}`, o),
  create: (body: SupportRequest, o: CallOptions = {}) =>
    apiFetch<SupportResponse>("/supports", { method: "POST", body, ...o }),
  update: (id: number, body: SupportRequest, o: CallOptions = {}) =>
    apiFetch<SupportResponse>(`/supports/${id}`, { method: "PUT", body, ...o }),
  /**
   * Reservations (TEMPORAIRE/CONFIRMEE) and blocks overlapping [from, to], sorted by startDate.
   * Both times → time-overlap filter. Backend defaults: today → today + 90.
   */
  availability: (id: number, q: SupportAvailabilityQuery = {}, o: CallOptions = {}) =>
    apiFetch<SupportAvailabilitySlot[]>(`/supports/${id}/availability`, {
      query: { from: q.from, to: q.to, startTime: q.startTime, endTime: q.endTime },
      ...o,
    }),
  blocks: (id: number, q: { from?: string; to?: string } = {}, o: CallOptions = {}) =>
    apiFetch<SupportBlockResponse[]>(`/supports/${id}/blocks`, {
      query: { from: q.from, to: q.to },
      ...o,
    }),
  /** One row per day of the range (≤ 92 days). */
  createBlock: (id: number, body: SupportBlockRequest, o: CallOptions = {}) =>
    apiFetch<SupportBlockResponse[]>(`/supports/${id}/blocks`, { method: "POST", body, ...o }),
  removeBlock: (id: number, blockId: number, o: CallOptions = {}) =>
    apiFetch<void>(`/supports/${id}/blocks/${blockId}`, { method: "DELETE", ...o }),
};

// ---------------------------------------------------------------------------
// Availability & estimates
// ---------------------------------------------------------------------------
export const availabilityApi = {
  /** Exactly one target: campaignId, or lat+lng+radiusKm, or zoneId. */
  search: (q: AvailabilityQuery, o: CallOptions = {}) =>
    apiFetch<AvailabilityResponse>("/availability", {
      query: {
        startDate: q.startDate,
        endDate: q.endDate,
        startTime: q.startTime,
        endTime: q.endTime,
        campaignId: q.campaignId,
        lat: q.lat,
        lng: q.lng,
        radiusKm: q.radiusKm,
        zoneId: q.zoneId,
        supportType: listParam(q.supportType),
        status: listParam(q.status),
      },
      ...o,
    }),
};

export const estimatesApi = {
  compute: (body: EstimateRequest, o: CallOptions = {}) =>
    apiFetch<EstimateResponse>("/estimates", { method: "POST", body, ...o }),
  campaign: (campaignId: number, o: CallOptions = {}) =>
    apiFetch<CampaignEstimateResponse>(`/estimates/campaign/${campaignId}`, o),
};

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------
export const reservationsApi = {
  /** ADMINISTRATEUR, SUPERVISEUR, OPERATEUR — paginated. */
  search: async (q: ReservationSearchQuery & CallOptions = {}, o: CallOptions = {}) =>
    normalizePage(
      await apiFetch<PageResponse<ReservationResponse> | ReservationResponse[]>("/reservations", {
        query: {
          status: listParam(q.status),
          campaignId: q.campaignId,
          supportId: q.supportId,
          zoneId: q.zoneId,
          clientId: q.clientId,
          from: q.from,
          to: q.to,
          ...pageQuery(q),
        },
        signal: signalOf(q, o),
      }),
    ),
  /** ANNONCEUR */
  mine: (q: ReservationMineQuery & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<ReservationResponse[]>("/reservations/mine", {
      query: { status: listParam(q.status), campaignId: q.campaignId },
      signal: signalOf(q, o),
    }),
  byCampaign: (campaignId: number, o: CallOptions = {}) =>
    apiFetch<ReservationResponse[]>(`/reservations/campaign/${campaignId}`, o),
  /** Window fields default to the campaign's. Times "HH:mm:ss". */
  create: (body: ReservationRequest, o: CallOptions = {}) =>
    apiFetch<ReservationResponse>("/reservations", { method: "POST", body, ...o }),
  /** All-or-nothing: 409 BATCH_CONFLICT (see `batchConflicts`) persists nothing. */
  createBatch: (body: ReservationBatchRequest, o: CallOptions = {}) =>
    apiFetch<ReservationResponse[]>("/reservations/batch", { method: "POST", body, ...o }),
  cancel: (id: number, reason?: string | null, o: CallOptions = {}) =>
    apiFetch<ReservationResponse>(`/reservations/${id}/cancel`, {
      method: "POST",
      body: { reason: reason?.trim() ? reason.trim() : null },
      ...o,
    }),
  conflicts: (q: ReservationConflictQuery & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<ReservationConflict[]>("/reservations/conflicts", {
      query: { from: q.from, to: q.to, zoneId: q.zoneId, supportId: q.supportId },
      signal: signalOf(q, o),
    }),
};

// ---------------------------------------------------------------------------
// Statistics — dashboard/views/history: staff only; mine: ANNONCEUR
// ---------------------------------------------------------------------------
function rangeQuery(q: StatisticsRange): Record<string, QueryValue> {
  return { from: q.from, to: q.to };
}

export const statisticsApi = {
  dashboard: (o: CallOptions = {}) => apiFetch<DashboardResponse>("/statistics/dashboard", o),
  views: (q: StatisticsViewsQuery & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<StatisticsViewsResponse>("/statistics/views", {
      query: {
        ...rangeQuery(q),
        groupBy: q.groupBy,
        campaignId: q.campaignId,
        supportId: q.supportId,
        zoneId: q.zoneId,
        contentType: q.contentType,
      },
      signal: signalOf(q, o),
    }),
  mine: (q: StatisticsRange & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<StatisticsMineResponse>("/statistics/mine", {
      query: rangeQuery(q),
      signal: signalOf(q, o),
    }),
  campaign: (campaignId: number, q: StatisticsRange & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<StatisticsCampaignResponse>(`/statistics/campaigns/${campaignId}`, {
      query: rangeQuery(q),
      signal: signalOf(q, o),
    }),
  history: (q: StatisticsRange & CallOptions = {}, o: CallOptions = {}) =>
    apiFetch<StatisticsHistoryRow[]>("/statistics/history", {
      query: rangeQuery(q),
      signal: signalOf(q, o),
    }),
  /** Downloads the CSV (`;`, decimal comma, UTF-8 BOM) and saves it. Resolves to the file name. */
  exportCsv: (q: StatisticsExportQuery, o: CallOptions = {}) =>
    downloadAndSave(
      "/statistics/export.csv",
      {
        type: q.type,
        ...rangeQuery(q),
        groupBy: q.groupBy,
        campaignId: q.campaignId,
      },
      { signal: o.signal, fallbackName: `tpub-statistiques-${q.type}.csv` },
    ),
};

// ---------------------------------------------------------------------------
// Emergency (priority public-interest messages)
// ---------------------------------------------------------------------------
export const emergencyApi = {
  all: (
    q: { state?: readonly EmergencyState[] | EmergencyState } & CallOptions = {},
    o: CallOptions = {},
  ) =>
    apiFetch<EmergencyResponse[]>("/emergency", {
      query: { state: listParam(q.state) },
      signal: signalOf(q, o),
    }),
  create: (body: EmergencyCreateRequest, o: CallOptions = {}) =>
    apiFetch<EmergencyResponse>("/emergency", { method: "POST", body, ...o }),
  deactivate: (id: number, o: CallOptions = {}) =>
    apiFetch<EmergencyResponse>(`/emergency/${id}/deactivate`, { method: "POST", ...o }),
};

// ---------------------------------------------------------------------------
// Diffusion — `next` writes a diffusion log on every call: only from /ecran
// ---------------------------------------------------------------------------
/** Player calls carry the device key of the paired screen (round 2 §1.1). */
export interface DeviceCallOptions extends CallOptions {
  deviceKey?: string | null;
}

function deviceHeaders(deviceKey: string | null | undefined): Record<string, string> | undefined {
  return deviceKey ? { [DEVICE_KEY_HEADER]: deviceKey } : undefined;
}

export const diffusionApi = {
  next: async (q: DiffusionQuery, { deviceKey, signal }: DeviceCallOptions = {}) =>
    normalizeDiffusion(
      await apiFetch<DiffusionResponse>("/diffusion/next", {
        query: { supportId: q.supportId, datetime: q.datetime, zone: q.zone },
        headers: deviceHeaders(deviceKey),
        signal,
      }),
    ),
  /** Staff — paginated diffusion journal. */
  logs: async (q: DiffusionLogQuery & CallOptions = {}, o: CallOptions = {}) =>
    normalizePage(
      await apiFetch<PageResponse<DiffusionLogResponse>>("/diffusion/logs", {
        query: {
          supportId: q.supportId,
          zoneId: q.zoneId,
          campaignId: q.campaignId,
          contentType: listParam(q.contentType),
          from: q.from,
          to: q.to,
          ...pageQuery(q),
        },
        signal: signalOf(q, o),
      }),
    ),
  /** Paired player only, idempotent per (log, type). 204. The log must belong to `supportId`. */
  interaction: (
    body: InteractionRequest,
    { supportId, deviceKey, signal }: DeviceCallOptions & { supportId: number },
  ) =>
    apiFetch<void>("/diffusion/interactions", {
      method: "POST",
      body,
      query: { supportId },
      headers: deviceHeaders(deviceKey),
      signal,
    }),
};

// ---------------------------------------------------------------------------
// Player device keys (round 2 §3.4) — issue/revoke: ADMINISTRATEUR; read: staff
// ---------------------------------------------------------------------------
export const deviceKeysApi = {
  /** 201. Rotates an existing key: the previous screen is disconnected. The key is shown once. */
  issue: (supportId: number, o: CallOptions = {}) =>
    apiFetch<DeviceKeyIssuedResponse>(`/supports/${supportId}/device-key`, {
      method: "POST",
      ...o,
    }),
  status: (supportId: number, o: CallOptions = {}) =>
    apiFetch<DeviceKeyStatusResponse>(`/supports/${supportId}/device-key`, o),
  /** Every Porteur, paired or not. */
  list: (o: CallOptions = {}) => apiFetch<DeviceKeyStatusResponse[]>("/supports/device-keys", o),
  /** 204, no-op without an active key. */
  revoke: (supportId: number, o: CallOptions = {}) =>
    apiFetch<void>(`/supports/${supportId}/device-key`, { method: "DELETE", ...o }),
};

// ---------------------------------------------------------------------------
// Admin users & clients
// ---------------------------------------------------------------------------
export const adminUsersApi = {
  list: async (q: AdminUserQuery & CallOptions = {}, o: CallOptions = {}) =>
    normalizePage(
      await apiFetch<PageResponse<AdminUserResponse>>("/admin/users", {
        query: {
          q: q.q?.trim() || undefined,
          role: listParam(q.role),
          active: q.active,
          validationStatus: listParam(q.validationStatus),
          ...pageQuery(q),
        },
        signal: signalOf(q, o),
      }),
    ),
  get: (userId: number, o: CallOptions = {}) =>
    apiFetch<AdminUserResponse>(`/admin/users/${userId}`, o),
  create: (body: AdminUserCreateRequest, o: CallOptions = {}) =>
    apiFetch<AdminUserResponse>("/admin/users", { method: "POST", body, ...o }),
  update: (userId: number, body: AdminUserUpdateRequest, o: CallOptions = {}) =>
    apiFetch<AdminUserResponse>(`/admin/users/${userId}`, { method: "PUT", body, ...o }),
  activate: (userId: number, o: CallOptions = {}) =>
    apiFetch<AdminUserResponse>(`/admin/users/${userId}/activate`, { method: "POST", ...o }),
  deactivate: (userId: number, o: CallOptions = {}) =>
    apiFetch<AdminUserResponse>(`/admin/users/${userId}/deactivate`, { method: "POST", ...o }),
  setClientValidation: (clientId: number, body: ClientValidationRequest, o: CallOptions = {}) =>
    apiFetch<AdminUserResponse>(`/admin/clients/${clientId}/validation`, {
      method: "POST",
      body,
      ...o,
    }),
  loginHistory: (userId: number, o: CallOptions = {}) =>
    apiFetch<LoginHistoryResponse[]>(`/admin/users/${userId}/login-history`, o),
  sessions: (userId: number, o: CallOptions = {}) =>
    apiFetch<UserSessionResponse[]>(`/admin/users/${userId}/sessions`, o),
  revokeSessions: (userId: number, o: CallOptions = {}) =>
    apiFetch<RevokedCountResponse>(`/admin/users/${userId}/sessions/revoke`, {
      method: "POST",
      ...o,
    }),
  roles: (o: CallOptions = {}) => apiFetch<RoleResponse[]>("/admin/roles", o),
  /** Round 2 — ADMINISTRATEUR, never on self: disables TOTP and closes the user's sessions. */
  resetTwoFactor: (userId: number, o: CallOptions = {}) =>
    apiFetch<AdminUserResponse>(`/admin/users/${userId}/2fa/reset`, { method: "POST", ...o }),
  /** Round 2 — ADMINISTRATEUR, never on self: new password required, sessions closed. */
  requirePasswordChange: (userId: number, o: CallOptions = {}) =>
    apiFetch<AdminUserResponse>(`/admin/users/${userId}/require-password-change`, {
      method: "POST",
      ...o,
    }),
  /**
   * Round 2 — ADMINISTRATEUR, never on self: replaces the password with a temporary one returned
   * once, forces a new password at the next login and closes the user's sessions.
   */
  resetPassword: (userId: number, o: CallOptions = {}) =>
    apiFetch<TemporaryPasswordResponse>(`/admin/users/${userId}/password/reset`, {
      method: "POST",
      ...o,
    }),
};

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------
export const auditApi = {
  list: async (q: AuditQuery & CallOptions = {}, o: CallOptions = {}) =>
    normalizePage(
      await apiFetch<PageResponse<AuditLogResponse>>("/admin/audit", {
        query: {
          actorId: q.actorId,
          action: listParam(q.action),
          entityType: q.entityType,
          entityId: q.entityId,
          from: q.from,
          to: q.to,
          ...pageQuery(q),
        },
        signal: signalOf(q, o),
      }),
    ),
};
