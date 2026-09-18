/**
 * Home page copy — brief §8.1 (French). Kept as plain data so the guardrail test can scan it.
 * Maturity wording: « est conçu pour », « vise à », « la plateforme permet ». No figures.
 */

export interface HomeLink {
  label: string;
  href: string;
}

export const HERO = {
  /**
   * Brief §8.1 pairs « Affichage numérique extérieur » with the group line; the header logo
   * already carries « Affichage numérique extérieur » right above, and the pair wrapped the
   * hero pill onto 2–3 lines. The group line is the part that adds information.
   */
  eyebrow: "Une société du groupe Tukhnanutha",
  title: "Des écrans réels.",
  highlight: "Des diffusions tracées.",
  lede: "ZELQANE est la plateforme d'affichage numérique conçue pour le réseau des Porteurs. Choisissez vos zones et vos créneaux, soumettez votre campagne : chaque contenu est contrôlé avant diffusion et chaque passage est journalisé, écran par écran.",
  primary: { label: "Créer mon compte annonceur", href: "/inscription" },
  secondary: { label: "Parler à ZELQANE", href: "/contact" },
  tertiary: { label: "Voir comment ça marche", href: "#etapes" },
  note: ["Dossier examiné par ZELQANE", "Budget en dinars", "Zones et créneaux au choix"],
} as const;

export const MECHANISMS = [
  { label: "Par zone", detail: "Du quartier à la ville" },
  { label: "Par créneau", detail: "Les heures qui comptent pour vous" },
  { label: "Double contrôle", detail: "Analyse IA + validation humaine" },
  { label: "Journalisé", detail: "Chaque diffusion horodatée" },
] as const;

export const INTRO = {
  eyebrow: "Une présence, avec des preuves",
  title: "L'audience se mesure,",
  highlight: "elle ne se déclare pas.",
  body: "Longtemps, l'affichage s'est vendu sur des estimations : un emplacement, un plan média, une audience moyenne. ZELQANE est conçu autrement. Diffusion, gestion de campagne et suivi forment un seul système, et votre rapport découle directement de ce qui a été diffusé.",
  link: { label: "Découvrir le fonctionnement", href: "/fonctionnement" },
} as const;

/** One simulated diffusion log line, split into what it proves (labelled « Illustration »). */
export const LOG_ANATOMY = [
  { value: "14:02:10", label: "À quelle heure" },
  { value: "Écran A-12", label: "Quel écran" },
  { value: "Tunis Centre", label: "Quelle zone" },
  { value: "10 s", label: "Combien de temps" },
  { value: "Campagne VERT", label: "Quelle campagne" },
] as const;

export const STEPS_SECTION = {
  eyebrow: "Comment ça marche",
  title: "De la zone au rapport,",
  highlight: "en quatre étapes",
  lede: "Un parcours unique, de la carte des zones jusqu'aux statistiques de votre campagne, avec un statut clair à chaque étape.",
  cta: { label: "Créer mon compte", href: "/inscription" },
} as const;

export const STEPS = [
  {
    title: "Choisissez vos zones.",
    description:
      "Parcourez la carte, sélectionnez les quartiers, villes ou axes où se trouvent vos clients, puis les emplacements disponibles.",
    marker: "Zones actives · emplacements",
  },
  {
    title: "Créez et réservez.",
    description:
      "Objectif, budget, période et heures de diffusion. Vos créneaux sont bloqués dès la réservation, sans double réservation.",
    marker: "Sans double réservation",
  },
  {
    title: "Contrôle avant diffusion.",
    description:
      "Votre campagne est analysée par IA (conformité, risque, qualité), puis validée par un expert ZELQANE. Vous recevez des recommandations concrètes.",
    marker: "Risque /100 · Qualité /100",
  },
  {
    title: "Diffusez et suivez.",
    description:
      "Une fois validée, votre campagne passe à l'antenne sur ses créneaux. Chaque diffusion est journalisée et vos statistiques sont réunies dans votre espace.",
    marker: "Diffusion horodatée",
  },
] as const;

