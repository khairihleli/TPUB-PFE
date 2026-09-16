import type {
  CampaignResponse,
  ReservationResponse,
  SupportResponse,
  ZoneResponse,
} from "@/lib/api/types";

export function campaign(overrides: Partial<CampaignResponse> & { id: number }): CampaignResponse {
  return {
    clientId: 1,
    name: `Campagne ${overrides.id}`,
    objective: "Notoriété locale",
    budget: 1000,
    consumedBudget: 0,
    status: "BROUILLON",
    aiStatus: null,
    adminStatus: null,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    startTime: "08:00:00",
    endTime: "22:00:00",
    estimatedViews: 0,
    priorityScore: 0,
    createdAt: `2026-09-${String(overrides.id).padStart(2, "0")}T10:00:00Z`,
    submittedAt: null,
    validatedAt: null,
    ...overrides,
  };
}

export function reservation(
  overrides: Partial<ReservationResponse> & { id: number; campaignId: number },
): ReservationResponse {
  return {
    zoneId: 1,
    supportId: 1,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    startTime: "08:00:00",
    endTime: "22:00:00",
    availabilityStatus: "RESERVE",
    reservationStatus: "TEMPORAIRE",
    estimatedViews: 1000,
    estimatedCost: 100,
    ...overrides,
  };
}

export function support(overrides: Partial<SupportResponse> & { id: number }): SupportResponse {
  return {
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: `Écran ${overrides.id}`,
    supportType: "ECRAN",
    latitude: 36.8,
    longitude: 10.18,
    technicalStatus: "ACTIF",
    diffusionCapacity: 1,
    ...overrides,
  };
}

export function zone(overrides: Partial<ZoneResponse> & { id: number }): ZoneResponse {
  return {
    name: `Zone ${overrides.id}`,
    latitude: 36.8008,
    longitude: 10.18,
    radiusKm: 3,
    isActive: true,
    ...overrides,
  };
}
