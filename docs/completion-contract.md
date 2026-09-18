# ZELQANE completion contract (binding)

Authoritative functional source: `docs/source/cahier-des-charges-v1.3.txt` (below: "CdC").
Current state: `FrontEnd/docs/api-contract.md` (below: "AC"), which describes the backend as it was at commit `b0fbbc7`.
Scope is fixed by the owner:
- **In:** every CdC `[MVP]` bullet from §3.1 to §8.
- **In ("Important" bonuses):** statistics, charts and history; budget and views estimation; OCR / text-in-image (simulated OCR, with Tesseract used only if it is on PATH); quality and risk scores; best-zone recommendation.
- **In (cheap bonuses):** campaign duplication, statistics CSV export, audit trail, urgency levels, alternative slots when a zone is saturated.
- **Out (round 1):** 2FA, polygon drawing, dynamic pricing, learning from admin decisions, websocket realtime.
  **Round 2 brought every one of them in**, plus real OCR and media analysis, heatmaps, PDF/Excel exports,
  multi-level approval, operator notifications and player/media/secret hardening. They are specified in
  `docs/round2-contract.md` and implemented: real Tess4J OCR (`fra+eng+ara`, tessdata downloaded by
  `BackEnd/scripts/fetch-tessdata.*`, simulated fallback with a WARN), JCodec video frames and local image
  metrics, optional OpenAI/Anthropic vision providers, learning from admin decisions with versioned
  recalibration and the `/admin/ia-qualite` error dashboard, TOTP 2FA with recovery codes, polygon campaign
  zones and polygon emergency targeting, diffusion and demand heatmaps, dynamic pricing with a price
  breakdown, SSE supervision with heartbeats and alerts, two-administrator approval, notification centre,
  PDF/Excel exports, player device keys, signed expiring media URLs and generated local secrets.
  Round-2 behaviour is exercised end to end by `FrontEnd/scripts/bonus-scenario.mjs`.

If this contract conflicts with AC, **this contract wins**. Any change to this contract goes in §6 "Deviations", with the reason.

Conventions used everywhere in this document:
- JSON types are written in TypeScript notation.
- Every enum value is written verbatim (UPPERCASE unless stated otherwise).
- Dates are `"YYYY-MM-DD"`. Times are `"HH:mm:ss"`, and requests also accept `"HH:mm"`. Instants are ISO-8601 UTC.
- Money is a TND number.
- "now" and "today" come from the injected `java.time.Clock`, in zone `zelqane.timezone` (default `Africa/Tunis`).
- `datetime` query params are local date-times with no offset, in that same zone.
- Paginated endpoints take `page` (0-based, default 0), `size` (default 20, max 100) and `sort` (`field,asc|desc`), and return:
  `PageResponse<T> = { items: T[]; page: number; size: number; totalItems: number; totalPages: number }`.

---

## 1. Coverage matrix (CdC MVP bullets)

Status legend:
- **D** = done today
- **P** = partial
- **M** = missing

Lane codes:
- Backend: **A** (lifecycle/AI), **B** (media/reservations/diffusion/stats), **C** (accounts/security/audit)
- Frontend: **F1** (shared), **F2** (espace annonceur), **F3** (back-office + player)

### 3.1 Compte, authentification & rôles
| Bullet | Today | Closed by |
|---|---|---|
| Inscription / connexion e-mail | D | keep; C adds `sessionId`, `expiresAt`, login history |
| JWT sécurisé | P (empty 403, token not revocable) | C: JSON 401/403, `sid` claim bound to `user_sessions` |
| Rôles admin/annonceur/opérateur/superviseur | P (staff accounts only via DB) | C `/api/admin/users` + F3 `/admin/utilisateurs` |
| Profil nom, société, téléphone, adresse, logo | M | C `/api/me`, `/api/me/logo` + F2 `/espace/profil` |
| Sessions actives | M | C `/api/me/sessions` + F2 profile |
| Déconnexion sécurisée | P (cookie cleared, JWT still valid) | C `POST /api/me/logout` + F1 `/api/session/logout` calls it |
| Bonus in scope: historique des connexions, validation manuelle des annonceurs, niveau de confiance | M | C `/api/me/login-history`, `/api/admin/clients/{id}/validation` + F2/F3 |

### 3.2 Espace client / annonceur
| Bullet | Today | Closed by |
|---|---|---|
| Création compte annonceur | D | none |
| Tableau de bord client | P (client-side aggregation) | B `/api/statistics/mine` + F2 `/espace` |
| Création campagne | D | A ownership + validations |
| Upload médias image/vidéo/bannière | M | B `/api/campaigns/{id}/media` + F1 multipart + F2 wizard step « Contenu » |
| Analyse IA déclenchée après soumission | P (frontend chains 2 calls) | A: `submit` runs the AI synchronously |
| Choix de zone sur la carte | P (zone list, no point+radius) | A `/api/campaigns/{id}/zones` + F2 map point+radius |
| Période & créneaux | P (custom times only) | F1 presets + F2; B conflict check includes time of day |
| Disponibilité avant validation | P (booked date ranges only) | B `/api/availability` + F2 |
| Suivi du statut | P (VALIDATED_BY_ADMIN/TERMINATED never set; REJECTED dead-end) | A lifecycle + scheduler + F2 timeline |
| Statistiques affichages, clics, interactions, coût estimé | M | B `/api/statistics/mine`, `/api/diffusion/interactions` + F2 |
| Bonus in scope: duplication, recommandation zones, simulation budget, recommandations IA | P/M | A `/duplicate`, AI `recommendations`; B `/api/zones/recommendations`, `/api/estimates` + F2 |

### 3.3 Dashboard administrateur
| Bullet | Today | Closed by |
|---|---|---|
| Vue globale campagnes, clients, supports, zones, revenus | P | B extended `/api/statistics/dashboard` + F3 `/admin`, `/admin/statistiques` |
| Rapport IA avant décision | P (no OCR, sector, rules) | A extended report + F3 review dialog |
| Validation / refus | P (reason not returned; REVIEW_REQUIRED validation never diffuses) | A validate/reject bodies, `aiOverride` + F3 |
| Validation finale après analyse | P | A gates |
| Gestion comptes annonceurs | M | C admin users/clients + F3 |
| Gestion supports | D (create/update) | B adds `visibilityScore`, filters |
| Gestion zones et disponibilités | P (no availability management) | B support blocks `/api/supports/{id}/blocks` + F3 `/admin/reseau` |
| Suivi réservations | P (raw list) | B filtered list, cancel, conflicts + F3 `/admin/reservations` |
| Suivi diffusions | M | B `/api/diffusion/logs` + F3 `/admin/journal?onglet=diffusions` |
| Logs & historiques | M | A `/api/ai/decisions`, C `/api/admin/audit`, B diffusion logs + F3 `/admin/journal` |
| Messages d'urgence | P (no time window, no map, content not played) | B emergency v2 + F3 `/admin/urgences` |
| Bonus in scope: audit trail, AI decisions & admin corrections board, CSV export | M | C audit; A `/api/ai/dashboard` (overrides, disagreements); B CSV |

### 3.4 Gestion des campagnes
| Bullet | Today | Closed by |
|---|---|---|
| CRUD + consultation | P (no ownership check, BLOCKED not editable) | A guard, reopen rules |
| Nom, objectif, média, budget, période, zone | P (media, zone) | B media, A zones |
| Gestion des statuts | P | A status machine §2.1 |
| Passage automatique en analyse IA après envoi du contenu | P | A `submit` → PENDING_AI_CHECK → AI → result; wizard pre-analysis |
| Validation administrative avant diffusion | D | A/B gates incl. override |
| Liaison campagne ↔ zone ↔ supports ↔ créneaux | P | A `campaign_zones`; B reservation enforcement |
| Calcul affichages estimés | P (flat 1000) | B formula §2.6 |
| Suivi budget consommé | M (always 0) | B diffusion consumption + `payments_simulation` |
| Bonus in scope: multi-zones (≤5 circles), media quality score | M | A |

### 3.5 IA de filtration
| Bullet | Today | Closed by |
|---|---|---|
| Texte | P (2 keywords) | A rule engine + heuristics |
| Images | M | A image metadata analysis |
| Vidéos / miniatures | M | A video metadata analysis |
| OCR | M | A `OcrService` (Tesseract if on PATH, else simulated) |
| Règles internes, mots interdits, trompeur, sensible, incohérent, non professionnel | P | A `ai_moderation_rules` CRUD + seeded rules + heuristics |
| Score risque / qualité | P | A computed scores |
| Rapport de vérification | D | A extended |
| 3 états | D | none |
| Blocage campagne non analysée / non validée | P (override bug) | A/B gates |
| Affichage dans dashboard admin | D | F3 extended |
| Validation finale admin obligatoire | D | none |
| Bonus in scope: recommandations, secteur, doublons, tableau erreurs IA/corrections | M | A |

### 3.6 Carte interactive
| Bullet | Today | Closed by |
|---|---|---|
| Carte dans le formulaire | D (MapLibre + OSM tiles, kept instead of Leaflet) | none |
| Sélection d'un point + rayon | M | F2 |
| Supports disponibles dans la zone | P | B `/api/availability?campaignId` + F2 |
| Enregistrement lat/lng/rayon + liaison campagne | M | A `PUT /api/campaigns/{id}/zones` |
| Seuls les supports de la zone ciblée diffusent | M | B reservation create + diffusion gate (distance ≤ radius) |
| Bonus in scope: multi-zones, filtre type de support, zones recommandées | M | A (≤5 circles), B `supportType`, B recommendations |

### 3.7 Disponibilité & réservation
| Bullet | Today | Closed by |
|---|---|---|
| Dates début/fin | D | none |
| Créneaux matin/après-midi/soir/journée/personnalisés | P | F1 `src/lib/time-slots.ts` + F2; B presets for alternatives |
| Disponibilité sur carte selon le temps | P | B `/api/availability` + F2 marker colors |
| États disponible/réservé/occupé/maintenance/hors ligne | M | B status derivation §2.7 |
| Blocage support déjà réservé même créneau | P (date-only, capacity ignored) | B conflict = date ∩ time overlap, count ≥ capacity |
| Réservation temporaire à la création | D | B adds cancel + expiry (EXPIREE) |
| Confirmation après validation admin | D | A confirms only live TEMPORAIRE reservations |
| Nombre de supports disponibles | M | B `summary.availableSupports` |
| Affichages disponibles estimés | M | B `summary.estimatedViewsAvailable` |
| Bonus in scope: créneaux alternatifs, comparaison zones | M | B `alternatives`, recommendations |

### 3.8 Supports
| Bullet | Today | Closed by |
|---|---|---|
| Création, modification, type, position, zone, statut technique, capacité | D | B: capacity now used for conflicts and views |
| Disponibilité par date et horaire | P | B blocks + availability |

### 3.9 API vérification IA
| Bullet | Today | Closed by |
|---|---|---|
| Lancer l'analyse | D | A eligibility rules §2.2 |
| Récupérer le rapport | D (400 when absent) | A: 404 `AI_REPORT_NOT_FOUND` |
| Afficher les problèmes | M | A `GET /api/ai/issues/{campaignId}` |
| Valider / refuser | D | A bodies |
| Blocage diffusion sans IA + admin | P | B gate |

### 3.10 API diffusion
| Bullet | Today | Closed by |
|---|---|---|
| Endpoint prochaine publicité | D | B v2 §2.5 |
| Filtrage zone support | P (`zone` ignored, no circle) | B |
| Temps courant | P (emergency time ignored) | B |
| Disponibilité + réservation | P (technical status ignored) | B |
| Statut IA + admin | P (override) | B |
| JSON | P (mediaUrl null, no emergency content) | B |
| Journalisation | D | B adds cost, reservation, interactions |

### 4. Moteur (4.1, 4.2, 4.3)
- Urgence first: **D**. Emergencies now use a datetime window and urgency ranking (B).
- Zone, date/time, confirmed reservation, campaign/AI/admin status: **D**. Circle enforcement and the override fix come from B.
- Budget disponible: **M**, closed by B.
- Fréquence max: **M**, closed by B.
- Rotation équitable: **M**, closed by B.
- AI score influences priority/frequency: **M**, closed by B (score formula).
- Contenu par défaut: **D**.
- Every AI decision logged: **D**, and preview checks are logged too (A).

### 5. Urgences
| Bullet | Today | Closed by |
|---|---|---|
| Création | D | none |
| Zone sur la carte | P | B circle fields + F3 map picker |
| Période et durée | P | B datetime window, `durationSeconds` returned |
| Priorité supérieure | D | none |
| Historique des messages diffusés | P | B `state`, `diffusionCount` + F3 |
| Arrêt automatique en fin de période | P | B scheduler (`stopReason: "AUTO"`) |
| Bonus in scope: niveaux d'urgence | P (stored, unused) | B ranking + F3 |

### 6. Statistiques
- Campaign counters (totales, actives, en attente, en attente IA, refusées ou signalées IA), supports disponibles, réservations confirmées: **D/P**. Closed by B's extended dashboard (`aiFlaggedCampaigns`, corrected `pendingCampaigns`).
- Affichages par campagne / support / zone: **M**. Closed by B `/api/statistics/views?groupBy=`.
- Budget estimé et consommé: **P**. Closed by B.
- Historique journalier: **M**. Closed by B `groupBy=day` + `/api/statistics/history`.
- Bonus in scope (graphiques, comparatif zones, dashboard IA, CSV): **M**. Closed by F2/F3 SVG charts, A `/api/ai/dashboard`, B `export.csv`.

### 7. Recherche & filtres
- Campagnes par nom/client/zone/statut, date, statut IA: **M**. Closed by A `GET /api/campaigns?...` + F3 moderation filters, and F2 `/mine` filters.
- Filtre disponibilité / type de support: **M**. Closed by B `/api/availability?status=&supportType=` and `/api/supports?supportType=`.
- Réservations conflictuelles: **M**. Closed by B `/api/reservations/conflicts` + F3.
- Supports sur carte: **D**.

### 8. Sécurité
| Bullet | Today | Closed by |
|---|---|---|
| Auth sécurisée | P | C |
| Séparation des rôles, limitation actions sensibles | D | none |
| Protection API | P | C JSON errors, A/B ownership |
| Contrôle d'accès campagnes | M | A `CampaignAccessGuard` (used by A and B) |
| Logs actions admin | M | C `audit_logs` (+ calls from A/B) |
| Validation avant diffusion, journalisation IA/admin, blocage sans IA | D/P | A/B |

### 11. Scénario de démonstration

Every step goes through these endpoints:

| Step(s) | Endpoints |
|---|---|
| 1 | register |
| 2 | `POST /campaigns` |
| 3 | media upload |
| 4–5 | `POST /campaigns/{id}/submit` (auto AI) + `/ai/report` |
| 6 | admin review dialog |
| 7–8 | wizard map, `PUT /zones` |
| 9 | slot presets |
| 10 | `/api/availability` |
| 11 | `/api/reservations/batch` |
| 12 | `/api/estimates/campaign/{id}` |
| 13 | `/admin/campaigns/{id}/validate` |
| 14–15 | `/ecran/{supportId}` → `/diffusion/next` |
| 16 | `/statistics/*` |
| 17–18 | `/api/emergency` → player takeover |

The wizard order becomes: details → content → zone & supports → submit. Reservations therefore already exist at submit time, which lets steps 4–12 be shown in CdC order on the detail page.

---

## 2. Backend API additions and changes

### 2.0 Cross-cutting (owner C unless stated)

**Error body.** Every error body has this shape (JSON, including 401/403 from the security chain):

```ts
interface ApiError { timestamp: string; status: number; code: string; message: string; path: string; errors?: Record<string, string> }
```

- `message` is always French.
- `code` is stable and machine-readable.
- `errors` maps a field (or a supportId) to a French message or a code.
- `ApiException` gains the constructors `(HttpStatus status, String code, String message)` and `(HttpStatus, String code, String message, Map<String,String> errors)`. The old 2-arg constructor stays, with default code `BAD_REQUEST` or `NOT_FOUND`.
- Any lane may add these two constructors verbatim if they are absent. C owns the file.

**Generic codes (C):**

| Code | Status | Trigger / message |
|---|---|---|
| `UNAUTHENTICATED` | 401 | no token on a protected route |
| `TOKEN_INVALID` | 401 | bad token |
| `TOKEN_EXPIRED` | 401 | expired token |
| `SESSION_REVOKED` | 401 | session revoked or missing |
| `ACCOUNT_DISABLED` | 401 | on login and on requests of a deactivated user |
| `BAD_CREDENTIALS` | 401 | « E-mail ou mot de passe incorrect. » |
| `ACCESS_DENIED` | 403 | wrong role |
| `VALIDATION_FAILED` | 400 | `errors` = field → French message, mapped from the constraint code (NotBlank « Champ obligatoire. », Email « Adresse e-mail invalide. », Size « Doit contenir entre {min} et {max} caractères. », Min/Max/DecimalMin/DecimalMax/Positive/PositiveOrZero/Pattern equivalents) |
| `INVALID_BODY` | 400 | malformed JSON / enum / date |
| `INVALID_PARAMETER` | 400 | type mismatch |
| `MISSING_PARAMETER` | 400 | missing request param or part |
| `NOT_FOUND` | 404 | unknown route |
| `METHOD_NOT_ALLOWED` | 405 | wrong HTTP method |
| `PAYLOAD_TOO_LARGE` | 413 | multipart limit exceeded |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | unsupported content type |
| `DATA_INTEGRITY` | 409 | « Opération impossible : des données liées existent ou une valeur est invalide. » |
| `INTERNAL_ERROR` | 500 | unexpected error |

Other rules for C:
- The JWT filter never fails public routes: an invalid token on a public route is ignored.
- The JWT filter skips the `Authorization` header entirely on `/api/auth/login` and `/api/auth/register`.
- CORS default becomes `http://localhost:3000,http://localhost:4200`.

**Shared helpers.** Exact signatures below. If a helper is absent, create it verbatim; only the owner changes it afterwards.
- `service/CampaignAccessGuard` (A), `@Component`:
  - `Campaign readable(Long campaignId)`: staff (ADMINISTRATEUR, SUPERVISEUR, OPERATEUR) can read any campaign. An ANNONCEUR only reads campaigns where `campaign.client.user.id` is the current user. Anything else → 404 `CAMPAIGN_NOT_FOUND`.
  - `Campaign owned(Long campaignId)`: the ANNONCEUR owner only; anything else → 404 `CAMPAIGN_NOT_FOUND`.