export const PILLARS_SECTION = {
  eyebrow: "Les piliers",
  title: "Ce que ZELQANE change",
  highlight: "pour un annonceur",
  lede: "Une plateforme conçue sur le réseau des Porteurs : on y réserve des créneaux par zone, les contenus sont contrôlés avant diffusion, et chaque diffusion est journalisée.",
  link: { label: "Voir le parcours détaillé", href: "/fonctionnement#parcours" },
} as const;

export const PILLARS = [
  {
    key: "ciblage",
    title: "Ciblage précis.",
    body: "Zones géographiques, emplacements détaillés (type, position, score de visibilité) et plages horaires : matin, sortie des bureaux, soirée.",
    proof: "Carte des zones, calendrier de disponibilité sans double réservation.",
  },
  {
    key: "protection",
    title: "Espace public protégé.",
    body: "L'IA assiste, un expert ZELQANE valide. Annonceurs vérifiés, contenus analysés, décisions motivées et tracées.",
    proof: "Risque et qualité notés sur 100, puis validation humaine.",
  },
  {
    key: "preuve",
    title: "Diffusion prouvée.",
    body: "Chaque passage est horodaté, par écran, par zone et par campagne. Un écran hors ligne ne compte pas comme une diffusion.",
    proof: "Journal de diffusion et état technique de chaque écran.",
  },
  {
    key: "tableau",
    title: "Tout au même endroit.",
    body: "Réservations, statuts, rapport IA, diffusions et budget consommé dans un seul tableau de bord, avec un interlocuteur unique.",
    proof: "Statuts de campagne et budget estimé vs consommé.",
  },
] as const;

export type PillarKey = (typeof PILLARS)[number]["key"];

export const PERSONAS_SECTION = {
  eyebrow: "Cas d'usage",
  title: "Pensé pour",
  highlight: "chaque annonceur",
  lede: "Du commerce de quartier à l'agence média, chacun démarre par le parcours qui lui correspond.",
  link: { label: "Toutes les solutions annonceurs", href: "/annonceurs" },
} as const;

export const PERSONAS = [
  {
    key: "commerces",
    title: "Commerces et PME",
    body: "Soyez vu dans votre quartier, aux heures où vos clients passent, avec un budget en dinars suivi dans votre espace.",
    cta: { label: "Créer mon compte", href: "/inscription" },
    image: {
      src: "/images/storefront-screen.jpg",
      alt: "Écran lumineux derrière la vitrine d'une boutique aux menuiseries bleues, à la tombée de la nuit",
      position: "center 55%",
    },
    tag: "Quartier",
  },
  {
    key: "marques",
    title: "Marques",
    body: "Planifiez vos temps forts sur plusieurs zones et justifiez chaque dinar avec le journal de diffusion.",
    cta: { label: "Créer un compte", href: "/inscription" },
    image: {
      src: "/images/screen-street.jpg",
      alt: "Totem d'affichage numérique dans une rue piétonne animée, bordée d'immeubles à balcons",
      position: "center 45%",
    },
    tag: "Multi-zones",
  },
  {
    key: "agences",
    title: "Agences média",
    body: "Un partenaire DOOH qui sépare preuves de diffusion et estimations d'audience, et qui répond par un plan média.",
    cta: { label: "Demander un plan média", href: "/contact" },
    image: {
      src: "/images/team-planning.jpg",
      alt: "Équipe réunie de nuit devant un écran mural affichant une carte lumineuse",
      position: "center",
    },
    tag: "Plan média",
  },
  {
    key: "institutions",
    title: "Institutions",
    body: "Les messages d'intérêt général sont conçus pour passer en priorité, avant toute publicité, dans la zone concernée.",
    cta: { label: "Nous contacter", href: "/contact" },
    image: {
      src: "/images/screen-transport.jpg",
      alt: "Écrans d'information dans une station de tramway",
      position: "center",
    },
    tag: "Intérêt général",
  },
] as const;

export type PersonaKey = (typeof PERSONAS)[number]["key"];

