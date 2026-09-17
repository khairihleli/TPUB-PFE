/**
 * Backend error → French message. The v2 backend sends a stable `code` and a French `message`
 * (docs/completion-contract.md §2): known codes are translated first (the backend message is
 * shown unless we impose the wording). Legacy English Spring messages (api-contract §4) keep
 * their table as a fallback. Never surface raw English to users.
 */
import type { CampaignStatus, SubmitIncompleteKey } from "@/lib/api/types";
import { CAMPAIGN_STATUS, campaignStatusFor } from "@/lib/campaign-status";

export const UNREACHABLE_MESSAGE = "Le service TPUB est momentanément indisponible.";
export const SESSION_EXPIRED_MESSAGE = "Votre session a expiré. Reconnectez-vous pour continuer.";
export const SERVER_ERROR_MESSAGE =
  "Un problème est survenu de notre côté. Réessayez dans un instant.";

/** Codes whose wording we always impose (session, tone, security), whatever the backend says. */
const CODE_OVERRIDES: Readonly<Record<string, string>> = {
  UNAUTHENTICATED: SESSION_EXPIRED_MESSAGE,
  TOKEN_INVALID: SESSION_EXPIRED_MESSAGE,
  TOKEN_EXPIRED: SESSION_EXPIRED_MESSAGE,
  SESSION_EXPIRED: SESSION_EXPIRED_MESSAGE,
  SESSION_REVOKED: "Votre session a été fermée. Reconnectez-vous pour continuer.",
  BAD_CREDENTIALS: "E-mail ou mot de passe incorrect.",
  ACCOUNT_DISABLED: "Ce compte est désactivé. Contactez TPUB pour le réactiver.",
  ACCESS_DENIED: "Vous n'avez pas accès à cette action.",
  INTERNAL_ERROR: SERVER_ERROR_MESSAGE,
  BACKEND_UNREACHABLE: UNREACHABLE_MESSAGE,
};

/**
 * French label for every backend code of contract §2. Used when the backend message is missing
 * or not French, and for codes sent as values of `errors` (BATCH_CONFLICT supportId → code).
 */
