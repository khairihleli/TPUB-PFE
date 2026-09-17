/**
 * Signed media URLs (docs/round2-contract.md §3.5), pure helpers.
 * Shape: `/uploads/<encoded path>?exp=<epoch seconds>&sig=<base64url>`. The backend signs every
 * URL it returns; the browser never builds or re-signs one, it only reads `exp` to refresh the
 * owning resource before (or after) the link expires.
 */

/** Refresh a signed URL this long before it expires (default margin of `isExpiringSoon`). */
export const DEFAULT_EXPIRY_MARGIN_MS = 120_000;

/** `…/a.jpg?exp=1&sig=x#t` → `…/a.jpg`. Empty or non-string input → "". */
export function stripQuery(url: string | null | undefined): string {
  if (typeof url !== "string") return "";
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
}

/** Lower-case extension of the path part (`mp4`, `jpg`…), null without one. */
export function mediaExtension(url: string | null | undefined): string | null {
  const path = stripQuery(url);
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null;
}

function queryParam(url: string, name: string): string | null {
  const q = url.indexOf("?");
  if (q < 0) return null;
  const hash = url.indexOf("#", q);
  const query = url.slice(q + 1, hash < 0 ? undefined : hash);
  for (const part of query.split("&")) {
    const eq = part.indexOf("=");
    const key = eq < 0 ? part : part.slice(0, eq);
    if (key === name) return eq < 0 ? "" : part.slice(eq + 1);
  }
  return null;
}

/** True when the URL carries both `exp` and `sig` (a backend-signed media URL). */
export function isSignedMediaUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  return queryParam(url, "sig") !== null && signedUrlExpiresAt(url) !== null;
}

/** Expiry of a signed URL in epoch milliseconds; null when unsigned or malformed. */
export function signedUrlExpiresAt(url: string | null | undefined): number | null {
  if (typeof url !== "string") return null;
  const exp = queryParam(url, "exp");
  if (exp === null || !/^\d{1,12}$/.test(exp)) return null;
  return Number(exp) * 1000;
}

/**
 * True when a signed URL expires within `marginMs` (or already expired). Unsigned URLs (local
 * `blob:` previews, external links) never expire.
 */
export function isExpiringSoon(
  url: string | null | undefined,
  nowMs: number,
  marginMs: number = DEFAULT_EXPIRY_MARGIN_MS,
): boolean {
  const expiresAt = signedUrlExpiresAt(url);
  return expiresAt !== null && expiresAt - nowMs <= marginMs;
}

/**
 * Campaign id of a campaign media URL (`/uploads/campaigns/{id}/…`), null for other files (logos…).
 * The storage layout is fixed by the backend (docs/round2-contract.md §1.2).
 */
export function campaignIdOfMediaUrl(url: string | null | undefined): number | null {
  const match = /\/uploads\/campaigns\/(\d{1,15})\//.exec(stripQuery(url));
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Same stored file (the signature and expiry are ignored). */
export function sameMediaFile(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = stripQuery(a);
  return left.length > 0 && left === stripQuery(b);
}

/** Earliest expiry (epoch ms) among the signed media URLs found anywhere in `value`, else null. */
export function earliestSignedUrlExpiry(value: unknown, depth = 0): number | null {
  if (depth > 6 || value === null || value === undefined) return null;
  if (typeof value === "string") {
    return value.includes("sig=") && isSignedMediaUrl(value) ? signedUrlExpiresAt(value) : null;
  }
  if (typeof value !== "object") return null;
  let earliest: number | null = null;
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    const found = earliestSignedUrlExpiry(child, depth + 1);
    if (found !== null && (earliest === null || found < earliest)) earliest = found;
  }
  return earliest;
}
