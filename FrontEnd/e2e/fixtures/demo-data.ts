/**
 * Realistic Tunisian demo data for the mocked `/api/**` routes (no Spring backend in e2e).
 * Shapes follow src/lib/api/types.ts, i.e. docs/completion-contract.md §2 (verbatim backend DTOs:
 * AI report / diffusion enums stay lowercase here, as the backend sends them).
 * Every value is fictional demo data; estimates use the contract §2.6 simulation formula.
 */
import type {
  AdminUserResponse,
  AiDecisionLogResponse,
  AiReportResponse,
  AiRuleResponse,
  AuditLogResponse,
  CampaignResponse,
  CampaignStatus,
  CampaignZoneResponse,
  DiffusionContentType,
  DiffusionLogResponse,
  DiffusionResponse,
  EmergencyResponse,
  EmergencyState,
  LoginHistoryResponse,
  MediaFileResponse,
  ReservationResponse,
  RoleCode,
  SessionUser,
  SupportBlockResponse,
  SupportResponse,
  SupportType,
  UserSessionResponse,
  ZoneResponse,
} from "../../src/lib/api/types";
import type {
  AiCalibrationResponse,
  AiFeedbackResponse,
} from "../../src/lib/api/types-ia";
import type {
  NotificationResponse,
  SupervisionAlert,
} from "../../src/lib/api/types-supervision";

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

/** Days between two ISO dates, inclusive (contract §2.6 `days`). */
export function daysInclusive(start: string, end: string): number {
  const a = Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
  const b = Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10));
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
}

// ---------------------------------------------------------------------------
// Simulation constants (contract §2.6) — internal, shown only as « estimation »
// ---------------------------------------------------------------------------
export const BASE_VIEWS_PER_HOUR: Record<SupportType, number> = {
  ECRAN: 120,
  PANNEAU_NUMERIQUE: 90,
  POINT_WIFI: 40,
  APPLICATION: 200,
  SITE_WEB: 250,
};

export const CPM_TND: Record<SupportType, number> = {
  ECRAN: 8,
  PANNEAU_NUMERIQUE: 6,
  POINT_WIFI: 3,
  APPLICATION: 4,
  SITE_WEB: 3.5,
};

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function hoursPerDay(startTime: string, endTime: string): number {
  return Math.max(0, minutesOf(endTime) - minutesOf(startTime)) / 60;
}

