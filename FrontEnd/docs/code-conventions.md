# ZELQANE frontend: code and UX conventions (taken from tukai-frontend and tukai-v2/apps/web)

Sources read (read-only):
- **TF** = `scratchpad/tukai-frontend`: Next 15.5, React 19.2, Tailwind 4.3, framer-motion 12, vitest 4, Playwright 1.62. It is a port of an Angular app. The code is uneven (one 9.5k-line god store, 7k lines of hand-written CSS), but its **guard rails, e2e fixtures, API bridge and error messages are excellent**.
- **V2** = `scratchpad/tukai-v2/apps/web`: Next 16.3, React 19.2, Tailwind 4.3, Radix (`radix-ui`), next-intl, MSW, Storybook, a typed OpenAPI client. This is the cleaner **architecture** reference: design-token discipline, UI primitives, immutable stores, RFC 9457 errors.
- The ZELQANE backend was checked so the recommendations fit it: Spring Boot, `POST /api/auth/login` returns `{token,email,nom,role,userId}`, Bearer JWT with **no refresh token**. Error body is `{timestamp,status,message,errors?:{field:msg}}`, with English messages.

Legend: **[TF]** / **[V2]** = observed in that repo. **[ZELQANE]** = recommendation for the new app (derived, not copied).

---

## 1. Folder structure, naming, route groups, server/client split

### Observed
- **[TF]** Layout is `src/app`, `src/components` (PascalCase files like `AuthScreen.tsx`), `src/lib` (kebab-case like `modal-focus.ts`), `src/mocks`, plus `__tests__/` next to the code and `e2e/` at the root. The `@/*` alias points to `./src/*`.
- **[V2]** No `src/`. Folders are `app/`, `components/<domain>/` and `components/ui/`, `lib/<domain>/`, `i18n/`, `mocks/`, `test/` (mirrors domains), `e2e/`. **All files are kebab-case** (`login-form.tsx`, `use-api-keys.ts`) and components are named exports. Each domain folder has an `index.ts` barrel, and screens import only from barrels (`@/components/ui`, `@/lib/api`).
- **Route groups** (both repos):
  - `(shell)`: the authenticated workspace. Its `layout.tsx` mounts the shared provider or store **once**. A layout is not re-mounted when you move between its pages, so state such as an in-flight generation or an open SSE connection survives menu navigation. V2's comment: "four pages each rendering `<Workspace>` = a shell torn down on every section click".
  - `(auth)`: V2 has `/login`, `/register`, `/reset`, `/verify` and `/mfa` under one `layout.tsx` that renders `<main className="flex min-h-dvh items-center justify-center">`. URLs stay clean.
  - Anything that does not share the store stays out of the group: `/pricing`, `/pay/*` and `/receipt` in TF, and `/guest` in V2.
- **Server vs client**:
  - The root `layout.tsx` stays a **server component** in both repos. It handles fonts, metadata, `<html lang dir>` and the theme script, with no session and no store.
  - `page.tsx` files are thin: TF `login/page.tsx` exports `metadata` (`robots: {index:false}`) and renders `<LoginGate/>`.
  - `'use client'` goes on **leaf interactive components, providers and hooks**. Presentational pieces without state stay server-safe (V2 `skeleton.tsx` and `empty-state.tsx` have no directive).
  - A page that must use `useSearchParams` wraps it in `<Suspense>` with a fallback that **looks like the loading gate**, so nothing flashes (TF `studio/page.tsx`).
  - Heavy client-only surfaces use `next/dynamic(() => import(...), { ssr:false, loading })` (TF lazy-loads the 3D studio this way).
- **[V2]** Containers are separate from presentational components: `WorkspaceShell` (layout, skip link, drawer overlay) versus `Workspace` (reads stores and wires callbacks). That split is what lets stories and tests mount a full shell without network.
- **[V2]** Navigation belongs to the **page**, not the form. `LoginForm` takes `onForgot` and `onRegister`, and the page calls `router.replace('/')` after login (`replace`, so Back does not return to an empty login form).

### [ZELQANE] Proposed tree
```
src/
  app/
    (marketing)/            # public site: page.tsx (home), reseau/, tarifs/, contact/ … server components, SEO metadata
      layout.tsx            # marketing header/footer (server), mobile nav island (client)
    (auth)/connexion/ inscription/ mot-de-passe-oublie/   layout.tsx centred card
    (espace)/               # client space, one provider mounted once
      layout.tsx            # session gate + AppShell (sidebar/topbar/drawer) + ToastProvider
      tableau-de-bord/ campagnes/ campagnes/nouvelle/ campagnes/[id]/ medias/ supports/ factures/ profil/
    api/[...path]/route.ts  # same-origin bridge to Spring (section 2)
    api/session/route.ts    # login/logout: sets/clears httpOnly cookie
    layout.tsx  globals.css  error.tsx  global-error.tsx  not-found.tsx  loading.tsx
  components/ui/            # button, field, dialog, menu, tabs, toast, skeleton, empty-state, badge, status-pill
  components/<domain>/      # campaign/, media/, network/, billing/, marketing/, shell/
  lib/api/                  # client.ts, errors.ts, session.ts (server), types.ts
  lib/cx.ts  lib/format.ts (fr-TN, TND, Africa/Tunis)  lib/motion.ts  lib/use-reduced-motion.ts
  content/fr.ts             # UI strings catalogue (section 4, i18n)
  mocks/                    # MSW handlers (dev + vitest)
e2e/  scripts/  vitest.config.ts  vitest.setup.ts  playwright.config.ts
```
Rules: kebab-case files and named exports (V2 style). One `'use client'` per interactive leaf. Server components by default for marketing. No provider above `(espace)`.

---

## 2. API client pattern

### 2.1 The same-origin bridge `/api/[...path]` [TF]
Why it exists, in TF's own comments:
1. Service keys stay on the server.
2. There is **no CORS** to configure.
3. Changing the backend address is one env var, and **no component ever writes a backend URL**.
4. **The path is never rewritten**: `/api/wallet` becomes `${BACKEND_URL}/wallet`. A translation table ties the front to one backend layout and 404s every new route.

Env vars are **read per request, never at import time** (on edge or workers runtimes the env only exists inside a request).
```ts
// src/app/api/[...path]/route.ts  (condensed from TF)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function proxy(req: Request, path: string[], search: string) {
  const dest = `${backendUrl()}/${path.join('/')}${search}`;
  const headers = new Headers(backendAuthHeaders());           // server-only key
  for (const h of ['authorization', 'content-type', 'accept', 'x-forwarded-for']) {
    const v = req.headers.get(h); if (v) headers.set(h, v);    // real client IP for rate limiting
  }
  let upstream: Response;
  try {
    upstream = await fetch(dest, {
      method: req.method, headers, redirect: 'manual',
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
      signal: req.signal,                                        // propagate client abort end-to-end
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError' || req.signal.aborted) return new Response(null, { status: 499 });
    console.error(`[api] ${req.method} ${dest}:`, (e as Error)?.message);   // diagnosis stays in logs
    return Response.json({ error: 'Service momentanément injoignable. Réessayez dans quelques secondes.',
                           code: 'BACKEND_UNREACHABLE' }, { status: 502 });
  }
  const h = new Headers(upstream.headers);
  h.delete('content-encoding'); h.delete('content-length');
  return new Response(upstream.body, { status: upstream.status, headers: h });   // unbuffered (SSE-friendly)
}
async function handler(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;                              // Next 15: params is a Promise
  const url = new URL(req.url);
  return backendMode() === 'http' ? proxy(req, path.filter(Boolean), url.search)
                                  : handleMockApi(req, path, url.searchParams);
}
export const GET = handler; export const POST = handler; export const PUT = handler;
export const PATCH = handler; export const DELETE = handler;
```
`src/lib/backend.ts` [TF] is the single decision point:
- `backendMode()`: `BACKEND_MODE=mock` forces mocks. Otherwise a non-empty `BACKEND_URL` means `http`, and an empty one means `mock`. An absent URL is not a choice, and proxying to `undefined` would 502 every screen.
- `backendUrl()`: trim, then strip the trailing `/`.
- `mockLatencyMs()`: capped at 5 s, used to *see* loading states.

