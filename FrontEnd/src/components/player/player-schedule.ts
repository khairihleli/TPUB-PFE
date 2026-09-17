/**
 * Player scheduling (pure, unit-tested): how long a content stays on screen, how the
 * player backs off when the network or the backend fails, and when to announce an alert.
 * Every GET /api/diffusion/next writes one diffusion log row (contract §5.10), so the
 * player never polls faster than the duration the backend returned.
 */
import { ApiError, ApiTransportError } from "@/lib/api/errors";
import type { Diffusion } from "@/lib/api/types";

export const DEFAULT_DURATION_S = 10;
/** Floor: protects the diffusion log from a misconfigured duration (0, negative, NaN). */
export const MIN_DURATION_S = 5;
/** Ceiling: keeps the screen responsive to a new priority message. */
export const MAX_DURATION_S = 300;

export const RETRY_BASE_MS = 2_000;
export const RETRY_MAX_MS = 60_000;
/** Retry pace for errors a retry is unlikely to fix quickly (unknown screen, bad request). */
export const RETRY_SLOW_MS = 60_000;

/** Delay before asking for the next content, from the backend `duration` (seconds). */
export function contentDelayMs(duration: unknown): number {
  const s =
    typeof duration === "number" && Number.isFinite(duration) && duration > 0
      ? duration
      : DEFAULT_DURATION_S;
  return Math.round(Math.min(Math.max(s, MIN_DURATION_S), MAX_DURATION_S) * 1000);
}

/**
 * Exponential backoff: attempt 1 → 2 s, 2 → 4 s, 3 → 8 s … capped at 60 s.
 * `random` (0..1) adds up to ±20 % jitter so a fleet of screens doesn't retry in lockstep;
 * omit it for deterministic values.
 */
export function retryDelayMs(attempt: number, random?: () => number): number {
  const a = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
  const base = Math.min(RETRY_BASE_MS * 2 ** Math.min(a - 1, 16), RETRY_MAX_MS);
  if (!random) return base;
  const jitter = 1 + (Math.min(Math.max(random(), 0), 1) * 0.4 - 0.2);
  return Math.round(Math.min(base * jitter, RETRY_MAX_MS));
}

export type PlayerErrorKind = "not-found" | "offline" | "unreachable" | "invalid" | "server";

export interface PlayerErrorInfo {
  kind: PlayerErrorKind;
  title: string;
  message: string;
  /** Retry at RETRY_SLOW_MS instead of the exponential ladder. */
  slow: boolean;
}

export function classifyPlayerError(e: unknown, supportId: number): PlayerErrorInfo {
  if (e instanceof ApiTransportError) {
    if (e.kind === "network" || e.kind === "timeout") {
      return {
        kind: "offline",
        title: "Connexion perdue",
        message: "Le lecteur ne parvient pas à joindre TPUB. Il réessaie automatiquement.",
        slow: false,
      };
    }
    return {
      kind: "server",
      title: "Réponse inattendue",
      message: "Le service a renvoyé une réponse illisible. Nouvelle tentative automatique.",
      slow: false,
    };
  }
  if (e instanceof ApiError) {
    if (e.status === 404) {
      return {
        kind: "not-found",
        title: "Écran introuvable",
        message: `Aucun écran ne porte l'identifiant ${supportId}. Vérifiez l'adresse du lecteur dans le back-office (Réseau › Écrans).`,
        slow: true,
      };
    }
    if (e.status === 502 || e.status === 503 || e.status === 504) {
      return {
        kind: "unreachable",
        title: "Service momentanément indisponible",
        message: "Le service TPUB ne répond pas. Le lecteur réessaie automatiquement.",
        slow: false,
      };
    }
    if (
      e.status >= 400 &&
      e.status < 500 &&
      e.status !== 401 &&
      e.status !== 408 &&
      e.status !== 429
    ) {
      return {
        kind: "invalid",
        title: "Demande refusée",
        message: "Le service a refusé la demande de contenu. Nouvelle tentative dans une minute.",
        slow: true,
      };
    }
  }
  return {
    kind: "server",
    title: "Diffusion interrompue",
    message: "Une erreur est survenue côté service. Le lecteur réessaie automatiquement.",
    slow: false,
  };
}

export type NextStep =
  | { ok: true; delayMs: number; attempt: 0 }
  | { ok: false; delayMs: number; attempt: number; error: PlayerErrorInfo };

/** A priority message is re-checked at least every 5 s so the takeover ends promptly. */
export const URGENCE_POLL_MAX_S = 5;

/**
 * Delay before the next call for a content: its `duration`, except a priority message which is
 * polled every `min(duration, 5)` s (contract §5 F3 player).
 */
