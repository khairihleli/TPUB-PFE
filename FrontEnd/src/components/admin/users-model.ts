/**
 * Accounts administration (pure), contract §2.10 `/api/admin/users`, `/api/admin/clients`:
 * list queries per tab, staff account forms, advertiser validation form and small helpers.
 */
import { z } from "zod";

import { maxChars, REQUIRED } from "@/components/admin/form-utils";
import { hasErrorCode } from "@/lib/api/errors";
import type {
  AdminUserCreateRequest,
  AdminUserQuery,
  AdminUserResponse,
  AdminUserUpdateRequest,
  ClientValidationRequest,
  ClientValidationStatus,
  StaffRoleCode,
} from "@/lib/api/types";

export const USERS_TABS = ["annonceurs", "equipe"] as const;
export type UsersTab = (typeof USERS_TABS)[number];

export const STAFF_ROLE_VALUES = [
  "ADMINISTRATEUR",
  "OPERATEUR",
  "SUPERVISEUR",
] as const satisfies readonly StaffRoleCode[];

export const VALIDATION_STATUSES = [
  "PENDING",
  "VALIDATED",
  "REJECTED",
  "SUSPENDED",
] as const satisfies readonly ClientValidationStatus[];

export const USERS_PAGE_SIZE = 20;
export const NOTES_MAX = 2000;
const PHONE = /^[+0-9 ().-]{6,30}$/;

export type ActiveFilter = "" | "actifs" | "inactifs";

export interface UsersFilterState {
  tab: UsersTab;
  q: string;
  active: ActiveFilter;
  validation: ClientValidationStatus | null;
  page: number;
}

export function usersQuery(s: UsersFilterState): AdminUserQuery {
  return {
    q: s.q.trim() || undefined,
    role: s.tab === "annonceurs" ? ["ANNONCEUR"] : [...STAFF_ROLE_VALUES],
    active: s.active === "" ? undefined : s.active === "actifs",
    validationStatus: s.tab === "annonceurs" && s.validation ? [s.validation] : undefined,
    sort: "createdAt,desc",
    page: Math.max(0, s.page),
    size: USERS_PAGE_SIZE,
  };
}

export function usersFilterCount(s: UsersFilterState): number {
  return (s.active ? 1 : 0) + (s.tab === "annonceurs" && s.validation ? 1 : 0);
}

/** « Société Démo » · « Nom Prénom » fallback. */
export function accountTitle(u: Pick<AdminUserResponse, "nom" | "societe" | "client">): string {
  return u.client?.companyName?.trim() || u.societe?.trim() || u.nom;
}

/** Self and non-administrators can never be deactivated from their own session. */
export function deactivationBlocker(
  user: Pick<AdminUserResponse, "userId" | "isActive">,
  currentUserId: number,
): string | null {
  if (!user.isActive) return null;
  if (user.userId === currentUserId) return "Vous ne pouvez pas désactiver votre propre compte.";
  return null;
}

// ---------------------------------------------------------------------------
// Round 2 — account security (docs/round2-contract.md §3.2, §3.3, §3.7)
// ---------------------------------------------------------------------------
export interface SecurityBadge {
  label: string;
  tone: "success" | "warning";
}

/** « 2FA active » and « Changement de mot de passe requis » badges of a row. */
export function securityBadges(
  u: Pick<AdminUserResponse, "twoFactorEnabled" | "mustChangePassword">,
): SecurityBadge[] {
  const badges: SecurityBadge[] = [];
  if (u.twoFactorEnabled === true) badges.push({ label: "2FA active", tone: "success" });
  if (u.mustChangePassword === true) {
    badges.push({ label: "Changement de mot de passe requis", tone: "warning" });
  }
  return badges;
}

/** Why « Réinitialiser la double authentification » is unavailable, null when it is allowed. */
export function twoFactorResetBlocker(
  u: Pick<AdminUserResponse, "userId" | "twoFactorEnabled">,
  currentUserId: number,
): string | null {
  if (u.userId === currentUserId) {
    return "Gérez votre propre double authentification depuis « Mon compte ».";
  }
  if (u.twoFactorEnabled !== true) return "La double authentification n'est pas active.";
  return null;
}

/** Why « Exiger un nouveau mot de passe » is unavailable, null when it is allowed. */
export function passwordChangeBlocker(
  u: Pick<AdminUserResponse, "userId" | "mustChangePassword">,
  currentUserId: number,
): string | null {
  if (u.userId === currentUserId) {
    return "Changez votre propre mot de passe depuis « Mon compte ».";
  }
  if (u.mustChangePassword === true) return "Un nouveau mot de passe est déjà exigé.";
  return null;
}