**[ZELQANE]** Spring already serves `/api/**`, so keep the prefix: `dest = ${BACKEND_URL}/api/${path}`. Env vars: `BACKEND_URL` (server-only), `BACKEND_MODE`, `MOCK_LATENCY_MS`. There is no `NEXT_PUBLIC_API_URL`: the browser only ever calls `/api/*`.

V2 contrast: V2 calls the API origin directly with `NEXT_PUBLIC_API_URL`. Its Playwright config documents the cost: `NEXT_PUBLIC_*` is **frozen at build**, so changing it needs a rebuild. The bridge avoids this.

### 2.2 The fetch wrapper [TF] plus typed errors [V2]
TF `api<T>(url, {method, body, timeoutMs})`:
- The method defaults to POST when a body is present.
- JSON content-type is set only when there is a body.
- The Bearer token is attached **only for `/api/` URLs**.
- `AbortController` timeout: 10 s by default, overridable per call.
- The body is read as text, then parsed.

It uses three error classes, each with a **user-facing message**:
- `ApiError(status, body)`: the message is `body.error` if it is a string. Otherwise the fallback is chosen by status family: 5xx means "our side, try again", 4xx means "couldn't complete". **Never "Request failed (500)".**
- `ApiTimeoutError`: "took longer than Ns, check your connection". A bare AbortError otherwise surfaces as "signal is aborted without reason".
- `ApiNetworkError`: `fetch` rejects with a `TypeError` ("Failed to fetch"). It is translated **after** the abort check.
- A non-JSON body (the HTML error page of a proxy or CDN) is kept as `rawBody`. It is promoted to the message **only if it is ≤200 chars and does not start with `<`**. Otherwise an entire HTML document ends up displayed in a bubble.

V2 adds these:
- **`ApiProblemError` vs `ApiTransportError(kind: 'network'|'aborted'|'unexpected-response')`**. A non-2xx *without* a recognisable error body is a transport failure, not a contract error.
- A **structural guard** (`isProblemDetails`) runs on every non-2xx body before it is trusted.
- A 2xx that is not JSON becomes `ApiTransportError`, never a raw `SyntaxError`.
- `AbortSignal.any([callerSignal, AbortSignal.timeout(ms)])`, where `timeoutMs: null` disables the timeout for long uploads.
- `fetch` is bound once (`globalThis.fetch.bind(globalThis)`), because an unbound fetch throws "Illegal invocation".
- A `presentProblem()` step maps an error into what the UI renders: `{title, detail, fieldErrors[], retryAfterMs, supportReference}`. **The UI branches on `code`, never on message text.**
- **Idempotency-Key** is minted for POSTs with effects, and the same key must be resent on retry, because "a fresh key on retry is a second order, a second charge". This is relevant for ZELQANE bookings and payments if the backend adds it.
- **Single-flight refresh**: N concurrent 401s trigger one rotation. `onSessionEnded` is called once, and the store is cleared before the UI routes to login. ZELQANE has no refresh token today, but keep the single `onUnauthorized` hook.

**[ZELQANE] client (condensed, fits the Spring error shape)**
```ts
// src/lib/api/errors.ts
export interface FieldErrors { [field: string]: string }
export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(readonly status: number, message: string, readonly fieldErrors: FieldErrors = {}, readonly body?: unknown) { super(message); }
}
export class ApiTransportError extends Error {
  override readonly name = 'ApiTransportError';
  constructor(readonly kind: 'network' | 'timeout' | 'unexpected-response', readonly status: number | null = null) {
    super(kind === 'timeout' ? 'La requête a pris trop de temps. Vérifiez votre connexion et réessayez.'
        : kind === 'network' ? 'ZELQANE est injoignable. Vérifiez votre connexion et réessayez.'
        : 'Réponse inattendue du serveur. Réessayez dans un instant.');
  }
}
const FALLBACK = (s: number) => s >= 500 ? 'Un problème est survenu de notre côté. Réessayez dans un instant.'
  : s === 401 ? 'Votre session a expiré. Reconnectez-vous.'
  : s === 403 ? "Vous n'avez pas accès à cette ressource."
  : s === 404 ? "Cet élément n'existe plus." : "La demande n'a pas pu aboutir. Réessayez.";

// src/lib/api/client.ts
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T>(path: `/api/${string}`, o: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number | null } = {}): Promise<T> {
  const signals = [o.signal, o.timeoutMs === null ? undefined : AbortSignal.timeout(o.timeoutMs ?? 15_000)].filter(Boolean) as AbortSignal[];
  const isForm = o.body instanceof FormData;                     // media upload: let the browser set the boundary
  let res: Response;
  try {
    res = await fetch(path, {
      method: o.method ?? (o.body === undefined ? 'GET' : 'POST'),
      headers: o.body === undefined || isForm ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: o.body === undefined ? undefined : isForm ? (o.body as FormData) : JSON.stringify(o.body),
      signal: signals.length ? AbortSignal.any(signals) : undefined,
      credentials: 'same-origin',                                  // httpOnly session cookie rides along
    });
  } catch (e) {
    const name = (e as Error)?.name;
    throw new ApiTransportError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network');
  }
  const text = await res.text();
  let data: unknown = undefined;
  if (text) { try { data = JSON.parse(text); } catch { if (res.ok) throw new ApiTransportError('unexpected-response', res.status); } }
  if (res.status === 401 && path !== '/api/auth/login') onUnauthorized?.();   // redirect-on-401, one place
  if (!res.ok) {
    const b = (data ?? {}) as { message?: unknown; errors?: unknown };
    const msg = typeof b.message === 'string' && b.message.length <= 200 && b.message !== 'Validation failed' ? b.message : FALLBACK(res.status);
    throw new ApiError(res.status, msg, (b.errors && typeof b.errors === 'object' ? b.errors : {}) as FieldErrors, data);
  }
  return data as T;
}
```
Backend messages are English (for example "Invalid email or password"), so add a small `code/message → French` map in `errors.ts` and fall back to `FALLBACK(status)`. Never show raw English or technical text.

### 2.3 Token storage, session hydration, redirect on 401
- **[TF]** Stores a Bearer token in `localStorage` when "remember me" is checked, otherwise in `sessionStorage`. `sessionStorage` wins over a stale `localStorage` token. Every storage access is wrapped in try/catch (private mode). Hydration runs at mount (`init()`):
  1. It calls `GET /api/auth/status`.
  2. `isAuthReady` becomes true, then the store either `enterWorkspace()` or runs `clearAuthToken()` and shows login.
  3. A **3 s fallback timer** forces the ready state, so there is never an eternal "Checking your session…".

  Screens render three states: `!isAuthReady` shows the gate text, not signed in shows a CTA, and signed in shows the content. 401/403 on an action gives the specific message "Reconnectez-vous pour …".
