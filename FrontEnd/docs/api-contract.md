# TPUB Backend: frontend API contract (v2)

Source of truth: `../BackEnd` (Spring Boot 4.1, Java 21, Spring Security, JJWT, Jackson 3, PostgreSQL 16+ with Flyway V1–V5).
This document describes the backend **as implemented** after the completion of the cahier des charges (Flyway V3 lifecycle & AI, V4 media/reservations/diffusion, V5 accounts/security/audit). It was checked against the running stack with `scripts/demo-scenario.mjs`.

Where the shapes live:

| What | File |
|---|---|
| Every request/response type and enum (TypeScript) | `src/lib/api/types.ts` |
| One typed function per endpoint | `src/lib/api/endpoints.ts` (`campaignsApi`, `mediaApi`, `aiApi`, `adminApi`, `zonesApi`, `supportsApi`, `availabilityApi`, `estimatesApi`, `reservationsApi`, `statisticsApi`, `emergencyApi`, `diffusionApi`, `meApi`, `sessionApi`, `adminUsersApi`, `auditApi`) |
| French label of every error code | `src/lib/api/messages.ts` |
| Full business rules (formulas, status derivation, engine pseudo-code) | `../docs/completion-contract.md` §2 (binding) and §6 (deviations) |

---

## 0. TL;DR for frontend builders

- The browser never calls Spring directly: every call goes through the Next bridge `/api/<path>` (same origin, JWT in an httpOnly cookie). Media are served through `/uploads/<path>`.
- Auth: `POST /api/auth/login` or `/register` returns `{ token, email, nom, role, userId, sessionId, expiresAt }`. The token lasts 24 h (`JWT_EXPIRATION_MS`) and is bound to a server-side **session** (`sid` claim): logout, password change, deactivation or an admin revoke kill it immediately (401 `SESSION_REVOKED` / `ACCOUNT_DISABLED`).
- Every error is JSON `{ timestamp, status, code, message, path, errors? }` with a stable `code` and a French `message` (§4). 401 = not/no longer authenticated, 403 `ACCESS_DENIED` = wrong role (checked **before** body validation).
- Lists that can grow are paginated: `?page=0&size=20&sort=field,desc` → `{ items, page, size, totalItems, totalPages }` (size max 100). List params that accept several values are comma-separated (`status=BROUILLON,BLOCKED`).
- Dates `"YYYY-MM-DD"`; times are returned `"HH:mm:ss"` and accepted as `"HH:mm"` or `"HH:mm:ss"`; instants are ISO-8601 UTC; `datetime` query params are local (`Africa/Tunis`) without offset. Money is a TND number.
- Lowercase exceptions kept for compatibility: `AiReportResponse.aiStatus` (`"approved" | "review_required" | "rejected"`) and `DiffusionResponse.type` (`"publicite" | "urgence" | "defaut"`). Everything else is UPPERCASE.
- The campaign wizard order is **details → content (media) → zone & Porteurs (circles + reservations) → submit**. `submit` runs the AI synchronously and returns the resulting status.

---

## 1. Infrastructure, auth, security

### 1.1 Server

| Item | Value |
|---|---|
| Port | `SERVER_PORT` (8080), no context path |
| Health | `GET /actuator/health` (public) |
| Swagger | `/swagger-ui.html`, OpenAPI `/v3/api-docs` (public) |
| Multipart | 60 MB request limit (per-type limits in §5.3) |
| Media | stored under `MEDIA_UPLOAD_DIR`, served publicly at `GET /uploads/**` (1-day cache, `Range` supported, 404 JSON when missing) |
| Time zone | `TPUB_TIMEZONE` (Africa/Tunis) for "today", schedulers and diffusion datetimes |
| Schedulers (`TPUB_SCHEDULER_ENABLED`) | campaign lifecycle (every minute), emergency auto-stop (every minute), reservation expiry (every 5 min), statistics snapshot (every 15 min) |
| CORS | `CORS_ALLOWED_ORIGINS`, default `http://localhost:3000,http://localhost:4200`; exposes `Content-Disposition` (unused behind the bridge) |

All new environment variables are optional and documented in `../.env.example`.

### 1.2 Next bridge (`src/app/api/**`)

```
Browser ─► /api/session/login|register ─► Spring /api/auth/*   (never with Authorization; forwards user agent + client IP)
        ─► /api/session/logout         ─► Spring POST /api/me/logout, then clears the cookies (even if Spring is down)
        ─► /api/<path>                 ─► Spring /api/<path>   (+ Authorization: Bearer <tpub_token cookie>)
        ─► /uploads/<path>             ─► Spring /uploads/<path> (public, streamed, Range + cache headers, no cookie)
```