export function pollDelayMs(d: Pick<Diffusion, "duration"> & { type?: Diffusion["type"] }): number {
  const content = contentDelayMs(d.duration);
  return d.type === "URGENCE" ? Math.min(content, URGENCE_POLL_MAX_S * 1000) : content;
}

/** Single place that decides what happens after a poll. */
export function planAfterSuccess(
  d: Pick<Diffusion, "duration"> & { type?: Diffusion["type"] },
): NextStep {
  return { ok: true, delayMs: pollDelayMs(d), attempt: 0 };
}

export function planAfterError(
  e: unknown,
  previousAttempt: number,
  supportId: number,
  random?: () => number,
): NextStep {
  const attempt = Math.max(0, previousAttempt) + 1;
  const error = classifyPlayerError(e, supportId);
  return {
    ok: false,
    attempt,
    error,
    delayMs: error.slow ? RETRY_SLOW_MS : retryDelayMs(attempt, random),
  };
}

/** Seconds left before `nextAt` (ceil, never negative). Null when unknown. */
export function secondsUntil(nextAt: number | null, now: number | null): number | null {
  if (nextAt === null || now === null) return null;
  return Math.max(0, Math.ceil((nextAt - now) / 1000));
}

/** "/ecran/12" → 12. Anything but a positive safe integer → null. */
export function parseSupportId(raw: string | undefined | null): number | null {
  if (typeof raw !== "string" || !/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Identity of what is on screen: same key → no entrance animation replay. */
export function slideKey(
  d: Pick<Diffusion, "type" | "campaignId" | "title"> & { mediaUrl?: string | null },
): string {
  const base = `${d.type}:${d.campaignId ?? "-"}:${d.title}`;
  return d.mediaUrl ? `${base}:${d.mediaUrl}` : base;
}

/**
 * role="alert" must fire once per priority message, not on every poll: announce only when
 * an URGENCE replaces something else (or a different urgence).
 */
export function isNewUrgence(
  previous: Pick<Diffusion, "type" | "campaignId" | "title"> | null,
  next: Pick<Diffusion, "type" | "campaignId" | "title">,
): boolean {
  if (next.type !== "URGENCE") return false;
  return previous === null || slideKey(previous) !== slideKey(next);
}

/** How a publicité is rendered: its media when the backend sent one, else a title card. */
export type AdMediaKind = "image" | "video" | "none";

export function adMediaKind(d: Pick<Diffusion, "mediaUrl" | "mediaType">): AdMediaKind {
  const url = typeof d.mediaUrl === "string" ? d.mediaUrl.trim() : "";
  if (!url) return "none";
  if (d.mediaType === "VIDEO") return "video";
  if (d.mediaType === "IMAGE" || d.mediaType === "BANNER") return "image";
  // Unknown type (older payloads): guess from the extension, default to an image.
  return /\.(mp4|webm)(\?|#|$)/i.test(url) ? "video" : "image";
}

/** A tap on a publicité counts one CLIC per diffusion log (never twice, never for other types). */
export function shouldSendClick(
  d: Pick<Diffusion, "type" | "diffusionLogId"> | null,
  alreadySent: ReadonlySet<number>,
): boolean {
  return (
    d !== null &&
    d.type === "PUBLICITE" &&
    typeof d.diffusionLogId === "number" &&
    !alreadySent.has(d.diffusionLogId)
  );
}

const SIMULATED_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function simulatedParts(value: string): number[] | null {
  const m = SIMULATED_RE.exec(value.trim());
  if (!m) return null;
  return [m[1], m[2], m[3], m[4], m[5], m[6] ?? "00"].map(Number);
}

/**
 * `?datetime=2026-09-20T18:30` → the normalised local base "2026-09-20T18:30:00", or null when
 * absent or invalid (the player then uses the real Tunis clock).
 */
export function parseSimulatedDateTime(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const p = simulatedParts(raw);
  if (!p) return null;
  const [y, mo, d, h, mi, s] = p as [number, number, number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const same =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s;
  return same ? date.toISOString().slice(0, 19) : null;
}

/** Simulated local date-time: the base plus the real time elapsed since the player started. */
export function simulatedDateTime(base: string, elapsedMs: number): string {
  const p = simulatedParts(base);
  if (!p) return base;
  const [y, mo, d, h, mi, s] = p as [number, number, number, number, number, number];
  const seconds = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) + seconds * 1000).toISOString().slice(0, 19);
}

/** "12" → "0:12" · 75 → "1:15". */
export function formatCountdown(seconds: number | null): string {
  if (seconds === null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
