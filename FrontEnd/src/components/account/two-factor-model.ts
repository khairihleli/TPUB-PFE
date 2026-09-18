/**
 * Two-factor authentication helpers (docs/round2-contract.md §3.3, §3.7), pure and unit-tested.
 * Codes: 6-digit TOTP (RFC 6238, 30 s) or a recovery code `xxxxx-xxxxx` (lower-case Crockford
 * Base32 without i, l, o, u).
 */

export const TOTP_DIGITS = 6;
export const RECOVERY_CODE_PATTERN = /^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/;

/** What the person typed, spaces removed. */
export function compactCode(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/** Keeps digits only, at most 6 (typing, pasting « 123 456 »). */
export function sanitizeTotpInput(raw: string): string {
  return raw.replace(/\D+/g, "").slice(0, TOTP_DIGITS);
}

export function isTotpCode(raw: string): boolean {
  return /^\d{6}$/.test(compactCode(raw));
}

/**
 * Recovery code as typed: lower case, spaces removed, the hyphen added after 5 characters when
 * it was omitted (« ABCDE12345 » → « abcde-12345 »).
 */
export function normalizeRecoveryCode(raw: string): string {
  const clean = compactCode(raw).toLowerCase();
  if (/^[0-9a-z]{10}$/.test(clean)) return `${clean.slice(0, 5)}-${clean.slice(5)}`;
  return clean;
}

export function isRecoveryCode(raw: string): boolean {
  return RECOVERY_CODE_PATTERN.test(normalizeRecoveryCode(raw));
}

export type CodeMode = "totp" | "recovery";

/** French validation message of a code field, null when the value is acceptable. */
export function codeError(raw: string, mode: CodeMode): string | null {
  if (compactCode(raw).length === 0) {
    return mode === "totp"
      ? "Saisissez le code à 6 chiffres de votre application."
      : "Saisissez un code de secours.";
  }
  if (mode === "totp") {
    return isTotpCode(raw) ? null : "Le code comporte exactement 6 chiffres.";
  }
  return isRecoveryCode(raw) ? null : "Un code de secours a la forme xxxxx-xxxxx.";
}

/** Value sent to the backend for `mode`. */
export function codeForSubmit(raw: string, mode: CodeMode): string {
  return mode === "totp" ? compactCode(raw) : normalizeRecoveryCode(raw);
}

/** Base32 secret in groups of 4 for manual entry (« JBSW Y3DP … »). */
export function groupSecret(secret: string): string {
  return (secret.replace(/\s+/g, "").toUpperCase().match(/.{1,4}/g) ?? []).join(" ");
}

/** Whole seconds left before `expiresAt` (never negative); null when unreadable. */
export function secondsUntilIso(expiresAt: string | null | undefined, nowMs: number): number | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

/** « 4 min 05 s » / « 42 s » / « expiré ». */
export function formatRemaining(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds <= 0) return "expiré";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes} min ${String(rest).padStart(2, "0")} s` : `${rest} s`;
}

/** Content of the downloadable `.txt` of recovery codes. */
export function recoveryCodesText(codes: readonly string[], email: string, generatedAt: Date): string {
  const date = new Intl.DateTimeFormat("fr-TN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  }).format(generatedAt);
  return [
    "ZELQANE — codes de secours de la double authentification",
    `Compte : ${email}`,
    `Générés le : ${date}`,
    "",
    "Chaque code ne fonctionne qu'une seule fois. Conservez-les en lieu sûr.",
    "Générer de nouveaux codes rend ceux-ci inutilisables.",
    "",
    ...codes.map((code, i) => `${String(i + 1).padStart(2, " ")}. ${code}`),
    "",
  ].join("\r\n");
}

/** File name of the recovery codes download. */
export function recoveryCodesFileName(generatedAt: Date): string {
  const d = generatedAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `zelqane-codes-de-secours-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.txt`;
}

/** « 7 codes restants » / « 1 code restant » / « Aucun code restant ». */
export function recoveryCodesRemainingLabel(count: number): string {
  if (count <= 0) return "Aucun code de secours restant";
  return count === 1 ? "1 code de secours restant" : `${count} codes de secours restants`;
}
