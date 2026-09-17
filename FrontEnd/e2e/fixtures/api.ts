/**
 * Mocked TPUB backend for Playwright: intercepts every same-origin `/api/**` call made by the
 * browser (bridge + session + contact routes) and `/uploads/**` media, and answers from an
 * in-memory demo dataset that mutates on POST/PUT/DELETE like the v2 Spring backend would
 * (docs/completion-contract.md §2: codes, pages, lifecycle, availability, estimates…).
 *
 * Compatibility with the pre-v2 screens (kept until they migrate):
 * - POST /reservations on a campaign without zones creates a circle around the Porteur's zone
 *   instead of answering 400 CAMPAIGN_ZONE_REQUIRED;
 * - POST /ai/check-content by the owner on a campaign already analysed by /submit returns the
 *   stored report instead of 409 (the old wizard chains submit + check-content).
 *
 * The Next middleware and the /espace + /admin layouts read the httpOnly cookies server-side,
 * so the session helpers write real cookies into the browser context (same format as
 * src/lib/session-cookie.ts: JWT-shaped token with a future `exp`, base64url JSON user).
 */
import type { BrowserContext, Page, Request, Route } from "@playwright/test";

import type {
  AdminUserResponse,
  AiIssue,
  AiReportResponse,
  AiRuleRequest,
  AlternativeSlot,
  AvailabilityStatus,
  CampaignRequest,
  CampaignResponse,
  CampaignStatus,
  CampaignZoneRequest,
  CampaignZoneResponse,
  DiffusionContentType,
  DiffusionLogResponse,
  DiffusionResponse,
  EmergencyRequest,
  EmergencyResponse,
  MediaFileResponse,
  RegisterRequest,
  ReservationConflict,
  ReservationResponse,
  RoleCode,
  SessionUser,
  SlotPreset,
  SupportAvailabilityItem,
  SupportAvailabilitySlot,
  SupportBlockRequest,
  SupportRequest,
  SupportResponse,
  ZoneRecommendation,
  ZoneRequest,
  ZoneResponse,
} from "../../src/lib/api/types";
import {
  ACCOUNTS,
  ALL_CAMPAIGN_STATUSES,
  aiReport,
  createDemoState,
  daysInclusive,
  DEMO_CLIENT_ID,
  type DemoAccount,
  type DemoState,
  DIFFUSION_DEFAUT,
  DIFFUSION_PUBLICITE,
  DIFFUSION_URGENCE,
  demoLoginHistory,
  emergencyState,
  estimateFor,
  hoursPerDay,
  isoDay,
  sessionUserOf,
  unitCost,
  type Window,
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
    JSON.stringify({
      sub: user.email,
      role: user.role,
      sid: `e2e-${user.userId}`,
      iat: user.exp - 86_400,
      exp: user.exp,
    }),
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

/** v2 error body (contract §2.0): French message + stable code. */
function apiError(
  route: Route,
  status: number,
  code: string,
  message: string,
  errors?: Record<string, string>,
): Promise<void> {
  return json(route, status, {
    timestamp: new Date().toISOString(),
    status,
    code,
    message,
    path: new URL(route.request().url()).pathname,
    ...(errors ? { errors } : {}),
  });
}

const denied = (route: Route) =>
  apiError(route, 403, "ACCESS_DENIED", "Vous n'avez pas accès à cette ressource.");

function bodyOf<T>(request: Request): T {
  try {
    return (request.postDataJSON() ?? {}) as T;
  } catch {
    return {} as T;
  }
}

function nextId(items: readonly { id: number }[]): number {
  return items.reduce((m, x) => Math.max(m, x.id), 0) + 1;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "HH:mm" → "HH:mm:ss"; invalid → null. */
function apiTime(value: string | null | undefined): string | null {
  if (!value || !TIME.test(value)) return null;
  return value.length === 5 ? `${value}:00` : value;
}

function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function windowsOverlap(a: Window, b: Window): boolean {
  return (
    datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate) &&
    a.startTime < b.endTime &&
    b.startTime < a.endTime
  );
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371.0088;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function listParam(url: URL, name: string): string[] | null {
  const raw = url.searchParams.get(name);
  if (!raw) return null;
  const values = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length > 0 ? values : null;
}

function numParam(url: URL, name: string): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function paginate<T>(items: T[], url: URL) {
  const size = Math.min(100, Math.max(1, numParam(url, "size") ?? 20));
  const page = Math.max(0, numParam(url, "page") ?? 0);
  return {
    items: items.slice(page * size, page * size + size),
    page,
    size,
    totalItems: items.length,
    totalPages: Math.ceil(items.length / size),
  };
}

function byCreatedDesc<T extends { createdAt?: string }>(a: T, b: T): number {
  const x = a.createdAt ?? "";
  const y = b.createdAt ?? "";
  return x < y ? 1 : x > y ? -1 : 0;
}

function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Bean Validation of the Porteur fields (SupportRequest). */
function porteurFieldError(body: SupportRequest): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (body.porteurType != null && !/^[ABCD]$/.test(body.porteurType)) {
    errors.porteurType = "Type de Porteur invalide.";
  }
  if (body.mastHeightM != null && ![15, 20, 25, 30].includes(body.mastHeightM)) {
    errors.mastHeightM = "Hauteur invalide.";
  }
  if (body.headingDeg != null && (body.headingDeg < 0 || body.headingDeg > 359)) {
    errors.headingDeg = "Doit être compris entre 0 et 359.";
  }
  if (body.address != null && body.address.length > 255) {
    errors.address = "Doit contenir entre 0 et 255 caractères.";
  }
  if (body.visibilityScore != null && (body.visibilityScore < 0 || body.visibilityScore > 100)) {
    errors.visibilityScore = "Doit être compris entre 0 et 100.";
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

/** Backend update rule: null/omitted = unchanged; a blank address clears it (trimmed otherwise). */
function applyPorteurFields(support: SupportResponse, body: SupportRequest): void {
  if (body.porteurType != null) support.porteurType = body.porteurType;
  if (body.mastHeightM != null) support.mastHeightM = body.mastHeightM;
  if (body.headingDeg != null) support.headingDeg = body.headingDeg;
  if (body.visibilityScore !== undefined) support.visibilityScore = body.visibilityScore;
  if (body.address != null)
    support.address = body.address.trim() === "" ? null : body.address.trim();
}

/** Minimal multipart/form-data reader (media and logo uploads). */
function readMultipart(request: Request): {
  fields: Record<string, string>;
  file: { name: string; type: string; size: number } | null;
} {
  const type = request.headers()["content-type"] ?? "";
  const boundary = /boundary=("?)([^";]+)\1/i.exec(type)?.[2];
  const buffer = request.postDataBuffer();
  const out = {
    fields: {} as Record<string, string>,
    file: null as null | { name: string; type: string; size: number },
  };
  if (!boundary || !buffer) return out;
  const raw = buffer.toString("latin1");
  for (const part of raw.split(`--${boundary}`)) {
    const sep = part.indexOf("\r\n\r\n");
    if (sep < 0) continue;
    const head = part.slice(0, sep);
    const content = part.slice(sep + 4).replace(/\r\n$/, "");
    const name = /name="([^"]*)"/i.exec(head)?.[1];
    if (!name) continue;
    const filename = /filename="([^"]*)"/i.exec(head)?.[1];
    if (filename !== undefined) {
      out.file = {
        name: Buffer.from(filename, "latin1").toString("utf8"),
        type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? "application/octet-stream",
        size: content.length,
      };
    } else {
      out.fields[name] = Buffer.from(content, "latin1").toString("utf8");
    }
  }
  return out;
}

/** 1×1 transparent PNG served for every mocked /uploads/** image. */
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const SLOT_PRESETS: { preset: SlotPreset; startTime: string; endTime: string }[] = [
  { preset: "MATIN", startTime: "07:00:00", endTime: "12:00:00" },
  { preset: "APRES_MIDI", startTime: "12:00:00", endTime: "18:00:00" },
  { preset: "SOIR", startTime: "18:00:00", endTime: "23:00:00" },
  { preset: "JOURNEE", startTime: "07:00:00", endTime: "23:00:00" },
];

