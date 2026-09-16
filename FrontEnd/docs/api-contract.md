# TPUB Backend: frontend API contract

Source of truth: `C:\Users\busin\Desktop\tpub\BackEnd` (Spring Boot **4.1.0**, Java 21, Spring Security, JJWT, Jackson 3, PostgreSQL + Flyway), plus `../.env.example` and `../docker-compose.yml`.
Everything below was read directly from the code. Anything marked **GAP** or **BUG** is something the frontend has to work around. Nothing in this doc is aspirational.

---

## 0. TL;DR for frontend builders

- Base URL: `http://localhost:8080`. No context path. Every business route starts with `/api/...`.
- Auth: `POST /api/auth/login` or `POST /api/auth/register` returns `{ token, email, nom, role, userId }`. Send `Authorization: Bearer <token>` on every other call. The token lasts **24 h** and there is **no refresh endpoint**.
- Roles: `"ADMINISTRATEUR" | "ANNONCEUR" | "OPERATEUR" | "SUPERVISEUR"`. Self-registration always creates an `ANNONCEUR`.
- CORS defaults to `http://localhost:4200` (Angular). For Next.js, set `CORS_ALLOWED_ORIGINS=http://localhost:3000` or proxy `/api` through Next rewrites. The proxy is recommended.
- **There is NO media upload endpoint and NO multipart endpoint at all.** There is also no campaign↔zone linking endpoint, no payment endpoint, no profile/me endpoint and no per-advertiser statistics. See §7.
- Status enums come back as **UPPERCASE strings**, with two exceptions that are lowercase: `AiReportResponse.aiStatus` and `DiffusionResponse.type`.
- Dates are `"YYYY-MM-DD"`. Times are `"HH:mm:ss"` and **must include seconds** for campaigns. Timestamps are ISO-8601 UTC strings. Money is a JSON number (TND).
- Unauthenticated calls to protected routes return **403 with an empty body**, not 401. Plan for both.

---

## 1. Infrastructure, CORS, auth, security

### 1.1 Server

| Item | Value | Source |
|---|---|---|
| Port | `${SERVER_PORT:8080}` | application.yml `server.port` |
| Context path | `/` (none) | `server.servlet.context-path: /` |
| Docker port | host `${SERVER_PORT:-8080}` → container 8080 | docker-compose `backend` |
| Profiles | `dev` (default), `docker`, (`prod` mentioned in .env but not defined) | application.yml |
| Health | `GET /actuator/health` (public) → `{"status":"UP"}` | management config |
| Swagger UI | `GET /swagger-ui.html` (public) | springdoc |
| OpenAPI JSON | `GET /v3/api-docs` (public) | springdoc |
| Multipart limits | `max-file-size: 100MB`, `max-request-size: 100MB` (configured but **unused**: there is no upload controller) | application.yml |
| Default Spring error body | `server.error.include-message: never`, `include-stacktrace: never` | application.yml |
| pgAdmin | `http://localhost:5050` | docker-compose |
| DB | postgres:16, db `tpub`, user `tpub_user` | .env.example |

Suggested frontend env: `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`, or a Next rewrite `/api/:path*` → `http://localhost:8080/api/:path*`. The rewrite avoids CORS completely.

### 1.2 CORS (`CorsConfig.java`)

