/**
 * Fonctionnement copy (brief §8.4) + the public status table, derived from
 * `@/lib/campaign-status` so labels never drift from what the espace annonceur shows.
 */
import type { CampaignStatus, ReservationStatus } from "@/lib/api/types";
import {
  CAMPAIGN_STATUS,
  type CampaignDisplayStatus,
  canSubmit,
  isAwaitingAdmin,
  isDeadEnd,
  type StatusMeta,
} from "@/lib/campaign-status";

export const FONCTIONNEMENT_HERO = {
  eyebrow: "Fonctionnement",
  title: "De la réservation",
  highlight: "à la preuve de diffusion.",
  lede: "Un seul parcours, des statuts clairs, et une trace à chaque étape.",
  primary: { label: "Créer mon compte", href: "/inscription" },
  secondary: { label: "Voir les statuts", href: "#statuts" },
} as const;

/** In-page anchors rendered under the hero. */
export const FONCTIONNEMENT_TOC = [
  { label: "Parcours", href: "#parcours" },
  { label: "Statuts", href: "#statuts" },
  { label: "Double contrôle", href: "#controle" },
  { label: "Prouvé ou estimé", href: "#mesure" },
  { label: "Intérêt général", href: "#interet-general" },
] as const;

export const JOURNEY_SECTION = {
  eyebrow: "Parcours détaillé",
  title: "Neuf étapes,",
  highlight: "une trace à chacune.",
  lede: "Du compte annonceur au journal de diffusion, chaque étape a un statut lisible et laisse un enregistrement consultable.",
} as const;

export type JourneyPhase = "acces" | "preparation" | "controle" | "diffusion";

export const JOURNEY_PHASES: Record<JourneyPhase, string> = {
  acces: "Accès",
  preparation: "Préparation",
  controle: "Contrôle",
  diffusion: "Diffusion et suivi",
};

export type JourneyIconKey =
  | "compte"
  | "exploration"
  | "campagne"
  | "creations"
  | "reservation"
  | "analyse"
  | "validation"
  | "diffusion"
  | "suivi";

export interface JourneyStep {
  key: JourneyIconKey;
  phase: JourneyPhase;
  title: string;
  text: string;
  /** Campaign statuses this step can produce (labels come from campaign-status.ts). */
  statuses?: readonly CampaignDisplayStatus[];
  /** Reservation statuses involved at this step. */
  reservations?: readonly ReservationStatus[];
  /** What is recorded at this step. */
  trace: string;
  /** Honest availability note (e.g. self-service upload not yet available). */
  note?: string;
}