const STAFF: readonly RoleCode[] = ["ADMINISTRATEUR", "SUPERVISEUR", "OPERATEUR"];

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
  /** Artificial latency of the AI analysis (submit / check-content), in ms. */
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
  const today = () => isoDay(0);

  // -------------------------------------------------------------------------
  // Derived views
  // -------------------------------------------------------------------------
  const zoneOf = (id: number) => state.zones.find((z) => z.id === id);
  const supportOf = (id: number) => state.supports.find((s) => s.id === id);
  const findCampaign = (id: number) => state.campaigns.find((c) => c.id === id);

  const supportView = (s: SupportResponse): SupportResponse => ({
    ...s,
    zoneName: zoneOf(s.zoneId)?.name ?? s.zoneName,
  });

  const holding = (r: ReservationResponse) =>
    r.reservationStatus === "TEMPORAIRE" || r.reservationStatus === "CONFIRMEE";

  const insideCircles = (s: SupportResponse, circles: readonly CampaignZoneResponse[]) =>
    circles.some((z) => distanceKm(s.latitude, s.longitude, z.latitude, z.longitude) <= z.radiusKm);

  function refreshCampaign(c: CampaignResponse): CampaignResponse {
    const reservations = state.reservations.filter((r) => r.campaignId === c.id && holding(r));
    const media = state.media
      .filter((m) => m.campaignId === c.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const zones = (c.zones ?? []).map((z) => ({
      ...z,
      supportsInside: state.supports.filter((s) => insideCircles(s, [z])).length,
    }));
    const estimatedCost =
      Math.round(reservations.reduce((sum, r) => sum + r.estimatedCost, 0) * 100) / 100;
    const reopenable = c.status === "REJECTED_BY_AI" || c.status === "BLOCKED";
    Object.assign(c, {
      zones,
      reservationsCount: reservations.length,
      estimatedViews: reservations.reduce((sum, r) => sum + r.estimatedViews, 0),
      estimatedCost,
      remainingBudget: Math.round((c.budget - (c.consumedBudget ?? 0)) * 100) / 100,
      mediaCount: media.length,
      mediaUrl: media[0]?.url ?? null,
      mediaType: media[0]?.fileType ?? null,
      editable: c.status === "BROUILLON" || reopenable,
      submittable: c.status === "BROUILLON",
      deletable: c.status === "BROUILLON" || reopenable,
    } satisfies Partial<CampaignResponse>);
    return c;
  }

  const campaignView = (c: CampaignResponse) => refreshCampaign(c);

  const reservationView = (r: ReservationResponse, role: RoleCode | null): ReservationResponse => {
    const c = findCampaign(r.campaignId);
    const s = supportOf(r.supportId);
    const campaignStatus = c?.status ?? r.campaignStatus ?? "BROUILLON";
    const cancellable =
      role === "ADMINISTRATEUR"
        ? holding(r)
        : role === "ANNONCEUR" &&
          r.reservationStatus === "TEMPORAIRE" &&
          (campaignStatus === "BROUILLON" || campaignStatus === "REJECTED_BY_AI");
    return Object.assign(r, {
      campaignName: c?.name ?? r.campaignName,
      campaignStatus,
      clientCompanyName: c?.clientCompanyName ?? null,
      supportName: s?.name ?? r.supportName,
      supportType: s?.supportType ?? r.supportType,
      zoneName: zoneOf(r.zoneId)?.name ?? r.zoneName,
      cancellable,
    });
  };

  // -------------------------------------------------------------------------
  // Availability (contract §2.7)
  // -------------------------------------------------------------------------
  function blocksOf(supportId: number, w: Window) {
    return state.supportBlocks.filter(
      (b) =>
        b.supportId === supportId &&
        b.date >= w.startDate &&
        b.date <= w.endDate &&
        b.startTime < w.endTime &&
        w.startTime < b.endTime,
    );
  }

  function availabilityOf(
    s: SupportResponse,
    w: Window,
    campaignId: number | null,
  ): {
    status: AvailabilityStatus;
    remainingCapacity: number;
    conflicts: SupportAvailabilitySlot[];
  } {
    const blocks = blocksOf(s.id, w);
    const others = state.reservations.filter(
      (r) =>
        r.supportId === s.id && holding(r) && r.campaignId !== campaignId && windowsOverlap(r, w),
    );
    const conflicts: SupportAvailabilitySlot[] = [
      ...others.map((r) => ({
        startDate: r.startDate,
        endDate: r.endDate,
        startTime: r.startTime,
        endTime: r.endTime,
        kind: "RESERVATION" as const,
        reservationStatus: r.reservationStatus as "TEMPORAIRE" | "CONFIRMEE",
        availabilityStatus: r.availabilityStatus,
        reason: null,
      })),
      ...blocks.map((b) => ({
        startDate: b.date,
        endDate: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        kind: "BLOCAGE" as const,
        reservationStatus: null,
        availabilityStatus: b.availabilityStatus,
        reason: b.reason,
      })),
    ];
    const capacity = Math.max(1, s.diffusionCapacity);
    const remainingCapacity = Math.max(0, capacity - others.length);
    let status: AvailabilityStatus = "DISPONIBLE";
    if (
      s.technicalStatus === "HORS_LIGNE" ||
      s.technicalStatus === "INACTIF" ||
      blocks.some((b) => b.availabilityStatus === "HORS_LIGNE")
    ) {
      status = "HORS_LIGNE";
    } else if (
      s.technicalStatus === "MAINTENANCE" ||
      blocks.some((b) => b.availabilityStatus === "MAINTENANCE")
    ) {
      status = "MAINTENANCE";
    } else if (
      blocks.some((b) => b.availabilityStatus === "OCCUPE") ||
      (others.length >= capacity && others.some((r) => r.reservationStatus === "CONFIRMEE"))
    ) {
      status = "OCCUPE";
    } else if (others.length >= capacity) {
      status = "RESERVE";
    }
    return { status, remainingCapacity, conflicts };
  }

  function windowFromUrl(url: URL): Window | null {
    const startDate = url.searchParams.get("startDate") ?? "";
    const endDate = url.searchParams.get("endDate") ?? "";
    const startTime = apiTime(url.searchParams.get("startTime"));
    const endTime = apiTime(url.searchParams.get("endTime"));
    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate) || !startTime || !endTime) return null;
    return { startDate, endDate, startTime, endTime };
  }

  function summarize(items: SupportAvailabilityItem[]) {
    const count = (st: AvailabilityStatus) => items.filter((i) => i.status === st).length;
    const available = items.filter((i) => i.status === "DISPONIBLE");
    return {
      totalSupports: items.length,
      availableSupports: available.length,
      reservedSupports: count("RESERVE"),
      occupiedSupports: count("OCCUPE"),
      maintenanceSupports: count("MAINTENANCE"),
      offlineSupports: count("HORS_LIGNE"),
      estimatedViewsAvailable: available.reduce((sum, i) => sum + i.estimatedViews, 0),
      estimatedCostAvailable:
        Math.round(available.reduce((sum, i) => sum + i.estimatedCost, 0) * 100) / 100,
    };
  }

  function availabilityItems(
    candidates: { support: SupportResponse; distanceKm: number | null }[],
    w: Window,
    campaignId: number | null,
  ): SupportAvailabilityItem[] {
    return candidates
      .map(({ support, distanceKm: d }) => {
        const a = availabilityOf(support, w, campaignId);
        const own = campaignId
          ? state.reservations.find(
              (r) =>
                r.campaignId === campaignId &&
                r.supportId === support.id &&
                holding(r) &&
                windowsOverlap(r, w),
            )
          : undefined;
        return {
          support: { ...supportView(support), distanceKm: d },
          distanceKm: d,
          status: a.status,
          remainingCapacity: a.remainingCapacity,
          reservedByCampaign: Boolean(own),
          campaignReservationId: own?.id ?? null,
          conflicts: a.conflicts,
          ...estimateFor(support, w),
        };
      })
      .sort(
        (a, b) =>
          (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.support.name.localeCompare(b.support.name),
      );
  }

  // -------------------------------------------------------------------------
  // AI analysis (simplified §2.2 pipeline)
  // -------------------------------------------------------------------------
  function analyse(c: CampaignResponse, preview: boolean): AiReportResponse {
    const text = normalizeText(`${c.name}\n${c.objective ?? ""}`);
    const media = state.media.filter((m) => m.campaignId === c.id);
    const issues: AiIssue[] = [];
    const recommendations: string[] = [];
    const matchedRules: AiReportResponse["matchedRules"] = [];
    let risk = 10;
    let quality = 85;
    const severityPoints = { LOW: 10, MEDIUM: 25, HIGH: 45, CRITICAL: 80 } as const;
    let critical = false;
    let high = false;
    const ocrText = media
      .filter((m) => m.fileType !== "VIDEO")
      .map((m) =>
        m.fileName
          .replace(/\.[^.]+$/, "")
          .split(/[-_. ]+/)
          .filter(
            (t) => !/^\d+$/.test(t) && !/^(img|dsc|image|photo|screenshot|whatsapp)$/i.test(t),
          )
          .join(" "),
      )
      .filter((t) => t.replace(/[^a-z]/gi, "").length >= 3)
      .join(" ");
    for (const rule of state.aiRules.filter((r) => r.isActive && r.ruleType === "KEYWORD")) {
      const hit = rule.pattern
        .split(",")
        .map((p) => normalizeText(p.trim()))
        .some(
          (p) => p && new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text),
        );
      if (!hit) continue;
      risk += severityPoints[rule.severity];
      critical ||= rule.severity === "CRITICAL";
      high ||= rule.severity === "HIGH";
      matchedRules.push({ ruleId: rule.id, ruleName: rule.ruleName, severity: rule.severity });
      issues.push({
        label: rule.description ?? rule.ruleName,
        severity: rule.severity,
        source: "REGLE",
      });
    }
    if (!c.objective?.trim()) {
      quality -= 25;
      issues.push({ label: "objectif absent", severity: "LOW", source: "TEXTE" });
      recommendations.push("Décrivez l'objectif de la campagne en une ou deux phrases");
    }
    if (media.length === 0) {
      quality -= 15;
      issues.push({ label: "aucun visuel fourni", severity: "LOW", source: "IMAGE" });
      recommendations.push("Ajoutez un visuel d'au moins 1280×720 px");
    }
    if (c.budget <= 0) {
      risk += 25;
      issues.push({ label: "budget insuffisant", severity: "MEDIUM", source: "TEXTE" });
    }
    risk = Math.max(0, Math.min(100, risk));
    quality = Math.max(0, Math.min(100, quality));
    const status: AiReportResponse["aiStatus"] =
      critical || risk > 70
        ? "rejected"
        : risk >= 31 || high || quality < 40
          ? "review_required"
          : "approved";
    state.seq.check += 1;
    return aiReport({
      campaignId: c.id,
      checkId: state.seq.check,
      aiStatus: status,
      riskScore: risk,
      qualityScore: quality,
      detectedIssues: issues.map((i) => i.label),
      issues,
      recommendations,
      matchedRules,
      recommendation:
        status === "approved"
          ? "Contenu conforme pour diffusion"
          : status === "review_required"
            ? "Vérification manuelle avant diffusion"
            : "Contenu non diffusable en l'état : corrigez les points signalés",
      sector: /sante|depistage|clinique/.test(text) ? "SANTE" : "COMMERCE",
      contentType: media.some((m) => m.fileType === "VIDEO")
        ? "VIDEO"
        : media.length > 0
          ? "IMAGE"
          : "TEXTE",
      extractedText: ocrText || null,
      ocrEngine: ocrText ? "SIMULE" : "AUCUN",
      mediaAnalyses: media.map((m) => ({
        mediaId: m.id,
        fileName: m.fileName,
        contentType: m.fileType === "VIDEO" ? "VIDEO" : "IMAGE",
        widthPx: m.widthPx,
        heightPx: m.heightPx,
        durationSeconds: m.durationSeconds,
        extractedText: null,
        issues: [],
      })),
      preview,
      adminDecision: preview ? null : "PENDING",
      checkedAt: new Date().toISOString(),
    });
  }

  function recordCheck(c: CampaignResponse, report: AiReportResponse, apply: boolean): void {
    state.aiChecks.push(report);
    state.aiReports = [...state.aiReports.filter((r) => r.campaignId !== c.id), report];
    state.seq.decision += 1;
    state.aiDecisions.unshift({
      id: state.seq.decision,
      campaignId: c.id,
      campaignName: c.name,
      checkId: report.checkId ?? 0,
      decisionType: "AI",
      decision: report.aiStatus.toUpperCase(),
      reason: report.preview
        ? `Pré-analyse : ${report.recommendation ?? ""}`
        : report.recommendation,
      decidedByUserId: null,
      decidedByName: null,
      riskScore: report.riskScore,
      qualityScore: report.qualityScore,
      preview: report.preview ?? false,
      createdAt: report.checkedAt ?? new Date().toISOString(),
    });
    if (!apply) return;
    const upper = report.aiStatus.toUpperCase() as "APPROVED" | "REVIEW_REQUIRED" | "REJECTED";
    c.aiStatus = upper;
    c.status =
      upper === "APPROVED"
        ? "APPROVED_BY_AI"
        : upper === "REVIEW_REQUIRED"
          ? "REVIEW_REQUIRED"
          : "REJECTED_BY_AI";
    c.aiRiskScore = report.riskScore;
    c.aiQualityScore = report.qualityScore;
    c.aiSector = report.sector;
    c.aiOverride = false;
  }

  function audit(action: string, entityType: string, entityId: number | string, summary: string) {
    const actor = state.user;
    state.seq.audit += 1;
    state.auditLogs.unshift({
      id: state.seq.audit,
      actorUserId: actor?.userId ?? null,
      actorEmail: actor?.email ?? null,
      actorName: actor?.nom ?? null,
      actorRole: actor?.role ?? null,
      action,
      entityType,
      entityId: String(entityId),
      summary,
      details: null,
      ipAddress: "127.0.0.1",
      createdAt: new Date().toISOString(),
    });
  }

  function reopen(c: CampaignResponse): void {
    Object.assign(c, {
      status: "BROUILLON",
      aiStatus: null,
      adminStatus: null,
      aiOverride: false,
      submittedAt: null,
      validatedAt: null,
    });
  }

  function validateCampaignBody(
    body: CampaignRequest,
    isCreate: boolean,
    previous?: CampaignResponse,
  ) {
    if (!body.name?.trim()) {
      return {
        status: 400,
        code: "VALIDATION_FAILED",
        message: "Certains champs sont invalides.",
        errors: { name: "Champ obligatoire." },
      };
    }
    if (body.startDate && body.endDate && body.endDate < body.startDate) {
      return {
        status: 400,
        code: "INVALID_PERIOD",
        message: "La date de fin doit être après la date de début.",
      };
    }
    const st = body.startTime ? apiTime(body.startTime) : null;
    const et = body.endTime ? apiTime(body.endTime) : null;
    if ((st === null) !== (et === null) || (st && et && st >= et)) {
      return {
        status: 400,
        code: "INVALID_TIME_RANGE",
        message: "L'heure de fin doit être après l'heure de début.",
      };
    }
    if (
      body.startDate &&
      body.startDate < today() &&
      (isCreate || previous?.startDate !== body.startDate)
    ) {
      return {
        status: 400,
        code: "START_DATE_IN_PAST",
        message: "La date de début ne peut pas être dans le passé.",
      };
    }
    return null;
  }

  function resolveZone(lat: number, lng: number): ZoneResponse | null {
    const active = state.zones.filter((z) => z.isActive);
    const withD = active
      .map((z) => ({ z, d: distanceKm(lat, lng, z.latitude, z.longitude) }))
      .sort((a, b) => a.d - b.d);
    return (withD.find((x) => x.d <= (x.z.radiusKm ?? 3)) ?? withD[0])?.z ?? null;
  }

  // -------------------------------------------------------------------------
  // Statistics helpers
  // -------------------------------------------------------------------------
  const logDay = (l: DiffusionLogResponse) => isoDay(0, new Date(l.diffusedAt));

  function logsIn(from: string, to: string, filter: (l: DiffusionLogResponse) => boolean) {
    return state.diffusionLogs.filter((l) => {
      const d = logDay(l);
      return d >= from && d <= to && filter(l);
    });
  }

  function dailyRows(from: string, to: string, logs: DiffusionLogResponse[]) {
    const rows = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const dayLogs = logs.filter((l) => logDay(l) === d);
      rows.push({
        date: d,
        views: dayLogs.length,
        clicks: dayLogs.reduce((s, l) => s + l.clicks, 0),
        interactions: dayLogs.reduce((s, l) => s + l.interactions, 0),
        cost: Math.round(dayLogs.reduce((s, l) => s + l.cost, 0) * 100) / 100,
      });
      if (rows.length > 366) break;
    }
    return rows;
  }

  function bySupport(logs: DiffusionLogResponse[]) {
    const ids = [...new Set(logs.map((l) => l.supportId))];
    return ids
      .map((id) => {
        const s = supportOf(id);
        return {
          supportId: id,
          name: s?.name ?? "",
          zoneName: s?.zoneName ?? "",
          views: logs.filter((l) => l.supportId === id).length,
        };
      })
      .sort((a, b) => b.views - a.views);
  }

  function byZone(logs: DiffusionLogResponse[]) {
    const ids = [...new Set(logs.map((l) => l.zoneId).filter((z): z is number => z !== null))];
    return ids
      .map((id) => ({
        zoneId: id,
        name: zoneOf(id)?.name ?? "",
        views: logs.filter((l) => l.zoneId === id).length,
      }))
      .sort((a, b) => b.views - a.views);
  }

  // -------------------------------------------------------------------------
  // Handler
  // -------------------------------------------------------------------------
  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname.replace(/\/+$/, "");
    const seg = path.split("/").filter(Boolean).slice(1); // after "api"
    api.calls.push(`${method} ${path}${url.search}`);
    const user = state.user;
    const role = user?.role ?? null;
    const isStaff = role !== null && STAFF.includes(role);
    const isAdmin = role === "ADMINISTRATEUR";
    const isAnnonceur = role === "ANNONCEUR";

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
          return apiError(route, 401, "BAD_CREDENTIALS", "E-mail ou mot de passe incorrect.");
        }
        const disabled = state.users.find((u) => u.userId === account.userId)?.isActive === false;
        if (disabled) {
          return apiError(route, 401, "ACCOUNT_DISABLED", "Ce compte est désactivé.");
        }
        const sessionUser = sessionUserOf(account);
        state.user = sessionUser;
        await setSessionCookies(page.context(), sessionUser, options.baseURL);
        // Round 2: the login route answers a status (no TOTP challenge for the demo accounts).
        return json(route, 200, { status: "AUTHENTICATED", user: sessionUser });
      }
      if (seg[1] === "register" && method === "POST") {
        const body = bodyOf<RegisterRequest>(request);
        if (accounts.some((a) => a.email.toLowerCase() === body.email?.toLowerCase())) {
          return apiError(
            route,
            409,
            "EMAIL_ALREADY_REGISTERED",
            "Un compte existe déjà avec cet e-mail.",
          );
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
      if (!url.searchParams.get("supportId") || !Number.isFinite(supportId)) {
        return apiError(route, 400, "MISSING_PARAMETER", "Le paramètre supportId est obligatoire.");
      }
      const support = supportOf(supportId);
      if (!support) return apiError(route, 404, "SUPPORT_NOT_FOUND", "Ce Porteur est introuvable.");
      const zone = zoneOf(support.zoneId)?.name ?? support.zoneName;
      const zoneParam = url.searchParams.get("zone");
      if (zoneParam && zoneParam.toLowerCase() !== zone.toLowerCase()) {
        return apiError(
          route,
          400,
          "SUPPORT_ZONE_MISMATCH",
          "Ce Porteur n'appartient pas à cette zone.",
        );
      }
      state.diffusionLogCount += 1;
      const base: DiffusionResponse =
        state.diffusion === "urgence"
          ? DIFFUSION_URGENCE
          : state.diffusion === "defaut"
            ? DIFFUSION_DEFAUT
            : DIFFUSION_PUBLICITE;
      const contentType = base.type.toUpperCase() as DiffusionContentType;
      const log: DiffusionLogResponse = {
        id: nextId(state.diffusionLogs),
        supportId,
        supportName: support.name,
        zoneId: support.zoneId,
        zoneName: zone,
        campaignId: base.campaignId,
        campaignName: base.campaignId ? (findCampaign(base.campaignId)?.name ?? null) : null,
        emergencyId: base.emergencyId ?? null,
        contentType,
        title: base.title,
        mediaUrl: base.mediaUrl,
        durationSeconds: base.duration,
        priority: base.priority,
        cost: contentType === "PUBLICITE" ? unitCost(support) : 0,
        clicks: 0,
        interactions: 0,
        diffusedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      state.diffusionLogs.push(log);
      return json(route, 200, {
        ...base,
        diffusionLogId: log.id,
        supportId,
        zone,
        datetime: url.searchParams.get("datetime") ?? base.datetime,
      } satisfies DiffusionResponse);
    }

    if (seg[0] === "diffusion" && seg[1] === "interactions" && method === "POST") {
      const body = bodyOf<{ diffusionLogId?: number; type?: string }>(request);
      const log = state.diffusionLogs.find((l) => l.id === body.diffusionLogId);
      if (!log)
        return apiError(route, 404, "DIFFUSION_LOG_NOT_FOUND", "Cette diffusion est introuvable.");
      if (log.contentType !== "PUBLICITE") {
        return apiError(
          route,
          400,
          "INTERACTION_NOT_ALLOWED",
          "Seules les publicités peuvent recevoir un clic.",
        );
      }
      const key = `${log.id}:${body.type}`;
      if (!state.interactions.has(key)) {
        state.interactions.add(key);
        if (body.type === "CLIC") log.clicks += 1;
        else log.interactions += 1;
      }
      return empty(route);
    }

    // Everything below requires a session (the bridge answers 401 SESSION_EXPIRED).
    if (!user) {
      return json(route, 401, { status: 401, code: "SESSION_EXPIRED", message: "Session expirée" });
    }

    // ---- Profile (/me)
    if (seg[0] === "me") {
      const account = state.users.find((u) => u.userId === user.userId);
      const me =
        account ??
        ({
          userId: user.userId,
          email: user.email,
          nom: user.nom,
          role: user.role,
          societe: null,
          telephone: null,
          adresse: null,
          logoUrl: null,
          isActive: true,
          lastLoginAt: null,
          createdAt: new Date().toISOString(),
          client: null,
          activeSessions: 1,
          campaignsCount: 0,
          clientNotes: null,
        } satisfies AdminUserResponse);
      const meView = () => {
        const { activeSessions: _a, campaignsCount: _c, clientNotes: _n, ...rest } = me;
        return rest;
      };
      if (seg.length === 1 && method === "GET") return json(route, 200, meView());
      // Round 2: two-factor authentication status (not enabled for the demo accounts).
      if (seg[1] === "2fa" && seg.length === 2 && method === "GET") {
        return json(route, 200, {
          enabled: false,
          enabledAt: null,
          required: false,
          recoveryCodesRemaining: 0,
          pendingSetup: false,
        });
      }
      if (seg.length === 1 && method === "PUT") {
        const body = bodyOf<{
          nom?: string;
          societe?: string | null;
          telephone?: string | null;
          adresse?: string | null;
        }>(request);
        if (!body.nom?.trim()) {
          return apiError(route, 400, "VALIDATION_FAILED", "Certains champs sont invalides.", {
            nom: "Champ obligatoire.",
          });
        }
        if (body.telephone && !/^[+0-9 ().-]{6,30}$/.test(body.telephone)) {
          return apiError(route, 400, "VALIDATION_FAILED", "Certains champs sont invalides.", {
            telephone: "Numéro de téléphone invalide.",
          });
        }
        Object.assign(me, {
          nom: body.nom.trim(),
          societe: body.societe ?? null,
          telephone: body.telephone ?? null,
          adresse: body.adresse ?? null,
        });
        if (me.client) me.client.companyName = me.societe;
        return json(route, 200, meView());
      }
      if (seg[1] === "password" && method === "POST") {
        const body = bodyOf<{ currentPassword?: string; newPassword?: string }>(request);
        const acc = accounts.find((a) => a.userId === user.userId);
        if (!acc || acc.password !== body.currentPassword) {
          return apiError(
            route,
            400,
            "INVALID_CURRENT_PASSWORD",
            "Le mot de passe actuel est incorrect.",
          );
        }
        if (body.newPassword === body.currentPassword) {
          return apiError(
            route,
            400,
            "PASSWORD_REUSED",
            "Le nouveau mot de passe doit être différent de l'actuel.",
          );
        }
        if (
          !body.newPassword ||
          body.newPassword.length < 8 ||
          !/[a-z]/i.test(body.newPassword) ||
          !/\d/.test(body.newPassword)
        ) {
          return apiError(route, 400, "VALIDATION_FAILED", "Certains champs sont invalides.", {
            newPassword: "8 caractères minimum, avec au moins une lettre et un chiffre.",
          });
        }
        acc.password = body.newPassword;
        state.sessions = state.sessions.filter((s) => s.current);
        return empty(route);
      }
      if (seg[1] === "logo" && method === "POST") {
        const { file } = readMultipart(request);
        if (!file) return apiError(route, 400, "MISSING_PARAMETER", "Aucun fichier reçu.");
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
          return apiError(
            route,
            415,
            "MEDIA_TYPE_UNSUPPORTED",
            "Format non pris en charge : PNG, JPEG ou WebP.",
          );
        }
        me.logoUrl = `/uploads/logos/${user.userId}/logo-${Date.now()}.png`;
        return json(route, 200, meView());
      }
      if (seg[1] === "logo" && method === "DELETE") {
        me.logoUrl = null;
        return json(route, 200, meView());
      }
      if (seg[1] === "sessions" && seg.length === 2 && method === "GET") {
        return json(route, 200, state.sessions);
      }
      if (seg[1] === "sessions" && seg[2] === "revoke-others" && method === "POST") {
        const revoked = state.sessions.filter((s) => !s.current).length;
        state.sessions = state.sessions.filter((s) => s.current);
        return json(route, 200, { revoked });
      }
      if (seg[1] === "sessions" && seg[2] && method === "DELETE") {
        const found = state.sessions.some((s) => s.id === seg[2]);
        if (!found)
          return apiError(route, 404, "SESSION_NOT_FOUND", "Cette session est introuvable.");
        state.sessions = state.sessions.filter((s) => s.id !== seg[2]);
        return empty(route);
      }
      if (seg[1] === "logout" && method === "POST") return empty(route);
      if (seg[1] === "login-history" && method === "GET") {
        const limit = Math.min(100, numParam(url, "limit") ?? 20);
        return json(route, 200, demoLoginHistory(user.email).slice(0, limit));
      }
    }

    const ownCampaign = (c: CampaignResponse | undefined) =>
      c !== undefined && isAnnonceur && c.clientId === DEMO_CLIENT_ID;
    const readable = (c: CampaignResponse | undefined) =>
      c !== undefined && (isStaff || ownCampaign(c));
    const notFound = (id: number | string) =>
      apiError(route, 404, "CAMPAIGN_NOT_FOUND", `Campagne ${id} introuvable.`);

    // ---- Campaigns
    if (seg[0] === "campaigns") {
      if (seg.length === 1 && method === "GET") {
        if (role !== "ADMINISTRATEUR" && role !== "SUPERVISEUR") return denied(route);
        const q = normalizeText(url.searchParams.get("q") ?? "");
        const client = normalizeText(url.searchParams.get("client") ?? "");
        const statuses = listParam(url, "status");
        const aiStatuses = listParam(url, "aiStatus");
        const zoneId = numParam(url, "zoneId");
        const clientId = numParam(url, "clientId");
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const supportTypes = listParam(url, "supportType");
        const items = state.campaigns
          .filter((c) => !q || normalizeText(c.name).includes(q))
          .filter(
            (c) =>
              !client ||
              normalizeText(`${c.clientCompanyName ?? ""} ${c.clientName ?? ""}`).includes(client),
          )
          .filter((c) => clientId === null || c.clientId === clientId)
          .filter((c) => !statuses || statuses.includes(c.status))
          .filter((c) => !aiStatuses || (c.aiStatus !== null && aiStatuses.includes(c.aiStatus)))
          .filter(
            (c) =>
              zoneId === null ||
              (c.zones ?? []).some((z) => z.zoneId === zoneId) ||
              state.reservations.some((r) => r.campaignId === c.id && r.zoneId === zoneId),
          )
          .filter(
            (c) =>
              (!from && !to) ||
              (c.startDate !== null &&
                c.endDate !== null &&
                datesOverlap(c.startDate, c.endDate, from ?? "0000-01-01", to ?? "9999-12-31")),
          )
          .filter(
            (c) =>
              !supportTypes ||
              state.reservations.some(
                (r) =>
                  r.campaignId === c.id &&
                  holding(r) &&
                  supportTypes.includes(supportOf(r.supportId)?.supportType ?? ""),
              ),
          )
          .map(campaignView)
          .sort(byCreatedDesc);
        return json(route, 200, paginate(items, url));
      }
      if (seg.length === 1 && method === "POST") {
        if (!isAnnonceur) return denied(route);
        const body = bodyOf<CampaignRequest>(request);
        const invalid = validateCampaignBody(body, true);
        if (invalid)
          return apiError(route, invalid.status, invalid.code, invalid.message, invalid.errors);
        const now = new Date().toISOString();
        const created = {
          id: nextId(state.campaigns),
          clientId: DEMO_CLIENT_ID,
          clientName: user.nom,
          clientCompanyName: state.users.find((u) => u.userId === user.userId)?.societe ?? null,
          clientValidationStatus: "VALIDATED",
          name: body.name,
          objective: body.objective ?? null,
          budget: Number(body.budget ?? 0),
          consumedBudget: 0,
          remainingBudget: Number(body.budget ?? 0),
          estimatedCost: 0,
          status: "BROUILLON",
          aiStatus: null,
          adminStatus: null,
          aiOverride: false,
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          startTime: apiTime(body.startTime),
          endTime: apiTime(body.endTime),
          estimatedViews: 0,
          priorityScore: 0,
          aiRiskScore: null,
          aiQualityScore: null,
          aiSector: null,
          rejectionReason: null,
          adminComment: null,
          terminationReason: null,
          mediaUrl: null,
          mediaType: null,
          mediaCount: 0,
          zones: [],
          reservationsCount: 0,
          duplicatedFromId: null,
          editable: true,
          submittable: true,
          deletable: true,
          createdAt: now,
          updatedAt: now,
          submittedAt: null,
          validatedAt: null,
          activatedAt: null,
          terminatedAt: null,
        } satisfies CampaignResponse;
        state.campaigns.push(created);
        return json(route, 201, campaignView(created));
      }
      if (seg[1] === "mine" && method === "GET") {
        if (!isAnnonceur) return denied(route);
        const q = normalizeText(url.searchParams.get("q") ?? "");
        const statuses = listParam(url, "status");
        const aiStatuses = listParam(url, "aiStatus");
        const zoneId = numParam(url, "zoneId");
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        return json(
          route,
          200,
          state.campaigns
            .filter((c) => c.clientId === DEMO_CLIENT_ID)
            .filter((c) => !q || normalizeText(c.name).includes(q))
            .filter((c) => !statuses || statuses.includes(c.status))
            .filter((c) => !aiStatuses || (c.aiStatus !== null && aiStatuses.includes(c.aiStatus)))
            .filter((c) => zoneId === null || (c.zones ?? []).some((z) => z.zoneId === zoneId))
            .filter(
              (c) =>
                (!from && !to) ||
                (c.startDate !== null &&
                  c.endDate !== null &&
                  datesOverlap(c.startDate, c.endDate, from ?? "0000-01-01", to ?? "9999-12-31")),
            )
            .map(campaignView)
            .sort(byCreatedDesc),
        );
      }
      const id = Number(seg[1]);
      if (!Number.isInteger(id)) {
        return apiError(route, 400, "INVALID_PARAMETER", "Identifiant de campagne invalide.");
      }
      const c = findCampaign(id);
      if (!readable(c) || !c) return notFound(id);
      const owner = ownCampaign(c);

      // Media
      if (seg[2] === "media") {
        if (seg.length === 3 && method === "GET") {
          return json(
            route,
            200,
            state.media
              .filter((m) => m.campaignId === id)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
          );
        }
        if (!owner) return notFound(id);
        if (c.status !== "BROUILLON") {
          return apiError(
            route,
            409,
            "CAMPAIGN_NOT_EDITABLE",
            "Les médias ne se modifient que sur un brouillon.",
          );
        }
        if (seg.length === 3 && method === "POST") {
          const { fields, file } = readMultipart(request);
          if (!file) return apiError(route, 400, "MISSING_PARAMETER", "Aucun fichier reçu.");
          const isImage = /^image\/(jpeg|png|webp|gif)$/.test(file.type);
          const isVideo = /^video\/(mp4|webm)$/.test(file.type);
          if (!isImage && !isVideo) {
            return apiError(route, 415, "MEDIA_TYPE_UNSUPPORTED", "Format non pris en charge.");
          }
          if (file.size > (isImage ? 10 : 50) * 1024 * 1024) {
            return apiError(route, 413, "MEDIA_TOO_LARGE", "Fichier trop volumineux.");
          }
          const existing = state.media.filter((m) => m.campaignId === id);
          if (existing.length >= 5) {
            return apiError(
              route,
              400,
              "MEDIA_LIMIT_REACHED",
              "Nombre maximal de médias atteint (5).",
            );
          }
          state.seq.media += 1;
          const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
          const duration = fields.durationSeconds ? Number(fields.durationSeconds) : null;
          const created: MediaFileResponse = {
            id: state.seq.media,
            campaignId: id,
            fileName: file.name,
            fileType: isVideo ? "VIDEO" : fields.kind === "BANNER" ? "BANNER" : "IMAGE",
            mimeType: file.type,
            fileSizeBytes: file.size,
            durationSeconds:
              isVideo && duration !== null && Number.isFinite(duration) ? duration : null,
            widthPx: isImage ? 1280 : null,
            heightPx: isImage ? 720 : null,
            url: `/uploads/campaigns/${id}/e2e-${state.seq.media}.${ext}`,
            checksum: `e2e${state.seq.media}`,
            sortOrder: existing.length,
            createdAt: new Date().toISOString(),
          };
          state.media.push(created);
          return json(route, 201, created);
        }
        if (seg.length === 4 && method === "DELETE") {
          const mediaId = Number(seg[3]);
          if (!state.media.some((m) => m.id === mediaId && m.campaignId === id)) {
            return apiError(route, 404, "MEDIA_NOT_FOUND", "Ce média est introuvable.");
          }
          state.media = state.media.filter((m) => m.id !== mediaId);
          return empty(route);
        }
      }

      // Zones
      if (seg[2] === "zones") {
        if (method === "GET") return json(route, 200, campaignView(c).zones ?? []);
        if (method === "PUT") {
          if (!owner) return notFound(id);
          if (c.status === "REJECTED_BY_AI" || c.status === "BLOCKED") reopen(c);
          if (c.status !== "BROUILLON") {
            return apiError(
              route,
              409,
              "CAMPAIGN_NOT_EDITABLE",
              "Cette campagne ne peut plus être modifiée.",
            );
          }
          const body = bodyOf<{ zones?: CampaignZoneRequest[] }>(request);
          const zones = body.zones ?? [];
          if (zones.length > 5) {
            return apiError(
              route,
              400,
              "ZONE_LIMIT_EXCEEDED",
              "Vous pouvez cibler au maximum 5 zones.",
            );
          }
          if (zones.length === 0 || zones.some((z) => !(z.radiusKm >= 0.1 && z.radiusKm <= 50))) {
            return apiError(route, 400, "VALIDATION_FAILED", "Certains champs sont invalides.", {
              zones: "Entre 1 et 5 cercles de 0,1 à 50 km.",
            });
          }
          const circles: CampaignZoneResponse[] = [];
          for (const z of zones) {
            const zone = resolveZone(z.latitude, z.longitude);
            if (!zone) return apiError(route, 400, "INVALID_ZONE", "Aucune zone TPUB active.");
            state.seq.campaignZone += 1;
            circles.push({
              id: state.seq.campaignZone,
              zoneId: zone.id,
              zoneName: zone.name,
              label: z.label ?? null,
              latitude: z.latitude,
              longitude: z.longitude,
              radiusKm: z.radiusKm,
              supportsInside: 0,
            });
          }
          c.zones = circles;
          const cancelledReservationIds: number[] = [];
          for (const r of state.reservations) {
            const s = supportOf(r.supportId);
            if (
              r.campaignId === id &&
              r.reservationStatus === "TEMPORAIRE" &&
              s &&
              !insideCircles(s, circles)
            ) {
              r.reservationStatus = "ANNULEE";
              r.cancelledAt = new Date().toISOString();
              r.cancelReason = "Hors des zones ciblées";
              cancelledReservationIds.push(r.id);
            }
          }
          return json(route, 200, { zones: campaignView(c).zones, cancelledReservationIds });
        }
      }

      if (seg.length === 2 && method === "GET") return json(route, 200, campaignView(c));
      if (seg.length === 2 && method === "PUT") {
        if (!owner) return notFound(id);
        if (c.status === "REJECTED_BY_AI" || c.status === "BLOCKED") reopen(c);
        if (c.status !== "BROUILLON") {
          return apiError(
            route,
            409,
            "CAMPAIGN_NOT_EDITABLE",
            "Cette campagne ne peut plus être modifiée dans son état actuel.",
          );
        }
        const body = bodyOf<CampaignRequest>(request);
        const invalid = validateCampaignBody(body, false, c);
        if (invalid)
          return apiError(route, invalid.status, invalid.code, invalid.message, invalid.errors);
        Object.assign(c, {
          name: body.name,
          objective: body.objective ?? null,
          budget: Number(body.budget ?? 0),
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          startTime: apiTime(body.startTime),
          endTime: apiTime(body.endTime),
          updatedAt: new Date().toISOString(),
        });
        for (const r of state.reservations) {
          if (r.campaignId !== id || r.reservationStatus !== "TEMPORAIRE") continue;
          const inside =
            c.startDate !== null &&
            c.endDate !== null &&
            c.startTime !== null &&
            c.endTime !== null &&
            r.startDate >= c.startDate &&
            r.endDate <= c.endDate &&
            r.startTime >= c.startTime &&
            r.endTime <= c.endTime;
          if (!inside) {
            r.reservationStatus = "ANNULEE";
            r.cancelledAt = new Date().toISOString();
            r.cancelReason = "Hors de la nouvelle période de la campagne";
          }
        }
        return json(route, 200, campaignView(c));
      }
      if (seg.length === 2 && method === "DELETE") {
        if (!owner) return notFound(id);
        if (!["BROUILLON", "REJECTED_BY_AI", "BLOCKED"].includes(c.status)) {
          return apiError(
            route,
            409,
            "CAMPAIGN_NOT_EDITABLE",
            "Cette campagne ne peut plus être supprimée.",
          );
        }
        state.campaigns = state.campaigns.filter((x) => x.id !== id);
        state.reservations = state.reservations.filter((r) => r.campaignId !== id);
        state.aiReports = state.aiReports.filter((r) => r.campaignId !== id);
        state.media = state.media.filter((m) => m.campaignId !== id);
        return empty(route);
      }
      if (seg[2] === "reopen" && method === "POST") {
        if (!owner) return notFound(id);
        if (c.status !== "REJECTED_BY_AI" && c.status !== "BLOCKED") {
          return apiError(
            route,
            409,
            "CAMPAIGN_NOT_EDITABLE",
            "Seule une campagne refusée peut être rouverte.",
          );
        }
        reopen(c);
        return json(route, 200, campaignView(c));
      }
      if (seg[2] === "duplicate" && method === "POST") {
        if (!owner) return notFound(id);
        const body = bodyOf<{ includeMedia?: boolean }>(request);
        const now = new Date().toISOString();
        const copyId = nextId(state.campaigns);
        const futureDates = c.startDate !== null && c.startDate >= today();
        const copy: CampaignResponse = {
          ...c,
          id: copyId,
          name: `Copie de ${c.name}`.slice(0, 200),
          status: "BROUILLON",
          aiStatus: null,
          adminStatus: null,
          aiOverride: false,
          consumedBudget: 0,
          startDate: futureDates ? c.startDate : null,
          endDate: futureDates ? c.endDate : null,
          aiRiskScore: null,
          aiQualityScore: null,
          aiSector: null,
          rejectionReason: null,
          adminComment: null,
          terminationReason: null,
          zones: (c.zones ?? []).map((z) => ({ ...z, id: ++state.seq.campaignZone })),
          duplicatedFromId: c.id,
          createdAt: now,
          updatedAt: now,
          submittedAt: null,
          validatedAt: null,
          activatedAt: null,
          terminatedAt: null,
        };
        state.campaigns.push(copy);
        if (body.includeMedia !== false) {
          for (const m of state.media.filter((x) => x.campaignId === id)) {
            state.seq.media += 1;
            state.media.push({
              ...m,
              id: state.seq.media,
              campaignId: copyId,
              url: m.url.replace(`/campaigns/${id}/`, `/campaigns/${copyId}/`),
              createdAt: now,
            });
          }
        }
        return json(route, 201, campaignView(copy));
      }
      if (seg[2] === "submit" && method === "POST") {
        if (!owner) return notFound(id);
        if (c.status !== "BROUILLON") {
          return apiError(
            route,
            409,
            "CAMPAIGN_NOT_SUBMITTABLE",
            "Seules les campagnes en brouillon peuvent être soumises.",
          );
        }
        const errors: Record<string, string> = {};
        if (!c.startDate || !c.endDate || c.endDate < today()) {
          errors.period = "Indiquez une période de diffusion à venir.";
        }
        if (!c.startTime || !c.endTime) errors.times = "Indiquez les horaires de diffusion.";
        if (!(c.budget > 0)) errors.budget = "Le budget doit être supérieur à 0.";
        const live = state.reservations.filter(
          (r) =>
            r.campaignId === id && r.reservationStatus === "TEMPORAIRE" && r.endDate >= today(),
        );
        if ((c.zones ?? []).length === 0) errors.zones = "Choisissez au moins une zone ciblée.";
        if (live.length === 0) errors.reservations = "Réservez au moins un Porteur.";
        if (Object.keys(errors).length > 0) {
          return apiError(route, 400, "SUBMIT_INCOMPLETE", "La campagne est incomplète.", errors);
        }
        c.status = "PENDING_AI_CHECK";
        c.submittedAt = new Date().toISOString();
        await sleep(aiDelay);
        recordCheck(c, analyse(c, false), true);
        return json(route, 200, campaignView(c));
      }
    }

    // ---- AI moderation
    if (seg[0] === "ai") {
      if (seg[1] === "rules") {
        if (role !== "ADMINISTRATEUR" && role !== "SUPERVISEUR") return denied(route);
        if (seg.length === 2 && method === "GET") {
          const active = url.searchParams.get("active");
          const ruleType = url.searchParams.get("ruleType");
          return json(
            route,
            200,
            state.aiRules
              .filter((r) => active === null || String(r.isActive) === active)
              .filter((r) => !ruleType || r.ruleType === ruleType),
          );
        }
        if (!isAdmin) return denied(route);
        const validateRule = (body: AiRuleRequest, selfId: number | null) => {
          if (!body.ruleName?.trim() || !body.pattern?.trim()) {
            return apiError(route, 400, "VALIDATION_FAILED", "Certains champs sont invalides.", {
              ...(body.ruleName?.trim() ? {} : { ruleName: "Champ obligatoire." }),
              ...(body.pattern?.trim() ? {} : { pattern: "Champ obligatoire." }),
            });
          }
          if (state.aiRules.some((r) => r.ruleName === body.ruleName && r.id !== selfId)) {
            return apiError(route, 409, "AI_RULE_NAME_TAKEN", "Une règle porte déjà ce nom.");
          }
          if (body.ruleType === "REGEX") {
            try {
              new RegExp(body.pattern);
            } catch {
              return apiError(route, 400, "INVALID_REGEX", "L'expression régulière est invalide.");
            }
          }
          return null;
        };
        if (seg.length === 2 && method === "POST") {
          const body = bodyOf<AiRuleRequest>(request);
          const invalid = validateRule(body, null);
          if (invalid) return invalid;
          const now = new Date().toISOString();
          const created = {
            id: nextId(state.aiRules),
            ruleName: body.ruleName,
            ruleType: body.ruleType,
            pattern: body.pattern,
            severity: body.severity,
            sector: body.sector ?? null,
            isActive: body.isActive ?? true,
            description: body.description ?? null,
            createdAt: now,
            updatedAt: now,
          };
          state.aiRules.push(created);
          audit("AI_RULE_CREATED", "AI_RULE", created.id, `Règle « ${created.ruleName} » créée`);
          return json(route, 201, created);
        }
        const ruleId = Number(seg[2]);
        const rule = state.aiRules.find((r) => r.id === ruleId);
        if (!rule) return apiError(route, 404, "AI_RULE_NOT_FOUND", "Cette règle est introuvable.");
        if (method === "PUT") {
          const body = bodyOf<AiRuleRequest>(request);
          const invalid = validateRule(body, ruleId);
          if (invalid) return invalid;
          Object.assign(rule, {
            ...body,
            sector: body.sector ?? null,
            isActive: body.isActive ?? rule.isActive,
            description: body.description ?? null,
            updatedAt: new Date().toISOString(),
          });
          audit("AI_RULE_UPDATED", "AI_RULE", ruleId, `Règle « ${rule.ruleName} » modifiée`);
          return json(route, 200, rule);
        }
        if (method === "DELETE") {
          state.aiRules = state.aiRules.filter((r) => r.id !== ruleId);
          audit("AI_RULE_DELETED", "AI_RULE", ruleId, `Règle « ${rule.ruleName} » supprimée`);
          return empty(route);
        }
      }
      if (seg[1] === "decisions" && method === "GET") {
        if (role !== "ADMINISTRATEUR" && role !== "SUPERVISEUR") return denied(route);
        const campaignId = numParam(url, "campaignId");
        const decisionType = url.searchParams.get("decisionType");
        const decision = url.searchParams.get("decision");
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const items = state.aiDecisions
          .filter((d) => campaignId === null || d.campaignId === campaignId)
          .filter((d) => !decisionType || d.decisionType === decisionType)
          .filter((d) => !decision || d.decision === decision)
          .filter((d) => !from || d.createdAt.slice(0, 10) >= from)
          .filter((d) => !to || d.createdAt.slice(0, 10) <= to)
          .sort(byCreatedDesc);
        return json(route, 200, paginate(items, url));
      }
      if (seg[1] === "dashboard" && method === "GET") {
        if (role !== "ADMINISTRATEUR" && role !== "SUPERVISEUR") return denied(route);
        const checks = state.aiChecks.filter((c) => !c.preview);
        const admin = state.aiDecisions.filter((d) => d.decisionType === "ADMIN");
        const validated = admin.filter((d) => d.decision.startsWith("VALIDATED")).length;
        const rejected = admin.filter((d) => d.decision === "REJECTED").length;
        const avg = (f: (r: AiReportResponse) => number) =>
          checks.length
            ? Math.round((checks.reduce((s, r) => s + f(r), 0) / checks.length) * 10) / 10
            : 0;
        const labels = new Map<string, number>();
        for (const c of checks)
          for (const i of c.issues ?? []) labels.set(i.label, (labels.get(i.label) ?? 0) + 1);
        const sectors = new Map<string, number>();
        for (const c of checks)
          if (c.sector) sectors.set(c.sector, (sectors.get(c.sector) ?? 0) + 1);
        return json(route, 200, {
          totalChecks: checks.length,
          avgRiskScore: avg((r) => r.riskScore),
          avgQualityScore: avg((r) => r.qualityScore),
          approvedCount: checks.filter((c) => c.aiStatus === "approved").length,
          reviewRequiredCount: checks.filter((c) => c.aiStatus === "review_required").length,
          rejectedCount: checks.filter((c) => c.aiStatus === "rejected").length,
          adminValidatedCount: validated,
          adminRejectedCount: rejected,
          validationRate: admin.length ? validated / admin.length : 0,
          rejectionRate: admin.length ? rejected / admin.length : 0,
          overrideCount: admin.filter((d) => d.decision === "VALIDATED_OVERRIDE").length,
          disagreementCount: 0,
          bySector: [...sectors].map(([sector, count]) => ({ sector, count })),
          topIssues: [...labels]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
        });
      }
      const id = Number(seg[2]);
      const c = findCampaign(id);
      if (seg[1] === "check-content" && method === "POST") {
        if (!readable(c) || !c) return notFound(id);
        const owner = ownCampaign(c);
        if (owner && c.status === "BROUILLON") {
          await sleep(aiDelay);
          const report = analyse(c, true);
          recordCheck(c, report, false);
          return json(route, 200, report);
        }
        if (
          (owner && c.status === "PENDING_AI_CHECK") ||
          (isAdmin && ["PENDING_AI_CHECK", "APPROVED_BY_AI", "REVIEW_REQUIRED"].includes(c.status))
        ) {
          await sleep(aiDelay);
          const report = analyse(c, false);
          recordCheck(c, report, true);
          if (isAdmin)
            audit("AI_CHECK_RERUN", "CAMPAIGN", id, `Analyse IA relancée pour « ${c.name} »`);
          return json(route, 200, report);
        }
        // Compat (pre-v2 wizard: submit then check-content): answer the stored analysis.
        const stored = state.aiReports.find((r) => r.campaignId === id && !r.preview);
        if (
          owner &&
          stored &&
          ["APPROVED_BY_AI", "REVIEW_REQUIRED", "REJECTED_BY_AI"].includes(c.status)
        ) {
          return json(route, 200, stored);
        }
        return apiError(
          route,
          409,
          "CAMPAIGN_NOT_ELIGIBLE_FOR_AI",
          "Cette campagne ne peut pas être analysée dans son état actuel.",
        );
      }
      if ((seg[1] === "report" || seg[1] === "issues" || seg[1] === "checks") && method === "GET") {
        if (!readable(c) || !c) return notFound(id);
        const checks = state.aiChecks.filter((r) => r.campaignId === id);
        const latest = state.aiReports.find((r) => r.campaignId === id) ?? checks.at(-1);
        if (seg[1] === "checks") return json(route, 200, [...checks].reverse());
        if (!latest) {
          return apiError(route, 404, "AI_REPORT_NOT_FOUND", "Aucune analyse pour cette campagne.");
        }
        if (seg[1] === "report") return json(route, 200, latest);
        return json(route, 200, {
          campaignId: id,
          checkId: latest.checkId,
          aiStatus: latest.aiStatus,
          issues: latest.issues,
        });
      }
    }

    // ---- Admin decisions
    if (seg[0] === "admin" && seg[1] === "campaigns") {
      if (!isAdmin) return denied(route);
      const id = Number(seg[2]);
      const c = findCampaign(id);
      if (!c) return notFound(id);
      const now = new Date().toISOString();
      const logDecision = (decision: string, reason: string | null) => {
        state.seq.decision += 1;
        state.aiDecisions.unshift({
          id: state.seq.decision,
          campaignId: id,
          campaignName: c.name,
          checkId: state.aiReports.find((r) => r.campaignId === id)?.checkId ?? 0,
          decisionType: "ADMIN",
          decision,
          reason,
          decidedByUserId: user.userId,
          decidedByName: user.nom,
          riskScore: c.aiRiskScore ?? 0,
          qualityScore: c.aiQualityScore ?? 0,
          preview: false,
          createdAt: now,
        });
      };
      if (seg[3] === "validate" && method === "POST") {
        const body = bodyOf<{
          overrideAi?: boolean;
          comment?: string | null;
          priorityScore?: number | null;
        }>(request);
        if (c.status !== "APPROVED_BY_AI" && c.status !== "REVIEW_REQUIRED") {
          return apiError(
            route,
            409,
            "CAMPAIGN_NOT_REVIEWABLE",
            "Cette campagne ne peut pas être validée dans son état actuel.",
          );
        }
        if (c.status === "REVIEW_REQUIRED" && body.overrideAi !== true) {
          return apiError(
            route,
            400,
            "AI_OVERRIDE_REQUIRED",
            "Confirmez la dérogation à l'avis de l'IA.",
          );
        }
        if (c.endDate && c.endDate < today()) {
          return apiError(
            route,
            409,
            "CAMPAIGN_PERIOD_OVER",
            "La période de la campagne est terminée.",
          );
        }
        const pending = state.reservations.filter(
          (r) =>
            r.campaignId === id && r.reservationStatus === "TEMPORAIRE" && r.endDate >= today(),
        );
        if (pending.length === 0) {
          return apiError(
            route,
            409,
            "NO_RESERVATION_TO_CONFIRM",
            "Aucune réservation à confirmer.",
          );
        }
        const override = c.status === "REVIEW_REQUIRED";
        for (const r of pending) r.reservationStatus = "CONFIRMEE";
        const active = c.startDate !== null && c.startDate <= today();
        Object.assign(c, {
          adminStatus: "VALIDATED",
          aiOverride: override,
          adminComment: body.comment ?? null,
          priorityScore: body.priorityScore ?? c.priorityScore,
          status: active ? "ACTIVE" : "VALIDATED_BY_ADMIN",
          validatedAt: now,
          activatedAt: active ? now : null,
          rejectionReason: null,
        } satisfies Partial<CampaignResponse>);
        const report = state.aiReports.find((r) => r.campaignId === id);
        if (report) report.adminDecision = "VALIDATED";
        logDecision(override ? "VALIDATED_OVERRIDE" : "VALIDATED", body.comment ?? null);
        audit(
          override ? "CAMPAIGN_VALIDATED_OVERRIDE" : "CAMPAIGN_VALIDATED",
          "CAMPAIGN",
          id,
          `Campagne « ${c.name} » validée`,
        );
        return json(route, 200, campaignView(c));
      }
      if (seg[3] === "reject" && method === "POST") {
        const body = bodyOf<{ reason?: string }>(request);
        const reason = (body.reason ?? url.searchParams.get("reason") ?? "").trim();
        if (reason.length < 3) {
          return apiError(route, 400, "REJECT_REASON_REQUIRED", "Indiquez le motif du refus.");
        }
        if (
          ![
            "APPROVED_BY_AI",
            "REVIEW_REQUIRED",
            "REJECTED_BY_AI",
            "VALIDATED_BY_ADMIN",
            "ACTIVE",
          ].includes(c.status)
        ) {
          return apiError(
            route,
            409,
            "CAMPAIGN_NOT_REVIEWABLE",
            "Cette campagne ne peut pas être refusée dans son état actuel.",
          );
        }
        for (const r of state.reservations) {
          if (r.campaignId === id && holding(r)) {
            r.reservationStatus = "ANNULEE";
            r.cancelledAt = now;
            r.cancelReason = reason;
          }
        }
        Object.assign(c, {
          status: "BLOCKED",
          adminStatus: "REJECTED",
          rejectionReason: reason,
        } satisfies Partial<CampaignResponse>);
        const report = state.aiReports.find((r) => r.campaignId === id);
        if (report) report.adminDecision = "REJECTED";
        logDecision("REJECTED", reason);
        audit("CAMPAIGN_REJECTED", "CAMPAIGN", id, `Campagne « ${c.name} » refusée`);
        return json(route, 200, campaignView(c));
      }
      if (seg[3] === "priority" && method === "PUT") {
        const body = bodyOf<{ priorityScore?: number }>(request);
        if (
          !["APPROVED_BY_AI", "REVIEW_REQUIRED", "VALIDATED_BY_ADMIN", "ACTIVE"].includes(c.status)
        ) {
          return apiError(
            route,
            409,
            "PRIORITY_NOT_EDITABLE",
            "La priorité ne peut pas être modifiée.",
          );
        }
        const p = Number(body.priorityScore);
        if (!Number.isInteger(p) || p < 0 || p > 10) {
          return apiError(route, 400, "VALIDATION_FAILED", "Certains champs sont invalides.", {
            priorityScore: "Doit être compris entre 0 et 10.",
          });
        }
        c.priorityScore = p;
        audit("CAMPAIGN_PRIORITY_CHANGED", "CAMPAIGN", id, `Priorité de « ${c.name} » : ${p}`);
        return json(route, 200, campaignView(c));
      }
    }

    // ---- Admin users, clients, roles, audit
    if (
      seg[0] === "admin" &&
      (seg[1] === "users" || seg[1] === "clients" || seg[1] === "roles" || seg[1] === "audit")
    ) {
      if (role !== "ADMINISTRATEUR" && role !== "SUPERVISEUR") return denied(route);
      const writes = method !== "GET";
      if (writes && !isAdmin) return denied(route);
      if (seg[1] === "roles" && method === "GET") {
        return json(route, 200, [
          {
            code: "ADMINISTRATEUR",
            name: "Administrateur",
            description: "Toutes les actions du back-office.",
            permissions: ["*"],
          },
          {
            code: "SUPERVISEUR",
            name: "Superviseur",
            description: "Consultation du back-office.",
            permissions: ["read"],
          },
          {
            code: "OPERATEUR",
            name: "Opérateur",
            description: "Réseau, urgences et journal de diffusion.",
            permissions: ["network:read", "diffusion:read"],
          },
          {
            code: "ANNONCEUR",
            name: "Annonceur",
            description: "Espace annonceur.",
            permissions: ["campaigns:own"],
          },
        ]);
      }
      if (seg[1] === "audit" && method === "GET") {
        const actions = listParam(url, "action");
        const entityType = url.searchParams.get("entityType");
        const entityId = url.searchParams.get("entityId");
        const actorId = numParam(url, "actorId");
        const items = state.auditLogs
          .filter((a) => !actions || actions.includes(a.action))
          .filter((a) => !entityType || a.entityType === entityType)
          .filter((a) => !entityId || a.entityId === entityId)
          .filter((a) => actorId === null || a.actorUserId === actorId)
          .sort(byCreatedDesc);
        return json(route, 200, paginate(items, url));
      }
      if (seg[1] === "clients" && seg[3] === "validation" && method === "POST") {
        const clientId = Number(seg[2]);
        const target = state.users.find((u) => u.client?.clientId === clientId);
        if (!target?.client)
          return apiError(route, 404, "CLIENT_NOT_FOUND", "Annonceur introuvable.");
        const body = bodyOf<{
          validationStatus?: AdminUserResponse["role"];
          trustLevel?: number;
          notes?: string | null;
        }>(request);
        Object.assign(target.client, {
          validationStatus: body.validationStatus ?? target.client.validationStatus,
          trustLevel: body.trustLevel ?? target.client.trustLevel,
        });
        target.clientNotes = body.notes ?? target.clientNotes;
        audit(
          "CLIENT_VALIDATION_CHANGED",
          "CLIENT",
          clientId,
          `Validation de « ${target.societe ?? target.nom} » modifiée`,
        );
        return json(route, 200, target);
      }
      if (seg[1] === "users") {
        if (seg.length === 2 && method === "GET") {
          const q = normalizeText(url.searchParams.get("q") ?? "");
          const roles = listParam(url, "role");
          const active = url.searchParams.get("active");
          const validation = listParam(url, "validationStatus");
          const items = state.users
            .filter(
              (u) => !q || normalizeText(`${u.email} ${u.nom} ${u.societe ?? ""}`).includes(q),
            )
            .filter((u) => !roles || roles.includes(u.role))
            .filter((u) => active === null || String(u.isActive) === active)
            .filter(
              (u) =>
                !validation ||
                (u.client !== null && validation.includes(u.client.validationStatus)),
            )
            .sort(byCreatedDesc);
          return json(route, 200, paginate(items, url));
        }
        if (seg.length === 2 && method === "POST") {
          const body = bodyOf<{
            email?: string;
            password?: string;
            nom?: string;
            role?: RoleCode;
            societe?: string | null;
            telephone?: string | null;
          }>(request);
          if (body.role === "ANNONCEUR" || !body.role) {
            return apiError(
              route,
              400,
              "ROLE_NOT_ALLOWED",
              "Ce rôle ne peut pas être attribué ici.",
            );
          }
          if (state.users.some((u) => u.email.toLowerCase() === body.email?.toLowerCase())) {
            return apiError(
              route,
              409,
              "EMAIL_ALREADY_REGISTERED",
              "Un compte existe déjà avec cet e-mail.",
            );
          }
          const created: AdminUserResponse = {
            userId: Math.max(...state.users.map((u) => u.userId)) + 1,
            email: body.email ?? "",
            nom: body.nom ?? "",
            role: body.role,
            societe: body.societe ?? null,
            telephone: body.telephone ?? null,
            adresse: null,
            logoUrl: null,
            isActive: true,
            lastLoginAt: null,
            createdAt: new Date().toISOString(),
            client: null,
            activeSessions: 0,
            campaignsCount: 0,
            clientNotes: null,
          };
          state.users.push(created);
          audit("USER_CREATED", "USER", created.userId, `Compte ${created.email} créé`);
          return json(route, 201, created);
        }
        const userId = Number(seg[2]);
        const target = state.users.find((u) => u.userId === userId);
        if (!target) return apiError(route, 404, "USER_NOT_FOUND", "Compte introuvable.");
        if (seg.length === 3 && method === "GET") return json(route, 200, target);
        if (seg.length === 3 && method === "PUT") {
          const body = bodyOf<{
            nom?: string;
            societe?: string | null;
            telephone?: string | null;
            adresse?: string | null;
            role?: RoleCode | null;
          }>(request);
          if (
            body.role &&
            (body.role === "ANNONCEUR" || target.role === "ANNONCEUR" || userId === user.userId)
          ) {
            if (body.role !== target.role) {
              return apiError(
                route,
                400,
                "ROLE_NOT_ALLOWED",
                "Ce rôle ne peut pas être attribué ici.",
              );
            }
          }
          Object.assign(target, {
            nom: body.nom ?? target.nom,
            societe: body.societe ?? null,
            telephone: body.telephone ?? null,
            adresse: body.adresse ?? null,
            role: body.role ?? target.role,
          });
          audit("USER_UPDATED", "USER", userId, `Compte ${target.email} modifié`);
          return json(route, 200, target);
        }
        if ((seg[3] === "activate" || seg[3] === "deactivate") && method === "POST") {
          const activate = seg[3] === "activate";
          if (!activate && userId === user.userId) {
            return apiError(
              route,
              400,
              "CANNOT_DEACTIVATE_SELF",
              "Vous ne pouvez pas désactiver votre propre compte.",
            );
          }
          if (
            !activate &&
            target.role === "ADMINISTRATEUR" &&
            state.users.filter((u) => u.role === "ADMINISTRATEUR" && u.isActive).length <= 1
          ) {
            return apiError(
              route,
              400,
              "LAST_ADMIN",
              "Impossible : c'est le dernier administrateur actif.",
            );
          }
          target.isActive = activate;
          if (!activate) target.activeSessions = 0;
          audit(
            activate ? "USER_ACTIVATED" : "USER_DEACTIVATED",
            "USER",
            userId,
            `Compte ${target.email} ${activate ? "activé" : "désactivé"}`,
          );
          return json(route, 200, target);
        }
        if (seg[3] === "login-history" && method === "GET")
          return json(route, 200, demoLoginHistory(target.email));
        if (seg[3] === "sessions" && seg.length === 4 && method === "GET") {
          return json(
            route,
            200,
            userId === 12 ? state.sessions.map((s) => ({ ...s, current: false })) : [],
          );
        }
        if (seg[3] === "sessions" && seg[4] === "revoke" && method === "POST") {
          const revoked = target.activeSessions;
          target.activeSessions = 0;
          audit("USER_SESSIONS_REVOKED", "USER", userId, `Sessions de ${target.email} révoquées`);
          return json(route, 200, { revoked });
        }
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
      if (seg[1] === "recommendations" && method === "GET") {
        const w: Window = windowFromUrl(url) ?? {
          startDate: today(),
          endDate: addDays(today(), 6),
          startTime: "07:00:00",
          endTime: "23:00:00",
        };
        const types = listParam(url, "supportType");
        const limit = Math.min(10, Math.max(1, numParam(url, "limit") ?? 3));
        const since = addDays(today(), -30);
        const rows = state.zones
          .filter((z) => z.isActive)
          .map((zone) => {
            const supports = state.supports.filter(
              (s) => s.zoneId === zone.id && (!types || types.includes(s.supportType)),
            );
            const items = availabilityItems(
              supports.map((s) => ({ support: s, distanceKm: null })),
              w,
              null,
            );
            const summary = summarize(items);
            const recent = supports.length
              ? logsIn(since, today(), (l) => l.zoneId === zone.id && l.contentType === "PUBLICITE")
                  .length / supports.length
              : 0;
            return { zone, supports, summary, recent };
          })
          .filter((r) => r.summary.availableSupports > 0);
        const maxViews = Math.max(0, ...rows.map((r) => r.summary.estimatedViewsAvailable));
        const maxRecent = Math.max(0, ...rows.map((r) => r.recent));
        const result: ZoneRecommendation[] = rows
          .map((r) => ({
            zone: r.zone,
            score: Math.round(
              (maxViews ? (50 * r.summary.estimatedViewsAvailable) / maxViews : 0) +
                (r.summary.totalSupports
                  ? (30 * r.summary.availableSupports) / r.summary.totalSupports
                  : 0) +
                (maxRecent ? (20 * r.recent) / maxRecent : 0),
            ),
            totalSupports: r.summary.totalSupports,
            availableSupports: r.summary.availableSupports,
            estimatedViewsAvailable: r.summary.estimatedViewsAvailable,
            estimatedCostAvailable: r.summary.estimatedCostAvailable,
            recentViewsPerSupport: Math.round(r.recent * 10) / 10,
            reasons: [
              `${r.summary.availableSupports} Porteur${r.summary.availableSupports > 1 ? "s" : ""} disponible${r.summary.availableSupports > 1 ? "s" : ""} sur ${r.summary.totalSupports}`,
              ...(r.recent > 0 && r.recent === maxRecent ? ["Forte audience récente"] : []),
            ],
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
        return json(route, 200, result);
      }
      if (seg.length === 1 && method === "POST") {
        if (!isAdmin) return denied(route);
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
        audit("ZONE_CREATED", "ZONE", zone.id, `Zone « ${zone.name} » créée`);
        return json(route, 201, zone);
      }
      const id = Number(seg[1]);
      const zone = zoneOf(id);
      if (!zone) return apiError(route, 404, "ZONE_NOT_FOUND", "Cette zone est introuvable.");
      if (method === "GET") return json(route, 200, zone);
      if (!isAdmin) return denied(route);
      if (method === "PUT") {
        const body = bodyOf<ZoneRequest>(request);
        Object.assign(zone, {
          name: body.name,
          latitude: body.latitude,
          longitude: body.longitude,
          radiusKm: body.radiusKm ?? null,
          isActive: body.isActive ?? zone.isActive,
        });
        audit("ZONE_UPDATED", "ZONE", id, `Zone « ${zone.name} » modifiée`);
        return json(route, 200, zone);
      }
      if (method === "DELETE") {
        const used =
          state.supports.some((s) => s.zoneId === id) ||
          state.reservations.some((r) => r.zoneId === id);
        if (used) {
          return apiError(
            route,
            409,
            "ZONE_IN_USE",
            "Cette zone est encore utilisée par des Porteurs ou des réservations.",
          );
        }
        state.zones = state.zones.filter((z) => z.id !== id);
        audit("ZONE_DELETED", "ZONE", id, `Zone « ${zone.name} » supprimée`);
        return empty(route);
      }
    }

    // ---- Supports
    if (seg[0] === "supports") {
      // Round 2: player device key status (every ACTIF Porteur is paired in the demo data).
      if (seg[1] === "device-keys" && seg.length === 2 && method === "GET") {
        if (!isStaff) return denied(route);
        return json(
          route,
          200,
          state.supports.map((s) => {
            const paired = s.technicalStatus === "ACTIF";
            return {
              supportId: s.id,
              supportName: s.name,
              paired,
              keyPrefix: paired ? "tpd_e2eDemoK" : null,
              createdAt: paired ? "2026-09-01T08:00:00Z" : null,
              lastUsedAt: null,
              lastUsedIp: null,
            };
          }),
        );
      }
      if (seg.length === 1 && method === "GET") {
        const zoneIds = listParam(url, "zoneId")?.map(Number) ?? null;
        const types = listParam(url, "supportType");
        const tech = listParam(url, "technicalStatus");
        return json(
          route,
          200,
          state.supports
            .filter((s) => !zoneIds || zoneIds.includes(s.zoneId))
            .filter((s) => !types || types.includes(s.supportType))
            .filter((s) => !tech || tech.includes(s.technicalStatus))
            .map(supportView),
        );
      }
      if (seg[1] === "zone" && method === "GET") {
        const zoneId = Number(seg[2]);
        return json(route, 200, state.supports.filter((s) => s.zoneId === zoneId).map(supportView));
      }
      if (seg.length === 1 && method === "POST") {
        if (!isAdmin) return denied(route);
        const body = bodyOf<SupportRequest>(request);
        if (!zoneOf(body.zoneId)) {
          return apiError(route, 404, "ZONE_NOT_FOUND", "Cette zone est introuvable.");
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
          visibilityScore: null,
        });
        const invalid = porteurFieldError(body);
        if (invalid)
          return apiError(
            route,
            400,
            "VALIDATION_FAILED",
            "Certains champs sont invalides.",
            invalid,
          );
        applyPorteurFields(support, body);
        state.supports.push(support);
        audit("SUPPORT_CREATED", "SUPPORT", support.id, `Porteur « ${support.name} » créé`);
        return json(route, 201, support);
      }
      const id = Number(seg[1]);
      if (!Number.isInteger(id)) {
        return apiError(route, 400, "INVALID_PARAMETER", "Identifiant de Porteur invalide.");
      }
      const support = supportOf(id);
      if (!support) return apiError(route, 404, "SUPPORT_NOT_FOUND", "Ce Porteur est introuvable.");

      // GET /supports/{id}/availability?from&to[&startTime&endTime] — reservations + blocks.
      if (seg[2] === "availability" && method === "GET") {
        const from = url.searchParams.get("from") ?? isoDay(0);
        const to = url.searchParams.get("to") ?? addDays(from, 90);
        if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
          return apiError(route, 400, "INVALID_PARAMETER", "Date invalide.");
        }
        if (to < from)
          return apiError(route, 400, "INVALID_RANGE", "La période demandée est invalide.");
        const st = apiTime(url.searchParams.get("startTime"));
        const et = apiTime(url.searchParams.get("endTime"));
        const timeOk = (s: string, e: string) => !st || !et || (s < et && st < e);
        const slots: SupportAvailabilitySlot[] = [
          ...state.reservations
            .filter(
              (r) =>
                r.supportId === id &&
                holding(r) &&
                datesOverlap(r.startDate, r.endDate, from, to) &&
                timeOk(r.startTime, r.endTime),
            )
            .map((r) => ({
              startDate: r.startDate,
              endDate: r.endDate,
              startTime: r.startTime,
              endTime: r.endTime,
              kind: "RESERVATION" as const,
              reservationStatus: r.reservationStatus as "TEMPORAIRE" | "CONFIRMEE",
              availabilityStatus: r.availabilityStatus,
              reason: null,
            })),
          ...state.supportBlocks
            .filter(
              (b) =>
                b.supportId === id &&
                b.date >= from &&
                b.date <= to &&
                timeOk(b.startTime, b.endTime),
            )
            .map((b) => ({
              startDate: b.date,
              endDate: b.date,
              startTime: b.startTime,
              endTime: b.endTime,
              kind: "BLOCAGE" as const,
              reservationStatus: null,
              availabilityStatus: b.availabilityStatus,
              reason: b.reason,
            })),
        ].sort(
          (a, b) =>
            a.startDate.localeCompare(b.startDate) ||
            a.endDate.localeCompare(b.endDate) ||
            a.startTime.localeCompare(b.startTime),
        );
        return json(route, 200, slots);
      }

      if (seg[2] === "blocks") {
        if (seg.length === 3 && method === "GET") {
          const from = url.searchParams.get("from");
          const to = url.searchParams.get("to");
          return json(
            route,
            200,
            state.supportBlocks.filter(
              (b) => b.supportId === id && (!from || b.date >= from) && (!to || b.date <= to),
            ),
          );
        }
        if (!isAdmin) return denied(route);
        if (seg.length === 3 && method === "POST") {
          const body = bodyOf<SupportBlockRequest>(request);
          const st = apiTime(body.startTime);
          const et = apiTime(body.endTime);
          if (
            !ISO_DATE.test(body.startDate ?? "") ||
            !ISO_DATE.test(body.endDate ?? "") ||
            body.endDate < body.startDate
          ) {
            return apiError(route, 400, "INVALID_RANGE", "La période demandée est invalide.");
          }
          if (daysInclusive(body.startDate, body.endDate) > 92) {
            return apiError(route, 400, "INVALID_RANGE", "92 jours maximum.");
          }
          if (!st || !et || st >= et) {
            return apiError(
              route,
              400,
              "INVALID_TIME_RANGE",
              "L'heure de fin doit être après l'heure de début.",
            );
          }
          const created = [];
          for (let d = body.startDate; d <= body.endDate; d = addDays(d, 1)) {
            state.seq.block += 1;
            const block = {
              id: state.seq.block,
              supportId: id,
              date: d,
              startTime: st,
              endTime: et,
              availabilityStatus: body.availabilityStatus,
              reason: body.reason ?? null,
              createdAt: new Date().toISOString(),
            };
            state.supportBlocks.push(block);
            created.push(block);
          }
          audit(
            "SUPPORT_BLOCK_CREATED",
            "SUPPORT",
            id,
            `Indisponibilité ajoutée sur « ${support.name} »`,
          );
          return json(route, 201, created);
        }
        if (seg.length === 4 && method === "DELETE") {
          const blockId = Number(seg[3]);
          if (!state.supportBlocks.some((b) => b.id === blockId && b.supportId === id)) {
            return apiError(
              route,
              404,
              "SUPPORT_BLOCK_NOT_FOUND",
              "Cette indisponibilité est introuvable.",
            );
          }
          state.supportBlocks = state.supportBlocks.filter((b) => b.id !== blockId);
          audit(
            "SUPPORT_BLOCK_DELETED",
            "SUPPORT",
            id,
            `Indisponibilité supprimée sur « ${support.name} »`,
          );
          return empty(route);
        }
      }

      if (seg.length === 2 && method === "GET") return json(route, 200, supportView(support));
      if (seg.length === 2 && method === "PUT") {
        if (!isAdmin) return denied(route);
        const body = bodyOf<SupportRequest>(request);
        const invalid = porteurFieldError(body);
        if (invalid)
          return apiError(
            route,
            400,
            "VALIDATION_FAILED",
            "Certains champs sont invalides.",
            invalid,
          );
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
        audit("SUPPORT_UPDATED", "SUPPORT", id, `Porteur « ${support.name} » modifié`);
        return json(route, 200, supportView(support));
      }
    }

    // ---- Availability (GET /availability)
    if (seg[0] === "availability" && seg.length === 1 && method === "GET") {
      const w = windowFromUrl(url);
      if (!w) return apiError(route, 400, "MISSING_PARAMETER", "Période et horaires obligatoires.");
      if (w.endDate < w.startDate || daysInclusive(w.startDate, w.endDate) > 366) {
        return apiError(route, 400, "INVALID_RANGE", "La période demandée est invalide.");
      }
      if (w.startTime >= w.endTime) {
        return apiError(
          route,
          400,
          "INVALID_TIME_RANGE",
          "L'heure de fin doit être après l'heure de début.",
        );
      }
      const campaignId = numParam(url, "campaignId");
      const lat = numParam(url, "lat");
      const lng = numParam(url, "lng");
      const radiusKm = numParam(url, "radiusKm");
      const zoneId = numParam(url, "zoneId");
      const types = listParam(url, "supportType");
      const statuses = listParam(url, "status");
      let candidates: { support: SupportResponse; distanceKm: number | null }[];
      if (campaignId !== null) {
        const c = findCampaign(campaignId);
        if (!readable(c) || !c) return notFound(campaignId);
        const circles = c.zones ?? [];
        candidates = state.supports
          .filter((s) => insideCircles(s, circles))
          .map((s) => ({
            support: s,
            distanceKm:
              Math.round(
                Math.min(
                  ...circles.map((z) =>
                    distanceKm(s.latitude, s.longitude, z.latitude, z.longitude),
                  ),
                ) * 100,
              ) / 100,
          }));
      } else if (lat !== null && lng !== null && radiusKm !== null) {
        candidates = state.supports
          .map((s) => ({
            support: s,
            distanceKm: Math.round(distanceKm(lat, lng, s.latitude, s.longitude) * 100) / 100,
          }))
          .filter((x) => x.distanceKm <= radiusKm);
      } else if (zoneId !== null) {
        candidates = state.supports
          .filter((s) => s.zoneId === zoneId)
          .map((s) => ({ support: s, distanceKm: null }));
      } else {
        return apiError(
          route,
          400,
          "MISSING_PARAMETER",
          "Indiquez une campagne, un cercle ou une zone.",
        );
      }
      candidates = candidates.filter((x) => !types || types.includes(x.support.supportType));
      const all = availabilityItems(candidates, w, campaignId);
      const items = all.filter((i) => !statuses || statuses.includes(i.status));
      const summary = summarize(items);
      const alternatives: AlternativeSlot[] = [];
      if (summary.availableSupports === 0 && candidates.length > 0) {
        const tries: (Window & { preset: SlotPreset | null })[] = [
          ...SLOT_PRESETS.filter((p) => p.startTime !== w.startTime || p.endTime !== w.endTime).map(
            (p) => ({
              ...w,
              startTime: p.startTime,
              endTime: p.endTime,
              preset: p.preset,
            }),
          ),
          ...[7, 14, 21, 28].map((d) => ({
            ...w,
            startDate: addDays(w.startDate, d),
            endDate: addDays(w.endDate, d),
            preset:
              SLOT_PRESETS.find((p) => p.startTime === w.startTime && p.endTime === w.endTime)
                ?.preset ?? null,
          })),
        ];
        for (const t of tries) {
          const s = summarize(availabilityItems(candidates, t, campaignId));
          if (s.availableSupports > 0) {
            alternatives.push({
              ...t,
              availableSupports: s.availableSupports,
              estimatedViewsAvailable: s.estimatedViewsAvailable,
            });
          }
        }
        alternatives.sort(
          (a, b) =>
            b.availableSupports - a.availableSupports || a.startDate.localeCompare(b.startDate),
        );
        alternatives.splice(3);
      }
      return json(route, 200, {
        ...w,
        days: daysInclusive(w.startDate, w.endDate),
        hoursPerDay: hoursPerDay(w.startTime, w.endTime),
        supports: items,
        summary,
        alternatives,
      });
    }

    // ---- Estimates
    if (seg[0] === "estimates") {
      if (seg.length === 1 && method === "POST") {
        const body = bodyOf<{ supportIds?: number[] } & Partial<Window>>(request);
        const st = apiTime(body.startTime);
        const et = apiTime(body.endTime);
        if (!body.startDate || !body.endDate || !st || !et || !body.supportIds?.length) {
          return apiError(route, 400, "VALIDATION_FAILED", "Certains champs sont invalides.");
        }
        const w: Window = {
          startDate: body.startDate,
          endDate: body.endDate,
          startTime: st,
          endTime: et,
        };
        const lines = body.supportIds
          .map((sid) => supportOf(sid))
          .filter((s): s is SupportResponse => Boolean(s))
          .map((s) => ({
            supportId: s.id,
            supportName: s.name,
            supportType: s.supportType,
            zoneName: s.zoneName,
            ...estimateFor(s, w),
          }));
        return json(route, 200, {
          days: daysInclusive(w.startDate, w.endDate),
          hoursPerDay: hoursPerDay(w.startTime, w.endTime),
          lines,
          totalViews: lines.reduce((s, l) => s + l.estimatedViews, 0),
          totalCost: Math.round(lines.reduce((s, l) => s + l.estimatedCost, 0) * 100) / 100,
        });
      }
      if (seg[1] === "campaign" && method === "GET") {
        const id = Number(seg[2]);
        const c = findCampaign(id);
        if (!readable(c) || !c) return notFound(id);
        const lines = state.reservations
          .filter((r) => r.campaignId === id && holding(r))
          .map((r) => ({
            reservationId: r.id,
            supportId: r.supportId,
            supportName: supportOf(r.supportId)?.name ?? "",
            zoneName: zoneOf(r.zoneId)?.name ?? "",
            reservationStatus: r.reservationStatus as "TEMPORAIRE" | "CONFIRMEE",
            startDate: r.startDate,
            endDate: r.endDate,
            startTime: r.startTime,
            endTime: r.endTime,
            estimatedViews: r.estimatedViews,
            estimatedCost: r.estimatedCost,
          }));
        const totalCost = Math.round(lines.reduce((s, l) => s + l.estimatedCost, 0) * 100) / 100;
        return json(route, 200, {
          campaignId: id,
          budget: c.budget,
          consumedBudget: c.consumedBudget,
          remainingBudget: Math.round((c.budget - c.consumedBudget) * 100) / 100,
          lines,
          totalViews: lines.reduce((s, l) => s + l.estimatedViews, 0),
          totalCost,
          budgetCoverage: totalCost > 0 ? Math.round((c.budget / totalCost) * 100) / 100 : null,
          budgetSufficient: c.budget >= totalCost,
        });
      }
    }

    // ---- Reservations
    if (seg[0] === "reservations") {
      if (seg.length === 1 && method === "GET") {
        if (!isStaff) return denied(route);
        const statuses = listParam(url, "status");
        const campaignId = numParam(url, "campaignId");
        const supportId = numParam(url, "supportId");
        const zoneId = numParam(url, "zoneId");
        const clientId = numParam(url, "clientId");
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const items = state.reservations
          .filter((r) => !statuses || statuses.includes(r.reservationStatus))
          .filter((r) => campaignId === null || r.campaignId === campaignId)
          .filter((r) => supportId === null || r.supportId === supportId)
          .filter((r) => zoneId === null || r.zoneId === zoneId)
          .filter((r) => clientId === null || findCampaign(r.campaignId)?.clientId === clientId)
          .filter((r) =>
            datesOverlap(r.startDate, r.endDate, from ?? "0000-01-01", to ?? "9999-12-31"),
          )
          .map((r) => reservationView(r, role))
          .sort(byCreatedDesc);
        return json(route, 200, paginate(items, url));
      }
      if (seg[1] === "mine" && method === "GET") {
        if (!isAnnonceur) return denied(route);
        const statuses = listParam(url, "status");
        const campaignId = numParam(url, "campaignId");
        return json(
          route,
          200,
          state.reservations
            .filter((r) => findCampaign(r.campaignId)?.clientId === DEMO_CLIENT_ID)
            .filter((r) => !statuses || statuses.includes(r.reservationStatus))
            .filter((r) => campaignId === null || r.campaignId === campaignId)
            .map((r) => reservationView(r, role))
            .sort(byCreatedDesc),
        );
      }
      if (seg[1] === "campaign" && method === "GET") {
        const id = Number(seg[2]);
        const c = findCampaign(id);
        if (!readable(c)) return notFound(id);
        return json(
          route,
          200,
          state.reservations
            .filter((r) => r.campaignId === id)
            .map((r) => reservationView(r, role)),
        );
      }
      if (seg[1] === "conflicts" && method === "GET") {
        if (role !== "ADMINISTRATEUR" && role !== "SUPERVISEUR") return denied(route);
        const from = url.searchParams.get("from") ?? today();
        const to = url.searchParams.get("to") ?? addDays(today(), 90);
        const zoneId = numParam(url, "zoneId");
        const supportId = numParam(url, "supportId");
        const seen = new Set<string>();
        const conflicts: ReservationConflict[] = [];
        for (const s of state.supports) {
          if (
            (zoneId !== null && s.zoneId !== zoneId) ||
            (supportId !== null && s.id !== supportId)
          )
            continue;
          const active = state.reservations.filter(
            (r) =>
              r.supportId === s.id && holding(r) && datesOverlap(r.startDate, r.endDate, from, to),
          );
          for (const r of active) {
            const set = active.filter((o) => windowsOverlap(o, r));
            const capacity = Math.max(1, s.diffusionCapacity);
            const severity =
              set.length > capacity
                ? "CONFLIT"
                : set.length === capacity && capacity >= 2
                  ? "SATURE"
                  : null;
            if (!severity) continue;
            const key = set
              .map((x) => x.id)
              .sort((a, b) => a - b)
              .join(",");
            if (seen.has(key)) continue;
            seen.add(key);
            const maxOf = (xs: string[]) => xs.reduce((m, x) => (x > m ? x : m));
            const minOf = (xs: string[]) => xs.reduce((m, x) => (x < m ? x : m));
            conflicts.push({
              supportId: s.id,
              supportName: s.name,
              zoneId: s.zoneId,
              zoneName: s.zoneName,
              capacity,
              severity,
              overlapStartDate: maxOf(set.map((x) => x.startDate)),
              overlapEndDate: minOf(set.map((x) => x.endDate)),
              overlapStartTime: maxOf(set.map((x) => x.startTime)),
              overlapEndTime: minOf(set.map((x) => x.endTime)),
              reservations: set.map((x) => reservationView(x, role)),
            });
          }
        }
        return json(route, 200, conflicts);
      }
      if (seg[2] === "cancel" && method === "POST") {
        const id = Number(seg[1]);
        const r = state.reservations.find((x) => x.id === id);
        if (!r)
          return apiError(
            route,
            404,
            "RESERVATION_NOT_FOUND",
            "Cette réservation est introuvable.",
          );
        const c = findCampaign(r.campaignId);
        if (!isAdmin && !ownCampaign(c)) return denied(route);
        if (!reservationView(r, role).cancellable) {
          return apiError(
            route,
            409,
            "RESERVATION_NOT_CANCELLABLE",
            "Cette réservation ne peut plus être annulée.",
          );
        }
        const body = bodyOf<{ reason?: string | null }>(request);
        Object.assign(r, {
          reservationStatus: "ANNULEE",
          cancelledAt: new Date().toISOString(),
          cancelReason: body.reason ?? null,
        } satisfies Partial<ReservationResponse>);
        if (isAdmin)
          audit("RESERVATION_CANCELLED", "RESERVATION", id, `Réservation #${id} annulée`);
        return json(route, 200, reservationView(r, role));
      }

      type CreateBody = {
        campaignId: number;
        supportId?: number;
        supportIds?: number[];
      } & Partial<Window>;
      /** Checks of contract §2.4 for one support. Returns the error code or the reservation to create. */
      const prepareReservation = (
        c: CampaignResponse,
        supportIdValue: number,
        body: CreateBody,
      ): { code: string; status: number; message: string } | ReservationResponse => {
        const support = supportOf(supportIdValue);
        if (!support)
          return { code: "SUPPORT_NOT_FOUND", status: 404, message: "Ce Porteur est introuvable." };
        const w: Window = {
          startDate: body.startDate ?? c.startDate ?? "",
          endDate: body.endDate ?? c.endDate ?? "",
          startTime: apiTime(body.startTime) ?? c.startTime ?? "",
          endTime: apiTime(body.endTime) ?? c.endTime ?? "",
        };
        if (
          !ISO_DATE.test(w.startDate) ||
          !ISO_DATE.test(w.endDate) ||
          !w.startTime ||
          !w.endTime ||
          w.endDate < w.startDate ||
          w.startTime >= w.endTime
        ) {
          return {
            code: "VALIDATION_FAILED",
            status: 400,
            message: "Période ou horaires invalides.",
          };
        }
        if (w.startDate < today()) {
          return {
            code: "START_DATE_IN_PAST",
            status: 400,
            message: "La date de début ne peut pas être dans le passé.",
          };
        }
        if (
          c.startDate &&
          c.endDate &&
          c.startTime &&
          c.endTime &&
          (w.startDate < c.startDate ||
            w.endDate > c.endDate ||
            w.startTime < c.startTime ||
            w.endTime > c.endTime)
        ) {
          return {
            code: "RESERVATION_OUTSIDE_CAMPAIGN_PERIOD",
            status: 400,
            message: "Le créneau doit rester dans la période de la campagne.",
          };
        }
        if ((c.zones ?? []).length === 0) {
          // Compat: pre-v2 screens book without choosing zones first.
          const zone = zoneOf(support.zoneId);
          if (zone) {
            state.seq.campaignZone += 1;
            c.zones = [
              {
                id: state.seq.campaignZone,
                zoneId: zone.id,
                zoneName: zone.name,
                label: null,
                latitude: zone.latitude,
                longitude: zone.longitude,
                radiusKm: Math.max(
                  zone.radiusKm ?? 3,
                  distanceKm(zone.latitude, zone.longitude, support.latitude, support.longitude) +
                    0.5,
                ),
                supportsInside: 0,
              },
            ];
          }
        }
        if (!insideCircles(support, c.zones ?? [])) {
          return {
            code: "SUPPORT_OUTSIDE_CAMPAIGN_ZONE",
            status: 400,
            message: "Ce Porteur est en dehors des zones ciblées.",
          };
        }
        if (
          state.reservations.some(
            (r) =>
              r.campaignId === c.id &&
              r.supportId === support.id &&
              holding(r) &&
              windowsOverlap(r, w),
          )
        ) {
          return {
            code: "RESERVATION_DUPLICATE",
            status: 409,
            message: "Ce Porteur est déjà réservé pour cette campagne.",
          };
        }
        const a = availabilityOf(support, w, c.id);
        if (a.status === "MAINTENANCE" || a.status === "HORS_LIGNE") {
          return {
            code: "SUPPORT_UNAVAILABLE",
            status: 409,
            message: "Ce Porteur est indisponible sur ce créneau.",
          };
        }
        if (a.status === "RESERVE" || a.status === "OCCUPE") {
          return {
            code: "SUPPORT_ALREADY_RESERVED",
            status: 409,
            message: "Ce Porteur est déjà réservé sur ce créneau.",
          };
        }
        return {
          id: 0,
          campaignId: c.id,
          campaignName: c.name,
          campaignStatus: c.status,
          clientCompanyName: c.clientCompanyName ?? null,
          zoneId: support.zoneId,
          zoneName: support.zoneName,
          supportId: support.id,
          supportName: support.name,
          supportType: support.supportType,
          ...w,
          availabilityStatus: "RESERVE",
          reservationStatus: "TEMPORAIRE",
          ...estimateFor(support, w),
          createdAt: new Date().toISOString(),
          cancelledAt: null,
          cancelReason: null,
          expiredAt: null,
          cancellable: true,
        };
      };

      if ((seg.length === 1 || seg[1] === "batch") && method === "POST") {
        if (!isAnnonceur) return denied(route);
        const body = bodyOf<CreateBody>(request);
        const c = findCampaign(Number(body.campaignId));
        if (!ownCampaign(c) || !c) return notFound(body.campaignId);
        if (c.status !== "BROUILLON") {
          return apiError(
            route,
            409,
            "CAMPAIGN_NOT_RESERVABLE",
            "On ne peut réserver que pour une campagne en brouillon.",
          );
        }
        if (seg.length === 1) {
          const prepared = prepareReservation(c, Number(body.supportId), body);
          if (!("id" in prepared))
            return apiError(route, prepared.status, prepared.code, prepared.message);
          prepared.id = nextId(state.reservations);
          state.reservations.push(prepared);
          return json(route, 201, reservationView(prepared, role));
        }
        const ids = body.supportIds ?? [];
        if (ids.length === 0 || ids.length > 50) {
          return apiError(route, 400, "VALIDATION_FAILED", "Entre 1 et 50 Porteurs.", {
            supportIds: "Entre 1 et 50 Porteurs.",
          });
        }
        const errors: Record<string, string> = {};
        const created: ReservationResponse[] = [];
        for (const sid of ids) {
          const prepared = prepareReservation(c, sid, body);
          if ("id" in prepared) created.push(prepared);
          else errors[String(sid)] = prepared.code;
        }
        if (Object.keys(errors).length > 0) {
          return apiError(
            route,
            409,
            "BATCH_CONFLICT",
            "Certains Porteurs ne sont plus disponibles : aucune réservation n'a été enregistrée.",
            errors,
          );
        }
        for (const r of created) {
          r.id = nextId(state.reservations);
          state.reservations.push(r);
        }
        return json(
          route,
          201,
          created.map((r) => reservationView(r, role)),
        );
      }
    }

    // ---- Statistics
    if (seg[0] === "statistics") {
      const from = url.searchParams.get("from") ?? addDays(today(), -29);
      const to = url.searchParams.get("to") ?? today();
      if (seg[1] === "dashboard" && method === "GET") {
        if (!isStaff) return denied(route);
        const cs = state.campaigns;
        const count = (...st: CampaignStatus[]) => cs.filter((c) => st.includes(c.status)).length;
        const rs = state.reservations;
        const logs = state.diffusionLogs;
        const supportsByStatus = { ACTIF: 0, INACTIF: 0, MAINTENANCE: 0, HORS_LIGNE: 0 };
        for (const s of state.supports) supportsByStatus[s.technicalStatus] += 1;
        return json(route, 200, {
          totalCampaigns: cs.length,
          activeCampaigns: count("ACTIVE"),
          pendingCampaigns: count("PENDING_AI_CHECK", "APPROVED_BY_AI", "REVIEW_REQUIRED"),
          aiPendingCampaigns: count("PENDING_AI_CHECK"),
          aiRejectedCampaigns: count("REJECTED_BY_AI"),
          availableSupports: supportsByStatus.ACTIF,
          confirmedReservations: rs.filter((r) => r.reservationStatus === "CONFIRMEE").length,
          totalViews: state.diffusionLogCount,
          estimatedBudget: cs
            .filter((c) => c.status !== "BROUILLON")
            .reduce((sum, c) => sum + c.budget, 0),
          consumedBudget: Math.round(cs.reduce((sum, c) => sum + c.consumedBudget, 0) * 100) / 100,
          aiFlaggedCampaigns: cs.filter(
            (c) => c.aiStatus === "REVIEW_REQUIRED" || c.aiStatus === "REJECTED",
          ).length,
          reviewRequiredCampaigns: count("REVIEW_REQUIRED"),
          approvedByAiCampaigns: count("APPROVED_BY_AI"),
          validatedCampaigns: count("VALIDATED_BY_ADMIN"),
          terminatedCampaigns: count("TERMINATED"),
          blockedCampaigns: count("BLOCKED"),
          draftCampaigns: count("BROUILLON"),
          totalClients: state.users.filter((u) => u.client).length,
          pendingClients: state.users.filter((u) => u.client?.validationStatus === "PENDING")
            .length,
          totalSupports: state.supports.length,
          supportsByStatus,
          totalZones: state.zones.length,
          activeZones: state.zones.filter((z) => z.isActive).length,
          temporaryReservations: rs.filter((r) => r.reservationStatus === "TEMPORAIRE").length,
          cancelledReservations: rs.filter((r) => r.reservationStatus === "ANNULEE").length,
          expiredReservations: rs.filter((r) => r.reservationStatus === "EXPIREE").length,
          totalDiffusions: logs.length,
          emergencyViews: logs.filter((l) => l.contentType === "URGENCE").length,
          defaultViews: logs.filter((l) => l.contentType === "DEFAUT").length,
          viewsToday: logs.filter((l) => logDay(l) === today() && l.contentType === "PUBLICITE")
            .length,
          totalClicks: logs.reduce((s, l) => s + l.clicks, 0),
          totalInteractions: logs.reduce((s, l) => s + l.interactions, 0),
          estimatedCost:
            Math.round(rs.filter(holding).reduce((s, r) => s + r.estimatedCost, 0) * 100) / 100,
          simulatedRevenue: cs
            .filter((c) => c.adminStatus === "VALIDATED")
            .reduce((s, c) => s + (c.estimatedCost ?? 0), 0),
          activeEmergencies: state.emergencies.filter((e) => emergencyState(e) === "EN_COURS")
            .length,
        });
      }
      if (seg[1] === "views" && method === "GET") {
        if (!isStaff) return denied(route);
        const groupBy = url.searchParams.get("groupBy") ?? "day";
        const contentType = url.searchParams.get("contentType") ?? "PUBLICITE";
        const campaignId = numParam(url, "campaignId");
        const supportId = numParam(url, "supportId");
        const zoneId = numParam(url, "zoneId");
        const logs = logsIn(
          from,
          to,
          (l) =>
            l.contentType === contentType &&
            (campaignId === null || l.campaignId === campaignId) &&
            (supportId === null || l.supportId === supportId) &&
            (zoneId === null || l.zoneId === zoneId),
        );
        const totals = (ls: DiffusionLogResponse[]) => ({
          views: ls.length,
          clicks: ls.reduce((s, l) => s + l.clicks, 0),
          interactions: ls.reduce((s, l) => s + l.interactions, 0),
          cost: Math.round(ls.reduce((s, l) => s + l.cost, 0) * 100) / 100,
        });
        let rows;
        if (groupBy === "day") {
          rows = dailyRows(from, to, logs).map((d) => ({
            key: d.date,
            label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`,
            views: d.views,
            clicks: d.clicks,
            interactions: d.interactions,
            cost: d.cost,
          }));
        } else {
          const keyOf = (l: DiffusionLogResponse) =>
            groupBy === "campaign" ? l.campaignId : groupBy === "support" ? l.supportId : l.zoneId;
          const labelOf = (l: DiffusionLogResponse) =>
            groupBy === "campaign"
              ? l.campaignName
              : groupBy === "support"
                ? l.supportName
                : l.zoneName;
          const keys = [...new Set(logs.map(keyOf).filter((k): k is number => k !== null))];
          rows = keys
            .map((k) => {
              const ls = logs.filter((l) => keyOf(l) === k);
              return {
                key: String(k),
                label: labelOf(ls[0] as DiffusionLogResponse) ?? "",
                ...totals(ls),
              };
            })
            .sort((a, b) => b.views - a.views);
        }
        return json(route, 200, { from, to, groupBy, rows, totals: totals(logs) });
      }
      if (seg[1] === "mine" && method === "GET") {
        if (!isAnnonceur) return denied(route);
        const mine = state.campaigns.filter((c) => c.clientId === DEMO_CLIENT_ID).map(campaignView);
        const ids = new Set(mine.map((c) => c.id));
        const logs = logsIn(
          from,
          to,
          (l) => l.contentType === "PUBLICITE" && l.campaignId !== null && ids.has(l.campaignId),
        );
        const statusCounts = Object.fromEntries(
          ALL_CAMPAIGN_STATUSES.map((s) => [s, mine.filter((c) => c.status === s).length]),
        );
        return json(route, 200, {
          from,
          to,
          totals: {
            campaigns: mine.length,
            activeCampaigns: mine.filter((c) => c.status === "ACTIVE").length,
            pendingCampaigns: mine.filter((c) =>
              ["PENDING_AI_CHECK", "APPROVED_BY_AI", "REVIEW_REQUIRED"].includes(c.status),
            ).length,
            views: logs.length,
            clicks: logs.reduce((s, l) => s + l.clicks, 0),
            interactions: logs.reduce((s, l) => s + l.interactions, 0),
            estimatedViews: mine.reduce((s, c) => s + c.estimatedViews, 0),
            estimatedCost:
              Math.round(mine.reduce((s, c) => s + (c.estimatedCost ?? 0), 0) * 100) / 100,
            estimatedBudget: mine
              .filter((c) => c.status !== "BROUILLON")
              .reduce((s, c) => s + c.budget, 0),
            consumedBudget: Math.round(mine.reduce((s, c) => s + c.consumedBudget, 0) * 100) / 100,
            confirmedReservations: state.reservations.filter(
              (r) => ids.has(r.campaignId) && r.reservationStatus === "CONFIRMEE",
            ).length,
          },
          statusCounts,
          daily: dailyRows(from, to, logs),
          byCampaign: mine.map((c) => {
            const ls = logs.filter((l) => l.campaignId === c.id);
            return {
              campaignId: c.id,
              name: c.name,
              status: c.status,
              views: ls.length,
              clicks: ls.reduce((s, l) => s + l.clicks, 0),
              interactions: ls.reduce((s, l) => s + l.interactions, 0),
              estimatedViews: c.estimatedViews,
              estimatedCost: c.estimatedCost ?? 0,
              budget: c.budget,
              consumedBudget: c.consumedBudget,
            };
          }),
          bySupport: bySupport(logs),
          byZone: byZone(logs),
        });
      }
      if (seg[1] === "campaigns" && method === "GET") {
        const id = Number(seg[2]);
        const c = findCampaign(id);
        if (!readable(c) || !c) return notFound(id);
        const view = campaignView(c);
        const rangeFrom =
          url.searchParams.get("from") ??
          (c.startDate && c.startDate <= today() ? c.startDate : addDays(today(), -29));
        const rangeTo =
          url.searchParams.get("to") ?? (c.endDate && c.endDate < today() ? c.endDate : today());
        const logs = logsIn(
          rangeFrom,
          rangeTo,
          (l) => l.contentType === "PUBLICITE" && l.campaignId === id,
        );
        return json(route, 200, {
          campaignId: id,
          name: c.name,
          status: c.status,
          budget: c.budget,
          consumedBudget: c.consumedBudget,
          remainingBudget: view.remainingBudget,
          estimatedViews: view.estimatedViews,
          estimatedCost: view.estimatedCost,
          views: logs.length,
          clicks: logs.reduce((s, l) => s + l.clicks, 0),
          interactions: logs.reduce((s, l) => s + l.interactions, 0),
          lastDiffusionAt:
            logs
              .map((l) => l.diffusedAt)
              .sort()
              .at(-1) ?? null,
          daily: rangeFrom <= rangeTo ? dailyRows(rangeFrom, rangeTo, logs) : [],
          bySupport: bySupport(logs),
          byZone: byZone(logs),
        });
      }
      if (seg[1] === "history" && method === "GET") {
        if (!isStaff) return denied(route);
        const rows = [];
        for (
          let d = addDays(today(), -6) < from ? from : addDays(today(), -6);
          d <= to;
          d = addDays(d, 1)
        ) {
          const logs = logsIn(d, d, (l) => l.contentType === "PUBLICITE");
          rows.push({
            date: d,
            totalCampaigns: state.campaigns.length,
            activeCampaigns: state.campaigns.filter((c) => c.status === "ACTIVE").length,
            pendingCampaigns: state.campaigns.filter((c) =>
              ["PENDING_AI_CHECK", "APPROVED_BY_AI", "REVIEW_REQUIRED"].includes(c.status),
            ).length,
            aiPendingCampaigns: state.campaigns.filter((c) => c.status === "PENDING_AI_CHECK")
              .length,
            aiRejectedCampaigns: state.campaigns.filter((c) => c.status === "REJECTED_BY_AI")
              .length,
            availableSupports: state.supports.filter((s) => s.technicalStatus === "ACTIF").length,
            confirmedReservations: state.reservations.filter(
              (r) => r.reservationStatus === "CONFIRMEE",
            ).length,
            views: logs.length,
            clicks: logs.reduce((s, l) => s + l.clicks, 0),
            interactions: logs.reduce((s, l) => s + l.interactions, 0),
            estimatedBudget: state.campaigns
              .filter((c) => c.status !== "BROUILLON")
              .reduce((s, c) => s + c.budget, 0),
            consumedBudget: 0,
            avgRiskScore: 38.2,
            avgQualityScore: 73.6,
          });
        }
        return json(route, 200, rows);
      }
      if (seg[1] === "export.csv" && method === "GET") {
        const type = url.searchParams.get("type");
        if (!type || !["views", "dashboard", "mine", "campaign"].includes(type)) {
          return apiError(route, 400, "EXPORT_TYPE_INVALID", "Ce type d'export n'existe pas.");
        }
        if ((type === "views" || type === "dashboard") && !isStaff) return denied(route);
        if (type === "mine" && !isAnnonceur) return denied(route);
        const rows = dailyRows(
          from,
          to,
          logsIn(from, to, (l) => l.contentType === "PUBLICITE"),
        );
        const csv =
          "﻿Date;Affichages;Clics;Interactions;Coût (TND)\n" +
          rows
            .map(
              (r) =>
                `${r.date};${r.views};${r.clicks};${r.interactions};${r.cost.toFixed(2).replace(".", ",")}`,
            )
            .join("\n");
        return route.fulfill({
          status: 200,
          contentType: "text/csv; charset=UTF-8",
          headers: {
            "content-disposition": `attachment; filename="tpub-statistiques-${type}-${from}-${to}.csv"`,
          },
          body: csv,
        });
      }
    }

    // ---- Emergency messages
    if (seg[0] === "emergency") {
      if (!isStaff) return denied(route);
      if (seg.length === 1 && method === "GET") {
        const states = listParam(url, "state");
        return json(
          route,
          200,
          state.emergencies
            .map((e) => Object.assign(e, { state: emergencyState(e) }))
            .filter((e) => !states || states.includes(e.state))
            .sort(byCreatedDesc),
        );
      }
      if (seg.length === 1 && method === "POST") {
        if (!isAdmin) return denied(route);
        const body = bodyOf<Partial<EmergencyRequest>>(request);
        const hasCircle = body.latitude != null && body.longitude != null && body.radiusKm != null;
        if (body.zoneId == null && !hasCircle) {
          return apiError(
            route,
            400,
            "EMERGENCY_TARGET_REQUIRED",
            "Choisissez une zone ou un cercle.",
          );
        }
        const zone =
          body.zoneId != null
            ? zoneOf(body.zoneId)
            : resolveZone(body.latitude ?? 0, body.longitude ?? 0);
        if (!zone) return apiError(route, 404, "ZONE_NOT_FOUND", "Cette zone est introuvable.");
        const startTime = apiTime(body.startTime) ?? "00:00:00";
        const endTime = apiTime(body.endTime) ?? "23:59:59";
        if (
          !body.startDate ||
          !body.endDate ||
          `${body.endDate}T${endTime}` <= `${body.startDate}T${startTime}`
        ) {
          return apiError(
            route,
            400,
            "INVALID_EMERGENCY_WINDOW",
            "La fin de diffusion doit être après le début.",
          );
        }
        const affected = state.supports.filter(
          (s) =>
            s.technicalStatus === "ACTIF" &&
            (hasCircle
              ? distanceKm(s.latitude, s.longitude, body.latitude ?? 0, body.longitude ?? 0) <=
                (body.radiusKm ?? 0)
              : s.zoneId === zone.id),
        ).length;
        const created: EmergencyResponse = {
          id: nextId(state.emergencies),
          title: body.title ?? "",
          content: body.content ?? "",
          zoneId: zone.id,
          zoneName: zone.name,
          latitude: hasCircle ? (body.latitude ?? null) : null,
          longitude: hasCircle ? (body.longitude ?? null) : null,
          radiusKm: hasCircle ? (body.radiusKm ?? null) : null,
          startDate: body.startDate,
          endDate: body.endDate,
          startTime,
          endTime,
          durationSeconds: body.durationSeconds ?? 15,
          priority: body.priority ?? 1,
          urgencyLevel: body.urgencyLevel ?? "HIGH",
          isActive: true,
          state: "PROGRAMME",
          stoppedAt: null,
          stopReason: null,
          affectedSupports: affected,
          diffusionCount: 0,
          createdByName: user.nom,
          createdAt: new Date().toISOString(),
        };
        created.state = emergencyState(created);
        state.emergencies.push(created);
        audit(
          "EMERGENCY_CREATED",
          "EMERGENCY",
          created.id,
          `Message prioritaire « ${created.title} » créé`,
        );
        return json(route, 201, created);
      }
      if (seg[2] === "deactivate" && method === "POST") {
        if (!isAdmin) return denied(route);
        const id = Number(seg[1]);
        const e = state.emergencies.find((x) => x.id === id);
        if (!e)
          return apiError(
            route,
            404,
            "EMERGENCY_NOT_FOUND",
            "Ce message prioritaire est introuvable.",
          );
        Object.assign(e, {
          isActive: false,
          stoppedAt: new Date().toISOString(),
          stopReason: "MANUEL",
        });
        e.state = emergencyState(e);
        audit(
          "EMERGENCY_DEACTIVATED",
          "EMERGENCY",
          id,
          `Message prioritaire « ${e.title} » désactivé`,
        );
        return json(route, 200, e);
      }
    }

    // ---- Diffusion journal (staff)
    if (seg[0] === "diffusion" && seg[1] === "logs" && method === "GET") {
      if (!isStaff) return denied(route);
      const supportId = numParam(url, "supportId");
      const zoneId = numParam(url, "zoneId");
      const campaignId = numParam(url, "campaignId");
      const types = listParam(url, "contentType");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const items = state.diffusionLogs
        .filter((l) => supportId === null || l.supportId === supportId)
        .filter((l) => zoneId === null || l.zoneId === zoneId)
        .filter((l) => campaignId === null || l.campaignId === campaignId)
        .filter((l) => !types || types.includes(l.contentType))
        .filter((l) => !from || logDay(l) >= from)
        .filter((l) => !to || logDay(l) <= to)
        .sort((a, b) => (a.diffusedAt < b.diffusedAt ? 1 : a.diffusedAt > b.diffusedAt ? -1 : 0));
      return json(route, 200, paginate(items, url));
    }

    api.unhandled.push(`${method} ${path}`);
    return apiError(route, 500, "INTERNAL_ERROR", "Erreur inattendue du serveur simulé.");
  };

  await page.route(
    (u) => u.pathname === "/api" || u.pathname.startsWith("/api/"),
    (route) => handler(route),
  );
  // Public campaign media (same-origin /uploads/** passthrough in the app).
  await page.route(
    (u) => u.pathname.startsWith("/uploads/"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "cache-control": "public, max-age=86400" },
        body: PIXEL_PNG,
      }),
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
