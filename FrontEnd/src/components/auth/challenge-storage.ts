/**
 * What the verification screens may know about the login challenge in progress (round 2 §3.7):
 * the e-mail and the expiry, kept in sessionStorage for the countdown. The challenge token itself
 * lives in an httpOnly cookie and never reaches JavaScript.
 */
import type { LoginChallengeStatus } from "@/lib/api/types";

const KEY = "tpub.connexion.verification";

export interface ChallengeInfo {
  status: LoginChallengeStatus;
  email: string;
  expiresAt: string;
}

function isChallengeInfo(v: unknown): v is ChallengeInfo {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.status === "TOTP_REQUIRED" || o.status === "TOTP_ENROLMENT_REQUIRED") &&
    typeof o.email === "string" &&
    typeof o.expiresAt === "string" &&
    Number.isFinite(Date.parse(o.expiresAt))
  );
}

export function storeChallengeInfo(info: ChallengeInfo): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(info));
  } catch {
    // Storage unavailable: the screens simply show no countdown.
  }
}

/** The stored challenge of `status`, null when absent, malformed or of another kind. */
export function readChallengeInfo(status: LoginChallengeStatus): ChallengeInfo | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isChallengeInfo(parsed) && parsed.status === status ? parsed : null;
  } catch {
    return null;
  }
}

export function clearChallengeInfo(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
