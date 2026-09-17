/**
 * Data loaders for the campaign module (contract §2). Every campaign id comes from the URL: the
 * backend answers 404 CAMPAIGN_NOT_FOUND for a campaign that is not the caller's, which the UI
 * renders as « Campagne introuvable ».
 */
import {
  aiApi,
  campaignsApi,
  estimatesApi,
  mediaApi,
  reservationsApi,
  supportsApi,
  zonesApi,
} from "@/lib/api/endpoints";
import { ApiError, isAbortError, isNoAiReportError } from "@/lib/api/errors";
import type {
  AiReport,
  CampaignEstimateResponse,
  CampaignResponse,
  CampaignStatus,
  MediaFileResponse,
  ReservationResponse,
  SupportResponse,
  SupportType,
  ZoneResponse,
} from "@/lib/api/types";
import { fetchCached, primeCache, resourceKeys } from "@/lib/resource-cache";

/** The id is not one of the advertiser's campaigns (or does not exist). */
export class CampaignNotFoundError extends Error {
  override readonly name = "CampaignNotFoundError";
  constructor() {
    super("Campagne introuvable dans votre espace.");
  }
}

export function isCampaignNotFound(e: unknown): e is CampaignNotFoundError {
  return e instanceof CampaignNotFoundError;
}

/** GET /campaigns/{id}; 404 (not found or not the caller's) and 403 → CampaignNotFoundError. */
export async function loadOwnedCampaign(
  id: number | null,
  signal: AbortSignal,
): Promise<CampaignResponse> {
  if (id === null) throw new CampaignNotFoundError();
  try {
    const campaign = await campaignsApi.get(id, { signal });
    primeCache(resourceKeys.campaign(id), campaign);
    return campaign;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
      throw new CampaignNotFoundError();
    }
    throw e;
  }
}

export interface CampaignWithReservations {
  campaign: CampaignResponse;
  reservations: ReservationResponse[];
}

export async function loadCampaignWithReservations(
  id: number | null,
  signal: AbortSignal,
): Promise<CampaignWithReservations> {
  const campaign = await loadOwnedCampaign(id, signal);
  const reservations = await fetchCached(
    resourceKeys.reservationsByCampaign(campaign.id),
    (s) => reservationsApi.byCampaign(campaign.id, { signal: s }),
    { signal, staleTime: 0 },
  );
  return { campaign, reservations };
}

export type AiReportState =
  | { kind: "report"; report: AiReport }
  /** 404 AI_REPORT_NOT_FOUND: never analysed (not even a pre-analysis). */
  | { kind: "none" }
  | { kind: "error"; error: unknown };

/** GET /ai/report — « not found » is a normal state, never a page error. */
export async function loadAiReportState(
  campaign: number | Pick<CampaignResponse, "id">,
  signal: AbortSignal,
): Promise<AiReportState> {
  const campaignId = typeof campaign === "number" ? campaign : campaign.id;
  try {
    return { kind: "report", report: await aiApi.report(campaignId, { signal }) };
  } catch (e) {
    if (isAbortError(e)) throw e;
    if (isNoAiReportError(e)) return { kind: "none" };
    return { kind: "error", error: e };
  }
}

/** Optional section: a failure degrades that section only. */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { ok: false, error };
  }
}

export interface CampaignDetailData extends CampaignWithReservations {
  ai: AiReportState;
  media: Settled<MediaFileResponse[]>;
  estimate: Settled<CampaignEstimateResponse>;
}

export async function loadCampaignDetail(
  id: number | null,
  signal: AbortSignal,
): Promise<CampaignDetailData> {
  const campaign = await loadOwnedCampaign(id, signal);
  const [reservations, ai, media, estimate] = await Promise.all([
    reservationsApi.byCampaign(campaign.id, { signal }),
    loadAiReportState(campaign, signal),
    settle(mediaApi.list(campaign.id, { signal })),
    settle(estimatesApi.campaign(campaign.id, { signal })),
  ]);
  primeCache(resourceKeys.reservationsByCampaign(campaign.id), reservations);
  return { campaign, reservations, ai, media, estimate };
}

