/**
 * À propos copy (brief §8.6). Plain data so the guardrail test can scan it.
 */

export const APROPOS_HERO = {
  eyebrow: "À propos",
  title: "Transformer une présence",
  highlight: "en portée vérifiable.",
  lede: "ZELQANE est la société d'affichage numérique extérieur du groupe Tukhnanutha. Elle est conçue pour exploiter la fonction écran des Porteurs : diffusion des contenus, gestion des campagnes et suivi de ce qui est réellement diffusé.",
  primary: { label: "Parler à ZELQANE", href: "/contact" },
  // Points to the ZELQANE page on the group site (the CTA band links to the group home).
  secondary: { label: "ZELQANE dans le groupe" },
} as const;

export const MISSION_SECTION = {
  eyebrow: "Mission",
  title: "Rendre l'affichage extérieur",
  highlight: "vérifiable.",
  statement:
    "ZELQANE est conçu pour que chaque annonceur choisisse où et quand il diffuse, et reçoive la trace de ce qui a été réellement diffusé.",
  // The principle itself is the quote beside this text: do not repeat it here.
  text: "L'affichage a toujours eu de la portée, rarement de la preuve. ZELQANE part d'un principe simple, qui déplace la charge de la preuve de l'acheteur vers l'opérateur.",
  quote: "L'audience se mesure, elle ne se déclare pas.",
  quoteSource: "Principe fondateur de ZELQANE",
  shiftTitle: "Le risque change de côté",
  shiftFrom: {
    label: "Portée annoncée",
    who: "L'acheteur",
    text: "contraint de croire à la portée annoncée.",
  },
  shiftTo: {
    label: "Portée démontrée",
    who: "L'opérateur",
    text: "tenu de la démontrer, diffusion par diffusion.",
  },
} as const;

export const PRINCIPLES_SECTION = {
  eyebrow: "Principes",
  title: "Quatre principes",
  highlight: "qui guident la conception.",
  imageAlt: "Écran numérique en vitrine d'un commerce de quartier, le soir",
  imageCaption: "Du commerce de quartier à la marque nationale.",
} as const;

export const PRINCIPLES = [
  {
    key: "physique",
    title: "L'attention est physique.",
    text: "La portée se joue dans l'espace réel, sur des écrans que les gens voient.",
  },
  {
    key: "tracable",
    title: "Traçable par défaut.",
    text: "Chaque diffusion est journalisée, chaque décision de modération est motivée.",
  },
  {
    key: "espace-public",
    title: "Un espace public respecté.",
    text: "Annonceurs vérifiés, contenus contrôlés, priorité à l'intérêt général.",
  },
  {
    key: "ouvert",
    title: "Ouvert à tous les annonceurs.",
    text: "Du commerce de quartier à la marque nationale, par zone et par budget.",
  },
] as const;

export type PrincipleKey = (typeof PRINCIPLES)[number]["key"];

export const GROUP_SECTION = {
  eyebrow: "Dans le groupe",
  title: "Le pôle Médias,",
  highlight: "audience & données.",
  text: "Au sein du groupe, ZELQANE appartient au pôle Médias, audience & données, avec AFRIVA et INFINTRA. La présence physique crée l'attention, ZELQANE la transforme en portée traçable, AFRIVA vise à en faire une communauté récurrente, et INFINTRA structure les données économiques utiles à la décision.",
  identity: "ZELQANE contracte avec ses clients sous sa propre identité.",
  chainLabel: "De la présence physique à la décision",
  zelqaneLink: "Voir ZELQANE sur le site du groupe",
  groupLink: "Découvrir le groupe",
} as const;

export const GROUP_CHAIN = [
  {
    key: "porteur",
    name: "Présence physique",
    role: "Le réseau des Porteurs crée l'attention",
    self: false,
  },
  { key: "zelqane", name: "ZELQANE", role: "Transforme l'attention en portée traçable", self: true },
  { key: "afriva", name: "AFRIVA", role: "Vise à en faire une communauté récurrente", self: false },
  {
    key: "infintra",
    name: "INFINTRA",
    role: "Structure les données économiques utiles à la décision",
    self: false,
  },
] as const;

export const STATUS_SECTION_APROPOS = {
  eyebrow: "Statut",
  badge: "Au stade de la conception",
  notice:
    "ZELQANE est au stade de la conception. Les fonctionnalités et typologies présentées sur ce site décrivent l'intention de conception de la plateforme.",
  nowTitle: "Dès maintenant",
  now: [
    "Créer un compte annonceur",
    "Préparer des campagnes en brouillon",
    "Demander un plan média à l'équipe ZELQANE",
  ],
  noClaimTitle: "Ce que ce site ne revendique pas",
  noClaim: [
    "Aucun nombre d'écrans ni de zones",
    "Aucune audience ni aucun résultat annoncé",
    "Aucun client, partenaire ou témoignage",
  ],
} as const;

export const TUNISIE_SECTION = {
  eyebrow: "Tunisie",
  statement: "Conçue en Tunisie, pensée en dinars, avec un interlocuteur tunisien.",
  text: "Les budgets de campagne s'expriment en dinars dans la plateforme, et l'équipe ZELQANE vous répond depuis Tunis.",
  imageAlt:
    "Écran d'affichage numérique au bord d'une route côtière tunisienne au coucher du soleil",
} as const;

export const APROPOS_CTA = {
  title: "Une question sur ZELQANE ?",
  highlight: "Parlons-en.",
  lede: "Objectifs, zones, calendrier ou simple curiosité : l'équipe ZELQANE vous répond.",
  primary: { label: "Parler à ZELQANE", href: "/contact" },
} as const;