- **[V2]** A `SessionStore` port (`read/write/clear`) with memory and web-storage adapters. Its own comment: *"the token is a Bearer header, readable by JavaScript, which is why `dangerouslySetInnerHTML` is banned: one XSS is one stolen session"*. Terminal auth codes clear the session and call `onSessionEnded` once. With in-memory storage, a new tab shows logged out, which is a documented regression.
- **[ZELQANE] Recommended (stronger than both):** an **httpOnly cookie set by the Next server**, with the JWT never exposed to JS.
  - `POST /api/session` (route handler) forwards credentials to Spring `/api/auth/login`. On 200 it sets `zelqane_session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<jwt exp>` and returns `{email, nom, role, userId}` only.
  - `DELETE /api/session` clears the cookie.
  - The bridge reads the cookie and sets `Authorization: Bearer <jwt>` upstream, so the browser never holds the token.
  - `middleware.ts` protects `(espace)` routes: no cookie means a redirect to `/connexion?next=<path>`. It only checks presence; the backend remains the authority. Also add `robots: noindex` on auth and client pages.
  - Hydration: the `(espace)` layout (server) calls the backend for `me` (or decodes non-sensitive claims) and passes `initialUser` to a client `SessionProvider`. There is no client-side loading flash for the gate. The client `setUnauthorizedHandler(() => router.replace('/connexion?next=…&expired=1'))` handles a mid-session expiry with the message "Votre session a expiré."
  - CSRF: `SameSite=Lax`, plus the bridge only accepting mutating methods with `Origin` equal to the host.
  - After login, `router.replace(next ?? '/tableau-de-bord')`. Only accept a relative `next` value, to avoid an open redirect.

---

## 3. Styling

### 3.1 Tailwind v4 setup
- `postcss.config.mjs` is the same in both: `{ plugins: { '@tailwindcss/postcss': {} } }`. There is no `tailwind.config`, because **`@theme` in CSS is the config**.
- **[V2] `globals.css` (the pattern to copy for a new app):**
```css
@import "tailwindcss" source(none);     /* explicit sources: test/ probes once leaked `pl-4` into prod CSS */
@source "../app"; @source "../components"; @source "../lib";
@import "./tokens/themes.css";           /* the ONLY file allowed to contain literal colours */

@theme inline {                          /* inline = emits var(--x), resolved at paint → follows data-theme */
  --color-*: initial;                    /* deletes Tailwind palette: bg-red-500 compiles to NOTHING */
  --color-bg: var(--bg); --color-surface: var(--surface); --color-surface-2: var(--surface-2);
  --color-line: var(--line); --color-line-strong: var(--line-strong);
  --color-ink: var(--ink); --color-ink-soft: var(--ink-soft); --color-muted: var(--muted); --color-faint: var(--faint);
  --color-accent: var(--accent); --color-accent-strong: var(--accent-strong); --color-accent-ink: var(--accent-ink); --color-accent-soft: var(--accent-soft);
  --color-danger: var(--danger); --color-danger-soft: var(--danger-soft); --color-warning: var(--warning); --color-focus: var(--focus);
  --shadow-*: initial; --shadow-sm: var(--elevation-sm); --shadow-md: var(--elevation-md); --shadow-lg: var(--elevation-lg);
}
@theme {
  --font-*: initial; --font-sans: "Inter", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  --text-*: initial; --text-sm: 0.8125rem; --text-sm--line-height: 1.25rem; /* … seven sizes */
  --spacing: 0.25rem; --spacing-touch: 44px;            /* min-h-touch, size-touch */
  --radius-*: initial; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px;
  --breakpoint-*: initial; --breakpoint-sm: 40rem; --breakpoint-md: 48rem; --breakpoint-lg: 64rem; --breakpoint-xl: 80rem;
  --animate-ui-in: ui-in var(--duration-base) ease-out;
  @keyframes ui-in { from { opacity: 0; transform: scale(.98) } to { opacity: 1; transform: none } }
}
:root { --z-dropdown:10; --z-sticky:20; --z-overlay:30; --z-modal:40; --z-toast:50;
        --duration-fast:120ms; --duration-base:200ms; --duration-slow:320ms; }   /* used as z-(--z-modal), duration-(--duration-fast) */
@layer base {
  body { background-color: var(--bg); color: var(--ink); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--radius-xs); }
  @media (prefers-reduced-motion: reduce) { *,*::before,*::after {
    animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important; scroll-behavior:auto!important; } }
}
```
- **Why `@theme inline` and not `@theme`** [TF, V2]: plain `@theme` **copies** the value at compile time, so `bg-accent` stays the dark-theme colour in every theme. `inline` emits `var(--accent)`, resolved at paint under the current `data-theme`.
- **[TF]** Legacy-only details (do not copy): preflight was dropped because of an existing reset. `@import 'tailwindcss/theme.css' layer(theme)` was used so the project's `:root` wins over Tailwind's `--shadow-*`. Utilities are imported **last** so they win over legacy classes.
- **[ZELQANE] tokens** (`src/app/tokens/themes.css`), taken from the logo:
  - Brand: `--brand-red:#E11D2A` (top bar, primary CTA), `--brand-orange:#F07A1A` (highlights, "en diffusion"), `--brand-blue:#0A5CA8` (links, info, focus ring).
  - Role tokens: `--accent: var(--brand-red)`, `--accent-ink:#fff`, `--focus: var(--brand-blue)`, `--info`, `--success`, `--warning` (orange family), `--danger` (distinct from brand red, darker: `#B4141F` on light).
  - Status tokens for the campaign lifecycle: `--status-draft`, `--status-moderation`, `--status-approved`, `--status-live`, `--status-rejected`, `--status-ended`.
  - **Contrast check:** white text on `#E11D2A` is about 4.6:1 (passes AA for body text, borderline). White on `#F07A1A` is about 2.7:1, so **never put white text on the orange**; use dark ink. White on `#0A5CA8` is about 6.6:1 (fine). Pin this with a contrast test like V2's.

### 3.2 Class composition
- **[V2] `cx()` without tailwind-merge**, on purpose:
```ts
export type ClassValue = string | false | null | undefined;
export const cx = (...v: ClassValue[]) => v.filter((x): x is string => Boolean(x)).join(' ');
```
  Rationale: the primitive's classes come first and the caller's `className` is appended. `className` is for spacing and width. **Overriding a primitive's colour bypasses the token discipline.** tailwind-merge adds about 20 kB of conflict rules.
- **[TF] trap, from MIGRATION.md:** *"a visual state that replays the same properties is written with `? :`, never by concatenation"*. `BTN + (on ? ' '+BTN_ON : '')` fails because Tailwind's emission order decides the winner, not string order.
- **Variants [V2]** are `Record<Variant,string>` maps. There is no cva:
```ts
const VARIANT: Record<'primary'|'secondary'|'ghost'|'danger', string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-strong',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'border border-danger bg-danger-soft text-danger hover:bg-danger hover:text-bg',
};
const SIZE = { sm: 'min-h-9 gap-1.5 px-3 text-sm', md: 'min-h-touch gap-2 px-4 text-base' };
```
  Keep **four weights at most**, and `md` meets the 44 px touch target.