- JSON bodies are forwarded unchanged; multipart and binary bodies are streamed byte for byte (boundary kept), 413 above 60 MB. Downloads (CSV) are streamed with their `Content-Disposition`.
- A Spring 401 whose code ends the session (`UNAUTHENTICATED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `ACCOUNT_DISABLED`) clears the cookies and is returned as `SESSION_EXPIRED`; the shell then shows the reconnect dialog. A refused login (`BAD_CREDENTIALS`, `ACCOUNT_DISABLED` on `/session/login`) is **not** treated as an expired session.
- Cookie lifetime = min(JWT `exp`, `expiresAt`).
- Spring unreachable → 502 with a French message.

### 1.3 Public routes (`SecurityConfig.PUBLIC_ENDPOINTS`)

`/api/auth/**`, `GET /api/diffusion/next`, `POST /api/diffusion/interactions`, `/uploads/**`, `/actuator/health`, Swagger. An invalid token is ignored on public routes, and the `Authorization` header is skipped entirely on login/register. Everything else requires a valid token **and** an active session **and** an active account.

### 1.4 Roles (enforced by `@PreAuthorize`, pinned by `RoleMatrixWebTest`)

| Area | ANNONCEUR | ADMINISTRATEUR | SUPERVISEUR | OPERATEUR |
|---|---|---|---|---|
| Own campaigns: create, edit, delete, reopen, submit, duplicate, zones, media, reservations | ✔ (owner only) | – | – | – |
| Read one campaign, its zones, media, reservations, estimate, statistics | owner | ✔ | ✔ | ✔ |
| Campaign search `GET /api/campaigns` | – | ✔ | ✔ | – |
| AI: check-content | owner (preview on BROUILLON, retry on PENDING_AI_CHECK) | ✔ (re-run) | – | – |
| AI: report / issues / checks | owner | ✔ | ✔ | – |
| AI: rules list, decisions, dashboard | – | ✔ | ✔ | – |
| AI rules create/update/delete, validate / reject / priority | – | ✔ | – | – |
| Zones & supports read, availability, estimates, recommendations | ✔ | ✔ | ✔ | ✔ |
| Zones & supports write, support blocks write | – | ✔ | – | – |
| Reservations: all (search) | – | ✔ | ✔ | ✔ |
| Reservations: conflicts | – | ✔ | ✔ | – |
| Reservation cancel | owner (TEMPORAIRE, draft campaign) | ✔ (TEMPORAIRE/CONFIRMEE) | – | – |
| Emergencies list / create & deactivate | – / – | ✔ / ✔ | ✔ / – | ✔ / – |
| Diffusion logs | – | ✔ | ✔ | ✔ |
| Statistics dashboard, views, history | – (403) | ✔ | ✔ | ✔ |
| Statistics mine | ✔ | – | – | – |
| CSV export | `mine`, `campaign` (owner) | all types | all types | all types |
| `/api/me/**` (profile, password, logo, sessions, logout, login history) | ✔ | ✔ | ✔ | ✔ |
| Admin users, roles, audit — read | – | ✔ | ✔ | – |
| Admin users write, client validation, revoke sessions | – | ✔ | – | – |

Ownership is enforced server-side (`CampaignAccessGuard`): another advertiser's campaign answers **404 `CAMPAIGN_NOT_FOUND`**, never 403.

---

## 2. Serialization and paging conventions

| Java | JSON | Notes |
|---|---|---|
| `Long`/`Integer`/`Short` | number | ids are numbers; `SessionResponse.id` is a UUID string |
| `BigDecimal` | number | money (TND), coordinates, scores |
| `LocalDate` | `"2026-10-01"` | |
| `LocalTime` | `"18:00:00"` | requests accept `"18:00"` too (campaigns, reservations, emergencies, blocks, availability, estimates) |
| `Instant` | `"2026-09-17T01:44:25.452Z"` | |
| enum | exact UPPERCASE string | unknown value → 400 `INVALID_BODY` / `INVALID_PARAMETER` |
| nulls | included as `null` | |

`PageResponse<T> = { items: T[]; page: number; size: number; totalItems: number; totalPages: number }` on: `GET /api/campaigns`, `/api/reservations`, `/api/ai/decisions`, `/api/diffusion/logs`, `/api/admin/users`, `/api/admin/audit`. Other lists are plain arrays.

---

## 3. Enums

All enums are in `src/lib/api/types.ts` with French labels in `src/lib/campaign-status.ts`. The main ones:

| Enum | Values |
|---|---|
| `RoleCode` | `ADMINISTRATEUR`, `ANNONCEUR`, `OPERATEUR`, `SUPERVISEUR` |
| `CampaignStatus` | `BROUILLON`, `PENDING_AI_CHECK`, `APPROVED_BY_AI`, `REVIEW_REQUIRED`, `REJECTED_BY_AI`, `VALIDATED_BY_ADMIN`, `ACTIVE`, `TERMINATED`, `BLOCKED` |
| `CampaignResponse.aiStatus` / `adminStatus` | `APPROVED`, `REVIEW_REQUIRED`, `REJECTED` / `PENDING`, `VALIDATED`, `REJECTED` |
| `terminationReason` | `PERIODE_TERMINEE`, `BUDGET_EPUISE` |
| `AiSector` | `RESTAURATION`, `EVENEMENT`, `IMMOBILIER`, `SERVICE`, `COMMERCE`, `SANTE`, `FORMATION`, `TRANSPORT`, `AUTRE` |
| `Severity` / `UrgencyLevel` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `AiIssue.source` | `TEXTE`, `IMAGE`, `VIDEO`, `OCR`, `REGLE`, `OPENAI`, `SECTEUR`, `DOUBLON` |
| `ocrEngine` / `engine` | `TESSERACT`, `SIMULE`, `AUCUN` / `LOCAL`, `OPENAI`, `LOCAL_OPENAI` |
| `SupportType` | `ECRAN`, `PANNEAU_NUMERIQUE`, `POINT_WIFI`, `APPLICATION`, `SITE_WEB` |
| `TechnicalStatus` | `ACTIF`, `INACTIF`, `MAINTENANCE`, `HORS_LIGNE` |
| `AvailabilityStatus` | `DISPONIBLE`, `RESERVE`, `OCCUPE`, `MAINTENANCE`, `HORS_LIGNE` |
| `ReservationStatus` | `TEMPORAIRE`, `CONFIRMEE`, `ANNULEE`, `EXPIREE` |
| `MediaFileType` | `IMAGE`, `VIDEO`, `BANNER` |
| `EmergencyState` / `stopReason` | `PROGRAMME`, `EN_COURS`, `TERMINE`, `DESACTIVE` / `MANUEL`, `AUTO` |
| `DiffusionContentType` / `InteractionType` | `PUBLICITE`, `URGENCE`, `DEFAUT` / `CLIC`, `INTERACTION` |
| `ClientValidationStatus` | `PENDING`, `VALIDATED`, `REJECTED`, `SUSPENDED` |
| Slot presets (UI + alternatives) | `MATIN` 07–12, `APRES_MIDI` 12–18, `SOIR` 18–23, `JOURNEE` 07–23 |

---

## 4. Errors

```ts
interface ApiError { timestamp: string; status: number; code: string; message: string /* French */; path: string; errors?: Record<string, string> }
```

`errors` maps a field (validation), a completeness key (`SUBMIT_INCOMPLETE`) or a supportId (`BATCH_CONFLICT`) to a French message or a code. The frontend always translates by `code` first (`messages.ts`).

| Family | Codes |
|---|---|
| Generic | `VALIDATION_FAILED` 400, `INVALID_BODY` 400, `INVALID_PARAMETER` 400, `MISSING_PARAMETER` 400, `NOT_FOUND` 404, `METHOD_NOT_ALLOWED` 405, `NOT_ACCEPTABLE` 406, `DATA_INTEGRITY` 409, `PAYLOAD_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `INTERNAL_ERROR` 500 |
| Auth / session | `UNAUTHENTICATED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `ACCOUNT_DISABLED`, `BAD_CREDENTIALS` (401); `ACCESS_DENIED` 403; `EMAIL_ALREADY_REGISTERED` 409 |
| Me / admin users | `INVALID_CURRENT_PASSWORD`, `PASSWORD_REUSED`, `ROLE_NOT_ALLOWED`, `CANNOT_DEACTIVATE_SELF`, `LAST_ADMIN` (400); `SESSION_NOT_FOUND`, `USER_NOT_FOUND`, `CLIENT_NOT_FOUND` (404) |
| Campaigns | `INVALID_PERIOD`, `INVALID_TIME_RANGE`, `START_DATE_IN_PAST`, `SUBMIT_INCOMPLETE` (errors keys `period`, `times`, `budget`, `zones`, `reservations`), `ZONE_LIMIT_EXCEEDED`, `INVALID_ZONE`, `REJECT_REASON_REQUIRED`, `AI_OVERRIDE_REQUIRED` (400); `CLIENT_NOT_ALLOWED` 403 (409 on validate); `CAMPAIGN_NOT_FOUND` 404; `CAMPAIGN_NOT_EDITABLE`, `CAMPAIGN_NOT_SUBMITTABLE`, `CAMPAIGN_NOT_REVIEWABLE`, `CAMPAIGN_PERIOD_OVER`, `NO_RESERVATION_TO_CONFIRM`, `PRIORITY_NOT_EDITABLE`, `CAMPAIGN_NOT_ELIGIBLE_FOR_AI` (409) |
| AI | `AI_REPORT_NOT_FOUND`, `AI_RULE_NOT_FOUND` (404); `AI_RULE_NAME_TAKEN` 409; `INVALID_REGEX` 400 |
| Media | `MEDIA_TYPE_UNSUPPORTED`, `MEDIA_CONTENT_MISMATCH` (415); `MEDIA_TOO_LARGE` 413; `MEDIA_LIMIT_REACHED` 400; `MEDIA_NOT_FOUND` 404 |
| Network / reservations | `INVALID_RANGE`, `RESERVATION_OUTSIDE_CAMPAIGN_PERIOD`, `CAMPAIGN_ZONE_REQUIRED`, `SUPPORT_OUTSIDE_CAMPAIGN_ZONE`, `SUPPORT_ZONE_MISMATCH` (400); `CAMPAIGN_NOT_RESERVABLE`, `RESERVATION_DUPLICATE`, `SUPPORT_UNAVAILABLE`, `SUPPORT_ALREADY_RESERVED`, `BATCH_CONFLICT`, `RESERVATION_NOT_CANCELLABLE`, `ZONE_IN_USE` (409); `SUPPORT_NOT_FOUND`, `ZONE_NOT_FOUND`, `RESERVATION_NOT_FOUND`, `SUPPORT_BLOCK_NOT_FOUND` (404) |
| Diffusion / emergencies / stats | `INTERACTION_NOT_ALLOWED`, `INTERACTION_EXPIRED`, `EMERGENCY_TARGET_REQUIRED`, `INVALID_EMERGENCY_WINDOW`, `EXPORT_TYPE_INVALID` (400); `DIFFUSION_LOG_NOT_FOUND`, `EMERGENCY_NOT_FOUND` (404) |

---

## 5. Endpoints

Roles: see §1.4. "owner" = the ANNONCEUR who owns the campaign.

### 5.1 Auth `/api/auth` (public)

| Endpoint | Notes |
|---|---|
| `POST /register` `{ email, password (8..100), nom, societe?, telephone?, adresse? }` | 201 `AuthResponse`; always creates an ANNONCEUR + client `PENDING`; e-mail lower-cased; opens a session and writes login history; 409 `EMAIL_ALREADY_REGISTERED` |
| `POST /login` `{ email, password }` | 200 `AuthResponse`; 401 `BAD_CREDENTIALS` (also unknown e-mail) or `ACCOUNT_DISABLED` (only with the right password); every attempt journaled |

### 5.2 Me `/api/me` (authenticated)

`GET` / `PUT { nom, societe?, telephone?, adresse? }` → `MeResponse` (includes `client { clientId, companyName, validationStatus, trustLevel }` for advertisers) · `POST /password { currentPassword, newPassword }` 204, revokes the other sessions · `POST /logo` multipart `file` (png/jpeg/webp ≤ 2 MB) / `DELETE /logo` → `MeResponse` · `GET /sessions` (active, `current` flag) · `DELETE /sessions/{id}` 204 · `POST /sessions/revoke-others` → `{ revoked }` · `POST /logout` 204 · `GET /login-history?limit=` (1..100, default 20).

### 5.3 Campaigns `/api/campaigns`

| Endpoint | Notes |
|---|---|
| `POST` `CampaignRequest` | 201 `BROUILLON`; `INVALID_PERIOD`, `INVALID_TIME_RANGE`, `START_DATE_IN_PAST`; client `REJECTED`/`SUSPENDED` → 403 `CLIENT_NOT_ALLOWED` |
| `GET` (staff search) | `q, client, clientId, zoneId, status, aiStatus, from, to, supportType, page, size, sort ∈ createdAt,name,startDate,budget,submittedAt` → `PageResponse<CampaignResponse>` |
| `GET /mine` | `CampaignResponse[]`, filters `q, status, aiStatus, from, to, zoneId` |
| `GET /{id}` | `CampaignResponse`: client info, budget / consumed / remaining / estimated cost, AI scores & sector, first media URL, zones with `supportsInside`, `reservationsCount`, `editable`/`submittable`/`deletable`, lifecycle timestamps, `rejectionReason`, `adminComment`, `terminationReason` |
| `PUT /{id}` | editable only in `BROUILLON`; `REJECTED_BY_AI`/`BLOCKED` are reopened automatically; TEMPORAIRE reservations outside the new window become ANNULEE |
| `DELETE /{id}` | `BROUILLON`, `REJECTED_BY_AI`, `BLOCKED`; media folder deleted |
| `POST /{id}/reopen` | `REJECTED_BY_AI`/`BLOCKED` → `BROUILLON` (keeps « motif du dernier refus ») |
| `POST /{id}/submit` | `BROUILLON` only; completeness → 400 `SUBMIT_INCOMPLETE`; then runs the AI in the same request and returns the campaign with `APPROVED_BY_AI`, `REVIEW_REQUIRED` or `REJECTED_BY_AI` |
| `POST /{id}/duplicate` `{ includeMedia? }` | 201 new draft « Copie de … » with zones (+ media); dates kept only if still in the future; reservations never copied |
| `GET /{id}/zones` / `PUT /{id}/zones` `{ zones: { latitude, longitude, radiusKm (0.1..50), label? }[1..5] }` | map circles (point + radius); each is attached to the enclosing (else nearest) active zone; returns `{ zones, cancelledReservationIds }` (TEMPORAIRE reservations outside every circle are cancelled) |
| Media `POST /{id}/media` multipart `file`, `kind=BANNER`?, `durationSeconds`? | owner, draft only; jpeg/png/webp/gif ≤ 10 MB, mp4/webm ≤ 50 MB, max 5 files; magic bytes checked; width/height read; 201 `MediaFileResponse { url: "/uploads/campaigns/{id}/<uuid>.png", … }` |
| `GET /{id}/media`, `DELETE /{id}/media/{mediaId}` | list by sort order; delete 204 (draft only) |

Admin decisions `/api/admin/campaigns/{id}` (ADMINISTRATEUR): `POST /validate { overrideAi?, comment?, priorityScore? }` (REVIEW_REQUIRED needs `overrideAi: true`; confirms TEMPORAIRE reservations, creates the payment simulation, result `VALIDATED_BY_ADMIN` before the start date or `ACTIVE`) · `POST /reject { reason (3..1000) }` → `BLOCKED`, reservations ANNULEE, returns `CampaignResponse` · `PUT /priority { priorityScore 0..10 }`. Every decision is written to `ai_decision_logs` and the audit trail.

Lifecycle scheduler: `VALIDATED_BY_ADMIN` → `ACTIVE` on the start date; `ACTIVE`/`VALIDATED_BY_ADMIN` → `TERMINATED` when the period is over (`PERIODE_TERMINEE`) or the budget is consumed (`BUDGET_EPUISE`).

### 5.4 AI `/api/ai`

| Endpoint | Notes |
|---|---|
| `POST /check-content/{campaignId}` | owner on `BROUILLON` → stored **preview** (status unchanged); owner on `PENDING_AI_CHECK` → retry; admin on `PENDING_AI_CHECK`/`APPROVED_BY_AI`/`REVIEW_REQUIRED` → re-run (clears the override); else 409 `CAMPAIGN_NOT_ELIGIBLE_FOR_AI`. Returns `AiReportResponse` |
| `GET /report/{id}`, `/issues/{id}`, `/checks/{id}` | latest report (preview or not), its issues, all checks newest first; 404 `AI_REPORT_NOT_FOUND` when never analysed |
| `GET/POST /rules`, `PUT/DELETE /rules/{id}` | moderation rules (`KEYWORD` phrases or `REGEX`, severity, optional sector); 8 rules seeded by V3 |
| `GET /decisions` | paged AI and admin decisions (`campaignId, decisionType, decision, from, to`) |
| `GET /dashboard` | averages, approval/review/rejection counts, validation & rejection rates, overrides, AI/admin disagreements, counts by sector, top 10 issues |

`AiReportResponse`: `riskScore`, `qualityScore` (0..100), `issues[]` (label, severity, source), `detectedIssues[]`, `recommendation` + `recommendations[]`, `sector`, `contentType`, `extractedText` + `ocrEngine` (Tesseract when on PATH, else simulated from the file name), `mediaAnalyses[]` (dimensions, duration, per-media issues), `matchedRules[]`, `engine`, `preview`, `adminDecision`, `checkedAt`. Status: REJECTED on a CRITICAL rule or risk > 70; REVIEW_REQUIRED on risk ≥ 31, a HIGH rule or quality < 40; else APPROVED.

### 5.5 Zones, supports, availability, estimates

| Endpoint | Notes |
|---|---|
| `GET /api/zones`, `/zones/active`, `/zones/{id}`; `POST`, `PUT /{id}`, `DELETE /{id}` (admin) | delete with dependents → 409 `ZONE_IN_USE` |
| `GET /api/zones/recommendations?startDate&endDate&startTime&endTime&supportType&limit` | best zones for a window: score 50 % views / 30 % availability / 20 % recent audience, French `reasons` |
| `GET /api/supports?zoneId&supportType&technicalStatus`, `/supports/zone/{zoneId}`, `/supports/{id}`; `POST`, `PUT /{id}` (admin) | `visibilityScore` 0..100 weighs estimates; Porteur fields `porteurType`, `mastHeightM`, `headingDeg`, `address` |
| `GET /api/supports/{id}/availability?startDate&endDate&startTime?&endTime?` | per-day slots: reservations (`kind: "RESERVATION"`) and blocks (`kind: "BLOCAGE"`) |
| `GET /api/supports/{id}/blocks?from&to`; `POST` (admin, `MAINTENANCE`/`HORS_LIGNE`/`OCCUPE`, ≤ 92 days, one row per day); `DELETE /blocks/{blockId}` | unavailability calendar |
| `GET /api/availability?startDate&endDate&startTime&endTime` + one target: `campaignId` **or** `lat&lng&radiusKm` **or** `zoneId`; optional `supportType`, `status` | per support: `status` (`DISPONIBLE`/`RESERVE`/`OCCUPE`/`MAINTENANCE`/`HORS_LIGNE`), `remainingCapacity`, `reservedByCampaign`, conflicts, estimated views & cost; `summary` (counts, `estimatedViewsAvailable`, `estimatedCostAvailable`); `alternatives` (top 3 other presets or +7..+28 days) when nothing is available |
| `POST /api/estimates { supportIds, startDate, endDate, startTime, endTime }` | per-support and total views & cost |
| `GET /api/estimates/campaign/{id}` | per reservation + totals, `budgetCoverage`, `budgetSufficient` |

Estimates (internal simulation constants, shown only as « Estimation », never on marketing pages): `views = floor(baseViewsPerHour(type) × (0.5 + visibility/100) × hoursPerDay × days / capacity)`, `cost = views × CPM(type) / 1000`.

### 5.5b Polygones, cartes de chaleur, tarification dynamique

Round 2, lane L3 (docs/round2-contract.md §4). Front : `src/lib/api/types-carte.ts` + `endpoints-carte.ts`,
géométrie partagée avec le backend dans `src/lib/polygon.ts` (mêmes limites, mêmes messages).

**Zones de campagne (§4.3)** — `PUT /api/campaigns/{id}/zones` accepte désormais cercles **et** polygones :

```ts
{ zones: ({ type?: "CERCLE"; latitude; longitude; radiusKm /*0.1..50*/; label? }
        | { type: "POLYGONE"; polygon: GeoJsonPolygon | GeoJsonMultiPolygon; label? })[] }  // 1..5