export interface Window {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

export function estimateFor(
  support: SupportResponse,
  w: Window,
): { estimatedViews: number; estimatedCost: number } {
  const visibility = support.visibilityScore ?? null;
  const factor = visibility === null ? 1 : 0.5 + visibility / 100;
  const views = Math.floor(
    (BASE_VIEWS_PER_HOUR[support.supportType] *
      factor *
      hoursPerDay(w.startTime, w.endTime) *
      daysInclusive(w.startDate, w.endDate)) /
      Math.max(1, support.diffusionCapacity),
  );
  const cost = Math.round(((views * CPM_TND[support.supportType]) / 1000) * 100) / 100;
  return { estimatedViews: views, estimatedCost: cost };
}

export function unitCost(support: SupportResponse): number {
  return Math.round((CPM_TND[support.supportType] / 1000) * 10_000) / 10_000;
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
  password: "Demo-ZELQANE-2026",
  nom: "Amira Ben Salah",
  role: "ANNONCEUR",
  userId: 12,
};

export const ADMIN: DemoAccount = {
  email: "karim.trabelsi@zelqane-demo.tn",
  password: "Admin-ZELQANE-2026",
  nom: "Karim Trabelsi",
  role: "ADMINISTRATEUR",
  userId: 1,
};

export const SUPERVISEUR: DemoAccount = {
  email: "leila.mansour@zelqane-demo.tn",
  password: "Superviseur-ZELQANE-2026",
  nom: "Leïla Mansour",
  role: "SUPERVISEUR",
  userId: 2,
};

export const ACCOUNTS: readonly DemoAccount[] = [ANNONCEUR, ADMIN, SUPERVISEUR];

/** Client id of the demo annonceur. */
export const DEMO_CLIENT_ID = 7;
export const DEMO_COMPANY = "Maison Yasmine — Décoration";

export function sessionUserOf(account: DemoAccount, ttlSeconds = 24 * 60 * 60): SessionUser {
  return {
    email: account.email,
    nom: account.nom,
    role: account.role,
    userId: account.userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
}

export function demoUsers(): AdminUserResponse[] {
  const base = {
    telephone: null,
    adresse: null,
    logoUrl: null,
    isActive: true,
    clientNotes: null,
  };
  return [
    {
      ...base,
      userId: ADMIN.userId,
      email: ADMIN.email,
      nom: ADMIN.nom,
      role: "ADMINISTRATEUR",
      societe: "ZELQANE",
      lastLoginAt: isoInstant(0, 8),
      createdAt: isoInstant(120),
      client: null,
      activeSessions: 1,
      campaignsCount: 0,
    },
    {
      ...base,
      userId: SUPERVISEUR.userId,
      email: SUPERVISEUR.email,
      nom: SUPERVISEUR.nom,
      role: "SUPERVISEUR",
      societe: "ZELQANE",
      lastLoginAt: isoInstant(2, 9),
      createdAt: isoInstant(90),
      client: null,
      activeSessions: 0,
      campaignsCount: 0,
    },
    {
      ...base,
      userId: ANNONCEUR.userId,
      email: ANNONCEUR.email,
      nom: ANNONCEUR.nom,
      role: "ANNONCEUR",
      societe: DEMO_COMPANY,
      telephone: "+216 71 000 000",
      adresse: "Rue du Lac Léman, Les Berges du Lac, Tunis",
      lastLoginAt: isoInstant(1, 10),
      createdAt: isoInstant(60),
      client: {
        clientId: DEMO_CLIENT_ID,
        companyName: DEMO_COMPANY,
        validationStatus: "VALIDATED",
        trustLevel: 70,
      },
      activeSessions: 2,
      campaignsCount: 6,
    },
    {
      ...base,
      userId: 14,
      email: "hedi.gharbi@demo-annonceur.tn",
      nom: "Hédi Gharbi",
      role: "ANNONCEUR",
      societe: "Pâtisserie Démo El Menzah",
      lastLoginAt: null,
      createdAt: isoInstant(3),
      client: {
        clientId: 8,
        companyName: "Pâtisserie Démo El Menzah",
        validationStatus: "PENDING",
        trustLevel: 50,
      },
      activeSessions: 0,
      campaignsCount: 0,
    },
  ];
}

export function demoSessions(): UserSessionResponse[] {
  return [
    {
      id: "5d2f7a10-0000-4000-8000-000000000001",
      createdAt: isoInstant(0, 8),
      lastSeenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      ipAddress: "197.0.2.10",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0",
      current: true,
    },
    {
      id: "5d2f7a10-0000-4000-8000-000000000002",
      createdAt: isoInstant(1, 18),
      lastSeenAt: isoInstant(1, 19),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      ipAddress: "197.0.2.44",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
      current: false,
    },
  ];
}

export function demoLoginHistory(email: string): LoginHistoryResponse[] {
  return [
    {
      id: 3,
      email,
      success: true,
      failureReason: null,
      ipAddress: "197.0.2.10",
      userAgent: "Chrome/140.0",
      createdAt: isoInstant(0, 8),
    },
    {
      id: 2,
      email,
      success: false,
      failureReason: "BAD_CREDENTIALS",
      ipAddress: "197.0.2.10",
      userAgent: "Chrome/140.0",
      createdAt: isoInstant(0, 7),
    },
    {
      id: 1,
      email,
      success: true,
      failureReason: null,
      ipAddress: "197.0.2.44",
      userAgent: "Safari/604.1",
      createdAt: isoInstant(1, 18),
    },
  ];
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
      visibilityScore: 80,
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
      visibilityScore: 60,
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
      visibilityScore: 70,
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
      visibilityScore: null,
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
      visibilityScore: null,
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
      visibilityScore: 50,
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
      visibilityScore: null,
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
      visibilityScore: null,
    },
  ];
}