export const NETWORK = {
  eyebrow: "Le réseau",
  title: "Chaque Porteur est conçu",
  highlight: "pour devenir un écran.",
  body: "ZELQANE est la fonction écran du Porteur, le support standardisé du groupe Tukhnanutha qui réunit connectivité, énergie autonome et supervision. Selon l'emplacement, l'écran s'adapte au regard : panoramique sur les ronds-points, double face sur les grands axes, à hauteur des yeux dans les rues piétonnes.",
  typologies: [
    { key: "panoramique", format: "360°", place: "Ronds-points et places" },
    { key: "double-face", format: "Double face", place: "Axes et autoroutes" },
    { key: "hauteur-yeux", format: "Hauteur des yeux", place: "Trottoirs et campus" },
  ],
  cta: { label: "Explorer le réseau & les zones", href: "/reseau" },
} as const;

export const MODERATION = {
  eyebrow: "Sécurité des contenus",
  title: "Un double contrôle",
  highlight: "avant chaque mise à l'antenne.",
  lede: "Les écrans sont dans l'espace public. Chaque campagne est donc analysée par IA avant diffusion, et aucune campagne n'est diffusée sans la validation d'un expert ZELQANE.",
  analysisIntro:
    "L'analyse produit un score de risque et un score de qualité sur 100, la liste des points relevés et une recommandation.",
  checks: [
    "Contenu trompeur (« gratuit garanti », fausses promesses)",
    "Contenu offensant, discriminatoire ou illégal",
    "Qualité rédactionnelle",
    "Cohérence entre budget et objectif",
  ],
  principles: [
    "L'IA assiste, une personne décide.",
    "Chaque décision est motivée et enregistrée.",
    "Annonceurs vérifiés avant diffusion.",
    "Recommandations pour corriger et resoumettre.",
  ],
  link: { label: "Voir notre charte des contenus", href: "/fonctionnement#controle" },
} as const;

export const MEASUREMENT = {
  eyebrow: "Mesure",
  title: "Ce qui est prouvé, ce qui est estimé :",
  highlight: "on ne mélange pas.",
  lede: "Un journal de diffusion prouve qu'un écran a joué votre contenu, pas qu'une personne l'a regardé. ZELQANE distingue donc les preuves de diffusion (quel écran, quelle zone, à quelle heure, combien de temps) des indicateurs d'audience, présentés avec leur méthode et comme estimations.",
  blocks: [
    {
      key: "disponibilite",
      title: "Disponibilité.",
      body: "L'état technique de chaque écran est suivi : actif, en maintenance, hors ligne.",
    },
    {
      key: "diffusions",
      title: "Diffusions.",
      body: "Horodatées par écran, zone et campagne.",
    },
    {
      key: "suivi",
      title: "Suivi de campagne.",
      body: "Diffusions, clics et interactions sur les canaux connectés, budget estimé et consommé.",
    },
  ],
  provenLabel: "Prouvé par la plateforme",
  estimated: {
    label: "Estimé, avec sa méthode",
    title: "Audience, exposition.",
  },
  note: "Les indicateurs d'audience, lorsqu'ils existent, sont anonymes, agrégés et toujours présentés avec leur méthode.",
  link: { label: "Voir l'échelle de confiance complète", href: "/fonctionnement#mesure" },
} as const;

export type MeasurementKey = (typeof MEASUREMENT.blocks)[number]["key"];

export const PORTEUR = {
  eyebrow: "Une société du groupe Tukhnanutha",
  title: "Un écran intégré",
  highlight: "à une infrastructure.",
  body: "Le Porteur est la cellule de déploiement standardisée du groupe. L'écran partage ainsi l'alimentation, la connexion et la supervision, et la mesure est pensée dès l'installation. Dans le modèle du groupe, les recettes publicitaires contribuent au déploiement de nouveaux supports.",
  mention: "Les caractéristiques du Porteur expriment une intention de conception.",
  banner: "Un écran conçu pour partager l'énergie, la connexion et la supervision.",
  functions: [
    { key: "connectivite", name: "AEROLINK", role: "Connectivité" },
    { key: "ecran", name: "ZELQANE", role: "Écran publicitaire" },
    { key: "meteo", name: "ANEO", role: "Météo" },
    { key: "energie", name: "SPH-AIR · AXGEN", role: "Énergie hybride solaire et éolienne" },
    { key: "supervision", name: "TPOT", role: "Supervision" },
    { key: "stockage", name: "TDC", role: "Stockage et contrôle" },
  ],
  cta: "Découvrir le Porteur",
} as const;