export const JOURNEY_STEPS: readonly JourneyStep[] = [
  {
    key: "compte",
    phase: "acces",
    title: "Inscription",
    text: "Créez votre compte annonceur avec votre société et vos coordonnées. Votre dossier est examiné par TPUB : le réseau est réservé à des annonceurs vérifiés.",
    trace: "Compte annonceur, dossier en cours d'examen",
  },
  {
    key: "exploration",
    phase: "acces",
    title: "Exploration",
    text: "Consultez les zones actives et les emplacements de chaque zone.",
    trace: "Zones ouvertes et état technique des emplacements",
  },
  {
    key: "campagne",
    phase: "preparation",
    title: "Création de campagne",
    text: "Nom, objectif, budget en dinars, période et plage horaire quotidienne. La campagne démarre en brouillon.",
    statuses: ["BROUILLON"],
    trace: "Campagne enregistrée en brouillon",
  },
  {
    key: "creations",
    phase: "preparation",
    title: "Créations",
    text: "Images, vidéos ou bannières associées à la campagne.",
    statuses: ["BROUILLON"],
    trace: "Formats et durée précisés avec TPUB",
    note: "Import de créations en libre-service : bientôt disponible. En attendant, votre conseiller TPUB récupère vos fichiers.",
  },
  {
    key: "reservation",
    phase: "preparation",
    title: "Réservation",
    text: "Choisissez emplacement, dates et heures. La plateforme vérifie les conflits et bloque le créneau temporairement.",
    statuses: ["BROUILLON"],
    reservations: ["TEMPORAIRE"],
    trace: "Créneau bloqué, sans double réservation",
  },
  {
    key: "analyse",
    phase: "controle",
    title: "Soumission et analyse IA",
    text: "Conformité, risque et qualité notés sur 100, points relevés, recommandation.",
    statuses: ["PENDING_AI_CHECK", "APPROVED_BY_AI", "REVIEW_REQUIRED", "REJECTED_BY_AI"],
    trace: "Rapport IA : scores, points relevés, recommandation",
  },
  {
    key: "validation",
    phase: "controle",
    title: "Validation TPUB",
    text: "Un expert valide (campagne en diffusion, créneaux confirmés) ou refuse (créneaux annulés), avec un motif enregistré.",
    // Validation sets ACTIVE directly (« Programmée » until the start date); VALIDATED_BY_ADMIN is never set.
    statuses: ["SCHEDULED", "ACTIVE", "BLOCKED"],
    reservations: ["CONFIRMEE", "ANNULEE"],
    trace: "Décision motivée et enregistrée",
  },
  {
    key: "diffusion",
    phase: "diffusion",
    title: "Diffusion",
    text: "Sur ses créneaux, selon sa priorité, sauf message d'intérêt général en cours dans la zone.",
    statuses: ["ACTIVE"],
    trace: "Chaque passage horodaté, par écran et par zone",
  },
  {
    key: "suivi",
    phase: "diffusion",
    title: "Suivi",
    text: "Journal de diffusion et statistiques dans votre espace.",
    statuses: ["TERMINATED"],
    trace: "Journal de diffusion et statistiques de campagne",
  },
];

// ---------------------------------------------------------------------------
// Status table
// ---------------------------------------------------------------------------

export const STATUS_SECTION = {
  eyebrow: "Statuts de campagne",
  title: "Des statuts clairs,",
  highlight: "à chaque étape.",
  lede: "Ces libellés sont ceux affichés dans votre espace annonceur. Chacun dit où en est votre campagne et ce que vous pouvez faire.",
} as const;

/**
 * Public order of the status table — only labels an advertiser can actually see.
 * ENDED is omitted: same label as TERMINATED (« Terminée »). VALIDATED_BY_ADMIN is omitted:
 * the backend never sets it (validation moves a campaign straight to ACTIVE, shown as
 * « Programmée » or « En diffusion »), so a « Validée » row would describe a screen nobody sees.
 */
export const STATUS_TABLE_ORDER: readonly CampaignDisplayStatus[] = [
  "BROUILLON",
  "PENDING_AI_CHECK",
  "APPROVED_BY_AI",
  "REVIEW_REQUIRED",
  "REJECTED_BY_AI",
  "SCHEDULED",
  "ACTIVE",
  "TERMINATED",
  "BLOCKED",
];

/** What the advertiser can do in their space for a given status (mirrors campaign-status rules). */
export function statusNextAction(status: CampaignDisplayStatus): string {
  if (status === "SCHEDULED") return "Attendre la date de début";
  if (status === "ENDED") return "Consulter le journal et les statistiques";
  const s: CampaignStatus = status;
  if (canSubmit(s)) return "Modifier, réserver, soumettre";
  if (isDeadEnd(s)) return "Dupliquer la campagne et la corriger";
  if (isAwaitingAdmin(s)) return "Attendre la décision d'un expert TPUB";
  switch (s) {
    case "PENDING_AI_CHECK":
      return "Patienter pendant l'analyse";
    case "VALIDATED_BY_ADMIN":
    case "ACTIVE":
      return "Suivre les diffusions";
    case "TERMINATED":
      return "Consulter le journal et les statistiques";
    case "BLOCKED":
      return "Consulter le motif du refus";
    default:
      return "Consulter la campagne";
  }
}

export interface StatusRow extends StatusMeta {
  key: CampaignDisplayStatus;
  action: string;
}