// ---------------------------------------------------------------------------
// Status freshness (UX-PLAN §6.3)
// ---------------------------------------------------------------------------
export const PENDING_POLL_MS = 10_000;
/** The AI check normally answers within seconds: stop polling after 2 minutes. */
export const PENDING_POLL_WINDOW_MS = 120_000;
export const REVIEW_POLL_MS = 60_000;

/**
 * Detail page polling: every 10 s while PENDING_AI_CHECK (only within the 2-minute window),
 * every 60 s while waiting for a TPUB decision, otherwise none.
 */
export function pollIntervalFor(
  status: CampaignStatus,
  { pendingWindowOver = false }: { pendingWindowOver?: boolean } = {},
): number | null {
  if (status === "PENDING_AI_CHECK") return pendingWindowOver ? null : PENDING_POLL_MS;
  if (status === "APPROVED_BY_AI" || status === "REVIEW_REQUIRED") return REVIEW_POLL_MS;
  return null;
}

/** « CAMP-00007 »: reference quoted in e-mails to TPUB. */
export function campaignReference(id: number): string {
  return `CAMP-${String(id).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Joins & aggregates
// ---------------------------------------------------------------------------
export interface NetworkLookups {
  /** null when the lookup failed or was not loaded: names fall back to the reservation's own. */
  supports: ReadonlyMap<number, SupportResponse> | null;
  zones: ReadonlyMap<number, ZoneResponse> | null;
}

export const NO_LOOKUPS: NetworkLookups = { supports: null, zones: null };

export interface JoinedReservation extends ReservationResponse {
  supportName: string;
  zoneName: string;
  supportType: SupportType | null;
}

/** v2 reservations carry their names; lookups only fill gaps of older payloads. */
export function joinReservations(
  reservations: readonly ReservationResponse[],
  lookups: NetworkLookups = NO_LOOKUPS,
): JoinedReservation[] {
  return reservations.map((r) => {
    const support = lookups.supports?.get(r.supportId);
    const zone = lookups.zones?.get(r.zoneId);
    return {
      ...r,
      supportName: r.supportName ?? support?.name ?? `Porteur n° ${r.supportId}`,
      zoneName: r.zoneName ?? zone?.name ?? support?.zoneName ?? `Zone n° ${r.zoneId}`,
      supportType: r.supportType ?? support?.supportType ?? null,
    };
  });
}

/** Sum of the backend `estimatedCost` (always an estimate, never a price). */
export function sumEstimatedCost(
  reservations: readonly Pick<ReservationResponse, "estimatedCost">[],
) {
  return reservations.reduce(
    (sum, r) => sum + (Number.isFinite(r.estimatedCost) ? r.estimatedCost : 0),
    0,
  );
}

/** Reservations that still hold a Porteur (TEMPORAIRE / CONFIRMEE). */
export function activeReservations<T extends Pick<ReservationResponse, "reservationStatus">>(
  reservations: readonly T[],
): T[] {
  return reservations.filter(
    (r) => r.reservationStatus === "TEMPORAIRE" || r.reservationStatus === "CONFIRMEE",
  );
}

export interface ScreenCatalogue {
  zones: ZoneResponse[];
  /** Every Porteur located in an active zone (map context). */
  network: SupportResponse[];
}

/** Zone step: GET /zones/active + GET /supports (map context around the campaign circles). */
export async function loadScreenCatalogue(signal: AbortSignal): Promise<ScreenCatalogue> {
  const [zones, supports] = await Promise.all([
    fetchCached(resourceKeys.zonesActive, (s) => zonesApi.active({ signal: s }), { signal }),
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
  ]);
  return buildScreenCatalogue(zones, supports);
}

export function buildScreenCatalogue(
  zones: readonly ZoneResponse[],
  supports: readonly SupportResponse[],
): ScreenCatalogue {
  const activeZones = zones
    .filter((z) => z.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const ids = new Set(activeZones.map((z) => z.id));
  const network = supports
    .filter((s) => ids.has(s.zoneId))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { zones: activeZones, network };
}