export function demoSupportBlocks(): SupportBlockResponse[] {
  return [
    {
      id: 1,
      supportId: 6,
      date: isoDay(20),
      startTime: "07:00:00",
      endTime: "12:00:00",
      availabilityStatus: "MAINTENANCE",
      reason: "Nettoyage des faces et contrôle électrique",
      createdAt: isoInstant(2, 11),
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
    clientId: DEMO_CLIENT_ID,
    clientName: ANNONCEUR.nom,
    clientCompanyName: DEMO_COMPANY,
    clientValidationStatus: "VALIDATED",
    consumedBudget: 0,
    remainingBudget: rest.budget,
    estimatedCost: 0,
    aiStatus: null,
    adminStatus: null,
    aiOverride: false,
    startDate: isoDay(startIn),
    endDate: isoDay(startIn + days),
    startTime: "08:00:00",
    endTime: "20:00:00",
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
    editable: false,
    submittable: false,
    deletable: false,
    createdAt: isoInstant(createdDaysAgo),
    updatedAt: isoInstant(createdDaysAgo),
    submittedAt: null,
    validatedAt: null,
    activatedAt: null,
    terminatedAt: null,
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
    }),
    campaign({
      id: 3,
      name: "Ouverture boutique La Marsa",
      objective:
        "Informer les habitants de La Marsa de l'ouverture d'une nouvelle boutique de prêt-à-porter, horaires et adresse.",
      budget: 3500,
      status: "APPROVED_BY_AI",
      aiStatus: "APPROVED",
      // Starts today: an administrator validation makes it ACTIVE right away (contract §2.1).
      startIn: 0,
      days: 30,
      createdDaysAgo: 6,
      submittedAt: isoInstant(4, 10),
      startTime: "09:00:00",
      endTime: "21:00:00",
      aiRiskScore: 18,
      aiQualityScore: 82,
      aiSector: "COMMERCE",
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
      aiRiskScore: 45,
      aiQualityScore: 74,
      aiSector: "EVENEMENT",
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
      activatedAt: isoInstant(3, 0),
      priorityScore: 6,
      aiRiskScore: 22,
      aiQualityScore: 88,
      aiSector: "SANTE",
      adminComment: "Message de santé publique, priorité renforcée.",
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
      aiRiskScore: 81,
      aiQualityScore: 41,
      aiSector: "COMMERCE",
    }),
  ];
}

function circleOf(id: number, zone: ZoneResponse, label: string | null): CampaignZoneResponse {
  return {
    id,
    zoneId: zone.id,
    zoneName: zone.name,
    label,
    latitude: zone.latitude,
    longitude: zone.longitude,
    radiusKm: zone.radiusKm ?? 3,
    supportsInside: 0,
  };
}

/** Campaign circles of the seeded campaigns that already hold reservations. */
export function demoCampaignZones(zones: ZoneResponse[]): Record<number, CampaignZoneResponse[]> {
  const z = (id: number) => zones.find((x) => x.id === id) as ZoneResponse;
  return {
    2: [circleOf(1, z(2), "Berges du Lac")],
    3: [circleOf(2, z(3), "La Marsa"), circleOf(3, z(1), "Centre-ville")],
    4: [circleOf(4, z(4), "Sousse")],
    5: [circleOf(5, z(1), "Tunis Centre"), circleOf(6, z(4), "Sousse")],
    6: [circleOf(7, z(2), null)],
  };
}

export function demoMedia(): MediaFileResponse[] {
  return [
    {
      id: 1,
      campaignId: 5,
      fileName: "prevention-sante-affiche.png",
      fileType: "IMAGE",
      mimeType: "image/png",
      fileSizeBytes: 184_220,
      durationSeconds: null,
      widthPx: 1920,
      heightPx: 1080,
      url: "/uploads/campaigns/5/prevention-sante-affiche.png",
      checksum: "a1f3c9",
      sortOrder: 0,
      createdAt: isoInstant(19),
    },
    {
      id: 2,
      campaignId: 3,
      fileName: "ouverture-la-marsa.png",
      fileType: "IMAGE",
      mimeType: "image/png",
      fileSizeBytes: 96_400,
      durationSeconds: null,
      widthPx: 1280,
      heightPx: 720,
      url: "/uploads/campaigns/3/ouverture-la-marsa.png",
      checksum: "b7e210",
      sortOrder: 0,
      createdAt: isoInstant(5),
    },
  ];
}