export const CODE_MESSAGES: Readonly<Record<string, string>> = {
  ...CODE_OVERRIDES,
  // Generic (§2.0)
  BAD_REQUEST: "La demande n'a pas pu aboutir. Vérifiez les informations saisies et réessayez.",
  VALIDATION_FAILED: "Certains champs sont invalides. Vérifiez le formulaire.",
  INVALID_BODY: "Requête invalide : vérifiez le format des dates, des heures et des valeurs.",
  INVALID_PARAMETER: "Un paramètre de la demande est invalide.",
  MISSING_PARAMETER: "Une information obligatoire manque à la demande.",
  NOT_FOUND: "Cet élément est introuvable.",
  METHOD_NOT_ALLOWED: "Cette action n'est pas disponible.",
  PAYLOAD_TOO_LARGE: "Le fichier envoyé est trop volumineux (60 Mo maximum).",
  UNSUPPORTED_MEDIA_TYPE: "Ce type de contenu n'est pas pris en charge.",
  DATA_INTEGRITY: "Opération impossible : des données liées existent ou une valeur est invalide.",
  // Campaigns (§2.1)
  CAMPAIGN_NOT_FOUND: "Cette campagne est introuvable.",
  CLIENT_NOT_ALLOWED:
    "Votre compte annonceur ne permet pas cette action pour le moment. Contactez TPUB.",
  INVALID_PERIOD: "La date de fin doit être après la date de début.",
  INVALID_TIME_RANGE: "L'heure de fin doit être après l'heure de début.",
  START_DATE_IN_PAST: "La date de début ne peut pas être dans le passé.",
  CAMPAIGN_NOT_EDITABLE: "Cette campagne ne peut plus être modifiée dans son état actuel.",
  CAMPAIGN_NOT_SUBMITTABLE: "Seules les campagnes en brouillon peuvent être soumises.",
  SUBMIT_INCOMPLETE:
    "La campagne est incomplète : complétez les points signalés avant de la soumettre.",
  ZONE_LIMIT_EXCEEDED: "Vous pouvez cibler au maximum 5 zones.",
  INVALID_ZONE: "Aucune zone TPUB active ne couvre ce point.",
  CAMPAIGN_NOT_REVIEWABLE:
    "Cette campagne ne peut pas faire l'objet d'une décision dans son état actuel.",
  AI_OVERRIDE_REQUIRED:
    "L'IA demande une revue manuelle : confirmez la dérogation pour valider cette campagne.",
  CAMPAIGN_PERIOD_OVER: "La période de diffusion de cette campagne est déjà terminée.",
  NO_RESERVATION_TO_CONFIRM: "Aucune réservation en cours à confirmer pour cette campagne.",
  REJECT_REASON_REQUIRED: "Indiquez le motif du refus (3 caractères minimum).",
  PRIORITY_NOT_EDITABLE:
    "La priorité de cette campagne ne peut pas être modifiée dans son état actuel.",
  // AI (§2.2)
  CAMPAIGN_NOT_ELIGIBLE_FOR_AI: "Cette campagne ne peut pas être analysée dans son état actuel.",
  AI_REPORT_NOT_FOUND: "Aucune analyse pour cette campagne pour le moment.",
  AI_RULE_NAME_TAKEN: "Une règle porte déjà ce nom.",
  INVALID_REGEX: "L'expression régulière est invalide.",
  AI_RULE_NOT_FOUND: "Cette règle est introuvable.",
  // Media (§2.3)
  MEDIA_TYPE_UNSUPPORTED:
    "Format non pris en charge : utilisez une image JPEG, PNG, WebP ou GIF, ou une vidéo MP4 ou WebM.",
  MEDIA_CONTENT_MISMATCH: "Le contenu du fichier ne correspond pas à son format déclaré.",
  MEDIA_TOO_LARGE: "Fichier trop volumineux (10 Mo maximum pour une image, 50 Mo pour une vidéo).",
  MEDIA_LIMIT_REACHED: "Nombre maximal de médias atteint pour cette campagne (5).",
  MEDIA_NOT_FOUND: "Ce média est introuvable.",
  // Zones, supports, availability (§2.4)
  ZONE_NOT_FOUND: "Cette zone est introuvable.",
  ZONE_IN_USE: "Cette zone est encore utilisée par des Porteurs ou des réservations.",
  SUPPORT_NOT_FOUND: "Ce Porteur est introuvable.",
  SUPPORT_BLOCK_NOT_FOUND: "Cette indisponibilité est introuvable.",
  INVALID_RANGE: "La période demandée est invalide (dates inversées ou plus d'un an).",
  // Reservations (§2.4)
  RESERVATION_NOT_FOUND: "Cette réservation est introuvable.",
  CAMPAIGN_NOT_RESERVABLE: "On ne peut réserver des Porteurs que pour une campagne en brouillon.",
  RESERVATION_OUTSIDE_CAMPAIGN_PERIOD:
    "Le créneau doit rester dans la période et les horaires de la campagne.",
  CAMPAIGN_ZONE_REQUIRED: "Choisissez d'abord la zone ciblée de la campagne sur la carte.",
  SUPPORT_OUTSIDE_CAMPAIGN_ZONE: "Ce Porteur est en dehors des zones ciblées par la campagne.",
  RESERVATION_DUPLICATE: "Ce Porteur est déjà réservé pour cette campagne sur ce créneau.",
  SUPPORT_UNAVAILABLE: "Ce Porteur est indisponible sur ce créneau (maintenance ou hors ligne).",
  SUPPORT_ALREADY_RESERVED:
    "Ce Porteur est déjà réservé sur ce créneau. Choisissez un autre créneau ou un autre Porteur.",
  BATCH_CONFLICT:
    "Certains Porteurs ne sont plus disponibles : aucune réservation n'a été enregistrée.",
  RESERVATION_NOT_CANCELLABLE: "Cette réservation ne peut plus être annulée.",
  // Diffusion (§2.5)
  SUPPORT_ZONE_MISMATCH: "Ce Porteur n'appartient pas à la zone indiquée.",
  DIFFUSION_LOG_NOT_FOUND: "Cette diffusion est introuvable.",
  INTERACTION_NOT_ALLOWED: "Seules les publicités peuvent recevoir un clic.",
  INTERACTION_EXPIRED: "Cette diffusion est trop ancienne pour enregistrer une interaction.",
  // Emergencies (§2.8)
  EMERGENCY_NOT_FOUND: "Ce message prioritaire est introuvable.",
  EMERGENCY_TARGET_REQUIRED: "Choisissez une zone ou tracez un cercle sur la carte.",
  INVALID_EMERGENCY_WINDOW: "La fin de diffusion doit être après le début et dans le futur.",
  // Statistics (§2.9)
  EXPORT_TYPE_INVALID: "Ce type d'export n'existe pas.",
  // Accounts (§2.10)
  EMAIL_ALREADY_REGISTERED: "Un compte existe déjà avec cet e-mail.",
  INVALID_CURRENT_PASSWORD: "Le mot de passe actuel est incorrect.",
  PASSWORD_REUSED: "Le nouveau mot de passe doit être différent de l'actuel.",
  SESSION_NOT_FOUND: "Cette session est introuvable ou déjà fermée.",
  USER_NOT_FOUND: "Compte introuvable.",
  CLIENT_NOT_FOUND: "Annonceur introuvable.",
  ROLE_NOT_ALLOWED: "Ce rôle ne peut pas être attribué ici.",
  CANNOT_DEACTIVATE_SELF: "Vous ne pouvez pas désactiver votre propre compte.",
  LAST_ADMIN: "Impossible : c'est le dernier administrateur actif.",
  // Round 2 — 2FA and forced password change (docs/round2-contract.md §3.2, §3.3)
  PASSWORD_CHANGE_REQUIRED: "Vous devez définir un nouveau mot de passe avant de continuer.",
  TOTP_CODE_INVALID: "Code de vérification incorrect.",
  CHALLENGE_EXPIRED: "La vérification a expiré. Reconnectez-vous.",
  TOTP_ALREADY_ENABLED: "La double authentification est déjà active.",
  TOTP_SETUP_REQUIRED:
    "Aucune configuration en cours ou configuration expirée : recommencez l'activation.",
  TOTP_NOT_ENABLED: "La double authentification n'est pas active.",
  TOTP_REQUIRED_FOR_ROLE:
    "La double authentification est obligatoire pour votre rôle : elle ne peut pas être désactivée.",
  // Round 2 — player device keys (§3.4)
  DEVICE_KEY_REQUIRED: "Écran non appairé : clé d'appareil manquante.",
  DEVICE_KEY_INVALID: "Clé d'appareil invalide ou révoquée.",
  DEVICE_RATE_LIMITED: "Trop de requêtes pour cet écran.",
  // Round 2 — signed media URLs (§3.5)
  MEDIA_SIGNATURE_REQUIRED: "Lien de média non signé : accès refusé.",
  MEDIA_SIGNATURE_INVALID: "Lien de média invalide : accès refusé.",
  MEDIA_URL_EXPIRED: "Lien de média expiré : rechargez la page.",
};

