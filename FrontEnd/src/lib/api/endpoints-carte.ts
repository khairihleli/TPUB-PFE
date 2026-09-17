/**
 * Round-2 lane L3 endpoints (docs/round2-contract.md §4): polygon zones, emergency polygons,
 * heatmaps and dynamic pricing. Import by path (not through `@/lib/api`).
 */
import { apiFetch } from "@/lib/api/client";
import { listParam, type CallOptions } from "@/lib/api/endpoints";
import type {
  CampaignEstimateResponseCarte,
  CampaignZoneResponseCarte,
  CampaignZonesRequestCarte,
  CampaignZonesUpdateResponseCarte,
  DemandHeatmapQuery,
  DemandHeatmapResponse,
  DiffusionHeatmapQuery,
  DiffusionHeatProps,
  EmergencyRequestCarte,
  EmergencyResponseCarte,
  EstimateRequestCarte,
  EstimateResponseCarte,
  HeatmapResponse,
  PricingConfig,
  PublicDemandHeatmapResponse,
  PublicDemandQuery,
} from "@/lib/api/types-carte";

export const campaignZonesApi = {
  get: (campaignId: number, o: CallOptions = {}) =>
    apiFetch<CampaignZoneResponseCarte[]>(`/campaigns/${campaignId}/zones`, o),
  /** Replaces every zone (1..5 circles and polygons). TEMPORAIRE reservations outside are cancelled. */
  set: (campaignId: number, body: CampaignZonesRequestCarte, o: CallOptions = {}) =>
    apiFetch<CampaignZonesUpdateResponseCarte>(`/campaigns/${campaignId}/zones`, {
      method: "PUT",
      body: { zones: [...body.zones] },
      ...o,
    }),
};

export const emergencyCarteApi = {
  /** A zone, a complete circle or a polygon (polygon and circle together → EMERGENCY_TARGET_CONFLICT). */
  create: (body: EmergencyRequestCarte, o: CallOptions = {}) =>
    apiFetch<EmergencyResponseCarte>("/emergency", { method: "POST", body, ...o }),
};

export const heatmapApi = {
  /** ADMINISTRATEUR, SUPERVISEUR, OPERATEUR — diffusions per Porteur (default: 30 last days, PUBLICITE). */
  diffusions: (q: DiffusionHeatmapQuery = {}, o: CallOptions = {}) =>
    apiFetch<HeatmapResponse<DiffusionHeatProps>>("/heatmap/diffusions", {
      query: {
        from: q.from,
        to: q.to,
        contentType: listParam(q.contentType),
        zoneId: q.zoneId ?? undefined,
      },
      ...o,
    }),
  /** Staff — reserved slot-hours per Porteur and campaign targets (default: today → today + 29). */
  demand: (q: DemandHeatmapQuery = {}, o: CallOptions = {}) =>
    apiFetch<DemandHeatmapResponse>("/heatmap/demand", {
      query: { from: q.from, to: q.to, zoneId: q.zoneId ?? undefined },
      ...o,
    }),
  /** Wizard — occupancy of ACTIF Porteurs on a window, no campaign or client data. */
  demandPublic: (q: PublicDemandQuery, o: CallOptions = {}) =>
    apiFetch<PublicDemandHeatmapResponse>("/heatmap/demand/public", {
      query: {
        startDate: q.startDate,
        endDate: q.endDate,
        startTime: q.startTime,
        endTime: q.endTime,
      },
      ...o,
    }),
};

export const pricingApi = {
  config: (o: CallOptions = {}) => apiFetch<PricingConfig>("/pricing/config", o),
};

export const estimatesCarteApi = {
  compute: (body: EstimateRequestCarte, o: CallOptions = {}) =>
    apiFetch<EstimateResponseCarte>("/estimates", { method: "POST", body, ...o }),
  campaign: (campaignId: number, o: CallOptions = {}) =>
    apiFetch<CampaignEstimateResponseCarte>(`/estimates/campaign/${campaignId}`, o),
};
