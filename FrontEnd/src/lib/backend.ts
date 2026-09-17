/** Server-side backend helpers. Env is read per call, never at import time. */

export const UNREACHABLE_BODY = {
  status: 502,
  code: "BACKEND_UNREACHABLE",
  message: "Le service TPUB est momentanément indisponible.",
} as const;

export const SESSION_EXPIRED_BODY = {
  status: 401,
  code: "SESSION_EXPIRED",
  message: "Session expirée",
} as const;

/** Largest request body forwarded by the bridge (backend multipart limit, contract §2.3). */
export const MAX_FORWARDED_BODY_BYTES = 60 * 1024 * 1024;

export const PAYLOAD_TOO_LARGE_BODY = {
  status: 413,
  code: "PAYLOAD_TOO_LARGE",
  message: "Le fichier envoyé est trop volumineux (60 Mo maximum).",
} as const;

/** JSON 401 codes of the security chain meaning « this session is over » (contract §2.0). */
export const SESSION_END_CODES: ReadonlySet<string> = new Set([
  "UNAUTHENTICATED",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "SESSION_REVOKED",
  "ACCOUNT_DISABLED",
]);

export function backendUrl(): string {
  const raw = (process.env.TPUB_API_URL ?? "").trim() || "http://localhost:8080";
  return raw.replace(/\/+$/, "");
}

/** Hop-by-hop and encoding headers never forwarded in either direction. */
export const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
  "host",
  "set-cookie",
]);

/** Parses a response body as JSON when possible (empty / non-JSON → null). */
export function parseJsonSafe(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** `code` of a backend error body, or null. */
export function errorCodeOf(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" && code ? code : null;
}

/**
 * Client context forwarded to Spring (session rows and login history store IP + user agent,
 * contract §2.10). The first X-Forwarded-For hop is kept as sent by the proxy in front of Next.
 */
export function clientContextHeaders(source: Headers): Headers {
  const out = new Headers();
  const ua = source.get("user-agent");
  if (ua) out.set("user-agent", ua);
  const xff = source.get("x-forwarded-for") ?? source.get("x-real-ip");
  if (xff) out.set("x-forwarded-for", xff);
  return out;
}

/** Declared body size, or null when absent/invalid (chunked uploads). */
export function declaredContentLength(headers: Headers): number | null {
  const raw = headers.get("content-length");
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Query params of a signed media URL (docs/round2-contract.md §3.5); anything else is dropped. */
export const SIGNED_MEDIA_PARAMS = ["exp", "sig"] as const;

/** `?exp=…&sig=…` rebuilt from an incoming query (first value of each, oversized values dropped). */
export function signedMediaQuery(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const name of SIGNED_MEDIA_PARAMS) {
    const value = params.get(name);
    if (value !== null && value.length > 0 && value.length <= 256) out.set(name, value);
  }
  const qs = out.toString();
  return qs ? `?${qs}` : "";
}

/** Segments that could escape the uploads directory, or are not plain file names. */
export function isSafeUploadPath(segments: readonly string[]): boolean {
  if (segments.length === 0) return false;
  return segments.every(
    (s) =>
      s.length > 0 &&
      s !== "." &&
      s !== ".." &&
      !s.includes("/") &&
      !s.includes("\\") &&
      !s.includes("\0") &&
      !/%2e|%2f|%5c/i.test(s),
  );
}
