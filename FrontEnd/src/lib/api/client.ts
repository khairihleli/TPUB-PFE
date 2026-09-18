/**
 * Browser fetch wrapper. Only ever calls same-origin `/api/...` (the Next bridge adds the
 * Bearer token from the httpOnly cookie). Throws French `ApiError` / `ApiTransportError`.
 */
import {
  ApiError,
  ApiTransportError,
  isRetryableTransportError,
  NON_SESSION_401_CODES,
  parseRetryAfter,
} from "@/lib/api/errors";
import { translateFieldErrors, translateMessage } from "@/lib/api/messages";

export const SESSION_EXPIRED_EVENT = "zelqane:session-expired";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiFetchOptions {
  method?: HttpMethod;
  /** JSON-serialised, except a `FormData` (sent as multipart, without client timeout). */
  body?: unknown;
  signal?: AbortSignal;
  /** Appended as a query string (null/undefined skipped). */
  query?: Record<string, QueryValue>;
  /** Default 20 s. `null` disables the timeout (e.g. AI analysis can be slow). */
  timeoutMs?: number | null;
  /**
   * One automatic retry after 800 ms (GET_RETRY_DELAY_MS) on a transport error or timeout.
   * Default: true for GET, always false for POST/PUT/PATCH/DELETE (never replays a mutation).
   */
  retry?: boolean;
  /**
   * Extra request headers (round 2: `x-zelqane-device-key` of the player). `Accept` and
   * `Content-Type` stay managed by the client.
   */
  headers?: Record<string, string>;
}

/** Page shown while the account must set a new password (round 2 §3.2). */
export const PASSWORD_CHANGE_PATH = "/mot-de-passe-requis";

let passwordChangeRedirected = false;

/** Test helper: allows the forced password change redirect to happen again. */
export function resetPasswordChangeGuard(): void {
  passwordChangeRedirected = false;
}

/** 403 PASSWORD_CHANGE_REQUIRED → the forced password change screen, once per page. */
function redirectToPasswordChange(): void {
  if (passwordChangeRedirected || typeof window === "undefined") return;
  if (window.location.pathname === PASSWORD_CHANGE_PATH) return;
  passwordChangeRedirected = true;
  window.location.assign(PASSWORD_CHANGE_PATH);
}

