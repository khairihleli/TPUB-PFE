/**
 * Back-office overview: GET /statistics/dashboard (platform-wide) and, for roles allowed to list
 * campaigns, the campaigns list itself, so the hero « À décider par TPUB » and the cards read the
 * same data. Labels are deliberately literal (brief §6): « lignes du journal » are rows of the
 * diffusion log, budgets are the amounts typed by advertisers, consumedBudget is never
 * incremented by the backend.
 */
import { emergencyPhase } from "@/components/admin/emergency-schema";
import { checkNetworkCoherence } from "@/components/admin/network-coherence";
import type {
  CampaignResponse,
  DashboardResponse,
  EmergencyResponse,
  SupportResponse,
  ZoneResponse,
} from "@/lib/api/types";
import { routes } from "@/lib/routes";

export type OverviewAccent = "orange" | "blue" | "red" | "success" | "warning" | "neutral";

export type OverviewKey =
  | "totalCampaigns"
  | "activeCampaigns"
  | "aiPendingCampaigns"
  | "aiRejectedCampaigns"
  | "availableSupports"
  | "confirmedReservations"
  | "totalViews"
  | "estimatedBudget"
  | "consumedBudget";

export interface OverviewItem {
  key: OverviewKey;
  label: string;
  value: number;
  format: "number" | "tnd";
  hint: string;
  accent: OverviewAccent;
  /** Short « what this counts » explanation for the InfoTip. */
  source: string;
  /** Zero values are rendered dimmed (neutral), never in an attention colour. */
  dimmed: boolean;
}

export interface OverviewGroup {
  id: "campagnes" | "reseau" | "journal";
  title: string;
  description: string;
  items: OverviewItem[];
}

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** « À décider par TPUB »: APPROVED_BY_AI + REVIEW_REQUIRED (same filter as the nav badge). */
export interface DecisionQueueSummary {
  total: number;
  approved: number;
  review: number;
  /** « 1 avis IA favorable · 1 revue manuelle » */
  breakdown: string;
}

export function summarizeDecisionQueue(
  campaigns: readonly Pick<CampaignResponse, "status">[],
): DecisionQueueSummary {
  const approved = campaigns.filter((c) => c.status === "APPROVED_BY_AI").length;
  const review = campaigns.filter((c) => c.status === "REVIEW_REQUIRED").length;
  return {
    total: approved + review,
    approved,
    review,
    breakdown: `${approved} avis IA favorable${approved > 1 ? "s" : ""} · ${review} revue${review > 1 ? "s" : ""} manuelle${review > 1 ? "s" : ""}`,
  };
}

/** Campaign counts from the list when available, otherwise from the dashboard. */
export function campaignCounts(
  d: DashboardResponse | null | undefined,
  campaigns: readonly Pick<CampaignResponse, "status">[] | null | undefined,
): Pick<
  DashboardResponse,
  "totalCampaigns" | "activeCampaigns" | "aiPendingCampaigns" | "aiRejectedCampaigns"
> {
  if (campaigns) {
    const count = (...statuses: string[]) =>
      campaigns.filter((c) => statuses.includes(c.status)).length;
    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: count("ACTIVE", "VALIDATED_BY_ADMIN"),
      aiPendingCampaigns: count("PENDING_AI_CHECK"),
      aiRejectedCampaigns: count("REJECTED_BY_AI"),
    };
  }
  return {
    totalCampaigns: n(d?.totalCampaigns),
    activeCampaigns: n(d?.activeCampaigns),
    aiPendingCampaigns: n(d?.aiPendingCampaigns),
    aiRejectedCampaigns: n(d?.aiRejectedCampaigns),
  };
}

function item(
  key: OverviewKey,
  value: number,
  rest: Omit<OverviewItem, "key" | "value" | "dimmed">,
): OverviewItem {
  return { key, value, ...rest, dimmed: value === 0 };
}

