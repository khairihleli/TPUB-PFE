/**
 * Contact form schema — shared by the client form (immediate feedback) and the
 * POST /api/contact route handler (authoritative validation). Copy: brief §8.7.
 */
import { z } from "zod";

export const REQUIRED_MESSAGE = "Ce champ est requis.";
export const EMAIL_MESSAGE = "Adresse e-mail invalide.";

/** Honeypot field name: hidden from people, tempting for bots. Must stay empty. */
export const HONEYPOT_FIELD = "site_web";

/** Maximum accepted request body (bytes) for POST /api/contact. */
export const CONTACT_MAX_BODY_BYTES = 20 * 1024;

export const PROFILE_OPTIONS = [
  { value: "commerce", label: "Commerce / PME" },
  { value: "marque", label: "Marque" },
  { value: "agence", label: "Agence média" },
  { value: "institution", label: "Institution" },
  { value: "proprietaire", label: "Propriétaire d'emplacement" },
  { value: "autre", label: "Autre" },
] as const;

export const NEED_OPTIONS = [
  { value: "campagne", label: "Campagne d'affichage" },
  { value: "plan-media", label: "Plan média" },
  { value: "interet-general", label: "Message d'intérêt général" },
  { value: "emplacement", label: "Équiper un emplacement" },
  { value: "autre", label: "Autre" },
] as const;

export type ContactProfile = (typeof PROFILE_OPTIONS)[number]["value"];
export type ContactNeed = (typeof NEED_OPTIONS)[number]["value"];

const PROFILE_VALUES = PROFILE_OPTIONS.map((o) => o.value) as [ContactProfile, ...ContactProfile[]];
const NEED_VALUES = NEED_OPTIONS.map((o) => o.value) as [ContactNeed, ...ContactNeed[]];

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 4000;

/** Loose phone check: digits, spaces and + ( ) . - only, 6 to 20 digits. */
const PHONE_RE = /^\+?[\d\s().-]+$/;

function tooLong(max: number): string {
  return `${max} caractères maximum.`;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: tooLong(max) });

export const contactSchema = z.object({
  nom: z
    .string({ error: REQUIRED_MESSAGE })
    .trim()
    .min(1, { error: REQUIRED_MESSAGE })
    .max(150, { error: tooLong(150) }),
  email: z
    .string({ error: REQUIRED_MESSAGE })
    .trim()
    .min(1, { error: REQUIRED_MESSAGE })
    .max(255, { error: tooLong(255) })
    .pipe(z.email({ error: EMAIL_MESSAGE })),
  telephone: optionalText(30).refine(
    (v) => v === "" || (PHONE_RE.test(v) && /^(\D*\d){6,20}\D*$/.test(v)),
    { error: "Numéro de téléphone invalide." },
  ),
  societe: optionalText(200),
  profil: z.enum(PROFILE_VALUES, { error: REQUIRED_MESSAGE }),
  besoin: z.enum(NEED_VALUES, { error: REQUIRED_MESSAGE }),
  zones: optionalText(300),
  periode: optionalText(200),
  message: z
    .string({ error: REQUIRED_MESSAGE })
    .trim()
    .min(1, { error: REQUIRED_MESSAGE })
    .min(MESSAGE_MIN, {
      error: `Précisez votre demande en quelques mots (${MESSAGE_MIN} caractères minimum).`,
    })
    .max(MESSAGE_MAX, { error: tooLong(MESSAGE_MAX) }),
  consentement: z.literal(true, {
    error: "Votre accord est nécessaire pour que nous puissions vous répondre.",
  }),
});

export type ContactInput = z.input<typeof contactSchema>;
export type ContactRequest = z.output<typeof contactSchema>;
export type ContactField = keyof ContactRequest;

/** Order used to focus the first invalid control. */
export const CONTACT_FIELD_ORDER: readonly ContactField[] = [
  "nom",
  "email",
  "telephone",
  "societe",
  "profil",
  "besoin",
  "zones",
  "periode",
  "message",
  "consentement",
];

export type ContactFieldErrors = Partial<Record<ContactField, string>>;

/** Flattens zod issues to one French message per field (first issue wins). */
export function contactFieldErrors(error: z.ZodError): ContactFieldErrors {
  const out: ContactFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string") continue;
    if (!(CONTACT_FIELD_ORDER as readonly string[]).includes(key)) continue;
    const field = key as ContactField;
    out[field] ??= issue.message;
  }
  return out;
}

export type ContactValidation =
  { ok: true; data: ContactRequest } | { ok: false; errors: ContactFieldErrors };

export function validateContact(input: unknown): ContactValidation {
  const parsed = contactSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, errors: contactFieldErrors(parsed.error) };
}

/** True when the honeypot was filled (the submission is silently dropped). */
export function isHoneypotFilled(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const v = (input as Record<string, unknown>)[HONEYPOT_FIELD];
  return typeof v === "string" ? v.trim().length > 0 : v !== undefined && v !== null && v !== "";
}

// ---------------------------------------------------------------------------
// Prefill from ?profil= & ?besoin= (links from other pages, e.g. « Demander un plan média »)
// ---------------------------------------------------------------------------
const PROFILE_ALIASES: Record<string, ContactProfile> = {
  commerce: "commerce",
  commercant: "commerce",
  pme: "commerce",
  "commerce-pme": "commerce",
  marque: "marque",
  marques: "marque",
  agence: "agence",
  agences: "agence",
  "agence-media": "agence",
  institution: "institution",
  institutions: "institution",
  proprietaire: "proprietaire",
  "proprietaire-emplacement": "proprietaire",
  emplacement: "proprietaire",
  autre: "autre",
};

const NEED_ALIASES: Record<string, ContactNeed> = {
  campagne: "campagne",
  affichage: "campagne",
  "campagne-affichage": "campagne",
  "plan-media": "plan-media",
  planmedia: "plan-media",
  plan: "plan-media",
  devis: "plan-media",
  "interet-general": "interet-general",
  "message-interet-general": "interet-general",
  emplacement: "emplacement",
  "equiper-emplacement": "emplacement",
  equiper: "emplacement",
  autre: "autre",
};

function normaliseSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function firstParam(v: string | string[] | undefined | null): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" ? v : null;
}

export interface ContactPrefill {
  profil: ContactProfile | "";
  besoin: ContactNeed | "";
}

/** Maps query params to known option values; unknown values are ignored. */
export function parseContactPrefill(params: {
  profil?: string | string[] | null;
  besoin?: string | string[] | null;
}): ContactPrefill {
  const p = firstParam(params.profil);
  const b = firstParam(params.besoin);
  const profil = p ? (PROFILE_ALIASES[normaliseSlug(p)] ?? "") : "";
  const besoin = b ? (NEED_ALIASES[normaliseSlug(b)] ?? "") : "";
  return { profil, besoin };
}

export function profileLabel(value: string): string | null {
  return PROFILE_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function needLabel(value: string): string | null {
  return NEED_OPTIONS.find((o) => o.value === value)?.label ?? null;
}
