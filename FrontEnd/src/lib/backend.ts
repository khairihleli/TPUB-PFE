/** Server-side backend helpers. Env is read per call, never at import time. */

export const UNREACHABLE_BODY = {
  status: 502,
  message: "Le service TPUB est momentanément indisponible.",
} as const;

export const SESSION_EXPIRED_BODY = { status: 401, message: "Session expirée" } as const;

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
