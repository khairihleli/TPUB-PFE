/**
 * Realistic Tunisian demo data for the mocked `/api/**` routes (no Spring backend in e2e).
 * Shapes follow src/lib/api/types.ts (verbatim backend DTOs: AI report / diffusion enums stay
 * lowercase here, as the backend sends them). Every value is fictional demo data.
 */
import type {
  AiReportResponse,
  CampaignResponse,
  DiffusionResponse,
  EmergencyResponse,
  ReservationResponse,
  RoleCode,
  SessionUser,
  SupportResponse,
  ZoneResponse,
} from "../../src/lib/api/types";

const TZ = "Africa/Tunis";

/** YYYY-MM-DD in Africa/Tunis, shifted by `days`. */
export function isoDay(days = 0, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/** ISO instant `days` ago at a given hour (UTC), for createdAt / submittedAt. */
export function isoInstant(daysAgo: number, hour = 9): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  d.setUTCHours(hour, 12, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export interface DemoAccount {
  email: string;
  password: string;
  nom: string;
  role: RoleCode;
  userId: number;
}

export const ANNONCEUR: DemoAccount = {
  email: "amira.bensalah@demo-annonceur.tn",
  password: "Demo-TPUB-2026",
  nom: "Amira Ben Salah",
  role: "ANNONCEUR",
  userId: 12,
};

export const ADMIN: DemoAccount = {
  email: "karim.trabelsi@tpub-demo.tn",
  password: "Admin-TPUB-2026",
  nom: "Karim Trabelsi",
  role: "ADMINISTRATEUR",
  userId: 1,
};

export const ACCOUNTS: readonly DemoAccount[] = [ANNONCEUR, ADMIN];

export function sessionUserOf(account: DemoAccount, ttlSeconds = 24 * 60 * 60): SessionUser {
  return {
    email: account.email,
    nom: account.nom,
    role: account.role,
    userId: account.userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------
export function demoZones(): ZoneResponse[] {
  return [
    {
      id: 1,
      name: "Tunis Centre",
      latitude: 36.8008,
      longitude: 10.18,
      radiusKm: 2.5,
      isActive: true,
    },
    {
      id: 2,
      name: "Les Berges du Lac",
      latitude: 36.838,
      longitude: 10.233,
      radiusKm: 2,
      isActive: true,
    },
    { id: 3, name: "La Marsa", latitude: 36.8782, longitude: 10.3247, radiusKm: 2, isActive: true },
    {
      id: 4,
      name: "Sousse Centre",
      latitude: 35.8256,
      longitude: 10.636,
      radiusKm: 3,
      isActive: true,
    },
    {
      id: 5,
      name: "Sfax Centre",
      latitude: 34.7406,
      longitude: 10.7603,
      radiusKm: 3,
      isActive: true,
    },
  ];
}

export function demoSupports(): SupportResponse[] {
  return [
    {
      id: 1,
      zoneId: 1,
      zoneName: "Tunis Centre",
      name: "Écran Avenue Habib Bourguiba",
      supportType: "ECRAN",
      latitude: 36.7999,
      longitude: 10.1832,
      technicalStatus: "ACTIF",
      diffusionCapacity: 6,
      porteurType: "A",
      mastHeightM: 25,
      headingDeg: 90,
      address: "Rond-point de l'avenue Habib Bourguiba, Tunis",
    },
    {
      id: 2,
      zoneId: 1,
      zoneName: "Tunis Centre",
      name: "Totem Place Barcelone",
      supportType: "PANNEAU_NUMERIQUE",
      latitude: 36.7951,
      longitude: 10.1806,
      technicalStatus: "ACTIF",
      diffusionCapacity: 4,
      porteurType: "C",
      mastHeightM: 15,
      headingDeg: 0,
      address: "Place Barcelone, Tunis",
    },
    {
      id: 3,
      zoneId: 2,
      zoneName: "Les Berges du Lac",
      name: "Écran Promenade du Lac 2",
      supportType: "ECRAN",
      latitude: 36.8455,
      longitude: 10.2721,
      technicalStatus: "ACTIF",
      diffusionCapacity: 6,
      porteurType: "B",
      mastHeightM: 30,
      headingDeg: 45,
      address: "Promenade du Lac 2, Les Berges du Lac",
    },
    {
      id: 4,
      zoneId: 3,
      zoneName: "La Marsa",
      name: "Totem Gare TGM La Marsa",
      supportType: "PANNEAU_NUMERIQUE",
      latitude: 36.8781,
      longitude: 10.3252,
      technicalStatus: "MAINTENANCE",
      diffusionCapacity: 4,
      porteurType: "C",
      mastHeightM: 15,
      headingDeg: 240,
      address: "Gare TGM, La Marsa",
    },
    {
      id: 5,
      zoneId: 3,
      zoneName: "La Marsa",
      name: "Écran Corniche de La Marsa",
      supportType: "ECRAN",
      latitude: 36.8849,
      longitude: 10.3301,
      technicalStatus: "ACTIF",
      diffusionCapacity: 6,
      porteurType: null,
      mastHeightM: null,
      headingDeg: null,
      address: null,
    },
    {
      id: 6,
      zoneId: 4,
      zoneName: "Sousse Centre",
      name: "Écran Boulevard du 14-Janvier",
      supportType: "ECRAN",
      latitude: 35.8388,
      longitude: 10.6279,
      technicalStatus: "ACTIF",
      diffusionCapacity: 8,
      porteurType: "B",
      mastHeightM: 25,
      headingDeg: 200,
      address: "Boulevard du 14-Janvier, Sousse",
    },
    {
      id: 7,
      zoneId: 4,
      zoneName: "Sousse Centre",
      name: "Point Wi-Fi Médina de Sousse",
      supportType: "POINT_WIFI",
      latitude: 35.8272,
      longitude: 10.6395,
      technicalStatus: "HORS_LIGNE",
      diffusionCapacity: 1,
      porteurType: "D",
      mastHeightM: 30,
      headingDeg: null,
      address: "Médina de Sousse",
    },
    {
      id: 8,
      zoneId: 5,
      zoneName: "Sfax Centre",
      name: "Panneau Avenue Hédi Chaker",
      supportType: "PANNEAU_NUMERIQUE",
      latitude: 34.7398,
      longitude: 10.7596,
      technicalStatus: "INACTIF",
      diffusionCapacity: 4,
      porteurType: null,
      mastHeightM: 20,
      headingDeg: 135,
      address: "Avenue Hédi Chaker, Sfax",
    },
  ];
}

// ---------------------------------------------------------------------------
// Campaigns (client 7 = the demo annonceur)
// ---------------------------------------------------------------------------
type CampaignSeed = Pick<CampaignResponse, "id" | "name" | "objective" | "budget" | "status"> &
  Partial<CampaignResponse> & { startIn: number; days: number; createdDaysAgo: number };

function campaign(seed: CampaignSeed): CampaignResponse {
  const { startIn, days, createdDaysAgo, ...rest } = seed;
  return {
    clientId: 7,
    consumedBudget: 0,
    aiStatus: null,
    adminStatus: null,
    startDate: isoDay(startIn),
    endDate: isoDay(startIn + days),
    startTime: "08:00:00",
    endTime: "20:00:00",
    estimatedViews: 0,
    priorityScore: 0,
    createdAt: isoInstant(createdDaysAgo),
    submittedAt: null,
    validatedAt: null,
    ...rest,
  };
}

export function demoCampaigns(): CampaignResponse[] {
  return [
    campaign({
      id: 1,
      name: "Rentrée scolaire — Librairie El Manar",
      objective:
        "Faire connaître les fournitures et manuels de la rentrée auprès des familles du centre-ville.",
      budget: 1800,
      status: "BROUILLON",
      startIn: 5,
      days: 20,
      createdDaysAgo: 1,
    }),
    campaign({
      id: 2,
      name: "Soldes d'automne — Maison Yasmine",
      objective: "Annoncer la période de soldes de la boutique de décoration des Berges du Lac.",
      budget: 2400,
      status: "PENDING_AI_CHECK",
      startIn: 10,
      days: 14,
      createdDaysAgo: 3,
      submittedAt: isoInstant(2, 15),
      estimatedViews: 1000,
    }),
    campaign({
      id: 3,
      name: "Ouverture boutique La Marsa",
      objective:
        "Informer les habitants de La Marsa de l'ouverture d'une nouvelle boutique de prêt-à-porter, horaires et adresse.",
      budget: 3500,
      status: "APPROVED_BY_AI",
      aiStatus: "APPROVED",
      startIn: 7,
      days: 30,
      createdDaysAgo: 6,
      submittedAt: isoInstant(4, 10),
      estimatedViews: 2000,
      startTime: "09:00:00",
      endTime: "21:00:00",
    }),
    campaign({
      id: 4,
      name: "Festival d'été — billetterie",
      objective: "Entrée gratuite pour les enfants lors de la soirée d'ouverture du festival.",
      budget: 2000,
      status: "REVIEW_REQUIRED",
      aiStatus: "REVIEW_REQUIRED",
      startIn: 12,
      days: 10,
      createdDaysAgo: 8,
      submittedAt: isoInstant(5, 11),
      estimatedViews: 1000,
    }),
    campaign({
      id: 5,
      name: "Semaine de la prévention santé",
      objective: "Inviter le public aux journées de dépistage gratuit organisées en centre-ville.",
      budget: 5000,
      status: "ACTIVE",
      aiStatus: "APPROVED",
      adminStatus: "VALIDATED",
      startIn: -3,
      days: 21,
      createdDaysAgo: 20,
      submittedAt: isoInstant(15, 9),
      validatedAt: isoInstant(12, 14),
      estimatedViews: 2000,
    }),
    campaign({
      id: 6,
      name: "Promo électroménager — résultats garantis",
      objective: "Remise garantie de 70 % sur tout le magasin, meilleur prix de Tunisie.",
      budget: 1200,
      status: "REJECTED_BY_AI",
      aiStatus: "REJECTED",
      startIn: 15,
      days: 7,
      createdDaysAgo: 10,
      submittedAt: isoInstant(9, 16),
      estimatedViews: 1000,
    }),
  ];
}

function reservation(
  id: number,
  c: CampaignResponse,
  support: SupportResponse,
  status: ReservationResponse["reservationStatus"],
): ReservationResponse {
  return {
    id,
    campaignId: c.id,
    zoneId: support.zoneId,
    supportId: support.id,
    startDate: c.startDate ?? isoDay(0),
    endDate: c.endDate ?? isoDay(7),
    startTime: c.startTime ?? "08:00:00",
    endTime: c.endTime ?? "20:00:00",
    availabilityStatus: "RESERVE",
    reservationStatus: status,
    estimatedViews: 1000,
    estimatedCost: Math.round(c.budget * 0.1 * 100) / 100,
  };
}

export function demoReservations(
  campaigns: CampaignResponse[],
  supports: SupportResponse[],
): ReservationResponse[] {
  const c = (id: number) => campaigns.find((x) => x.id === id)!;
  const s = (id: number) => supports.find((x) => x.id === id)!;
  return [
    reservation(1, c(2), s(3), "TEMPORAIRE"),
    reservation(2, c(3), s(5), "TEMPORAIRE"),
    reservation(3, c(3), s(1), "TEMPORAIRE"),
    reservation(4, c(4), s(6), "TEMPORAIRE"),
    reservation(5, c(5), s(2), "CONFIRMEE"),
    reservation(6, c(5), s(6), "CONFIRMEE"),
    reservation(7, c(6), s(3), "TEMPORAIRE"),
  ];
}

export function demoAiReports(): AiReportResponse[] {
  return [
    {
      campaignId: 3,
      aiStatus: "approved",
      riskScore: 18,
      qualityScore: 82,
      detectedIssues: [],
      recommendation: "Contenu conforme pour diffusion",
    },
    {
      campaignId: 4,
      aiStatus: "review_required",
      riskScore: 62,
      qualityScore: 74,
      detectedIssues: ["texte ambigu"],
      recommendation: "Vérification manuelle avant diffusion",
    },
    {
      campaignId: 5,
      aiStatus: "approved",
      riskScore: 12,
      qualityScore: 88,
      detectedIssues: [],
      recommendation: "Contenu conforme pour diffusion",
    },
    {
      campaignId: 6,
      aiStatus: "rejected",
      riskScore: 81,
      qualityScore: 41,
      detectedIssues: ["promesse de résultat garanti", "superlatif invérifiable"],
      recommendation: "Reformuler l'offre sans promesse garantie ni comparaison non prouvée.",
    },
  ];
}

export function demoEmergencies(): EmergencyResponse[] {
  return [
    {
      id: 1,
      title: "Alerte météo : fortes pluies attendues",
      content:
        "Évitez les déplacements non essentiels en fin de journée. Suivez les consignes de la protection civile.",
      zoneId: 1,
      startDate: isoDay(0),
      endDate: isoDay(2),
      startTime: null,
      endTime: null,
      priority: 1,
      urgencyLevel: "HIGH",
      isActive: true,
    },
    {
      id: 2,
      title: "Marathon de Sousse : circulation fermée",
      content: "Le boulevard du 14-Janvier est fermé à la circulation de 7 h à 13 h.",
      zoneId: 4,
      startDate: isoDay(-20),
      endDate: isoDay(-19),
      startTime: "07:00:00",
      endTime: "13:00:00",
      priority: 2,
      urgencyLevel: "MEDIUM",
      isActive: false,
    },
  ];
}

export const DIFFUSION_PUBLICITE: DiffusionResponse = {
  type: "publicite",
  campaignId: 5,
  title: "Semaine de la prévention santé",
  mediaUrl: null,
  duration: 10,
  zone: "Tunis Centre",
  priority: 0,
};

export const DIFFUSION_URGENCE: DiffusionResponse = {
  type: "urgence",
  campaignId: null,
  title: "Alerte météo : fortes pluies attendues",
  mediaUrl: null,
  duration: 15,
  zone: "Tunis Centre",
  priority: 1,
};

export const DIFFUSION_DEFAUT: DiffusionResponse = {
  type: "defaut",
  campaignId: null,
  title: "TPUB - Contenu par defaut",
  mediaUrl: null,
  duration: 10,
  zone: "Tunis Centre",
  priority: 0,
};

/** Fresh mutable copy of the whole dataset (one per test page). */
export function createDemoState() {
  const zones = demoZones();
  const supports = demoSupports();
  const campaigns = demoCampaigns();
  return {
    zones,
    supports,
    campaigns,
    reservations: demoReservations(campaigns, supports),
    aiReports: demoAiReports(),
    emergencies: demoEmergencies(),
    /** Extra platform-wide diffusion log rows (admin « Lignes du journal de diffusion »). */
    diffusionLogCount: 1284,
    diffusion: "publicite" as "publicite" | "urgence" | "defaut",
    user: null as SessionUser | null,
  };
}

export type DemoState = ReturnType<typeof createDemoState>;