- **[TF]** Repeated class strings are hoisted into named constants (`const TK_INPUT = '…'`, `const GATE = '…'`) with a comment. Use this until a primitive exists.

### 3.3 Dark mode / themes
- Both repos set `data-theme` on `<html>` **before paint** with an inline script at the top of `<head>`, plus `suppressHydrationWarning` on `<html>` only. The script: default theme, try/catch `localStorage.getItem(key)`, whitelist check, `setAttribute`.
- **[V2]** The script source is built from constants in `lib/theme.ts` (`THEMES`, `THEME_STORAGE_KEY`), which the switch and tests also use. It is rendered as `<script>{themeBeforePaintScript}</script>` (text child, not `dangerouslySetInnerHTML`).
- Bare `:root` carries the default theme, so first paint is right even before the script runs. `color-scheme` is set per theme.
- **[TF]** Test for **token parity**: a light theme block must declare every token the dark block declares. A missing token silently falls back to the dark value.
- **[ZELQANE]** Light by default for the marketing site. Optionally offer dark in the client space. If you add dark, copy the parity test and the before-paint script.

### 3.4 Breakpoints and `check-breakpoints`
- **[TF]** `scripts/check-breakpoints.mjs` fails `npm run check` if any `.ts/.tsx/.css` under `src/` contains a **native** `max-sm:`…`max-2xl:`, `max-[Npx]:`, or `print:`. It reads the allowed custom variants **from `tailwind.css`** instead of keeping a copy, and blanks comments (preserving line numbers) so documentation that names the rule does not trip it. The error output explains the fix with examples.

  Reasons it documents:
  1. `max-sm:` compiles to `(width < 40rem)`, which **excludes** the bound, while the legacy CSS used inclusive `max-width: 640px`. That is off by 1 px at exactly 640 px, a common split-screen and emulator width.
  2. Custom variants are emitted **in declaration order**. So they are declared **widest to narrowest** (`max1200` … `max360`); ascending order made `max820:grid-cols-2 max560:grid-cols-1` show 2 columns at 360 px.
  3. Built-in `print:` is emitted *before* custom variants and loses to them, hence a custom `onprint` declared last.
- **[V2]** Four explicit breakpoints (`--breakpoint-*: initial` then sm/md/lg/xl), **mobile-first**, plus lint bans on physical `left/right` utilities (for RTL).
- **[ZELQANE] rule:**
  - Mobile-first with `sm: md: lg: xl:` only, redefined in `@theme`.
  - **Forbid** `max-*:` and arbitrary `min-[…]:`/`max-[…]:` so there is one direction and one scale. Keep `print:` only if no custom variants exist.
  - Adapt TF's script (same walk, comment stripping and helpful message) with `FORBIDDEN = /\b(max-(sm|md|lg|xl|2xl|\[[^\]]+\])|min-\[[^\]]+\]):/g`, and add a check that nothing outside `app/tokens/` contains a literal colour (V2 `design-rules.test.ts`).

---

## 4. UX patterns

### 4.1 Loading
- **[V2] `Skeleton`**: `aria-hidden`, `rounded-md bg-surface-3 motion-safe:animate-pulse`, sized by `className`. **The region being loaded sets `role="status" aria-busy="true" aria-label="Chargement…"`**, so a screen reader hears one sentence instead of one per rectangle. The shell skeleton mirrors the layout: `<Skeleton className="hidden h-full w-72 md:block"/><Skeleton className="h-full flex-1"/>`.
- **[TF]** Rules:
  - A Suspense fallback **must look like the gate it precedes** (same classes), so nothing flickers.
  - **No eternal spinner.** The auth check has a 3 s fallback, and e2e fails if "Chargement…" is still there after 1.5 s of network silence.
  - `MOCK_LATENCY_MS` exists specifically so loading states get seen in development.
- **[V2] `Button loading`**:
  - The label stays in place, with no layout jump. A spinner is added plus an `sr-only` "Chargement".
  - It sets `aria-busy` and `aria-disabled`, **not `disabled`**, so keyboard focus is kept. Clicks are swallowed, which prevents a double submit or double charge.
  - [TF] adds: when a button *is* disabled during submit, add a separate `<p className="sr-only" role="status">{busyLabel}</p>`, because a disabled button's name is never read.

### 4.2 Empty states
- **[V2] `EmptyState({icon, title, description, action})`**: dashed bordered block. The icon is `aria-hidden`. It emits **no heading element**, because the level depends on context and a wrong level is worse than none. There is one action (a Button or Link).
- **[TF e2e rule, `states.spec.ts`]**:
  - **EMPTY**: say what is empty, why, and what to do.
  - **LOADING**: say it is loading, and finish.
  - **ERROR**: plain language, never a code, and always leave a way out (at least one button or link).
- **[ZELQANE]** Examples: "Aucune campagne pour l'instant" with "Créez votre première campagne en 3 étapes" and a `Nouvelle campagne` button. For media: "Aucun média importé" with the formats and size limits, and an `Importer` button.

### 4.3 Toasts / notifications
- **[V2] Radix Toast** behind `ToastProvider` and `useToast().toast({title, description, variant:'info'|'success'|'danger', duration})`:
  - `role="status"` (polite), 5 s default, **paused while hovered or focused**.
  - Closable by the ✕ (labelled from the catalogue), Escape, or swipe.
  - The viewport is labelled "Notifications (F8)", placed at `fixed bottom-4 end-4 z-(--z-toast) w-[calc(100vw-2rem)] max-w-sm`.
  - Ids come from a ref, so `toast()` returns synchronously.
  - Variants are a start border colour (`border-s-4 border-s-danger`).
- **[TF]** has only an ad-hoc local toast (2.2 s timeout). Use V2's.
- Rules: toasts are for **confirmations of completed actions** ("Campagne soumise à la modération"). **Blocking errors stay inline** next to where they happened (`role="alert"`), never only in a toast.

### 4.4 Forms, validation, error display
- **[V2] `Field`** owns the ids and wires them through context:
  - `label htmlFor`, `aria-describedby` = hint id plus error id, `aria-invalid` when `error` is set, `aria-required`.
  - The required asterisk is `aria-hidden`.
  - The error is `<p role="alert" className="text-xs text-danger">`.
  - `Input`, `Textarea` and `Select` read the context (a `Select` without it had **no accessible name**, caught by axe).
  - `min-h-touch`, `aria-invalid:border-danger`, `dir="auto"` opt-in for user content.
- **[V2]** Forms use `noValidate` with `onSubmit={e => { e.preventDefault(); void store.login(...) }}`. **Server field errors** map into `Field error={fieldError(problem, 'email')}`. One `ProblemNotice role="alert"` sits above the form, rendered **once** by the card; no screen writes its own red box. The front does not re-implement validation it does not own.
- **[TF]** `autoComplete` is set everywhere (`username`, `current-password` vs `new-password`, `one-time-code`, `email`), and `inputMode="numeric"` for codes.
  - The password show/hide toggle has `aria-pressed` and `aria-label` and is **not** `tabIndex=-1` ("not sure what I typed is exactly when you don't have a mouse").
  - The auth error box is `role="alert" aria-live="assertive"`; the info notice is `role="status"`.
  - Enumeration-safe messaging: the same message for an unknown email and a wrong password.
  - Tell the truth: "Lost access? Ask an administrator" instead of a link to a recovery flow that does not exist.
