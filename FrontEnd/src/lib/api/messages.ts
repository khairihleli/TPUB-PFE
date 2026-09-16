/**
 * Spring (English) → French message translation. Never surface raw English to users.
 * Business messages: docs/api-contract.md §4.
 */
import type { CampaignStatus } from "@/lib/api/types";
import { CAMPAIGN_STATUS, campaignStatusFor } from "@/lib/campaign-status";

export const UNREACHABLE_MESSAGE = "Le service TPUB est momentanément indisponible.";
export const SESSION_EXPIRED_MESSAGE = "Votre session a expiré. Reconnectez-vous pour continuer.";
export const SERVER_ERROR_MESSAGE =
  "Un problème est survenu de notre côté. Réessayez dans un instant.";

/** Exact business messages. */
const EXACT: Record<string, string> = {
  "Email already registered": "Un compte existe déjà avec cet e-mail.",
  "Annonceur role not found":
    "La création de compte est momentanément indisponible. Réessayez plus tard.",
  "User not found": "Compte introuvable.",
  "Current user not found": "Compte introuvable. Reconnectez-vous.",
  "Client profile not found for current user": "Aucun profil annonceur n'est associé à ce compte.",
  "Only draft campaigns can be submitted":
    "Seules les campagnes en brouillon peuvent être soumises.",
  "Campaign is not eligible for AI analysis":
    "Cette campagne ne peut pas être analysée dans son état actuel.",
  "Campaign must be AI-analyzed before admin decision":
    "La campagne doit être analysée par l'IA avant une décision TPUB.",
  "AI check required before admin decision":
    "La campagne doit être analysée par l'IA avant une décision TPUB.",
  "Support already reserved for the selected period":
    "Ce Porteur est déjà réservé sur la période choisie. Choisissez d'autres dates ou un autre Porteur.",
  "Invalid email or password": "E-mail ou mot de passe incorrect.",
  "Access denied": "Vous n'avez pas accès à cette action.",
  "An unexpected error occurred": SERVER_ERROR_MESSAGE,
  "Validation failed": "Certains champs sont invalides. Vérifiez le formulaire.",
  "Campaign rejected successfully": "Campagne refusée.",
  "Session expirée": SESSION_EXPIRED_MESSAGE,
};

interface PatternRule {
  test: RegExp;
  translate: (m: RegExpExecArray) => string;
}

const PATTERNS: PatternRule[] = [
  {
    test: /^Campaign cannot be modified in status: ([A-Z_]+)$/,
    translate: (m) => {
      const key = m[1] as CampaignStatus;
      // Backend messages reach advertisers first: use the annonceur vocabulary.
      const label = key in CAMPAIGN_STATUS ? campaignStatusFor(key, "annonceur").label : null;
      return label
        ? `Cette campagne ne peut plus être modifiée (statut : ${label}).`
        : "Cette campagne ne peut plus être modifiée dans son état actuel.";
    },
  },
  { test: /^Campaign not found: .+$/, translate: () => "Cette campagne est introuvable." },
  { test: /^Zone not found: .+$/, translate: () => "Cette zone est introuvable." },
  { test: /^Support not found: .+$/, translate: () => "Cet écran est introuvable." },
  {
    test: /^Emergency message not found: .+$/,
    translate: () => "Ce message prioritaire est introuvable.",
  },
  {
    test: /^No AI report found for campaign: .+$/,
    translate: () => "Aucune analyse pour cette campagne. Soumettez-la pour lancer l'analyse IA.",
  },
  {
    test: /^Invalid request body/,
    translate: () => "Requête invalide : vérifiez le format des dates et des heures.",
  },
  {
    // Also returned for FK violations (e.g. deleting a zone that still has screens).
    test: /^Invalid data/,
    translate: () =>
      "Données refusées : vérifiez les dates, les heures et la longueur des champs. Si vous supprimez un élément, il est peut-être encore utilisé ailleurs.",
  },
];

