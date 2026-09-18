/** Site constants — the ONLY place these values live (SPEC §3.2). */

export const SITE = {
  name: "ZELQANE",
  tagline: "Des écrans réels. Des diffusions tracées.",
  subline: "Affichage numérique extérieur",
  description:
    "ZELQANE est la plateforme d'affichage numérique extérieur conçue pour le réseau des Porteurs du groupe Tukhnanutha : réservation par zone et par créneau, contenus contrôlés avant diffusion, diffusions journalisées.",
  pitch:
    "Affichage numérique extérieur sur le réseau des Porteurs : réservation par zone, contenus contrôlés, diffusions journalisées.",
  locale: "fr_TN",
  defaultOgImage: "/images/hero-city.jpg",
  /** Base URL for metadata; override with SITE_URL. */
  fallbackUrl: "http://localhost:3000",
} as const;

export const CONTACT = {
  email: "zelqane@tukhnanutha.com",
  phone: "+216 29 577 197",
  phoneHref: "tel:+21629577197",
  city: "Tunis",
  country: "Tunisie",
  address: "Tunis, Tunisie",
  hours: "Du lundi au vendredi, 9 h – 18 h",
} as const;

export const SOCIAL = {
  linkedin: "https://www.linkedin.com/company/tukhnanutha",
  youtube: "https://www.youtube.com/@tukhnanutha",
} as const;

export const GROUP = {
  name: "Tukhnanutha",
  url: "https://www.tukhnanutha.com",
  zelqanePage: "https://www.tukhnanutha.com/company/zelqane",
  porteurPage: "https://www.tukhnanutha.com/porteur",
  mention: "Une société du groupe Tukhnanutha",
  pole: "ZELQANE fait partie du pôle Médias, audience & données du groupe, aux côtés d'AFRIVA et d'INFINTRA.",
} as const;

/** Discreet maturity banner (brief §8.0). */
export const STATUS_NOTICE =
  "ZELQANE est en phase de conception. Les emplacements, fonctionnalités et parcours présentés décrivent la plateforme telle qu'elle est conçue.";

export const LEGAL_REVIEW_NOTICE = "Document en cours de validation juridique";

export function siteUrl(): string {
  const raw = (process.env.SITE_URL ?? "").trim();
  return (raw || SITE.fallbackUrl).replace(/\/+$/, "");
}

export function copyrightLine(year: number = new Date().getFullYear()): string {
  return `© ${year} ZELQANE, une société du groupe Tukhnanutha. Tous droits réservés.`;
}