```

La réponse (`CampaignZoneResponse`) gagne `type`, `polygon` et `areaKm2` ; pour un polygone,
`latitude`/`longitude` sont le **centroïde** et `radiusKm` le **rayon circonscrit** (tout lecteur qui ne
connaît que les cercles reste correct). Validation (première erreur gagnante, 400 `INVALID_POLYGON`,
`errors = { "zones[i].polygon": "<raison française>" }`) : géométrie GeoJSON, coordonnées dans les
bornes, 3 sommets distincts minimum, limites (100 sommets par anneau, 200 au total, 5 parties,
5 trous), tracé non croisé et trou contenu, aire 0,01–2 000 km², rayon circonscrit ≤ 50 km.
L'appartenance d'un Porteur (réservation, diffusion, disponibilité, annulation des réservations
temporaires) utilise le point-dans-polygone pour un `POLYGONE` et la haversine pour un `CERCLE`.

**Urgences (§4.4)** — `POST /api/emergency` gagne `polygon` (exclusif avec le cercle :
400 `EMERGENCY_TARGET_CONFLICT`). Priorité de ciblage : polygone > cercle > zone. Sans `zoneId`, la
zone est déduite du centroïde. `EmergencyResponse` gagne `targetPolygon`.

**Cartes de chaleur (§4.5)** — points GeoJSON `FeatureCollection<Point>`, `properties.weight ≥ 0` ;
`to < from` ou période > 366 jours → 400 `INVALID_RANGE`.

| Endpoint | Rôles | Contenu |
|---|---|---|
| `GET /api/heatmap/diffusions?from&to&contentType&zoneId` | ADMIN, SUPERVISEUR, OPERATEUR | 30 derniers jours et `PUBLICITE` par défaut ; un point par Porteur diffusé, `weight` = nombre de diffusions, `properties` : `supportId, supportName, zoneId, zoneName, weight, clicks` |
| `GET /api/heatmap/demand?from&to&zoneId` | ADMIN, SUPERVISEUR, OPERATEUR | aujourd'hui → +29 jours par défaut ; `reservations` (heures-créneau réservées par Porteur, `occupancy`), `targets` (zones ciblées des campagnes non brouillon), `byZone` (`reservedHours`, `capacityHours = jours × 16 h × capacité`, `occupancy`, `targets`) |
| `GET /api/heatmap/demand/public?startDate&endDate&startTime&endTime` | + ANNONCEUR | assistant de campagne : un point par Porteur ACTIF, `weight` = occupation 0..1 du créneau, `byZone` (`occupancy`, `availableSupports`, `totalSupports`) ; **aucune donnée campagne ou client**. `startTime ≥ endTime` → 400 `INVALID_TIME_RANGE` |

**Tarification dynamique (§4.6)** — le coût estimé est `base × multiplicateur` :

```
hour  = moyenne pondérée des tranches horaires du créneau     (00:00–07:00 ×0,70 · 07:00–10:00 ×1,15 ·
                                                               10:00–16:00 ×1,00 · 16:00–20:00 ×1,25 ·
                                                               20:00–24:00 ×0,90)
