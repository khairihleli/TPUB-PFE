/**
 * Data loaders for the campaign module. Every campaign id comes from the URL and is NEVER
 * trusted: the backend has no ownership check (contract §7.16), so an id is only used once it
 * has been found in GET /campaigns/mine.
 */
import { aiApi, campaignsApi, reservationsApi, supportsApi, zonesApi } from "@/lib/api/endpoints";
import { isAbortError, isNoAiReportError } from "@/lib/api/errors";
import type {
  AiReport,
  CampaignResponse,
  CampaignStatus,
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

/** Finds `id` in /campaigns/mine. Throws CampaignNotFoundError when it is not the caller's. */
export async function loadOwnedCampaign(
  id: number | null,
  signal: AbortSignal,
): Promise<CampaignResponse> {
  if (id === null) throw new CampaignNotFoundError();
  // Always fresh (staleTime 0), but shares an in-flight request with the nav badges / palette,
  // and primes the /mine cache for the list and the not-found suggestions.
  const mine = await fetchCached(
    resourceKeys.campaignsMine,
    (s) => campaignsApi.mine({ signal: s }),
    {
      signal,
      staleTime: 0,
    },
  );
  const campaign = mine.find((c) => c.id === id);
  if (!campaign) throw new CampaignNotFoundError();
  return campaign;
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
  /** 400 « No AI report found »: never analysed. */
  | { kind: "none" }
  | { kind: "error"; error: unknown };

/**
 * GET /ai/report — 400 means « pas encore analysée » (contract §7.25), never a page error.
 * A draft has never been submitted, so no report can exist: the request is skipped (FLOW-18).
 */
export async function loadAiReportState(
  campaign: number | Pick<CampaignResponse, "id" | "status">,
  signal: AbortSignal,
): Promise<AiReportState> {
  const campaignId = typeof campaign === "number" ? campaign : campaign.id;
  if (typeof campaign !== "number" && campaign.status === "BROUILLON") return { kind: "none" };
  try {
    return { kind: "report", report: await aiApi.report(campaignId, { signal }) };
  } catch (e) {
    if (isAbortError(e)) throw e;
    if (isNoAiReportError(e)) return { kind: "none" };
    return { kind: "error", error: e };
  }
}

export interface NetworkLookups {
  /** null when the lookup failed: names degrade to « Écran n° … », the page still works. */
  supports: ReadonlyMap<number, SupportResponse> | null;
  zones: ReadonlyMap<number, ZoneResponse> | null;
}

export async function loadNetworkLookups(
  signal: AbortSignal,
  /** Read supports/zones through the shared 30 s cache (detail page polling). */
  { cached = false }: { cached?: boolean } = {},
): Promise<NetworkLookups> {
  const [supports, zones] = await Promise.allSettled(
    cached
      ? [
          fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
          fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
        ]
      : [supportsApi.all({ signal }), zonesApi.all({ signal })],
  );
  for (const r of [supports, zones]) {
    if (r.status === "rejected" && isAbortError(r.reason)) throw r.reason;
  }
  return {
    supports:
      supports.status === "fulfilled" ? new Map(supports.value.map((s) => [s.id, s])) : null,
    zones: zones.status === "fulfilled" ? new Map(zones.value.map((z) => [z.id, z])) : null,
  };
}

export interface CampaignDetailData extends CampaignWithReservations {
  ai: AiReportState;
  lookups: NetworkLookups;
}

export async function loadCampaignDetail(
  id: number | null,
  signal: AbortSignal,
): Promise<CampaignDetailData> {
  const campaign = await loadOwnedCampaign(id, signal);
  const [reservations, ai, lookups] = await Promise.all([
    reservationsApi.byCampaign(campaign.id, { signal }),
    loadAiReportState(campaign, signal),
    loadNetworkLookups(signal, { cached: true }),
  ]);
  primeCache(resourceKeys.reservationsByCampaign(campaign.id), reservations);
  return { campaign, reservations, ai, lookups };
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
 * every 60 s while waiting for a TPUB decision, otherwise none. Pausing while the tab is hidden
 * is handled by useResource.
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
export interface JoinedReservation extends ReservationResponse {
  supportName: string;
  zoneName: string;
  supportType: SupportType | null;
}

export function joinReservations(
  reservations: readonly ReservationResponse[],
  lookups: NetworkLookups,
): JoinedReservation[] {
  return reservations.map((r) => {
    const support = lookups.supports?.get(r.supportId);
    const zone = lookups.zones?.get(r.zoneId);
    return {
      ...r,
      supportName: support?.name ?? `Porteur n° ${r.supportId}`,
      zoneName: zone?.name ?? support?.zoneName ?? `Zone n° ${r.zoneId}`,
      supportType: support?.supportType ?? null,
    };
  });
}

/** Sum of the backend's hard-coded `estimatedCost` (always an estimate, never a price). */
export function sumEstimatedCost(
  reservations: readonly Pick<ReservationResponse, "estimatedCost">[],
) {
  return reservations.reduce(
    (sum, r) => sum + (Number.isFinite(r.estimatedCost) ? r.estimatedCost : 0),
    0,
  );
}

/** Reservations that still hold a screen (TEMPORAIRE / CONFIRMEE). */
export function activeReservations<T extends Pick<ReservationResponse, "reservationStatus">>(
  reservations: readonly T[],
): T[] {
  return reservations.filter(
    (r) => r.reservationStatus === "TEMPORAIRE" || r.reservationStatus === "CONFIRMEE",
  );
}

export interface ScreenCatalogue {
  zones: ZoneResponse[];
  /** Screens with technicalStatus ACTIF located in an active zone. */
  screens: SupportResponse[];
  /**
   * Every Porteur located in an active zone, whatever its status or type (the « Carte » tab shows
   * them all at their exact position; only `screens` can be booked).
   */
  network: SupportResponse[];
}

/** Wizard step 2: GET /zones/active + GET /supports filtered on ACTIF. */
export async function loadScreenCatalogue(signal: AbortSignal): Promise<ScreenCatalogue> {
  const [zones, supports] = await Promise.all([
    zonesApi.active({ signal }),
    supportsApi.all({ signal }),
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
  const screens = network.filter((s) => s.technicalStatus === "ACTIF");
  return { zones: activeZones, screens, network };
}