export function buildOverviewGroups(
  d: DashboardResponse,
  campaigns: readonly Pick<CampaignResponse, "status">[] | null = null,
): OverviewGroup[] {
  const c = campaignCounts(d, campaigns);
  const fromList = campaigns !== null;
  return [
    {
      id: "campagnes",
      title: "Campagnes",
      description: "Toutes les campagnes de la plateforme, tous annonceurs confondus.",
      items: [
        item("totalCampaigns", c.totalCampaigns, {
          label: "Campagnes enregistrées",
          format: "number",
          hint: "Brouillons compris",
          accent: "orange",
          source: "Nombre total de campagnes, quel que soit leur statut.",
        }),
        item("activeCampaigns", c.activeCampaigns, {
          label: "Validées (programmées ou en diffusion)",
          format: "number",
          hint: "Validées par TPUB, période commencée ou à venir",
          accent: "success",
          source: fromList
            ? "Campagnes validées par un administrateur, que leur période ait commencé ou non."
            : "Campagnes passées au statut actif à la validation, y compris si la période n'a pas commencé.",
        }),
        item("aiPendingCampaigns", c.aiPendingCampaigns, {
          label: "Analyse IA en attente",
          format: "number",
          hint: "Soumises, pas encore analysées",
          accent: "blue",
          source: "Campagnes soumises dont l'analyse IA n'a pas encore été exécutée.",
        }),
        item("aiRejectedCampaigns", c.aiRejectedCampaigns, {
          label: "À corriger après analyse IA",
          format: "number",
          hint: "Renvoyées à l'annonceur",
          accent: "red",
          source: "Campagnes rejetées par l'analyse IA, à dupliquer et corriger par l'annonceur.",
        }),
      ],
    },
    {
      id: "reseau",
      title: "Réseau & réservations",
      description: "État déclaré des Porteurs et des créneaux confirmés.",
      items: [
        item("availableSupports", n(d.availableSupports), {
          label: "Porteurs actifs",
          format: "number",
          hint: "État technique saisi dans le back-office",
          accent: "blue",
          source:
            "Porteurs dont l'état technique est « Actif ». Il s'agit de l'état saisi, pas d'une supervision en temps réel.",
        }),
        item("confirmedReservations", n(d.confirmedReservations), {
          label: "Créneaux confirmés",
          format: "number",
          hint: "Confirmés à la validation des campagnes",
          accent: "success",
          source: "Créneaux passés au statut « Confirmé » lors de la validation d'une campagne.",
        }),
      ],
    },
    {
      id: "journal",
      title: "Journal de diffusion & budgets",
      description: "Activité enregistrée par les lecteurs et montants déclarés.",
      items: [
        item("totalViews", n(d.totalViews), {
          label: "Lignes du journal de diffusion",
          format: "number",
          hint: "Chaque appel d'un lecteur, contenus par défaut et messages prioritaires compris",
          accent: "neutral",
          source:
            "Nombre d'enregistrements du journal de diffusion. Il prouve une activité des lecteurs, pas une audience : ce n'est pas un nombre de vues.",
        }),
        item("estimatedBudget", n(d.estimatedBudget), {
          label: "Budget déclaré",
          format: "tnd",
          hint: "Somme des budgets saisis par les annonceurs",
          accent: "orange",
          source:
            "Total des budgets indiqués dans les campagnes (tous statuts). Ce n'est ni un chiffre d'affaires ni un montant facturé.",
        }),
        item("consumedBudget", n(d.consumedBudget), {
          label: "Budget consommé",
          format: "tnd",
          hint: "Suivi de consommation pas encore alimenté",
          accent: "neutral",
          source:
            "Le suivi de consommation n'est pas encore branché : cette valeur reste à zéro tant que la facturation n'est pas activée.",
        }),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// « À surveiller »
// ---------------------------------------------------------------------------
export interface WatchItem {
  key: "coherence" | "porteurs" | "urgences";
  label: string;
  /** Detail line (« 2 en maintenance · 1 hors ligne »). */
  detail: string;
  count: number;
  /** Attention tone only when count > 0 and the metric is a problem. */
  tone: "danger" | "warning" | "neutral";
  href: string;
  linkLabel: string;
}

export function coherenceWatch(
  zones: readonly ZoneResponse[],
  supports: readonly SupportResponse[],
): WatchItem {
  const report = checkNetworkCoherence(zones, supports);
  const count = report.bySeverity.danger + report.bySeverity.warning;
  return {
    key: "coherence",
    label:
      count === 0
        ? "Aucune incohérence réseau"
        : `${count} incohérence${count > 1 ? "s" : ""} réseau`,
    detail:
      count === 0
        ? report.bySeverity.info > 0
          ? `${report.bySeverity.info} déclaration${report.bySeverity.info > 1 ? "s" : ""} à compléter`
          : "Zones et Porteurs cohérents"
        : [
            report.bySeverity.danger > 0
              ? `${report.bySeverity.danger} erreur${report.bySeverity.danger > 1 ? "s" : ""}`
              : null,
            report.bySeverity.warning > 0 ? `${report.bySeverity.warning} à vérifier` : null,
          ]
            .filter(Boolean)
            .join(" · "),
    count,
    tone: report.bySeverity.danger > 0 ? "danger" : count > 0 ? "warning" : "neutral",
    href: routes.admin.network({ onglet: "ecrans", panneau: "coherence" }),
    linkLabel: "Contrôle de cohérence",
  };
}

export function porteursWatch(
  supports: readonly Pick<SupportResponse, "technicalStatus">[],
): WatchItem {
  const maintenance = supports.filter((s) => s.technicalStatus === "MAINTENANCE").length;
  const offline = supports.filter((s) => s.technicalStatus === "HORS_LIGNE").length;
  const count = maintenance + offline;
  return {
    key: "porteurs",
    label:
      count === 0
        ? "Aucun Porteur en maintenance ou hors ligne"
        : `${count} Porteur${count > 1 ? "s" : ""} en maintenance ou hors ligne`,
    detail: `${maintenance} en maintenance · ${offline} hors ligne (état saisi)`,
    count,
    tone: offline > 0 ? "danger" : maintenance > 0 ? "warning" : "neutral",
    href: routes.admin.network({ onglet: "ecrans" }),
    linkLabel: "Voir les Porteurs",
  };
}

export function emergenciesWatch(
  messages: readonly Pick<EmergencyResponse, "isActive" | "startDate" | "endDate">[],
  today: string,
): WatchItem {
  const current = messages.filter((m) => emergencyPhase(m, today) === "current").length;
  const scheduled = messages.filter((m) => emergencyPhase(m, today) === "scheduled").length;
  const count = current + scheduled;
  return {
    key: "urgences",
    label:
      count === 0
        ? "Aucun message prioritaire actif"
        : `${count} message${count > 1 ? "s" : ""} prioritaire${count > 1 ? "s" : ""} actif${count > 1 ? "s" : ""}`,
    detail: `${current} en cours · ${scheduled} programmé${scheduled > 1 ? "s" : ""}`,
    count,
    // A current message takes over the screens: worth noticing, not an error.
    tone: current > 0 ? "warning" : "neutral",
    href: routes.admin.emergencies(),
    linkLabel: "Messages prioritaires",
  };
}