- `util/GeoUtils` (A): `static double distanceKm(double lat1, double lng1, double lat2, double lng2)` (haversine, R = 6371.0088) and `static boolean within(double lat, double lng, double cLat, double cLng, double radiusKm)`.
- `dto/PageResponse<T>` (A): `@Data @Builder` with fields `items, page, size, totalItems, totalPages` and `static <T> PageResponse<T> of(org.springframework.data.domain.Page<T>)`.
- `config/ClockConfig` (A): `@Bean Clock clock(ZelqaneProperties p)` = `Clock.system(ZoneId.of(p.getTimezone()))`. `ZelqaneProperties.timezone` defaults to `"Africa/Tunis"`.
- `config/SchedulingConfig` (A): `@EnableScheduling` + `@ConditionalOnProperty(name="zelqane.scheduler.enabled", havingValue="true", matchIfMissing=true)`. `application-test.yml` sets `zelqane.scheduler.enabled: false`. Every scheduler exposes a public `runOnce()` method that tests call directly.
- `service/storage/FileStorageService` (B), `@Service`:
  - `StoredFile store(MultipartFile file, String directory, String extension)`: `directory` is relative (e.g. `"campaigns/12"`) and the filename is `UUID + "." + extension`.
  - `Path resolve(String relativePath)`, `String publicUrl(String relativePath)` (= `zelqane.media.base-url + "/" + relativePath`), `void delete(String relativePath)`, `void deleteDirectory(String relativeDir)`, `String copy(String relativePath, String targetDirectory)`.
  - `static Optional<String> sniffMime(byte[] head)`, detecting by magic bytes: JPEG `FF D8 FF`, PNG `89 50 4E 47`, GIF `47 49 46 38`, WEBP `RIFF....WEBP`, MP4 `ftyp` at offset 4, WebM `1A 45 DF A3`.
  - `record StoredFile(String relativePath, long sizeBytes, String sha256)`.
  - Every path is normalised and must stay under `zelqane.media.upload-dir`; otherwise → 400 `INVALID_PARAMETER`.
- `service/AuditService` (C), `@Service`: `void record(String action, String entityType, Object entityId, String summary, Map<String,Object> details)`.
  - The actor (user, email, role) comes from the SecurityContext and may be null. The IP comes from `RequestContextHolder`: first `X-Forwarded-For` value, else `remoteAddr`.
  - It joins the caller's transaction.
  - Actions and entity types are listed in §2.9.

### 2.1 Campaign lifecycle and campaigns API (lane A)

**Status machine** (`CampaignStatus`, verbatim): `BROUILLON, PENDING_AI_CHECK, APPROVED_BY_AI, REVIEW_REQUIRED, REJECTED_BY_AI, VALIDATED_BY_ADMIN, ACTIVE, TERMINATED, BLOCKED`.

```
create ─► BROUILLON ──submit──► PENDING_AI_CHECK ──(AI, same request)──► APPROVED_BY_AI | REVIEW_REQUIRED | REJECTED_BY_AI
APPROVED_BY_AI | REVIEW_REQUIRED ──admin validate──► VALIDATED_BY_ADMIN (today < startDate) | ACTIVE (startDate ≤ today ≤ endDate)
VALIDATED_BY_ADMIN ──scheduler (startDate ≤ today)──► ACTIVE
VALIDATED_BY_ADMIN | ACTIVE ──scheduler (endDate < today | budget>0 ∧ consumedBudget ≥ budget)──► TERMINATED
APPROVED_BY_AI | REVIEW_REQUIRED | REJECTED_BY_AI | VALIDATED_BY_ADMIN | ACTIVE ──admin reject──► BLOCKED
REJECTED_BY_AI | BLOCKED ──PUT campaign | PUT zones | POST reopen──► BROUILLON
```

**Transition rules:**
- **Reopen (to BROUILLON):**
  - Sets `aiStatus=null`, `adminStatus=null`, `aiOverride=false`, `submittedAt=null`, `validatedAt=null`.
  - Keeps `rejectionReason` (shown as « Motif du dernier refus ») until the next admin decision.
  - Reservations are untouched: BLOCKED ones are already ANNULEE, and REJECTED_BY_AI TEMPORAIRE holds stay until expiry.
- **Editable** (PUT campaign, PUT zones, media add/delete by B, reservations by B) only in `BROUILLON`. PUT campaign and PUT zones auto-reopen `REJECTED_BY_AI | BLOCKED` first. Media and reservations require BROUILLON, else 409 `CAMPAIGN_NOT_EDITABLE`.
- **Deletable:** `BROUILLON | REJECTED_BY_AI | BLOCKED`. After commit, the campaign's media directory is deleted best-effort through `FileStorageService.deleteDirectory("campaigns/{id}")`.
- **Client status:** a client with `validationStatus` `REJECTED | SUSPENDED` gets 403 `CLIENT_NOT_ALLOWED` on create, update, submit, duplicate, reservations (B) and media (B). `PENDING` clients are allowed; the admin sees a badge.
- **Scheduler** `scheduler/CampaignLifecycleScheduler` runs cron `0 * * * * *`. It applies the two scheduler transitions above and sets `activatedAt` / `terminatedAt` / `terminationReason` (`PERIODE_TERMINEE | BUDGET_EPUISE`).
- **Validate:**
  - Also sets `activatedAt` when the result is ACTIVE.
  - Reservation writes by A are limited to lifecycle transitions: every `TEMPORAIRE` reservation with `endDate ≥ today` becomes `CONFIRMEE`.
  - Creates one `payments_simulation` row: `amount = budgetEstimated = Σ estimatedCost(confirmed)`, `budgetConsumed = 0`, `paymentStatus = SIMULATED`, `notes = "Simulation créée à la validation"`.
  - Recomputes `campaign.estimatedViews = Σ estimatedViews` of `TEMPORAIRE|CONFIRMEE` reservations.
- **Reject:** `TEMPORAIRE|CONFIRMEE` reservations become `ANNULEE`; `estimatedViews` is recomputed.

**`CampaignRequest`** (changes: times accept `HH:mm` or `HH:mm:ss`):
```ts
interface CampaignRequest { name: string /*1..200*/; objective?: string|null /*≤5000*/; budget: number /*≥0*/;
  startDate?: string|null; endDate?: string|null; startTime?: string|null; endTime?: string|null }
```

Validation errors:

| Code | Status | Rule |
|---|---|---|
| `INVALID_PERIOD` | 400 | `endDate < startDate` |
| `INVALID_TIME_RANGE` | 400 | `startTime ≥ endTime`, or only one of the two is set |
| `START_DATE_IN_PAST` | 400 | `startDate < today`, on create, or on update when the date changed |

PUT side effect: `TEMPORAIRE` reservations no longer inside `[startDate,endDate] × [startTime,endTime]` become `ANNULEE`.

**`CampaignResponse`** (full shape, replaces AC §5.2):
```ts
interface CampaignResponse {
  id: number; clientId: number; clientName: string; clientCompanyName: string | null;
  clientValidationStatus: "PENDING"|"VALIDATED"|"REJECTED"|"SUSPENDED";
  name: string; objective: string | null;
  budget: number; consumedBudget: number; remainingBudget: number; estimatedCost: number; // Σ TEMPORAIRE|CONFIRMEE
  status: CampaignStatus; aiStatus: "APPROVED"|"REVIEW_REQUIRED"|"REJECTED"|null;
  adminStatus: "PENDING"|"VALIDATED"|"REJECTED"|null; aiOverride: boolean;
  startDate: string|null; endDate: string|null; startTime: string|null; endTime: string|null;
  estimatedViews: number; priorityScore: number; // 0..10
  aiRiskScore: number|null; aiQualityScore: number|null; aiSector: AiSector|null; // latest non-preview check
  rejectionReason: string|null; adminComment: string|null;
  terminationReason: "PERIODE_TERMINEE"|"BUDGET_EPUISE"|null;
  mediaUrl: string|null; mediaType: "IMAGE"|"VIDEO"|"BANNER"|null; mediaCount: number; // first media by sortOrder,id
  zones: CampaignZoneResponse[]; reservationsCount: number; // TEMPORAIRE|CONFIRMEE
  duplicatedFromId: number|null;
  editable: boolean; submittable: boolean; deletable: boolean; // computed for BROUILLON/reopenable/deletable rules
  createdAt: string; updatedAt: string; submittedAt: string|null; validatedAt: string|null;
  activatedAt: string|null; terminatedAt: string|null;
}
type AiSector = "RESTAURATION"|"EVENEMENT"|"IMMOBILIER"|"SERVICE"|"COMMERCE"|"SANTE"|"FORMATION"|"TRANSPORT"|"AUTRE";
interface CampaignZoneResponse { id: number; zoneId: number; zoneName: string; label: string|null;
  latitude: number; longitude: number; radiusKm: number; supportsInside: number }
```

**Endpoints:**

| Method & path | Roles | Behaviour |
|---|---|---|
| `POST /api/campaigns` | ANNONCEUR | 201 CampaignResponse (BROUILLON) |
| `GET /api/campaigns` | ADMINISTRATEUR, SUPERVISEUR | **Search**, `PageResponse<CampaignResponse>`. Query: `q` (name contains, case-insensitive); `client` (company name, user nom or email contains); `clientId`; `zoneId` (campaign_zones.zone_id or reservations.zone_id); `status` (comma list); `aiStatus` (comma list APPROVED,REVIEW_REQUIRED,REJECTED); `from`,`to` (campaign period overlaps [from,to]; a campaign with null dates never matches when a date filter is set); `supportType` (comma list; has a TEMPORAIRE/CONFIRMEE reservation on such a support); `sort` ∈ `createdAt` (default desc), `name`, `startDate`, `budget`, `submittedAt`. Implemented with `JpaSpecificationExecutor<Campaign>`. |
| `GET /api/campaigns/mine` | ANNONCEUR | `CampaignResponse[]` sorted by createdAt desc, same filters `q,status,aiStatus,from,to,zoneId` |
| `GET /api/campaigns/{id}` | ANNONCEUR (owner), ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | 200 / 404 |
| `PUT /api/campaigns/{id}` | ANNONCEUR owner | 200; auto-reopen; 409 `CAMPAIGN_NOT_EDITABLE` in other statuses |
| `DELETE /api/campaigns/{id}` | ANNONCEUR owner | 204; 409 `CAMPAIGN_NOT_EDITABLE` |
| `POST /api/campaigns/{id}/reopen` | ANNONCEUR owner | from `REJECTED_BY_AI|BLOCKED` → BROUILLON, 200; otherwise 409 `CAMPAIGN_NOT_EDITABLE` |
| `POST /api/campaigns/{id}/submit` | ANNONCEUR owner | Requires BROUILLON, else 409 `CAMPAIGN_NOT_SUBMITTABLE`. Completeness checks give 400 `SUBMIT_INCOMPLETE`, with `errors` keys among: `period` (dates missing or `endDate < today`), `times`, `budget` (≤0), `zones` (none), `reservations` (no TEMPORAIRE with endDate ≥ today). Then PENDING_AI_CHECK + `submittedAt`, then runs the AI analysis (§2.2) in the same transaction. 200 CampaignResponse with the resulting status and AI fields. |
| `POST /api/campaigns/{id}/duplicate` | ANNONCEUR owner | Body `{ includeMedia?: boolean /*default true*/ }`. 201 new BROUILLON named `"Copie de " + name` (truncated to 200). Copies objective, budget, times, zones and (optionally) media files (`FileStorageService.copy`); `duplicatedFromId`. Dates are copied only if `startDate ≥ today`, else null. Reservations are never copied. |
| `GET /api/campaigns/{id}/zones` | readable | `CampaignZoneResponse[]` |
| `PUT /api/campaigns/{id}/zones` | ANNONCEUR owner | Body `{ zones: { latitude: number; longitude: number; radiusKm: number /*0.1..50*/; label?: string|null /*≤150*/ }[] /*1..5*/ }`; >5 → 400 `ZONE_LIMIT_EXCEEDED`. Replaces all rows; auto-reopen. `zone_id` resolution: the active zone whose own circle (lat, lng, radiusKm) contains the point, nearest first; else the nearest active zone; none → 400 `INVALID_ZONE`. Side effect: TEMPORAIRE reservations whose support is outside every new circle become ANNULEE. 200 `{ zones: CampaignZoneResponse[]; cancelledReservationIds: number[] }`. |

**Admin decisions** (`/api/admin/campaigns`, ADMINISTRATEUR):

| Method & path | Body | Behaviour |
|---|---|---|
| `POST /{id}/validate` | `{ overrideAi?: boolean; comment?: string|null /*≤1000*/; priorityScore?: number|null /*0..10*/ }` (body optional) | Status must be `APPROVED_BY_AI|REVIEW_REQUIRED`, else 409 `CAMPAIGN_NOT_REVIEWABLE`. REVIEW_REQUIRED without `overrideAi=true` → 400 `AI_OVERRIDE_REQUIRED`. `endDate < today` → 409 `CAMPAIGN_PERIOD_OVER`. No TEMPORAIRE reservation with endDate ≥ today → 409 `NO_RESERVATION_TO_CONFIRM`. Client REJECTED/SUSPENDED → 409 `CLIENT_NOT_ALLOWED`. Effects: `adminStatus=VALIDATED`, `aiOverride = (status was REVIEW_REQUIRED)`, `adminComment`, `priorityScore` if given, status per the machine, `validatedAt`, reservation confirmation, payment simulation. The latest non-preview `ai_content_checks.admin_decision = VALIDATED`. `ai_decision_logs` row: `decisionType=ADMIN`, `decision = "VALIDATED" | "VALIDATED_OVERRIDE"`, `reason = comment ?? default French`. Audit `CAMPAIGN_VALIDATED` / `CAMPAIGN_VALIDATED_OVERRIDE`. 200 CampaignResponse. |
| `POST /{id}/reject` | `{ reason: string /*3..1000*/ }` (legacy `?reason=` accepted when there is no body) | Missing → 400 `REJECT_REASON_REQUIRED`. Allowed from `APPROVED_BY_AI|REVIEW_REQUIRED|REJECTED_BY_AI|VALIDATED_BY_ADMIN|ACTIVE`, else 409 `CAMPAIGN_NOT_REVIEWABLE`. Effects: BLOCKED, `adminStatus=REJECTED`, `rejectionReason`, reservations ANNULEE, check `admin_decision=REJECTED`, decision log `REJECTED`, audit `CAMPAIGN_REJECTED`. **200 CampaignResponse** (was MessageResponse). |
| `PUT /{id}/priority` | `{ priorityScore: number /*0..10*/ }` | Allowed in `APPROVED_BY_AI|REVIEW_REQUIRED|VALIDATED_BY_ADMIN|ACTIVE`, else 409 `PRIORITY_NOT_EDITABLE`. Audit `CAMPAIGN_PRIORITY_CHANGED`. 200 CampaignResponse. |

### 2.2 AI verification (lane A)

**`POST /api/ai/check-content/{campaignId}`** (synchronous):
- **Eligibility:**
  - ANNONCEUR owner on `BROUILLON` runs a **preview**: the check is stored with `is_preview=true` and the decision log gets reason prefix « Pré-analyse : ». Campaign status and aiStatus stay unchanged.
  - ANNONCEUR owner on `PENDING_AI_CHECK` retries the analysis and applies the result.
  - ADMINISTRATEUR on `PENDING_AI_CHECK|APPROVED_BY_AI|REVIEW_REQUIRED` re-runs the analysis and applies the result (audit `AI_CHECK_RERUN`). A re-run clears `aiOverride`.
  - Anything else → 409 `CAMPAIGN_NOT_ELIGIBLE_FOR_AI`.
- **Result mapping:** `APPROVED→APPROVED_BY_AI`, `REVIEW_REQUIRED→REVIEW_REQUIRED`, `REJECTED→REJECTED_BY_AI`, with `campaign.aiStatus` set accordingly. Every run writes `ai_content_checks` + `ai_decision_logs` (`decisionType=AI`, `decision` = AI status name).

**Pipeline** (`service/ai/ContentAnalysisPipeline`, pure and unit-testable):
1. **Inputs:**
   - Text: `name + "\n" + objective`, normalized (lowercase, accents stripped with `Normalizer` NFD + remove `\p{M}`).
   - Media: rows of `media_files` for the campaign.
   - Active `ai_moderation_rules`.
   - Budget.
2. **Rules:**
   - `ruleType` `KEYWORD`: `pattern` is a comma-separated list of normalized phrases, each matched as a whole word/phrase (`\b…\b`).
   - `ruleType` `REGEX`: case-insensitive Java regex on the normalized text.
   - Rules apply to the text and to OCR text. An issue found in OCR text is labelled `"texte dans l'image : " + description`.
   - Severity adds risk points: `LOW +10`, `MEDIUM +25`, `HIGH +45`, `CRITICAL +80`.
3. **Heuristics:**
   - Base values: risk 10, quality 85. All scores are clamped to 0..100.
   - Risk: uppercase letters > 60 % of letters (≥ 12 letters) → risk +10 and quality −10 « texte en majuscules »; `!!!` or more → risk +5 « ponctuation excessive »; budget ≤ 0 → risk +25 MEDIUM « budget insuffisant ».
   - Text quality: objective blank → quality −25 « objectif absent »; text < 30 chars → quality −15 « texte trop court »; no media → quality −15 « aucun visuel fourni ».
   - Image quality: width < 800 or height < 450 → −15 « résolution insuffisante »; aspect ratio not within ±15 % of 16:9, 9:16 or 1:1 → −5 « format inadapté aux écrans »; file < 20 KB → −10 « fichier très léger ».
   - Video quality: `durationSeconds` null → −5 « durée vidéo inconnue »; > 60 s → −10 « vidéo trop longue pour un Porteur ».
   - OCR: extracted text > 200 chars → quality −10 « trop de texte dans le visuel ».
   - **Duplicate:** same `checksum` as a media file of another campaign → risk +15 MEDIUM « média identique à celui de la campagne #id ».
