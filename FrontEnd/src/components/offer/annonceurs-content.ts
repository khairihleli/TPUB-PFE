import {
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  ChartLine,
  Crosshair,
  Landmark,
  type LucideIcon,
  MonitorPlay,
  Sparkles,
  Store,
} from "lucide-react";

import type { ImageRatio } from "@/components/marketing/image-frame";

/** /annonceurs copy — brief §4 (personas) + §8.2 (Solutions). */

export interface Capability {
  title: string;
  text: string;
  icon: LucideIcon;
}

export const CAPABILITIES: readonly Capability[] = [
  {
    title: "Cibler",
    text: "Sélectionnez vos zones sur la carte, du quartier à la ville, et choisissez vos emplacements selon leur type, leur position et leur score de visibilité.",
    icon: Crosshair,
  },
  {
    title: "Planifier",
    text: "Définissez objectif, budget en dinars, période et heures de diffusion : matin, sortie des bureaux, soirée.",
    icon: CalendarClock,
  },
  {
    title: "Réserver",
    text: "Vos créneaux sont bloqués dès la réservation et confirmés à la validation de la campagne. Pas de double réservation.",
    icon: CalendarCheck,
  },
  {
    title: "Diffuser",
    text: "La plateforme est conçue pour diffuser vos créations, images, vidéos ou bannières, telles qu'elles ont été validées.",
    icon: MonitorPlay,
  },
  {
    title: "Suivre",
    text: "Statuts de campagne, rapport IA, diffusions journalisées et budget consommé, au même endroit.",
    icon: ChartLine,
  },
];

export interface PersonaCta {
  label: string;
  href: string;
}

export interface Persona {
  /** Anchor id. */
  id: string;
  name: string;
  /** Short label for the jump strip. */
  short: string;
  examples: string;
  icon: LucideIcon;
  title: string;
  highlight: string;
  text: string;
  need: string;
  objections: readonly { objection: string; answer: string }[];
  primary: PersonaCta;
  secondary?: PersonaCta;
  note?: string;
  image: { src: string; alt: string; ratio: ImageRatio; position?: string };
}

