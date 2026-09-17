/**
 * Round-2 lane L3 DTOs (docs/round2-contract.md §4): polygon zones, emergency polygons, heatmaps and
 * dynamic pricing. Extensions of core DTOs are declared here; callers import this module by path.
 */
import type {
  AvailabilityResponse,
  CampaignEstimateLine,
  CampaignEstimateResponse,
  CampaignZoneResponse,
  DiffusionContentType,
  EmergencyCircleRequest,
  EmergencyRequest,
  EmergencyResponse,
  EstimateLine,
  EstimateRequest,
  EstimateResponse,
  SupportAvailabilityItem,
} from "@/lib/api/types";
import type { GeoJsonMultiPolygon, GeoJsonPolygon, GeoJsonPolygonal } from "@/lib/polygon";

export type { GeoJsonMultiPolygon, GeoJsonPolygon, GeoJsonPolygonal };

// ---------------------------------------------------------------------------
// Campaign zones (§4.3)
// ---------------------------------------------------------------------------

export type CampaignZoneType = "CERCLE" | "POLYGONE";

export interface CampaignCircleInput {
  type?: "CERCLE";
  latitude: number;
  longitude: number;
  /** 0.1..50 */
  radiusKm: number;
  label?: string | null;
}

export interface CampaignPolygonInput {
  type: "POLYGONE";
  polygon: GeoJsonPolygonal;
  label?: string | null;
}

export type CampaignZoneInput = CampaignCircleInput | CampaignPolygonInput;

export interface CampaignZonesRequestCarte {
  /** 1..5, circles and polygons together */
  zones: CampaignZoneInput[];
}

/** For a polygon: latitude/longitude = centroid, radiusKm = circumscribed radius. */
export interface CampaignZoneResponseCarte extends CampaignZoneResponse {
  type?: CampaignZoneType;
  polygon?: GeoJsonPolygonal | null;
  areaKm2?: number;
}

export interface CampaignZonesUpdateResponseCarte {
  zones: CampaignZoneResponseCarte[];
  cancelledReservationIds: number[];
}

// ---------------------------------------------------------------------------
// Emergencies (§4.4)
// ---------------------------------------------------------------------------

/** Polygon-targeted emergency (exclusive with the circle; zone resolved from the centroid). */
export interface EmergencyPolygonRequest extends Omit<
  EmergencyRequest,
  "zoneId" | "latitude" | "longitude" | "radiusKm"
> {
  zoneId?: number | null;
  latitude?: null;
  longitude?: null;
  radiusKm?: null;
  polygon: GeoJsonPolygonal;
}

export type EmergencyRequestCarte = EmergencyRequest | EmergencyCircleRequest | EmergencyPolygonRequest;

export interface EmergencyResponseCarte extends EmergencyResponse {
  targetPolygon?: GeoJsonPolygonal | null;
}

// ---------------------------------------------------------------------------
// Dynamic pricing (§4.6)
// ---------------------------------------------------------------------------

export type DayOfWeekFr = "LUNDI" | "MARDI" | "MERCREDI" | "JEUDI" | "VENDREDI" | "SAMEDI" | "DIMANCHE";

export const DAYS_OF_WEEK_FR: readonly DayOfWeekFr[] = [
  "LUNDI",
  "MARDI",
  "MERCREDI",
  "JEUDI",
  "VENDREDI",
  "SAMEDI",
  "DIMANCHE",
];

export interface PriceBreakdown {
  baseCost: number;
  multiplier: number;
  finalCost: number;
  clamped: boolean;
  enabled: boolean;
  /** 4 decimals */
  factors: { hour: number; dayOfWeek: number; demand: number; scarcity: number };
  details: {
    supportOccupancy: number;
    zoneOccupancy: number;
    zoneAvailability: number;
    hourBands: { label: string; minutes: number; multiplier: number }[];
    days: { dayOfWeek: DayOfWeekFr; count: number; multiplier: number }[];
  };
  /** French sentences, e.g. « Créneau en pointe du soir : ×1,25 ». */
  explanations: string[];
}