/** Bean Validation defaults (Hibernate Validator English). */
const FIELD_PATTERNS: PatternRule[] = [
  { test: /^must not be blank$/, translate: () => "Ce champ est requis." },
  { test: /^must not be null$/, translate: () => "Ce champ est requis." },
  { test: /^must not be empty$/, translate: () => "Ce champ est requis." },
  { test: /^must be a well-formed email address$/, translate: () => "Adresse e-mail invalide." },
  {
    test: /^size must be between (\d+) and (\d+)$/,
    translate: (m) => `Doit contenir entre ${m[1]} et ${m[2]} caractères.`,
  },
  {
    test: /^must be greater than or equal to (-?[\d.]+)$/,
    translate: (m) => `Doit être supérieur ou égal à ${m[1]}.`,
  },
  {
    test: /^must be greater than (-?[\d.]+)$/,
    translate: (m) => `Doit être supérieur à ${m[1]}.`,
  },
  {
    test: /^must be less than or equal to (-?[\d.]+)$/,
    translate: (m) => `Doit être inférieur ou égal à ${m[1]}.`,
  },
  { test: /^must be less than (-?[\d.]+)$/, translate: (m) => `Doit être inférieur à ${m[1]}.` },
  { test: /^must be a future date$/, translate: () => "La date doit être dans le futur." },
  {
    test: /^must be a date in the present or in the future$/,
    translate: () => "La date doit être aujourd'hui ou plus tard.",
  },
  { test: /^must be true$/, translate: () => "Ce champ doit être accepté." },
];

/** Default message per HTTP status family (never "Request failed (500)"). */
export function statusFallbackMessage(status: number): string {
  if (status === 502 || status === 503 || status === 504) return UNREACHABLE_MESSAGE;
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  if (status === 401) return SESSION_EXPIRED_MESSAGE;
  if (status === 403) return "Vous n'avez pas accès à cette ressource.";
  if (status === 404) return "Cet élément est introuvable.";
  if (status === 409) return "Cette action entre en conflit avec l'état actuel. Rechargez la page.";
  if (status === 429) return "Trop de tentatives. Patientez quelques instants puis réessayez.";
  return "La demande n'a pas pu aboutir. Vérifiez les informations saisies et réessayez.";
}

const FRENCH_HINT = /[àâçéèêëîïôûùüÿœ]|^(Le|La|Les|Votre|Vous|Ce|Cet|Cette|Aucun|Aucune|Une|Un) /i;

function looksFrench(message: string): boolean {
  return FRENCH_HINT.test(message);
}

/**
 * Translates a backend message to French. Unknown English messages fall back to the
 * status family message. Messages already in French (bridge / Next routes) pass through.
 */
export function translateMessage(message: string | null | undefined, status: number): string {
  const raw = (message ?? "").trim();
  if (!raw) return statusFallbackMessage(status);
  const exact = EXACT[raw];
  if (exact) return exact;
  for (const rule of PATTERNS) {
    const m = rule.test.exec(raw);
    if (m) return rule.translate(m);
  }
  if (raw.length <= 240 && !raw.startsWith("<") && looksFrench(raw)) return raw;
  return statusFallbackMessage(status);
}

/** Translates one Bean Validation field message. */
export function translateFieldMessage(message: string | null | undefined): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Valeur invalide.";
  for (const rule of FIELD_PATTERNS) {
    const m = rule.test.exec(raw);
    if (m) return rule.translate(m);
  }
  if (raw.length <= 240 && looksFrench(raw)) return raw;
  return "Valeur invalide.";
}

/** Translates Spring `errors: {field: message}`. */
export function translateFieldErrors(errors: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return out;
  for (const [field, msg] of Object.entries(errors as Record<string, unknown>)) {
    out[field] = translateFieldMessage(typeof msg === "string" ? msg : null);
  }
  return out;
}