export function buildStatusRows(
  order: readonly CampaignDisplayStatus[] = STATUS_TABLE_ORDER,
): StatusRow[] {
  return order.map((key) => ({ key, ...CAMPAIGN_STATUS[key], action: statusNextAction(key) }));
}

// ---------------------------------------------------------------------------
// Double control
// ---------------------------------------------------------------------------

export const CONTROL_SECTION = {
  eyebrow: "Double contrôle",
  title: "L'IA assiste,",
  highlight: "une personne décide.",
  lede: "Les écrans sont dans l'espace public. Chaque campagne est analysée par IA avant diffusion, puis validée ou refusée par un expert TPUB, avec une décision motivée et enregistrée.",
  caveat:
    "L'analyse IA ne garantit pas l'absence de tout contenu problématique : c'est précisément pourquoi aucune campagne n'est diffusée sans validation humaine.",
} as const;

export const CONTENT_CHARTER = [
  {
    key: "refuses",
    title: "Refusés",
    items: [
      "Contenus trompeurs ou mensongers",
      "Contenus offensants",
      "Contenus discriminatoires",
      "Contenus illégaux",
    ],
  },
  {
    key: "signales",
    title: "Signalés",
    items: ["Qualité rédactionnelle insuffisante", "Incohérence entre budget et objectif"],
  },
  {
    key: "toujours",
    title: "Toujours",
    items: ["Validation humaine avant diffusion", "Décision motivée et enregistrée"],
  },
] as const;

export type CharterKey = (typeof CONTENT_CHARTER)[number]["key"];

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

export const MEASURE_SECTION = {
  eyebrow: "Mesure",
  title: "Ce que la plateforme prouve,",
  highlight: "ce qu'elle estime.",
  lede: "Un journal de diffusion prouve qu'un écran a joué votre contenu, pas qu'une personne l'a regardé. TPUB distingue donc les preuves de diffusion des indicateurs d'audience, présentés avec leur méthode et comme estimations.",
  asideTitle: "Dans votre espace",
  aside:
    "Les vues et coûts affichés avant diffusion sont des estimations indicatives, jamais une mesure d'audience. Les indicateurs d'audience, lorsqu'ils existent, sont anonymes, agrégés et présentés avec leur méthode.",
} as const;

// ---------------------------------------------------------------------------
// Public-interest priority
// ---------------------------------------------------------------------------

export const PRIORITY_SECTION = {
  eyebrow: "Intérêt général",
  title: "Quand l'intérêt général",
  highlight: "passe avant la publicité.",
  text: "Le moteur de diffusion vérifie d'abord la présence d'un message prioritaire dans la zone. Si un message est actif, il remplace temporairement la programmation publicitaire des écrans concernés. La diffusion normale reprend à la fin du message. Ces messages sont gérés exclusivement par l'équipe TPUB.",
  points: [
    "Créés et gérés exclusivement par l'équipe TPUB, jamais en libre-service",
    "Limités aux écrans de la zone concernée",
    "Reprise de la programmation normale à la fin du message",
  ],
  cta: { label: "Institution : nous contacter", href: "/contact" },
  schema: {
    inZone: "Écran dans la zone",
    outZone: "Écran hors zone",
    normal: "Programmation normale",
    normalShort: "Normale",
    priority: "Message prioritaire actif",
    priorityShort: "Prioritaire",
    resume: "Reprise",
    campaign: "Campagne",
    fallback: "Défaut",
    message: "Message prioritaire",
  },
} as const;

export const FONCTIONNEMENT_CTA = {
  title: "Préparez votre première campagne,",
  // U+2060 (word joiner) keeps « suivez-la » from breaking after the hyphen.
  highlight: "et suivez-⁠la jusqu'à la diffusion.",
  lede: "Créez votre compte annonceur : la campagne reste en brouillon tant que vous ne la soumettez pas.",
  primary: { label: "Créer mon compte annonceur", href: "/inscription" },
  secondary: { label: "Parler à TPUB", href: "/contact" },
} as const;
