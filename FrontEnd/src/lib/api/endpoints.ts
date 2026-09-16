/**
 * One typed function per backend endpoint used by the UI (docs/api-contract.md §5).
 * All calls go through the same-origin bridge. Lowercase enums are normalised here.
 */
import { apiFetch, resetSessionExpiredGuard } from "@/lib/api/client";
import type {
  AiReport,
  AiReportResponse,
  CampaignRequest,
  CampaignResponse,
  DashboardResponse,
  Diffusion,
  DiffusionQuery,
  DiffusionResponse,
  EmergencyRequest,
  EmergencyResponse,
  LoginRequest,
  MessageResponse,
  RegisterRequest,
  ReservationRequest,
  ReservationResponse,
  SessionResponse,
  SupportAvailabilityQuery,
  SupportAvailabilitySlot,
  SupportRequest,
  SupportResponse,
  ZoneRequest,
  ZoneResponse,
} from "@/lib/api/types";

export interface CallOptions {
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------
export function normalizeAiReport(report: AiReportResponse): AiReport {
  return {
    ...report,
    aiStatus: String(report.aiStatus).toUpperCase() as AiReport["aiStatus"],
    detectedIssues: Array.isArray(report.detectedIssues) ? report.detectedIssues : [],
  };
}

export function normalizeDiffusion(d: DiffusionResponse): Diffusion {
  return { ...d, type: String(d.type).toUpperCase() as Diffusion["type"] };
}

/** Sorts campaigns newest first (the backend returns them unsorted). */
export function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

// ---------------------------------------------------------------------------
// Session (Next route handlers — cookies are httpOnly, the token never reaches JS)
// ---------------------------------------------------------------------------
export const sessionApi = {
  get: (o: CallOptions = {}) => apiFetch<SessionResponse>("/api/session", o),
  login: async (body: LoginRequest, o: CallOptions = {}) => {
    const res = await apiFetch<SessionResponse>("/api/session/login", {
      method: "POST",
      body,
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
  logout: (o: CallOptions = {}) =>
    apiFetch<{ ok: true }>("/api/session/logout", { method: "POST", ...o }),
};

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------
export const campaignsApi = {
  /** ANNONCEUR — campaigns of the caller, newest first. */
  mine: async (o: CallOptions = {}) =>
    sortByCreatedAtDesc(await apiFetch<CampaignResponse[]>("/campaigns/mine", o)),
  /** ADMINISTRATEUR, SUPERVISEUR — all campaigns, newest first. */
  all: async (o: CallOptions = {}) =>
    sortByCreatedAtDesc(await apiFetch<CampaignResponse[]>("/campaigns", o)),
  get: (id: number, o: CallOptions = {}) => apiFetch<CampaignResponse>(`/campaigns/${id}`, o),
  create: (body: CampaignRequest, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>("/campaigns", { method: "POST", body, ...o }),
  /** Full replace: omitted optional fields become null. */
  update: (id: number, body: CampaignRequest, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>(`/campaigns/${id}`, { method: "PUT", body, ...o }),
  remove: (id: number, o: CallOptions = {}) =>
    apiFetch<void>(`/campaigns/${id}`, { method: "DELETE", ...o }),
  /** BROUILLON → PENDING_AI_CHECK. Does NOT run the AI: call aiApi.checkContent next. */
  submit: (id: number, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>(`/campaigns/${id}/submit`, { method: "POST", ...o }),
  /** « Dupliquer »: POST a new draft with the same fields. */
  duplicate: (
    source: CampaignResponse,
    overrides: Partial<CampaignRequest> = {},
    o: CallOptions = {},
  ) =>
    apiFetch<CampaignResponse>("/campaigns", {
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
      ...o,
    }),
};

// ---------------------------------------------------------------------------
// AI moderation
// ---------------------------------------------------------------------------
export const aiApi = {
  /** Synchronous and possibly slow (several seconds): no client timeout. */
  checkContent: async (campaignId: number, o: CallOptions = {}) =>
    normalizeAiReport(
      await apiFetch<AiReportResponse>(`/ai/check-content/${campaignId}`, {
        method: "POST",
        timeoutMs: null,
        ...o,
      }),
    ),
  /** 400 « No AI report found » = not analysed yet (see isNoAiReportError). */
  report: async (campaignId: number, o: CallOptions = {}) =>
    normalizeAiReport(await apiFetch<AiReportResponse>(`/ai/report/${campaignId}`, o)),
};

// ---------------------------------------------------------------------------
// Admin decisions (ADMINISTRATEUR)
// ---------------------------------------------------------------------------
export const adminApi = {
  validate: (campaignId: number, o: CallOptions = {}) =>
    apiFetch<CampaignResponse>(`/admin/campaigns/${campaignId}/validate`, {
      method: "POST",
      ...o,
    }),
  /** `reason` is a query param, not a body. */
  reject: (campaignId: number, reason?: string, o: CallOptions = {}) =>
    apiFetch<MessageResponse>(`/admin/campaigns/${campaignId}/reject`, {
      method: "POST",
      query: { reason: reason?.trim() ? reason.trim() : undefined },
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
  /** 400 « Invalid data » if screens/reservations still reference the zone. */
  remove: (id: number, o: CallOptions = {}) =>
    apiFetch<void>(`/zones/${id}`, { method: "DELETE", ...o }),
};

// ---------------------------------------------------------------------------
// Supports (screens) — no DELETE endpoint
// ---------------------------------------------------------------------------
export const supportsApi = {
  all: (o: CallOptions = {}) => apiFetch<SupportResponse[]>("/supports", o),
  byZone: (zoneId: number, o: CallOptions = {}) =>
    apiFetch<SupportResponse[]>(`/supports/zone/${zoneId}`, o),
  get: (id: number, o: CallOptions = {}) => apiFetch<SupportResponse>(`/supports/${id}`, o),
  create: (body: SupportRequest, o: CallOptions = {}) =>
    apiFetch<SupportResponse>("/supports", { method: "POST", body, ...o }),
  update: (id: number, body: SupportRequest, o: CallOptions = {}) =>
    apiFetch<SupportResponse>(`/supports/${id}`, { method: "PUT", body, ...o }),
  /**
   * Booked periods (TEMPORAIRE/CONFIRMEE) overlapping [from, to], sorted by startDate.
   * Backend defaults: today → today + 90. 404 if the support is unknown.
   */
  availability: (id: number, q: SupportAvailabilityQuery = {}, o: CallOptions = {}) =>
    apiFetch<SupportAvailabilitySlot[]>(`/supports/${id}/availability`, {
      query: { from: q.from, to: q.to },
      ...o,
    }),
};

// ---------------------------------------------------------------------------
// Reservations — no cancel/update endpoint
// ---------------------------------------------------------------------------
export const reservationsApi = {
  /** ADMINISTRATEUR, SUPERVISEUR */
  all: (o: CallOptions = {}) => apiFetch<ReservationResponse[]>("/reservations", o),
  byCampaign: (campaignId: number, o: CallOptions = {}) =>
    apiFetch<ReservationResponse[]>(`/reservations/campaign/${campaignId}`, o),
  /** Send the SUPPORT's own zoneId. Times "HH:mm:ss". */
  create: (body: ReservationRequest, o: CallOptions = {}) =>
    apiFetch<ReservationResponse>("/reservations", { method: "POST", body, ...o }),
};

// ---------------------------------------------------------------------------
// Statistics — platform-wide: back-office only, never for an ANNONCEUR
// ---------------------------------------------------------------------------
export const statisticsApi = {
  dashboard: (o: CallOptions = {}) => apiFetch<DashboardResponse>("/statistics/dashboard", o),
};

// ---------------------------------------------------------------------------
// Emergency (priority public-interest messages)
// ---------------------------------------------------------------------------
export const emergencyApi = {
  all: (o: CallOptions = {}) => apiFetch<EmergencyResponse[]>("/emergency", o),
  create: (body: EmergencyRequest, o: CallOptions = {}) =>
    apiFetch<EmergencyResponse>("/emergency", { method: "POST", body, ...o }),
  deactivate: (id: number, o: CallOptions = {}) =>
    apiFetch<EmergencyResponse>(`/emergency/${id}/deactivate`, { method: "POST", ...o }),
};

// ---------------------------------------------------------------------------
// Diffusion (player) — every call writes a diffusion log: only from /ecran
// ---------------------------------------------------------------------------
export const diffusionApi = {
  next: async (q: DiffusionQuery, o: CallOptions = {}) =>
    normalizeDiffusion(
      await apiFetch<DiffusionResponse>("/diffusion/next", {
        query: { supportId: q.supportId, datetime: q.datetime, zone: q.zone },
        ...o,
      }),
    ),
};