4. **OCR** (`service/ai/OcrService` interface):
   - Applies to `IMAGE|BANNER` only.
   - `TesseractOcrService` is used when `zelqane.ai.ocr.mode` is `tesseract`, or `auto` and `tesseract --version` exits 0 within 5 s (probed once, lazily). It runs `tesseract <abs file> stdout -l fra+eng` with a 20 s timeout; on failure it falls back to simulated OCR.
   - `SimulatedOcrService`: strips the extension from the original file name, splits on `[-_. ]+`, drops tokens that are pure digits or match `(?i)img|dsc|image|photo|screenshot|whatsapp`, and keeps the result if it has ≥ 3 letters.
   - `ocrEngine` is `TESSERACT`, `SIMULE` (simulated produced text) or `AUCUN` (no image, or nothing extracted). Videos give `AUCUN`. No new native dependency is added.
5. **Sector** (`SectorClassifier`):
   - Keyword dictionary over text + OCR; the highest hit count wins; no hit → `AUTRE`.
   - `SANTE` → risk +10 « secteur sensible (santé) : allégations à vérifier ».
6. **Status:**
   - `REJECTED` if any CRITICAL rule hit or risk > 70.
   - Else `REVIEW_REQUIRED` if risk ≥ 31, or any HIGH hit, or quality < 40.
   - Else `APPROVED`.
