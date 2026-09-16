/**
 * Mocked TPUB backend for Playwright: intercepts every same-origin `/api/**` call made by the
 * browser (bridge + session + contact routes) and answers from an in-memory demo dataset that
 * mutates on POST/PUT/DELETE like Spring would (contract §5–§6).
 *
 * The Next middleware and the /espace + /admin layouts read the httpOnly cookies server-side,
 * so the session helpers write real cookies into the browser context (same format as
 * src/lib/session-cookie.ts: JWT-shaped token with a future `exp`, base64url JSON user).
 */
import type { BrowserContext, Page, Request, Route } from "@playwright/test";

import type {
  AiReportResponse,
  CampaignRequest,
  CampaignResponse,
  EmergencyRequest,
  EmergencyResponse,
  RegisterRequest,
  ReservationRequest,
  ReservationResponse,
  SessionUser,
  SupportAvailabilitySlot,
  SupportRequest,
  SupportResponse,
  ZoneRequest,
  ZoneResponse,
} from "../../src/lib/api/types";
import {
  ACCOUNTS,
  createDemoState,
  type DemoAccount,
  type DemoState,
  DIFFUSION_DEFAUT,
  DIFFUSION_PUBLICITE,
  DIFFUSION_URGENCE,
  isoDay,
  sessionUserOf,
} from "./demo-data";

export const TOKEN_COOKIE = "tpub_token";
export const USER_COOKIE = "tpub_user";

// ---------------------------------------------------------------------------
// Session cookies
// ---------------------------------------------------------------------------
function base64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

/** Unsigned JWT-shaped string (header.payload.signature) — the frontend never verifies it. */
export function fakeJwt(user: SessionUser): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({ sub: user.email, role: user.role, iat: user.exp - 86_400, exp: user.exp }),
  );
  return `${header}.${payload}.${base64Url("e2e-demo-signature")}`;
}

export async function setSessionCookies(
  context: BrowserContext,
  user: SessionUser,
  baseURL: string,
): Promise<void> {
  const common = {
    url: baseURL,
    httpOnly: true,
    sameSite: "Lax" as const,
    expires: user.exp,
  };
  await context.addCookies([
    { ...common, name: TOKEN_COOKIE, value: fakeJwt(user) },
    { ...common, name: USER_COOKIE, value: base64Url(JSON.stringify(user)) },
  ]);
}

export async function clearSessionCookies(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: TOKEN_COOKIE });
  await context.clearCookies({ name: USER_COOKIE });
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify(body),
  });
}

function empty(route: Route, status = 204): Promise<void> {
  return route.fulfill({ status, body: "" });
}

function springError(route: Route, status: number, message: string): Promise<void> {
  return json(route, status, { timestamp: new Date().toISOString(), status, message });
}

