import {
  CalendarRange,
  Clock3,
  Gauge,
  ImagePlay,
  type LucideIcon,
  MapPinned,
  ScanEye,
} from "lucide-react";

/** /tarifs copy — brief §8.5. No amounts, ever. */

export interface PriceCriterion {
  /** Matches BUILDER_CRITERIA ids (anchor `#brief-<id>`). */
  id: string;
  number: string;
  title: string;
  text: string;
  factors: readonly string[];
  icon: LucideIcon;
  /** Stated in the brief as the heaviest criterion. */
  weighs?: string;
}

export const PRICE_CRITERIA: readonly PriceCriterion[] = [
  {
    id: "emplacement",
    number: "01",
    title: "Emplacement et zone",
    text: "Où se trouve l'écran, et quel flux de personnes passe devant lui : grand axe, entrée de centre commercial, zone d'attente ou rue de quartier.",
    factors: ["Grand axe", "Entrée de centre commercial", "Zone d'attente", "Rue de quartier"],
    icon: MapPinned,
    weighs: "Le critère qui pèse le plus",
  },
  {
    id: "format",
    number: "02",
    title: "Format et visibilité",
    text: "Deux écrans de même taille ne se valent pas : la façon dont ils sont vus compte.",
    factors: [
      "Type d'écran",
      "Taille",
      "Hauteur",
      "Orientation",
      "Luminosité",
      "Score de visibilité",
    ],
    icon: ScanEye,
  },
  {
    id: "pression",
    number: "03",
    title: "Pression",
    text: "La place de votre message dans la boucle de diffusion.",
    factors: ["Durée du spot", "Fréquence de passage"],
    icon: Gauge,
  },
  {
    id: "creneaux",
    number: "04",
    title: "Créneaux et période",
    text: "Les heures où vous voulez être vu, et combien de temps.",
    factors: ["Plages horaires quotidiennes", "Nombre de jours ou de semaines"],
    icon: Clock3,
  },
  {
    id: "saison",
    number: "05",
    title: "Saison",
    text: "Les temps forts de l'année peuvent peser sur la disponibilité des créneaux et sur le prix.",
    factors: ["Rentrée", "Fêtes de fin d'année", "Ramadan"],
    icon: CalendarRange,
  },
  {
    id: "creation",
    number: "06",
    title: "Format de création",
    text: "Le type de contenu que vous diffusez.",
    factors: ["Image", "Vidéo", "Bannière"],
    icon: ImagePlay,
  },
];

export const COMPARE_POINTS: readonly { title: string; text: string }[] = [
  {
    title: "La composition de la boucle",
    text: "Combien d'annonceurs partagent l'écran, et pour quelle durée totale.",
  },
  {
    title: "Le journal de diffusion spot par spot",
    text: "La trace de chaque passage, écran par écran, et non un plan média seul.",
  },
  {
    title: "La nature de l'audience annoncée",
    text: "Mesurée ou déclarée, par créneau ou en moyenne.",
  },
];
