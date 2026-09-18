/**
 * One vocabulary for /espace and /admin (UX-PLAN §3.6, IA-15). Documented in docs/zelqane-brief.md.
 * UI copy imports these strings instead of re-typing them. Never invent figures or promises.
 */
import type { ReservationStatus } from "@/lib/api/types";

export interface GlossaryTerm {
  term: string;
  meaning: string;
  use: string;
  /** Wordings that must not be used for this concept in the UI. */
  never: readonly string[];
}

export const GLOSSARY = {
  porteur: {
    term: "Porteur",
    meaning: "Mât physique qui porte les faces d'écran.",
    use: "Navigation, carte, listes, colonnes, actions (« Réserver ce Porteur »).",
    never: ["emplacement", "support"],
  },
  ecran: {
    term: "Écran",
    meaning: "Une face d'un Porteur (Studio 3D uniquement).",
    use: "Textes du Studio 3D.",
    never: ["synonyme de Porteur dans les listes"],
  },
  creneau: {
    term: "Créneau",
    meaning: "Réservation d'un Porteur pour la période de la campagne.",
    use: "Listes de réservations, KPI « Créneaux », textes de réservation.",
    never: ["écran réservé"],
  },
  budgetDeclare: {
    term: "Budget déclaré",
    meaning: "Somme des budgets saisis par l'annonceur pour ses campagnes.",
    use: "Tableau de bord, Statistiques, vue d'ensemble du back-office.",
    never: ["Budget total", "Budget estimé", "Budgets déclarés"],
  },
  coutEstime: {
    term: "Coût estimé des créneaux",
    meaning:
      "Somme des coûts estimés des créneaux : 10 % du budget de la campagne par créneau, fixés au moment de la réservation.",
    use: "Assistant, détail de campagne, Réservations, Statistiques, toujours avec l'étiquette d'estimation.",
    never: ["prix", "facture"],
  },
  vuesEstimees: {
    term: "Vues estimées",
    meaning: "Valeur fixe de 1 000 vues par créneau, non mesurée.",
    use: "Toujours avec l'étiquette d'estimation.",
    never: ["audience", "impressions"],
  },
  diffusionsJournalisees: {
    term: "Diffusions journalisées",
    meaning: "Lignes du journal du lecteur (passages à l'écran, pas une audience).",
    use: "Back-office uniquement, tant que le rapport par campagne n'est pas ouvert.",
    never: ["preuve (comme fonctionnalité livrée)"],
  },
} as const satisfies Record<string, GlossaryTerm>;

/** Short labels, used in pills and table cells. */
export const RESERVATION_LABEL: Record<ReservationStatus, string> = {
  TEMPORAIRE: "Bloqué",
  CONFIRMEE: "Confirmé",
  ANNULEE: "Libéré",
  EXPIREE: "Passé",
};

/** Long labels, used where there is room (detail, tooltips, filters on desktop). */
export const RESERVATION_LABEL_LONG: Record<ReservationStatus, string> = {
  TEMPORAIRE: "Bloqué · en attente de décision ZELQANE",
  CONFIRMEE: "Confirmé",
  ANNULEE: "Libéré",
  EXPIREE: "Passé",
};

export const RESERVATION_HINT: Record<ReservationStatus, string> = {
  TEMPORAIRE:
    "Le créneau est retenu pour cette campagne jusqu'à la décision de ZELQANE. Tant que la campagne est en brouillon, vous pouvez l'annuler.",
  CONFIRMEE: "Le créneau est confirmé pour la période de la campagne.",
  ANNULEE: "Le créneau a été libéré.",
  EXPIREE: "La période réservée est passée.",
};

/** Default rule shown by EstimateTag (UX-PLAN §3.6, api-contract §7.17). */
export const ESTIMATE_RULE =
  "Estimation calculée par ZELQANE, non issue d'une mesure : audience horaire du type de Porteur × visibilité × heures × jours, puis coût pour mille affichages.";
export const ESTIMATE_COST_RULE =
  "Estimation : affichages estimés × coût pour mille du type de Porteur. Rien n'est facturé.";
export const ESTIMATE_VIEWS_RULE =
  "Estimation : audience horaire du type de Porteur, visibilité, heures et jours du créneau ; pas une mesure.";
export const ESTIMATE_LABEL = "Estimation";

/**
 * Published support hours (same as CONTACT.hours on the profile page). Non-breaking spaces and
 * word joiners after the dashes keep « 9 h–18 h » and « lun–ven » on one line.
 */
export const SUPPORT_HOURS = "lun–⁠ven, 9 h–⁠18 h";
export const SUPPORT_HOURS_LONG = "Du lundi au vendredi, 9 h – 18 h";
/** Waiting-on-ZELQANE sentence (no duration promise, UX-PLAN §6.2). */
export const REVIEW_WAIT_SENTENCE = `Examen par l'équipe ZELQANE en jours ouvrés (${SUPPORT_HOURS}).`;

/** Consequence lines reused by booking surfaces. */
export const BOOKING_CONSEQUENCE =
  "Les Porteurs sont bloqués jusqu'à la décision de ZELQANE ; annulables tant que la campagne est en brouillon.";
export const SUBMIT_CONSEQUENCE = "Après envoi, la campagne n'est plus modifiable.";