7. **Recommendations:** one French improvement string per quality issue (e.g. « Fournissez un visuel d'au moins 1280×720 px »), plus a summary `recommendation`:
   - APPROVED: « Contenu conforme pour diffusion »
   - REVIEW_REQUIRED: « Vérification manuelle avant diffusion »
   - REJECTED: « Contenu non diffusable en l'état : corrigez les points signalés »
8. **OpenAI** (existing client): if configured, the prompt gets text + OCR + media metadata. Merge rules: risk = max, quality = min, status = most severe, issues = union (source `OPENAI`), `engine = "LOCAL_OPENAI"`. On any failure: local result with `engine = "LOCAL"`, and reason mentions the fallback.

**Stored per check (V3 columns):** `extracted_text`, `ocr_engine`, `sector`, `recommendations` (json string[]), `issues` (json AiIssue[]), `media_analyses` (json), `matched_rules` (json), `engine`, `is_preview`. `content_type` is `VIDEO` if any video, else `IMAGE` if any image/banner, else `TEXTE`. `media_id` is the primary media.

```ts
interface AiReportResponse {
  campaignId: number; checkId: number; aiStatus: "approved"|"review_required"|"rejected"; // lowercase kept
  riskScore: number; qualityScore: number; detectedIssues: string[]; issues: AiIssue[];
  recommendation: string|null; recommendations: string[]; reason: string|null; sector: AiSector|null;
  contentType: "TEXTE"|"IMAGE"|"VIDEO"|"MINIATURE"; extractedText: string|null; ocrEngine: "TESSERACT"|"SIMULE"|"AUCUN";
  engine: "LOCAL"|"OPENAI"|"LOCAL_OPENAI"; mediaAnalyses: AiMediaAnalysis[];
  matchedRules: { ruleId: number|null; ruleName: string; severity: Severity }[];
  preview: boolean; adminDecision: "VALIDATED"|"REJECTED"|"PENDING"|null; checkedAt: string;
}
type Severity = "LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
interface AiIssue { label: string; severity: Severity; source: "TEXTE"|"IMAGE"|"VIDEO"|"OCR"|"REGLE"|"OPENAI"|"SECTEUR"|"DOUBLON" }
interface AiMediaAnalysis { mediaId: number; fileName: string; contentType: "IMAGE"|"VIDEO"|"MINIATURE";
  widthPx: number|null; heightPx: number|null; durationSeconds: number|null; extractedText: string|null; issues: string[] }
```

| Method & path | Roles | Response |
|---|---|---|
| `GET /api/ai/report/{campaignId}` | readable (ANNONCEUR owner, ADMIN, SUPERVISEUR) | latest check (preview or not); 404 `AI_REPORT_NOT_FOUND` |
| `GET /api/ai/issues/{campaignId}` | readable | `{ campaignId: number; checkId: number; aiStatus: string; issues: AiIssue[] }`; 404 `AI_REPORT_NOT_FOUND` |
| `GET /api/ai/checks/{campaignId}` | readable | `AiReportResponse[]` newest first |
| `GET /api/ai/rules` | ADMINISTRATEUR, SUPERVISEUR | `AiRuleResponse[]` (query `active`, `ruleType`) |
| `POST /api/ai/rules` | ADMINISTRATEUR | 201. Body `AiRuleRequest`. 409 `AI_RULE_NAME_TAKEN`, 400 `INVALID_REGEX` (compile check), audit `AI_RULE_CREATED` |
| `PUT /api/ai/rules/{id}` | ADMINISTRATEUR | 200; 404 `AI_RULE_NOT_FOUND`; audit `AI_RULE_UPDATED` |
| `DELETE /api/ai/rules/{id}` | ADMINISTRATEUR | 204; audit `AI_RULE_DELETED` |
| `GET /api/ai/decisions` | ADMINISTRATEUR, SUPERVISEUR | `PageResponse<AiDecisionLogResponse>`; query `campaignId, decisionType (AI|ADMIN), decision, from, to` (dates on createdAt) |
| `GET /api/ai/dashboard` | ADMINISTRATEUR, SUPERVISEUR | `AiDashboardResponse` |

```ts
interface AiRuleRequest { ruleName: string /*1..150*/; ruleType: "KEYWORD"|"REGEX"; pattern: string /*1..2000*/;
  severity: Severity; sector?: AiSector|null; isActive?: boolean /*default true*/; description?: string|null }
interface AiRuleResponse extends Required<AiRuleRequest> { id: number; createdAt: string; updatedAt: string }
interface AiDecisionLogResponse { id: number; campaignId: number; campaignName: string; checkId: number;
  decisionType: "AI"|"ADMIN"; decision: string; reason: string|null; decidedByUserId: number|null;
  decidedByName: string|null; riskScore: number; qualityScore: number; preview: boolean; createdAt: string }
interface AiDashboardResponse { totalChecks: number; avgRiskScore: number; avgQualityScore: number; // non-preview
  approvedCount: number; reviewRequiredCount: number; rejectedCount: number;
  adminValidatedCount: number; adminRejectedCount: number; validationRate: number; rejectionRate: number; // 0..1 over admin decisions
  overrideCount: number; disagreementCount: number; // AI APPROVED→admin REJECTED, or AI REVIEW/REJECTED→admin VALIDATED
  bySector: { sector: AiSector; count: number }[]; topIssues: { label: string; count: number }[] /*10*/ }
```

**Seeded rules** (V3, `ON CONFLICT (rule_name) DO NOTHING`):

| rule_name | rule_type | pattern | severity | sector |
|---|---|---|---|---|
| `promesse-gratuit-garanti` | KEYWORD | `gratuit, garanti, garantie, 100% garanti` | MEDIUM | null |
| `allegations-miracles` | KEYWORD | `miracle, sans effort, guerison, resultat immediat` | HIGH | SANTE |
| `jeux-argent` | KEYWORD | `casino, paris sportifs, jackpot` | HIGH | null |
| `alcool-tabac` | KEYWORD | `alcool, biere, whisky, cigarette, tabac, chicha` | HIGH | null |
| `armes-drogues` | KEYWORD | `arme a feu, munitions, cannabis, cocaine` | CRITICAL | null |
| `incitation-haine` | KEYWORD | `incitation a la haine` | CRITICAL | null |
| `donnees-sensibles` | REGEX | `\b(rib|iban|code pin|mot de passe)\b` | HIGH | null |
| `urgence-artificielle` | REGEX | `(derniere chance|offre limitee).{0,20}!{2,}` | LOW | null |

Each seeded rule gets a French description. Tests with H2 get no seeds, so the pipeline must also be tested with explicit rules.

### 2.3 Media (lane B)

`MediaController` is mapped at `/api/campaigns/{campaignId}/media`.

| Method & path | Roles | Behaviour |
|---|---|---|
| `POST` multipart | ANNONCEUR owner | Parts: `file` (required), `kind` (`BANNER` optional, images only), `durationSeconds` (optional int 1..600, videos). Campaign must be BROUILLON, else 409 `CAMPAIGN_NOT_EDITABLE`. Allowed: `image/jpeg, image/png, image/webp, image/gif` (IMAGE/BANNER, ≤ `zelqane.media.max-image-bytes` = 10 MB) and `video/mp4, video/webm` (VIDEO, ≤ `zelqane.media.max-video-bytes` = 50 MB). Declared type not allowed → 415 `MEDIA_TYPE_UNSUPPORTED`. Sniffed bytes ≠ declared family → 415 `MEDIA_CONTENT_MISMATCH`. Size → 413 `MEDIA_TOO_LARGE`. More than `zelqane.media.max-files-per-campaign` = 5 → 400 `MEDIA_LIMIT_REACHED`. Stored under `campaigns/{campaignId}/`, sha256 checksum, `widthPx`/`heightPx` via `ImageIO` (null if unreadable), `sortOrder` = count. 201 `MediaFileResponse`. |
| `GET` | readable | `MediaFileResponse[]` by sortOrder, id |
| `DELETE /{mediaId}` | ANNONCEUR owner, BROUILLON | 204; file deleted; 404 `MEDIA_NOT_FOUND` |

```ts
interface MediaFileResponse { id: number; campaignId: number; fileName: string; fileType: "IMAGE"|"VIDEO"|"BANNER";
  mimeType: string; fileSizeBytes: number; durationSeconds: number|null; widthPx: number|null; heightPx: number|null;
  url: string /* "/uploads/campaigns/12/<uuid>.jpg" */; checksum: string; sortOrder: number; createdAt: string }
```

Serving and limits:
- **Public** `GET /uploads/**`: `config/MediaWebConfig` adds a resource handler on `file:<absolute upload-dir>/`, with cache 1 day. Range requests are supported through `ResourceHttpRequestHandler`. B adds `"/uploads/**"` to `SecurityConfig.PUBLIC_ENDPOINTS`.
- `spring.servlet.multipart.max-file-size` / `max-request-size` become `60MB`. C maps `MaxUploadSizeExceededException` → 413 `PAYLOAD_TOO_LARGE`.

### 2.4 Zones, supports, availability, estimates, reservations (lane B)

**Zones.**
- The existing CRUD is unchanged, except that DELETE with dependents → 409 `ZONE_IN_USE`.
- Audits: `ZONE_CREATED`, `ZONE_UPDATED`, `ZONE_DELETED`.
- `GET /api/zones/recommendations?startDate&endDate&startTime&endTime&supportType&limit` (roles: the 4 roles; `limit` default 3, max 10) returns `ZoneRecommendation[]`:
  - A zone's candidates are its own supports (`support.zone`), evaluated with the availability rules of §2.7.
  - `score = round(50·views/maxViews + 30·available/total + 20·recent/maxRecent)`, where each ratio is 0 when its denominator is 0.
  - `recent` = PUBLICITE diffusion logs of the last 30 days / total supports.
  - Zones with 0 available supports are excluded. Results are sorted by score desc.
  - `reasons` are French, e.g. « 4 Porteurs disponibles sur 5 », « Forte audience récente ».

```ts
interface ZoneRecommendation { zone: ZoneResponse; score: number; totalSupports: number; availableSupports: number;
  estimatedViewsAvailable: number; estimatedCostAvailable: number; recentViewsPerSupport: number; reasons: string[] }
```

**Supports.**
- `SupportRequest`/`SupportResponse` gain `visibilityScore: number|null` (0..100). The response also gains `distanceKm: number|null`, filled only by availability.
- `GET /api/supports?zoneId&supportType&technicalStatus` (comma lists) filters.
- Audits: `SUPPORT_CREATED`, `SUPPORT_UPDATED`.
- **Blocks** (`support_availability`):
  - `GET /api/supports/{id}/blocks?from&to` (4 roles) returns `SupportBlockResponse[]`.
  - `POST /api/supports/{id}/blocks` (ADMINISTRATEUR) takes `{ startDate; endDate /*≤92 days*/; startTime; endTime; availabilityStatus: "MAINTENANCE"|"HORS_LIGNE"|"OCCUPE"; reason?: string|null /*≤255*/ }` and returns 201 `SupportBlockResponse[]` (one row per day). Audit `SUPPORT_BLOCK_CREATED`.
  - `DELETE /api/supports/{id}/blocks/{blockId}` returns 204. Audit `SUPPORT_BLOCK_DELETED`.
  - Existing reservations are not cancelled by blocks.
- `GET /api/supports/{id}/availability` gains optional `startTime`,`endTime` (both → time-overlap filter). Slots gain `kind: "RESERVATION"|"BLOCAGE"`, `availabilityStatus`, `reason`, and `reservationStatus` becomes nullable (null for blocks).

```ts
interface SupportBlockResponse { id: number; supportId: number; date: string; startTime: string; endTime: string;
  availabilityStatus: "MAINTENANCE"|"HORS_LIGNE"|"OCCUPE"; reason: string|null; createdAt: string }
```

**Availability:** `GET /api/availability` (ANNONCEUR, ADMINISTRATEUR, SUPERVISEUR, OPERATEUR).
- **Query:**
  - `startDate`, `endDate`, `startTime`, `endTime` are required. Range > 366 days or inverted dates → 400 `INVALID_RANGE`. `startTime ≥ endTime` → 400 `INVALID_TIME_RANGE`.
  - Exactly one target: `campaignId` (the union of its campaign_zones circles; ANNONCEUR must own it), **or** `lat`+`lng`+`radiusKm` (0.1..50), **or** `zoneId`. None → 400 `MISSING_PARAMETER`.
  - Optional filters: `supportType` (comma list) and `status` (comma list of AvailabilityStatus).
- **Response:**

```ts
interface AvailabilityResponse { startDate: string; endDate: string; startTime: string; endTime: string; days: number; hoursPerDay: number;
  supports: SupportAvailabilityItem[];
  summary: { totalSupports: number; availableSupports: number; reservedSupports: number; occupiedSupports: number;
    maintenanceSupports: number; offlineSupports: number; estimatedViewsAvailable: number; estimatedCostAvailable: number };
  alternatives: AlternativeSlot[] }
interface SupportAvailabilityItem { support: SupportResponse; distanceKm: number|null;
  status: "DISPONIBLE"|"RESERVE"|"OCCUPE"|"MAINTENANCE"|"HORS_LIGNE"; remainingCapacity: number;
  reservedByCampaign: boolean; campaignReservationId: number|null; conflicts: SupportAvailabilitySlot[];
  estimatedViews: number; estimatedCost: number }
interface AlternativeSlot { startDate: string; endDate: string; startTime: string; endTime: string;
  preset: "MATIN"|"APRES_MIDI"|"SOIR"|"JOURNEE"|null; availableSupports: number; estimatedViewsAvailable: number }
```

- Items are sorted by distance, then name.
- `alternatives` is computed only when `summary.availableSupports == 0`:
  1. Same dates with each preset different from the requested window.
  2. Same window shifted by +7, +14, +21 and +28 days.
  3. Keep entries with `availableSupports > 0`, sort by availableSupports desc then earliest start, and return the top 3.
- **Presets** (identical in F1):

| Preset | Window |
|---|---|
| `MATIN` | 07:00:00–12:00:00 |
| `APRES_MIDI` | 12:00:00–18:00:00 |
| `SOIR` | 18:00:00–23:00:00 |
| `JOURNEE` | 07:00:00–23:00:00 |

**Estimates:**
- `POST /api/estimates` (4 roles) takes `{ supportIds: number[] /*1..100*/; startDate; endDate; startTime; endTime }` and returns `{ days: number; hoursPerDay: number; lines: { supportId: number; supportName: string; supportType: SupportType; zoneName: string; estimatedViews: number; estimatedCost: number }[]; totalViews: number; totalCost: number }`.
- `GET /api/estimates/campaign/{id}` (readable) returns `{ campaignId: number; budget: number; consumedBudget: number; remainingBudget: number; lines: { reservationId: number; supportId: number; supportName: string; zoneName: string; reservationStatus: "TEMPORAIRE"|"CONFIRMEE"; startDate: string; endDate: string; startTime: string; endTime: string; estimatedViews: number; estimatedCost: number }[]; totalViews: number; totalCost: number; budgetCoverage: number|null /* budget/totalCost */; budgetSufficient: boolean }`.

**Reservations:**
```ts
interface ReservationRequest { campaignId: number; supportId: number; zoneId?: number|null /*ignored: zone = support.zone*/;
  startDate?: string|null; endDate?: string|null; startTime?: string|null; endTime?: string|null /* default: campaign values */ }
interface ReservationResponse { id: number; campaignId: number; campaignName: string; campaignStatus: CampaignStatus;
  clientCompanyName: string|null; zoneId: number; zoneName: string; supportId: number; supportName: string; supportType: SupportType;
  startDate: string; endDate: string; startTime: string; endTime: string;
  availabilityStatus: AvailabilityStatus; reservationStatus: "TEMPORAIRE"|"CONFIRMEE"|"ANNULEE"|"EXPIREE";
  estimatedViews: number; estimatedCost: number; createdAt: string;
  cancelledAt: string|null; cancelReason: string|null; expiredAt: string|null; cancellable: boolean /* for caller */ }
```

| Method & path | Roles | Behaviour |
|---|---|---|
| `POST /api/reservations` | ANNONCEUR owner | Checks in order: 1. campaign BROUILLON, else 409 `CAMPAIGN_NOT_RESERVABLE`; 2. client allowed; 3. window complete (400 `SUBMIT_INCOMPLETE`-style `VALIDATION_FAILED`) and `startDate ≥ today` (400 `START_DATE_IN_PAST`); 4. window inside campaign dates & times, else 400 `RESERVATION_OUTSIDE_CAMPAIGN_PERIOD`; 5. campaign has zones, else 400 `CAMPAIGN_ZONE_REQUIRED`; 6. support inside ≥1 circle, else 400 `SUPPORT_OUTSIDE_CAMPAIGN_ZONE`; 7. same campaign already holds an overlapping TEMPORAIRE/CONFIRMEE on the support → 409 `RESERVATION_DUPLICATE`; 8. status (§2.7) `MAINTENANCE|HORS_LIGNE` → 409 `SUPPORT_UNAVAILABLE`, `RESERVE|OCCUPE` → 409 `SUPPORT_ALREADY_RESERVED`. Creates TEMPORAIRE / `availabilityStatus RESERVE` with the §2.6 estimates. Recomputes `campaign.estimatedViews`. 201. |
| `POST /api/reservations/batch` | ANNONCEUR owner | `{ campaignId; supportIds: number[] /*1..50*/; startDate?; endDate?; startTime?; endTime? }`, all-or-nothing. 201 `ReservationResponse[]`, or 409 `BATCH_CONFLICT` with `errors = { "<supportId>": "<CODE>" }` and nothing persisted. |
| `POST /api/reservations/{id}/cancel` | ANNONCEUR owner, ADMINISTRATEUR | `{ reason?: string|null /*≤255*/ }`. Annonceur: TEMPORAIRE only, campaign `BROUILLON|REJECTED_BY_AI`. Admin: TEMPORAIRE or CONFIRMEE, any campaign status, audit `RESERVATION_CANCELLED`. Otherwise 409 `RESERVATION_NOT_CANCELLABLE`. Sets ANNULEE, `cancelledAt`, `cancelledByUserId`, `cancelReason`; recomputes estimatedViews. 200 ReservationResponse. |
| `GET /api/reservations` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | `PageResponse<ReservationResponse>`; query `status` (list), `campaignId, supportId, zoneId, clientId, from, to` (window overlap), `sort` default `createdAt,desc` |
| `GET /api/reservations/mine` | ANNONCEUR | `ReservationResponse[]`; query `status, campaignId` |
| `GET /api/reservations/campaign/{campaignId}` | readable | `ReservationResponse[]` |
| `GET /api/reservations/conflicts` | ADMINISTRATEUR, SUPERVISEUR | Query `from` (default today), `to` (default +90), `zoneId`, `supportId`. For each support, for each active reservation r: S = reservations overlapping r (dates ∩ times, incl. r). `|S| > capacity` → `CONFLIT`; `|S| == capacity ≥ 2` → `SATURE`. Identical sets are deduplicated. The overlap window is the intersection of S (r's own window if empty). Returns `ReservationConflict[]`. |

```ts
interface ReservationConflict { supportId: number; supportName: string; zoneId: number; zoneName: string; capacity: number;
  severity: "CONFLIT"|"SATURE"; overlapStartDate: string; overlapEndDate: string; overlapStartTime: string; overlapEndTime: string;
  reservations: ReservationResponse[] }
```

**Expiry scheduler** `scheduler/ReservationExpiryScheduler` (cron `0 */5 * * * *`). A `TEMPORAIRE` reservation becomes `EXPIREE` (`expiredAt=now`) when either:
- `endDate < today`, or
- its campaign is `BROUILLON|REJECTED_BY_AI` and `createdAt < now − zelqane.reservation.temporary-ttl-hours` (default 72).

It then recomputes estimatedViews of the affected campaigns.

### 2.5 Diffusion engine (lane B)

**`GET /api/diffusion/next?supportId&zone&datetime`** (public). `supportId` is required (missing → 400 `MISSING_PARAMETER`). `datetime` is optional and defaults to now.

```
support = find(supportId) else 404 SUPPORT_NOT_FOUND
if zone not blank and !zone.equalsIgnoreCase(support.zone.name) → 400 SUPPORT_ZONE_MISMATCH
d = datetime.date, t = datetime.time
1. EMERGENCY: E = emergencies where isActive ∧ startAt ≤ datetime ≤ endAt
     (startAt = startDate+ (startTime ?? 00:00:00), endAt = endDate + (endTime ?? 23:59:59))
     ∧ (circle set ? GeoUtils.within(support, circle) : emergency.zone.id == support.zone.id)
   order by urgencyRank desc (CRITICAL 4, HIGH 3, MEDIUM 2, LOW 1), priority asc, createdAt desc → first
   → type "urgence", emergencyId, title, content, urgencyLevel, duration = durationSeconds ?? 15, priority = emergency.priority
   (emergencies are delivered even when the support is not ACTIF)
2. SUPPORT GATE: technicalStatus != ACTIF, or a support_availability block on d whose [startTime,endTime) contains t → DEFAULT
3. CANDIDATES from reservations R: R.support = support ∧ R.status = CONFIRMEE ∧ R.startDate ≤ d ≤ R.endDate ∧ R.startTime ≤ t < R.endTime
   campaign C = R.campaign kept only if ALL:
     C.status ∈ {ACTIVE, VALIDATED_BY_ADMIN} ∧ C.adminStatus = VALIDATED
     ∧ (C.aiStatus = APPROVED ∨ (C.aiStatus = REVIEW_REQUIRED ∧ C.aiOverride))
     ∧ C.startDate ≤ d ≤ C.endDate ∧ (C.startTime null ∨ C.startTime ≤ t) ∧ (C.endTime null ∨ t < C.endTime)
     ∧ support inside ≥ 1 campaign_zones circle
     ∧ client.validationStatus ∉ {REJECTED, SUSPENDED} ∧ client.user.isActive
     ∧ C.budget > 0 ∧ C.consumedBudget + unitCost(support) ≤ C.budget
     ∧ count(diffusion_logs PUBLICITE, campaign C, support, diffusedAt ∈ (datetime − 60 min, datetime]) < zelqane.diffusion.max-per-hour (30)
   one entry per campaign (earliest reservation id)
4. SCORE(C) = C.priorityScore × 10 + round(0.2 × qualityScore of latest non-preview check, 0 if none)   // 0..120
5. pool = candidates with score ≥ maxScore − 5; pick the one with the oldest last PUBLICITE diffusion on this support
   (never diffused first); tie → lowest campaign id  (equitable rotation)
6. → type "publicite": media = first by sortOrder,id; mediaUrl = publicUrl, mediaType;
     duration = (VIDEO with durationSeconds) ? durationSeconds : zelqane.diffusion.default-duration-seconds (10); priority = score
     side effects: C.consumedBudget += unitCost; latest payments_simulation row of C: budgetConsumed += unitCost
7. else DEFAULT → type "defaut", title zelqane.diffusion.default-title ("ZELQANE — Tukhnanutha"),
     content zelqane.diffusion.default-content ("Espace de diffusion ZELQANE"), mediaUrl zelqane.diffusion.default-media-url (null), duration 10, priority 0
EVERY call inserts diffusion_logs: support, zone, campaign|null, emergency|null, reservation|null, contentType,
  title, mediaUrl, durationSeconds, priority, cost (unitCost for PUBLICITE else 0),
  diffusedAt = datetime at zelqane.timezone as Instant, createdAt = real now
```

```ts
interface DiffusionResponse { type: "publicite"|"urgence"|"defaut"; diffusionLogId: number; supportId: number;
  campaignId: number|null; emergencyId: number|null; title: string; content: string|null;
  mediaUrl: string|null; mediaType: "IMAGE"|"VIDEO"|"BANNER"|null; duration: number; zone: string; priority: number;
  urgencyLevel: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"|null; datetime: string /* local "YYYY-MM-DDTHH:mm:ss" used */ }
```

- `POST /api/diffusion/interactions` (**public**):
  - Body `{ diffusionLogId: number; type: "CLIC"|"INTERACTION" }`.
  - Unknown log → 404 `DIFFUSION_LOG_NOT_FOUND`. Non-PUBLICITE log → 400 `INTERACTION_NOT_ALLOWED`. Log `createdAt` older than 1 h → 400 `INTERACTION_EXPIRED`.
  - Idempotent per (log, type). Returns 204.
  - B adds `/api/diffusion/interactions` to PUBLIC_ENDPOINTS.
- `GET /api/diffusion/logs` (ADMINISTRATEUR, SUPERVISEUR, OPERATEUR) returns `PageResponse<DiffusionLogResponse>`. Query: `supportId, zoneId, campaignId, contentType` (list), `from, to` (dates on diffusedAt); sort `diffusedAt,desc`.

```ts
interface DiffusionLogResponse { id: number; supportId: number; supportName: string; zoneId: number|null; zoneName: string|null;
  campaignId: number|null; campaignName: string|null; emergencyId: number|null; contentType: "PUBLICITE"|"URGENCE"|"DEFAUT";
  title: string|null; mediaUrl: string|null; durationSeconds: number|null; priority: number; cost: number;
  clicks: number; interactions: number; diffusedAt: string; createdAt: string }
```

### 2.6 Estimation formula (lane B, `service/EstimationService`, constants in `zelqane.pricing`)

```
hoursPerDay = minutes(endTime − startTime) / 60        days = endDate − startDate + 1
baseViewsPerHour: ECRAN 120, PANNEAU_NUMERIQUE 90, POINT_WIFI 40, APPLICATION 200, SITE_WEB 250
visibilityFactor = visibilityScore == null ? 1.0 : 0.5 + visibilityScore / 100          // 0.5..1.5
estimatedViews = floor(baseViewsPerHour × visibilityFactor × hoursPerDay × days / max(1, diffusionCapacity))
cpmTnd (TND per 1000 views): ECRAN 8.000, PANNEAU_NUMERIQUE 6.000, POINT_WIFI 3.000, APPLICATION 4.000, SITE_WEB 3.500
estimatedCost = round(estimatedViews × cpm / 1000, 2, HALF_UP)       unitCost = round(cpm / 1000, 4, HALF_UP)
```

These are internal simulation constants. They are shown in the app only as « estimation », and never on marketing pages (brief guardrail).

### 2.7 Availability status derivation (lane B, shared by availability, reservations, recommendations)

For one support and a window W (dates [sd,ed] × times [st,et)), with overlap defined as dates intersect **and** `st < other.et ∧ other.st < et`:
1. `HORS_LIGNE` if technicalStatus ∈ {HORS_LIGNE, INACTIF}, or an overlapping block has status HORS_LIGNE.
2. else `MAINTENANCE` if technicalStatus = MAINTENANCE, or an overlapping MAINTENANCE block exists.
3. else let N = number of overlapping TEMPORAIRE|CONFIRMEE reservations of **other** campaigns:
   - `OCCUPE` if there is an overlapping OCCUPE block, or N ≥ capacity with ≥1 CONFIRMEE among them;
   - `RESERVE` if N ≥ capacity (all TEMPORAIRE);
   - else `DISPONIBLE`, with `remainingCapacity = capacity − N`.

### 2.8 Emergencies (lane B)

```ts
interface EmergencyRequest { title: string /*1..200*/; content: string /*1..2000*/; zoneId?: number|null;
  latitude?: number|null; longitude?: number|null; radiusKm?: number|null /*0.1..50; all three or none*/;
  startDate: string; endDate: string; startTime?: string|null /*default 00:00:00*/; endTime?: string|null /*default 23:59:59*/;
  durationSeconds?: number|null /*5..120, default 15*/; priority?: number|null /*≥1, default 1*/;
  urgencyLevel?: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"|null /*default HIGH*/ }
interface EmergencyResponse { id: number; title: string; content: string; zoneId: number; zoneName: string;
  latitude: number|null; longitude: number|null; radiusKm: number|null; startDate: string; endDate: string;
  startTime: string; endTime: string; durationSeconds: number; priority: number; urgencyLevel: UrgencyLevel; isActive: boolean;
  state: "PROGRAMME"|"EN_COURS"|"TERMINE"|"DESACTIVE"; stoppedAt: string|null; stopReason: "MANUEL"|"AUTO"|null;
  affectedSupports: number; diffusionCount: number; createdByName: string; createdAt: string }
```

Create rules:
- No `zoneId` and no complete circle → 400 `EMERGENCY_TARGET_REQUIRED`.
- `endAt ≤ startAt` or `endAt ≤ now` → 400 `INVALID_EMERGENCY_WINDOW`.
- `zoneId` null → the zone is the active zone whose circle contains the point, else the nearest active zone.
- Times are stored non-null.

`state` derivation:
- `!isActive` → `AUTO` stop gives TERMINE, otherwise DESACTIVE.
- `now < startAt` → PROGRAMME.
- `now > endAt` → TERMINE.
- otherwise EN_COURS.

`affectedSupports` = ACTIF supports inside the circle (or in the zone).

| Method & path | Roles | Behaviour |
|---|---|---|
| `POST /api/emergency` | ADMINISTRATEUR | 201; audit `EMERGENCY_CREATED` |
| `GET /api/emergency?state=` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | list, createdAt desc |
| `POST /api/emergency/{id}/deactivate` | ADMINISTRATEUR | isActive=false, `stoppedAt`, `stopReason=MANUEL`; audit `EMERGENCY_DEACTIVATED` |

Scheduler `scheduler/EmergencyAutoStopScheduler` (cron `0 * * * * *`): active messages with `endAt < now` get `isActive=false`, `stoppedAt=now`, `stopReason=AUTO`.

### 2.9 Statistics & CSV (lane B)

**`GET /api/statistics/dashboard`**
- Roles: ADMINISTRATEUR, SUPERVISEUR, OPERATEUR. **ANNONCEUR is removed** and now gets 403.
- Response: all existing `DashboardResponse` fields, plus the additions below.
- Semantics fixed:
  - `pendingCampaigns` = PENDING_AI_CHECK + APPROVED_BY_AI + REVIEW_REQUIRED.
  - `totalViews` = PUBLICITE logs only.
  - `estimatedBudget` = Σ budget of non-BROUILLON campaigns.
- Additions:
  `aiFlaggedCampaigns` (aiStatus REVIEW_REQUIRED|REJECTED), `reviewRequiredCampaigns`, `approvedByAiCampaigns`, `validatedCampaigns` (VALIDATED_BY_ADMIN), `terminatedCampaigns`, `blockedCampaigns`, `draftCampaigns`, `totalClients`, `pendingClients`, `totalSupports`, `supportsByStatus: Record<TechnicalStatus, number>`, `totalZones`, `activeZones`, `temporaryReservations`, `cancelledReservations`, `expiredReservations`, `totalDiffusions`, `emergencyViews`, `defaultViews`, `viewsToday`, `totalClicks`, `totalInteractions`, `estimatedCost` (Σ TEMPORAIRE|CONFIRMEE), `simulatedRevenue` (Σ payments_simulation.amount with status SIMULATED|COMPLETED), `activeEmergencies`.

**Other endpoints:**
- `GET /api/statistics/views?from&to&groupBy=day|campaign|support|zone&campaignId&supportId&zoneId&contentType`
  - Roles: staff. Defaults: from = today−29, to = today, contentType = PUBLICITE. Range > 366 days → 400 `INVALID_RANGE`.
  - Returns `{ from; to; groupBy; rows: { key: string; label: string; views: number; clicks: number; interactions: number; cost: number }[]; totals: { views; clicks; interactions; cost } }`.
  - Day rows cover every day, zero-filled, with `key` "YYYY-MM-DD" and `label` "dd/MM". Other groupings use the id as `key`, the name as `label`, and are sorted by views desc.
- `GET /api/statistics/mine?from&to` (ANNONCEUR) returns:
  `{ from; to; totals: { campaigns; activeCampaigns; pendingCampaigns; views; clicks; interactions; estimatedViews; estimatedCost; estimatedBudget; consumedBudget; confirmedReservations }; statusCounts: Record<CampaignStatus, number>; daily: { date; views; clicks; interactions; cost }[]; byCampaign: { campaignId; name; status; views; clicks; interactions; estimatedViews; estimatedCost; budget; consumedBudget }[]; bySupport: { supportId; name; zoneName; views }[]; byZone: { zoneId; name; views }[] }`.
- `GET /api/statistics/campaigns/{id}?from&to` (readable) returns:
  `{ campaignId; name; status; budget; consumedBudget; remainingBudget; estimatedViews; estimatedCost; views; clicks; interactions; lastDiffusionAt: string|null; daily: {date; views; clicks; interactions; cost}[]; bySupport: {supportId; name; zoneName; views}[]; byZone: {zoneId; name; views}[] }`.
  Default range = campaign period clipped to today (or last 30 days if dates are null).
- `GET /api/statistics/history?from&to` (staff) returns `{ date; totalCampaigns; activeCampaigns; pendingCampaigns; aiPendingCampaigns; aiRejectedCampaigns; availableSupports; confirmedReservations; views; clicks; interactions; estimatedBudget; consumedBudget; avgRiskScore: number|null; avgQualityScore: number|null }[]`.
  - The `statistics` platform row (campaign/support/zone null) is upserted for today by `scheduler/StatisticsSnapshotScheduler` (cron `0 */15 * * * *`).
  - Views, clicks and interactions are always recomputed from the logs.
  - Days without a snapshot are omitted.
- `GET /api/statistics/export.csv?type=views|dashboard|mine|campaign&from&to&groupBy&campaignId`:
  - Roles: `views`/`dashboard` staff; `mine` ANNONCEUR; `campaign` readable. Anything else → 400 `EXPORT_TYPE_INVALID`.
  - Format: `text/csv; charset=UTF-8` with BOM, separator `;`, decimal comma, French headers (e.g. `Date;Affichages;Clics;Interactions;Coût (TND)`).
  - Header `Content-Disposition: attachment; filename="zelqane-statistiques-<type>-<from>-<to>.csv"`.

**Interactions / clicks.** Source is `diffusion_interactions`, attributed to the log's `diffusedAt` day.

### 2.10 Accounts, profile, sessions, admin users, audit (lane C)

**Sessions:**
- Login and register create a `user_sessions` row: `id` = UUID string, `expiresAt = now + jwt.expiration-ms`, plus IP and user agent.
- JWT claims: `sub`, `role`, `sid`, `iat`, `exp`.
- On each request the filter validates signature and expiry (401 `TOKEN_EXPIRED`/`TOKEN_INVALID`), then that the session exists, is not revoked and has not expired (401 `SESSION_REVOKED`), then that the user is active (401 `ACCOUNT_DISABLED`).
- `lastSeenAt` is updated at most every `zelqane.security.session-touch-seconds` (60).
- Revocation reasons: `LOGOUT`, `REVOKED_BY_USER`, `REVOKED_BY_ADMIN`, `PASSWORD_CHANGED`, `ACCOUNT_DISABLED`.
- Every login attempt writes `login_history`, with `failureReason` among `BAD_CREDENTIALS`, `ACCOUNT_DISABLED`, `UNKNOWN_USER`.

```ts
interface AuthResponse { token: string; email: string; nom: string; role: RoleCode; userId: number; sessionId: string; expiresAt: string }
interface MeResponse { userId: number; email: string; nom: string; role: RoleCode; societe: string|null; telephone: string|null;
  adresse: string|null; logoUrl: string|null; isActive: boolean; lastLoginAt: string|null; createdAt: string;
  client: { clientId: number; companyName: string|null; validationStatus: "PENDING"|"VALIDATED"|"REJECTED"|"SUSPENDED"; trustLevel: number } | null }
interface SessionResponse { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; ipAddress: string|null; userAgent: string|null; current: boolean }
interface LoginHistoryResponse { id: number; email: string; success: boolean; failureReason: "BAD_CREDENTIALS"|"ACCOUNT_DISABLED"|"UNKNOWN_USER"|null;
  ipAddress: string|null; userAgent: string|null; createdAt: string }
interface AdminUserResponse extends MeResponse { activeSessions: number; campaignsCount: number /*0 for staff*/; clientNotes: string|null }
interface AuditLogResponse { id: number; actorUserId: number|null; actorEmail: string|null; actorName: string|null; actorRole: RoleCode|null;
  action: string; entityType: string; entityId: string|null; summary: string; details: Record<string, unknown>|null; ipAddress: string|null; createdAt: string }
```

| Method & path | Roles | Behaviour |
|---|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | public | as today + session + history. Register: `EMAIL_ALREADY_REGISTERED` 409. Login: 401 `BAD_CREDENTIALS` / `ACCOUNT_DISABLED`. |
| `GET /api/me` | authenticated | MeResponse |
| `PUT /api/me` | authenticated | `{ nom: string /*1..150*/; societe?: string|null /*≤200*/; telephone?: string|null /*^[+0-9 ().-]{6,30}$*/; adresse?: string|null /*≤1000*/ }`; syncs `clients.company_name` |
| `POST /api/me/password` | authenticated | `{ currentPassword; newPassword /*8..100, ≥1 letter & ≥1 digit*/ }`. Wrong current → 400 `INVALID_CURRENT_PASSWORD`; same as current → 400 `PASSWORD_REUSED`. Sets `password_changed_at` and revokes the other sessions (`PASSWORD_CHANGED`). 204. |
| `POST /api/me/logo` | authenticated | multipart `file` (png/jpeg/webp, ≤2 MB, sniffed) → `logos/{userId}/`; the previous logo file is deleted. MeResponse. Errors 415 `MEDIA_TYPE_UNSUPPORTED` / 413 `MEDIA_TOO_LARGE`. |
| `DELETE /api/me/logo` | authenticated | MeResponse |
| `GET /api/me/sessions` | authenticated | active `SessionResponse[]` |
| `DELETE /api/me/sessions/{id}` | authenticated | own session → 204 (`REVOKED_BY_USER`); otherwise 404 `SESSION_NOT_FOUND` |
| `POST /api/me/sessions/revoke-others` | authenticated | `{ revoked: number }` |
| `POST /api/me/logout` | authenticated | revokes the current session (`LOGOUT`), 204 |
| `GET /api/me/login-history?limit=` | authenticated | default 20, max 100, newest first |
| `GET /api/admin/users` | ADMINISTRATEUR, SUPERVISEUR | `PageResponse<AdminUserResponse>`; query `q` (email/nom/societe), `role` (list), `active`, `validationStatus` (list) |
| `GET /api/admin/users/{id}` | ADMINISTRATEUR, SUPERVISEUR | 404 `USER_NOT_FOUND` |
| `POST /api/admin/users` | ADMINISTRATEUR | `{ email; password /*8..100*/; nom; role: "ADMINISTRATEUR"|"OPERATEUR"|"SUPERVISEUR"; societe?; telephone? }`. 201. ANNONCEUR → 400 `ROLE_NOT_ALLOWED`; 409 `EMAIL_ALREADY_REGISTERED`. Audit `USER_CREATED`. |
| `PUT /api/admin/users/{id}` | ADMINISTRATEUR | `{ nom; societe?; telephone?; adresse?; role? }`. Role change only between staff roles and never on self (400 `ROLE_NOT_ALLOWED`). Audit `USER_UPDATED`. |
| `POST /api/admin/users/{id}/activate` · `/deactivate` | ADMINISTRATEUR | Deactivate revokes sessions (`ACCOUNT_DISABLED`). Self → 400 `CANNOT_DEACTIVATE_SELF`; last active admin → 400 `LAST_ADMIN`. Audit `USER_ACTIVATED` / `USER_DEACTIVATED`. |
| `POST /api/admin/clients/{clientId}/validation` | ADMINISTRATEUR | `{ validationStatus: "PENDING"|"VALIDATED"|"REJECTED"|"SUSPENDED"; trustLevel?: number /*0..100*/; notes?: string|null /*≤2000*/ }`. 404 `CLIENT_NOT_FOUND`. Audit `CLIENT_VALIDATION_CHANGED`. Returns AdminUserResponse. |
| `GET /api/admin/users/{id}/login-history`, `GET /api/admin/users/{id}/sessions` | ADMINISTRATEUR, SUPERVISEUR | lists |
| `POST /api/admin/users/{id}/sessions/revoke` | ADMINISTRATEUR | `{ revoked }`, reason `REVOKED_BY_ADMIN`, audit `USER_SESSIONS_REVOKED` |
| `GET /api/admin/roles` | ADMINISTRATEUR, SUPERVISEUR | `{ code; name; description; permissions: string[] }[]` |
| `GET /api/admin/audit` | ADMINISTRATEUR, SUPERVISEUR | `PageResponse<AuditLogResponse>`; query `actorId, action` (list), `entityType, entityId, from, to` |

**Audit action catalog** (verbatim):

| Area | Actions |
|---|---|
| Campaigns / AI | `CAMPAIGN_VALIDATED`, `CAMPAIGN_VALIDATED_OVERRIDE`, `CAMPAIGN_REJECTED`, `CAMPAIGN_PRIORITY_CHANGED`, `AI_CHECK_RERUN`, `AI_RULE_CREATED`, `AI_RULE_UPDATED`, `AI_RULE_DELETED` |
| Network / reservations / emergencies | `ZONE_CREATED`, `ZONE_UPDATED`, `ZONE_DELETED`, `SUPPORT_CREATED`, `SUPPORT_UPDATED`, `SUPPORT_BLOCK_CREATED`, `SUPPORT_BLOCK_DELETED`, `RESERVATION_CANCELLED`, `EMERGENCY_CREATED`, `EMERGENCY_DEACTIVATED` |
| Accounts | `USER_CREATED`, `USER_UPDATED`, `USER_ACTIVATED`, `USER_DEACTIVATED`, `CLIENT_VALIDATION_CHANGED`, `USER_SESSIONS_REVOKED` |

`entityType` ∈ `CAMPAIGN, AI_RULE, ZONE, SUPPORT, RESERVATION, EMERGENCY, USER, CLIENT`.

### 2.11 Configuration keys (additive; each lane adds only its own keys)

| Lane | Keys |
|---|---|
| A | `zelqane.timezone` (Africa/Tunis); `zelqane.scheduler.enabled` (true; **false in application-test.yml**); `zelqane.ai.ocr.mode` (`auto`, `tesseract` or `simulated`), `zelqane.ai.ocr.command` (tesseract), `zelqane.ai.ocr.languages` (fra+eng) |
| B | `zelqane.media.max-image-bytes` (10485760), `zelqane.media.max-video-bytes` (52428800), `zelqane.media.max-files-per-campaign` (5); `zelqane.reservation.temporary-ttl-hours` (72); `zelqane.diffusion.max-per-hour` (30), `zelqane.diffusion.default-duration-seconds` (10), `zelqane.diffusion.default-title`, `zelqane.diffusion.default-content`, `zelqane.diffusion.default-media-url` (empty = null); `zelqane.pricing.base-views-per-hour.*`, `zelqane.pricing.cpm-tnd.*`; multipart 60MB |
| C | `zelqane.security.session-touch-seconds` (60); `zelqane.cors.allowed-origins` default |

---

## 3. Flyway migrations (fixed numbering; valid PostgreSQL 16; entities must also run on H2 create-drop)

Rules:
- No Postgres-only construct in entity annotations. Partial indexes and backfills live only in SQL.
- New JSON columns use the existing pattern `@JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb")`.
- Every new CHECK must list enum values exactly as in the Java enums.

**V3__lifecycle_ai.sql (lane A)**
- `campaigns`: ADD
  - `ai_override BOOLEAN NOT NULL DEFAULT FALSE`
  - `rejection_reason TEXT`
  - `admin_comment TEXT`
  - `duplicated_from_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL`
  - `activated_at TIMESTAMPTZ`
  - `terminated_at TIMESTAMPTZ`
  - `termination_reason VARCHAR(30)` CHECK NULL or IN ('PERIODE_TERMINEE','BUDGET_EPUISE')
  - CHECK `priority_score BETWEEN 0 AND 10`
  - indexes `(status)`, `(client_id, created_at)`
- `campaign_zones`:
  - DROP CONSTRAINT `uq_campaign_zones_campaign_zone`.
  - ADD `latitude NUMERIC(10,7)`, `longitude NUMERIC(10,7)`, `radius_km NUMERIC(8,3)`, `label VARCHAR(150)`.
  - Backfill: `UPDATE campaign_zones cz SET latitude=z.latitude, longitude=z.longitude, radius_km=COALESCE(z.radius_km,3) FROM zones z WHERE z.id=cz.zone_id`.
  - Then SET NOT NULL on the three, plus CHECKs lat −90..90, lng −180..180, radius > 0 AND ≤ 50.
  - Index `(campaign_id)`.
- `ai_content_checks`: ADD
  - `extracted_text TEXT`
  - `ocr_engine VARCHAR(20) NOT NULL DEFAULT 'AUCUN'` CHECK IN ('TESSERACT','SIMULE','AUCUN')
  - `sector VARCHAR(30)` CHECK NULL or IN (9 AiSector values)
  - `recommendations JSONB NOT NULL DEFAULT '[]'`, `issues JSONB NOT NULL DEFAULT '[]'`, `media_analyses JSONB NOT NULL DEFAULT '[]'`, `matched_rules JSONB NOT NULL DEFAULT '[]'`
  - `engine VARCHAR(20) NOT NULL DEFAULT 'LOCAL'` CHECK IN ('LOCAL','OPENAI','LOCAL_OPENAI')
  - `is_preview BOOLEAN NOT NULL DEFAULT FALSE`
  - index `(campaign_id, checked_at DESC)`
- `ai_moderation_rules`: ADD CHECK `rule_type IN ('KEYWORD','REGEX')`, CHECK `sector` NULL or AiSector values; INSERT the seed rules of §2.2.
- `ai_decision_logs`: index `(created_at)`, `(decision_type, created_at)`.

**V4__media_reservations_diffusion.sql (lane B)**
- `media_files`: ADD `width_px INTEGER`, `height_px INTEGER`, `sort_order SMALLINT NOT NULL DEFAULT 0`; CHECK `duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 600`; index `(checksum)`.
- `diffusion_supports`: CHECK `visibility_score IS NULL OR visibility_score BETWEEN 0 AND 100`.
- `campaigns`: `ALTER COLUMN consumed_budget TYPE NUMERIC(16,4)`. The entity keeps `precision=16, scale=4`; lane B makes this single-field edit in `Campaign.java`, coordinated with A.
- `payments_simulation`: `ALTER COLUMN budget_consumed TYPE NUMERIC(16,4)`; index `(campaign_id, created_at)`.
- `reservations`: ADD `cancelled_at TIMESTAMPTZ`, `cancel_reason VARCHAR(255)`, `cancelled_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL`, `expired_at TIMESTAMPTZ`; index `(support_id, reservation_status, start_date, end_date)`.
- `diffusion_logs`: ADD `reservation_id BIGINT REFERENCES reservations(id) ON DELETE SET NULL`, `cost NUMERIC(10,4) NOT NULL DEFAULT 0` (CHECK ≥ 0); indexes `(support_id, diffused_at)`, `(campaign_id, diffused_at)`, `(content_type, diffused_at)`.
- CREATE TABLE `diffusion_interactions`:
  - `id BIGSERIAL PK`
  - `diffusion_log_id BIGINT NOT NULL REFERENCES diffusion_logs(id) ON DELETE CASCADE`
  - `campaign_id BIGINT REFERENCES campaigns(id) ON DELETE SET NULL`
  - `support_id BIGINT NOT NULL REFERENCES diffusion_supports(id)`
  - `interaction_type VARCHAR(20) NOT NULL` CHECK IN ('CLIC','INTERACTION')
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - UNIQUE `(diffusion_log_id, interaction_type)`; index `(campaign_id)`
- `emergency_messages`: ADD
  - `latitude NUMERIC(10,7)`, `longitude NUMERIC(10,7)`, `radius_km NUMERIC(8,3)`
  - `stopped_at TIMESTAMPTZ`, `stop_reason VARCHAR(20)` CHECK NULL or IN ('MANUEL','AUTO')
  - CHECK `(latitude IS NULL AND longitude IS NULL AND radius_km IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND radius_km > 0)`
  - CHECK `duration_seconds IS NULL OR duration_seconds BETWEEN 5 AND 120`
- `support_availability`: ADD `reason VARCHAR(255)`, `created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL`; index `(support_id, availability_date)`.
- `statistics`: `CREATE UNIQUE INDEX uq_statistics_platform_day ON statistics(stat_date) WHERE campaign_id IS NULL AND support_id IS NULL AND zone_id IS NULL`.

**V5__accounts_security_audit.sql (lane C)**
- `users`: ADD `password_changed_at TIMESTAMPTZ`.
- CREATE TABLE `user_sessions`:
  - `id VARCHAR(36) PK`
  - `user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `expires_at TIMESTAMPTZ NOT NULL`
  - `revoked_at TIMESTAMPTZ`, `revoked_reason VARCHAR(30)` CHECK NULL or IN ('LOGOUT','REVOKED_BY_USER','REVOKED_BY_ADMIN','PASSWORD_CHANGED','ACCOUNT_DISABLED')
  - `ip_address VARCHAR(64)`, `user_agent VARCHAR(255)`
  - index `(user_id, revoked_at, expires_at)`
- CREATE TABLE `login_history`:
  - `id BIGSERIAL PK`
  - `user_id BIGINT REFERENCES users(id) ON DELETE SET NULL`
  - `email VARCHAR(255) NOT NULL`, `success BOOLEAN NOT NULL`
  - `failure_reason VARCHAR(30)` CHECK NULL or IN ('BAD_CREDENTIALS','ACCOUNT_DISABLED','UNKNOWN_USER')
  - `ip_address VARCHAR(64)`, `user_agent VARCHAR(255)`
  - `session_id VARCHAR(36)`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - index `(user_id, created_at DESC)`
- CREATE TABLE `audit_logs`:
  - `id BIGSERIAL PK`
  - `actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL`, `actor_email VARCHAR(255)`, `actor_role VARCHAR(30)`
  - `action VARCHAR(60) NOT NULL`, `entity_type VARCHAR(40) NOT NULL`, `entity_id VARCHAR(64)`
  - `summary VARCHAR(500) NOT NULL`, `details JSONB`
  - `ip_address VARCHAR(64)`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - indexes `(created_at DESC)`, `(entity_type, entity_id)`, `(actor_user_id)`

---

## 4. Backend file ownership

Paths are relative to `BackEnd/src/main/java/com/example/zelqanepfe/`. Tests are owned by the owner of the class under test, in `src/test/java/.../<same package>/<Class>Test.java`.

**Lane A: campaign lifecycle, AI, admin decision, campaign zones, search**
- controller: `CampaignController`, `AdminCampaignController`, `AiController`, new `AiRuleController`.
- service: `CampaignService`, `AdminCampaignService`, `AiVerificationService`, `CampaignMapper`, new `CampaignAccessGuard`, `CampaignSearchSpecifications`, `CampaignZoneService`, `CampaignDuplicationService`, `AiRuleService`, `AiDashboardService`, `AiDecisionQueryService`; `service/ai/**` (existing + `ContentAnalysisPipeline`, `TextRuleEngine`, `MediaMetadataAnalyzer`, `SectorClassifier`, `OcrService`, `TesseractOcrService`, `SimulatedOcrService`, `TextNormalizer`); `scheduler/CampaignLifecycleScheduler`.
- dto: `CampaignRequest`, `CampaignResponse`, `AiReportResponse`, new `CampaignZoneRequest`, `CampaignZoneResponse`, `CampaignZonesUpdateResponse`, `AdminValidateRequest`, `AdminRejectRequest`, `PriorityRequest`, `DuplicateRequest`, `AiIssuesResponse`, `AiRuleRequest`, `AiRuleResponse`, `AiDecisionLogResponse`, `AiDashboardResponse`, `PageResponse`.
- model: `Campaign`, `CampaignZone`, `CampaignStatus`, `CampaignAiStatus`, `CampaignAdminStatus`, `AiContentCheck`, `AiDecisionLog`, `AiModerationRule`, `AiCheckStatus`, `AiContentType`, `AiAdminDecision`, `AiDecisionType`, `AiModerationSeverity`, new `AiSector`, `OcrEngine`, `AiEngine`, `TerminationReason`.
- repository: `CampaignRepository`, `CampaignZoneRepository`, `AiContentCheckRepository`, `AiDecisionLogRepository`, `AiModerationRuleRepository`.
- other: `util/GeoUtils`, `config/ClockConfig`, `config/SchedulingConfig`; `db/migration/V3__lifecycle_ai.sql`.

**Lane B: media, reservations, availability, diffusion engine, emergency behaviour, statistics, zones & supports**
- controller: `ReservationController`, `SupportController`, `ZoneController`, `DiffusionController`, `EmergencyController`, `StatisticsController`, new `MediaController`, `AvailabilityController`, `EstimateController`.
- service: `ReservationService`, `SupportService`, `ZoneService`, `DiffusionService`, `EmergencyService`, `StatisticsService`, new `MediaService`, `storage/FileStorageService`, `AvailabilityService`, `EstimationService`, `ZoneRecommendationService`, `SupportBlockService`, `DiffusionLogQueryService`, `InteractionService`, `CsvExportService`; `scheduler/ReservationExpiryScheduler`, `scheduler/EmergencyAutoStopScheduler`, `scheduler/StatisticsSnapshotScheduler`; `config/MediaWebConfig`.
- dto: `Reservation*`, `Support*` (incl. `SupportAvailabilitySlot`), `Zone*`, `Diffusion*`, `Emergency*`, `DashboardResponse`, new `MediaFileResponse`, `Availability*`, `Estimate*`, `ReservationBatchRequest`, `ReservationCancelRequest`, `ReservationConflictResponse`, `SupportBlock*`, `ZoneRecommendationResponse`, `InteractionRequest`, `DiffusionLogResponse`, `Statistics*Response`.
- model: `Reservation`, `ReservationStatus`, `AvailabilityStatus`, `SupportAvailability`, `DiffusionSupport`, `SupportType`, `TechnicalStatus`, `PorteurType`, `Zone`, `DiffusionLog`, `DiffusionContentType`, `EmergencyMessage`, `UrgencyLevel`, `MediaFile`, `MediaFileType`, `PaymentSimulation`, `PaymentStatus`, `Statistic`, new `DiffusionInteraction`, `InteractionType`, `EmergencyStopReason`.
- repository: every repository for those entities.
- other: `validation/AllowedIntValues`; `db/migration/V4__media_reservations_diffusion.sql`; existing test `SupportServiceTest`.

**Lane C: security, JWT, filter, exception handler, users/profile/sessions, admin users, audit, roles**
- `security/**`.
- config: `config/GlobalExceptionHandler`, `AppConfig`, `CorsConfig`, `DataInitializer`, `OpenApiConfig`, `ZelqaneProperties` (shared, see below).
- `exception/**`.
- controller: `AuthController`, new `MeController`, `AdminUserController`, `AuditController`.
- service: `AuthService`, `SecurityUtils`, new `MeService`, `SessionService`, `LoginHistoryService`, `AdminUserService`, `AuditService`.
- model: `User`, `Client`, `ClientValidationStatus`, `Role`, `RoleCode`, new `UserSession`, `SessionRevokeReason`, `LoginHistory`, `LoginFailureReason`, `AuditLog`.
- repository: `UserRepository`, `ClientRepository`, `RoleRepository`, + new ones for the new entities.
- dto: `AuthResponse`, `LoginRequest`, `RegisterRequest`, `MessageResponse`, new `Me*`, `PasswordChangeRequest`, `SessionResponse`, `LoginHistoryResponse`, `AdminUser*`, `ClientValidationRequest`, `AuditLogResponse`, `RoleResponse`.
- other: `db/migration/V5__accounts_security_audit.sql`; `ZelqanePfeApplicationTests`; `src/test/resources/application-test.yml`.

**Shared files and allowed additive edits:**

| File | Owner | Others may |
|---|---|---|
| `security/SecurityConfig` | C | B adds `"/uploads/**"` and `"/api/diffusion/interactions"` to `PUBLIC_ENDPOINTS`. Nobody makes `/api/diffusion/logs` public. |
| `config/ZelqaneProperties`, `application.yml`, `application-test.yml` | C | Each lane adds its own nested classes/keys (§2.11) without touching others' |
| `dto/CampaignResponse`, `service/CampaignMapper` | A | Nobody else edits. A reads media via `MediaFileRepository.findByCampaignId` and reservations via `ReservationRepository.findByCampaignId` (read-only), and builds `mediaUrl` with `FileStorageService.publicUrl`. |
| `model/Campaign` | A | B changes only `consumedBudget` precision/scale (16,4) and writes `consumedBudget` in the diffusion engine |
| `repository/ReservationRepository` | B | A may call existing methods and `save`/`saveAll` for the lifecycle status writes of §2.1 and §2.1 zones, but adds no methods |
| `repository/PaymentSimulationRepository` | B | A inserts the validation row with the existing builder |
| `repository/MediaFileRepository` | B | A reads it (AI inputs, duplicate checksum; B provides `findByChecksumAndCampaignIdNot(String, Long)`; if it is absent A filters `findAll` in memory) |
| `model/Client`, `model/User` | C | A and B read `validationStatus`, `isActive` |
| `CampaignAccessGuard`, `GeoUtils`, `PageResponse`, `ClockConfig` | A | B, C use them; create-if-absent verbatim per §2.0 |
| `FileStorageService` | B | A (duplicate/delete) and C (logo) use it; create-if-absent verbatim per §2.0 |
| `AuditService`, `ApiException` constructors | C | A and B call them; create-if-absent verbatim per §2.0 |

Integration rules:
- The working tree is shared, so **keep the build compiling at every step**.
- Run `./mvnw -q -B test` before handing off.
- Each lane adds focused JUnit/Mockito tests. Minimum coverage per lane:
  - **A:** status machine, override, submit completeness, pipeline scores/status/OCR fallback, zone resolution.
  - **B:** §2.6 formula, §2.7 derivation, conflicts, engine selection/rotation/frequency/budget, expiry, CSV.
  - **C:** filter session checks, error bodies, password change, deactivate rules.

---

## 5. Frontend work plan (3 lanes, strict ownership)

General rules:
- French UI (fr-TN, TND), `FrontEnd/docs/code-conventions.md`, and brief guardrails.
- No new npm dependency; charts stay SVG.
- Each lane runs `npx tsc --noEmit -p .`, `npx eslint <files>` and `npx vitest run <paths>` on its files.
- F1 lands types/endpoints first. F2/F3 code against the names below.
- Vocabulary: supports are « Porteurs » for annonceurs.

### F1: shared layer

**Ownership:**
- `src/lib/**`
- `src/app/api/**`
- new `src/app/uploads/[...path]/route.ts`
- `src/middleware.ts`
- `src/components/ui/**`
- `e2e/fixtures/**` (plus keeping existing `e2e/*.spec.ts` green)
- `FrontEnd/docs/api-contract.md` (rewrite §3–§7 to match this contract once backend lanes land)

**Work:**
1. **`src/lib/api/types.ts`**
   - Every request/response/enum of §2, verbatim: CampaignResponse v2, AiReport v2, MediaFileResponse, Availability*, Estimate*, Reservation v2, ReservationConflict, SupportBlock, ZoneRecommendation, Diffusion v2, DiffusionLog, Emergency v2, Dashboard v2, Statistics*, Me*, Session, LoginHistory, AdminUser, AuditLog, AiRule, AiDecisionLog, AiDashboard, `PageResponse<T>`, `ApiError` with `code`.
   - The `Diffusion` normaliser keeps upper-casing `type`.
2. **`src/lib/api/client.ts`**
   - `body instanceof FormData`: no JSON content-type, no stringify, no timeout.
   - New `apiDownload(path, query)` returns `{ blob, filename }` from Content-Disposition and triggers the browser save through a helper `saveBlob`.
   - `errors.ts` exposes `ApiError.code`. `isNoAiReportError` becomes `code === "AI_REPORT_NOT_FOUND"` (keep the legacy 400 fallback).
3. **`src/lib/api/messages.ts`**
   - Translate by `code` first: backend `message` is already French, so show it for known codes, with overrides for tone.
   - Keep the English table as a fallback.
   - Add labels for every code in §2.
4. **`src/lib/api/endpoints.ts`** (exact API object names):
   - `sessionApi`
   - `meApi.{get,update,changePassword,uploadLogo,removeLogo,sessions,revokeSession,revokeOtherSessions,logoutCurrent,loginHistory}`
   - `campaignsApi.{mine(filters),search(filters),get,create,update,remove,submit,reopen,duplicate(id,{includeMedia}),zones,setZones}` (`all` removed → `search`)
   - `mediaApi.{list,upload(campaignId,file,{kind,durationSeconds}),remove}`
   - `aiApi.{checkContent,report,issues,checks,rules:{list,create,update,remove},decisions,dashboard}`
   - `adminApi.{validate(id,body),reject(id,reason),setPriority}`
   - `zonesApi.{…,recommendations}`
   - `supportsApi.{all(filters),…,blocks,createBlock,removeBlock}`
   - `availabilityApi.search`
   - `estimatesApi.{compute,campaign}`
   - `reservationsApi.{search,mine,byCampaign,create,createBatch,cancel,conflicts}`
   - `statisticsApi.{dashboard,views,mine,campaign,history,exportCsv}`
   - `emergencyApi.{all,create,deactivate}`
   - `diffusionApi.{next,logs,interaction}`
   - `adminUsersApi.{list,get,create,update,activate,deactivate,setClientValidation,loginHistory,sessions,revokeSessions,roles}`
   - `auditApi.list`
5. **`src/lib/campaign-status.ts`**
   - Labels and tones for all 9 statuses:

     | Status | Annonceur label | Admin label |
     |---|---|---|
     | `VALIDATED_BY_ADMIN` | « Programmée » | same |
     | `ACTIVE` | « En diffusion » | same |
     | `TERMINATED` | « Terminée » | same |
     | `BLOCKED` | « Refusée » | « Bloquée » |

   - Stepper mapping: Brouillon → Analyse IA → Validation ZELQANE → Programmée → En diffusion → Terminée.
   - Also: reservation labels incl. `EXPIREE`, availability labels (Disponible, Réservé, Occupé, Maintenance, Hors ligne), urgency labels (Faible, Moyen, Élevé, Critique), sector labels, emergency state labels, audit action labels.
6. **New `src/lib/time-slots.ts`:** `SLOT_PRESETS` (MATIN, APRES_MIDI, SOIR, JOURNEE with the §2.4 times, and French labels « Matin (7 h – 12 h) », « Après-midi (12 h – 18 h) », « Soir (18 h – 23 h) », « Journée complète (7 h – 23 h) »), `PERSONNALISE`, `presetOf(start,end)`.
   **New `src/lib/geo.ts`:** `distanceKm`, `circlePolygon(lat,lng,radiusKm,steps=64)` → GeoJSON for MapLibre.
7. **`src/lib/routes.ts`**
   - `WizardStep = "details"|"contenu"|"porteurs"|"verification"` (numbers 1–4).
   - Admin routes: `users({onglet?: "annonceurs"|"equipe"})`, `journal({onglet?: "audit"|"decisions-ia"|"diffusions"})`, `aiRules()`, `reservations({onglet?: "toutes"|"conflits"})`, `statistics()`.
8. **`src/app/api/[...path]/route.ts`**
   - Verify multipart passthrough (raw body + content-type boundary), up to 60 MB.
   - Forward `user-agent`.
   - When the upstream status is 401 with a code in `UNAUTHENTICATED|TOKEN_INVALID|TOKEN_EXPIRED|SESSION_REVOKED|ACCOUNT_DISABLED` and a token cookie is present: clear the cookies and return `SESSION_EXPIRED_BODY` (keep the legacy empty-403 rule).
   - Pass through `content-disposition`.
   - `/api/session/login|register` forward UA/XFF and use `expiresAt` for cookie max-age.
   - `/api/session/logout` calls backend `POST /api/me/logout` (best-effort) before clearing cookies.
9. **`src/app/uploads/[...path]/route.ts`**
   - Public GET/HEAD streaming proxy to `${backend}/uploads/...`.
   - Forwards `range`, `if-none-match`, `if-modified-since`.
   - Returns status (200/206/304), `content-type`, `content-length`, `content-range`, `accept-ranges`, `etag`, `cache-control`.
   - Streams the body (no buffering). Rejects `..` segments.
10. **`src/components/ui/**`:** add `pagination.tsx` (PageResponse-driven), `download-button.tsx` (uses `apiDownload`), `file-input` helpers if needed. `status-pill.tsx` tones for new enums.
11. **`e2e/fixtures/api.ts` + `demo-data.ts`:** mock every new endpoint used by existing specs and the new flows (submit returns AI result, media upload, availability, `/statistics/mine`, `/me`).

### F2: espace annonceur

**Ownership:**
- `src/app/espace/**`
- `src/components/campaign/**`, `src/components/espace/**`, `src/components/map/**`, `src/components/auth/**`
- `src/components/network/**` (annonceur network explorer)
- new `e2e/espace-*.spec.ts`

**Screens and changes:**

1. **Wizard** `/espace/campagnes/nouvelle` (`campaign-wizard.tsx`, `wizard-chrome.tsx`, `step-*.tsx`, `use-submit-flow.ts`), 4 steps:
   1. **Détails** (`step-details.tsx`):
      - Fields: name, objective (hint: text read by the AI), budget > 0, dates.
      - **Time-slot preset** radio group from `SLOT_PRESETS` + « Personnalisé » (shows `time-range-field`).
      - Saves with `create`/`update`. On update, show a toast when reservations were cancelled (`reservationsCount` decreased).
   2. **Contenu** (new `step-content.tsx`, reusing `creative-dropzone.tsx`):
      - Real upload via `mediaApi.upload`. Client prechecks use the same types and limits (10 MB image / 50 MB video).
      - Reads video duration from `<video>` metadata and sends `durationSeconds`. Offers a « Bannière » toggle for images.
      - Gallery of uploaded media with delete, and a 16:9 / 9:16 preview in `screen-mockup.tsx`.
      - Button « Pré-analyse IA » (`aiApi.checkContent` on BROUILLON) renders `ai-analysis.tsx`: scores, issues grouped by source with severity, recommendations list, OCR text + engine (« OCR simulé » when `SIMULE`), sector.
      - **Remove the « à venir » notice** and the local-only `creative-store.ts` behaviour (delete the store or keep it only as an upload-progress cache).
      - The step is optional, with a warning « aucun visuel ».
   3. **Zone & Porteurs** (`step-screens-map.tsx`, `step-screens.tsx`, `availability-strip.tsx`, `src/components/map/**`):
      - Clicking the map sets a point.
      - Radius slider 0.5–20 km (step 0.5) with a circle drawn via `circlePolygon`.
      - « Ajouter une zone » up to 5 circles, each removable and labelled.
      - Persist with `campaignsApi.setZones` and toast cancelled reservations.
      - Support-type filter chips.
      - `availabilityApi.search({campaignId, …campaign window})` colours markers and list rows by the 5 statuses, with a legend in `map-legend.tsx`.
      - Summary « N Porteurs disponibles sur M · X affichages estimés · Y TND ».
      - Multi-select DISPONIBLE supports → `reservationsApi.createBatch`, showing per-support errors from `BATCH_CONFLICT`.
      - Already reserved (`reservedByCampaign`) rows show « Annuler » (`reservationsApi.cancel`).
      - When `alternatives` is non-empty, show « Créneaux alternatifs » chips; applying one updates the campaign window, then re-queries.
      - Panel « Zones recommandées » (`zonesApi.recommendations`): clicking centres the map and prefills a circle using the zone radius.
   4. **Vérification** (`step-review.tsx`, `estimate-invoice.tsx`):
      - `estimatesApi.campaign` lines and totals, with a budget coverage warning when `budgetSufficient=false`.
      - Checklist mirroring the `SUBMIT_INCOMPLETE` keys.
      - « Soumettre » → `campaignsApi.submit` (single call; loader « Analyse IA en cours… », no client timeout). The result panel follows the returned status (approved / review_required / rejected) with issues and recommendations and a link to the detail page.
2. **Campaign detail** `/espace/campagnes/[id]` (`campaign-detail.tsx`):
   - Status timeline including Programmée / Terminée (+ `terminationReason` label).
   - `rejectionReason` alert (« Motif du refus ZELQANE ») and `adminComment`.
   - Full AI report (`aiApi.report`).
   - Media gallery (img / video `controls`), read-only zones map (circles + reserved supports).
   - Reservations (`reservation-list.tsx`) with cancel when `cancellable`.
   - Estimate card.
   - Stats card from `statisticsApi.campaign` (daily views SVG chart, by support, by zone) + CSV `exportCsv({type:"campaign",campaignId})`.
   - Actions driven by the `editable/submittable/deletable` flags:
     - Modifier: confirm « la campagne repassera en brouillon » when status is REJECTED_BY_AI/BLOCKED.
     - Corriger: `reopen`.
     - Soumettre: goes to the wizard step 4.
     - Dupliquer: server `duplicate` with an « inclure les médias » checkbox in `duplicate-campaign-dialog.tsx`.
     - Supprimer.
3. **Edit** `/espace/campagnes/[id]/modifier`: same fields as step 1 + presets; the server-side reopen is explained.
4. **List** `/espace/campagnes`: filters wired to `campaignsApi.mine({q,status,aiStatus,from,to})` via URL state.
5. **Dashboard** `/espace` (`dashboard-view.tsx`, `kpis.ts`, `use-advertiser-data.ts`):
   - KPIs from `statisticsApi.mine` (affichages, clics, interactions, coût estimé, budget consommé, campagnes actives/en attente), 30-day daily chart, « à faire » list.
   - Remove client-side aggregation.
6. **Statistiques** `/espace/statistiques` (`statistics-view.tsx`, `charts.tsx`):
   - Period selector (7/30/90 j, custom).
   - Daily history chart (views/clics/interactions), table by campaign, by Porteur, by zone.
   - CSV export `type=mine`.
   - Label estimated vs measured figures (measured = diffusion logs).
7. **Réservations** `/espace/reservations` (`reservations-view.tsx`, `reservations-model.ts`): `reservationsApi.mine`, filters (status incl. EXPIREE/ANNULEE, campaign), cancel TEMPORAIRE when `cancellable` (confirm dialog), `cancelReason` shown.
8. **Profil** `/espace/profil` (`profile-view.tsx`):
   - `meApi.get/update` form (nom, société, téléphone, adresse; zod mirrors §2.10).
   - Logo upload/remove with preview.
   - Password change form (current/new/confirm; success notice « Vos autres sessions ont été déconnectées »).
   - Sessions actives list (device from user-agent, IP, last activity, « Cet appareil ») with « Déconnecter » and « Déconnecter les autres appareils ».
   - Historique des connexions (last 20, success/failure).
   - Client validation badge + explanation when SUSPENDED/REJECTED.
9. **Réseau** `/espace/reseau` (`src/components/network/**`): the booking dialogs set campaign zones first (circle centred on the selection, radius covering it + 0.5 km), then `createBatch`. Availability comes from `availabilityApi`.
10. **Auth** (`login-form.tsx`): messages for `ACCOUNT_DISABLED` and `BAD_CREDENTIALS` via codes.

### F3: back-office and player

**Ownership:**
- `src/app/admin/**`, `src/app/ecran/**`
- `src/components/admin/**`, `src/components/shell/**`, `src/components/player/**`
- new `e2e/admin-*.spec.ts`

**Role visibility:**
- ADMINISTRATEUR: everything.
- SUPERVISEUR: read-only on moderation, reservations, journal, AI rules, users, statistics.
- OPERATEUR: `/admin`, réseau, urgences (read), journal diffusions, statistiques.

Nav entries go in `menus.tsx`, with badges in `nav-badges.ts` (moderation queue count, conflicts count).

1. **`/admin`** (`overview-view.tsx`, `overview-model.ts`):
   - Every dashboard v2 field, grouped: Campagnes, IA, Réseau, Réservations, Diffusion, Revenus simulés.
   - 30-day daily views chart (`statisticsApi.views groupBy=day`).
   - AI summary card (`aiApi.dashboard`).
   - Active emergencies strip.
2. **`/admin/statistiques`** (new):
   - Period selector.
   - Tabs for views by day / campagne / Porteur / zone (tables + SVG bar charts, zone comparison).
   - `history` chart (campaign counts over time).
   - AI dashboard (avg risk/quality, validation & rejection rates, overrides, disagreements, by sector, top issues).
   - CSV buttons (`type=views` with the current groupBy, `type=dashboard`).
3. **`/admin/moderation`** (`moderation-view.tsx`, `moderation-model.ts`, `campaign-review-dialog.tsx`, `decision-dialogs.tsx`):
   - Tabs map to `campaignsApi.search` status filters.
   - Filter bar: q, client, zone, statut, statut IA, période, type de Porteur. Pagination.
   - Review dialog: full AI report (issues by source/severity, matched rules, OCR text + engine, sector, recommendations, preview flag), media preview (image/video), zones map, reservations with estimates, client validation badge, decision history (`aiApi.decisions({campaignId})`), « Relancer l'analyse IA ».
   - Validate dialog: comment, priority 0–10, and for REVIEW_REQUIRED a required checkbox « Je valide malgré l'avis de l'IA (dérogation journalisée) » → `overrideAi: true`.
   - Reject dialog: reason required 3–1000 chars; also offered for VALIDATED_BY_ADMIN/ACTIVE campaigns as « Bloquer la diffusion ».
   - Priority edit for active/programmed campaigns.
4. **`/admin/utilisateurs`** (new):
   - Tab « Annonceurs »:
     - filters: validation status, active, search;
     - columns: company, contact, validation badge, trust level, campaigns, last login;
     - « Valider / Refuser / Suspendre » dialog (status, trustLevel slider, notes);
     - activate/deactivate.
   - Tab « Équipe ZELQANE »:
     - create staff dialog (email, nom, mot de passe, rôle ADMINISTRATEUR/OPERATEUR/SUPERVISEUR);
     - edit and activate/deactivate (self disabled).
   - User drawer: profile, active sessions + « Révoquer les sessions », login history.
5. **`/admin/journal`** (new), with tabs:
   - « Audit »: `auditApi.list`, filters action/entity/actor/date, details JSON pretty-printed.
   - « Décisions IA »: `aiApi.decisions`, filters type/decision/date, badges for `VALIDATED_OVERRIDE` and AI/admin disagreement.
   - « Diffusions »: `diffusionApi.logs`, filters Porteur/zone/campagne/type/date, clicks/interactions/cost columns.
   - All tabs paginated.
6. **`/admin/regles-ia`** (new):
   - Rules table (name, type, pattern, severity, sector, active toggle via `update`).
   - Create/edit dialog with inline `INVALID_REGEX` / `AI_RULE_NAME_TAKEN` errors.
   - Delete confirm. Read-only for SUPERVISEUR.
7. **`/admin/reservations`** (new):
   - Tab « Toutes »: `reservationsApi.search`, filters status/zone/Porteur/campagne/client/dates, admin cancel with reason.
   - Tab « Conflits »: `reservationsApi.conflicts` grouped by Porteur, severity badge CONFLIT/SATURE, overlap window, reservations involved, link to moderation review.
8. **`/admin/reseau`** (`network-admin-view.tsx`, `support-form-dialog.tsx`, …):
   - `visibilityScore` field; list filters (zone, type, technical status).
   - Per-Porteur « Indisponibilités » panel: blocks list, create (date range, times, status MAINTENANCE/HORS_LIGNE/OCCUPE, reason), delete.
9. **`/admin/urgences`** (`emergency-form-dialog.tsx`, `emergency-schema.ts`, `emergency-view.tsx`, reusing `zone-map-picker.tsx`):
   - Form fields: title, content, start date+time, end date+time, duration (5–120 s), urgency level select, priority.
   - Map picker: point + radius with a live count of ACTIF Porteurs inside; optional zone select; validation mirroring §2.8.
   - List: `state` pill (Programmé / En cours / Terminé / Désactivé), stop reason (manuel / automatique), `affectedSupports`, `diffusionCount`, deactivate action.
10. **Player** `/ecran/[supportId]` (`src/components/player/**`):
    - `publicite`: `IMAGE|BANNER` renders `<img>` (object-fit contain, 16:9 stage); `VIDEO` renders `<video autoplay muted playsInline>`, and the next poll happens on `ended` or after `duration`. Null `mediaUrl` falls back to a title card.
    - `urgence`: full-screen takeover coloured by `urgencyLevel` (CRITICAL/HIGH red, MEDIUM orange, LOW blue) showing title **and content**, polling every `min(duration, 5)` s so the takeover ends promptly.
    - `defaut`: brand loop with title/content.
    - Tap/click on a publicité → `diffusionApi.interaction({diffusionLogId, type:"CLIC"})` once per diffusion.
    - Keep the `?datetime` simulation and the dismissable « chaque appel compte une diffusion » note.
    - Reduced-motion respected.

---

## 6. Deviations

_Lanes append entries here as `YYYY-MM-DD · lane · what changed · why`._

- 2026-09-16 · A · `config/GlobalExceptionHandler` (owner C) got one additive change: `ApiException` bodies now include `code`, `path` and `errors`, using the new `ApiException(status, code, message[, errors])` constructors. · Without it, none of lane A's stable codes reach clients before lane C lands. C may rewrite the handler freely as long as it keeps this output.
- 2026-09-16 · A · Created `service/AuditService` with the exact §2.0 signature. For now it resolves the actor and IP, then writes a structured `AUDIT …` line to the application log. · The `audit_logs` table only arrives with V5 (lane C). C replaces the method body with the persistent implementation; callers do not change.
- 2026-09-16 · A · Created `service/storage/FileStorageService` as specified in §2.0 (store/resolve/publicUrl/delete/deleteDirectory/copy/sniffMime, path confinement → 400 `INVALID_PARAMETER`). · A needs it for duplication, campaign deletion and `mediaUrl`, and it was missing. Lane B owns it from now on.
- 2026-09-16 · A · `src/test/resources/application-test.yml` (owner C): set `spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect` and added lane A keys (`zelqane.scheduler.enabled: false`, `zelqane.ai.openai-enabled: false`, `zelqane.ai.ocr.mode: simulated`). · The global PostgreSQL dialect double-encodes JSON columns on H2, so reading any `jsonb` field (`detected_issues`, `issues`, …) failed in tests. Production still uses the PostgreSQL dialect.
- 2026-09-16 · A · `media_files` has no `width_px`/`height_px`/`sort_order` until V4 (lane B). The AI pipeline reads image dimensions from the stored file with `ImageIO` (null when the file is unreadable). "First media" is ordered by `id` for `CampaignResponse.mediaUrl` and `ai_content_checks.media_id`. · The entity fields don't exist yet. Once B adds them, A's `CampaignMapper`/`AiVerificationService` should prefer `sortOrder,id` and the stored dimensions.
- 2026-09-16 · A · The duplicate-media heuristic (§2.2) ignores campaigns of the **same client**. · Otherwise every campaign created with `/duplicate` + media would be flagged against its own source.
- 2026-09-16 · A · Scoring details the contract left open: each quality issue label is deducted once, however many media show it. A rule adds its risk points once, even when it matches both the text and the OCR text (both issues are still listed). A zone with a null `radius_km` counts as 3 km for circle resolution, matching the V3 backfill. `supportsInside` counts every support in the circle, whatever its technical status. · These are deterministic, documented choices.
- 2026-09-16 · A · `PUT /api/campaigns/{id}/zones` with an empty `zones` array → 400 `VALIDATION_FAILED` (`errors.zones`). The request body type is `CampaignZoneRequest { zones: CampaignZoneRequest.Circle[] }`. · §2.1 gives only the 1..5 bound and the `ZONE_LIMIT_EXCEEDED` code for > 5.
- 2026-09-16 · A · `editable` in `CampaignResponse` is true for `BROUILLON | REJECTED_BY_AI | BLOCKED`, i.e. whenever PUT campaign/zones is accepted (auto-reopen included). `submittable` = BROUILLON. `deletable` = BROUILLON | REJECTED_BY_AI | BLOCKED. Non-preview checks get `admin_decision = PENDING` when the AI result is APPROVED or REVIEW_REQUIRED. · Makes the flags and `adminDecision` values of §2.1/§2.2 concrete.
- 2026-09-16 · A · Lifecycle reservation writes by A set only `reservation_status` (ANNULEE / CONFIRMEE). · `cancelled_at`/`cancel_reason`/`cancelled_by_user_id` arrive with V4 (lane B).
- 2026-09-16 · A · Extra lane A files beyond §4: model `AiIssue`, `AiIssueSource`, `AiMatchedRule`, `AiMediaAnalysis`, `AiRuleType`; service `CampaignErrors`, `CampaignLifecycle` (pure status machine), `CampaignReservationSync`; `service/ai/MediaInput`, `service/ai/OcrServiceResolver` (`@Primary` OCR selector). `ai_moderation_rules.rule_type`/`sector` are now enums in the entity. · Needed to keep the rules pure and unit-testable.
- 2026-09-16 · A · V3 indexes that already exist since V1 (`campaigns(status)`, `campaign_zones(campaign_id)`, `ai_decision_logs(created_at)`) are written as `CREATE INDEX IF NOT EXISTS` on the existing names. V3 was reviewed but not run against a live PostgreSQL 16, because none was available on the build machine (Docker daemon stopped). · Keeps the migration idempotent. Run `flyway migrate` once on a real database before the demo.
- 2026-09-17 · F1 · In `src/lib/api/types.ts`, fields that v2 adds to DTOs that already existed (`CampaignResponse`, `AiReportResponse`, `ReservationResponse`, `EmergencyResponse`, `DiffusionResponse`, `DashboardResponse`, `SupportResponse`) are optional (`?:`). `ReservationResponse.supportType` is `SupportType | null`, and `EmergencyResponse.startTime`/`endTime` stay `string | null`. DTOs that are new in v2 are typed exactly as §2, with every field required. The backend still sends every field. · Existing F2/F3 fixtures and view-models type-check unchanged until they migrate. Read the new fields with `?? null` / `?? []`.
- 2026-09-17 · F1 · `EmergencyRequest` keeps `zoneId: number` (zone target). The new `EmergencyCircleRequest` (circle required, `zoneId` optional) covers circle targets, and `EmergencyCreateRequest` is the union of the two, accepted by `emergencyApi.create`. · Same §2.8 rule (zone, circle, or both), without breaking the per-zone emergency form.
- 2026-09-17 · F1 · `routes.ts` keeps the 3-step `WizardStep` / `WIZARD_STEP_NUMBER` / `parseWizardStepParam` and adds the 4-step wizard as `WizardStepV2` (`details|contenu|porteurs|verification`), `WIZARD_V2_STEP_NUMBER`, `parseWizardStepV2Param` and `routes.espace.campaignWizard(id, step)`. `campaign-status.ts` keeps the 4-label `CAMPAIGN_STEPS` / `getCampaignStep` and adds the 6-step lifecycle as `CAMPAIGN_TIMELINE_STEPS` / `getCampaignTimelineStep`. · The current wizard and detail page index those constants by number. F2 switches to the V2 names and may then delete the old ones.
- 2026-09-17 · F1 · `isEditable` is now true for `BROUILLON | REJECTED_BY_AI | BLOCKED`. New helpers: `isDeletable`, `canReopen`, `editReopens`, `isContentEditable`, `canResubmit`, `canRunAiAsOwner`, `canAdminRerunAi`, `canAdminValidate`, `validationNeedsOverride`, `canAdminReject`, `rejectBlocksDiffusion`, `canEditPriority`, `canCancelReservation`. `isDeadEnd` is deprecated but keeps its old answer (REJECTED_BY_AI → « dupliquer » is still offered). Staff label of BLOCKED is « Bloquée ». VALIDATED_BY_ADMIN is « Programmée » for both audiences. · §2.1 resubmission rules. One F2 test still expects the pre-v2 matrix: `components/campaign/__tests__/campaign-actions.test.ts > BLOCKED` expects `edit/remove: false`. F2 must update it.
- 2026-09-17 · F1 · `campaignsApi.all(filters)` stays available: it walks every page of `search` (size 100). `campaignsApi.duplicate(id, { includeMedia })` calls the server. `duplicate(sourceCampaign, overrides)` is deprecated but still accepted and makes the old client-side copy. List filters also accept `{ signal }` in the same object (`mine({ status, signal })`). `normalizePage` also accepts a bare array (pre-v2 backend). · Keeps existing callers compiling while exposing the §5 F1 names.
- 2026-09-17 · F1 · Time-slot presets use the §2.4 windows (MATIN 07–12, APRES_MIDI 12–18, SOIR 18–23, JOURNEE 07–23). The F1 task brief said 08–12 / journée 08–23. · §2.4 requires F1 to match the backend alternatives exactly. Only `SLOT_PRESETS` in `src/lib/time-slots.ts` changes if the owner wants 08:00.
- 2026-09-17 · F1 · The e2e mock (`e2e/fixtures/api.ts`) implements the v2 endpoints, with two compatibility shortcuts for the pre-v2 screens. First, `POST /reservations` on a campaign without zones creates a circle around the Porteur's zone. Second, the owner calling `POST /ai/check-content` on a campaign already analysed by `submit` gets the stored report back. Demo campaign 3 now starts today, so validating it gives ACTIVE as `flows.spec` expects. `/uploads/**` is mocked with a 1×1 PNG. · Existing specs keep passing without a backend. Remove both shortcuts once F2 has migrated the wizard and network explorer.
- 2026-09-17 · F1 · Not done by F1 in this pass: the `src/components/ui/**` additions (`pagination.tsx`, `download-button.tsx`, new status-pill tones) and the rewrite of `FrontEnd/docs/api-contract.md` §3–§7. · The F1 task brief limited ownership to `src/lib/**`, `src/app/api/**`, `middleware.ts`, `e2e/fixtures/**` and `next.config.ts`. `apiDownload` / `downloadAndSave` / `saveBlob` and every label map are ready for those components.
- 2026-09-17 · B · `config/GlobalExceptionHandler` (owner C) got two additive handlers: `NoResourceFoundException` → 404 `NOT_FOUND` and `MaxUploadSizeExceededException` → 413 `PAYLOAD_TOO_LARGE`, both through the existing `ApiException` body. · A missing file under `/uploads/**` returned 500 and an over-limit multipart returned 500 until C lands. C may rewrite the handler as long as the output stays the same.
- 2026-09-17 · B · V4 does **not** create `uq_statistics_platform_day`. V1 already has the identical partial unique index `uq_statistics_daily_global` (`stat_date WHERE campaign_id IS NULL AND support_id IS NULL AND zone_id IS NULL`), so V4 uses `CREATE UNIQUE INDEX IF NOT EXISTS uq_statistics_daily_global`, a no-op. All other V4 indexes also use `IF NOT EXISTS`. V4 was not run against a live PostgreSQL 16 (none available on the build machine); only the H2 create-drop entities were tested. · Avoids a duplicate index. Run `flyway migrate` on a real database before the demo.
- 2026-09-17 · B · Details the contract left open: (1) availability `summary` and `alternatives` are computed over every target support after the `supportType` filter but **before** the `status` filter, which only narrows `supports[]`; (2) `distanceKm` is the distance to the nearest campaign circle centre (campaign target), to the point (circle target) or to the zone centre (zone target), rounded to 3 decimals; (3) only `support_availability` rows with status `MAINTENANCE | HORS_LIGNE | OCCUPE` count as blocks (legacy `DISPONIBLE`/`RESERVE` rows are ignored), both in availability and in the diffusion gate; (4) `GET /api/zones/recommendations` defaults to startDate = today, endDate = startDate + 6, times = `JOURNEE`, and only active zones are scored; (5) `GET /api/supports/{id}/blocks` defaults to from = today, to = from + 90; (6) block creation rejects a span > 92 days with 400 `INVALID_RANGE`; (7) `/api/reservations/conflicts` sorts CONFLIT first, then support name and overlap start; (8) `/api/statistics/campaigns/{id}` also returns `from`/`to`; (9) CSV money uses 3 decimals (millimes), `mine` = daily table + blank line + per-campaign table, `campaign` = daily table + per-support table, `views` ends with a `Total` row; (10) `SupportAvailabilitySlot.availabilityStatus` is `RESERVE` (TEMPORAIRE) or `OCCUPE` (CONFIRMEE) for reservation slots; (11) the publicité `content` is null (only `title`). · Deterministic, documented choices.
- 2026-09-17 · B · `DELETE /api/zones/{id}` checks supports, campaign circles, reservations, emergency messages and diffusion logs before deleting (409 `ZONE_IN_USE`), and also maps a late `DataIntegrityViolationException` to that code. Supports, zones, reservations and emergencies now use stable codes `SUPPORT_NOT_FOUND`, `ZONE_NOT_FOUND`, `RESERVATION_NOT_FOUND`, `EMERGENCY_NOT_FOUND`, `SUPPORT_BLOCK_NOT_FOUND`, `MEDIA_NOT_FOUND`, `DIFFUSION_LOG_NOT_FOUND`. Cancelling someone else's reservation as ANNONCEUR gives 404 `RESERVATION_NOT_FOUND`. `GET /api/statistics/export.csv` returns 403 `ACCESS_DENIED` when the type does not match the caller's role. · Codes the contract implied but did not name.
- 2026-09-17 · B · `GET /api/diffusion/next`: `supportId` and `datetime` are declared optional at the HTTP level so that a missing `supportId` gives the contract's 400 `MISSING_PARAMETER` (not a generic 500) before lane C maps `MissingServletRequestParameterException`. Selection uses the datetime truncated to seconds. · Stable codes without touching C's handler further.
- 2026-09-17 · B · Extra lane B files beyond §4: `service/NetworkErrors` (codes), `service/TimeWindow` (overlap maths), `service/AvailabilityRules` (pure §2.7 derivation + slot presets), `controller/RequestParams` (comma lists and `HH:mm[:ss]` query times), dto `StatisticsDailyRow`, `CampaignEstimateResponse`. `EstimateRequest`/`EstimateResponse` follow the `Estimate*` pattern. `SupportService.toResponse`, `ZoneService.toResponse` and `MediaService.publicUrl` are now public static helpers. · Keeps the rules pure and unit-testable.
- 2026-09-17 · B · Follow-up for lane A (not done by B, file ownership): `media_files.width_px/height_px/sort_order` now exist and `MediaFileRepository.findByCampaignIdOrderBySortOrderAscIdAsc` / `findByChecksumAndCampaignIdNot` are available. `CampaignMapper` (first media by `id`) and `AiVerificationService` (dimensions read from the file) still work but could switch to `sortOrder,id` and the stored dimensions. `CampaignDuplicationService` copies media without `widthPx/heightPx` (sortOrder defaults to 0). · Documented so A can align.
- 2026-09-17 · F2 · `src/components/campaign/creative-store.ts` is kept, but only for the network explorer's local « try it on the screen » preview in the 3D studio (`EXPLORER_CREATIVE_KEY`). The chosen campaign's uploaded media (`mediaUrl`) always wins over it. `adoptExplorerCreative` (which copied a local file onto a campaign) is removed. The wizard and the detail page use real uploads only. · The 3D preview of a Porteur before any campaign exists is useful and honest when labelled « aperçu local ».
- 2026-09-17 · F2 · Network explorer bookings (`porteur-configurator.tsx`, `selection-booking-dialog.tsx`) call `runBatchBooking` (`network/booking-plan.ts`). It keeps the campaign's existing circles and adds one circle that covers the uncovered Porteurs plus 0.5 km, labelled « Sélection du réseau », so no reservation is released. With 5 circles already, the booking stops with a French message. It then calls `createBatch`. On 409 `BATCH_CONFLICT`, the conflicting Porteurs get their message and the others are booked in a second batch. The wizard step « Zone & Porteurs » keeps the strict all-or-nothing batch with per-Porteur errors. The explorer's 60-day calendar strip still reads `GET /supports/{id}/availability`. · The strip needs per-day slots, which `/api/availability` (one window) does not return. A partial second batch matches the explorer's per-Porteur result list.
- 2026-09-17 · F2 · `/espace/reservations` loads `GET /reservations/mine` once, with no server filters. Status (including EXPIREE/ANNULEE), campaign and zone are filtered client-side from the URL, using the names carried by v2 reservations. Cancellation uses the backend `cancellable` flag, with an optional reason (≤ 255). · One request feeds the status tab counts and the filters.
- 2026-09-17 · F2 · Profile: after `PUT /me`, the name shown by the shell (session cookie `SessionUser`) is refreshed only at the next login. The profile page itself shows the new values. Password changes keep the current session and show « Vos autres sessions ont été déconnectées ». The current session has no « Déconnecter » button: « Se déconnecter » is used instead. · The session cookie is owned by F1/C.
- 2026-09-17 · F2 · No new `e2e/espace-*.spec.ts` was added, and Playwright was not run (it needs `next build`, which this lane may not run). The annonceur half of `e2e/flows.spec.ts` (F1-owned) still drives the pre-v2 three-step wizard (« Continuer vers les Porteurs », `etape=3` = Vérification, « Soumettre à la modération ») and must be updated to the 4-step wizard: Détails → Contenu → Zone & Porteurs (save a circle, then « Réserver n Porteurs ») → Vérification (« Soumettre »). · Out of this lane's run permissions. The Vitest suites cover every F2 screen.
- 2026-09-17 · F3 · Moderation review: `V` (and the « Valider… » button) opens an inline validation panel (optional comment ≤1000, priority 0–10, and the required « Je valide malgré l'avis de l'IA (dérogation journalisée) » checkbox for REVIEW_REQUIRED) that is confirmed with a second click; it no longer validates in one keystroke. Tab counters come from `GET /statistics/dashboard` (`approvedByAi + reviewRequired`, `reviewRequired`, `aiPending`, `totalCampaigns`); the « Statut » filter is only offered on « Toutes » (the other tabs already fix the statuses); a single date bound is sent as a one-day range. Bulk validation uses `CampaignResponse.reservationsCount > 0` instead of loading every campaign's reservations. The refusal copy now says the reason is shown to the advertiser (v2 `rejectionReason`); the « copier un e-mail » helper stays optional. · Needed to collect the §2.1 validate body; avoids N extra calls per page.
- 2026-09-17 · F3 · Role visibility: SUPERVISEUR sees every back-office page read-only (moderation, reservations, journal, AI rules, users, statistics); OPERATEUR sees Vue d'ensemble (without the decision queue and AI dashboard), Réseau, Messages prioritaires, Statistiques (without the AI dashboard) and Journal limited to the « Diffusions » tab; restricted pages render an in-shell « réservé » state and make no API call. Nav, `g` shortcuts and palette commands are filtered with `navForRole` / `roleCanOpen` (`src/content/nav.ts`). · §5 F3 role list, and `/api/admin/audit`, `/api/ai/decisions`, `/api/ai/dashboard` are ADMINISTRATEUR/SUPERVISEUR only.
- 2026-09-17 · F3 · Journal « Décisions IA »: the « Désaccord IA / admin » badge is computed on the current page only (the latest earlier non-preview AI row of the same campaign); without that row no disagreement is claimed. `/admin/reservations` « Annonceur » filter lists the first 100 advertiser accounts (`GET /admin/users?role=ANNONCEUR&size=100`) to obtain `clientId`; the conflicts tab defaults to today → today + 90 like the backend. · No endpoint returns the AI verdict next to an admin decision, and the reservation search filters by id only.
- 2026-09-17 · F3 · Network admin: per-Porteur « Disponibilités » dialog (technical status, capacity, visibility score, 14-day calendar merging `GET /supports/{id}/availability` reservation slots with `GET /supports/{id}/blocks`, create/delete blocks for administrators); `visibilityScore` added to the support form (blank = null) and a type filter to the Porteurs table. `isZoneInUseError` also recognises `ZONE_IN_USE` / `DATA_INTEGRITY`. · §2.4 blocks and §5 F3 item 8.
- 2026-09-17 · F3 · Player: publicités render the media (`<img>` object-contain, or `<video autoplay muted playsInline>` whose `ended` event triggers the next call), fall back to the title card when the media fails to load, and count one `CLIC` per `diffusionLogId` through a full-stage button (« Je suis intéressé par … », « Intérêt enregistré, merci »). Priority messages show title + content with urgency colours and are re-polled every `min(duration, 5)` s. `?datetime=YYYY-MM-DDTHH:mm[:ss]` sets a simulated local clock that advances with real time (shown in the info panel); an invalid value falls back to the real Tunis clock. The default slide shows the backend default title/content. · §5 F3 item 10.
- 2026-09-17 · F3 · `e2e/flows.spec.ts` (F1-owned) got a two-line change in the back-office flow: « Valider… » then « Confirmer la validation ». No new `e2e/admin-*.spec.ts` was added and Playwright was not run (needs `next build`). F3 coverage is Vitest: `admin-models`, `admin-v2-models`, `admin-pages`, `moderation-view`, `overview-view`, `emergency-*`, `network-*`, `player-*`, `shell`. · Lane may not run `next build`.
- 2026-09-17 · C · Extra lane C files beyond §4: `exception/ApiErrorBody` (single error body + JSON writer used by the advice and the security chain), `config/ValidationMessages` (French constraint messages), `security/RequestInfo` (IP/user agent), `security/TokenRejectedException`, `security/SecurityErrorWriter` (JSON entry point + access-denied handler), `security/PreAuthorizeHandlerInterceptor` + `security/SecurityWebMvcConfig`, `service/AccountErrors` (codes), dto `RevokedCountResponse` (`{ revoked }`), `MeUpdateRequest`, `AdminUserCreateRequest`, `AdminUserUpdateRequest`. `AuditService` also hosts the audit query (`search(Filter, page, size)`). `UserDetailsImpl` gains `sessionId` (the 6-arg constructor used by tests is kept). · Keeps the rules small and unit-testable.
- 2026-09-17 · C · `@PreAuthorize` is now also evaluated by an MVC interceptor **before** argument binding and `@Valid`. A caller with the wrong role gets 403 `ACCESS_DENIED` even when the body is invalid (previously the 400 `VALIDATION_FAILED` leaked first). Controller annotations of A/B were not touched: they already match the role matrix, which `security/RoleMatrixWebTest` now pins (OPERATEUR: dashboard, network, emergencies read, diffusion log, reservations list, statistics; SUPERVISEUR: read-only moderation/AI rules/decisions/conflicts/users/audit/roles/statistics; writes ADMINISTRATEUR only). · Security fix found while testing the matrix.
- 2026-09-17 · C · V5 also rewrites `roles.description`/`roles.permissions` for the four roles so `GET /api/admin/roles` describes the enforced matrix (`campaigns:read`, `diffusion:logs`, `users:write`, …). Permissions are descriptive; enforcement stays in `@PreAuthorize`. V5 was not run against a live PostgreSQL 16 (Docker daemon stopped, no local psql); entities were checked with H2 create-drop only. · Run `flyway migrate` + boot with `ddl-auto: validate` once before the demo.
- 2026-09-17 · C · Tokens issued before V5 carry no `sid` and are rejected with 401 `SESSION_REVOKED`: every user logs in once after the upgrade. `/api/auth/register` now also opens a session, sets `lastLoginAt` and writes a successful `login_history` row. E-mails are trimmed and lower-cased on register and staff creation; login looks up the exact e-mail, then a unique case-insensitive match. Login checks the password before the account status, so `ACCOUNT_DISABLED` is only revealed with the right password; an unknown e-mail answers `BAD_CREDENTIALS` (journal: `UNKNOWN_USER`) after a dummy BCrypt check. Failed attempts are journaled in their own transaction. · Contract details left open; avoids account enumeration.
- 2026-09-17 · C · Session details: `DELETE /api/me/sessions/{id}` on an own session that is already revoked/expired → 204 no-op; the current session may be deleted (reason `REVOKED_BY_USER`). `POST /api/me/logout` without a JWT session (e.g. test principals) → 204 no-op. `login-history?limit` is clamped to 1..100 (no 400). `GET /api/admin/users/{id}/sessions` lists active sessions only. A session whose token subject differs from the session's user → 401 `TOKEN_INVALID`. · Deterministic choices.
- 2026-09-17 · C · Admin users: activate/deactivate return 200 `AdminUserResponse`, are idempotent, and audit every call. Demoting the last active ADMINISTRATEUR through `PUT` also gives 400 `LAST_ADMIN`. `PUT /api/admin/users/{id}` syncs `clients.company_name` like `PUT /api/me`. `GET /api/admin/users` sort whitelist: `createdAt` (default desc), `email`, `nom`, `lastLoginAt`. `GET /api/admin/audit`: `action` is a comma list, `entityType` is upper-cased, `from`/`to` are inclusive local dates in `zelqane.timezone`, sort `createdAt,desc`. Audit `details` are sanitised to JSON-safe values (enums/dates → strings). · Details the contract left open.
- 2026-09-17 · C · `users.logo_url` stores the storage-relative path (`logos/{userId}/<uuid>.<ext>`); `MeResponse.logoUrl` renders it with `FileStorageService.publicUrl`. Legacy absolute URLs are returned unchanged and never deleted. Logo type is sniffed from bytes (the declared content type is ignored). · Same pattern as campaign media.
- 2026-09-17 · C · Error handler details: `Size` messages read « Doit contenir au plus {max} caractères. » when min = 0 and « au moins {min} » when max is unbounded (otherwise the contract phrase); an explicit `message` on a constraint wins (e.g. the password-strength rule). Extra code 406 `NOT_ACCEPTABLE`. `MultipartException` → 400 `INVALID_BODY`. An unknown route answers 401 `UNAUTHENTICATED` without a token (authentication runs first) and 404 `NOT_FOUND` with one. Errors raised outside Spring MVC (servlet `/error` dispatch, now permitted by the security chain) keep Spring Boot's default body. · Security chain ordering; documented.
- 2026-09-17 · Integration · Flyway V3, V4 and V5 were applied on the existing local PostgreSQL 17 database (schema v2 → v5) by `start-local.ps1`, and Spring started with `ddl-auto: validate`. Only warnings: `CREATE INDEX IF NOT EXISTS` skipping the V1 indexes. · Closes the "not run on a real PostgreSQL" gap reported by lanes A, B and C (PostgreSQL 17 portable, not 16).
- 2026-09-17 · Integration · `FrontEnd/scripts/demo-scenario.mjs` plays CdC §11 in CdC order rather than the wizard order of §1 "Scénario": steps 4–5 use the owner **preview** (`POST /ai/check-content` on the BROUILLON, then `GET /ai/report` + `/ai/issues`), step 6 is the admin reading the report and decision log, steps 7–12 are recommendations, `PUT /zones`, `PUT` campaign with the Soir preset, `/availability`, `/reservations/batch`, `/estimates`, and step 13 is `submit` (official AI run) followed by the admin validation. Each run registers a fresh advertiser and books a future window (20–79 days ahead); step 14 retries `/diffusion/next` up to 12 times so the equitable rotation reaches the new campaign; the urgent message of step 17 is deactivated at the end of step 18. · Shows every CdC step in order with the real endpoints and keeps replays independent of existing data.
- 2026-09-17 · Integration · `FrontEnd/scripts/seed-demo.mjs` rewritten for v2 (shared helpers in `scripts/lib/zelqane-api.mjs`): 10 Porteurs with every technical status and visibility scores, one MAINTENANCE block, 2 extra moderation rules (`comparatif-denigrant`, `remise-excessive`), OPERATEUR and SUPERVISEUR accounts, advertiser validated (trust 80, only from PENDING), 4 campaigns through the real flow (media, circles, batch reservation, submit, validation). Campaigns of the pre-v2 seed that have **no map circle** are replaced once (admin reject when not deletable, then owner delete); "Festival d'été — billetterie" became "Festival de Sfax — billetterie" (objective with « garanti » → REVIEW_REQUIRED). · Pre-v2 campaigns can never be diffused (circle gate) and would have made the local demo inconsistent.
- 2026-09-17 · Integration · Frontend bugs fixed on the real stack: (1) « Cibler cette zone » built a circle with the zone's nominal radius, which can exclude the zone's own Porteurs that the recommendation counted (seed: « Panneau numérique Lac 2 » is 3.06 km from the 2.5 km Lac centre); `circleFromRecommendation(rec, supports)` now widens the radius to cover them (rounded up to 0.5 km, max 20). (2) `useUrlState` merged writes into `window.location`, but the Next router commits asynchronously, so « Examiner » followed by the debounced search commit dropped `?examen=` and closed the review; pending writes are now chained (`baseSearchForWrite`/`nextPendingWrite`). (3) Absolutely positioned sr-only header labels escaped the `overflow-x-auto` table scroller and widened `/admin/moderation` by 118 px at 1440 px; table scrollers are now `relative`. · Found by the Playwright suite and the real-stack browser pass; unit tests added.
- 2026-09-17 · Integration · e2e specs updated to the v2 screens: `flows.spec` annonceur test drives the 4-step wizard (real upload, recommended zone, batch booking, single `submit` call); `network.spec` expects the explorer link to `etape=4` and the old « onglet Carte » test became « assistant étape 3 : zone recommandée → carte de ciblage → marqueur → réservation explicite »; `screens.spec` `assistant-carte` captures the targeting map of draft 1. `start-local.ps1` waits for `pg_isready` before `psql` and no longer errors on `-Stop` with a stale `postmaster.pid`. `.env.example` lists the new optional variables and the 3000/4200 CORS default. `FrontEnd/docs/api-contract.md` rewritten for v2. · Keeps the mocked suite aligned with the shipped UI and the docs with the backend.
- 2026-09-17 · Final review · §2.2 heuristics gain one rule: gibberish or unprofessional text (no more than 3 distinct letters, a letter repeated 5 times in a row, or at least half of the Latin words of 4+ letters without a vowel; Arabic words are never judged on vowels) → risk +25 MEDIUM and quality −20 « texte incohérent ou non professionnel » (`TextNormalizer.looksIncoherent`). · CdC §3.5 asks to detect « incohérents ou non professionnels » content. Before this rule, a campaign named « x » with the objective « aaa » was APPROVED; it now gets REVIEW_REQUIRED.
- 2026-09-17 · Final review · `POST /api/reservations` and `/batch` lock the requested Porteur rows (`DiffusionSupportRepository.findAllByIdForUpdate`, PESSIMISTIC_WRITE, in id order) before the capacity check. · Without the lock, concurrent bookings could all read the same free capacity and overbook a Porteur (CdC §3.7 « blocage automatique d'un support déjà réservé »). Checked on PostgreSQL: 7 parallel bookings on a Porteur with capacity 4 give 4 successes and 3 × 409.
- 2026-09-17 · Final review · Statistics CSV: a cell that starts with `= + - @`, a tab or CR gets a leading apostrophe, except plain numbers (CSV/formula injection through campaign or Porteur names). The Next bridge `/api/[...path]` now returns 404 for `.`/`..` segments or segments containing a separator, as `/uploads` already did. · Security hardening; the normal API is unchanged.
- 2026-09-17 · Final review · Wizard step 3: new « Disponibles uniquement » toggle (`filterByAvailability`), which keeps the Porteurs already reserved by the campaign. · CdC §7 « filtre par disponibilité » had no control on the annonceur side: the list was only sorted by status.