- Env var: **`CORS_ALLOWED_ORIGINS`**. It binds to `tpub.cors.allowed-origins`, with default **`http://localhost:4200`** in both application.yml and .env.example.
- It is a comma-separated list, e.g. `CORS_ALLOWED_ORIGINS=http://localhost:3000,https://tpub.tn`. Don't put spaces in it. If the list is empty, the code falls back to `http://localhost:4200`.
- Allowed methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`. Allowed headers: `*`. `allowCredentials = true`. Applies to path `/**`.
- Origins must match exactly. `*` is not allowed with credentials.
- `OPTIONS /**` is `permitAll` in SecurityConfig, so preflight works.
- **Action:** the Next.js dev server runs on `:3000`, which is **not** allowed by default. Either set `CORS_ALLOWED_ORIGINS=http://localhost:3000` in `.env` or use a same-origin proxy.

### 1.3 JWT issuance and use

- The token is issued by `POST /api/auth/login` (200) and `POST /api/auth/register` (201). It is in the `token` field of the JSON body. There is **no cookie**.
- To use it, send the header exactly as `Authorization: Bearer <token>`. `JwtAuthenticationFilter` takes `substring(7)`.
- Algorithm: HMAC via `Keys.hmacShaKeyFor(JWT_SECRET bytes)`. The .env secret is 64 chars, which gives HS512. The default yml secret gives HS256. The client never needs to verify it.
- Claims:
  - `sub` = user email
  - `role` = `"ROLE_ANNONCEUR"`. Note the **`ROLE_` prefix in the JWT claim**, while `AuthResponse.role` has no prefix.
  - `iat`, `exp`
- Expiry: `JWT_EXPIRATION_MS`, default **86400000 (24 h)**. `JWT_REFRESH_EXPIRATION_MS` (7 days) is configured but **never used**: there are no refresh tokens and no refresh endpoint.
- Stateless: `SessionCreationPolicy.STATELESS`, CSRF disabled. There is **no logout endpoint**. To log out, drop the token client-side.
- Each request, the filter loads the user by email and checks `username == sub && !expired`. A deactivated user (`is_active=false`) is still authenticated by the filter, because it doesn't check `isEnabled`. They just can't log in again.
- Recommended client behaviour: decode `exp` (base64 payload) and proactively redirect to `/connexion` before expiry. Treat any 401/403 on a protected route while holding a token as "session expired".

**Gotchas in the filter:**

1. The filter parses **any** `Authorization: Bearer ...` header, **including on public routes**. If you send an expired or invalid token to `/api/auth/login`, JJWT throws inside the filter, and the request fails with an empty-body 403 or 500 instead of logging in. **Never attach the Authorization header to `/api/auth/*` calls.** Strip stale tokens before login.
2. Filter exceptions (expired token, bad signature, unknown user) are **not** handled by `GlobalExceptionHandler`. You get an empty body, typically 403.
3. Anonymous requests to protected routes are rejected by the security chain with the default entry point: **403, empty body**. No JSON and no 401.

### 1.4 Public vs protected routes (`SecurityConfig.java`, exact)

```java
PUBLIC_ENDPOINTS = {
  "/api/auth/**",
  "/api/diffusion/next",
  "/actuator/health",
  "/v3/api-docs/**",
  "/swagger-ui/**",
  "/swagger-ui.html"
};
.requestMatchers(PUBLIC_ENDPOINTS).permitAll()
.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
.anyRequest().authenticated()
```

On top of that, `@EnableMethodSecurity` adds per-method `@PreAuthorize("hasRole('X')")` / `hasAnyRole(...)`. When a role check fails for an authenticated user, `AccessDeniedException` is caught by the handler and returns **403 JSON** `{ timestamp, status: 403, message: "Access denied" }`.

**Consequence for the marketing site:** zones and supports are NOT public. An anonymous visitor can't list the screen network or the zones. The marketing pages have to use static/hard-coded content, or the backend has to add public endpoints (GAP).

### 1.5 Roles

Roles are seeded by Flyway `V1__init_schema.sql`:

| code (`RoleCode`) | name | description | permissions (informational only, NOT enforced) |
|---|---|---|---|
| `ADMINISTRATEUR` | Administrateur | Accès complet : validation, gestion et supervision | campaigns:read/write/validate, users:read/write, supports:read/write, zones:read/write, ai:read/validate, emergency:write, statistics:read, logs:read |
| `ANNONCEUR` | Annonceur | Client publicitaire : création de campagnes, réservation, suivi statistiques | campaigns:read/write, media:upload, reservations:read/write, statistics:read:own, profile:read/write |
| `OPERATEUR` | Opérateur | Supervision des supports et diffusions | supports:read, diffusion:read, statistics:read, emergency:read |
| `SUPERVISEUR` | Superviseur | Consultation, filtres avancés, suivi réservations | campaigns:read, supports:read, zones:read, reservations:read, statistics:read, ai:read, logs:read, search:advanced |

Only `@PreAuthorize` role checks are enforced. The `permissions` JSON is never read.

How roles reach the client is `AuthResponse.role`, a plain role code without a prefix:

```ts
export type RoleCode = "ADMINISTRATEUR" | "ANNONCEUR" | "OPERATEUR" | "SUPERVISEUR";

export interface AuthResponse {
  token: string;      // JWT
  email: string;
  nom: string;        // display name
  role: RoleCode;     // e.g. "ANNONCEUR" (no ROLE_ prefix)
  userId: number;     // users.id — NOT the clients.id used in CampaignResponse.clientId
}
```

There is no endpoint that returns the current user from a token. Persist `AuthResponse` minus the token, e.g. in localStorage or a cookie, at login.

---

## 2. Serialization conventions

| Java type | JSON | Notes |
|---|---|---|
| `Long`, `Integer`, `Short`, `long` | number | IDs are numbers |
| `BigDecimal` | number (e.g. `1500.00` → `1500.0`/`1500`) | budget/cost in TND; lat/lng |
| `LocalDate` | `"2026-06-01"` | |
| `LocalTime` | `"08:00:00"` | **CampaignRequest has `@JsonFormat(pattern="HH:mm:ss")`, so `"08:00"` is rejected with 400.** Reservation and Emergency requests accept `"08:00"` or `"08:00:00"`. Always send `HH:mm:ss`. An HTML `<input type="time">` gives `HH:mm`, so append `:00`. |
| `Instant` | `"2026-09-12T10:15:30.123456Z"` | createdAt, submittedAt, validatedAt, error timestamp |
| enum in request | exact UPPERCASE string | unknown value → 400 "Invalid request body…" |
| `null` fields | included as `null` | no `@JsonInclude(NON_NULL)` |

No pagination, sorting or filtering query params exist anywhere. All list endpoints return a plain JSON array of every row.

---

## 3. Enums (TypeScript)

Values are exact and match both the Java enums and the DB CHECK constraints.

```ts
// ---- Roles
export type RoleCode = "ADMINISTRATEUR" | "ANNONCEUR" | "OPERATEUR" | "SUPERVISEUR";

// ---- Campaign (CampaignResponse.status / aiStatus / adminStatus — UPPERCASE)
export type CampaignStatus =
  | "BROUILLON"          // draft (created / editable)
  | "PENDING_AI_CHECK"   // after POST /submit
  | "APPROVED_BY_AI"     // AI ok, awaiting admin
  | "REVIEW_REQUIRED"    // AI unsure, awaiting admin
  | "REJECTED_BY_AI"     // AI rejected (editable/deletable, but see BUG: cannot resubmit)
  | "VALIDATED_BY_ADMIN" // defined but NEVER set by any code path
  | "ACTIVE"             // admin validated
  | "TERMINATED"         // defined but NEVER set
  | "BLOCKED";           // admin rejected

export type CampaignAiStatus = "APPROVED" | "REVIEW_REQUIRED" | "REJECTED";   // null until AI check
export type CampaignAdminStatus = "PENDING" | "VALIDATED" | "REJECTED";       // null until admin decision ("PENDING" never set)

// ---- AI report (AiReportResponse.aiStatus — LOWERCASE!)
export type AiReportStatus = "approved" | "review_required" | "rejected";

// ---- Supports
export type SupportType = "ECRAN" | "PANNEAU_NUMERIQUE" | "POINT_WIFI" | "APPLICATION" | "SITE_WEB";
export type TechnicalStatus = "ACTIF" | "INACTIF" | "MAINTENANCE" | "HORS_LIGNE";

// ---- Reservations
export type ReservationStatus = "TEMPORAIRE" | "CONFIRMEE" | "ANNULEE" | "EXPIREE"; // EXPIREE never set
export type AvailabilityStatus = "DISPONIBLE" | "RESERVE" | "OCCUPE" | "MAINTENANCE" | "HORS_LIGNE";
// (reservations are always created with availabilityStatus "RESERVE")

// ---- Emergency
export type UrgencyLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ---- Diffusion (DiffusionResponse.type — LOWERCASE!)
export type DiffusionType = "publicite" | "urgence" | "defaut";

// ---- Internal only (not exposed by any DTO; listed for completeness)
export type MediaFileType = "IMAGE" | "VIDEO" | "BANNER";
export type AiContentType = "TEXTE" | "IMAGE" | "VIDEO" | "MINIATURE";
export type AiAdminDecision = "VALIDATED" | "REJECTED" | "PENDING";
export type AiDecisionType = "AI" | "ADMIN";
export type AiModerationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ClientValidationStatus = "PENDING" | "VALIDATED" | "REJECTED" | "SUSPENDED";
export type PaymentStatus = "SIMULATED" | "PENDING" | "COMPLETED" | "CANCELLED" | "FAILED";
export type DiffusionContentType = "PUBLICITE" | "URGENCE" | "DEFAUT";
```

Suggested French UI labels (the backend doesn't provide these):

| value | label |
|---|---|
| BROUILLON | Brouillon |
| PENDING_AI_CHECK | En attente d'analyse IA |
| APPROVED_BY_AI | Approuvée par l'IA |
| REVIEW_REQUIRED | Revue manuelle requise |
| REJECTED_BY_AI | Rejetée par l'IA |
| VALIDATED_BY_ADMIN | Validée par l'admin |
| ACTIVE | Active / En diffusion |
| TERMINATED | Terminée |
| BLOCKED | Refusée / Bloquée |
| TEMPORAIRE / CONFIRMEE / ANNULEE / EXPIREE | Temporaire / Confirmée / Annulée / Expirée |
| ECRAN / PANNEAU_NUMERIQUE / POINT_WIFI / APPLICATION / SITE_WEB | Écran / Panneau numérique / Point Wi-Fi / Application / Site web |
| ACTIF / INACTIF / MAINTENANCE / HORS_LIGNE | Actif / Inactif / Maintenance / Hors ligne |

---

## 4. Error responses (`GlobalExceptionHandler`)

Error bodies use two shapes. Keys come from a `HashMap`, so their order isn't guaranteed.

```ts
export interface ApiError {
  timestamp: string;   // ISO Instant, e.g. "2026-09-12T10:15:30.123Z"
  status: number;      // HTTP status code
  message: string;     // English message (see table)
}

export interface ApiValidationError extends ApiError {
  status: 400;
  message: "Validation failed";
  errors: Record<string, string>; // fieldName -> default Bean Validation message (English)
}
```

Example validation error for `POST /api/auth/register` with an empty body:

```json
{
  "timestamp": "2026-09-12T10:15:30.123Z",
  "status": 400,
  "message": "Validation failed",
  "errors": {
    "email": "must not be blank",
    "password": "must not be blank",
    "nom": "must not be blank"
  }
}
```

Only **one message per field** is kept, and it's the last one written. Default messages are Hibernate Validator English text: `"must not be blank"`, `"must not be null"`, `"must be a well-formed email address"`, `"size must be between 8 and 100"`, `"must be greater than or equal to 0"`. **Translate them client-side**, or better, validate client-side first with the same rules (e.g. zod).

| Trigger | Status | `message` |
|---|---|---|
| `ApiException` / `BadRequestException` (business rule) | 400 | specific text, e.g. `"Email already registered"`, `"Only draft campaigns can be submitted"` |
| `ResourceNotFoundException` | 404 | `"Campaign not found: 12"`, `"Zone not found: 3"`, `"Support not found: 5"`, `"Emergency message not found: 7"` |
| `MethodArgumentNotValidException` (`@Valid` failed) | 400 | `"Validation failed"` + `errors` |
| `HttpMessageNotReadableException` (malformed JSON, wrong enum, bad date/time format) | 400 | `"Invalid request body — use HH:mm:ss for times (e.g. \"08:00:00\")"` |
| `DataIntegrityViolationException` (DB CHECK/FK/UNIQUE/length) | 400 | `"Invalid data — check dates and times format"`. Also returned for non-date problems, e.g. deleting a zone that still has supports, or name > 200 chars |
| `BadCredentialsException` (wrong email/password) | 401 | `"Invalid email or password"` |
| `AccessDeniedException` (authenticated, wrong role) | 403 | `"Access denied"` |
| `MethodArgumentTypeMismatchException` (mistyped path/query param) | 400 | `"Invalid value for parameter: <name>"` |
| any other `Exception` | 500 | `"An unexpected error occurred"` |
| No/invalid/expired token on protected route | 403 (sometimes 500) | **empty body** (security filter, not the handler) |

Things that end up as **500 "An unexpected error occurred"** when you'd expect 4xx:
- missing query params, e.g. `/api/diffusion/next` without `supportId` (mistyped query/path params such as `/api/campaigns/abc` or `?from=abc` now return 400 `"Invalid value for parameter: <name>"`)
- unknown route (`NoResourceFoundException`) for an authenticated user
- wrong HTTP method
- login of a deactivated user (`DisabledException`)
- a non-ANNONCEUR (e.g. the admin) hitting an ANNONCEUR-only service path that needs a client profile. That one is actually 400 `"Client profile not found for current user"`.

Business error messages (all 400 unless noted):
- `"Email already registered"`
- `"Annonceur role not found"`
- `"User not found"`
- `"Client profile not found for current user"`
- `"Campaign cannot be modified in status: <STATUS>"`
- `"Only draft campaigns can be submitted"`
- `"Campaign is not eligible for AI analysis"`
- `"No AI report found for campaign: <id>"` (400, not 404)
- `"Campaign must be AI-analyzed before admin decision"`
- `"AI check required before admin decision"`
- `"Support already reserved for the selected period"`
- 404: `"Current user not found"`

Suggested fetch wrapper: parse JSON only if `content-type` includes `application/json` and the body is non-empty. Otherwise synthesize `{status, message: "Session expirée ou accès refusé"}`.

---

## 5. Endpoints

Legend: **Auth** = required role(s). "Any authenticated" means only a valid JWT is needed. All JSON endpoints use `Content-Type: application/json`.

### 5.1 Auth: `/api/auth` (public)

#### `POST /api/auth/register`
Creates a `users` row with role **ANNONCEUR** (`is_active=true`) and a `clients` row (`company_name = societe`, `trust_level 0`, `validation_status PENDING`). Returns a token right away, so the user is logged in.

```ts
export interface RegisterRequest {
  email: string;        // @NotBlank @Email ; DB unique, max 255
  password: string;     // @NotBlank @Size(min=8, max=100)
  nom: string;          // @NotBlank ; DB max 150
  societe?: string;     // optional ; DB max 200
  telephone?: string;   // optional ; DB max 30
  adresse?: string;     // optional ; TEXT
}
```
- **201** `AuthResponse`
- 400 validation, or `"Email already registered"`
- 400 `"Invalid data…"` if a DB length is exceeded

#### `POST /api/auth/login`
```ts
export interface LoginRequest {
  email: string;     // @NotBlank @Email
  password: string;  // @NotBlank
}
```
- **200** `AuthResponse`. Also updates `users.last_login_at`.
- 401 `"Invalid email or password"`
- 400 validation
- 500 if the account is deactivated
- Do not send an `Authorization` header (see §1.3).

---

### 5.2 Campaigns: `/api/campaigns`

```ts
export interface CampaignRequest {
  name: string;            // @NotBlank ; DB max 200
  objective?: string | null;   // optional TEXT — ALSO the main text analysed by the AI
  budget: number;          // @NotNull @PositiveOrZero ; NUMERIC(14,2), TND
  startDate?: string | null;   // "YYYY-MM-DD" optional ; no @Future ; DB CHECK start_date <= end_date
  endDate?: string | null;     // "YYYY-MM-DD" optional
  startTime?: string | null;   // "HH:mm:ss" STRICT (@JsonFormat) optional
  endTime?: string | null;     // "HH:mm:ss" STRICT optional
}

export interface CampaignResponse {
  id: number;
  clientId: number;            // clients.id (≠ AuthResponse.userId)
  name: string;
  objective: string | null;
  budget: number;
  consumedBudget: number;      // always 0 (nothing ever increments it)
  status: CampaignStatus;
  aiStatus: CampaignAiStatus | null;
  adminStatus: CampaignAdminStatus | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;    // "HH:mm:ss"
  endTime: string | null;
  estimatedViews: number;      // +1000 per reservation created
  priorityScore: number;       // always 0 (no endpoint sets it)
  createdAt: string;           // ISO instant
  submittedAt: string | null;
  validatedAt: string | null;
}
```

There are no `@Future` or date-order validations in the DTO. `startDate > endDate` fails at the DB with 400 `"Invalid data — check dates and times format"`. Validate client-side that `startDate >= today`, `endDate >= startDate` and `endTime > startTime`.

| Method & path | Auth | Body | Response | Codes / rules |
|---|---|---|---|---|
| `POST /api/campaigns` | ANNONCEUR | `CampaignRequest` | `CampaignResponse` | **201**. Status starts at `BROUILLON`. 400 validation. 400 `"Client profile not found for current user"` if the caller has no client row. |
| `GET /api/campaigns` | ADMINISTRATEUR, SUPERVISEUR | none | `CampaignResponse[]` (all campaigns) | 200 |
| `GET /api/campaigns/mine` | ANNONCEUR | none | `CampaignResponse[]` (campaigns of the caller's client) | 200. Unsorted: sort client-side by `createdAt`. |
| `GET /api/campaigns/{id}` | ANNONCEUR, ADMINISTRATEUR, SUPERVISEUR | none | `CampaignResponse` | 200, 404. **No ownership check**: any annonceur can read any campaign by id. |
| `PUT /api/campaigns/{id}` | ANNONCEUR | `CampaignRequest` (full replace; omitted optional fields become `null`) | `CampaignResponse` | 200. 400 `"Campaign cannot be modified in status: X"` unless status is `BROUILLON` or `REJECTED_BY_AI`. 404. No ownership check. Doesn't change status. |
| `DELETE /api/campaigns/{id}` | ANNONCEUR | none | empty | **204**. Same editable rule (BROUILLON or REJECTED_BY_AI). DB cascades delete reservations, media and AI checks. No ownership check. |
| `POST /api/campaigns/{id}/submit` | ANNONCEUR | none | `CampaignResponse` | 200. Requires `BROUILLON`, else 400 `"Only draft campaigns can be submitted"`. Sets `status=PENDING_AI_CHECK` and `submittedAt=now`. **Does NOT run the AI**: call `POST /api/ai/check-content/{id}` next. |

---

### 5.3 AI moderation: `/api/ai`

```ts
export interface AiReportResponse {
  campaignId: number;
  aiStatus: "approved" | "review_required" | "rejected"; // LOWERCASE
  riskScore: number;       // 0..100
  qualityScore: number;    // 0..100
  detectedIssues: string[]; // French strings, e.g. ["texte ambigu", "budget insuffisant"]
  recommendation: string | null; // French, e.g. "Contenu conforme pour diffusion"
}
```

| Method & path | Auth | Body | Response | Codes / rules |
|---|---|---|---|---|
| `POST /api/ai/check-content/{campaignId}` | ANNONCEUR, ADMINISTRATEUR | none | `AiReportResponse` | 200. Campaign status must be `PENDING_AI_CHECK` **or `BROUILLON`**, else 400 `"Campaign is not eligible for AI analysis"`. 404 if the campaign is missing. **Synchronous**: it may take several seconds when OpenAI is on (show a loader). Updates the campaign and saves the check and an AI decision log. |
| `GET /api/ai/report/{campaignId}` | ANNONCEUR, ADMINISTRATEUR, SUPERVISEUR | none | `AiReportResponse` (latest check) | 200. **400** (not 404) `"No AI report found for campaign: id"` if never analysed. |

What the AI analysis does:
- **OpenAI path** runs when `OPENAI_ENABLED=true` and `OPENAI_API_KEY` is non-blank. It uses model `OPENAI_MODEL` (default `gpt-4o-mini`) and sends name, objective, budget, dates, estimated views and the media list. A risk score ≤30 gives APPROVED, 31–70 gives REVIEW_REQUIRED, >70 gives REJECTED. Unparseable output falls back to `REVIEW_REQUIRED`, 50/50, `["réponse IA invalide"]`.
- **Local fallback** runs when OpenAI isn't configured or the call fails. The default is `APPROVED`, risk 20, quality 75, recommendation `"Contenu conforme pour diffusion"`.
  - If `objective` contains `"gratuit"` or `"garanti"`: `REVIEW_REQUIRED`, risk 62, quality 74, issue `"texte ambigu"`, recommendation `"Vérification manuelle avant diffusion"`.
  - If `budget <= 0`: `REVIEW_REQUIRED`, risk ≥55, issue `"budget insuffisant"`.
  - **Demo tip:** put "gratuit" in the objective to trigger manual review, or use a normal text for auto-approval. The .env.example key `sk-your-openai-api-key-here` is non-blank, so the backend will try OpenAI, fail and fall back locally. That works, but it's slower.
- Campaign mapping: `APPROVED` sets `status=APPROVED_BY_AI, aiStatus=APPROVED`. `REVIEW_REQUIRED` sets `status=REVIEW_REQUIRED, aiStatus=REVIEW_REQUIRED`. `REJECTED` sets `status=REJECTED_BY_AI, aiStatus=REJECTED`.

---

### 5.4 Admin decision: `/api/admin/campaigns`

| Method & path | Auth | Params | Response | Codes / rules |
|---|---|---|---|---|
| `POST /api/admin/campaigns/{campaignId}/validate` | ADMINISTRATEUR | none | `CampaignResponse` | 200. Requires status `APPROVED_BY_AI` or `REVIEW_REQUIRED`, else 400 `"Campaign must be AI-analyzed before admin decision"`. Sets `adminStatus=VALIDATED`, `status=ACTIVE` (not VALIDATED_BY_ADMIN) and `validatedAt=now`. **All existing reservations of the campaign become `CONFIRMEE`.** 404 if missing. |
| `POST /api/admin/campaigns/{campaignId}/reject?reason=...` | ADMINISTRATEUR | query `reason` (optional string, **query param, not a body**) | `MessageResponse` `{ message: "Campaign rejected successfully" }` | 200. Same status precondition. Sets `adminStatus=REJECTED` and `status=BLOCKED`. All reservations become `ANNULEE`. The reason is stored in `ai_decision_logs`, but **no endpoint returns it** to the annonceur. |

```ts
export interface MessageResponse { message: string; }
```

There's no admin endpoint to list campaigns pending review. Use `GET /api/campaigns` and filter `status in ["APPROVED_BY_AI","REVIEW_REQUIRED"]`.

---

### 5.5 Zones: `/api/zones`

```ts
export interface ZoneRequest {
  name: string;          // @NotBlank ; DB max 150
  latitude: number;      // @NotNull ; DB CHECK -90..90 ; NUMERIC(10,7)
  longitude: number;     // @NotNull ; DB CHECK -180..180
  radiusKm?: number | null;  // optional ; DB CHECK > 0 if set
  isActive?: boolean | null; // optional ; create default true ; on update null = unchanged
}

export interface ZoneResponse {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number | null;
  isActive: boolean;
}
```

| Method & path | Auth | Body | Response | Codes |
|---|---|---|---|---|
| `POST /api/zones` | ADMINISTRATEUR | `ZoneRequest` | `ZoneResponse` | **201**, 400 |
| `GET /api/zones` | ANNONCEUR, ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | none | `ZoneResponse[]` | 200 |
| `GET /api/zones/active` | same four roles | none | `ZoneResponse[]` (isActive=true) | 200. **Use this in the annonceur booking UI.** |
| `GET /api/zones/{id}` | same four roles | none | `ZoneResponse` | 200, 404 |
| `PUT /api/zones/{id}` | ADMINISTRATEUR | `ZoneRequest` (name/lat/lng/radiusKm replaced; isActive only if non-null) | `ZoneResponse` | 200, 400, 404 |
| `DELETE /api/zones/{id}` | ADMINISTRATEUR | none | empty | **204**, 404. 400 `"Invalid data…"` if supports or reservations reference the zone (FK). |

---

### 5.6 Supports (screens): `/api/supports`

```ts
export interface SupportRequest {
  zoneId: number;                 // @NotNull ; must exist (404 "Zone not found")
  name: string;                   // @NotBlank ; DB max 150
  supportType: SupportType;       // @NotNull
  latitude: number;               // @NotNull ; -90..90
  longitude: number;              // @NotNull ; -180..180
  technicalStatus?: TechnicalStatus | null; // optional ; default "ACTIF" ; on update null = unchanged
  diffusionCapacity?: number | null;        // optional short ; default 1 ; DB CHECK > 0 ; on update null = unchanged
  // Porteur fields (Flyway V2) — all optional ; on create omitted = null ; on update null = unchanged (cannot be cleared)
  porteurType?: PorteurType | null; // @Pattern ^[ABCD]$ → 400 "must be one of A, B, C, D"
  mastHeightM?: MastHeight | null;  // allowed 15|20|25|30 → 400 "must be one of 15, 20, 25, 30"
  headingDeg?: number | null;       // @Min(0) @Max(359) ; main screen face direction, 0 = north, clockwise
  address?: string | null;          // @Size(max=255) ; trimmed ; blank string clears it (exception to null = unchanged)
}

export type PorteurType = "A" | "B" | "C" | "D";
export type MastHeight = 15 | 20 | 25 | 30;

export interface SupportResponse {
  id: number;
  zoneId: number;
  zoneName: string;
  name: string;
  supportType: SupportType;
  latitude: number;
  longitude: number;
  technicalStatus: TechnicalStatus;
  diffusionCapacity: number;
  porteurType: PorteurType | null;  // null = not declared (UI infers « typologie estimée »)
  mastHeightM: number | null;
  headingDeg: number | null;
  address: string | null;
}

export interface SupportAvailabilitySlot {   // no campaign / client / cost data
  startDate: string;   // "YYYY-MM-DD"
  endDate: string;
  startTime: string;   // "HH:mm:ss"
  endTime: string;
  reservationStatus: "TEMPORAIRE" | "CONFIRMEE";
}
```

| Method & path | Auth | Body | Response | Codes |
|---|---|---|---|---|
| `POST /api/supports` | ADMINISTRATEUR | `SupportRequest` | `SupportResponse` | **201**, 400, 404 (zone) |
| `GET /api/supports` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR, ANNONCEUR | none | `SupportResponse[]` | 200 |
| `GET /api/supports/zone/{zoneId}` | same four roles | none | `SupportResponse[]` | 200. Empty array if the zone is unknown (no 404). |
| `GET /api/supports/{id}` | same four roles | none | `SupportResponse` | 200, 404 |
| `PUT /api/supports/{id}` | ADMINISTRATEUR | `SupportRequest` | `SupportResponse` | 200, 400, 404 |
| `GET /api/supports/{id}/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` | same four roles | none | `SupportAvailabilitySlot[]` | 200 (empty array if free). `from` defaults to today, `to` to `from`+90 days. Returns the TEMPORAIRE/CONFIRMEE reservations on that support overlapping `[from, to]` (inclusive), sorted by startDate. 404 `"Support not found: id"`, 400 `"'to' must be on or after 'from'"`, 400 `"Invalid value for parameter: from"` for a malformed date. |

There's **no DELETE for supports**. `visibilityScore` exists in the DB but isn't exposed. Availability mirrors the reservation conflict rule: overlap is by **date range only** (times ignored), so any day covered by a returned slot is unavailable for the whole day on that support.

**Flyway `V2__porteur_fields.sql`** (additive, all nullable) adds to `diffusion_supports`: `porteur_type VARCHAR(1)` CHECK A–D, `mast_height_m SMALLINT` CHECK IN (15,20,25,30), `heading_deg SMALLINT` CHECK 0–359, `address VARCHAR(255)`. Existing rows keep nulls until an admin (or `scripts/seed-demo.mjs`) fills them.

---

### 5.7 Reservations: `/api/reservations`

```ts
export interface ReservationRequest {
  campaignId: number;  // @NotNull ; must exist (404)
  zoneId: number;      // @NotNull ; must exist (404)
  supportId: number;   // @NotNull ; must exist (404)
  startDate: string;   // @NotNull "YYYY-MM-DD" ; DB CHECK start_date <= end_date
  endDate: string;     // @NotNull
  startTime: string;   // @NotNull "HH:mm:ss" (HH:mm tolerated) ; DB CHECK start_time < end_time
  endTime: string;     // @NotNull
}

export interface ReservationResponse {
  id: number;
  campaignId: number;
  zoneId: number;
  supportId: number;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  availabilityStatus: AvailabilityStatus;  // always "RESERVE" on creation
  reservationStatus: ReservationStatus;    // "TEMPORAIRE" on creation
  estimatedViews: number;                  // always 1000
  estimatedCost: number;                   // campaign.budget * 0.1 (TND)
}
```

| Method & path | Auth | Body | Response | Codes / rules |
|---|---|---|---|---|
| `POST /api/reservations` | ANNONCEUR | `ReservationRequest` | `ReservationResponse` | **201**. 400 `"Support already reserved for the selected period"` if any TEMPORAIRE or CONFIRMEE reservation on the same support overlaps **by date range** (times are ignored for the conflict check). 400 `"Invalid data…"` if dates or times are inverted. 404 for unknown campaign, zone or support. Adds 1000 to `campaign.estimatedViews`. **No checks** for campaign ownership, campaign status, support belonging to zone, or support technical status. |
| `GET /api/reservations` | ADMINISTRATEUR, SUPERVISEUR | none | `ReservationResponse[]` | 200 |
| `GET /api/reservations/campaign/{campaignId}` | ANNONCEUR, ADMINISTRATEUR, SUPERVISEUR | none | `ReservationResponse[]` | 200 (empty array if none or unknown). No ownership check. |

There's no endpoint to cancel or update a reservation and no support name in the response. Check availability before booking with `GET /api/supports/{id}/availability` (§5.6). Join client-side with `GET /api/supports` and `GET /api/zones`.

---

### 5.8 Statistics: `/api/statistics`

```ts
export interface DashboardResponse {
  totalCampaigns: number;        // count of ALL campaigns (platform-wide)
  activeCampaigns: number;       // status ACTIVE
  pendingCampaigns: number;      // PENDING_AI_CHECK + REVIEW_REQUIRED
  aiPendingCampaigns: number;    // PENDING_AI_CHECK
  aiRejectedCampaigns: number;   // REJECTED_BY_AI
  availableSupports: number;     // supports with technicalStatus ACTIF
  confirmedReservations: number; // reservationStatus CONFIRMEE
  totalViews: number;            // COUNT(diffusion_logs) — includes "defaut" and "urgence" plays
  estimatedBudget: number;       // SUM(campaign.budget) all campaigns
  consumedBudget: number;        // SUM(consumed_budget) — always 0
}
```

| Method & path | Auth | Response | Codes |
|---|---|---|---|
| `GET /api/statistics/dashboard` | ADMINISTRATEUR, SUPERVISEUR, ANNONCEUR, OPERATEUR | `DashboardResponse` | 200 |

**BUG/GAP:** an ANNONCEUR gets **platform-wide** numbers, not their own. For the client space, compute per-advertiser KPIs client-side from `GET /api/campaigns/mine` plus `GET /api/reservations/campaign/{id}`: count by status, sum budget, sum `estimatedViews`, sum `estimatedCost`. There's no per-campaign diffusion or impression count endpoint. The `statistics` table exists but nothing writes to it or reads it.

---

### 5.9 Emergency messages: `/api/emergency` (admin/ops, not for annonceurs)

```ts
export interface EmergencyRequest {
  title: string;           // @NotBlank ; DB max 200
  content: string;         // @NotBlank
  zoneId: number;          // @NotNull ; 404 if unknown
  startDate: string;       // @NotNull "YYYY-MM-DD" ; DB CHECK start <= end
  endDate: string;         // @NotNull
  startTime?: string | null;       // optional "HH:mm:ss" (stored, NOT used by diffusion)
  endTime?: string | null;         // optional
  durationSeconds?: number | null; // optional short ; diffusion default 15
  priority?: number | null;        // optional short ; default 1 ; DB CHECK >= 1 ; LOWER = shown first
  urgencyLevel?: UrgencyLevel | null; // optional ; default "HIGH"
}

export interface EmergencyResponse {
  id: number;
  title: string;
  content: string;
  zoneId: number;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  priority: number;
  urgencyLevel: UrgencyLevel;
  isActive: boolean;
  // NOTE: durationSeconds is NOT returned
}
```

| Method & path | Auth | Body | Response | Codes |
|---|---|---|---|---|
| `POST /api/emergency` | ADMINISTRATEUR | `EmergencyRequest` | `EmergencyResponse` | **201**, 400, 404 |
| `GET /api/emergency` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | none | `EmergencyResponse[]` | 200 |
| `POST /api/emergency/{id}/deactivate` | ADMINISTRATEUR | none | `EmergencyResponse` (isActive=false) | 200, 404 |

---

### 5.10 Diffusion (player/device): `/api/diffusion` (PUBLIC)

#### `GET /api/diffusion/next?supportId={id}&datetime={ISO}&zone={name}`
| Query param | Type | Required | Notes |
|---|---|---|---|
| `supportId` | number | **yes** | 404 `"Support not found: id"` |
| `datetime` | ISO local date-time `2026-09-12T14:30:00` | **yes** | no timezone suffix. Missing → 500 |
| `zone` | string | no | **ignored** by the service |

```ts
export interface DiffusionResponse {
  type: "publicite" | "urgence" | "defaut";
  campaignId: number | null;  // null for urgence/defaut
  title: string;              // campaign name | emergency title | "TPUB - Contenu par defaut"
  mediaUrl: string | null;    // media_files.file_path of first media (always null today: no uploads) ; null for urgence/defaut
  duration: number;           // seconds: urgence = durationSeconds ?? 15 ; publicite = 10 ; defaut = 10
  zone: string;               // support's zone name
  priority: number;           // emergency.priority | campaign.priorityScore (0) | 0
}
```

Selection logic, in order:
1. An active emergency in the support's zone with `startDate <= date <= endDate` wins. Priority ascending; the time of day is ignored. The emergency `content` is **not** returned, only `title`.
2. Otherwise, the `CONFIRMEE` reservations on this support where `startDate<=date<=endDate` and `startTime <= time < endTime` are considered. Their campaign must have `aiStatus=APPROVED` **and** `adminStatus=VALIDATED` **and** status `ACTIVE`/`VALIDATED_BY_ADMIN`. The highest `priorityScore` wins.
3. Otherwise the default content is returned.

**Every call inserts a `diffusion_logs` row**, and that row count is what `totalViews` reports. Polling from the website will inflate stats. Only call this from a real or simulated "player" page, e.g. a `/player/[supportId]` demo screen.

---

### 5.11 Endpoint index (quick reference)

| # | Method | Path | Roles | Success |
|---|---|---|---|---|
| 1 | POST | /api/auth/register | public | 201 AuthResponse |
| 2 | POST | /api/auth/login | public | 200 AuthResponse |
| 3 | POST | /api/campaigns | ANNONCEUR | 201 CampaignResponse |
| 4 | GET | /api/campaigns | ADMIN, SUPERVISEUR | 200 CampaignResponse[] |
| 5 | GET | /api/campaigns/mine | ANNONCEUR | 200 CampaignResponse[] |
| 6 | GET | /api/campaigns/{id} | ANNONCEUR, ADMIN, SUPERVISEUR | 200 CampaignResponse |
| 7 | PUT | /api/campaigns/{id} | ANNONCEUR | 200 CampaignResponse |
| 8 | DELETE | /api/campaigns/{id} | ANNONCEUR | 204 |
| 9 | POST | /api/campaigns/{id}/submit | ANNONCEUR | 200 CampaignResponse |
| 10 | POST | /api/ai/check-content/{campaignId} | ANNONCEUR, ADMIN | 200 AiReportResponse |
| 11 | GET | /api/ai/report/{campaignId} | ANNONCEUR, ADMIN, SUPERVISEUR | 200 AiReportResponse |
| 12 | POST | /api/admin/campaigns/{campaignId}/validate | ADMIN | 200 CampaignResponse |
| 13 | POST | /api/admin/campaigns/{campaignId}/reject?reason= | ADMIN | 200 MessageResponse |
| 14 | POST | /api/zones | ADMIN | 201 ZoneResponse |
| 15 | GET | /api/zones | ANNONCEUR, ADMIN, SUPERVISEUR, OPERATEUR | 200 ZoneResponse[] |
| 16 | GET | /api/zones/active | same | 200 ZoneResponse[] |
| 17 | GET | /api/zones/{id} | same | 200 ZoneResponse |
| 18 | PUT | /api/zones/{id} | ADMIN | 200 ZoneResponse |
| 19 | DELETE | /api/zones/{id} | ADMIN | 204 |
| 20 | POST | /api/supports | ADMIN | 201 SupportResponse |
| 21 | GET | /api/supports | ADMIN, SUPERVISEUR, OPERATEUR, ANNONCEUR | 200 SupportResponse[] |
| 22 | GET | /api/supports/zone/{zoneId} | same | 200 SupportResponse[] |
| 23 | GET | /api/supports/{id} | same | 200 SupportResponse |
| 24 | PUT | /api/supports/{id} | ADMIN | 200 SupportResponse |
| 24b | GET | /api/supports/{id}/availability?from&to | ADMIN, SUPERVISEUR, OPERATEUR, ANNONCEUR | 200 SupportAvailabilitySlot[] |
| 25 | POST | /api/reservations | ANNONCEUR | 201 ReservationResponse |
| 26 | GET | /api/reservations | ADMIN, SUPERVISEUR | 200 ReservationResponse[] |
| 27 | GET | /api/reservations/campaign/{campaignId} | ANNONCEUR, ADMIN, SUPERVISEUR | 200 ReservationResponse[] |
| 28 | GET | /api/statistics/dashboard | ADMIN, SUPERVISEUR, ANNONCEUR, OPERATEUR | 200 DashboardResponse |
| 29 | POST | /api/emergency | ADMIN | 201 EmergencyResponse |
| 30 | GET | /api/emergency | ADMIN, SUPERVISEUR, OPERATEUR | 200 EmergencyResponse[] |
| 31 | POST | /api/emergency/{id}/deactivate | ADMIN | 200 EmergencyResponse |
| 32 | GET | /api/diffusion/next?supportId&datetime[&zone] | public | 200 DiffusionResponse |
| 33 | GET | /actuator/health | public | 200 `{status:"UP"}` |

**Multipart upload endpoints: NONE.** There's no `@RequestPart` or `MultipartFile` anywhere in the codebase. See §7.

---

## 6. Campaign lifecycle for an ANNONCEUR

```
[register/login] → create (BROUILLON) → reserve supports (TEMPORAIRE) → submit (PENDING_AI_CHECK)
   → AI check (APPROVED_BY_AI | REVIEW_REQUIRED | REJECTED_BY_AI)
   → admin validate (ACTIVE, reservations CONFIRMEE)  |  admin reject (BLOCKED, reservations ANNULEE)
   → diffusion on screens during reserved slots → dashboard/stats
```

| Step | Actor | Endpoint | State changes |
|---|---|---|---|
| 0. Account | Annonceur | `POST /api/auth/register` (or `/login`) | creates user (ANNONCEUR) + client (validationStatus PENDING, never enforced) |
| 1. Create campaign | Annonceur | `POST /api/campaigns` | `status=BROUILLON`, aiStatus/adminStatus `null` |
| 1b. Edit / delete draft | Annonceur | `PUT` / `DELETE /api/campaigns/{id}` | only while `BROUILLON` or `REJECTED_BY_AI` |
| 2. Choose zones | Annonceur | `GET /api/zones/active` | **no linking endpoint**: the `campaign_zones` table is unused. Zone choice is only recorded through reservations (`zoneId`). |
| 3. Choose supports | Annonceur | `GET /api/supports/zone/{zoneId}` (filter `technicalStatus==="ACTIF"` client-side) | none |
| 4. Reserve slots | Annonceur | `POST /api/reservations` (one per support) | reservation `TEMPORAIRE`/`RESERVE`, `estimatedCost = budget×0.1`, `campaign.estimatedViews += 1000` |
| 5. Upload media | Annonceur | **not possible (no endpoint)** | the AI then analyses text only (contentType TEXTE) and `mediaUrl` stays null |
| 6. Submit | Annonceur | `POST /api/campaigns/{id}/submit` | `BROUILLON → PENDING_AI_CHECK`, `submittedAt=now` |
| 7. AI check | Annonceur (the frontend fires it right after submit) or Admin | `POST /api/ai/check-content/{id}` then `GET /api/ai/report/{id}` | `status → APPROVED_BY_AI / REVIEW_REQUIRED / REJECTED_BY_AI`, `aiStatus → APPROVED / REVIEW_REQUIRED / REJECTED` |
| 8. Admin decision | Admin | `POST /api/admin/campaigns/{id}/validate` or `/reject?reason=` | validate: `status=ACTIVE`, `adminStatus=VALIDATED`, `validatedAt`, reservations → `CONFIRMEE`. Reject: `status=BLOCKED`, `adminStatus=REJECTED`, reservations → `ANNULEE`. |
| 9. Payment simulation | none | **no endpoint** (`payments_simulation` table unused) | show `estimatedCost` / `budget` as a simulated invoice client-side only |
| 10. Diffusion | Screen/player | `GET /api/diffusion/next?supportId&datetime` | writes `diffusion_logs`. Campaign plays only if reservation CONFIRMEE, in date+time window, `aiStatus=APPROVED`, `adminStatus=VALIDATED`, status ACTIVE. |
| 11. Statistics | Annonceur/Admin | `GET /api/statistics/dashboard` (global), plus client-side aggregation of `/mine` and reservations | read-only |

**Required ordering for the frontend wizard:** create, then **reserve**, then submit, then AI check. Reservations have to exist **before** admin validation. Validation only confirms the reservations that already exist, and ones created afterwards stay `TEMPORAIRE` forever and never play. The backend allows reservations in any campaign status, so the wizard must enforce the order.

Suggested client-side "étape" mapping for a progress stepper:
- `BROUILLON` = Brouillon
- `PENDING_AI_CHECK` = Analyse IA
- `APPROVED_BY_AI`/`REVIEW_REQUIRED` = Validation admin
- `ACTIVE` = Diffusion
- `REJECTED_BY_AI`/`BLOCKED` = Refusée

---

## 7. Gaps and bugs the frontend must work around

### Missing endpoints
1. **No media upload.** The `MediaFile` entity, `media_files` table, multipart config (100MB), `MEDIA_UPLOAD_DIR`, `MEDIA_BASE_URL=/uploads` and the Docker `tpub_uploads` volume all exist, but there's no controller and no static `/uploads` handler. The UI can show an upload dropzone as "à venir" or keep a local preview only. Nothing can be persisted. `DiffusionResponse.mediaUrl` is therefore always `null`.
2. **No campaign↔zone linking** (`campaign_zones` unused). Derive a campaign's zones from its reservations' `zoneId`.
3. **No payment simulation endpoints** (`payments_simulation` unused). `consumedBudget` is always 0.
4. **No current-user/profile endpoint** (`/me`), no profile update, no password change or reset, no logout, no refresh token. Store `AuthResponse` at login.
5. **No user management** (create OPERATEUR/SUPERVISEUR/ADMIN, deactivate users, validate clients). Only via DB.
6. **No per-annonceur or per-campaign statistics.** The dashboard is global, even for ANNONCEUR. `statistics` table unused. No diffusion log listing.
7. **No reservation cancel/update**, no support DELETE. Availability lookup exists since V2 (`GET /api/supports/{id}/availability`, computed from reservations; the `support_availability` table stays unused).
8. **No public catalogue.** Zones and supports require a JWT, so marketing pages can't list the network anonymously.
9. **No AI moderation rules API, no AI decision history API.** The admin reject reason is never returned to the advertiser.
10. No pagination, search or filter params anywhere. `CampaignRepository.findByNameContainingIgnoreCase` exists but isn't exposed.

### Bugs and inconsistencies
11. **Case inconsistency:** `AiReportResponse.aiStatus` is lowercase (`"review_required"`) while `CampaignResponse.aiStatus` is uppercase (`"REVIEW_REQUIRED"`). `DiffusionResponse.type` is lowercase French (`"publicite"`). Normalize with `.toUpperCase()`.
12. **`submit` does not run AI** despite its Swagger summary. Chain `POST /submit` then `POST /api/ai/check-content/{id}`. `check-content` also accepts `BROUILLON` directly, which skips `submittedAt`.
13. **`REJECTED_BY_AI` is a dead end.** It can be edited or deleted, but `submit` requires `BROUILLON` and `check-content` requires `BROUILLON`/`PENDING_AI_CHECK`, and `PUT` doesn't reset the status. The UI should offer "Supprimer et recréer" (or "Dupliquer": POST a new campaign with the same fields).
14. **`REVIEW_REQUIRED` campaigns validated by the admin never diffuse.** Diffusion requires `aiStatus === "APPROVED"`, but validation leaves `aiStatus = REVIEW_REQUIRED` while setting `status=ACTIVE`. Show a warning in the admin UI.
15. `VALIDATED_BY_ADMIN`, `TERMINATED`, `EXPIREE` and admin `PENDING` are never set. `ACTIVE` is set right at validation, even if `startDate` is in the future. Display "Programmée" client-side when `ACTIVE && startDate > today`, and "Terminée" when `endDate < today`.
16. **No ownership checks** on `GET/PUT/DELETE /api/campaigns/{id}`, `submit`, `check-content`, `report`, `reservations/campaign/{id}` and `POST /api/reservations`. Any annonceur can act on any campaign id. Only ever navigate from `/mine` results, and don't trust URL ids.
17. Reservation conflict detection ignores time of day, so two campaigns can't share a support on overlapping dates even with disjoint hours. It also doesn't verify `support.zoneId === zoneId`, so send the support's own `zoneId`. `estimatedCost` is always 10 % of the campaign budget per reservation, and `estimatedViews` is always 1000.
18. Validation messages are English and errors carry only one message per field. Unauthenticated calls return 403 with an empty body, not 401. Many bad-input cases return 500 (missing query params, wrong id type, unknown route, disabled account).
19. `DataIntegrityViolationException` always says "check dates and times format", even for FK violations (e.g. deleting a zone that has supports) or overlong strings.
20. `CampaignRequest` times are strict `HH:mm:ss`, while other DTOs are lenient.
21. `AuthResponse.userId` is `users.id`, but `CampaignResponse.clientId` is `clients.id`. They can't be compared. Use `/mine` rather than filtering by id.
22. An `Authorization` header with a stale token breaks `/api/auth/login` and `/register`. Don't send it there.
23. `GET /api/diffusion/next` logs a view on every call, and `totalViews` counts default and emergency plays too. The `zone` param is ignored, and emergency time windows are ignored.
24. The CORS default is Angular's `http://localhost:4200`, so it must be changed for Next.js (`:3000`).
25. `GET /api/ai/report/{id}` returns 400 (not 404) when no report exists. Treat 400 as "pas encore analysée".
26. The ADMINISTRATEUR has no `clients` row, so admin calls to ANNONCEUR-only endpoints fail with 403 (role). The admin can't create campaigns.
27. `EmergencyResponse` omits `durationSeconds`. Emergency `content` is never sent to players (title only).

---

## 8. Seed data for local demo

### What actually exists after first boot
- **Roles** (Flyway V1): ADMINISTRATEUR, ANNONCEUR, OPERATEUR, SUPERVISEUR (see §1.5).
- **One admin user** (`DataInitializer`, created only if `admin@tpub.local` doesn't exist):

| email | password | role | nom | societe |
|---|---|---|---|---|
| `admin@tpub.local` | `Admin@123` | ADMINISTRATEUR | Administrateur TPUB | Tukhnanutha |

- **Nothing else is seeded.** No annonceur account, **no zones, no supports**, no campaigns, no emergency messages and no AI moderation rules.
- pgAdmin: `http://localhost:5050` with `.env` `PGADMIN_DEFAULT_EMAIL`/`PASSWORD`. DB `tpub` / `tpub_user`.

### Recommended demo bootstrap
These example payloads are **not** in the backend. Run them against a live API, e.g. a `scripts/seed-demo.ts` in the frontend repo.

1. `POST /api/auth/login` `{ "email":"admin@tpub.local", "password":"Admin@123" }` → admin token.
2. `POST /api/zones` (admin), for example:
   - `{ "name":"Tunis Centre", "latitude":36.8008, "longitude":10.1800, "radiusKm":3, "isActive":true }`
   - `{ "name":"Les Berges du Lac", "latitude":36.8380, "longitude":10.2400, "radiusKm":2.5 }`
   - `{ "name":"La Marsa", "latitude":36.8782, "longitude":10.3247, "radiusKm":2 }`
   - `{ "name":"Sousse Centre", "latitude":35.8256, "longitude":10.6360, "radiusKm":3 }`
   - `{ "name":"Sfax Centre", "latitude":34.7406, "longitude":10.7603, "radiusKm":3 }`
3. `POST /api/supports` (admin), for example:
   - `{ "zoneId":1, "name":"Écran LED Avenue Habib Bourguiba", "supportType":"ECRAN", "latitude":36.7998, "longitude":10.1817, "technicalStatus":"ACTIF", "diffusionCapacity":6 }`
   - `{ "zoneId":2, "name":"Panneau numérique Lac 2", "supportType":"PANNEAU_NUMERIQUE", "latitude":36.8455, "longitude":10.2730 }`
   - `{ "zoneId":4, "name":"Écran Port El Kantaoui", "supportType":"ECRAN", "latitude":35.8920, "longitude":10.5970, "technicalStatus":"MAINTENANCE" }`
4. `POST /api/auth/register` `{ "email":"demo@annonceur.tn", "password":"Demo@1234", "nom":"Sami Ben Salah", "societe":"Café Démo SARL", "telephone":"+216 20 000 000", "adresse":"Tunis" }` → annonceur token.
5. As the annonceur, create a campaign:
   ```json
   POST /api/campaigns
   {
     "name": "Lancement Café Démo",
     "objective": "Notoriété de la nouvelle gamme",
     "budget": 2500,
     "startDate": "2026-10-01",
     "endDate": "2026-10-31",
     "startTime": "08:00:00",
     "endTime": "22:00:00"
   }
   ```
6. `POST /api/reservations` `{ "campaignId":1, "zoneId":1, "supportId":1, "startDate":"2026-10-01", "endDate":"2026-10-31", "startTime":"08:00:00", "endTime":"22:00:00" }`
7. `POST /api/campaigns/1/submit`, then `POST /api/ai/check-content/1`. Local fallback gives `approved`, risk 20. Put "gratuit" in the objective to demo `review_required`.
8. As the admin, `POST /api/admin/campaigns/1/validate`.
9. Player demo: `GET /api/diffusion/next?supportId=1&datetime=2026-10-05T10:00:00` → `{ "type":"publicite", "campaignId":1, "title":"Lancement Café Démo", ... }`.
10. Dashboard: `GET /api/statistics/dashboard`.

### Useful environment for local frontend dev (`.env` at repo root)
```
SERVER_PORT=8080
CORS_ALLOWED_ORIGINS=http://localhost:3000
JWT_EXPIRATION_MS=86400000
OPENAI_ENABLED=false        # instant, deterministic local AI fallback for demos
```
