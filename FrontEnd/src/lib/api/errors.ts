import { SESSION_EXPIRED_MESSAGE, UNREACHABLE_MESSAGE } from "@/lib/api/messages";

export type FieldErrors = Record<string, string>;

/** A backend (or bridge) answered with a non-2xx status. `message` is already French. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;
  /** Stable machine-readable backend code (contract §2.0), null for legacy bodies. */
  readonly code: string | null;
  /** Field → French message (from Spring `errors`). */
  readonly fieldErrors: FieldErrors;
  /** Original backend message, for branching/logs only — never display it. */
  readonly rawMessage: string | null;
  /** Untranslated `errors` (e.g. BATCH_CONFLICT supportId → code): for branching only. */
  readonly rawFieldErrors: Record<string, string>;
  readonly body: unknown;

  constructor(
    status: number,
    message: string,
    options: {
      fieldErrors?: FieldErrors;
      rawMessage?: string | null;
      body?: unknown;
      code?: string | null;
      rawFieldErrors?: Record<string, string>;
    } = {},
  ) {
    super(message);
    this.status = status;
    this.code = options.code ?? null;
    this.rawFieldErrors = options.rawFieldErrors ?? {};
    this.fieldErrors = options.fieldErrors ?? {};
    this.rawMessage = options.rawMessage ?? null;
    this.body = options.body;
  }
}

export type TransportErrorKind = "network" | "timeout" | "aborted" | "unexpected-response";

const TRANSPORT_MESSAGES: Record<TransportErrorKind, string> = {
  network: "TPUB est injoignable. Vérifiez votre connexion et réessayez.",
  timeout: "TPUB met plus de temps que prévu à répondre. Réessayez dans un instant.",
  aborted: "La requête a été interrompue.",
  "unexpected-response": "Réponse inattendue du serveur. Réessayez dans un instant.",
};

/** The request never got a usable answer (offline, timeout, HTML instead of JSON…). */
export class ApiTransportError extends Error {
  override readonly name = "ApiTransportError";
  readonly kind: TransportErrorKind;
  readonly status: number | null;

  constructor(kind: TransportErrorKind, status: number | null = null) {
    super(TRANSPORT_MESSAGES[kind]);
    this.kind = kind;
    this.status = status;
  }
}

export type AppError = ApiError | ApiTransportError;

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function isTransportError(e: unknown): e is ApiTransportError {
  return e instanceof ApiTransportError;
}