day   = moyenne des multiplicateurs de jour (VEN ×1,05, SAM ×1,15, DIM ×0,90, sinon ×1,00)
demand   = 1 + 0,30 × (0,60 × occupation du Porteur + 0,40 × occupation de la zone)
scarcity = 1 + 0,20 × (1 − part de Porteurs disponibles de la zone)
multiplicateur = borné à [0,70 ; 1,60], 4 décimales ; coût final = round(base × multiplicateur, 2)
```

`POST /api/estimates` accepte `campaignId` (exclu de l'occupation) et renvoie `baseCost` +
`pricing: PriceBreakdown` par ligne ainsi que `totalBaseCost`. `GET /api/estimates/campaign/{id}`
renvoie `baseCost`, `priceMultiplier` et le `pricing` **figé à la réservation** (null avant V8).
`GET /api/availability` ajoute `priceMultiplier` par Porteur, `GET /api/pricing/config` (4 rôles)
expose tranches, multiplicateurs de jour, poids et bornes. Le prix d'une réservation n'est jamais
recalculé après coup, et la consommation de budget d'une diffusion vaut
`coût unitaire R1 × priceMultiplier` de la réservation.

### 5.6 Reservations `/api/reservations`

| Endpoint | Notes |
|---|---|
| `POST { campaignId, supportId, startDate?, endDate?, startTime?, endTime? }` (defaults: campaign window) | owner, draft campaign; checks in order: `CAMPAIGN_NOT_RESERVABLE`, `CLIENT_NOT_ALLOWED`, window/`START_DATE_IN_PAST`, `RESERVATION_OUTSIDE_CAMPAIGN_PERIOD`, `CAMPAIGN_ZONE_REQUIRED`, `SUPPORT_OUTSIDE_CAMPAIGN_ZONE`, `RESERVATION_DUPLICATE`, `SUPPORT_UNAVAILABLE` / `SUPPORT_ALREADY_RESERVED`; 201 `TEMPORAIRE` with estimates |
| `POST /batch { campaignId, supportIds[1..50], window? }` | all-or-nothing; 409 `BATCH_CONFLICT` with `errors = { "<supportId>": "<CODE>" }` |
| `POST /{id}/cancel { reason? }` | owner: TEMPORAIRE of a `BROUILLON`/`REJECTED_BY_AI` campaign; admin: TEMPORAIRE or CONFIRMEE (audited); else 409 `RESERVATION_NOT_CANCELLABLE` |
| `GET` (staff, paged) · `GET /mine` · `GET /campaign/{campaignId}` | `ReservationResponse` includes `cancellable` for the caller, cancel/expiry metadata |
| `GET /conflicts?from&to&zoneId&supportId` | `CONFLIT` (more overlapping reservations than capacity) or `SATURE` (exactly at capacity ≥ 2), with the overlap window |

Conflicts are computed on dates **and** time of day against the support capacity. TEMPORAIRE reservations expire (`EXPIREE`) when their period is over or after 72 h on an unsubmitted campaign.

### 5.7 Diffusion `/api/diffusion`

`GET /next?supportId&zone?&datetime?` (public, `datetime` local, default now) → `DiffusionResponse { type, diffusionLogId, supportId, campaignId, emergencyId, title, content, mediaUrl, mediaType, duration, zone, priority, urgencyLevel, datetime }`. Order:

1. **Urgent message** active at that datetime whose circle contains the support (or whose zone is the support's zone): highest urgency, then priority. Delivered even when the support is not ACTIF.
2. Support not ACTIF or blocked at that time → default content.
3. **Campaign** with a CONFIRMEE reservation on the support covering date and time, status `ACTIVE`/`VALIDATED_BY_ADMIN`, admin-validated, AI `APPROVED` (or `REVIEW_REQUIRED` with admin override), support inside one of its circles, client allowed, budget left, and fewer than 30 plays in the last hour. Score = priority × 10 + 20 % of the quality score; among the top scores the least recently played wins (equitable rotation). The unit cost is added to `consumedBudget` and to the payment simulation.
4. Otherwise default content (`TPUB_DIFFUSION_DEFAULT_*`).

Every call writes a `diffusion_logs` row (with cost). `POST /interactions { diffusionLogId, type: "CLIC" | "INTERACTION" }` (public, idempotent, only on `publicite` logs less than 1 h old) → 204. `GET /logs` (staff, paged) with click/interaction counts.

### 5.8 Emergencies `/api/emergency`

`POST` (admin) `{ title, content, zoneId? | latitude+longitude+radiusKm, startDate, endDate, startTime?, endTime?, durationSeconds? (5..120, default 15), priority?, urgencyLevel? (default HIGH) }` → 201 `EmergencyResponse` with derived `state`, `affectedSupports`, `diffusionCount`, `createdByName` · `GET ?state=` (staff) · `POST /{id}/deactivate` (admin, `stopReason: "MANUEL"`). The auto-stop scheduler sets `stopReason: "AUTO"` at the end of the window.

### 5.9 Statistics `/api/statistics`

| Endpoint | Notes |
|---|---|
| `GET /dashboard` (staff) | campaigns by status, AI-flagged, clients, supports by status, zones, reservations by status, diffusions (ads / emergencies / default), views today, clicks, interactions, estimated cost & budget, simulated revenue, active emergencies |
| `GET /views?from&to&groupBy=day|campaign|support|zone&campaignId&supportId&zoneId&contentType` (staff) | rows `{ key, label, views, clicks, interactions, cost }` + totals; days are zero-filled; max 366 days |
| `GET /mine?from&to` (advertiser) | totals, status counts, daily series, by campaign / support / zone |
| `GET /campaigns/{id}?from&to` (readable) | views, clicks, interactions, budget consumed, last diffusion, daily / by support / by zone |
| `GET /history?from&to` (staff) | daily platform snapshots (updated every 15 min) |
| `GET /export.csv?type=views|dashboard|mine|campaign&from&to&groupBy&campaignId` | UTF-8 with BOM, `;` separator, decimal comma, French headers, `attachment; filename="tpub-statistiques-<type>-<from>-<to>.csv"` |

### 5.10 Admin users & audit (`/api/admin`)

`GET /users?q&role&active&validationStatus` (paged `AdminUserResponse` with `activeSessions`, `campaignsCount`, `clientNotes`) · `GET /users/{id}` · `POST /users` (staff roles only) · `PUT /users/{id}` (role change between staff roles, never on yourself) · `POST /users/{id}/activate|deactivate` (`CANNOT_DEACTIVATE_SELF`, `LAST_ADMIN`; deactivation revokes sessions) · `GET /users/{id}/login-history`, `/sessions` · `POST /users/{id}/sessions/revoke` → `{ revoked }` · `POST /clients/{clientId}/validation { validationStatus, trustLevel?, notes? }` · `GET /roles` · `GET /audit?actorId&action&entityType&entityId&from&to` (paged).

Audited actions: `CAMPAIGN_VALIDATED`, `CAMPAIGN_VALIDATED_OVERRIDE`, `CAMPAIGN_REJECTED`, `CAMPAIGN_PRIORITY_CHANGED`, `AI_CHECK_RERUN`, `AI_RULE_CREATED|UPDATED|DELETED`, `ZONE_CREATED|UPDATED|DELETED`, `SUPPORT_CREATED|UPDATED`, `SUPPORT_BLOCK_CREATED|DELETED`, `RESERVATION_CANCELLED`, `EMERGENCY_CREATED|DEACTIVATED`, `USER_CREATED|UPDATED|ACTIVATED|DEACTIVATED`, `CLIENT_VALIDATION_CHANGED`, `USER_SESSIONS_REVOKED`.

---

## 6. Campaign lifecycle for an advertiser

```
create (BROUILLON) → upload media → optional AI pre-analysis (preview)
  → map circles (PUT zones) → availability → reserve Porteurs (TEMPORAIRE) → estimate
  → submit: PENDING_AI_CHECK → AI → APPROVED_BY_AI | REVIEW_REQUIRED | REJECTED_BY_AI
  → admin validate → VALIDATED_BY_ADMIN (future start) | ACTIVE, reservations CONFIRMEE
  → diffusion on the reserved Porteurs, budget consumed, statistics
  → TERMINATED (period over or budget used)
