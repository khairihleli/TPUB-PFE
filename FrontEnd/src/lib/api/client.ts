/**
 * Browser fetch wrapper. Only ever calls same-origin `/api/...` (the Next bridge adds the
 * Bearer token from the httpOnly cookie). Throws French `ApiError` / `ApiTransportError`.
 */
import { ApiError, ApiTransportError, isRetryableTransportError } from "@/lib/api/errors";
import { translateFieldErrors, translateMessage } from "@/lib/api/messages";

export const SESSION_EXPIRED_EVENT = "tpub:session-expired";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean | null | undefined;

export interface ApiFetchOptions {
  method?: HttpMethod;
  /** JSON-serialised. */
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

async function apiFetchOnce<T>(
  path: string,
  method: HttpMethod,
  options: ApiFetchOptions,
): Promise<T> {
  const { body, signal, query } = options;
  const url = buildApiUrl(path, query);

  const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
  let timeoutSignal: AbortSignal | undefined;
  if (timeoutMs !== null && typeof AbortSignal.timeout === "function") {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
  }
  const combined = combineSignals([signal, timeoutSignal].filter((s): s is AbortSignal => !!s));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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

  if (!res.ok) {
    if (res.status === 401 && !NO_EXPIRY_EVENT.test(url)) dispatchSessionExpired();
    const b = (data && typeof data === "object" ? data : {}) as {
      message?: unknown;
      errors?: unknown;
    };
    const rawMessage = typeof b.message === "string" ? b.message : null;
    throw new ApiError(res.status, translateMessage(rawMessage, res.status), {
      fieldErrors: translateFieldErrors(b.errors),
      rawMessage,
      body: data,
    });
  }

  return data as T;
}
