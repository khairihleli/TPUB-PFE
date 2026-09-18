import type { SupportResponse, ZoneResponse } from "@/lib/api/types";

export function zone(overrides: Partial<ZoneResponse> & { id: number }): ZoneResponse {
  return {
    name: `Zone ${overrides.id}`,
    latitude: 36.8,
    longitude: 10.18,
    radiusKm: 2,
    isActive: true,
    ...overrides,
  };
}

export function support(overrides: Partial<SupportResponse> & { id: number }): SupportResponse {
  return {
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: `Porteur ${overrides.id}`,
    supportType: "ECRAN",
    latitude: 36.8,
    longitude: 10.18,
    technicalStatus: "ACTIF",
    diffusionCapacity: 1,
    porteurType: null,
    mastHeightM: null,
    headingDeg: null,
    address: null,
    ...overrides,
  };
}

/** Realistic demo network (coordinates only, no inventory claims). */
export const ZONES: ZoneResponse[] = [
  zone({ id: 1, name: "Tunis Centre", latitude: 36.8, longitude: 10.18, radiusKm: 3 }),
  zone({ id: 2, name: "Les Berges du Lac", latitude: 36.835, longitude: 10.235, radiusKm: 2 }),
  zone({ id: 3, name: "Sfax Centre", latitude: 34.74, longitude: 10.76, radiusKm: 4 }),
  zone({
    id: 4,
    name: "Sousse Nord",
    latitude: 35.9,
    longitude: 10.6,
    radiusKm: null,
    isActive: false,
  }),
];

export const SUPPORTS: SupportResponse[] = [
  support({
    id: 11,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Écran LED Avenue Habib Bourguiba",
    latitude: 36.7995,
    longitude: 10.1857,
    porteurType: "A",
    mastHeightM: 25,
    headingDeg: 45,
    address: "Avenue Habib Bourguiba, Tunis",
  }),
  support({
    id: 12,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Place Barcelone",
    latitude: 36.7952,
    longitude: 10.1805,
    supportType: "PANNEAU_NUMERIQUE",
    headingDeg: 180,
  }),
  support({
    id: 13,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Porteur relais Route de Bizerte",
    latitude: 36.82,
    longitude: 10.16,
    supportType: "POINT_WIFI",
    porteurType: "D",
    mastHeightM: 30,
  }),
  support({
    id: 21,
    zoneId: 2,
    zoneName: "Les Berges du Lac",
    name: "Corridor Lac 2",
    latitude: 36.84,
    longitude: 10.24,
    porteurType: "B",
    mastHeightM: 30,
    headingDeg: 90,
  }),
  support({
    id: 22,
    zoneId: 2,
    zoneName: "Les Berges du Lac",
    name: "Lac 1 maintenance",
    latitude: 36.832,
    longitude: 10.23,
    porteurType: "C",
    technicalStatus: "MAINTENANCE",
  }),
  support({
    id: 31,
    zoneId: 3,
    zoneName: "Sfax Centre",
    name: "Rond-point Sfax El Jadida",
    latitude: 34.745,
    longitude: 10.755,
    porteurType: "A",
    mastHeightM: 25,
    headingDeg: 300,
  }),
];
