/**
 * Back-office overview (pure): every figure of GET /statistics/dashboard v2 (contract §2.9, CdC §6)
 * grouped by theme, plus « À décider » and « À surveiller ». Labels stay literal (brief §6):
 * « affichages » are PUBLICITE rows of the diffusion journal, budgets are amounts typed by the
 * advertisers, revenue is simulated.
 */
import { emergencyStateOf } from "@/components/admin/emergency-schema";
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
  | "validatedCampaigns"
  | "pendingCampaigns"
  | "draftCampaigns"
  | "terminatedCampaigns"
  | "blockedCampaigns"
  | "aiPendingCampaigns"
  | "approvedByAiCampaigns"
  | "reviewRequiredCampaigns"
  | "aiRejectedCampaigns"
  | "aiFlaggedCampaigns"
  | "availableSupports"
  | "totalSupports"
  | "outOfServiceSupports"
  | "activeZones"
  | "totalClients"
  | "pendingClients"
  | "confirmedReservations"
  | "temporaryReservations"
  | "cancelledReservations"
  | "expiredReservations"
  | "totalViews"
  | "viewsToday"
  | "totalClicks"
  | "totalInteractions"
  | "emergencyViews"
  | "defaultViews"
  | "totalDiffusions"
  | "activeEmergencies"
  | "estimatedBudget"
  | "consumedBudget"
  | "estimatedCost"
  | "simulatedRevenue";

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
  /** Drill-down link. */
  href?: string;
}

export type OverviewGroupId =
  "campagnes" | "ia" | "reseau" | "reservations" | "diffusion" | "budgets";

export interface OverviewGroup {
  id: OverviewGroupId;
  title: string;
  description: string;
  items: OverviewItem[];
}

