/** Client-side checks aligned with the backend rules (contract §5.1) and brief §8.8 copy. */
import { z } from "zod";

export const REQUIRED = "Ce champ est requis.";
export const EMAIL_INVALID = "Adresse e-mail invalide.";
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 100;

const max = (n: number) => ({ error: `${n} caractères maximum.` });

const email = z
  .string({ error: REQUIRED })
  .trim()
  .min(1, { error: REQUIRED })
  .max(255, max(255))
  .pipe(z.email({ error: EMAIL_INVALID }));

export const loginSchema = z.object({
  email,
  password: z.string({ error: REQUIRED }).min(1, { error: REQUIRED }),
});

export const registerSchema = z.object({
  nom: z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED }).max(150, max(150)),
  societe: z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED }).max(200, max(200)),
  email,
  telephone: z
    .string({ error: REQUIRED })
    .trim()
    .min(1, { error: REQUIRED })
    .max(30, max(30))
    .refine((v) => /^\+?[\d\s().-]+$/.test(v) && /^(\D*\d){6,20}\D*$/.test(v), {
      error: "Numéro de téléphone invalide.",
    }),
  adresse: z.string().trim().max(500, max(500)),
  password: z
    .string({ error: REQUIRED })
    .min(1, { error: REQUIRED })
    .min(PASSWORD_MIN, { error: `${PASSWORD_MIN} caractères minimum.` })
    .max(PASSWORD_MAX, max(PASSWORD_MAX)),
  consentement: z.literal(true, {
    error: "Acceptez les CGU et la politique de confidentialité pour créer votre compte.",
  }),
});

export type LoginValues = z.input<typeof loginSchema>;
export type RegisterValues = z.input<typeof registerSchema>;

export type FieldErrorsOf<T> = Partial<Record<keyof T & string, string>>;

/** One French message per field (first issue wins). */
export function firstIssues<T extends Record<string, unknown>>(
  error: z.ZodError,
  fields: readonly (keyof T & string)[],
): FieldErrorsOf<T> {
  const out: FieldErrorsOf<T> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || !(fields as readonly string[]).includes(key)) continue;
    const k = key as keyof T & string;
    out[k] ??= issue.message;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Password strength (guidance only — the backend rule is 8 to 100 characters)
// ---------------------------------------------------------------------------
export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  level: StrengthLevel;
  label: string;
  hint: string;
}

const COMMON = new Set([
  "password",
  "motdepasse",
  "12345678",
  "123456789",
  "azertyui",
  "azertyuiop",
  "qwertyui",
  "00000000",
  "11111111",
  "zelqane1234",
]);

export function passwordStrength(pw: string): PasswordStrength {
  if (pw.length === 0) {
    return { level: 0, label: "", hint: `${PASSWORD_MIN} caractères minimum.` };
  }
  if (pw.length < PASSWORD_MIN) {
    const left = PASSWORD_MIN - pw.length;
    return {
      level: 0,
      label: "Trop court",
      hint: `Encore ${left} caractère${left > 1 ? "s" : ""} au minimum.`,
    };
  }
  if (COMMON.has(pw.toLowerCase()) || /^(.)\1+$/.test(pw)) {
    return { level: 1, label: "Faible", hint: "Évitez les suites trop courantes." };
  }
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const level = Math.min(4, score) as StrengthLevel;
  const labels: Record<StrengthLevel, string> = {
    0: "Trop court",
    1: "Faible",
    2: "Moyen",
    3: "Bon",
    4: "Solide",
  };
  const hint =
    level >= 4
      ? "Mot de passe solide."
      : "Allongez-le ou ajoutez majuscules, chiffres et symboles pour le renforcer.";
  return { level, label: labels[level], hint };
}
