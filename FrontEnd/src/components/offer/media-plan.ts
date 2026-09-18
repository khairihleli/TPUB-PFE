/**
 * « Construire mon plan média » (page Tarifs) — pure model.
 *
 * The builder never computes a price. It only turns the pricing criteria the visitor has
 * specified into a brief routed to `/contact?besoin=plan-media&…`. Query contract (read by
 * the contact page):
 * - `besoin`   always `plan-media`
 * - `profil`   one of PROFILE_OPTIONS values (single)
 * - `emplacements`, `ecrans`, `creneaux`, `saison`, `formats`  repeated keys (multi, slugs)
 * - `pression`, `duree`  single slugs
 * - `zones`    free text (« Zones visées »)
 * - `periode`  human-readable French summary (« Période envisagée »)
 * - `message`  human-readable French brief, ready to prefill the message textarea
 * Repeated keys match what a native GET form submission produces, so the no-JS fallback
 * sends the same slugs.
 */

export interface ChoiceOption {
  value: string;
  label: string;
}

export const PROFILE_OPTIONS = [
  { value: "commerce", label: "Commerce / PME" },
  { value: "marque", label: "Marque" },
  { value: "agence", label: "Agence média" },
  { value: "institution", label: "Institution" },
  { value: "autre", label: "Autre" },
] as const satisfies readonly ChoiceOption[];

export type MultiKey = "emplacements" | "ecrans" | "creneaux" | "saison" | "formats";
export type SingleKey = "profil" | "pression" | "duree";

export interface MediaPlanSelection {
  profil: string;
  emplacements: string[];
  zones: string;
  ecrans: string[];
  pression: string;
  creneaux: string[];
  duree: string;
  saison: string[];
  formats: string[];
}

export const EMPTY_SELECTION: MediaPlanSelection = {
  profil: "",
  emplacements: [],
  zones: "",
  ecrans: [],
  pression: "",
  creneaux: [],
  duree: "",
  saison: [],
  formats: [],
};

export type FieldSpec =
  | { kind: "multi"; key: MultiKey; legend: string; options: readonly ChoiceOption[] }
  | { kind: "single"; key: SingleKey; legend: string; options: readonly ChoiceOption[] }
  | { kind: "text"; key: "zones"; legend: string; placeholder: string; hint: string };

export interface BuilderCriterion {
  /** Matches the criteria card number on the page. */
  number: string;
  id: string;
  title: string;
  fields: readonly FieldSpec[];
}

export const BUILDER_CRITERIA: readonly BuilderCriterion[] = [
  {
    number: "01",
    id: "emplacement",
    title: "Emplacement et zone",
    fields: [
      {
        kind: "multi",
        key: "emplacements",
        legend: "Types d'emplacement",
        options: [
          { value: "grand-axe", label: "Grand axe" },
          { value: "centre-commercial", label: "Entrée de centre commercial" },
          { value: "zone-attente", label: "Zone d'attente" },
          { value: "rue-quartier", label: "Rue de quartier" },
        ],
      },
      {
        kind: "text",
        key: "zones",
        legend: "Zones visées",
        placeholder: "Quartier, ville, axe…",
        hint: "Facultatif. Indiquez les lieux où se trouvent vos clients.",
      },
    ],
  },
  {
    number: "02",
    id: "format",
    title: "Format et visibilité",
    fields: [
      {
        kind: "multi",
        key: "ecrans",
        legend: "Types d'écran",
        options: [
          { value: "panoramique", label: "Panoramique 360°" },
          { value: "double-face", label: "Double face" },
          { value: "hauteur-yeux", label: "Hauteur des yeux" },
          { value: "a-conseiller", label: "À conseiller par ZELQANE" },
        ],
      },
    ],
  },
  {
    number: "03",
    id: "pression",
    title: "Pression",
    fields: [
      {
        kind: "single",
        key: "pression",
        legend: "Présence souhaitée dans la boucle",
        options: [
          { value: "ponctuelle", label: "Ponctuelle" },
          { value: "reguliere", label: "Régulière" },
          { value: "temps-fort", label: "Temps fort" },
          { value: "a-conseiller", label: "À conseiller par ZELQANE" },
        ],
      },
    ],
  },
  {
    number: "04",
    id: "creneaux",
    title: "Créneaux et période",
    fields: [
      {
        kind: "multi",
        key: "creneaux",
        legend: "Plages horaires",
        options: [
          { value: "matin", label: "Matin" },
          { value: "mi-journee", label: "Mi-journée" },
          { value: "sortie-bureaux", label: "Sortie des bureaux" },
          { value: "soiree", label: "Soirée" },
        ],
      },
      {
        kind: "single",
        key: "duree",
        legend: "Durée de campagne",
        options: [
          { value: "jours", label: "Quelques jours" },
          { value: "semaines", label: "Quelques semaines" },
          { value: "mois", label: "Plusieurs mois" },
        ],
      },
    ],
  },
  {
    number: "05",
    id: "saison",
    title: "Saison",
    fields: [
      {
        kind: "multi",
        key: "saison",
        legend: "Temps forts",
        options: [
          { value: "rentree", label: "Rentrée" },
          { value: "fetes", label: "Fêtes de fin d'année" },
          { value: "ramadan", label: "Ramadan" },
          { value: "lancement", label: "Lancement ou événement" },
          { value: "hors-saison", label: "Pas de saison particulière" },
        ],
      },
    ],
  },
  {
    number: "06",
    id: "creation",
    title: "Format de création",
    fields: [
      {
        kind: "multi",
        key: "formats",
        legend: "Formats",
        options: [
          { value: "image", label: "Image" },
          { value: "video", label: "Vidéo" },
          { value: "banniere", label: "Bannière" },
        ],
      },
    ],
  },
];