/** Why « Réinitialiser le mot de passe » is unavailable, null when it is allowed. */
export function passwordResetBlocker(
  u: Pick<AdminUserResponse, "userId">,
  currentUserId: number,
): string | null {
  if (u.userId === currentUserId) {
    return "Changez votre propre mot de passe depuis « Mon compte ».";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Staff account creation / update
// ---------------------------------------------------------------------------
export const STAFF_CREATE_FIELDS = [
  "email",
  "password",
  "nom",
  "role",
  "societe",
  "telephone",
] as const;
export type StaffCreateField = (typeof STAFF_CREATE_FIELDS)[number];
export type StaffCreateValues = Record<StaffCreateField, string>;

export function emptyStaffForm(): StaffCreateValues {
  return { email: "", password: "", nom: "", role: "OPERATEUR", societe: "", telephone: "" };
}

const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === "" || PHONE.test(v), { error: "Numéro de téléphone invalide." });

export const staffCreateSchema = z
  .object({
    email: z
      .string({ error: REQUIRED })
      .trim()
      .min(1, { error: REQUIRED })
      .email({ error: "Adresse e-mail invalide." }),
    password: z
      .string({ error: REQUIRED })
      .min(8, { error: "8 caractères minimum." })
      .max(100, maxChars(100))
      .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), {
        error: "Au moins une lettre et un chiffre.",
      }),
    nom: z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED }).max(150, maxChars(150)),
    role: z.enum(STAFF_ROLE_VALUES, { error: "Choisissez un rôle." }),
    societe: z.string().trim().max(200, maxChars(200)),
    telephone: optionalPhone,
  })
  .transform((v): AdminUserCreateRequest => ({
    email: v.email.toLowerCase(),
    password: v.password,
    nom: v.nom,
    role: v.role,
    societe: v.societe || null,
    telephone: v.telephone || null,
  }));

export const STAFF_UPDATE_FIELDS = ["nom", "societe", "telephone", "adresse", "role"] as const;
export type StaffUpdateField = (typeof STAFF_UPDATE_FIELDS)[number];
export type StaffUpdateValues = Record<StaffUpdateField, string>;

export function staffUpdateFormFrom(u: AdminUserResponse): StaffUpdateValues {
  return {
    nom: u.nom,
    societe: u.societe ?? "",
    telephone: u.telephone ?? "",
    adresse: u.adresse ?? "",
    role: u.role === "ANNONCEUR" ? "" : u.role,
  };
}

/** `canChangeRole` false for the current user and for advertisers (ROLE_NOT_ALLOWED). */
export function staffUpdateSchema(canChangeRole: boolean) {
  return z
    .object({
      nom: z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED }).max(150, maxChars(150)),
      societe: z.string().trim().max(200, maxChars(200)),
      telephone: optionalPhone,
      adresse: z.string().trim().max(1000, maxChars(1000)),
      role: z.string(),
    })
    .transform((v): AdminUserUpdateRequest => ({
      nom: v.nom,
      societe: v.societe || null,
      telephone: v.telephone || null,
      adresse: v.adresse || null,
      ...(canChangeRole && (STAFF_ROLE_VALUES as readonly string[]).includes(v.role)
        ? { role: v.role as StaffRoleCode }
        : {}),
    }));
}

export function accountServerErrors(
  e: unknown,
): Partial<Record<StaffCreateField | StaffUpdateField, string>> {
  if (hasErrorCode(e, "EMAIL_ALREADY_REGISTERED"))
    return { email: "Cette adresse e-mail est déjà utilisée." };
  if (hasErrorCode(e, "ROLE_NOT_ALLOWED"))
    return { role: "Ce rôle ne peut pas être attribué ici." };
  return {};
}

// ---------------------------------------------------------------------------
// Advertiser validation
// ---------------------------------------------------------------------------
export interface ClientValidationValues {
  validationStatus: ClientValidationStatus;
  trustLevel: number;
  notes: string;
}

export function clientValidationFormFrom(u: AdminUserResponse): ClientValidationValues {
  return {
    validationStatus: u.client?.validationStatus ?? "PENDING",
    trustLevel: u.client?.trustLevel ?? 50,
    notes: u.clientNotes ?? "",
  };
}

export function clientValidationBody(
  v: ClientValidationValues,
): ClientValidationRequest | { error: string } {
  if (!Number.isInteger(v.trustLevel) || v.trustLevel < 0 || v.trustLevel > 100) {
    return { error: "Niveau de confiance entier de 0 à 100." };
  }
  const notes = v.notes.trim();
  if (notes.length > NOTES_MAX) return { error: `${NOTES_MAX} caractères maximum pour les notes.` };
  return { validationStatus: v.validationStatus, trustLevel: v.trustLevel, notes: notes || null };
}

/** Effect of a validation status, shown under the choice. */
export const VALIDATION_EFFECT: Record<ClientValidationStatus, string> = {
  PENDING:
    "L'annonceur peut préparer et soumettre ses campagnes ; un badge signale le compte non vérifié.",
  VALIDATED: "Compte vérifié : aucune restriction.",
  REJECTED: "Création, soumission, réservations et médias bloqués (refus définitif).",
  SUSPENDED: "Création, soumission, réservations et médias bloqués jusqu'à réactivation.",
};

/** « Chrome · Windows » from a user agent (best effort, never shown raw). */
export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return "Appareil inconnu";
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os ?? "Appareil inconnu";
}
