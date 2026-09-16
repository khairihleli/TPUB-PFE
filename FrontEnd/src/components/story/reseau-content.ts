/**
 * Réseau & zones copy (brief §8.3). Plain data so the guardrail test can scan it.
 * Maturity wording only (« est conçu pour », « vise à »). No inventory figures.
 */

export interface StoryLink {
  label: string;
  href: string;
}

export const RESEAU_HERO = {
  eyebrow: "Réseau & zones",
  title: "Un réseau d'écrans",
  highlight: "conçu sur les Porteurs.",
  lede: "TPUB est conçu pour faire des écrans des Porteurs une seule surface média : des emplacements géolocalisés, regroupés en zones, programmés et supervisés depuis une même plateforme.",
  primary: { label: "Créer un compte pour explorer la carte", href: "/inscription" },
  secondary: { label: "Vous détenez des emplacements ? Parlons-en", href: "/contact" },
  note: "Typologies issues de la conception du Porteur · Visuels d'illustration",
} as const;

export const PORTEUR_SECTION = {
  eyebrow: "Le support",
  title: "Le Porteur porte l'écran,",
  highlight: "TPUB en fait un média.",
  body: "TPUB est la fonction écran du Porteur, le support standardisé du groupe Tukhnanutha qui réunit connectivité, énergie autonome et supervision. L'écran n'a donc pas à justifier seul sa structure et son alimentation : il partage ces coûts avec les autres fonctions du Porteur, ce qui élargit les lieux où il peut être viable.",
  shared: [
    { key: "energie", label: "Énergie", detail: "Alimentation autonome partagée" },
    { key: "connectivite", label: "Connectivité", detail: "Connexion intégrée au support" },
    { key: "supervision", label: "Supervision", detail: "Conçue pour remonter l'état de l'écran" },
  ],
  mention: "Les caractéristiques du Porteur expriment une intention de conception.",
} as const;

export type PorteurSharedKey = (typeof PORTEUR_SECTION.shared)[number]["key"];

/** « Du support au rapport » — the four layers. */
export const LAYERS = [
  {
    key: "ecrans",
    title: "Écrans",
    text: "Des écrans intégrés aux Porteurs, alimentés et connectés de façon autonome.",
  },
  {
    key: "diffusion",
    title: "Diffusion",
    text: "Un moteur conçu pour choisir en temps réel le contenu à diffuser sur chaque écran : message prioritaire d'abord, puis campagnes validées selon leur priorité, sinon contenu par défaut.",
  },
  {
    key: "campagnes",
    title: "Campagnes",
    text: "Réservation par zone, emplacement et créneau, avec validation avant mise à l'antenne.",
  },
  {
    key: "suivi",
    title: "Suivi",
    text: "Journal de diffusion, état technique des écrans, statistiques de campagne.",
  },
] as const;

export type LayerKey = (typeof LAYERS)[number]["key"];

export const TYPES_SECTION = {
  eyebrow: "Types d'emplacements",
  title: "Quatre situations,",
  highlight: "un écran adapté au regard.",
  lede: "Selon l'emplacement, l'écran s'adapte à la façon dont on le voit : panoramique sur les ronds-points, double face sur les grands axes, à hauteur des yeux dans les rues piétonnes.",
  mention:
    "Typologies et caractéristiques issues de la conception du Porteur. Elles expriment une intention de conception, pas des performances constatées.",
} as const;

export interface EmplacementType {
  letter: "A" | "B" | "C" | "D";
  name: string;
  screen: string;
  place: string;
  flow: string;
  /** Null for type D (no screen, no TPUB inventory). */
  image: { src: string; alt: string; position: string } | null;
}

export const EMPLACEMENT_TYPES: readonly EmplacementType[] = [
  {
    letter: "A",
    name: "Panoramique",
    screen: "360°",
    place: "Ronds-points, places emblématiques",
    flow: "Véhicules et piétons",
    image: {
      src: "/images/hero-city.jpg",
      alt: "Grand écran lumineux sur une façade blanche, au bord d'un boulevard animé la nuit",
      position: "64% center",
    },
  },
  {
    letter: "B",
    name: "Double face",
    screen: "Deux écrans verticaux, dans les deux sens",
    place: "Autoroutes, grands axes",
    flow: "Véhicules à vitesse élevée",
    image: {
      src: "/images/coastal-billboard.jpg",
      alt: "Écran d'affichage numérique en bordure d'une route côtière, voitures en mouvement au coucher du soleil",
      position: "66% center",
    },
  },
  {
    letter: "C",
    name: "Hauteur des yeux",
    screen: "Un écran à échelle humaine",
    place: "Trottoirs, rues piétonnes, campus",
    flow: "Piétons",
    image: {
      src: "/images/screen-street.jpg",
      alt: "Totem d'affichage numérique à hauteur des yeux dans une rue piétonne, passants en mouvement",
      position: "center 42%",
    },
  },
  {
    letter: "D",
    name: "Sans écran",
    screen: "—",
    place: "Sites ruraux, hors réseau",
    flow: "Pas d'inventaire TPUB",
    image: null,
  },
];