export type PorteurFunctionKey = (typeof PORTEUR.functions)[number]["key"];

export const FAQ_SECTION = {
  eyebrow: "Questions fréquentes",
  title: "Avant de vous lancer,",
  highlight: "l'essentiel.",
  lede: "Statut, prix, mesure, modération, ciblage : les réponses à connaître avant une première campagne.",
  more: { label: "Toutes les questions", href: "/faq" },
  contact: { label: "Écrire à ZELQANE", href: "/contact" },
} as const;

export const FAQ_ITEMS = [
  {
    question: "ZELQANE est-il déjà en service ?",
    answer:
      "ZELQANE est en phase de conception. Ce site présente la plateforme telle qu'elle est conçue : zones, réservation, contrôle des contenus, journal de diffusion. Vous pouvez dès maintenant créer un compte annonceur et préparer vos campagnes. La disponibilité des emplacements s'affiche dans votre espace.",
  },
  {
    question: "Qu'est-ce que j'achète exactement ?",
    answer:
      "Du temps de diffusion : des créneaux sur des emplacements, dans des zones, pour une période et des heures données. Un panneau vend une surface. Un écran vend du temps devant un flux de personnes.",
  },
  {
    question: "Comment le prix est-il établi ?",
    answer:
      "Selon l'emplacement, le format et la visibilité de l'écran, la pression (durée et fréquence dans la boucle), la période et la saison. Pour les agences et les marques, ZELQANE répond par un plan média plutôt que par une grille générique.",
  },
  {
    question: "Comment mes contenus sont-ils contrôlés ?",
    answer:
      "Par une analyse IA (conformité, risque et qualité notés sur 100, avec recommandations), puis par la validation d'un expert ZELQANE. Si la campagne doit être corrigée, vous la modifiez et la soumettez à nouveau.",
  },
  {
    question: "Puis-je cibler un quartier précis ?",
    answer:
      "Oui, la plateforme est conçue pour un ciblage par zone géographique et par plage horaire quotidienne. Une campagne peut viser plusieurs zones.",
  },
  {
    question: "Le journal de diffusion, est-ce une mesure d'audience ?",
    answer:
      "Non. Il prouve qu'un écran a diffusé votre contenu, à quel moment et pendant combien de temps. L'audience est une autre couche : quand elle est estimée, elle l'est de façon anonyme et agrégée, avec sa méthode, et ZELQANE ne l'assimile jamais à une diffusion.",
  },
  {
    question: "Que se passe-t-il si un message d'intérêt général doit être diffusé ?",
    answer:
      "Le moteur de diffusion est conçu pour faire passer un message prioritaire avant toute publicité dans la zone concernée, puis reprendre la programmation normale à la fin du message.",
  },
  {
    question: "Je suis une agence ou une marque nationale : par où commencer ?",
    answer:
      "Écrivez-nous. Nous partons de vos objectifs, de vos cibles et de vos zones pour construire un plan média, et nous précisons ce qui sera prouvé et ce qui sera estimé.",
  },
] as const;

export const FINAL_CTA = {
  title: "Mettez votre message dans la ville,",
  highlight: "et gardez-en la trace.",
  lede: "Créez votre compte annonceur, préparez votre première campagne et suivez chaque étape jusqu'à la diffusion.",
  primary: { label: "Créer mon compte annonceur", href: "/inscription" },
  secondary: { label: "Parler à ZELQANE", href: "/contact" },
} as const;