/** Backoff before the single automatic GET retry. */
export const GET_RETRY_DELAY_MS = 800;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiTransportError("aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiTransportError("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** Paths whose 401 means "bad credentials / not logged in", not "session expired". */
const NO_EXPIRY_EVENT = /^\/api\/session(\/|$)/;

let expiryDispatched = false;

/** Allows the next 401 to dispatch the session-expired event again (tests, re-login). */
export function resetSessionExpiredGuard(): void {
  expiryDispatched = false;
}

function dispatchSessionExpired(): void {
  if (expiryDispatched || typeof window === "undefined") return;
  expiryDispatched = true;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

/** "/campaigns/mine" or "/api/campaigns/mine" → "/api/campaigns/mine?…". */
export function buildApiUrl(path: string, query?: Record<string, QueryValue>): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  let url = clean.startsWith("/api/") || clean === "/api" ? clean : `/api${clean}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined) params.append(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }
  return url;
}

function combineSignals(signals: AbortSignal[]): AbortSignal | undefined {
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener("abort", () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const method: HttpMethod = options.method ?? (options.body === undefined ? "GET" : "POST");
  const retry = method === "GET" && options.retry !== false;
  try {
    return await apiFetchOnce<T>(path, method, options);
  } catch (e) {
    if (!retry || !isRetryableTransportError(e) || options.signal?.aborted) throw e;
    await wait(GET_RETRY_DELAY_MS, options.signal);
    return apiFetchOnce<T>(path, method, options);
  }
}

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

/**
 * Sends one request. JSON bodies are serialised; a `FormData` body (media upload) is sent
 * as-is so the browser sets the multipart boundary, and never times out.
 */
async function send(
  url: string,
  method: HttpMethod,
  options: ApiFetchOptions,
  accept: string,
): Promise<Response> {
  const { body, signal } = options;
  const multipart = isFormData(body);

  const timeoutMs = multipart
    ? null
    : options.timeoutMs === undefined
      ? DEFAULT_TIMEOUT_MS
      : options.timeoutMs;
  let timeoutSignal: AbortSignal | undefined;
  if (timeoutMs !== null && typeof AbortSignal.timeout === "function") {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
  }
  const combined = combineSignals([signal, timeoutSignal].filter((s): s is AbortSignal => !!s));

  const headers: Record<string, string> = { ...options.headers, Accept: accept };
  if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";

  try {
    return await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      signal: combined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (e) {
    if (signal?.aborted) throw new ApiTransportError("aborted");
    const name = (e as { name?: unknown } | null)?.name;
    if (timeoutSignal?.aborted || name === "TimeoutError") throw new ApiTransportError("timeout");
    if (name === "AbortError") throw new ApiTransportError("aborted");
    throw new ApiTransportError("network");
  }
}

/** Builds the French ApiError of a non-2xx answer (and signals an expired session). */
function apiErrorOf(res: Response, url: string, data: unknown): ApiError {
  const b = (data && typeof data === "object" ? data : {}) as {
    message?: unknown;
    errors?: unknown;
    code?: unknown;
  };
  const rawMessage = typeof b.message === "string" ? b.message : null;
  const code = typeof b.code === "string" && b.code ? b.code : null;
  const ownCode = code !== null && (NON_SESSION_401_CODES as readonly string[]).includes(code);
  if (res.status === 401 && !NO_EXPIRY_EVENT.test(url) && !ownCode) dispatchSessionExpired();
  if (res.status === 403 && code === "PASSWORD_CHANGE_REQUIRED") redirectToPasswordChange();
  return new ApiError(res.status, translateMessage(rawMessage, res.status, code), {
    fieldErrors: translateFieldErrors(b.errors),
    rawFieldErrors: rawStringRecord(b.errors),
    rawMessage,
    code,
    body: data,
    retryAfterSeconds: parseRetryAfter(res.headers.get("retry-after")),
  });
}

function rawStringRecord(errors: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return out;
  for (const [k, v] of Object.entries(errors as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

async function apiFetchOnce<T>(
  path: string,
  method: HttpMethod,
  options: ApiFetchOptions,
): Promise<T> {
  const { signal, query } = options;
  const url = buildApiUrl(path, query);
  const res = await send(url, method, options, "application/json");

  let text = "";
  try {
    text = await res.text();
  } catch {
    if (signal?.aborted) throw new ApiTransportError("aborted");
    throw new ApiTransportError("network", res.status);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json") || contentType.includes("+json");
  let data: unknown = undefined;
  if (text && isJson) {
    try {
      data = JSON.parse(text);
    } catch {
      if (res.ok) throw new ApiTransportError("unexpected-response", res.status);
    }
  } else if (text && res.ok) {
    // A 2xx with a non-JSON body (HTML error page from a proxy…) is not a valid answer.
    throw new ApiTransportError("unexpected-response", res.status);
  }

  if (!res.ok) throw apiErrorOf(res, url, data);

  return data as T;
}

// ---------------------------------------------------------------------------
// Uploads with progress (media, logo)
// ---------------------------------------------------------------------------
export interface UploadOptions {
  signal?: AbortSignal;
  /** Called with the sent fraction (0..1) while the body uploads. */
  onProgress?: (fraction: number) => void;
}

/**
 * POST a multipart body through the bridge with upload progress (XMLHttpRequest: fetch has no
 * upload progress). Same French errors as `apiFetch`, no timeout, never retried.
 * Falls back to `apiFetch` when XMLHttpRequest is unavailable.
 */
export function apiUpload<T>(
  path: string,
  form: FormData,
  { signal, onProgress }: UploadOptions = {},
): Promise<T> {
  if (typeof XMLHttpRequest === "undefined") {
    return apiFetch<T>(path, { method: "POST", body: form, signal });
  }
  const url = buildApiUrl(path);
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiTransportError("aborted"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.withCredentials = true;
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
      };
    }
    const done = () => signal?.removeEventListener("abort", onAbort);
    xhr.onerror = () => {
      done();
      reject(new ApiTransportError("network"));
    };
    xhr.onabort = () => {
      done();
      reject(new ApiTransportError("aborted"));
    };
    xhr.onload = () => {
      done();
      const text = xhr.responseText ?? "";
      const contentType = xhr.getResponseHeader("content-type") ?? "";
      let data: unknown = undefined;
      if (text && contentType.includes("json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = undefined;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        if (text && data === undefined) {
          reject(new ApiTransportError("unexpected-response", xhr.status));
          return;
        }
        resolve(data as T);
        return;
      }
      const res = new Response(null, { status: xhr.status });
      reject(apiErrorOf(res, url, data));
    };
    xhr.send(form);
  });
}

// ---------------------------------------------------------------------------
// Downloads (CSV exports…)
// ---------------------------------------------------------------------------
export interface DownloadedFile {
  blob: Blob;
  /** From Content-Disposition, else `fallbackName`. */
  filename: string;
}

/**
 * `attachment; filename="a.csv"` / `filename*=UTF-8''a%20b.csv` → file name (RFC 6266).
 * Path separators are stripped so the name can never escape the download folder.
 */
export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  let name: string | null = null;
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (star?.[2]) {
    try {
      name = decodeURIComponent(star[2].trim().replace(/^"|"$/g, ""));
    } catch {
      name = null;
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
    name = plain ? (plain[2] ?? plain[1] ?? "").trim() : null;
  }
  const safe = name?.replace(/[/\\]/g, "_").trim();
  return safe ? safe : null;
}

/**
 * GET a binary resource through the bridge (no JSON parsing). Errors are the same French
 * `ApiError` / `ApiTransportError` as `apiFetch`. No automatic retry, no client timeout.
 */
export async function apiDownload(
  path: string,
  query?: Record<string, QueryValue>,
  options: { signal?: AbortSignal; fallbackName?: string } = {},
): Promise<DownloadedFile> {
  const url = buildApiUrl(path, query);
  const res = await send(url, "GET", { signal: options.signal, timeoutMs: null }, "*/*");
  if (!res.ok) {
    let data: unknown = undefined;
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    throw apiErrorOf(res, url, data);
  }
  let blob: Blob;
  try {
    blob = await res.blob();
  } catch {
    if (options.signal?.aborted) throw new ApiTransportError("aborted");
    throw new ApiTransportError("network", res.status);
  }
  const filename =
    filenameFromContentDisposition(res.headers.get("content-disposition")) ??
    options.fallbackName ??
    "zelqane-export";
  return { blob, filename };
}

/** Triggers the browser « save as » for a blob (no-op outside the browser). */
export function saveBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been handled (Safari needs the URL a little longer).
  setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

/** `apiDownload` then `saveBlob`: returns the saved file name. */
export async function downloadAndSave(
  path: string,
  query?: Record<string, QueryValue>,
  options: { signal?: AbortSignal; fallbackName?: string } = {},
): Promise<string> {
  const { blob, filename } = await apiDownload(path, query, options);
  saveBlob(blob, filename);
  return filename;
}