export const DIFFUSION_SECTION = {
  eyebrow: "Moteur de diffusion",
  title: "Trois types de contenus,",
  highlight: "un ordre de priorité clair.",
  lede: "À chaque passage, le moteur de diffusion est conçu pour choisir le contenu d'un écran en suivant toujours le même ordre.",
  footnote:
    "Quel que soit son type, chaque passage est conçu pour être journalisé : écran, zone, type de contenu, durée et horodatage.",
} as const;

export interface DiffusionKind {
  key: "urgence" | "publicite" | "defaut";
  name: string;
  rule: string;
  text: string;
  owner: string;
}

export const DIFFUSION_KINDS: readonly DiffusionKind[] = [
  {
    key: "urgence",
    name: "Message prioritaire",
    rule: "D'abord",
    text: "Un message d'intérêt général actif dans la zone de l'écran passe avant toute publicité, le temps de sa diffusion.",
    owner: "Géré exclusivement par l'équipe TPUB",
  },
  {
    key: "publicite",
    name: "Publicité",
    rule: "Ensuite",
    text: "Les campagnes validées dont le créneau confirmé couvre ce moment sont départagées selon leur priorité.",
    owner: "Campagnes des annonceurs, après double contrôle",
  },
  {
    key: "defaut",
    name: "Contenu par défaut",
    rule: "En dernier",
    text: "Si aucun message ni aucune campagne ne correspond, l'écran diffuse le contenu de marque TPUB.",
    owner: "Programmation TPUB",
  },
];

/** Fictional log lines (labelled « Illustration »). Durations follow the backend defaults. */
export const DIFFUSION_LOG_EXAMPLE = [
  { time: "07:59:50", screen: "Écran C-04", zone: "Zone Centre", duration: "10 s", kind: "defaut" },
  {
    time: "08:00:00",
    screen: "Écran C-04",
    zone: "Zone Centre",
    duration: "10 s",
    kind: "publicite",
    campaign: "Campagne VERT",
  },
  {
    time: "08:00:10",
    screen: "Écran C-04",
    zone: "Zone Centre",
    duration: "15 s",
    kind: "urgence",
  },
] as const;

export const ZONES_SECTION = {
  eyebrow: "Zones",
  title: "Ciblez par zone,",
  highlight: "du quartier à la ville.",
  body: "Chaque zone est définie sur la carte (centre, rayon ou contour). Une campagne peut viser plusieurs zones. Dans chaque zone, vous voyez les emplacements, leur type, leur position, leur score de visibilité et leur état : actif, en maintenance ou hors ligne.",
  definitions: [
    { key: "rayon", label: "Centre et rayon", detail: "Un point sur la carte et une distance" },
    { key: "contour", label: "Contour", detail: "Un périmètre tracé au plus près du terrain" },
  ],
  attributes: ["Type d'emplacement", "Position", "Score de visibilité", "État technique"],
  mapAlt:
    "Vue aérienne nocturne d'une ville côtière traversée de tracés lumineux orange et bleus figurant des zones de diffusion",
  mapCaption: "Zones figurées à titre d'illustration, sans emplacement réel.",
  spaceTitle: "Dans votre espace annonceur",
  spaceText:
    "La carte n'affiche que les zones réellement ouvertes, alimentée par la plateforme. Tant qu'aucune zone n'est ouverte, elle l'indique simplement :",
  emptyState: "La carte des zones s'affichera ici dès que les premières zones seront ouvertes.",
} as const;

export const VISIBILITY_SECTION = {
  title: "Pourquoi un score de visibilité ?",
  text: "Un grand écran mal orienté vaut moins qu'un écran moyen dans l'axe du regard. Le score de visibilité aide à comparer des emplacements au-delà de leur seule taille.",
  factorsLabel: "Au-delà de la taille",
  factors: ["Type d'écran", "Hauteur", "Orientation", "Luminosité"],
  wide: "Grand écran, parallèle au flux",
  aligned: "Écran moyen, dans l'axe du regard",
} as const;

export const CHANNELS_SECTION = {
  eyebrow: "Au-delà de l'écran",
  title: "Une plateforme pensée",
  highlight: "pour plusieurs canaux.",
  text: "La plateforme est conçue pour plusieurs types de supports : écrans, panneaux numériques, points Wi-Fi, application et site web. Sur les canaux connectés, elle peut aussi suivre les clics et les interactions.",
  interactiveNote: "Clics et interactions",
} as const;

export const RESEAU_CTA = {
  title: "Explorez les zones",
  highlight: "depuis votre espace.",
  lede: "Créez votre compte annonceur pour explorer la carte des zones ouvertes et leurs emplacements. Vous détenez des emplacements ? Parlons-en.",
  primary: { label: "Créer mon compte", href: "/inscription" },
  secondary: { label: "Proposer un emplacement", href: "/contact" },
} as const;