function bodyOf<T>(request: Request): T {
  try {
    return (request.postDataJSON() ?? {}) as T;
  } catch {
    return {} as T;
  }
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function nextId(items: readonly { id: number }[]): number {
  return items.reduce((m, x) => Math.max(m, x.id), 0) + 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function validationError(route: Route, errors: Record<string, string>): Promise<void> {
  return json(route, 400, {
    timestamp: new Date().toISOString(),
    status: 400,
    message: "Validation failed",
    errors,
  });
}

/** Bean Validation of the Porteur fields (SupportRequest, contract §5.6). */
function porteurFieldError(body: SupportRequest): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (body.porteurType != null && !/^[ABCD]$/.test(body.porteurType)) {
    errors.porteurType = 'must match "^[ABCD]$"';
  }
  if (body.mastHeightM != null && ![15, 20, 25, 30].includes(body.mastHeightM)) {
    errors.mastHeightM = "must be one of 15, 20, 25, 30";
  }
  if (body.headingDeg != null && (body.headingDeg < 0 || body.headingDeg > 359)) {
    errors.headingDeg =
      body.headingDeg < 0
        ? "must be greater than or equal to 0"
        : "must be less than or equal to 359";
  }
  if (body.address != null && body.address.length > 255) {
    errors.address = "size must be between 0 and 255";
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/** Backend update rule: null/omitted = unchanged; a blank address clears it (trimmed otherwise). */
function applyPorteurFields(support: SupportResponse, body: SupportRequest): void {
  if (body.porteurType != null) support.porteurType = body.porteurType;
  if (body.mastHeightM != null) support.mastHeightM = body.mastHeightM;
  if (body.headingDeg != null) support.headingDeg = body.headingDeg;
  if (body.address != null)
    support.address = body.address.trim() === "" ? null : body.address.trim();
}

// ---------------------------------------------------------------------------
// Mock installation
// ---------------------------------------------------------------------------
export interface MockApiOptions {
  /** Base URL used when the login/register routes write cookies. */
  baseURL: string;
  /** Logged-in account (cookies must be set separately with `loginAs`). */
  user?: SessionUser | null;
  /** What /diffusion/next returns. */
  diffusion?: "publicite" | "urgence" | "defaut";
  /** Artificial latency of POST /ai/check-content (ms) to exercise the analysis state. */
  aiDelayMs?: number;
}

export interface MockApi {
  state: DemoState;
  /** Paths (METHOD /api/…) that no handler matched — should stay empty. */
  unhandled: string[];
  /** Every call received, in order (METHOD /api/…?query). */
  calls: string[];
}

export async function mockApi(page: Page, options: MockApiOptions): Promise<MockApi> {
  const state = createDemoState();
  state.user = options.user ?? null;
  state.diffusion = options.diffusion ?? "publicite";
  const accounts: DemoAccount[] = [...ACCOUNTS];
  const api: MockApi = { state, unhandled: [], calls: [] };
  const aiDelay = options.aiDelayMs ?? 400;

  const supportView = (s: SupportResponse): SupportResponse => ({
    ...s,
    zoneName: state.zones.find((z) => z.id === s.zoneId)?.name ?? s.zoneName,
  });

  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname.replace(/\/+$/, "");
    const seg = path.split("/").filter(Boolean).slice(1); // after "api"
    api.calls.push(`${method} ${path}${url.search}`);
    const user = state.user;
    const role = user?.role ?? null;
    const isStaff = role !== null && role !== "ANNONCEUR";

    // ---- Session (Next route handlers)
    if (seg[0] === "session") {
      if (seg.length === 1 && method === "GET") {
        return user
          ? json(route, 200, { user })
          : json(route, 401, { status: 401, message: "Vous n'êtes pas connecté." });
      }
      if (seg[1] === "login" && method === "POST") {
        const body = bodyOf<{ email?: string; password?: string }>(request);
        const account = accounts.find(
          (a) => a.email.toLowerCase() === String(body.email ?? "").toLowerCase(),
        );
        if (!account || account.password !== body.password) {
          return springError(route, 401, "Invalid email or password");
        }
        const sessionUser = sessionUserOf(account);
        state.user = sessionUser;
        await setSessionCookies(page.context(), sessionUser, options.baseURL);
        return json(route, 200, { user: sessionUser });
      }
      if (seg[1] === "register" && method === "POST") {
        const body = bodyOf<RegisterRequest>(request);
        if (accounts.some((a) => a.email.toLowerCase() === body.email?.toLowerCase())) {
          return springError(route, 400, "Email already registered");
        }
        const account: DemoAccount = {
          email: body.email,
          password: body.password,
          nom: body.nom,
          role: "ANNONCEUR",
          userId: 100 + accounts.length,
        };
        accounts.push(account);
        const sessionUser = sessionUserOf(account);
        state.user = sessionUser;
        await setSessionCookies(page.context(), sessionUser, options.baseURL);
        return json(route, 201, { user: sessionUser });
      }
      if (seg[1] === "logout" && method === "POST") {
        state.user = null;
        await clearSessionCookies(page.context());
        return json(route, 200, { ok: true });
      }
    }

    // ---- Contact (Next route handler): accept without writing to disk
    if (seg[0] === "contact" && method === "POST") {
      return json(route, 201, { ok: true, id: `e2e-${Date.now()}` });
    }

    // ---- Diffusion (public)
    if (seg[0] === "diffusion" && seg[1] === "next" && method === "GET") {
      const supportId = Number(url.searchParams.get("supportId"));
      if (!url.searchParams.get("datetime") || !Number.isFinite(supportId)) {
        return springError(route, 500, "An unexpected error occurred");
      }
      const support = state.supports.find((s) => s.id === supportId);
      if (!support) return springError(route, 404, `Support not found: ${supportId}`);
      state.diffusionLogCount += 1;
      const zone = state.zones.find((z) => z.id === support.zoneId)?.name ?? support.zoneName;
      const base =
        state.diffusion === "urgence"
          ? DIFFUSION_URGENCE
          : state.diffusion === "defaut"
            ? DIFFUSION_DEFAUT
            : DIFFUSION_PUBLICITE;
      return json(route, 200, { ...base, zone });
    }

    // Everything below requires a session (Spring: empty 403 → bridge answers 401).
    if (!user) return json(route, 401, { status: 401, message: "Session expirée" });

    const findCampaign = (id: number) => state.campaigns.find((c) => c.id === id);
    const editable = (c: CampaignResponse) =>
      c.status === "BROUILLON" || c.status === "REJECTED_BY_AI";

    // ---- Campaigns
    if (seg[0] === "campaigns") {
      if (seg.length === 1 && method === "GET") {
        if (!isStaff) return springError(route, 403, "Access denied");
        return json(route, 200, state.campaigns);
      }
      if (seg.length === 1 && method === "POST") {
        if (role !== "ANNONCEUR") return springError(route, 403, "Access denied");
        const body = bodyOf<CampaignRequest>(request);
        if (!body.name?.trim()) {
          return json(route, 400, {
            timestamp: new Date().toISOString(),
            status: 400,
            message: "Validation failed",
            errors: { name: "must not be blank" },
          });
        }
        const created: CampaignResponse = {
          id: nextId(state.campaigns),
          clientId: 7,
          name: body.name,
          objective: body.objective ?? null,
          budget: Number(body.budget ?? 0),
          consumedBudget: 0,
          status: "BROUILLON",
          aiStatus: null,
          adminStatus: null,
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          startTime: body.startTime ?? null,
          endTime: body.endTime ?? null,
          estimatedViews: 0,
          priorityScore: 0,
          createdAt: new Date().toISOString(),
          submittedAt: null,
          validatedAt: null,
        };
        state.campaigns.push(created);
        return json(route, 201, created);
      }
      if (seg[1] === "mine" && method === "GET") {
        if (role !== "ANNONCEUR") return springError(route, 403, "Access denied");
        return json(
          route,
          200,
          state.campaigns.filter((c) => c.clientId === 7),
        );
      }
      const id = Number(seg[1]);
      const c = findCampaign(id);
      if (!Number.isFinite(id)) return springError(route, 500, "An unexpected error occurred");
      if (!c) return springError(route, 404, `Campaign not found: ${id}`);
      if (seg.length === 2 && method === "GET") return json(route, 200, c);
      if (seg.length === 2 && method === "PUT") {
        if (!editable(c)) {
          return springError(route, 400, `Campaign cannot be modified in status: ${c.status}`);
        }
        const body = bodyOf<CampaignRequest>(request);
        Object.assign(c, {
          name: body.name,
          objective: body.objective ?? null,
          budget: Number(body.budget ?? 0),
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          startTime: body.startTime ?? null,
          endTime: body.endTime ?? null,
        });
        return json(route, 200, c);
      }
      if (seg.length === 2 && method === "DELETE") {
        if (!editable(c)) {
          return springError(route, 400, `Campaign cannot be modified in status: ${c.status}`);
        }
        state.campaigns = state.campaigns.filter((x) => x.id !== id);
        state.reservations = state.reservations.filter((r) => r.campaignId !== id);
        state.aiReports = state.aiReports.filter((r) => r.campaignId !== id);
        return empty(route);
      }
      if (seg[2] === "submit" && method === "POST") {
        if (c.status !== "BROUILLON") {
          return springError(route, 400, "Only draft campaigns can be submitted");
        }
        c.status = "PENDING_AI_CHECK";
        c.submittedAt = new Date().toISOString();
        return json(route, 200, c);
      }
    }

    // ---- AI moderation
    if (seg[0] === "ai") {
      const id = Number(seg[2]);
      const c = findCampaign(id);
      if (seg[1] === "check-content" && method === "POST") {
        if (!c) return springError(route, 404, `Campaign not found: ${id}`);
        if (c.status !== "PENDING_AI_CHECK" && c.status !== "BROUILLON") {
          return springError(route, 400, "Campaign is not eligible for AI analysis");
        }
        await sleep(aiDelay);
        const text = `${c.name} ${c.objective ?? ""}`.toLowerCase();
        const flagged = text.includes("gratuit") || text.includes("garanti");
        const report: AiReportResponse = flagged
          ? {
              campaignId: id,
              aiStatus: "review_required",
              riskScore: 62,
              qualityScore: 74,
              detectedIssues: ["texte ambigu"],
              recommendation: "Vérification manuelle avant diffusion",
            }
          : {
              campaignId: id,
              aiStatus: "approved",
              riskScore: 20,
              qualityScore: 75,
              detectedIssues: [],
              recommendation: "Contenu conforme pour diffusion",
            };
        state.aiReports = [...state.aiReports.filter((r) => r.campaignId !== id), report];
        c.status = flagged ? "REVIEW_REQUIRED" : "APPROVED_BY_AI";
        c.aiStatus = flagged ? "REVIEW_REQUIRED" : "APPROVED";
        return json(route, 200, report);
      }
      if (seg[1] === "report" && method === "GET") {
        const report = state.aiReports.find((r) => r.campaignId === id);
        return report
          ? json(route, 200, report)
          : springError(route, 400, `No AI report found for campaign: ${id}`);
      }
    }

    // ---- Admin decisions
    if (seg[0] === "admin" && seg[1] === "campaigns" && method === "POST") {
      if (role !== "ADMINISTRATEUR") return springError(route, 403, "Access denied");
      const id = Number(seg[2]);
      const c = findCampaign(id);
      if (!c) return springError(route, 404, `Campaign not found: ${id}`);
      if (c.status !== "APPROVED_BY_AI" && c.status !== "REVIEW_REQUIRED") {
        return springError(route, 400, "Campaign must be AI-analyzed before admin decision");
      }
      if (seg[3] === "validate") {
        c.status = "ACTIVE";
        c.adminStatus = "VALIDATED";
        c.validatedAt = new Date().toISOString();
        for (const r of state.reservations) {
          if (r.campaignId === id) r.reservationStatus = "CONFIRMEE";
        }
        return json(route, 200, c);
      }
      if (seg[3] === "reject") {
        c.status = "BLOCKED";
        c.adminStatus = "REJECTED";
        for (const r of state.reservations) {
          if (r.campaignId === id) r.reservationStatus = "ANNULEE";
        }
        return json(route, 200, { message: "Campaign rejected successfully" });
      }
    }

    // ---- Zones
    if (seg[0] === "zones") {
      if (seg.length === 1 && method === "GET") return json(route, 200, state.zones);
      if (seg[1] === "active" && method === "GET") {
        return json(
          route,
          200,
          state.zones.filter((z) => z.isActive),
        );
      }
      if (seg.length === 1 && method === "POST") {
        if (role !== "ADMINISTRATEUR") return springError(route, 403, "Access denied");
        const body = bodyOf<ZoneRequest>(request);
        const zone: ZoneResponse = {
          id: nextId(state.zones),
          name: body.name,
          latitude: body.latitude,
          longitude: body.longitude,
          radiusKm: body.radiusKm ?? null,
          isActive: body.isActive ?? true,
        };
        state.zones.push(zone);
        return json(route, 201, zone);
      }
      const id = Number(seg[1]);
      const zone = state.zones.find((z) => z.id === id);
      if (!zone) return springError(route, 404, `Zone not found: ${id}`);
      if (method === "GET") return json(route, 200, zone);
      if (role !== "ADMINISTRATEUR") return springError(route, 403, "Access denied");
      if (method === "PUT") {
        const body = bodyOf<ZoneRequest>(request);
        Object.assign(zone, {
          name: body.name,
          latitude: body.latitude,
          longitude: body.longitude,
          radiusKm: body.radiusKm ?? null,
          isActive: body.isActive ?? zone.isActive,
        });
        return json(route, 200, zone);
      }
      if (method === "DELETE") {
        const used =
          state.supports.some((s) => s.zoneId === id) ||
          state.reservations.some((r) => r.zoneId === id);
        if (used) return springError(route, 400, "Invalid data — check dates and times format");
        state.zones = state.zones.filter((z) => z.id !== id);
        return empty(route);
      }
    }

    // ---- Supports
    if (seg[0] === "supports") {
      if (seg.length === 1 && method === "GET") {
        return json(route, 200, state.supports.map(supportView));
      }
      if (seg[1] === "zone" && method === "GET") {
        const zoneId = Number(seg[2]);
        return json(route, 200, state.supports.filter((s) => s.zoneId === zoneId).map(supportView));
      }
      if (seg.length === 1 && method === "POST") {
        if (role !== "ADMINISTRATEUR") return springError(route, 403, "Access denied");
        const body = bodyOf<SupportRequest>(request);
        if (!state.zones.some((z) => z.id === body.zoneId)) {
          return springError(route, 404, `Zone not found: ${body.zoneId}`);
        }
        const support: SupportResponse = supportView({
          id: nextId(state.supports),
          zoneId: body.zoneId,
          zoneName: "",
          name: body.name,
          supportType: body.supportType,
          latitude: body.latitude,
          longitude: body.longitude,
          technicalStatus: body.technicalStatus ?? "ACTIF",
          diffusionCapacity: body.diffusionCapacity ?? 1,
          porteurType: null,
          mastHeightM: null,
          headingDeg: null,
          address: null,
        });
        const invalid = porteurFieldError(body);
        if (invalid) return validationError(route, invalid);
        applyPorteurFields(support, body);
        state.supports.push(support);
        return json(route, 201, support);
      }
      const id = Number(seg[1]);
      if (!Number.isInteger(id)) {
        return springError(route, 400, "Invalid value for parameter: id");
      }
      const support = state.supports.find((s) => s.id === id);
      if (!support) return springError(route, 404, `Support not found: ${id}`);

      // GET /supports/{id}/availability?from&to — booked periods only (spec §1).
      if (seg[2] === "availability" && method === "GET") {
        const from = url.searchParams.get("from") ?? isoDay(0);
        const to = url.searchParams.get("to") ?? addDays(from, 90);
        if (!ISO_DATE.test(from))
          return springError(route, 400, "Invalid value for parameter: from");
        if (!ISO_DATE.test(to)) return springError(route, 400, "Invalid value for parameter: to");
        if (to < from) return springError(route, 400, "'to' must be on or after 'from'");
        const slots: SupportAvailabilitySlot[] = state.reservations
          .filter(
            (r) =>
              r.supportId === id &&
              (r.reservationStatus === "TEMPORAIRE" || r.reservationStatus === "CONFIRMEE") &&
              overlaps(r.startDate, r.endDate, from, to),
          )
          .sort(
            (a, b) =>
              a.startDate.localeCompare(b.startDate) ||
              a.endDate.localeCompare(b.endDate) ||
              a.startTime.localeCompare(b.startTime),
          )
          .map((r) => ({
            startDate: r.startDate,
            endDate: r.endDate,
            startTime: r.startTime,
            endTime: r.endTime,
            reservationStatus: r.reservationStatus as SupportAvailabilitySlot["reservationStatus"],
          }));
        return json(route, 200, slots);
      }

      if (seg.length === 2 && method === "GET") return json(route, 200, supportView(support));
      if (seg.length === 2 && method === "PUT") {
        if (role !== "ADMINISTRATEUR") return springError(route, 403, "Access denied");
        const body = bodyOf<SupportRequest>(request);
        const invalid = porteurFieldError(body);
        if (invalid) return validationError(route, invalid);
        Object.assign(support, {
          zoneId: body.zoneId,
          name: body.name,
          supportType: body.supportType,
          latitude: body.latitude,
          longitude: body.longitude,
          technicalStatus: body.technicalStatus ?? support.technicalStatus,
          diffusionCapacity: body.diffusionCapacity ?? support.diffusionCapacity,
        });
        applyPorteurFields(support, body);
        return json(route, 200, supportView(support));
      }
    }

    // ---- Reservations
    if (seg[0] === "reservations") {
      if (seg.length === 1 && method === "GET") {
        if (!isStaff) return springError(route, 403, "Access denied");
        return json(route, 200, state.reservations);
      }
      if (seg[1] === "campaign" && method === "GET") {
        const id = Number(seg[2]);
        return json(
          route,
          200,
          state.reservations.filter((r) => r.campaignId === id),
        );
      }
      if (seg.length === 1 && method === "POST") {
        if (role !== "ANNONCEUR") return springError(route, 403, "Access denied");
        const body = bodyOf<ReservationRequest>(request);
        const c = findCampaign(body.campaignId);
        if (!c) return springError(route, 404, `Campaign not found: ${body.campaignId}`);
        if (!state.zones.some((z) => z.id === body.zoneId)) {
          return springError(route, 404, `Zone not found: ${body.zoneId}`);
        }
        if (!state.supports.some((s) => s.id === body.supportId)) {
          return springError(route, 404, `Support not found: ${body.supportId}`);
        }
        if (body.startDate > body.endDate || body.startTime >= body.endTime) {
          return springError(route, 400, "Invalid data — check dates and times format");
        }
        const conflict = state.reservations.some(
          (r) =>
            r.supportId === body.supportId &&
            (r.reservationStatus === "TEMPORAIRE" || r.reservationStatus === "CONFIRMEE") &&
            overlaps(r.startDate, r.endDate, body.startDate, body.endDate),
        );
        if (conflict) {
          return springError(route, 400, "Support already reserved for the selected period");
        }
        const created: ReservationResponse = {
          id: nextId(state.reservations),
          campaignId: body.campaignId,
          zoneId: body.zoneId,
          supportId: body.supportId,
          startDate: body.startDate,
          endDate: body.endDate,
          startTime: body.startTime.length === 5 ? `${body.startTime}:00` : body.startTime,
          endTime: body.endTime.length === 5 ? `${body.endTime}:00` : body.endTime,
          availabilityStatus: "RESERVE",
          reservationStatus: "TEMPORAIRE",
          estimatedViews: 1000,
          estimatedCost: Math.round(c.budget * 0.1 * 100) / 100,
        };
        state.reservations.push(created);
        c.estimatedViews += 1000;
        return json(route, 201, created);
      }
    }

    // ---- Statistics (platform-wide)
    if (seg[0] === "statistics" && seg[1] === "dashboard" && method === "GET") {
      const cs = state.campaigns;
      return json(route, 200, {
        totalCampaigns: cs.length,
        activeCampaigns: cs.filter((c) => c.status === "ACTIVE").length,
        pendingCampaigns: cs.filter(
          (c) => c.status === "PENDING_AI_CHECK" || c.status === "REVIEW_REQUIRED",
        ).length,
        aiPendingCampaigns: cs.filter((c) => c.status === "PENDING_AI_CHECK").length,
        aiRejectedCampaigns: cs.filter((c) => c.status === "REJECTED_BY_AI").length,
        availableSupports: state.supports.filter((s) => s.technicalStatus === "ACTIF").length,
        confirmedReservations: state.reservations.filter((r) => r.reservationStatus === "CONFIRMEE")
          .length,
        totalViews: state.diffusionLogCount,
        estimatedBudget: cs.reduce((sum, c) => sum + c.budget, 0),
        consumedBudget: 0,
      });
    }

    // ---- Emergency messages
    if (seg[0] === "emergency") {
      if (!isStaff) return springError(route, 403, "Access denied");
      if (seg.length === 1 && method === "GET") return json(route, 200, state.emergencies);
      if (seg.length === 1 && method === "POST") {
        if (role !== "ADMINISTRATEUR") return springError(route, 403, "Access denied");
        const body = bodyOf<EmergencyRequest>(request);
        if (!state.zones.some((z) => z.id === body.zoneId)) {
          return springError(route, 404, `Zone not found: ${body.zoneId}`);
        }
        const created: EmergencyResponse = {
          id: nextId(state.emergencies),
          title: body.title,
          content: body.content,
          zoneId: body.zoneId,
          startDate: body.startDate,
          endDate: body.endDate,
          startTime: body.startTime ?? null,
          endTime: body.endTime ?? null,
          priority: body.priority ?? 1,
          urgencyLevel: body.urgencyLevel ?? "HIGH",
          isActive: true,
        };
        state.emergencies.push(created);
        return json(route, 201, created);
      }
      if (seg[2] === "deactivate" && method === "POST") {
        if (role !== "ADMINISTRATEUR") return springError(route, 403, "Access denied");
        const id = Number(seg[1]);
        const e = state.emergencies.find((x) => x.id === id);
        if (!e) return springError(route, 404, `Emergency message not found: ${id}`);
        e.isActive = false;
        return json(route, 200, e);
      }
    }

    api.unhandled.push(`${method} ${path}`);
    return springError(route, 500, "An unexpected error occurred");
  };

  await page.route(
    (u) => u.pathname === "/api" || u.pathname.startsWith("/api/"),
    (route) => handler(route),
  );
  return api;
}

/** Writes the session cookies for `account` and returns the matching session user. */
export async function loginAs(
  page: Page,
  account: DemoAccount,
  baseURL: string,
): Promise<SessionUser> {
  const user = sessionUserOf(account);
  await setSessionCookies(page.context(), user, baseURL);
  return user;
}