- **[TF]** Controlled inputs in a notifying store must flush synchronously (`setInput`), or the caret jumps to the end. There is a regression test for it.
- **[ZELQANE]** Use `Field`/`Input` primitives plus light client checks for immediate feedback: required, email format, date range, file type and size before upload.
  - Validate with a zod schema **shared by client checks and for typing**, and always render Spring's `errors{field:msg}` mapped to French.
  - On submit error, **move focus to the first invalid field** or the error summary.
  - Keep the user's input. Never clear the form on error.

### 4.5 Optimistic UI
- **[TF]** Shows the opposite discipline for anything with consequences: *"Local state is cleared ONLY if the server confirmed. Showing 'it's private again' while the public page still answers would be the one lie this screen cannot afford."* Double-submit guards appear everywhere (`if (busy) return`).
- **[V2]** Money path: **amounts are read from the server order, never computed client-side** (an ESLint rule bans arithmetic in components that paint money).
- **[ZELQANE]**
  - Optimistic updates only for cheap, reversible actions (rename a draft, toggle a filter, mark a notification as read), with rollback plus an error toast.
  - **Never optimistic** for booking, payment, submission to moderation, or deleting media in use. Show a pending state until the server confirms.
  - Prices, taxes, availability and moderation status always come from the backend.

### 4.6 Accessibility
Both repos set **one global `:focus-visible` outline** (2 px, accent/focus token, offset 2 px). Everything else below.
- **Skip link [V2]**: the first tab stop, `sr-only`, visible when focused:
  `<a href="#main" className="sr-only rounded-md bg-accent px-4 py-2 text-accent-ink focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-(--z-toast)">Aller au contenu</a>`. The target is `<main id="main">`.
- **Structure (TF e2e)**: exactly **one `<h1>`**, exactly **one `<main>`**, `<html lang>` set (`fr` for ZELQANE; TF shipped `lang="en"` on a French UI), and **no skipped heading levels**. TF's `AuthScreen` renders `<main>` normally and `<section>` when embedded (a `<main>` cannot live in an `<aside>`).
- **Modals**:
  - [TF] `useModalFocus(active, panelRef, {initialFocusRef, onEscape})`: focus goes inside on open, Tab and Shift+Tab wrap, a focus that escaped is pulled back, focus **returns to the trigger** on close (if still connected), and Escape is captured and stops propagation so the top modal alone decides. The focusable filter uses no layout measurement, so it works in jsdom.
  - [V2] prefers **Radix Dialog**, which does all of this plus scroll lock and `aria-hidden` background. It needs a `DialogTitle`. Content uses `max-h-[calc(100dvh-2rem)] overflow-y-auto`.
- **Live regions**:
  - [TF] Never put `aria-live` on a streaming transcript, because every delta re-announces the whole reply. Use one `sr-only aria-live="polite" aria-atomic` line: a short status while working, then the final result **once**.
  - For ZELQANE: announce "Import terminé", "Modération : approuvé" and similar.
- **Icon buttons** need `aria-label`, and their SVGs are `aria-hidden`. Toggles use `aria-pressed`, disclosure buttons `aria-expanded`, and the active nav item `aria-current="page"`.
- **Decorative images** use `alt=""` and `draggable={false}` on the logo. Content images need meaningful `alt`.
- **Touch targets**: 44×44 px (`min-h-touch`). A dense exception is explicit via `data-dense-target` and still at least 24 px (WCAG 2.5.8). Inline links inside sentences are exempt.
- **Contrast**: [TF] records the measured ratio next to each `--faint` value, and [V2] computes AA for every text token in every theme in a test.
- **Drawer overlay** [V2]: a `<div aria-hidden onClick>`, not a `<button>`, which would be a silent tab stop. Escape closes. A **closed drawer must leave no focusable controls in tab order** (use `hidden`/`inert`; TF e2e checks this).

### 4.7 Responsive navigation
- **[V2] shell**: `flex h-dvh`. The sidebar wrapper is `hidden md:flex`, and when the drawer is open it becomes `fixed inset-y-0 start-0 z-(--z-modal) flex md:static`. The overlay is `fixed inset-0 bg-bg/70 md:hidden`, and Escape closes. A topbar hamburger toggles `ui.drawerOpen`.
- **[TF] mobile tab bar**: `<nav aria-label="Primary">` fixed to the bottom under 900 px. Pages reserve `padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom))`. Tabs use `aria-current="page"` and a shared `layoutId` indicator (framer-motion) that animates between tabs. Some routes open a panel instead of navigating, to keep state.
- Use `min-h-dvh`/`h-dvh`, not `100vh` (mobile browser bars). E2E checks **no horizontal overflow** at 375/390/412/768/820/1280/1440/1920 with hostile content (long names, long URLs, unbreakable words, Arabic, emoji).
- **[ZELQANE]**
  - Marketing: sticky top bar (brand red) with logo; desktop links; mobile hamburger → Radix Dialog sheet.
  - Client space: sidebar (Tableau de bord, Campagnes, Médias, Réseau, Factures, Profil) that becomes a drawer below `md`. Optionally a bottom tab bar with 4 items on phones.
  - `Nouvelle campagne` is the one primary CTA.

### 4.8 Motion (framer-motion)
- **[TF]** Shared presets live in `lib/motion-presets.ts`, so every modal opens the same way:
```ts
export const modalScrim: Variants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
export const modalPanel: Variants = { hidden: { opacity: 0, y: 12, scale: 0.98 }, visible: { opacity: 1, y: 0, scale: 1 } };
export const MODAL_SCRIM_DURATION = 0.15;
export const MODAL_PANEL_TRANSITION = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };
```
- **[TF] `use-reduced-motion.ts`** re-exports the hook so every animated component takes it from one place. **The global CSS reduced-motion rule does not cover framer-motion** (JS-driven inline styles), so every component collapses its own transition:
```ts
export function useReducedMotion(): boolean { return useFramerReducedMotion() ?? false; }
// usage
const reduce = useReducedMotion();
<AnimatePresence>{open && (
  <motion.div variants={modalScrim} initial="hidden" animate="visible" exit="hidden"
              transition={{ duration: reduce ? 0 : MODAL_SCRIM_DURATION }}> … </motion.div>)}</AnimatePresence>
<motion.button whileTap={reduce ? undefined : { scale: 0.92 }} />
<motion.span layoutId="navIndicator" transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }} />
```
- Short durations (0.15 to 0.22 s) with an ease-out curve `[0.16,1,0.3,1]`. Animate only `opacity` and `transform`. Decorative glows are "transform-only, GPU composited".
- **[V2]** uses no framer-motion at all. Its CSS `animate-ui-in` keyframes apply under `motion-safe:` only.
- **[ZELQANE]** Use CSS `motion-safe:` utilities for primitives (dialog, menu, toast). Use framer-motion for richer marketing moments (hero reveal, network map, stat counters, campaign wizard step transitions), `layoutId` tab indicators, and list enter/exit. Always go through `useReducedMotion`.