export function isAbortError(e: unknown): boolean {
  if (e instanceof ApiTransportError) return e.kind === "aborted";
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

/** True when `e` is an ApiError carrying one of `codes`. */
export function hasErrorCode(e: unknown, ...codes: string[]): e is ApiError {
  return e instanceof ApiError && e.code !== null && codes.includes(e.code);
}

/**
 * The campaign was never analysed: 404 AI_REPORT_NOT_FOUND (v2), or the legacy
 * 400 « No AI report found ».
 */
export function isNoAiReportError(e: unknown): boolean {
  if (hasErrorCode(e, "AI_REPORT_NOT_FOUND")) return true;
  return (
    e instanceof ApiError &&
    e.status === 400 &&
    (e.rawMessage ?? "").startsWith("No AI report found")
  );
}

/** Codes meaning « this Porteur is not free on that window » (single or batch reservation). */
export const RESERVATION_CONFLICT_CODES = [
  "SUPPORT_ALREADY_RESERVED",
  "SUPPORT_UNAVAILABLE",
  "RESERVATION_DUPLICATE",
  "BATCH_CONFLICT",
] as const;

/** Reservation conflict (v2 codes, or the legacy 400 « Support already reserved… »). */
export function isReservationConflictError(e: unknown): boolean {
  if (hasErrorCode(e, ...RESERVATION_CONFLICT_CODES)) return true;
  return (
    e instanceof ApiError &&
    e.status === 400 &&
    (e.rawMessage ?? "").startsWith("Support already reserved")
  );
}

/** 409 BATCH_CONFLICT: supportId → backend code, e.g. { "12": "SUPPORT_ALREADY_RESERVED" }. */
export function batchConflicts(e: unknown): Record<number, string> {
  if (!hasErrorCode(e, "BATCH_CONFLICT")) return {};
  const out: Record<number, string> = {};
  for (const [key, value] of Object.entries(e.rawFieldErrors)) {
    const id = Number(key);
    if (Number.isInteger(id)) out[id] = value;
  }
  return out;
}

/** 400 SUBMIT_INCOMPLETE: the missing parts (French messages keyed by period/times/…). */
export function submitIncompleteErrors(e: unknown): FieldErrors | null {
  return hasErrorCode(e, "SUBMIT_INCOMPLETE") ? e.fieldErrors : null;
}

/** Session codes answered by the security chain (JSON 401). */
export const SESSION_ERROR_CODES = [
  "UNAUTHENTICATED",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "SESSION_REVOKED",
  "ACCOUNT_DISABLED",
  "SESSION_EXPIRED",
] as const;

/** Coarse category the UI branches on (never on message text). */
export type ErrorCategory =
  | "unreachable"
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "invalid"
  | "conflict"
  | "server"
  | "offline"
  | "slow"
  | "unknown";

/** True only when the browser reports being offline (never inferred from a failed fetch alone). */
export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Honest categories (FLOW-12, FFA-04): a timeout is "slow", a network failure is "offline" only
 * when navigator.onLine is false, otherwise "unreachable".
 */
export function errorCategory(e: unknown): ErrorCategory {
  if (e instanceof ApiTransportError) {
    if (e.kind === "timeout") return isBrowserOffline() ? "offline" : "slow";
    if (e.kind === "network") return isBrowserOffline() ? "offline" : "unreachable";
    return "unknown";
  }
  if (e instanceof ApiError) {
    if (e.status === 502 || e.status === 503) return "unreachable";
    if (e.status === 504) return "slow";
    if (e.status === 401) return "unauthorized";
    if (e.status === 403) return "forbidden";
    if (e.status === 404) return "not-found";
    if (e.status === 409) return "conflict";
    if (e.status >= 400 && e.status < 500) return "invalid";
    if (e.status >= 500) return "server";
  }
  return "unknown";
}

export interface PresentedError {
  category: ErrorCategory;
  title: string;
  message: string;
  fieldErrors: FieldErrors;
  /** Whether a « Réessayer » action makes sense. */
  retryable: boolean;
}

const TITLES: Record<ErrorCategory, string> = {
  unreachable: "Service momentanément indisponible",
  unauthorized: "Session expirée",
  forbidden: "Accès refusé",
  "not-found": "Élément introuvable",
  invalid: "La demande n'a pas abouti",
  conflict: "Conflit",
  server: "Erreur du serveur",
  offline: "Connexion impossible",
  slow: "Le service met trop de temps à répondre",
  unknown: "Une erreur est survenue",
};

export const SLOW_MESSAGE =
  "TPUB met plus de temps que prévu à répondre. Réessayez dans un instant.";
export const OFFLINE_MESSAGE = "Vous semblez hors ligne. Vérifiez votre connexion, puis réessayez.";

/** Maps any thrown value to what the UI renders. Never exposes technical text. */
export function presentError(e: unknown): PresentedError {
  const category = errorCategory(e);
  let message =
    e instanceof ApiError || e instanceof ApiTransportError
      ? e.message
      : "Un problème inattendu est survenu. Réessayez dans un instant.";
  if (category === "unreachable" && !(e instanceof ApiError)) message = UNREACHABLE_MESSAGE;
  // A login refusal is a 401 too, but not an expired session: keep its own message. (A user
  // deactivated mid-session reaches the UI as the bridge SESSION_EXPIRED body instead.)
  const loginRefused = hasErrorCode(e, "BAD_CREDENTIALS", "ACCOUNT_DISABLED");
  if (category === "unauthorized" && !loginRefused) message = SESSION_EXPIRED_MESSAGE;
  if (category === "slow") message = SLOW_MESSAGE;
  if (category === "offline") message = OFFLINE_MESSAGE;
  return {
    category,
    title: loginRefused ? "Connexion impossible" : TITLES[category],
    message,
    fieldErrors: e instanceof ApiError ? e.fieldErrors : {},
    retryable: category !== "forbidden" && category !== "not-found" && category !== "invalid",
  };
}

/** Transport errors worth one automatic retry for idempotent requests. */
export function isRetryableTransportError(e: unknown): boolean {
  return e instanceof ApiTransportError && (e.kind === "network" || e.kind === "timeout");
}