/** SUBMIT_INCOMPLETE `errors` keys, in checklist order, with their French label. */
export const SUBMIT_INCOMPLETE_LABELS: Readonly<Record<SubmitIncompleteKey, string>> = {
  period: "Période de diffusion",
  times: "Horaires de diffusion",
  budget: "Budget",
  zones: "Zone ciblée",
  reservations: "Porteurs réservés",
};

/** Exact business messages (legacy English backend). */
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
/** Unaccented French backend messages (« Champ obligatoire. », « Adresse e-mail invalide. »). */
const FRENCH_WORDS =
  /\b(champ|obligatoire|invalide|doit|entre|valeur|adresse|introuvable|requis|incorrect)\b/i;

function looksFrench(message: string): boolean {
  return FRENCH_HINT.test(message) || FRENCH_WORDS.test(message);
}

function isDisplayable(raw: string): boolean {
  return raw.length > 0 && raw.length <= 240 && !raw.startsWith("<") && looksFrench(raw);
}

const ENGLISH_WORDS =
  /\b(the|is|are|not|must|found|invalid|failed|error|already|too|cannot|required|access|denied|unexpected)\b/i;

/**
 * v2 bodies carrying a `code` always have a French message (contract §2.0): show it unless it
 * is clearly English (older backend, framework default) or not a short plain sentence.
 */
function isDisplayableCoded(raw: string): boolean {
  return (
    raw.length > 0 &&
    raw.length <= 240 &&
    !raw.startsWith("<") &&
    (looksFrench(raw) || !ENGLISH_WORDS.test(raw))
  );
}

/**
 * Translates a backend message to French. With a known `code`: imposed wording, else the
 * (French) backend message, else the code label. Unknown English messages fall back to the
 * status family message. Messages already in French (bridge / Next routes) pass through.
 */
export function translateMessage(
  message: string | null | undefined,
  status: number,
  code?: string | null,
): string {
  const raw = (message ?? "").trim();
  if (code) {
    const override = CODE_OVERRIDES[code];
    if (override) return override;
    if (isDisplayableCoded(raw)) return raw;
    const label = CODE_MESSAGES[code];
    if (label) return label;
  }
  if (!raw) return statusFallbackMessage(status);
  const exact = EXACT[raw];
  if (exact) return exact;
  for (const rule of PATTERNS) {
    const m = rule.test.exec(raw);
    if (m) return rule.translate(m);
  }
  if (isDisplayable(raw)) return raw;
  return statusFallbackMessage(status);
}

const CODE_LIKE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;

/** Translates one field message: a backend code (BATCH_CONFLICT values) or a validation text. */
export function translateFieldMessage(message: string | null | undefined): string {
  const raw = (message ?? "").trim();
  if (!raw) return "Valeur invalide.";
  if (CODE_LIKE.test(raw)) return CODE_MESSAGES[raw] ?? "Valeur invalide.";
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