function reservation(
  id: number,
  c: CampaignResponse,
  support: SupportResponse,
  status: ReservationResponse["reservationStatus"],
): ReservationResponse {
  const w: Window = {
    startDate: c.startDate ?? isoDay(0),
    endDate: c.endDate ?? isoDay(7),
    startTime: c.startTime ?? "08:00:00",
    endTime: c.endTime ?? "20:00:00",
  };
  return {
    id,
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
    reservationStatus: status,
    ...estimateFor(support, w),
    createdAt: c.submittedAt ?? c.createdAt,
    cancelledAt: null,
    cancelReason: null,
    expiredAt: null,
    cancellable: false,
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

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------
type ReportSeed = Pick<
  AiReportResponse,
  "campaignId" | "aiStatus" | "riskScore" | "qualityScore" | "recommendation"
> &
  Partial<AiReportResponse>;

export function aiReport(seed: ReportSeed): AiReportResponse {
  return {
    checkId: seed.campaignId * 10,
    detectedIssues: [],
    issues: [],
    recommendations: [],
    reason: null,
    sector: null,
    contentType: "TEXTE",
    extractedText: null,
    ocrEngine: "AUCUN",
    engine: "LOCAL",
    mediaAnalyses: [],
    matchedRules: [],
    preview: false,
    adminDecision: "PENDING",
    checkedAt: isoInstant(4, 10),
    ...seed,
  };
}

export function demoAiReports(): AiReportResponse[] {
  return [
    aiReport({
      campaignId: 3,
      aiStatus: "approved",
      riskScore: 18,
      qualityScore: 82,
      recommendation: "Contenu conforme pour diffusion",
      sector: "COMMERCE",
      contentType: "IMAGE",
      extractedText: "ouverture la marsa",
      ocrEngine: "SIMULE",
      mediaAnalyses: [
        {
          mediaId: 2,
          fileName: "ouverture-la-marsa.png",
          contentType: "IMAGE",
          widthPx: 1280,
          heightPx: 720,
          durationSeconds: null,
          extractedText: "ouverture la marsa",
          issues: [],
        },
      ],
    }),
    aiReport({
      campaignId: 4,
      aiStatus: "review_required",
      riskScore: 45,
      qualityScore: 74,
      detectedIssues: ["promesse « gratuit » à vérifier", "aucun visuel fourni"],
      issues: [
        { label: "promesse « gratuit » à vérifier", severity: "MEDIUM", source: "REGLE" },
        { label: "aucun visuel fourni", severity: "LOW", source: "IMAGE" },
      ],
      recommendations: ["Précisez les conditions de gratuité", "Ajoutez un visuel 1280×720 px"],
      matchedRules: [{ ruleId: 1, ruleName: "promesse-gratuit-garanti", severity: "MEDIUM" }],
      recommendation: "Vérification manuelle avant diffusion",
      sector: "EVENEMENT",
      checkedAt: isoInstant(5, 11),
    }),
    aiReport({
      campaignId: 5,
      aiStatus: "approved",
      riskScore: 22,
      qualityScore: 88,
      recommendation: "Contenu conforme pour diffusion",
      sector: "SANTE",
      contentType: "IMAGE",
      issues: [
        {
          label: "secteur sensible (santé) : allégations à vérifier",
          severity: "LOW",
          source: "SECTEUR",
        },
      ],
      detectedIssues: ["secteur sensible (santé) : allégations à vérifier"],
      adminDecision: "VALIDATED",
      checkedAt: isoInstant(15, 9),
    }),
    aiReport({
      campaignId: 6,
      aiStatus: "rejected",
      riskScore: 81,
      qualityScore: 41,
      detectedIssues: ["promesse de résultat garanti", "superlatif invérifiable"],
      issues: [
        { label: "promesse de résultat garanti", severity: "HIGH", source: "REGLE" },
        { label: "superlatif invérifiable", severity: "MEDIUM", source: "TEXTE" },
      ],
      recommendations: ["Reformuler l'offre sans promesse garantie ni comparaison non prouvée."],
      matchedRules: [{ ruleId: 1, ruleName: "promesse-gratuit-garanti", severity: "MEDIUM" }],
      recommendation: "Contenu non diffusable en l'état : corrigez les points signalés",
      sector: "COMMERCE",
      checkedAt: isoInstant(9, 16),
    }),
  ];
}

export function demoAiRules(): AiRuleResponse[] {
  const at = isoInstant(100);
  const rule = (
    id: number,
    ruleName: string,
    ruleType: AiRuleResponse["ruleType"],
    pattern: string,
    severity: AiRuleResponse["severity"],
    sector: AiRuleResponse["sector"],
    description: string,
  ): AiRuleResponse => ({
    id,
    ruleName,
    ruleType,
    pattern,
    severity,
    sector,
    isActive: true,
    description,
    createdAt: at,
    updatedAt: at,
  });
  return [
    rule(
      1,
      "promesse-gratuit-garanti",
      "KEYWORD",
      "gratuit, garanti, garantie, 100% garanti",
      "MEDIUM",
      null,
      "Promesses de gratuité ou de garantie à vérifier.",
    ),
    rule(
      2,
      "allegations-miracles",
      "KEYWORD",
      "miracle, sans effort, guerison, resultat immediat",
      "HIGH",
      "SANTE",
      "Allégations de résultats non prouvés.",
    ),
    rule(
      3,
      "jeux-argent",
      "KEYWORD",
      "casino, paris sportifs, jackpot",
      "HIGH",
      null,
      "Jeux d'argent.",
    ),
    rule(
      4,
      "alcool-tabac",
      "KEYWORD",
      "alcool, biere, whisky, cigarette, tabac, chicha",
      "HIGH",
      null,
      "Alcool et tabac.",
    ),
    rule(
      5,
      "armes-drogues",
      "KEYWORD",
      "arme a feu, munitions, cannabis, cocaine",
      "CRITICAL",
      null,
      "Armes et stupéfiants.",
    ),
    rule(
      6,
      "incitation-haine",
      "KEYWORD",
      "incitation a la haine",
      "CRITICAL",
      null,
      "Discours haineux.",
    ),
    rule(
      7,
      "donnees-sensibles",
      "REGEX",
      "\\b(rib|iban|code pin|mot de passe)\\b",
      "HIGH",
      null,
      "Demande de données sensibles.",
    ),
    rule(
      8,
      "urgence-artificielle",
      "REGEX",
      "(derniere chance|offre limitee).{0,20}!{2,}",
      "LOW",
      null,
      "Urgence artificielle.",
    ),
  ];
}

export function demoAiDecisions(campaigns: CampaignResponse[]): AiDecisionLogResponse[] {
  const name = (id: number) => campaigns.find((c) => c.id === id)?.name ?? "";
  const row = (
    id: number,
    campaignId: number,
    decisionType: "AI" | "ADMIN",
    decision: string,
    riskScore: number,
    qualityScore: number,
    createdAt: string,
    reason: string | null = null,
  ): AiDecisionLogResponse => ({
    id,
    campaignId,
    campaignName: name(campaignId),
    checkId: campaignId * 10,
    decisionType,
    decision,
    reason,
    decidedByUserId: decisionType === "ADMIN" ? ADMIN.userId : null,
    decidedByName: decisionType === "ADMIN" ? ADMIN.nom : null,
    riskScore,
    qualityScore,
    preview: false,
    createdAt,
  });
  return [
    row(5, 6, "AI", "REJECTED", 81, 41, isoInstant(9, 16), "Promesse de résultat garanti"),
    row(4, 4, "AI", "REVIEW_REQUIRED", 45, 74, isoInstant(5, 11)),
    row(3, 3, "AI", "APPROVED", 18, 82, isoInstant(4, 10)),
    row(2, 5, "ADMIN", "VALIDATED", 22, 88, isoInstant(12, 14), "Message de santé publique"),
    row(1, 5, "AI", "APPROVED", 22, 88, isoInstant(15, 9)),
  ];
}

// ---------------------------------------------------------------------------
// Emergencies, diffusion, audit
// ---------------------------------------------------------------------------
export function emergencyState(
  e: Pick<
    EmergencyResponse,
    "isActive" | "stopReason" | "startDate" | "endDate" | "startTime" | "endTime"
  >,
  now = new Date(),
): EmergencyState {
  if (!e.isActive) return e.stopReason === "AUTO" ? "TERMINE" : "DESACTIVE";
  const local = `${isoDay(0, now)}T${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now)}`;
  const start = `${e.startDate}T${e.startTime ?? "00:00:00"}`;
  const end = `${e.endDate}T${e.endTime ?? "23:59:59"}`;
  if (local < start) return "PROGRAMME";
  if (local > end) return "TERMINE";
  return "EN_COURS";
}

export function demoEmergencies(): EmergencyResponse[] {
  const list: EmergencyResponse[] = [
    {
      id: 1,
      title: "Alerte météo : fortes pluies attendues",
      content:
        "Évitez les déplacements non essentiels en fin de journée. Suivez les consignes de la protection civile.",
      zoneId: 1,
      zoneName: "Tunis Centre",
      latitude: null,
      longitude: null,
      radiusKm: null,
      startDate: isoDay(0),
      endDate: isoDay(2),
      startTime: "00:00:00",
      endTime: "23:59:59",
      durationSeconds: 15,
      priority: 1,
      urgencyLevel: "HIGH",
      isActive: true,
      state: "EN_COURS",
      stoppedAt: null,
      stopReason: null,
      affectedSupports: 2,
      diffusionCount: 36,
      createdByName: ADMIN.nom,
      createdAt: isoInstant(0, 6),
    },
    {
      id: 2,
      title: "Marathon de Sousse : circulation fermée",
      content: "Le boulevard du 14-Janvier est fermé à la circulation de 7 h à 13 h.",
      zoneId: 4,
      zoneName: "Sousse Centre",
      latitude: 35.8388,
      longitude: 10.6279,
      radiusKm: 1.5,
      startDate: isoDay(-20),
      endDate: isoDay(-19),
      startTime: "07:00:00",
      endTime: "13:00:00",
      durationSeconds: 20,
      priority: 2,
      urgencyLevel: "MEDIUM",
      isActive: false,
      state: "TERMINE",
      stoppedAt: isoInstant(19, 12),
      stopReason: "AUTO",
      affectedSupports: 1,
      diffusionCount: 58,
      createdByName: ADMIN.nom,
      createdAt: isoInstant(22, 9),
    },
  ];
  return list.map((e) => ({ ...e, state: emergencyState(e) }));
}

/** Deterministic journal: campaign 5 on its two Porteurs, one diffusion per hour over 14 days. */
export function demoDiffusionLogs(supports: SupportResponse[]): DiffusionLogResponse[] {
  const out: DiffusionLogResponse[] = [];
  let id = 1;
  const add = (
    supportId: number,
    daysAgo: number,
    hour: number,
    contentType: DiffusionContentType,
    campaignId: number | null,
    title: string,
  ) => {
    const s = supports.find((x) => x.id === supportId) as SupportResponse;
    const diffusedAt = new Date(Date.now() - daysAgo * 86_400_000);
    diffusedAt.setUTCHours(hour, 0, 0, 0);
    out.push({
      id: id++,
      supportId,
      supportName: s.name,
      zoneId: s.zoneId,
      zoneName: s.zoneName,
      campaignId,
      campaignName: campaignId ? "Semaine de la prévention santé" : null,
      emergencyId: contentType === "URGENCE" ? 1 : null,
      contentType,
      title,
      mediaUrl: campaignId ? "/uploads/campaigns/5/prevention-sante-affiche.png" : null,
      durationSeconds: contentType === "URGENCE" ? 15 : 10,
      priority: contentType === "PUBLICITE" ? 64 : contentType === "URGENCE" ? 1 : 0,
      cost: contentType === "PUBLICITE" ? unitCost(s) : 0,
      clicks: contentType === "PUBLICITE" && (id + daysAgo) % 7 === 0 ? 1 : 0,
      interactions: contentType === "PUBLICITE" && (id + hour) % 11 === 0 ? 1 : 0,
      diffusedAt: diffusedAt.toISOString(),
      createdAt: diffusedAt.toISOString(),
    });
  };
  for (let d = 3; d >= 1; d--) {
    for (const hour of [7, 9, 11, 13, 15, 17]) {
      add(2, d, hour, "PUBLICITE", 5, "Semaine de la prévention santé");
      add(6, d, hour, "PUBLICITE", 5, "Semaine de la prévention santé");
    }
    add(1, d, 10, "DEFAUT", null, "ZELQANE — Tukhnanutha");
  }
  add(1, 0, 6, "URGENCE", null, "Alerte météo : fortes pluies attendues");
  return out;
}

export function demoAuditLogs(): AuditLogResponse[] {
  const row = (
    id: number,
    action: AuditLogResponse["action"],
    entityType: AuditLogResponse["entityType"],
    entityId: string,
    summary: string,
    createdAt: string,
    details: Record<string, unknown> | null = null,
  ): AuditLogResponse => ({
    id,
    actorUserId: ADMIN.userId,
    actorEmail: ADMIN.email,
    actorName: ADMIN.nom,
    actorRole: "ADMINISTRATEUR",
    action,
    entityType,
    entityId,
    summary,
    details,
    ipAddress: "197.0.2.1",
    createdAt,
  });
  return [
    row(
      3,
      "EMERGENCY_CREATED",
      "EMERGENCY",
      "1",
      "Message prioritaire « Alerte météo » créé",
      isoInstant(0, 6),
    ),
    row(
      2,
      "SUPPORT_BLOCK_CREATED",
      "SUPPORT",
      "6",
      "Maintenance planifiée sur Écran Boulevard du 14-Janvier",
      isoInstant(2, 11),
      { days: 1 },
    ),
    row(
      1,
      "CAMPAIGN_VALIDATED",
      "CAMPAIGN",
      "5",
      "Campagne « Semaine de la prévention santé » validée",
      isoInstant(12, 14),
      { priorityScore: 6 },
    ),
  ];
}

export const DIFFUSION_PUBLICITE: DiffusionResponse = {
  type: "publicite",
  diffusionLogId: 9001,
  supportId: 1,
  campaignId: 5,
  emergencyId: null,
  title: "Semaine de la prévention santé",
  content: null,
  mediaUrl: null,
  mediaType: null,
  duration: 10,
  zone: "Tunis Centre",
  priority: 0,
  urgencyLevel: null,
  datetime: `${isoDay(0)}T10:00:00`,
};

export const DIFFUSION_URGENCE: DiffusionResponse = {
  type: "urgence",
  diffusionLogId: 9002,
  supportId: 1,
  campaignId: null,
  emergencyId: 1,
  title: "Alerte météo : fortes pluies attendues",
  content:
    "Évitez les déplacements non essentiels en fin de journée. Suivez les consignes de la protection civile.",
  mediaUrl: null,
  mediaType: null,
  duration: 15,
  zone: "Tunis Centre",
  priority: 1,
  urgencyLevel: "HIGH",
  datetime: `${isoDay(0)}T10:00:00`,
};

export const DIFFUSION_DEFAUT: DiffusionResponse = {
  type: "defaut",
  diffusionLogId: 9003,
  supportId: 1,
  campaignId: null,
  emergencyId: null,
  title: "ZELQANE — Tukhnanutha",
  content: "Espace de diffusion ZELQANE",
  mediaUrl: null,
  mediaType: null,
  duration: 10,
  zone: "Tunis Centre",
  priority: 0,
  urgencyLevel: null,
  datetime: `${isoDay(0)}T10:00:00`,
};

/** Statuses in the order of `statusCounts` (contract §2.9). */
export const ALL_CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "BROUILLON",
  "PENDING_AI_CHECK",
  "APPROVED_BY_AI",
  "REVIEW_REQUIRED",
  "REJECTED_BY_AI",
  "VALIDATED_BY_ADMIN",
  "ACTIVE",
  "TERMINATED",
  "BLOCKED",
];

/** Fresh mutable copy of the whole dataset (one per test page). */
export function createDemoState() {
  const zones = demoZones();
  const supports = demoSupports();
  const campaigns = demoCampaigns();
  const zonesByCampaign = demoCampaignZones(zones);
  for (const c of campaigns) c.zones = zonesByCampaign[c.id] ?? [];
  const users = demoUsers();
  return {
    zones,
    supports,
    campaigns,
    reservations: demoReservations(campaigns, supports),
    aiReports: demoAiReports(),
    /** Every check (newest last), including previews. */
    aiChecks: demoAiReports(),
    aiRules: demoAiRules(),
    aiDecisions: demoAiDecisions(campaigns),
    media: demoMedia(),
    supportBlocks: demoSupportBlocks(),
    emergencies: demoEmergencies(),
    diffusionLogs: demoDiffusionLogs(supports),
    interactions: new Set<string>(),
    users,
    sessions: demoSessions(),
    auditLogs: demoAuditLogs(),
    // Round 2: supervision alerts and staff notifications.
    alerts: demoAlerts(),
    notifications: demoNotifications(),
    aiCalibrations: demoCalibrations(),
    aiFeedback: demoAiFeedback(),
    /** Extra platform-wide diffusion log rows (admin « Lignes du journal de diffusion »). */
    diffusionLogCount: 1284,
    diffusion: "publicite" as "publicite" | "urgence" | "defaut",
    user: null as SessionUser | null,
    /** Last generated ids for rows without a natural max (zones of campaigns…). */
    seq: { campaignZone: 100, check: 1000, decision: 100, audit: 100, block: 100, media: 100 },
  };
}

export type DemoState = ReturnType<typeof createDemoState>;

// ---------------------------------------------------------------------------
// Round 2 — supervision alerts and staff notifications (docs/round2-contract.md §5)
// ---------------------------------------------------------------------------
/** One open alert (a Porteur that stopped reporting) and one already resolved. */
export function demoAlerts(): SupervisionAlert[] {
  const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  return [
    {
      id: 1,
      type: "SUPPORT_OFFLINE",
      severity: "CRITIQUE",
      title: "Écran hors ligne : Écran Boulevard Hédi Chaker",
      message:
        "Le Porteur « Écran Boulevard Hédi Chaker » n'a plus donné signe de vie depuis 90 secondes.",
      supportId: 9,
      zoneId: 4,
      emergencyId: null,
      campaignId: null,
      createdAt: at(25),
      resolvedAt: null,
      acknowledgedAt: null,
      acknowledgedByName: null,
    },
    {
      id: 2,
      type: "ZONE_SATURATION",
      severity: "AVERTISSEMENT",
      title: "Zone saturée : Tunis Centre",
      message: "Tous les Porteurs ACTIF de « Tunis Centre » sont réservés sur la période.",
      supportId: null,
      zoneId: 1,
      emergencyId: null,
      campaignId: null,
      createdAt: at(180),
      resolvedAt: at(60),
      acknowledgedAt: at(120),
      acknowledgedByName: "Administrateur ZELQANE",
    },
  ];
}

/** Two unread notifications and one already read, newest first. */
export function demoNotifications(): NotificationResponse[] {
  const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  return [
    {
      id: 3,
      type: "SUPPORT_OFFLINE",
      severity: "CRITIQUE",
      title: "Écran hors ligne : Écran Boulevard Hédi Chaker",
      message: "Le Porteur ne répond plus depuis 90 secondes.",
      link: "/admin/supervision?porteur=9",
      entityType: "SUPPORT",
      entityId: "9",
      createdAt: at(25),
      readAt: null,
    },
    {
      id: 2,
      type: "CAMPAIGN_APPROVAL_REQUIRED",
      severity: "AVERTISSEMENT",
      title: "Deuxième validation demandée : Promo rentrée",
      message: "Une dérogation à l'avis de l'IA attend un second administrateur.",
      link: "/admin/approbations",
      entityType: "CAMPAIGN",
      entityId: "4",
      createdAt: at(90),
      readAt: null,
    },
    {
      id: 1,
      type: "EMERGENCY_BROADCAST",
      severity: "CRITIQUE",
      title: "Message prioritaire diffusé : Alerte météo",
      message: "Le message prioritaire est diffusé sur les écrans de la zone.",
      link: "/admin/urgences",
      entityType: "EMERGENCY",
      entityId: "1",
      createdAt: at(240),
      readAt: at(200),
    },
  ];
}

/** Active calibration of the AI (round 2 §2.6) plus the initial version. */
export function demoCalibrations(): AiCalibrationResponse[] {
  return [
    {
      version: 2,
      active: true,
      trigger: "PLANIFIE",
      changed: true,
      approveThreshold: 33,
      rejectThreshold: 70,
      ruleWeights: [{ ruleId: 1, ruleName: "promesse-gratuit-garanti", weight: 0.85 }],
      feedbackCount: 24,
      falsePositives: 6,
      falseNegatives: 2,
      createdByName: null,
      createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      version: 1,
      active: false,
      trigger: "INITIAL",
      changed: false,
      approveThreshold: 31,
      rejectThreshold: 70,
      ruleWeights: [],
      feedbackCount: 0,
      falsePositives: 0,
      falseNegatives: 0,
      createdByName: null,
      createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    },
  ];
}

/** Admin decisions compared with the AI verdict, newest first. */
export function demoAiFeedback(): AiFeedbackResponse[] {
  const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  return [
    {
      id: 3,
      campaignId: 4,
      campaignName: "Promo rentrée",
      checkId: 1002,
      decisionLogId: 12,
      aiStatus: "REVIEW_REQUIRED",
      adminDecision: "VALIDATED_OVERRIDE",
      outcome: "FALSE_POSITIVE",
      riskScore: 42,
      qualityScore: 68,
      matchedRuleIds: [1],
      calibrationVersion: 2,
      decidedByName: "Administrateur ZELQANE",
      createdAt: at(1),
    },
    {
      id: 2,
      campaignId: 2,
      campaignName: "Soldes d'été",
      checkId: 1001,
      decisionLogId: 8,
      aiStatus: "APPROVED",
      adminDecision: "VALIDATED",
      outcome: "CONFIRMED_APPROVAL",
      riskScore: 12,
      qualityScore: 82,
      matchedRuleIds: [],
      calibrationVersion: 2,
      decidedByName: "Administrateur ZELQANE",
      createdAt: at(4),
    },
    {
      id: 1,
      campaignId: 5,
      campaignName: "Ouverture boutique",
      checkId: 1000,
      decisionLogId: 5,
      aiStatus: "REVIEW_REQUIRED",
      adminDecision: "REJECTED",
      outcome: "CONFIRMED_FLAG",
      riskScore: 55,
      qualityScore: 40,
      matchedRuleIds: [2],
      calibrationVersion: 1,
      decidedByName: "Administrateur ZELQANE",
      createdAt: at(9),
    },
  ];
}