REJECTED_BY_AI | BLOCKED → PUT / PUT zones / reopen → BROUILLON (correct and resubmit)
```

| Timeline step (UI) | Statuses |
|---|---|
| Brouillon | `BROUILLON` |
| Analyse IA | `PENDING_AI_CHECK` |
| Validation TPUB | `APPROVED_BY_AI`, `REVIEW_REQUIRED` |
| Programmée | `VALIDATED_BY_ADMIN` |
| Diffusion | `ACTIVE` |
| Terminée | `TERMINATED` (reason shown) |
| À corriger / Bloquée | `REJECTED_BY_AI`, `BLOCKED` (reason shown) |

---

## 7. Remaining limits

Everything listed in the previous version of this section (no upload, no zone linking, no `/me`, no user management, no per-advertiser statistics, no cancel, no pagination, AI not run on submit, dead-end `REJECTED_BY_AI`, `REVIEW_REQUIRED` never diffused, statuses never set, no ownership checks, date-only conflicts, flat estimates, English messages, empty 403, 400 for a missing report, lenient/strict time formats, stale-token login failure, ignored zone and emergency windows, CORS default) is resolved in the backend. What is left:

1. **No password reset by e-mail.** `/mot-de-passe-oublie` directs the user to TPUB; a logged-in user changes their password in `/espace/profil`.
2. **No refresh token.** Sessions last 24 h, then the user logs in again (the shell warns 10 min before).
3. **No public network catalogue.** Zones and supports require a token; marketing pages use editorial content only.
4. **No support deletion endpoint.** Retire a Porteur with `technicalStatus: "INACTIF"`.
5. **Errors raised outside Spring MVC** (servlet `/error` dispatch) still use Spring Boot's default body (no `code`); `messages.ts` then shows its French default message for the HTTP status.
6. **OCR is simulated** (text derived from the file name) unless Tesseract is installed on the backend's PATH.
7. **No realtime push** (out of scope): the player polls `/diffusion/next` at the end of each item (at most every 5 s for urgent messages); back-office pages refresh on demand.
8. Out of scope by decision: 2FA, polygon zones, dynamic pricing, learning from admin decisions.

---

## 8. Demo data and scenario

- Flyway seeds the four roles (V1, permissions described in V5) and the 8 moderation rules (V3); `DataInitializer` creates `admin@tpub.local` / `Admin@123`.
- `node scripts/seed-demo.mjs` (idempotent) adds 5 zones, 10 Porteurs covering every technical status with visibility scores, a maintenance block, 2 extra moderation rules, `operateur@tpub.local` / `Operateur@123`, `superviseur@tpub.local` / `Superviseur@123`, the validated advertiser `demo@annonceur.tn` / `Demo@1234` and four campaigns created through the real flow (one ACTIVE and diffusing today, one APPROVED_BY_AI and one REVIEW_REQUIRED awaiting the admin, one draft).
- `node scripts/demo-scenario.mjs` runs the 18 steps of cahier des charges §11 over HTTP (fresh advertiser, PNG upload, AI preview and report, admin reads it, point + radius, Soir slot, availability, batch reservation, estimates, submit + admin validation, `/diffusion/next` at a datetime inside the window, click and statistics, urgent message replacing the ad) and prints ✔ / ✘ per step. Both scripts read `TPUB_API_URL` (default `http://localhost:8080`).