export const PROFILE_FIELD = {
  kind: "single",
  key: "profil",
  legend: "Vous êtes",
  options: PROFILE_OPTIONS,
} as const satisfies FieldSpec;

function optionsFor(key: MultiKey | SingleKey): readonly ChoiceOption[] {
  if (key === "profil") return PROFILE_OPTIONS;
  for (const c of BUILDER_CRITERIA) {
    for (const f of c.fields) {
      if (f.kind !== "text" && f.key === key) return f.options;
    }
  }
  return [];
}

/** Label of a known slug, or undefined for anything not in the option list. */
export function labelFor(key: MultiKey | SingleKey, value: string): string | undefined {
  return optionsFor(key).find((o) => o.value === value)?.label;
}

/** Keeps only known slugs, in option order, without duplicates. */
function cleanMulti(key: MultiKey, values: readonly string[]): string[] {
  return optionsFor(key)
    .map((o) => o.value)
    .filter((v) => values.includes(v));
}

function cleanSingle(key: SingleKey, value: string): string {
  return labelFor(key, value) ? value : "";
}

export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/** Labels selected for one builder criterion (text zones included). */
export function criterionLabels(criterion: BuilderCriterion, s: MediaPlanSelection): string[] {
  const out: string[] = [];
  for (const f of criterion.fields) {
    if (f.kind === "text") {
      const zones = s.zones.trim();
      if (zones) out.push(zones);
    } else if (f.kind === "multi") {
      for (const v of cleanMulti(f.key, s[f.key])) {
        const label = labelFor(f.key, v);
        if (label) out.push(label);
      }
    } else {
      const label = labelFor(f.key, s[f.key]);
      if (label) out.push(label);
    }
  }
  return out;
}

/** Number of the six pricing criteria with at least one answer. */
export function countSpecifiedCriteria(s: MediaPlanSelection): number {
  return BUILDER_CRITERIA.filter((c) => criterionLabels(c, s).length > 0).length;
}

/** « Période envisagée » summary: durée · saisons. */
export function buildPeriodSummary(s: MediaPlanSelection): string {
  const parts: string[] = [];
  const duree = labelFor("duree", s.duree);
  if (duree) parts.push(duree);
  for (const v of cleanMulti("saison", s.saison)) {
    const label = labelFor("saison", v);
    if (label) parts.push(label);
  }
  return parts.join(" · ");
}

/** Human-readable French brief for the contact message. */
export function buildMediaPlanMessage(s: MediaPlanSelection): string {
  const lines = ["Demande de plan média préparée depuis la page Tarifs."];
  const profil = labelFor("profil", s.profil);
  if (profil) lines.push(`Profil : ${profil}`);
  for (const c of BUILDER_CRITERIA) {
    const labels = criterionLabels(c, s);
    if (labels.length > 0) lines.push(`${c.title} : ${labels.join(", ")}`);
  }
  return lines.join("\n");
}

/** `/contact?besoin=plan-media&…` — see the query contract at the top of this file. */
export function buildMediaPlanHref(s: MediaPlanSelection): string {
  const params = new URLSearchParams();
  params.set("besoin", "plan-media");

  const profil = cleanSingle("profil", s.profil);
  if (profil) params.set("profil", profil);

  const multi: MultiKey[] = ["emplacements", "ecrans", "creneaux", "saison", "formats"];
  const single: SingleKey[] = ["pression", "duree"];
  for (const key of multi) {
    for (const v of cleanMulti(key, s[key])) params.append(key, v);
  }
  for (const key of single) {
    const v = cleanSingle(key, s[key]);
    if (v) params.set(key, v);
  }

  const zones = s.zones.trim().slice(0, 200);
  if (zones) params.set("zones", zones);

  const periode = buildPeriodSummary(s);
  if (periode) params.set("periode", periode);

  if (profil || countSpecifiedCriteria(s) > 0) params.set("message", buildMediaPlanMessage(s));

  return `/contact?${params.toString()}`;
}
