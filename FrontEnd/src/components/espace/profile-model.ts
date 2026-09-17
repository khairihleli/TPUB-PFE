/**
 * Profile page model (contract §2.10: PUT /me, POST /me/password, POST /me/logo, sessions and
 * login history). zod schemas mirror the backend constraints; the rest are pure display helpers.
 */
import { z } from "zod";

import { formatFileSize } from "@/components/campaign/media-model";
import type { LoginHistoryResponse, MeResponse, MeUpdateRequest } from "@/lib/api/types";
import { LOGIN_FAILURE_LABEL } from "@/lib/campaign-status";

export const REQUIRED = "Ce champ est requis.";
const max = (n: number) => ({ error: `${n} caractères maximum.` });

/** Backend pattern `^[+0-9 ().-]{6,30}$`. */
export const PHONE_PATTERN = /^[+0-9 ().-]{6,30}$/;

export const profileSchema = z.object({
  nom: z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED }).max(150, max(150)),
  societe: z.string().trim().max(200, max(200)),
  telephone: z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_PATTERN.test(v), {
      error: "Numéro invalide : 6 à 30 caractères parmi chiffres, espaces, +, ( ) . -",
    }),
  adresse: z.string().trim().max(1000, max(1000)),
});

export type ProfileValues = z.input<typeof profileSchema>;
export const PROFILE_FIELDS = ["nom", "societe", "telephone", "adresse"] as const;

export function profileValuesOf(me: MeResponse): ProfileValues {
  return {
    nom: me.nom ?? "",
    societe: me.societe ?? me.client?.companyName ?? "",
    telephone: me.telephone ?? "",
    adresse: me.adresse ?? "",
  };
}

/** Parsed form → PUT /me body (blank optional fields are sent as null). */
export function toMeUpdateRequest(values: z.output<typeof profileSchema>): MeUpdateRequest {
  return {
    nom: values.nom,
    societe: values.societe || null,
    telephone: values.telephone || null,
    adresse: values.adresse || null,
  };
}

export function sameProfile(a: ProfileValues, b: ProfileValues): boolean {
  return PROFILE_FIELDS.every((f) => a[f].trim() === b[f].trim());
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string({ error: REQUIRED }).min(1, { error: REQUIRED }),
    newPassword: z
      .string({ error: REQUIRED })
      .min(1, { error: REQUIRED })
      .min(PASSWORD_MIN, { error: `${PASSWORD_MIN} caractères minimum.` })
      .max(PASSWORD_MAX, max(PASSWORD_MAX))
      .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), {
        error: "Au moins une lettre et un chiffre.",
      }),
    confirmPassword: z.string({ error: REQUIRED }).min(1, { error: REQUIRED }),
  })
  .superRefine((v, ctx) => {
    if (v.confirmPassword && v.newPassword !== v.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Les deux mots de passe ne correspondent pas.",
      });
    }
    if (v.currentPassword && v.newPassword && v.currentPassword === v.newPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Choisissez un mot de passe différent de l'actuel.",
      });
    }
  });

export type PasswordValues = z.input<typeof passwordChangeSchema>;
export const PASSWORD_FIELDS = ["currentPassword", "newPassword", "confirmPassword"] as const;

/** Backend codes of POST /me/password mapped to the field they concern. */
export const PASSWORD_ERROR_FIELD: Record<string, (typeof PASSWORD_FIELDS)[number]> = {
  INVALID_CURRENT_PASSWORD: "currentPassword",
  PASSWORD_REUSED: "newPassword",
};

export const PASSWORD_ERROR_MESSAGE: Record<string, string> = {
  INVALID_CURRENT_PASSWORD: "Mot de passe actuel incorrect.",
  PASSWORD_REUSED: "Choisissez un mot de passe différent de l'actuel.",
};

// ---------------------------------------------------------------------------
// Logo (png/jpeg/webp ≤ 2 MB)
// ---------------------------------------------------------------------------
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_ACCEPT = LOGO_TYPES.join(",");
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function checkLogoFile(file: Pick<File, "type" | "size">): string | null {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
    return "Format non accepté : PNG, JPEG ou WebP uniquement.";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return `Fichier trop lourd (${formatFileSize(file.size)}) : ${formatFileSize(MAX_LOGO_BYTES)} maximum.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sessions and login history
// ---------------------------------------------------------------------------
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/Firefox\//, "Firefox"],
  [/Chrome\/|CriOS/, "Chrome"],
  [/Safari\//, "Safari"],
  [/curl|PostmanRuntime|okhttp|Java\//i, "Client API"],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iOS/, "iOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

/** « Chrome · Windows » from a user agent; « Appareil inconnu » when absent. */
export function describeUserAgent(ua: string | null | undefined): string {
  const value = (ua ?? "").trim();
  if (!value) return "Appareil inconnu";
  const browser = BROWSERS.find(([re]) => re.test(value))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(value))?.[1];
  if (browser && system) return `${browser} · ${system}`;
  return browser ?? system ?? "Navigateur inconnu";
}

/** Current session first, then most recent activity first. */
export function sortSessions<T extends { current: boolean; lastSeenAt: string }>(
  sessions: readonly T[],
): T[] {
  return [...sessions].sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      (a.lastSeenAt < b.lastSeenAt ? 1 : a.lastSeenAt > b.lastSeenAt ? -1 : 0),
  );
}

export function loginOutcomeLabel(entry: Pick<LoginHistoryResponse, "success" | "failureReason">) {
  if (entry.success) return "Connexion réussie";
  return entry.failureReason ? `Échec : ${LOGIN_FAILURE_LABEL[entry.failureReason]}` : "Échec";
}