### 4.9 Error boundaries and 404
- **[TF + V2]** Ship `app/error.tsx` (client, `reset()` button), `app/global-error.tsx` (its own `<html><body>`, **inline styles only**, because globals.css may not have loaded), and `app/not-found.tsx` (themed, with a link home).
  - V2: never display `error.message` (it may carry internal detail). Show `error.digest` in monospace for support. Offer "Réessayer" (`reset()`) first and "Recharger la page" second. All text comes from the catalogue.
  - TF's reason for `not-found.tsx`: the built-in 404 is white whatever the theme, has no way back, and looks like a broken site.

### 4.10 i18n / copy
- **[V2]**
  - next-intl **without locale routing**: the locale is a cookie or account attribute, not a URL prefix.
  - `fr.json` and `ar.json` catalogues, namespaced like `auth.login.title` and `common.crash.retry`.
  - An **ESLint rule bans literal UI text** in `app/**/*.tsx` and `components/**/*.tsx`: JSX text, `aria-label`, `placeholder`, `title`, sentence-like strings. Tests and stories are exempt.
  - Formatting uses `Intl` only, with `INTL_TAG = { fr: 'fr-TN' }` ("DT" currency), `timeZone: 'Africa/Tunis'`, and a forced 24 h clock for French. Logical properties (`ps-`, `ms-`, `start-`, `border-s`) are enforced by lint for RTL.
- **[TF]** Tunisian dinar money is written with **3 decimals**, always the same way across the funnel ("29.500" vs "29.5" makes buyers doubt it is the same amount). Amounts are in integer **millimes**.
- **[ZELQANE]** The UI is French only today.
  - Keep all strings in `src/content/fr.ts` (typed object) or next-intl with `fr.json` if Arabic is likely. Write components with logical utilities from day one anyway; it costs nothing.
  - `<html lang="fr">`.
  - `lib/format.ts`: `formatTND(millimes)`, `formatDate` and `formatDateTime` (fr-TN, Africa/Tunis, h23), plus impression and audience counts via `Intl.NumberFormat('fr-TN', { notation: 'compact' })`.
  - Tone: short, active voice, second-person "vous". Tell the user what to do next.

---

## 5. Testing

### 5.1 Vitest and Testing Library
**[TF] `vitest.config.ts`**
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          testTimeout: 20_000 },   // default 5 s flaked userEvent tests under load; do not go higher
});
```
**[TF] `vitest.setup.ts`**
```ts
import '@testing-library/jest-dom/vitest';
// jsdom has no matchMedia; framer-motion calls it on mount. Answer TRUE for reduced motion:
// exits finish in the same tick → no races with waitForElementToBeRemoved, and a component that
// ignores the guard gets caught.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (q: string) => ({ matches: q.includes('prefers-reduced-motion'), media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}
```
V2 differences:
- `esbuild: { jsx: 'automatic' }` and a manual `@` alias.
- **MSW `setupServer`** (`mocks/server.ts`) shared with the browser worker.
- A `renderUi()` helper that wraps providers (intl, toast), sets `<html dir>`, returns a `user = userEvent.setup()`, and **keeps providers on `rerender`**.
- `hookTimeout` is raised for suites that build.

What gets unit tested (both repos):
- **lib**: api client (token storage priority, `ApiError` message fallback per status family, timeout becomes `ApiTimeoutError`, HTML body not promoted), stores (pure state transitions), filters and formatters (money in millimes, dates), preview-gate crypto.
- **Components via roles and labels** (`getByRole('button', {name})`, `getByLabelText`), never class selectors. Stubbed `fetch` (`vi.stubGlobal`) or MSW, with **every background call answered** so there is no unhandled rejection.
- **UI primitive contracts [V2]**: `type="button"` by default; fires on click and Enter; disabled is not tabbable; loading keeps focus, sets `aria-busy`, swallows clicks; `asChild` passes classes to a link; variants use token utilities only (no `#hex`, `rgb(`, `pl-`/`ml-`).
- **Regression tests named after the bug** ("keeps the caret in place when editing the middle of a value (regression: used to jump to the end)").
- **Static-file tests [TF/V2]**: theme token parity, no literal colours outside tokens, Tailwind palette deleted, AA contrast per token pair. Proof-of-bite probes: the lint rule is run in memory on bad samples, so a guard that stopped biting fails.