function n(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function item(
  key: OverviewKey,
  value: number,
  rest: Omit<OverviewItem, "key" | "value" | "dimmed">,
): OverviewItem {
  return { key, value, ...rest, dimmed: value === 0 };
}

// ---------------------------------------------------------------------------
// « À décider par TPUB »
// ---------------------------------------------------------------------------
export interface DecisionQueueSummary {
  total: number;
  approved: number;
  review: number;
  /** « 1 avis IA favorable · 1 revue manuelle » */
  breakdown: string;
}

function breakdownOf(approved: number, review: number): string {
  return `${approved} avis IA favorable${approved > 1 ? "s" : ""} · ${review} revue${review > 1 ? "s" : ""} manuelle${review > 1 ? "s" : ""}`;
}

/** From a campaign list (APPROVED_BY_AI + REVIEW_REQUIRED, same filter as the nav badge). */
export function summarizeDecisionQueue(
  campaigns: readonly Pick<CampaignResponse, "status">[],
): DecisionQueueSummary {
  const approved = campaigns.filter((c) => c.status === "APPROVED_BY_AI").length;
  const review = campaigns.filter((c) => c.status === "REVIEW_REQUIRED").length;
  return { total: approved + review, approved, review, breakdown: breakdownOf(approved, review) };
}

/** From the dashboard counters (v2): no campaign list needed. */
export function decisionQueueFromDashboard(d: DashboardResponse): DecisionQueueSummary {
  const approved = n(d.approvedByAiCampaigns);
  const review = n(d.reviewRequiredCampaigns);
  return { total: approved + review, approved, review, breakdown: breakdownOf(approved, review) };
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
export function buildOverviewGroups(d: DashboardResponse): OverviewGroup[] {
  const byStatus = d.supportsByStatus;
  const outOfService = n(byStatus?.MAINTENANCE) + n(byStatus?.HORS_LIGNE) + n(byStatus?.INACTIF);
  const moderation = routes.admin.moderation;
  return [
    {
      id: "campagnes",
      title: "Campagnes",
      description: "Toutes les campagnes de la plateforme, tous annonceurs confondus.",
      items: [
        item("totalCampaigns", n(d.totalCampaigns), {
          label: "Campagnes totales",
          format: "number",
          hint: `${n(d.draftCampaigns)} brouillon${n(d.draftCampaigns) > 1 ? "s" : ""} compris`,
          accent: "orange",
          source: "Nombre total de campagnes, quel que soit leur statut.",
          href: moderation({ onglet: "toutes" }),
        }),
        item("activeCampaigns", n(d.activeCampaigns), {
          label: "Campagnes actives",
          format: "number",
          hint: "En diffusion sur leur période",
          accent: "success",
          source: "Campagnes validées dont la période de diffusion est en cours.",
        }),
        item("validatedCampaigns", n(d.validatedCampaigns), {
          label: "Programmées",
          format: "number",
          hint: "Validées, diffusion à venir",
          accent: "blue",
          source: "Campagnes validées par un administrateur dont la période n'a pas commencé.",
        }),
        item("pendingCampaigns", n(d.pendingCampaigns), {
          label: "En attente",
          format: "number",
          hint: "Analyse IA ou décision TPUB",
          accent: "warning",
          source:
            "Campagnes soumises : analyse IA en cours, avis favorable ou revue manuelle en attente de décision.",
          href: moderation({ onglet: "a-traiter" }),
        }),
        item("terminatedCampaigns", n(d.terminatedCampaigns), {
          label: "Terminées",
          format: "number",
          hint: "Période achevée ou budget épuisé",
          accent: "neutral",
          source: "Campagnes arrivées au terme de leur période ou de leur budget.",
        }),
        item("blockedCampaigns", n(d.blockedCampaigns), {
          label: "Refusées par TPUB",
          format: "number",
          hint: "Bloquées par un administrateur",
          accent: "red",
          source: "Campagnes refusées ou dont la diffusion a été bloquée.",
        }),
      ],
    },
    {
      id: "ia",
      title: "Analyse IA",
      description: "Résultats de la filtration automatique, avant la décision humaine.",
      items: [
        item("aiPendingCampaigns", n(d.aiPendingCampaigns), {
          label: "En attente d'analyse IA",
          format: "number",
          hint: "Soumises, pas encore analysées",
          accent: "blue",
          source: "Campagnes au statut « analyse IA en cours ».",
          href: moderation({ onglet: "ia" }),
        }),
        item("approvedByAiCampaigns", n(d.approvedByAiCampaigns), {
          label: "Avis IA favorable",
          format: "number",
          hint: "À valider par TPUB",
          accent: "success",
          source: "Campagnes jugées conformes par l'IA, en attente de validation humaine.",
          href: moderation({ onglet: "a-traiter" }),
        }),
        item("reviewRequiredCampaigns", n(d.reviewRequiredCampaigns), {
          label: "Revue manuelle",
          format: "number",
          hint: "Signalées par l'IA",
          accent: "warning",
          source: "Campagnes pour lesquelles l'IA demande un examen humain.",
          href: moderation({ onglet: "revue" }),
        }),
        item("aiRejectedCampaigns", n(d.aiRejectedCampaigns), {
          label: "Refusées par l'IA",
          format: "number",
          hint: "Renvoyées à l'annonceur pour correction",
          accent: "red",
          source: "Campagnes rejetées par l'analyse IA, à corriger par l'annonceur.",
        }),
        item("aiFlaggedCampaigns", n(d.aiFlaggedCampaigns), {
          label: "Refusées ou signalées par l'IA",
          format: "number",
          hint: "Revue manuelle + refus IA",
          accent: "warning",
          source: "Campagnes dont le dernier avis IA est « revue manuelle » ou « à corriger ».",
        }),
      ],
    },
    {
      id: "reseau",
      title: "Réseau & annonceurs",
      description: "État technique déclaré des Porteurs, zones et comptes annonceurs.",
      items: [
        item("availableSupports", n(d.availableSupports), {
          label: "Porteurs disponibles",
          format: "number",
          hint: `Sur ${n(d.totalSupports)} Porteur${n(d.totalSupports) > 1 ? "s" : ""}`,
          accent: "blue",
          source:
            "Porteurs dont l'état technique est « Actif ». Il s'agit de l'état saisi, pas d'une supervision en temps réel.",
          href: routes.admin.network({ onglet: "ecrans" }),
        }),
        item("outOfServiceSupports", outOfService, {
          label: "Porteurs hors service",
          format: "number",
          hint: `${n(byStatus?.MAINTENANCE)} maintenance · ${n(byStatus?.HORS_LIGNE)} hors ligne · ${n(byStatus?.INACTIF)} inactif${n(byStatus?.INACTIF) > 1 ? "s" : ""}`,
          accent: outOfService > 0 ? "warning" : "neutral",
          source: "Porteurs en maintenance, hors ligne ou inactifs (état technique saisi).",
        }),
        item("activeZones", n(d.activeZones), {
          label: "Zones actives",
          format: "number",
          hint: `Sur ${n(d.totalZones)} zone${n(d.totalZones) > 1 ? "s" : ""}`,
          accent: "orange",
          source: "Zones géographiques ouvertes à la réservation.",
          href: routes.admin.network({ onglet: "zones" }),
        }),
        item("totalClients", n(d.totalClients), {
          label: "Annonceurs",
          format: "number",
          hint: `${n(d.pendingClients)} en attente de validation`,
          accent: "blue",
          source: "Comptes annonceurs inscrits sur la plateforme.",
          href: routes.admin.users(),
        }),
      ],
    },
    {
      id: "reservations",
      title: "Réservations",
      description: "Créneaux réservés sur les Porteurs.",
      items: [
        item("confirmedReservations", n(d.confirmedReservations), {
          label: "Réservations confirmées",
          format: "number",
          hint: "Confirmées à la validation des campagnes",
          accent: "success",
          source: "Créneaux passés au statut « Confirmée » lors de la validation d'une campagne.",
          href: routes.admin.reservations(),
        }),
        item("temporaryReservations", n(d.temporaryReservations), {
          label: "Réservations temporaires",
          format: "number",
          hint: "En attente de décision TPUB",
          accent: "warning",
          source: "Créneaux retenus par des campagnes pas encore validées.",
        }),
        item("cancelledReservations", n(d.cancelledReservations), {
          label: "Annulées",
          format: "number",
          hint: "Par l'annonceur ou TPUB",
          accent: "neutral",
          source: "Réservations annulées (refus, modification de zone, annulation manuelle).",
        }),
        item("expiredReservations", n(d.expiredReservations), {
          label: "Expirées",
          format: "number",
          hint: "Temporaires non confirmées à temps",
          accent: "neutral",
          source: "Réservations temporaires arrivées à expiration sans validation.",
        }),
      ],
    },
    {
      id: "diffusion",
      title: "Diffusion",
      description: "Activité enregistrée par les lecteurs d'écran (journal de diffusion).",
      items: [
        item("totalViews", n(d.totalViews), {
          label: "Affichages publicitaires",
          format: "number",
          hint: `${n(d.viewsToday)} aujourd'hui`,
          accent: "orange",
          source:
            "Lignes « publicité » du journal de diffusion : chaque passage d'une campagne sur un écran. Il ne s'agit pas d'une mesure d'audience.",
          href: routes.admin.journal({ onglet: "diffusions" }),
        }),
        item("totalClicks", n(d.totalClicks), {
          label: "Clics",
          format: "number",
          hint: `${n(d.totalInteractions)} interaction${n(d.totalInteractions) > 1 ? "s" : ""}`,
          accent: "blue",
          source: "Clics et interactions enregistrés sur les publicités affichées.",
        }),
        item("emergencyViews", n(d.emergencyViews), {
          label: "Passages de messages prioritaires",
          format: "number",
          hint: `${n(d.activeEmergencies)} message${n(d.activeEmergencies) > 1 ? "s" : ""} actif${n(d.activeEmergencies) > 1 ? "s" : ""}`,
          accent: "red",
          source: "Lignes « message prioritaire » du journal de diffusion.",
          href: routes.admin.emergencies(),
        }),
        item("totalDiffusions", n(d.totalDiffusions), {
          label: "Lignes du journal",
          format: "number",
          hint: `${n(d.defaultViews)} contenu${n(d.defaultViews) > 1 ? "s" : ""} par défaut`,
          accent: "neutral",
          source:
            "Chaque appel d'un lecteur ajoute une ligne : publicités, messages prioritaires et contenu par défaut.",
        }),
      ],
    },
    {
      id: "budgets",
      title: "Budgets & revenus simulés",
      description: "Montants déclarés, estimés et consommés. Aucun paiement réel n'est traité.",
      items: [
        item("estimatedBudget", n(d.estimatedBudget), {
          label: "Budget estimé",
          format: "tnd",
          hint: "Budgets des campagnes soumises",
          accent: "orange",
          source:
            "Somme des budgets saisis par les annonceurs pour les campagnes sorties du brouillon.",
        }),
        item("consumedBudget", n(d.consumedBudget), {
          label: "Budget consommé",
          format: "tnd",
          hint: "Débité à chaque affichage publicitaire",
          accent: "success",
          source: "Somme des coûts unitaires des affichages publicitaires déjà diffusés.",
        }),
        item("estimatedCost", n(d.estimatedCost), {
          label: "Coût estimé des réservations",
          format: "tnd",
          hint: "Temporaires et confirmées",
          accent: "blue",
          source:
            "Estimation indicative du coût des créneaux réservés (barème interne de simulation).",
        }),
        item("simulatedRevenue", n(d.simulatedRevenue), {
          label: "Revenus simulés",
          format: "tnd",
          hint: "Paiements simulés, aucun encaissement",
          accent: "neutral",
          source:
            "Total des paiements simulés enregistrés : ce n'est ni un chiffre d'affaires ni un montant facturé.",
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
  messages: readonly Pick<
    EmergencyResponse,
    "isActive" | "startDate" | "endDate" | "startTime" | "endTime" | "state"
  >[],
  now: Date = new Date(),
): WatchItem {
  const current = messages.filter((m) => emergencyStateOf(m, now) === "EN_COURS").length;
  const scheduled = messages.filter((m) => emergencyStateOf(m, now) === "PROGRAMME").length;
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

// ---------------------------------------------------------------------------
// Budgets (estimated vs consumed) and the live priority messages strip
// ---------------------------------------------------------------------------
export interface BudgetConsumption {
  estimated: number;
  consumed: number;
  /** consumed / estimated in 0..1, null without an estimated budget. */
  ratio: number | null;
  /** « 12 % du budget estimé consommé ». */
  label: string;
}

export function budgetConsumption(
  d: Pick<DashboardResponse, "estimatedBudget" | "consumedBudget">,
): BudgetConsumption {
  const estimated = n(d.estimatedBudget);
  const consumed = n(d.consumedBudget);
  if (estimated <= 0) {
    return {
      estimated,
      consumed,
      ratio: null,
      label: consumed > 0 ? "Budget consommé sans budget estimé" : "Aucun budget engagé",
    };
  }
  const ratio = Math.min(1, Math.max(0, consumed / estimated));
  const pct = new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 1 }).format(
    (consumed / estimated) * 100,
  );
  return { estimated, consumed, ratio, label: `${pct} % du budget estimé consommé` };
}

/** Messages that can still reach a screen (en cours first, then programmés), at most `limit`. */
export function liveEmergencies<T extends EmergencyResponse>(
  messages: readonly T[],
  now: Date = new Date(),
  limit = 3,
): T[] {
  const order = { EN_COURS: 0, PROGRAMME: 1 } as const;
  return messages
    .map((m) => ({ m, state: emergencyStateOf(m, now) }))
    .filter(
      (x): x is { m: T; state: "EN_COURS" | "PROGRAMME" } =>
        x.state === "EN_COURS" || x.state === "PROGRAMME",
    )
    .sort((a, b) => order[a.state] - order[b.state] || b.m.id - a.m.id)
    .slice(0, limit)
    .map((x) => x.m);
}