export const PERSONAS: readonly Persona[] = [
  {
    id: "commerces",
    name: "Commerces & PME",
    short: "Commerces & PME",
    examples: "Boutique, restaurant, clinique, auto-école",
    icon: Store,
    title: "Visible dans votre quartier,",
    highlight: "sans engagement de grande marque.",
    text: "Choisissez une zone proche de votre point de vente et les heures où vos clients passent. Votre budget est suivi, vos diffusions sont tracées.",
    need: "Être vu dans votre quartier, aux heures où vos clients passent, avec un budget maîtrisé.",
    objections: [
      {
        objection: "L'affichage, c'est pour les grandes marques.",
        answer:
          "La plateforme est conçue pour réserver une zone et quelques créneaux, avec un budget en dinars que vous fixez et dont vous suivez la consommation.",
      },
      {
        objection: "Je ne saurai pas si ça a tourné.",
        answer:
          "Chaque diffusion est journalisée : écran, zone, heure et durée, consultables dans votre espace.",
      },
    ],
    primary: { label: "Créer mon compte", href: "/inscription" },
    secondary: { label: "Voir les critères de prix", href: "/tarifs" },
    image: {
      src: "/images/storefront-screen.jpg",
      alt: "Écran numérique dans la vitrine d'un commerce de quartier",
      ratio: "4/5",
    },
  },
  {
    id: "marques",
    name: "Marques",
    short: "Marques",
    examples: "Responsables marketing, directions de marque",
    icon: Sparkles,
    title: "Des temps forts planifiés,",
    highlight: "des dépenses justifiées.",
    text: "Plusieurs zones, plusieurs périodes, un seul tableau de bord. Rentrée, fêtes ou saisonnalité : vous pilotez la pression et gardez la trace de ce qui a tourné.",
    need: "Couvrir plusieurs zones, planifier des temps forts comme la rentrée, les fêtes ou Ramadan, protéger l'image de marque et justifier la dépense.",
    objections: [
      {
        objection: "Les chiffres de l'affichage extérieur sont déclaratifs.",
        answer:
          "Le rapport découle de l'exécution : diffusions journalisées d'un côté, estimations d'audience présentées comme telles de l'autre.",
      },
      {
        objection: "Et si mon visuel passe à côté d'un contenu douteux ?",
        answer:
          "Chaque contenu est analysé par IA puis validé par un expert TPUB avant diffusion. Les décisions sont motivées et tracées.",
      },
    ],
    primary: { label: "Créer un compte", href: "/inscription" },
    secondary: { label: "Parler à TPUB", href: "/contact?profil=marque#formulaire" },
    image: {
      src: "/images/screen-mall.jpg",
      alt: "Écrans numériques dans l'allée d'un centre commercial",
      ratio: "4/3",
    },
  },
  {
    id: "agences",
    name: "Agences média",
    short: "Agences média",
    examples: "Planning stratégique, achat média",
    icon: BriefcaseBusiness,
    title: "Achetez une architecture de mesure,",
    highlight: "pas un volume de contacts.",
    text: "TPUB distingue la disponibilité des écrans, les diffusions vérifiées et les estimations d'audience, et répond à vos briefs par un plan média.",
    need: "Un partenaire DOOH fiable pour plusieurs clients, avec des données exploitables dans un plan média.",
    objections: [
      {
        objection: "Quelle méthodologie ? Quels dénominateurs ?",
        answer:
          "Pour chaque indicateur, TPUB précise sa nature : observé (disponibilité, diffusion) ou estimé (audience), avec sa méthode.",
      },
      {
        objection: "Quels droits d'audit sur les données ?",
        answer:
          "Ces points se cadrent dans le plan média : ce qui sera prouvé, ce qui sera estimé, et sous quelle forme les données vous sont transmises.",
      },
    ],
    primary: {
      label: "Demander un plan média",
      href: "/contact?besoin=plan-media&profil=agence#formulaire",
    },
    secondary: { label: "Préparer mon brief", href: "/tarifs#plan-media" },
    image: {
      src: "/images/team-planning.jpg",
      alt: "Équipe d'agence préparant un plan média devant une carte murale",
      ratio: "3/2",
    },
  },
  {
    id: "institutions",
    name: "Institutions",
    short: "Institutions",
    examples: "Messages d'intérêt général",
    icon: Landmark,
    title: "Un réseau conçu",
    highlight: "pour l'intérêt général.",
    text: "Les messages d'intérêt général sont conçus pour être prioritaires sur la publicité dans la zone concernée. Parlons de votre besoin.",
    need: "Diffuser un message d'intérêt général dans une zone donnée.",
    objections: [
      {
        objection: "Un réseau publicitaire est-il approprié pour un message public ?",
        answer:
          "Le moteur de diffusion est conçu pour donner la priorité absolue aux messages d'intérêt général dans une zone, avant toute publicité, puis reprendre la programmation normale.",
      },
    ],
    primary: {
      label: "Nous contacter",
      href: "/contact?besoin=interet-general&profil=institution#formulaire",
    },
    note: "Les messages prioritaires sont créés par l'équipe TPUB, pas en libre-service.",
    image: {
      src: "/images/screen-transport.jpg",
      alt: "Écran d'information dans une station de tramway",
      ratio: "4/3",
    },
  },
];

export interface SigningQuestion {
  question: string;
  why: string;
}

export const SIGNING_QUESTIONS: readonly SigningQuestion[] = [
  {
    question: "Combien d'annonceurs dans la boucle, et quelle durée totale ?",
    why: "La part de temps d'écran consacrée à votre message en dépend.",
  },
  {
    question: "Le journal de diffusion est-il fourni spot par spot ?",
    why: "C'est la trace de ce qui a été diffusé, écran par écran.",
  },
  {
    question: "L'audience est-elle mesurée ou déclarée ? Par créneau ou en moyenne ?",
    why: "Une moyenne appliquée à toutes les campagnes ne dit rien de vos heures.",
  },
  {
    question: "L'écran est-il lisible en plein soleil ?",
    why: "Luminosité et orientation comptent autant que la taille.",
  },
  {
    question: "Qui détient l'autorisation d'exploitation de l'emplacement, et jusqu'à quand ?",
    why: "La continuité de votre campagne en dépend.",
  },
];