### 5.2 Playwright, axe, geometry
**[TF] `playwright.config.ts` (condensed, the one to copy)**
```ts
const PORT = Number(process.env.E2E_PORT || 4310);
const BASE_URL = process.env.E2E_BASE_URL || `http://127.0.0.1:${PORT}`;
const isCI = !!process.env.CI;
export default defineConfig({
  testDir: './e2e', timeout: 45_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' } },
  forbidOnly: isCI, retries: isCI ? 1 : 0, workers: isCI ? 2 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }], ['list']] : [['list'], ['html', { open: 'never' }]],
  use: { baseURL: BASE_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off',
         locale: 'fr-FR', timezoneId: 'Africa/Tunis' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }, testIgnore: /visual\.spec\.ts/ },
    { name: 'firefox', use: devices['Desktop Firefox'], testMatch: /journeys\/.*\.spec\.ts|smoke\.spec\.ts/ },
    { name: 'webkit',  use: devices['Desktop Safari'],  testMatch: /journeys\/.*\.spec\.ts|smoke\.spec\.ts/ },
    { name: 'mobile-chrome', use: devices['Pixel 5'],   testMatch: /journeys\/.*\.spec\.ts|smoke\.spec\.ts|layout\.spec\.ts/ },
    { name: 'mobile-safari', use: devices['iPhone 12'], testMatch: /journeys\/.*\.spec\.ts|smoke\.spec\.ts/ },
    { name: 'visual', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }, testMatch: /visual\.spec\.ts/ },
  ].filter(p => p.name === 'visual' ? !!process.env.E2E_VISUAL : true),   // pixel refs are OS-bound → opt-in
  webServer: { command: 'npm run start:e2e', url: BASE_URL, reuseExistingServer: !isCI, timeout: 180_000,
               env: { BACKEND_MODE: 'mock' } },   // second belt: the browser fixture intercepts first
});
```
Decisions TF documents:
1. Test a **production build** (`next start`), never `next dev`, which double-mounts and skips minification. Hydration, misplaced `'use client'` and middleware bugs only show in production.
2. **Network is cut.** A test that depends on a deployed backend is an availability probe.
3. Pixel snapshots are OS-specific, so CI runs **geometry** checks instead.
4. Secondary browsers run only journeys and smoke, not the full suite.

V2 notes: `output:'standalone'` refuses `next start`, so V2 runs `node .next/standalone/server.js` via a script. Also set `testIgnore` so Playwright does not pick up vitest files in `e2e/`.

**[TF] fixtures (`e2e/fixtures/test.ts`)**: `base.extend` adds three fixtures.
- **`api`**: intercepts `**/api/**`. `on(route|prefix*|RegExp, {status,json,body,delayMs,abort} | fn, method)`, plus `calls()`, `unmocked()`, `countOf(prefix)`, `reset()`. There are default handlers for boot calls. **Unmocked calls always answer immediately and are recorded**, so nothing hangs and nothing is silent.
- **`runtime`** (on by default): the test **fails on any uncaught exception, promise rejection, console error, or failed asset**, apart from a short justified allowlist. It supports `allow(re)` and `disable()`. The failure message lists the errors verbatim.
- **`a11y`**:
```ts
const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
expect(results.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0,4).map(n => n.target.join(' ')) })),
       'Violations d’accessibilité').toEqual([]);   // zero, no global threshold (a threshold hides new violations behind old ones)
```
- **Helpers**:
  - `expectNoHorizontalOverflow(page)`: `scrollWidth <= clientWidth+2` and lists offenders.
  - `expectTouchTargets(page, {minimum:44, ignore:['[data-dense-target]']})`: only on `hasTouch` projects, exempting inline links in sentences and using the `<label>` rect for checkboxes.
  - `expectVisibleFocusRing(page, steps)`: injects `transition:none`, then Tab. It compares focused vs blurred computed outline/box-shadow/border/bg on the element **and 3 ancestors** (`:focus-within` rings).
  - `waitForApp(page)`: polls until known boot texts ("Chargement…", "Vérification de la session…") are gone. **Not `networkidle`**, which never settles with polling and settles too early with timers.

**Spec files [TF]**:
- `smoke.spec.ts`: every route returns <400, renders expected text of more than 40 chars, 404 shows no stack trace, reload on a nested route keeps the page, **boot does not call the same endpoint twice** (`api.countOf('/api/auth/status') <= 1`).
- `a11y.spec.ts`: axe on each surface and theme; keyboard-only primary action; Escape closes a dialog and **focus returns to the opener**; Tab stays inside the modal; one h1, one main, lang, no heading jumps; a live region exists.
- `states.spec.ts`: backend 503 on all `/api` (no technical text via `TECHNICAL_LEAK` regex `4xx|5xx|TypeError|Failed to fetch|[object Object]|undefined is not…`, and at least one control); network aborted (not stuck on loading); slow 1.5 s (never blank, then finishes); brand-new account (empty states explain); malformed bodies `{}`, `[]`, `null`, HTML (no error boundary).
- `layout.spec.ts`: overflow grid of 8 viewports × pages; touch targets; hostile content; closed drawer leaves no focusables.
- `journeys/*.spec.ts`: auth, payments, settings, and so on.

**[ZELQANE] journeys to write**: visitor → tarifs → inscription → connexion (redirects back to `next`); create campaign wizard (zone, supports, dates, budget → recap → submit); media upload (type and size errors, progress, moderation pending, rejected with reason); campaign detail stats; invoices; session expiry mid-wizard (redirect, then return with the draft preserved).

---

## 6. Quality gates
- **[TF] scripts**: `typecheck: tsc --noEmit`, `check:breakpoints`, `check:billing-ui`, `test: vitest run`, `test:e2e`, and the aggregate **`check` = typecheck && custom guards && unit tests**, run in CI before deploy (deploy is gated on green CI, which is why flakes are treated as blockers). `next.config` sets `eslint.ignoreDuringBuilds: true` and the `lint` script is `next lint` with **no eslint installed**, so lint is effectively absent in TF. Do not copy that.
- **[V2]**:
  - Root `check` = `typecheck && lint && lint:imports && format:check && test`.
  - **ESLint flat config**: `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`, `projectService: true`, `no-floating-promises` and `no-misused-promises` as errors ("a floating promise is how 'the charge succeeded' gets reported before it did"), `switch-exhaustiveness-check`, `no-unused-vars` with the `^_` ignore.
  - `no-restricted-syntax` groups: **no `dangerouslySetInnerHTML`/`innerHTML`/`srcDoc`**, **no physical left/right utilities**, **no literal colours or Tailwind palette names or arbitrary colour values** outside `tokens/`, **no literal UI text** in components.
  - The **TS base** adds `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`/`noUnusedParameters`, `noFallthroughCasesInSwitch` and `verbatimModuleSyntax` on top of `strict`.
  - **Prettier** `.prettierrc.json`: `{ "semi": true, "singleQuote": false, "trailingComma": "all", "printWidth": 80, "tabWidth": 2, "endOfLine": "lf" }`.
  - **Husky**: `pre-commit` runs `lint-staged` (`*.{ts,tsx}` → `eslint --fix` + `prettier --write`; `*.{json,md,css}` → prettier) plus gitleaks, warning loudly if it is not installed. `commit-msg` runs commitlint (`@commitlint/config-conventional`, `body-max-line-length: 0`).
  - Next config: `reactStrictMode: true`, `poweredByHeader: false`, `output: 'standalone'`.
- **[ZELQANE] gates**:
  - `check` = `typecheck` + `lint` + `format:check` + `check:breakpoints` + `check:tokens` + `test`.
  - CI: `check` → `build` → `test:e2e` (chromium plus mobile-chrome on PR; full matrix nightly).
  - tsconfig: V2's strict flags (at least `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`; `exactOptionalPropertyTypes` is optional because it is noisy with third-party props).
  - Add `eslint-plugin-jsx-a11y` (neither repo lints a11y statically; they rely on axe e2e). This is an addition, not observed.
  - Prettier: pick one quote style. `prettier-plugin-tailwindcss` sorts classes (not in the references; optional).

---

## 7. Recommended `package.json` for the ZELQANE frontend
Versions follow tukai-frontend where it has the package. Radix, MSW, ESLint, Prettier, Husky and commitlint versions come from V2. Removed from TF: `three` and `@types/three` (no 3D), `@opennextjs/cloudflare`, `wrangler`, `esbuild` (Cloudflare tooling). Deploy ZELQANE with `output: 'standalone'` in Docker next to the Spring backend, matching the repo's existing Docker Compose.
```json
{
  "name": "zelqane-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "start:e2e": "next start -p 4310",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check:breakpoints": "node scripts/check-breakpoints.mjs",
    "check:tokens": "node scripts/check-tokens.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "check": "npm run typecheck && npm run lint && npm run format:check && npm run check:breakpoints && npm run check:tokens && npm run test",
    "prepare": "husky"
  },
  "dependencies": {
    "next": "^15.5.20",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "framer-motion": "^12.42.2",
    "radix-ui": "^1.6.7",
    "zod": "^4.1.0"
  },
  "devDependencies": {
    "@axe-core/playwright": "^4.13.0",
    "@commitlint/cli": "^19.6.1",
    "@commitlint/config-conventional": "^19.6.0",
    "@eslint/js": "^9.18.0",
    "@next/eslint-plugin-next": "^15.5.0",
    "@playwright/test": "^1.62.1",
    "@tailwindcss/postcss": "^4.3.3",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^7.0.0",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^24.3.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^6.0.4",
    "eslint": "^9.18.0",
    "eslint-plugin-jsx-a11y": "^6.10.2",
    "eslint-plugin-react-hooks": "^5.2.0",
    "husky": "^9.1.7",
    "jsdom": "^30.0.0",
    "lint-staged": "^15.4.1",
    "msw": "^2.15.0",
    "prettier": "^3.4.2",
    "prettier-plugin-tailwindcss": "^0.6.14",
    "tailwindcss": "^4.3.3",
    "typescript": "^5.8.2",
    "typescript-eslint": "^8.21.0",
    "vite-tsconfig-paths": "^6.1.1",
    "vitest": "^4.1.10"
  },
  "lint-staged": {
    "*.{ts,tsx,js,mjs}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css,yml,yaml}": ["prettier --write"]
  },
  "msw": { "workerDirectory": ["public"] }
}
```
Notes:
- `radix-ui` (unified package, V2) supplies Dialog, DropdownMenu, Tabs, Toast, Select and Slot. Accessible behaviour comes for free, and styling is ours via tokens.
- `zod` is **not** in either reference. It is included for the campaign wizard and upload forms and shared schemas. Drop it if forms stay trivial.
- Next 15.5 matches TF. V2 already runs Next 16.3 (`next build --webpack`, `agentRules:false`). If you start on 16, note that `next lint` is gone (use the ESLint CLI as above) and pin `@next/eslint-plugin-next` to the same major.
- Optional: `@storybook/nextjs-vite@10.5.10` (V2) if a component catalogue is wanted for the jury or demo. `next-intl@^4.13.7` if Arabic is planned.
- Also verify the exact published versions of `eslint-plugin-jsx-a11y`, `eslint-plugin-react-hooks` and `prettier-plugin-tailwindcss` at install time; the references do not pin them.

Companion `next.config.ts`:
```ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  devIndicators: false,
  images: { remotePatterns: [] },      // add the media CDN/backend host for campaign creatives
  async redirects() { return []; },    // page routes only, never /api/* (TF warning)
};
export default nextConfig;
```

---

## 8. Pitfalls documented by these repos (avoid in ZELQANE)
1. **Reading env at module import** on edge or worker runtimes gives empty strings, so "all /api fails" with nothing pointing at the cause. Read inside the request [TF backend.ts].
2. **`NEXT_PUBLIC_*` is inlined at build.** Setting it at `next start` does nothing [V2 playwright.config]. Keep the backend URL server-side behind the bridge.
3. **Fail-closed defaults.**
   - [TF preview-gate] Gating on `VERCEL_ENV === 'production'` meant the gate opened on any other host. Use `NODE_ENV` (always `production` in a build), and let unknown flag values fall back to *closed*.
   - There must be no default signing secret; a missing key means no token is issued *and* none verifies.
   - A route that cannot sign must return an explicit JSON error, not throw a 500.
4. **Leaking technical text to users**: `Failed to fetch`, `signal is aborted without reason`, "Request failed (500)", a proxy's HTML page shown in a bubble, English backend messages. Translate at the client boundary and pin it with the `TECHNICAL_LEAK` e2e regex.
5. **Different failure causes must produce different messages** [TF LoginGate]. "Denied" vs "unreachable" vs "server misconfigured" said the same thing and sent people to fix the wrong thing. The retry action must actually re-run (an effect keyed on unchanged state does not).
6. **Double calls at boot** from unguarded effects double backend load. Use a `useRef` guard or a single provider, and assert with `api.countOf` [TF smoke].
7. **A provider mounted per page** loses state on navigation. Mount it once in the route-group layout. **Nested providers** create two session stores, where a login under one is invisible to the other; V2 `useOptionalStores` checks before creating one.
8. **God store with a Proxy that notifies on every assignment** [TF, called out by V2]. 192 fields share one channel: typing re-renders the finance dashboard, a forgotten `bump()` is a lost update, and ref-callback assignments cause infinite render loops. Use small immutable stores plus `useSyncExternalStore` selectors [V2 `createStore`/`select`/`useStoreSnapshot`], or plain component state with server data.
9. **Outside-click listener on `document`** [TF store.tsx]. Next hydrates the whole document, so React's delegated root *is* `document`, and `stopPropagation` does not stop same-node siblings. Menus open then immediately close. Listen on `window`.
10. **Controlled inputs updated asynchronously** make the caret jump to the end when editing mid-string. Update synchronously within the input event.
11. **Tailwind v4 gotchas** [TF MIGRATION.md]:
    - Arbitrary properties (`[border:0]`) are emitted **after** normal utilities and override them.
    - `border-b border-X` colours all four sides; use `border-b-X`.
    - Without preflight, `bg-none` does not reset the native button background.
    - `font-[var(--x,fallback)]` silently fails at the comma; use `[font-family:…]`.
    - `text-xs` also sets a 16 px line-height.
    - `rounded-full` is `calc(infinity*1px)`.
    - `-translate-x-1/2` writes the `translate` property, not `transform`.
    - A `@theme inline` token that references a variable with **the same name** (for example `next/font` `--font-sans`) is circular and falls back silently. Give next/font variables distinct names.
    - Custom variants are emitted in declaration order, so declare `max-*` from widest to narrowest (or avoid `max-*` entirely).
12. **`@theme` instead of `@theme inline`** freezes colours, so theme switching breaks. A token missing in one theme silently inherits another; add a parity test.
13. **Tailwind auto source detection** scanned `test/` and shipped probe classes into production CSS [V2]. Use `@import "tailwindcss" source(none)` plus explicit `@source`.
14. **Deleting CSS or classes** [TF]: grep `src/`, `e2e/` and `scripts/` *and* the other stylesheets, because half a rule often lives elsewhere. Also check whether a rule actually applies (specificity or import order) before migrating it.
15. **Global CSS order** is set by import order in `layout.tsx`. Importing feature CSS from a component puts it wherever chunking decides [TF]. For ZELQANE, avoid feature CSS files; use utilities plus tokens and a single `globals.css`.
16. **framer-motion ignores the CSS `prefers-reduced-motion` rule.** Guard in JS. jsdom lacks `matchMedia`, so mock it as reduced so exits are instant in tests.
17. **Flaky tests block delivery** [TF vitest timeout note]. Raise `testTimeout` to 20 s for userEvent under load, but not higher, or real hangs stop looking like hangs. Never raise a visual diff tolerance to silence a noisy screen; remove the noise source (live animations, sub-pixel AA).
18. **E2E against `next dev`** proves nothing about the shipped bundle. A running `next dev` also **overwrites** the production build that e2e starts [TF MIGRATION]. `output:'standalone'` refuses `next start`; run `node .next/standalone/server.js`, or keep `next start` for e2e without standalone [V2].
19. **`networkidle` waits** are unreliable. Wait for visible boot text to disappear.
20. **Focus-ring tests race CSS transitions.** Disable transitions before measuring. Also compare ancestors, because rings are often drawn with `:focus-within` on a container.
21. **Accessible name lost while busy.** A spinner that is `aria-hidden` inside a `disabled` button leaves the button nameless. Keep an `sr-only` label and a `role=status` line. Two different controls both named "Sign in" are indistinguishable to screen readers; give distinct names ("Aller à la connexion").
22. **`role="alert"` also matches Next's route announcer** in tests. Scope selectors [TF MIGRATION].
23. **`dangerouslySetInnerHTML`** is banned when any token is JS-readable [V2]. Render rich text through a sanitized pipeline. Theme scripts go as a text child built from constants.
24. **Next 16 writes `AGENTS.md`/`CLAUDE.md` into the app on `next dev`** unless `agentRules: false` [V2 next.config].
25. **Build must not depend on the backend** [V2 README]. `/pricing` fetching offers at build broke `next build` without backend env. For ZELQANE, fetch catalogue data (zones, supports, offers) at request time with `revalidate`, or client-side with a graceful "grille indisponible" state.
26. **Redirects in `next.config`** must target page routes only. Never rewrite `/api/*` paths that the bridge forwards [TF].
27. **Money**: never compute prices or totals client-side; read them from the server. Format TND with 3 decimals from integer millimes, identically on every screen.
28. **`useSearchParams` without a Suspense boundary** breaks the static build of that route. Wrap it, with a fallback identical to the loading gate.