export interface PricingHourBand {
  /** HH:mm */
  start: string;
  /** HH:mm, "24:00" for the end of the day */
  end: string;
  multiplier: number;
  label: string;
}

export interface PricingConfig {
  enabled: boolean;
  minMultiplier: number;
  maxMultiplier: number;
  hourBands: PricingHourBand[];
  dayMultipliers: Record<DayOfWeekFr, number>;
  demandWeight: number;
  scarcityWeight: number;
}

export interface EstimateRequestCarte extends EstimateRequest {
  /** Reservations of this campaign are excluded from the occupancy. */
  campaignId?: number | null;
}

export interface EstimateLineCarte extends EstimateLine {
  /** Dynamic final cost is `estimatedCost`. */
  baseCost?: number;
  pricing?: PriceBreakdown | null;
}

export interface EstimateResponseCarte extends Omit<EstimateResponse, "lines"> {
  lines: EstimateLineCarte[];
  totalBaseCost?: number;
}

export interface CampaignEstimateLineCarte extends CampaignEstimateLine {
  baseCost?: number;
  priceMultiplier?: number;
  /** Stored at booking time; null for reservations created before the dynamic pricing. */
  pricing?: PriceBreakdown | null;
}

export interface CampaignEstimateResponseCarte extends Omit<CampaignEstimateResponse, "lines"> {
  lines: CampaignEstimateLineCarte[];
}

export interface SupportAvailabilityItemCarte extends SupportAvailabilityItem {
  priceMultiplier?: number;
}

export interface AvailabilityResponseCarte extends Omit<AvailabilityResponse, "supports"> {
  supports: SupportAvailabilityItemCarte[];
}

// ---------------------------------------------------------------------------
// Heatmaps (§4.5)
// ---------------------------------------------------------------------------

export interface HeatmapFeature<P> {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: P;
}

export interface HeatmapPoints<P> {
  type: "FeatureCollection";
  features: HeatmapFeature<P>[];
}

export interface DiffusionHeatProps {
  supportId: number;
  supportName: string;
  zoneId: number;
  zoneName: string;
  weight: number;
  clicks: number;
}

export interface ReservationHeatProps {
  supportId: number;
  supportName: string;
  zoneId: number;
  zoneName: string;
  weight: number;
  occupancy: number;
}

export interface TargetHeatProps {
  campaignZoneId: number;
  campaignId: number;
  type: CampaignZoneType;
  weight: number;
}

export interface PublicDemandHeatProps {
  supportId: number;
  zoneId: number;
  zoneName: string;
  weight: number;
}

export interface HeatmapResponse<P> {
  from: string;
  to: string;
  maxWeight: number;
  totalWeight: number;
  points: HeatmapPoints<P>;
}

export interface DiffusionHeatmapQuery {
  from?: string;
  to?: string;
  contentType?: readonly DiffusionContentType[];
  zoneId?: number | null;
}

export interface DemandZone {
  zoneId: number;
  zoneName: string;
  reservedHours: number;
  capacityHours: number;
  occupancy: number;
  targets: number;
}

export interface DemandHeatmapResponse {
  from: string;
  to: string;
  reservations: HeatmapPoints<ReservationHeatProps>;
  targets: HeatmapPoints<TargetHeatProps>;
  maxReservationWeight: number;
  byZone: DemandZone[];
}

export interface DemandHeatmapQuery {
  from?: string;
  to?: string;
  zoneId?: number | null;
}

export interface PublicDemandZone {
  zoneId: number;
  zoneName: string;
  occupancy: number;
  availableSupports: number;
  totalSupports: number;
}

export interface PublicDemandHeatmapResponse extends HeatmapResponse<PublicDemandHeatProps> {
  byZone: PublicDemandZone[];
}

export interface PublicDemandQuery {
  startDate: string;
  endDate: string;
  /** HH:mm or HH:mm:ss */
  startTime: string;
  endTime: string;
}
