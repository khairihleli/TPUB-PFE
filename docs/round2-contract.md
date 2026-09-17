# TPUB round-2 contract (binding)

Base: branch `feat/complete-cahier-des-charges` at `fa9a9d7`. The round-1 contract `docs/completion-contract.md` (below: "R1") stays valid wherever this document says nothing. If the two conflict, **this contract wins**. Changes to this contract go in §11 "Deviations", with the reason.

Owner decisions are fixed (real OCR, video frames, local image analysis, optional LLM providers, learning from admin decisions, TOTP 2FA, polygon zones, heatmaps, PDF/Excel exports, dynamic pricing, SSE supervision, multi-level approval, notifications, player device keys, secret hardening, signed media URLs). This document turns them into exact APIs, migrations, config, formulas, screens and file ownership for **four parallel full-stack lanes**:

| Lane | Branch | Migration | Scope |
|---|---|---|---|
| **L1 `ia-ocr`** | `r2/ia-ocr` | `V6__ai_ocr_learning.sql` | Tess4J OCR + tessdata scripts, JCodec frames, local image analysis, LLM providers (OpenAI + Anthropic), feedback & recalibration, `/admin/ia-qualite`, AI report UI enrichments |
| **L2 `securite`** | `r2/securite` | `V7__security_2fa_devices.sql` | TOTP 2FA, device keys + pairing + simulated-time gating + device rate limit, secrets hardening, admin bootstrap, forced password change, signed media URLs (backend + `/uploads` route + media consumers) |
| **L3 `carte-prix`** | `r2/carte-prix` | `V8__polygons_pricing.sql` | Polygon zones (campaigns + emergencies) with a drawing tool, heatmaps (admin + wizard), dynamic pricing with a breakdown UI |
| **L4 `supervision`** | `r2/supervision` | `V9__supervision_approvals_notifications.sql` | SSE realtime supervision + player heartbeat, multi-level approval, notification centre + optional mail, PDF/Excel exports |

Conventions: R1 conventions apply (TypeScript notation for JSON, verbatim enums, dates `YYYY-MM-DD`, times `HH:mm:ss`, instants ISO-8601 UTC, money TND, "now" from the injected `Clock` in `tpub.timezone`, `PageResponse<T>`, error body `{ timestamp, status, code, message, path, errors? }` with a **French `message`**).

---

## 0. Global rules for every lane

1. **Each branch compiles and passes its tests on its own**, starting from `fa9a9d7`. A lane never imports a class, module or type that only another lane creates, except the verbatim snippets of §1, which any lane may create if they are absent (the content must be byte-identical, so git merges identical additions cleanly).
2. Backend gate: `./mvnw -q -B test` (JDK from `%LOCALAPPDATA%\tpub-jdk`). Frontend gate: `npx tsc --noEmit -p .`, `npx eslint <changed files>`, `npx vitest run <changed test paths>`. Playwright and `next build` are **not** run by lanes.
3. **Never** start or stop servers, touch ports 5432/8080/3000 or the local database. Flyway migrations are tested with H2 entities only (`ddl-auto: create-drop`). The integration step applies V6–V9 on the real PostgreSQL.
4. Strict file ownership (§9). Outside the owned set, a lane may only apply the **exact additive hunks** listed in §9.3, at the stated anchors.
5. New configuration goes into a **new `@ConfigurationProperties` class per lane**, registered by that lane's own `@Configuration` with `@EnableConfigurationProperties`. `TpubProperties` and `TpubPfeApplication` are not edited, except by L2 (owner of `TpubProperties`).
6. New backend error codes are thrown with `new ApiException(HttpStatus, CODE, frenchMessage[, errors])`. `GlobalExceptionHandler` is not edited, except by the hunks of §9.3. The frontend shows the backend's French `message` for unknown codes (`translateMessage`), so lanes **do not edit `src/lib/api/messages.ts`** (L2 excepted).
7. New frontend API code goes into per-lane modules, which callers import **by path** (never through `@/lib/api` or `index.ts`): `src/lib/api/types-ia.ts` + `endpoints-ia.ts` (L1), `types-carte.ts` + `endpoints-carte.ts` (L3), `types-supervision.ts` + `endpoints-supervision.ts` (L4). L2 edits the core `types.ts`, `endpoints.ts`, `client.ts`, `errors.ts` and `messages.ts` directly. A lane that needs extra fields on a core DTO declares an extension interface in its own types module, e.g. `interface EmergencyResponseCarte extends EmergencyResponse { targetPolygon?: GeoJsonPolygonal | null }`.
8. French UI (fr-TN, TND), loading, empty and error states, a11y (keyboard equivalent for every map interaction, `aria-live` for live feeds), and unit tests for every non-trivial rule. No TODO stubs, no invented metrics: every number shown comes from an endpoint of this contract or of R1.
9. Audit: new admin actions call `AuditService.record(...)` with the action names listed per lane. `entityType` gains `SUPPORT_DEVICE`, `AI_CALIBRATION`, `APPROVAL`, `ALERT`.
10. Maven dependencies may be added only by L1 and L4 (§9.3). npm: only L2 adds `qrcode` (+ `@types/qrcode`). No other new npm dependency.
11. `src/lib/routes.ts` is owned by L4 and gets **no** entries from other lanes. L1, L2 and L3 link to their new pages with literal hrefs (`"/admin/ia-qualite"`, `"/mot-de-passe-requis"`, `"/admin/carte-chaleur"`…). The integration step may add typed builders later.

---

## 1. Cross-lane interfaces (verbatim)

### 1.1 Device key header and player storage

- HTTP header: `X-TPUB-Device-Key` (lower-case `x-tpub-device-key` in the Next bridge).
- Key format: `tpd_` + base64url, no padding, of 32 random bytes → 47 characters, regex `^tpd_[A-Za-z0-9_-]{43}$`.
- Device-authenticated routes (L2 enforces all three, from its first commit): `GET /api/diffusion/next`, `POST /api/diffusion/interactions`, `POST /api/diffusion/heartbeat`. Each carries the query param `supportId`.

**`FrontEnd/src/lib/player/device-key.ts`** (verbatim; created by L2, and by L4 if absent):

```ts
/** Player device key (docs/round2-contract.md §1.1). Stored per Porteur in localStorage. */
export const DEVICE_KEY_HEADER = "x-tpub-device-key";

const KEY_PATTERN = /^tpd_[A-Za-z0-9_-]{43}$/;

function storageKey(supportId: number): string {
  return `tpub.ecran.cle.${supportId}`;
}

export function isDeviceKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

export function readDeviceKey(supportId: number): string | null {
  try {
    const value = window.localStorage.getItem(storageKey(supportId));
    return isDeviceKey(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeDeviceKey(supportId: number, key: string): boolean {
  if (!isDeviceKey(key)) return false;
  try {
    window.localStorage.setItem(storageKey(supportId), key);
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceKey(supportId: number): void {
  try {
    window.localStorage.removeItem(storageKey(supportId));
  } catch {
    // Storage unavailable (private mode): nothing to clear.
  }
}
```

**Backend** `security/device/DeviceRequest.java` (verbatim; created by L2, and by L4 if absent):

```java
package com.example.tpubpfe.security.device;

/** Device authentication of player routes (docs/round2-contract.md §1.1). */
public final class DeviceRequest {

    public static final String HEADER = "X-TPUB-Device-Key";
    /** Request attribute (Long) set once the key matched the {@code supportId} query parameter. */
    public static final String SUPPORT_ID_ATTRIBUTE = "tpub.device.supportId";

    private DeviceRequest() {
    }
}
```

L4 heartbeat code does **not** depend on L2 beans. After the merge, L2's interceptor guards the route. Before it, L4 tests the heartbeat service directly.

### 1.2 Media referenced by id; signed URLs

- Every URL of a stored file that the API returns is built **only** through `FileStorageService.publicUrl(relativePath)`, either directly or through the existing static helper `MediaService.publicUrl(storage, path)`, which delegates to it. After L2 lands, this method returns a signed URL (§3.5). No lane builds `/uploads/...` strings by hand, and no lane stores a signed URL in the database.
- `publicUrl(null)` → `null`. `publicUrl("")` or a blank value → the unsigned base URL (`/uploads`), which keeps `AiVerificationService.resolveQuietly` working.
- Server-side consumers (L1 analysis, L4 PDF) read files by **media id → `MediaFile.filePath` → `FileStorageService.resolve(...)`**, never through HTTP.
- **Thumbnail path convention (L1 writes, L4 reads):** `campaigns/{campaignId}/thumbs/{mediaId}.jpg`, JPEG quality 0.85, at most 480 px wide, aspect preserved. It is generated for VIDEO media (middle frame). It is stored in the analysis JSON as `thumbnailPath` and served through `publicUrl` as `thumbnailUrl`. Campaign deletion already removes `campaigns/{id}/**`.

### 1.3 Diffusion event (L4 adds the publication inside L3-owned `DiffusionService`)

`service/realtime/DiffusionRecordedEvent.java` (L4):

```java
package com.example.tpubpfe.service.realtime;

/** Published after every diffusion_logs insert; listeners run after commit. */
public record DiffusionRecordedEvent(Long diffusionLogId, Long supportId) {
}
```

### 1.4 Admin decisions → AI feedback (no code coupling)

L1 builds feedback **only from persisted data**: every `ai_decision_logs` row with `decision_type = 'ADMIN'` (decision `VALIDATED`, `VALIDATED_OVERRIDE` or `REJECTED`), joined to its `check`. L4 guarantees that a multi-level approval writes the ADMIN decision log **only when the decision becomes effective** (the final approval, or a rejection). Intermediate approvals live in `approvals` (V9) and never produce decision logs.

### 1.5 SSE through the Next bridge

Backend SSE endpoints live under `/api/realtime/**`. In Next, the dedicated route `src/app/api/realtime/[...path]/route.ts` (L4) takes precedence over the catch-all bridge. `SecurityConfig` gets `DispatcherType.ASYNC` in its permitted dispatcher types (L4 hunk), because async dispatches of an emitter must not be re-authenticated by the stateless JWT filter.

### 1.6 Route slugs (frontend)

| Route | Lane | Roles |
|---|---|---|
| `/admin/ia-qualite` | L1 | ADMINISTRATEUR, SUPERVISEUR |
| `/connexion/verification` | L2 | public (TOTP challenge in progress) |
| `/connexion/activer-2fa` | L2 | public (enrolment challenge in progress) |
| `/mot-de-passe-requis` | L2 | authenticated with `mustChangePassword` |
| `/admin/compte` | L2 | staff |
| `/espace/profil` (section `#securite`) | L2 | ANNONCEUR |
| `/ecran/[supportId]?cle=…` | L2 | public (pairing) |
| `/admin/carte-chaleur` | L3 | staff |
| `/admin/supervision` | L4 | staff |
| `/admin/approbations` | L4 | ADMINISTRATEUR, SUPERVISEUR |
| `/admin/notifications` | L4 | staff |

**L4 owns `src/content/nav.ts`, `src/lib/shortcuts.ts` and `src/components/shell/**`**, and adds **every** round-2 nav entry listed in §5.9 (hrefs are plain strings, so this compiles without the other lanes).

---

## 2. L1 `ia-ocr`: OCR, frames, image analysis, LLM providers, learning

### 2.1 Configuration: `config/AiAnalysisProperties` (prefix `tpub.analysis`), registered by `config/AiAnalysisConfig`

| Key | Env | Default | local | docker | test |
|---|---|---|---|---|---|
| `tpub.analysis.ocr.mode` | `TPUB_OCR_MODE` | `auto` (`auto`\|`tess4j`\|`simulated`; legacy `tesseract` = `tess4j`) | auto | auto | **simulated** |
| `tpub.analysis.ocr.tessdata-path` | `TPUB_OCR_TESSDATA` | `./tessdata` | `<repo>\BackEnd\tessdata` (set by start-local) | `/app/tessdata` | n/a |
| `tpub.analysis.ocr.languages` | `TPUB_OCR_LANGUAGES` | `fra+eng+ara` | | | |
| `tpub.analysis.ocr.timeout-seconds` | | `20` | | | |
| `tpub.analysis.ocr.min-word-confidence` | | `50` | | | |
| `tpub.analysis.ocr.max-threads` | | `2` | | | |
| `tpub.analysis.video.timeout-seconds` | | `20` | | | |
| `tpub.analysis.image.analysis-max-side` | | `512` | | | |
| `tpub.analysis.provider.type` | `TPUB_AI_PROVIDER` | `local` (`local`\|`openai`\|`anthropic`) | local | local | **local** |
| `tpub.analysis.provider.timeout-ms` | `TPUB_AI_PROVIDER_TIMEOUT_MS` | `90000` | | | |
| `tpub.analysis.provider.max-images` | | `4` | | | |
| `tpub.analysis.provider.openai.api-key` | `OPENAI_API_KEY` | empty | | | |
| `tpub.analysis.provider.openai.model` | `OPENAI_MODEL` | `gpt-4o-mini` | | | |
| `tpub.analysis.provider.anthropic.api-key` | `ANTHROPIC_API_KEY` | empty | | | |
| `tpub.analysis.provider.anthropic.model` | `ANTHROPIC_MODEL` | `claude-opus-5` | | | |
| `tpub.analysis.learning.enabled` | `TPUB_AI_LEARNING_ENABLED` | `true` | | | (scheduler off through `tpub.scheduler.enabled=false`) |
| `tpub.analysis.learning.auto-apply` | `TPUB_AI_LEARNING_AUTO_APPLY` | `true` | | | |
| `tpub.analysis.learning.cron` | | `0 30 3 * * *` | | | |
| `tpub.analysis.learning.window-days` | | `180` | | | |
| `tpub.analysis.learning.min-feedback` | | `20` | | | |
| `tpub.analysis.learning.min-rule-support` | | `3` | | | |

Once L1 lands, `tpub.ai.openai-enabled` and `tpub.ai.ocr.*` (R1) are **legacy and ignored**. Only `tpub.analysis.provider.type` chooses the provider, and that provider also needs its key. If the key is missing, startup logs one WARN « Fournisseur IA `<type>` sans clé : analyse locale seule », and the effective provider is `local`.

### 2.2 OCR (Tess4J)

**Maven.** `net.sourceforge.tess4j:tess4j:5.13.0` (exclude transitive logging bindings if they clash with Logback) and `com.twelvemonkeys.imageio:imageio-webp:3.12.0` (WebP decoding for ImageIO).

**Classes.** `service/ai/ocr/Tess4jOcrService implements OcrService`. `OcrServiceResolver` stays `@Primary`. The CLI `TesseractOcrService` is **removed**.

**Availability probe** (runs once, lazily). Both conditions must hold:
- The tessdata directory contains `<lang>.traineddata` for **every** configured language.
- The native library loads: `new Tesseract()` + `setDatapath` + a 1×1 test run, catching `UnsatisfiedLinkError`, `NoClassDefFoundError` and `Exception`.

If the probe fails:
- Log a single WARN « OCR Tesseract indisponible (<raison>) : OCR simulé utilisé. Lancez BackEnd/scripts/fetch-tessdata.ps1 ».
- Every extraction then delegates to `SimulatedOcrService` (engine `SIMULE`).
- The application never crashes.

**Extraction per image:**
1. Decode with ImageIO. On failure → `OcrResult.none()`.
2. Upscale ×2 (bicubic) when the longest side is < 1000 px. Downscale when the longest side is > 2000 px.
3. Convert to grayscale.
4. Run `Tesseract` with `setLanguage(languages)`, `setPageSegMode(3)` and `setOcrEngineMode(1)` (LSTM). It runs on a bounded executor (`max-threads`) with `Future.get(timeout)`. A timeout gives a WARN and falls back to the simulated OCR. Each task creates its own instance; instances are never shared between threads.
5. Text = the words with confidence ≥ `min-word-confidence`, with whitespace normalised.
6. Boxes = `getWords(image, RIL_WORD)`, filtered by confidence and rescaled to the original pixel coordinates.

**Types.**
- `OcrService.OcrResult` gains `List<OcrBox> boxes` and `Double meanConfidence`. Existing constructors keep working through an overload.
- `record OcrBox(int x, int y, int w, int h, float confidence)`.
- `OcrEngine` stays `TESSERACT | SIMULE | AUCUN`. `TESSERACT` now means Tess4J.

**Scripts** `BackEnd/scripts/fetch-tessdata.ps1` and `BackEnd/scripts/fetch-tessdata.sh`:
- Download `fra`, `eng` and `ara` from `https://github.com/tesseract-ocr/tessdata_fast/raw/4.1.0/<lang>.traineddata` into `BackEnd/tessdata/`. The target directory is an optional argument.
- Idempotent: an existing file over 100 KB is kept.
- Check each SHA-256 against `BackEnd/scripts/tessdata.sha256`. L1 commits that file after a first verified download. On a mismatch the script deletes the file and exits 1.
- Messages are in French.

`BackEnd/.gitignore` gains `tessdata/`.

**Dockerfile** (L1):
- Runtime base `eclipse-temurin:21-jre-noble`.
- `apt-get install -y --no-install-recommends libtesseract5 curl ca-certificates`.
- Symlink `libtesseract.so` → `libtesseract.so.5` in `/usr/lib/x86_64-linux-gnu`.
- A `tessdata` build stage runs `fetch-tessdata.sh /tessdata`; the files are copied to `/app/tessdata`.
- `ENV TPUB_OCR_TESSDATA=/app/tessdata`.
- The non-root user is kept.

### 2.3 Video frames (JCodec)

**Maven.** `org.jcodec:jcodec:0.2.5` and `org.jcodec:jcodec-javase:0.2.5`.

**Class.** `service/ai/media/VideoFrameExtractor`, for `video/mp4` only.
- WebM → `supported=false`, plus the issue « analyse vidéo impossible (format WebM) » (LOW, quality Δ 0).

**Container metadata.** Read through `MP4Demuxer.createMP4Demuxer(NIOUtils.readableChannel(file))`:
- `durationSeconds = ceil(totalDuration)`.
- Width and height come from the video codec meta.

**Frames.**
- Positions: `t = 0`, `t = duration/2`, `t = max(0, duration − 0.5)`, via `FrameGrab.seekToSecondPrecise` + `AWTUtil.toBufferedImage`.
- At most 3 frames, with an overall timeout of `video.timeout-seconds`.
- Thumbnail = the middle frame, written to the §1.2 path. It is written only when absent or older than the media file.
- Every frame goes through OCR (§2.2) and image analysis (§2.4).
- Media text = union of the frame texts.
- Media metrics = the **worst** frame: minimum sharpness and contrast, the most extreme brightness, maximum text coverage.

**Metadata write-back.**
- When `media_files.duration_seconds`, `width_px` or `height_px` is null, L1 stores the container value through `MediaFileRepository.save` (allowed).
- A declared duration more than 2 s away from the container duration → « durée déclarée incohérente avec le fichier », quality −5.
- R1's duration rules then use the container duration.

### 2.4 Local image analysis (`service/ai/media/ImageAnalyzer`, pure)

**Input:** a decoded `BufferedImage` and the OCR boxes.

**Setup:**
- Work image: bilinear downscale so the longest side ≤ `analysis-max-side`.
- Luma: `Y = 0.299R + 0.587G + 0.114B` (0..255).

**Metrics:**

| Metric | Formula | Issue (quality Δ / risk Δ) |
|---|---|---|
| `aspectRatio` | w / h (original image) | none |
| `aspectFit` | With `r` = aspectRatio: `d = min(abs(r−16/9)/(16/9), abs(r−9/16)/(9/16))`. Then, in order: `d ≤ 0.05` → `"16:9"` / `"9:16"`; `abs(r−1) ≤ 0.05` → `"CARRE"`; `d ≤ 0.15` → `"PROCHE"`; else `"AUTRE"` | `CARRE` « format carré : bandes noires sur les écrans 16:9 et 9:16 » −3. `PROCHE` « format proche de 16:9 ou 9:16 (recadrage léger) » −2. `AUTRE` « format inadapté aux écrans » −5. **This replaces R1's 16:9/9:16/1:1 rule.** |
| resolution | original w×h | R1 « résolution insuffisante » −15 is kept (< 800×450). New: longest side < 1280 or shortest side < 720, when not already insufficient → « résolution moyenne : 1920×1080 recommandé » −5 |
| `sharpness` | Variance of the 3×3 Laplacian `[0,1,0;1,−4,1;0,1,0]` over Y (work image, borders excluded) | `< 50` « visuel flou » −15. `50..<100` « netteté limitée » −5 |
| `brightness` | Mean Y | `< 50` « visuel trop sombre » −10. `> 215` « visuel surexposé » −10 |
| `contrast` | Standard deviation of Y | `< 30` « contraste faible » −10 |
| `textCoverage` | Σ areas of the OCR boxes (confidence-filtered, original coordinates) / (w·h), capped at 1 | `> 0.35` « texte trop présent dans le visuel » −10. `> 0.50`: −15 instead, **and** risk +5 LOW « surcharge textuelle : lisibilité réduite en circulation » (source `IMAGE`) |
| `dominantColors` | k-means with k=5, 10 iterations, RGB, on a ≤ 64×64 downsample. Deterministic init: mean colour first, then farthest point. Sorted by share. Hex `#rrggbb`. Share rounded to 3 decimals. Shares < 0.02 dropped. | Top share ≥ 0.90 → « visuel quasi uniforme » −10 |

**Rules:**
- R1's once-per-label rule still applies.
- Every issue carries a French recommendation (e.g. « Fournissez un visuel net (évitez les agrandissements) »).
- R1's OCR rule (> 200 characters) is kept.
- If decoding fails → « analyse d'image impossible » (LOW, Δ 0) and no metrics.

**Stored shape.** The JSON of `model/AiMediaAnalysis` gains nullable fields. The response DTO `dto/AiMediaAnalysisResponse` maps `thumbnailPath` → `thumbnailUrl = storage.publicUrl(thumbnailPath)` and never serialises the path:

```ts
interface AiMediaAnalysisV2 extends AiMediaAnalysis {
  ocrEngine: "TESSERACT"|"SIMULE"|"AUCUN"; ocrConfidence: number|null;   // mean word confidence 0..100
  metrics: ImageMetrics|null;                                             // image, or worst frame for a video
  frames: { label: "DEBUT"|"MILIEU"|"FIN"; positionSeconds: number; extractedText: string|null; metrics: ImageMetrics|null }[];
  thumbnailUrl: string|null;                                              // signed (publicUrl)
  videoSupported: boolean|null; containerDurationSeconds: number|null }
interface ImageMetrics { width: number; height: number; aspectRatio: number; aspectFit: "16:9"|"9:16"|"CARRE"|"PROCHE"|"AUTRE";
  sharpness: number; brightness: number; contrast: number; textCoverage: number; dominantColors: { hex: string; share: number }[] }
```

### 2.5 Vision moderation providers

```java
public interface VisionModerationProvider {
    AiProviderType type();                            // OPENAI | ANTHROPIC
    boolean isConfigured();
    ProviderVerdict analyze(ProviderRequest request); // throws ProviderException on any failure
}
record ProviderRequest(Long campaignId, String name, String objective, BigDecimal budget, LocalDate startDate, LocalDate endDate,
                       String ocrText, List<String> mediaSummaries, List<ProviderImage> images) {}
record ProviderImage(String mediaType /* image/jpeg */, byte[] data) {}   // JPEG q0.85, longest side ≤ 1024
record ProviderVerdict(AiCheckStatus status, int riskScore, int qualityScore, List<String> issues,
                       String recommendation, String reason, String model) {}
```

**Images sent:** IMAGE and BANNER media first, then the middle frames of VIDEO media. Order is `sortOrder,id`; the list is truncated to `max-images`.

**Verdict JSON** (same for both providers): `{ aiStatus: "APPROVED"|"REVIEW_REQUIRED"|"REJECTED", riskScore: 0..100, qualityScore: 0..100, detectedIssues: string[] /* French, ≤ 10 */, recommendation: string, reason: string }`. The system prompt is R1's French moderator prompt plus « Analyse aussi les images fournies (texte, symboles, contenu choquant, qualité visuelle) ».

**OpenAI** (`OpenAiVisionProvider`, refactored from `OpenAiAnalysisClient`):
- `POST https://api.openai.com/v1/chat/completions` with `response_format: {type:"json_object"}` and `temperature: 0.2`.
- User content = a text part, then image parts `{type:"image_url", image_url:{url:"data:image/jpeg;base64,…"}}`.

**Anthropic** (`AnthropicVisionProvider`): plain HTTP through Spring `RestClient`, no SDK.
- `POST https://api.anthropic.com/v1/messages`.
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`, `anthropic-beta: server-side-fallback-2026-07-01`.
- Body:
  ```
  { model, max_tokens: 16000, fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: <verdict schema> } },
    system: <prompt>,
    messages: [{ role: "user", content: [ {type:"image", source:{type:"base64", media_type:"image/jpeg", data}} …,
                                          {type:"text", text: <campaign text>} ] }] }
  ```
- Never send `temperature`, `thinking` or `budget_tokens` (all rejected on `claude-opus-5`).
- Check `stop_reason` before reading `content`. `refusal` (log `stop_details.category` when present) or `max_tokens` → `ProviderException`.
- Parse the first `text` content block as JSON. `ProviderVerdict.model` = the response's `model` field, because with server-side fallbacks it may differ from the requested model.
- HTTP 400 on the structured-output field → retry once without `output_config.format`, adding « Réponds uniquement en JSON » to the prompt.

**Transport:**
- Connect timeout 5 s. Read timeout `provider.timeout-ms`.
- No other retry.
- Keys are never logged.

**Merge** (extends R1 §2.2.8):
- Risk = max, quality = min, status = most severe.
- Issues = union, with source `OPENAI` or `ANTHROPIC` (new `AiIssueSource.ANTHROPIC`). Recommendations = union.
- `engine` = `LOCAL_OPENAI` | `LOCAL_ANTHROPIC`. The column `provider_model` stores the model string.
- On failure: the local result with `engine=LOCAL` and the reason suffix « (<Fournisseur> indisponible : analyse locale appliquée) ».

**Order of work:** the local analysis always runs. The provider call happens after the local outcome is computed and before persistence, never while holding a row lock.

`AiEngine` gains `ANTHROPIC` and `LOCAL_ANTHROPIC`.

### 2.6 Learning from admin decisions

**Feedback ingestion.** `AiFeedbackService.sync()` is idempotent. It runs every 10 minutes (scheduler), before each recalibration, and before `GET /api/ai/quality`. Every ADMIN decision log without feedback gets one `ai_feedback` row:

| AI status of the check | Admin decision | `outcome` |
|---|---|---|
| APPROVED | VALIDATED | `CONFIRMED_APPROVAL` |
| APPROVED | REJECTED | `FALSE_NEGATIVE` |
| REVIEW_REQUIRED or REJECTED | VALIDATED or VALIDATED_OVERRIDE | `FALSE_POSITIVE` |
| REVIEW_REQUIRED or REJECTED | REJECTED | `CONFIRMED_FLAG` |

`matched_rule_ids` = the non-null `check.matched_rules[].ruleId`. `created_at` = the decision log's `created_at`.

**Recalibration** (`AiCalibrationService.recalibrate(trigger)`) uses the feedback of the last `window-days`:

```
n = feedback count;  FP, FN, CA, CF = counts per outcome
fpRate = FP / max(1, FP + CF)        fnRate = FN / max(1, FN + CA)

Thresholds (defaults: A0 = 31 "review from risk ≥ A", R0 = 70 "reject when risk > R")
  if n < min-feedback: A = A0, R = R0
  else:
    c = n / (n + 20)
    A = clamp(21, 45, A0 + round(10 × (fpRate − fnRate) × c))
    m = feedback whose check was REVIEW_REQUIRED;  rej = share of those rejected by the admin
    R = clamp(60, 85, R0 − round(10 × (rej − 0.5) × m / (m + 20)))
    R = max(R, A + 20)
  then limit the movement vs the active version: A ∈ [A_prev − 5, A_prev + 5], R ∈ [R_prev − 5, R_prev + 5]

Per-rule weight (feedback where rule r matched)
  TP = admin REJECTED, FP = admin VALIDATED (override included), s = TP + FP
  s < min-rule-support → w = 1.0
  else p = (TP + 1) / (s + 2);  target = 1 + (p − 0.5) × s / (s + 10)
       w = clamp(0.5, 1.5, clamp(w_prev − 0.25, w_prev + 0.25, target)), rounded to 2 decimals
```

**Pipeline use.** The active calibration is loaded for each analysis.
- Rule points = `round(severityPoints × w_rule)`.
- CRITICAL still forces REJECTED. HIGH still forces REVIEW_REQUIRED.
- Status: REJECTED if critical ∨ risk > R. REVIEW_REQUIRED if risk ≥ A ∨ high ∨ quality < 40. Otherwise APPROVED.
- Every check stores `calibration_version`.

**Versions.**
- Every run writes a new version.
- `changed` = the thresholds or the weights differ from the active version.
- `auto-apply=true` and `changed` → the new version becomes active (the old one is deactivated in the same transaction, under a pessimistic lock on the active row). Otherwise the new version is stored inactive, as a proposal.
- V6 seeds version 1 (`INITIAL`, A = 31, R = 70, no weights).

### 2.7 Backend API (L1)

| Method & path | Roles | Behaviour |
|---|---|---|
| `GET /api/ai/report/{campaignId}`, `GET /api/ai/checks/{campaignId}` (existing) | readable | Reports gain `mediaAnalyses: AiMediaAnalysisV2[]`, `providerModel: string\|null`, `calibrationVersion: number\|null`. `engine` may be `ANTHROPIC` or `LOCAL_ANTHROPIC`. |
| `GET /api/ai/providers` | ADMINISTRATEUR, SUPERVISEUR | `{ provider: "LOCAL"\|"OPENAI"\|"ANTHROPIC"; configured: boolean; model: string\|null; ocr: { engine: "TESSERACT"\|"SIMULE"; languages: string; tessdataPresent: boolean; reason: string\|null }; video: { mp4: boolean; webm: boolean }; learning: { enabled: boolean; autoApply: boolean; cron: string } }`. Never includes a key. |
| `GET /api/ai/quality?from&to` | ADMINISTRATEUR, SUPERVISEUR | `AiQualityResponse`. Defaults: from = today−89, to = today. Range > 366 days → 400 `INVALID_RANGE`. |
| `GET /api/ai/feedback?outcome&ruleId&from&to&page&size` | ADMINISTRATEUR, SUPERVISEUR | `PageResponse<AiFeedbackResponse>`, sorted `createdAt,desc`. `outcome` is a comma list. |
| `GET /api/ai/calibrations` | ADMINISTRATEUR, SUPERVISEUR | `AiCalibrationResponse[]`, version desc, at most 50 |
| `POST /api/ai/calibrations/recalibrate` | ADMINISTRATEUR | 201 `AiCalibrationResponse` (trigger `MANUEL`). Audit `AI_RECALIBRATED`. |
| `POST /api/ai/calibrations/{version}/activate` | ADMINISTRATEUR | 200 `AiCalibrationResponse`. Unknown version → 404 `CALIBRATION_NOT_FOUND`. Audit `AI_CALIBRATION_ACTIVATED`. |

```ts
interface AiQualityResponse { from: string; to: string; feedbackCount: number;
  confirmedApprovals: number; falseNegatives: number; falsePositives: number; confirmedFlags: number;
  falsePositiveRate: number|null; falseNegativeRate: number|null; accuracy: number|null;  // null when the denominator is 0
  overrideRate: number|null;                                                               // VALIDATED_OVERRIDE / admin validations
  perRule: { ruleId: number; ruleName: string; severity: Severity; active: boolean; matches: number; confirmed: number;
             falsePositives: number; precision: number|null /* raw TP/(TP+FP) */; weight: number }[];  // matches desc
  weekly: { weekStart: string; feedback: number; falsePositives: number; falseNegatives: number; overrides: number }[]; // ISO weeks, zero-filled
  activeCalibration: AiCalibrationResponse }
interface AiFeedbackResponse { id: number; campaignId: number; campaignName: string; checkId: number|null; decisionLogId: number;
  aiStatus: "APPROVED"|"REVIEW_REQUIRED"|"REJECTED"; adminDecision: "VALIDATED"|"VALIDATED_OVERRIDE"|"REJECTED";
  outcome: "CONFIRMED_APPROVAL"|"FALSE_NEGATIVE"|"FALSE_POSITIVE"|"CONFIRMED_FLAG"; riskScore: number; qualityScore: number;
  matchedRuleIds: number[]; calibrationVersion: number|null; decidedByName: string|null; createdAt: string }
interface AiCalibrationResponse { version: number; active: boolean; trigger: "INITIAL"|"PLANIFIE"|"MANUEL"; changed: boolean;
  approveThreshold: number; rejectThreshold: number; ruleWeights: { ruleId: number; ruleName: string|null; weight: number }[];
  feedbackCount: number; falsePositives: number; falseNegatives: number; createdByName: string|null; createdAt: string }
```

**Schedulers** (both expose `runOnce()` and run only when `tpub.scheduler.enabled` is true):
- `scheduler/AiRecalibrationScheduler`: cron `learning.cron`, trigger `PLANIFIE`, requires `learning.enabled`.
- `scheduler/AiFeedbackSyncScheduler`: cron `0 */10 * * * *`.

### 2.8 `V6__ai_ocr_learning.sql`

```sql
ALTER TABLE ai_content_checks
    ADD COLUMN calibration_version INTEGER,
    ADD COLUMN provider_model VARCHAR(100);
ALTER TABLE ai_content_checks DROP CONSTRAINT IF EXISTS chk_ai_content_checks_engine;
ALTER TABLE ai_content_checks ADD CONSTRAINT chk_ai_content_checks_engine
    CHECK (engine IN ('LOCAL', 'OPENAI', 'LOCAL_OPENAI', 'ANTHROPIC', 'LOCAL_ANTHROPIC'));

CREATE TABLE ai_calibrations (
    id BIGSERIAL PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    trigger_type VARCHAR(10) NOT NULL,
    changed BOOLEAN NOT NULL DEFAULT FALSE,
    approve_threshold SMALLINT NOT NULL,
    reject_threshold SMALLINT NOT NULL,
    rule_weights JSONB NOT NULL DEFAULT '{}',
    feedback_count INTEGER NOT NULL DEFAULT 0,
    false_positive_count INTEGER NOT NULL DEFAULT 0,
    false_negative_count INTEGER NOT NULL DEFAULT 0,
    metrics JSONB NOT NULL DEFAULT '{}',
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ai_calibrations_trigger CHECK (trigger_type IN ('INITIAL', 'PLANIFIE', 'MANUEL')),
    CONSTRAINT chk_ai_calibrations_approve CHECK (approve_threshold BETWEEN 21 AND 45),
    CONSTRAINT chk_ai_calibrations_reject CHECK (reject_threshold BETWEEN 60 AND 85)
);
CREATE UNIQUE INDEX uq_ai_calibrations_active ON ai_calibrations (is_active) WHERE is_active;
INSERT INTO ai_calibrations (version, is_active, trigger_type, changed, approve_threshold, reject_threshold)
VALUES (1, TRUE, 'INITIAL', FALSE, 31, 70);

CREATE TABLE ai_feedback (
    id BIGSERIAL PRIMARY KEY,
    decision_log_id BIGINT NOT NULL UNIQUE REFERENCES ai_decision_logs(id) ON DELETE CASCADE,
    campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    check_id BIGINT REFERENCES ai_content_checks(id) ON DELETE SET NULL,
    ai_status VARCHAR(20) NOT NULL,
    admin_decision VARCHAR(20) NOT NULL,
    outcome VARCHAR(20) NOT NULL,
    risk_score SMALLINT NOT NULL,
    quality_score SMALLINT NOT NULL,
    matched_rule_ids JSONB NOT NULL DEFAULT '[]',
    calibration_version INTEGER,
    decided_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_ai_feedback_ai_status CHECK (ai_status IN ('APPROVED', 'REVIEW_REQUIRED', 'REJECTED')),
    CONSTRAINT chk_ai_feedback_admin_decision CHECK (admin_decision IN ('VALIDATED', 'VALIDATED_OVERRIDE', 'REJECTED')),
    CONSTRAINT chk_ai_feedback_outcome CHECK (outcome IN ('CONFIRMED_APPROVAL', 'FALSE_NEGATIVE', 'FALSE_POSITIVE', 'CONFIRMED_FLAG'))
);
CREATE INDEX idx_ai_feedback_created ON ai_feedback (created_at DESC);
CREATE INDEX idx_ai_feedback_outcome ON ai_feedback (outcome, created_at);
```

The partial unique index exists only in SQL. On H2, "one active version" is enforced by the service.

### 2.9 Frontend (L1)

**API modules.**
- `src/lib/api/types-ia.ts`: `AiMediaAnalysisV2`, `ImageMetrics`, `AiReportV2 = AiReport & { mediaAnalyses: AiMediaAnalysisV2[]; providerModel: string|null; calibrationVersion: number|null }`, plus the §2.7 DTOs.
- `src/lib/api/endpoints-ia.ts`: `aiQualityApi.{ providers, quality({from,to}), feedback(query), calibrations, recalibrate, activate(version) }`.

**`src/components/ai/ai-media-insights.tsx`** (new): `export function AiMediaInsights({ report }: { report: AiReport })`. It narrows the report to `AiReportV2` and renders, for each media:
- The thumbnail (`thumbnailUrl`).
- A frames strip « Début / Milieu / Fin », each with its OCR text.
- Metric chips: « Netteté », « Luminosité », « Contraste », « Texte dans le visuel : 42 % », « Format 16:9 » / « 9:16 » / « carré » / « à recadrer ».
- Dominant-colour swatches, each with `aria-label` « Couleur #1f2937 : 34 % ».
- An OCR badge « OCR Tesseract (confiance 87 %) » or « OCR simulé : données Tesseract absentes ».
- A provider badge « Analyse complémentaire : Claude (claude-opus-5) » or « OpenAI (gpt-4o-mini) » when `engine` is `LOCAL_*`.

The reference thresholds live in `src/components/ai/image-metrics-model.ts` (pure, unit-tested) and mirror §2.4.

**Existing components.**
- `src/components/campaign/ai-analysis.tsx` (owned): `AiReportBody` renders `AiMediaInsights` after the issues list.
- `src/components/admin/campaign-review-dialog.tsx` (L4-owned): L1 hunk, §9.3.
- `ai-rules-view.tsx` / `ai-rules-model.ts` (owned): new column « Poids appris » from `activeCalibration.ruleWeights` (shows `1,00` when absent), with its own loading/error handling.

**Page `/admin/ia-qualite`** (`src/app/admin/ia-qualite/page.tsx`, `src/components/admin/ai-quality-view.tsx`, `ai-quality-model.ts`), titled « Qualité de l'IA »:
- Period picker: import `PeriodPicker` from `admin-controls` (import only).
- KPI tiles « Faux positifs », « Faux négatifs », « Taux de dérogation », « Exactitude », « Décisions analysées ». Rates show « — » when null.
- Weekly SVG chart built with the existing chart primitives.
- Table « Précision par règle »: Règle, Gravité, Déclenchements, Confirmés, Faux positifs, Précision, Poids appris.
- Panel « Calibration »:
  - Active version, « Revue à partir d'un risque de A », « Refus au-delà de R ».
  - History table.
  - Buttons « Recalibrer maintenant » and « Activer cette version », shown to ADMINISTRATEUR only (SUPERVISEUR gets read-only).
- Panel « Moteurs » (from `/ai/providers`). When tessdata is missing it shows « Exécutez BackEnd/scripts/fetch-tessdata.ps1 puis redémarrez le backend ».
- Tab « Retours »: paginated feedback, filtered by outcome, each row linking to the campaign review.
- States: loading; empty « Aucune décision administrateur sur la période »; error with retry; restricted state for OPERATEUR.

---

## 3. L2 `securite`: 2FA, device keys, secrets, bootstrap, signed media

### 3.1 Configuration (L2 owns `TpubProperties`, `application.yml`, `application-test.yml`)

| Key | Env | Default | `local` profile | docker | test |
|---|---|---|---|---|---|
| `tpub.jwt.secret` | `JWT_SECRET` | **none** (fail fast) | from `.tpub-local.secrets` | required in `.env` | fixed ≥ 32-byte test value |
| `tpub.media.signing-secret` | `MEDIA_SIGNING_SECRET` | empty → derived | from secrets file | recommended | test value |
| `tpub.media.signed-url-ttl-seconds` | `MEDIA_SIGNED_URL_TTL_SECONDS` | `3600` | | | |
| `tpub.security.totp.issuer` | `TPUB_TOTP_ISSUER` | `TPUB` | | | |
| `tpub.security.totp.encryption-key` | `TOTP_ENCRYPTION_KEY` | empty → derived | from secrets file | recommended | test value |
| `tpub.security.totp.required-roles` | `TPUB_TOTP_REQUIRED_ROLES` | empty (comma list among ADMINISTRATEUR, SUPERVISEUR, OPERATEUR; ANNONCEUR ignored with WARN) | empty | documented: `ADMINISTRATEUR,SUPERVISEUR,OPERATEUR` | empty |
| `tpub.security.totp.challenge-ttl-seconds` | | `300` | | | |
| `tpub.security.totp.max-attempts` | | `5` | | | |
| `tpub.security.bootstrap-admin.email` | `TPUB_ADMIN_EMAIL` | `admin@tpub.local` | | | |
| `tpub.security.bootstrap-admin.initial-password` | `TPUB_ADMIN_INITIAL_PASSWORD` | empty → random, logged once | from secrets file | set in `.env` | n/a |
| `tpub.security.bootstrap-admin.must-change-password` | `TPUB_ADMIN_MUST_CHANGE_PASSWORD` | `true` | `false` (set by start-local) | true | |
| `tpub.device.rate-limit.per-minute` | | `120` | | | |
| `tpub.device.rate-limit.burst` | | `30` | | | |
| `tpub.device.invalid-key-per-minute-per-ip` | | `20` | | | |
| `tpub.device.touch-seconds` | | `60` | | | |
| `tpub.diffusion.simulated-time-enabled` | `TPUB_SIMULATED_TIME_ENABLED` | `false` | **`true`** | false | true |

`application.yml` gains a `local` profile document (`spring.config.activate.on-profile: local`) with `tpub.diffusion.simulated-time-enabled: true` and INFO logging. `start-local.ps1` already sets `SPRING_PROFILES_ACTIVE=local`.

**Secret rules** (`config/SecretsValidator`, runs at startup, not in the test profile):
- Missing `tpub.jwt.secret`, or fewer than 32 UTF-8 bytes → `IllegalStateException` « JWT_SECRET manquant ou trop court (32 octets minimum). Définissez la variable d'environnement JWT_SECRET (voir .env.example). »
- A secret whose SHA-256 matches one of the two historical values (the `change_me_jwt_secret_min_32_characters_long` placeholder and the 64-hex value removed from `.env.example`/`start-local.ps1`) → `IllegalStateException` « JWT_SECRET compromis (valeur publiée dans l'historique git) : générez-en un nouveau. » Only the hashes are embedded.
- Derived keys (when the dedicated secret is empty or < 32 bytes): `HMAC-SHA256(jwtSecret, "tpub-media-signing-v1")` and `HMAC-SHA256(jwtSecret, "tpub-totp-v1")`, with one INFO line each. Docs warn that rotating `JWT_SECRET` then invalidates media URLs (harmless) and **all TOTP secrets** (users must re-enrol). Setting `TOTP_ENCRYPTION_KEY` avoids this.
- Docs (`README` + `.env.example` header): the previously committed JWT secret is in git history and must be considered **compromised**. Every deployment must set a new one.

### 3.2 Admin bootstrap and forced password change

`config/DataInitializer` (owned) rules:
- If an active user with role ADMINISTRATEUR exists → do nothing.
- Otherwise, if the bootstrap e-mail already exists → do nothing (log WARN « aucun administrateur actif »).
- Otherwise create the bootstrap admin:
  - Password = `initial-password` if set (must match the policy: 8..100 characters, ≥ 1 letter, ≥ 1 digit; otherwise fail fast).
  - Else a random 20-character password (`SecureRandom`, alphabet `A-Za-z0-9` without `0O1lI`, with at least one digit and one letter), logged **once** at WARN in a framed block « Mot de passe administrateur initial (à changer) : … ».
  - `must_change_password = bootstrap-admin.must-change-password`.
- V7 adds `must_change_password DEFAULT FALSE`: the existing local admin (`Admin@123`) keeps working unchanged. Docs tell operators to change it.

`users.must_change_password = true` effects:
- The login response carries `mustChangePassword: true`.
- Every authenticated request is refused with 403 `PASSWORD_CHANGE_REQUIRED` « Vous devez définir un nouveau mot de passe avant de continuer. », except: `GET /api/me`, `POST /api/me/password`, `POST /api/me/logout`, `GET|POST /api/me/2fa/**`. The check lives in `security/PasswordChangeRequiredInterceptor`, which reads a `mustChangePassword` flag carried by `UserDetailsImpl` (loaded with the session).
- `POST /api/me/password` clears the flag (its other R1 effects are unchanged).
- `POST /api/admin/users/{id}/require-password-change` (ADMINISTRATEUR, not self → 400 `ROLE_NOT_ALLOWED`) sets the flag and revokes the user's sessions (`REVOKED_BY_ADMIN`). 200 `AdminUserResponse`. Audit `USER_PASSWORD_CHANGE_REQUIRED`.

### 3.3 TOTP two-factor authentication

**Algorithm** (`security/totp/TotpGenerator`, pure Java, RFC 6238 over RFC 4226):
- HMAC-SHA1, 6 digits, 30-second step, T0 = 0.
- Validation window: steps −1, 0, +1.
- Replay protection: a code whose step ≤ `users.totp_last_used_step` is refused. On success, store the step.
- Secret: 20 random bytes, Base32 (RFC 4648, upper case, no padding).
- Stored encrypted: AES-256-GCM with the TOTP key (the first 32 bytes of the configured key, or of the derived HMAC), 12-byte random IV, 128-bit tag. Column value = base64(IV ‖ ciphertext ‖ tag).
- URI: `otpauth://totp/{issuer}:{urlencoded email}?secret={BASE32}&issuer={issuer}&algorithm=SHA1&digits=6&period=30`.
- Unit tests use the RFC 6238 SHA1 vectors (T = 59, 1111111109, 1234567890, 2000000000, 20000000000, truncated to 6 digits).

**Recovery codes:**
- 10 codes per generation, format `xxxxx-xxxxx` (lower-case Crockford Base32 without `ilou`, 50 bits).
- Stored as `code_hash = hex(HMAC-SHA256(totpKey, userId + ":" + normalized))`, where normalized = lower case, hyphen removed.
- Single use (`used_at`). Regeneration deletes the previous codes.

**Login flow:**
- `POST /api/auth/login`:
  - Password and account are checked as in R1.
  - Then:
    - TOTP enabled → **200 `LoginChallengeResponse`** with `status: "TOTP_REQUIRED"`.
    - Role in `required-roles` and TOTP not enabled → 200 `LoginChallengeResponse` with `status: "TOTP_ENROLMENT_REQUIRED"`.
    - Otherwise → 200 `AuthResponse` with `status: "AUTHENTICATED"`.
  - No session is opened and no success history row is written before the challenge is completed.
- Challenges:
  - Token = `tpc_` + base64url(32 bytes).
  - Row `login_challenges` stores the SHA-256 hex of the token, `expires_at = now + challenge-ttl-seconds`, `attempts`.
  - Single use (`consumed_at`).
- `POST /api/auth/login/verify` `{ challengeToken: string; code: string }`:
  - `code` is either 6 digits (TOTP) or a recovery code.
  - Success → 200 `AuthResponse` (session opened, success history row). When a recovery code was used, `recoveryCodeUsed: true`.
  - Wrong code → 401 `TOTP_CODE_INVALID` « Code de vérification incorrect. », `attempts + 1`, history failure `TOTP_INVALID`.
  - Unknown, expired, consumed, or attempts ≥ `max-attempts` → 401 `CHALLENGE_EXPIRED` « La vérification a expiré. Reconnectez-vous. »
- `POST /api/auth/2fa/setup` `{ challengeToken }`:
  - Only for a `TOTP_ENROLMENT` challenge, otherwise 401 `CHALLENGE_EXPIRED`.
  - Returns 200 `TotpSetupResponse`. The pending secret is stored on the user.
- `POST /api/auth/2fa/enable` `{ challengeToken; code }`:
  - Success → 200 `AuthResponse & { recoveryCodes: string[] }`. TOTP is enabled and the session opened.
  - Wrong code → 401 `TOTP_CODE_INVALID`.
- `/api/auth/**` stays public. The JWT filter ignores `Authorization` on every `/api/auth/login*` and `/api/auth/2fa/*` route.

**Self-service** (authenticated, any role):

| Method & path | Body | Behaviour |
|---|---|---|
| `GET /api/me/2fa` | none | `TwoFactorStatusResponse` |
| `POST /api/me/2fa/setup` | none | 200 `TotpSetupResponse`. Already enabled → 409 `TOTP_ALREADY_ENABLED`. Pending secret valid 10 minutes; a new setup replaces it. |
| `POST /api/me/2fa/enable` | `{ code }` | 200 `{ recoveryCodes: string[] }`. No pending secret or expired → 409 `TOTP_SETUP_REQUIRED`. Wrong code → 400 `TOTP_CODE_INVALID`. Audit `USER_2FA_ENABLED` (actor = self). |
| `POST /api/me/2fa/disable` | `{ password; code }` | 204. Role required → 403 `TOTP_REQUIRED_FOR_ROLE`. Wrong password → 400 `INVALID_CURRENT_PASSWORD`. Wrong code (TOTP or recovery) → 400 `TOTP_CODE_INVALID`. Revokes other sessions. Audit `USER_2FA_DISABLED`. |
| `POST /api/me/2fa/recovery-codes` | `{ code }` (TOTP only) | 200 `{ recoveryCodes }`. TOTP not enabled → 409 `TOTP_NOT_ENABLED`. |
| `POST /api/admin/users/{id}/2fa/reset` | none | ADMINISTRATEUR only, never on self (400 `ROLE_NOT_ALLOWED`). Disables TOTP, deletes recovery codes, revokes sessions. 200 `AdminUserResponse`. Audit `USER_2FA_RESET`. |

```ts
type LoginResponse = AuthResponse | LoginChallengeResponse;
interface AuthResponse { status: "AUTHENTICATED"; token: string; email: string; nom: string; role: RoleCode; userId: number;
  sessionId: string; expiresAt: string; mustChangePassword: boolean; twoFactorEnabled: boolean; recoveryCodeUsed?: boolean;
  recoveryCodes?: string[] /* only from /auth/2fa/enable */ }
interface LoginChallengeResponse { status: "TOTP_REQUIRED"|"TOTP_ENROLMENT_REQUIRED"; challengeToken: string; expiresAt: string; email: string }
interface TotpSetupResponse { secret: string /* Base32 */; otpauthUri: string; expiresAt: string }
interface TwoFactorStatusResponse { enabled: boolean; enabledAt: string|null; required: boolean; recoveryCodesRemaining: number; pendingSetup: boolean }
// MeResponse (and AdminUserResponse) gain: twoFactorEnabled: boolean; twoFactorRequired: boolean; mustChangePassword: boolean
```

`POST /api/auth/register` never asks for TOTP (ANNONCEUR cannot be a required role) and returns `AuthResponse` with `status: "AUTHENTICATED"`.

### 3.4 Player device keys, simulated time, device rate limit

**Admin API** (new `controller/DeviceKeyController`):

| Method & path | Roles | Behaviour |
|---|---|---|
| `POST /api/supports/{id}/device-key` | ADMINISTRATEUR | 201 `DeviceKeyIssuedResponse`. Revokes an existing active key (`revoke_reason = ROTATED`). Unknown support → 404 `SUPPORT_NOT_FOUND`. Audit `SUPPORT_DEVICE_KEY_ISSUED`, or `SUPPORT_DEVICE_KEY_ROTATED` when a key existed (details: keyPrefix only). |
| `GET /api/supports/{id}/device-key` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | 200 `DeviceKeyStatusResponse` |
| `GET /api/supports/device-keys` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | `DeviceKeyStatusResponse[]` for every support (unpaired ones included) |
| `DELETE /api/supports/{id}/device-key` | ADMINISTRATEUR | 204 (no-op when there is no active key). Audit `SUPPORT_DEVICE_KEY_REVOKED`. |

```ts
interface DeviceKeyIssuedResponse { supportId: number; deviceKey: string /* shown once */; keyPrefix: string /* first 12 chars */;
  createdAt: string; pairingPath: string /* "/ecran/{id}?cle={deviceKey}" */ }
interface DeviceKeyStatusResponse { supportId: number; supportName: string; paired: boolean; keyPrefix: string|null;
  createdAt: string|null; lastUsedAt: string|null; lastUsedIp: string|null }
```

**Storage:** `key_hash` = SHA-256 hex of the full key (the key has 256 bits of entropy, so no salt is needed). Comparison uses `MessageDigest.isEqual`.

**`security/device/DeviceKeyInterceptor`** (HandlerInterceptor, registered by L2's own `DeviceWebMvcConfig` on the three §1.1 paths, running before `@PreAuthorize` binding). Checks, in order:
1. The IP (first `X-Forwarded-For` value, else remote address) exceeded `invalid-key-per-minute-per-ip` failures in the current minute → 429 `DEVICE_RATE_LIMITED`.
2. `supportId` query param missing or not a number → 400 `MISSING_PARAMETER`.
3. Header missing → 401 `DEVICE_KEY_REQUIRED` « Écran non appairé : clé d'appareil manquante. »
4. No active key for the support, or hash mismatch → 401 `DEVICE_KEY_INVALID` « Clé d'appareil invalide ou révoquée. » (counts toward the IP failures).
5. Token bucket per supportId (capacity `burst`, refill `per-minute`/60 tokens per second) is empty → 429 `DEVICE_RATE_LIMITED` « Trop de requêtes pour cet écran. », header `Retry-After: <seconds>`.
6. Otherwise: set request attribute `DeviceRequest.SUPPORT_ID_ATTRIBUTE`, and update `last_used_at` / `last_used_ip` at most every `touch-seconds`.

Buckets live in memory (`ConcurrentHashMap`). Entries idle for more than 10 minutes are evicted. Error bodies use `ApiErrorBody`.

**Route changes:**
- `POST /api/diffusion/interactions?supportId=` (the query param is now required). `InteractionService` checks `log.support.id == supportId`, else 404 `DIFFUSION_LOG_NOT_FOUND`.
- `GET /api/diffusion/next`: `DiffusionController` passes `datetime` to the service **only when** `tpub.diffusion.simulated-time-enabled` is true, otherwise `null` (server clock). `DiffusionResponse` gains `simulatedTime: boolean` (true when a provided datetime was used).
- `SecurityConfig.PUBLIC_ENDPOINTS` gains `"/api/diffusion/heartbeat"` (L2 adds it for L4). Device routes stay `permitAll` at the Spring Security level; the interceptor protects them. `"/uploads/**"` also stays in `PUBLIC_ENDPOINTS`: the signature filter (§3.5) controls access, not a JWT, because `<img>`/`<video>` requests carry no bearer token.

### 3.5 Signed media URLs

**Format** (`service/storage/MediaUrlSigner`, pure, unit-tested):

```
url  = {tpub.media.base-url}/{relativePath}?exp={exp}&sig={sig}
exp  = ceil((nowEpochSeconds + ttl) / 300) × 300                       // 5-minute buckets keep URLs cacheable
sig  = base64url_nopad( HMAC-SHA256(signingKey, "v1\n" + relativePath + "\n" + exp) )
relativePath = normalised stored path: '\' → '/', leading '/' removed, no '.' or '..' segment,
               each segment percent-encoded (RFC 3986 unreserved kept) in the URL, but signed in decoded form
```

**Changes to `FileStorageService.publicUrl(relativePath)`** (L2 owns `FileStorageService` from this round):
- Signs every non-blank path.
- Null → null. Blank → unsigned base URL.
- An absolute `http(s)://` value is returned unchanged.

**`security/SignedMediaFilter`** (servlet filter on `/uploads/**`, before the resource handler):
- Decode the path, then normalise it. A traversal attempt (`..`, backslash, NUL, or a path outside the upload root) → 404 without a body.
- `exp` or `sig` missing → 403 `MEDIA_SIGNATURE_REQUIRED`.
- `exp` not a number, `exp > now + ttl + 300`, or bad signature (constant-time comparison) → 403 `MEDIA_SIGNATURE_INVALID`.
- `exp < now` → 403 `MEDIA_URL_EXPIRED` « Lien de média expiré : rechargez la page. »
- Valid → continue. The response carries `Cache-Control: private, max-age=<min(exp − now, 3600)>` (`MediaWebConfig`'s public 1-day cache is replaced).

**Who receives media URLs:**
- Media URLs reach only the viewers who can already read the resource: owner or staff through `CampaignAccessGuard` (`MediaFileResponse.url`, `CampaignResponse.mediaUrl`), the user for their own logo (`MeResponse.logoUrl`), staff for `DiffusionLogResponse.mediaUrl`, and **paired players only for an eligible campaign** (`DiffusionResponse.mediaUrl`, produced only after the §R1 2.5 eligibility gates).
- `DiffusionService` stores the **canonical unsigned** URL in `diffusion_logs.media_url` (L2 hunk §9.3). `DiffusionLogQueryService` re-signs values that start with the base URL on read.

**Next `/uploads/[...path]` route** (L2):
- Forwards only the `exp` and `sig` query params. Other params are dropped.
- 403 is passed through as 403 (empty body, `cache-control: no-store`). 404 stays 404.
- `isSafeUploadPath` is kept.
- The response `cache-control` comes from upstream (no public default).

**Frontend consumers:**
- New `src/lib/media-url.ts`: `stripQuery(url)`, `mediaExtension(url)`, `signedUrlExpiresAt(url): number|null`, `isExpiringSoon(url, nowMs, marginMs = 120_000)`.
- `player-schedule.ts` `adMediaKind` uses `mediaExtension`. The player needs nothing else: every poll returns a fresh URL.
- `media-gallery.tsx`, `screen-mockup.tsx`, `profile-view.tsx` logo, `network/creative-preview-import.tsx` and `porteur3d/creative-texture.ts`: on an `<img>`/`<video>` error or an expired URL, invalidate the owning resource (`resource-cache.invalidate`) once and refetch. A second failure shows the existing error fallback.
- `campaign-review-dialog.tsx` (L4) and `ai-media-insights.tsx` (L1) display API URLs as-is (no hunk needed).
- `resource-cache.ts` (L2): entries whose payload contains signed media URLs get a TTL ≤ 30 minutes.

### 3.6 `V7__security_2fa_devices.sql`

```sql
ALTER TABLE users
    ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN totp_secret_enc VARCHAR(512),
    ADD COLUMN totp_enabled_at TIMESTAMPTZ,
    ADD COLUMN totp_last_used_step BIGINT,
    ADD COLUMN totp_pending_secret_enc VARCHAR(512),
    ADD COLUMN totp_pending_created_at TIMESTAMPTZ;
ALTER TABLE users ADD CONSTRAINT chk_users_totp_secret CHECK (NOT totp_enabled OR totp_secret_enc IS NOT NULL);

CREATE TABLE user_recovery_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ
);
CREATE INDEX idx_user_recovery_codes_user ON user_recovery_codes (user_id);

CREATE TABLE login_challenges (
    id VARCHAR(36) PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(20) NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    ip_address VARCHAR(64),
    user_agent VARCHAR(255),
    CONSTRAINT chk_login_challenges_purpose CHECK (purpose IN ('TOTP_LOGIN', 'TOTP_ENROLMENT'))
);
CREATE INDEX idx_login_challenges_expires ON login_challenges (expires_at);

ALTER TABLE login_history DROP CONSTRAINT IF EXISTS chk_login_history_failure_reason;
ALTER TABLE login_history ADD CONSTRAINT chk_login_history_failure_reason CHECK (
    failure_reason IS NULL OR failure_reason IN ('BAD_CREDENTIALS', 'ACCOUNT_DISABLED', 'UNKNOWN_USER', 'TOTP_INVALID'));

CREATE TABLE support_device_keys (
    id BIGSERIAL PRIMARY KEY,
    support_id BIGINT NOT NULL REFERENCES diffusion_supports(id) ON DELETE CASCADE,
    key_hash CHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(12) NOT NULL,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    last_used_ip VARCHAR(64),
    revoked_at TIMESTAMPTZ,
    revoked_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    revoke_reason VARCHAR(10),
    CONSTRAINT chk_support_device_keys_reason CHECK (revoke_reason IS NULL OR revoke_reason IN ('ROTATED', 'REVOKED'))
);
CREATE UNIQUE INDEX uq_support_device_keys_active ON support_device_keys (support_id) WHERE revoked_at IS NULL;
```

`LoginFailureReason` gains `TOTP_INVALID`. A scheduler `scheduler/LoginChallengeCleanupScheduler` (cron `0 0 * * * *`) deletes challenges that expired more than 24 hours ago.

### 3.7 Frontend (L2)

**Session layer:**
- `src/lib/session-cookie.ts`: `SessionUser` gains `mustChangePassword: boolean` and `twoFactorEnabled: boolean`. `isAuthResponse` requires `status === "AUTHENTICATED"` (or an absent `status`, for pre-round-2 backends).
- `src/lib/session-auth.ts` / `/api/session/login`:
  - `AUTHENTICATED` → cookies + `{ status: "AUTHENTICATED", user }`.
  - `TOTP_REQUIRED` / `TOTP_ENROLMENT_REQUIRED` → sets the httpOnly cookie `tpub_challenge` (SameSite=Lax, path `/api/session`, max-age = seconds until `expiresAt`, Secure in production). Returns `{ status, email, expiresAt }`. The token never reaches JavaScript.
- New Next routes (same-origin check, forward UA/XFF):
  - `POST /api/session/login/verify` `{ code }`
  - `POST /api/session/enrolment/setup` → `{ secret, otpauthUri, expiresAt }`
  - `POST /api/session/enrolment/enable` `{ code }` → `{ status: "AUTHENTICATED", user, recoveryCodes }`
  - All three read `tpub_challenge` and clear it on success or `CHALLENGE_EXPIRED`.
  - `/api/session/register` is unchanged.
- `src/middleware.ts`:
  - A session with `mustChangePassword` visiting `/espace/**` or `/admin/**` → redirect to `/mot-de-passe-requis`.
  - `/mot-de-passe-requis` without a session → `/connexion`.
  - `/connexion/verification` and `/connexion/activer-2fa` without a `tpub_challenge` cookie → `/connexion?expire=1`.
- `src/lib/api/client.ts`:
  - A 403 with code `PASSWORD_CHANGE_REQUIRED` → `window.location.assign("/mot-de-passe-requis")` (once).
  - `ApiFetchOptions` gains `headers?: Record<string, string>`.
- Bridge `src/app/api/[...path]/route.ts`: `x-tpub-device-key` added to `FORWARDED_REQUEST_HEADERS`.
- `endpoints.ts`:
  - `sessionApi.{ login → SessionLoginResult, verifyTotp, enrolmentSetup, enrolmentEnable }`
  - `meApi.{ twoFactor, twoFactorSetup, twoFactorEnable, twoFactorDisable, regenerateRecoveryCodes }`
  - `adminUsersApi.{ resetTwoFactor, requirePasswordChange }`
  - `deviceKeysApi.{ issue, status, list, revoke }`
  - `diffusionApi.next(q, { deviceKey, signal })` and `diffusionApi.interaction(body, { supportId, deviceKey })` send the header.

**Screens (French):**
- `/connexion` (`login-form.tsx`): on `TOTP_REQUIRED` → `router.replace("/connexion/verification?next=…")`; on enrolment → `/connexion/activer-2fa?next=…`.
- `/connexion/verification`: « Vérification en deux étapes ».
  - 6-digit input (`inputMode="numeric"`, `autocomplete="one-time-code"`).
  - Link « Utiliser un code de secours » switches to the `xxxxx-xxxxx` format.
  - Remaining time.
  - Errors inline; `CHALLENGE_EXPIRED` → back to `/connexion`.
- `/connexion/activer-2fa`: « Activez la double authentification ».
  - Steps: 1. QR code (SVG generated client-side with `qrcode`'s `toString(uri, { type: "svg" })`, `role="img"`, `aria-label`) plus the secret in groups of 4 with a copy button. 2. Code confirmation. 3. Recovery codes (copy / download `.txt`, checkbox « J'ai conservé mes codes de secours » required before continuing).
- `/mot-de-passe-requis`: « Définissez un nouveau mot de passe ». Current password + new password + confirmation, same rules as the profile. On success, refresh the session cookie user (`GET /api/session`), then go to the role home.
- `src/components/account/**` (new):
  - `TwoFactorCard`: status, enable (inline QR flow), disable (password + code dialog), regenerate recovery codes; shows « Obligatoire pour votre rôle » when required.
  - `RecoveryCodesDialog`
  - `PasswordChangeCard` (extracted from `profile-view`)
  - `SessionsCard` (extracted)
  - Used by `/espace/profil` (section id `securite`) and `/admin/compte` (profile summary, password, 2FA, sessions, login history).
- `users-view.tsx` / `users-model.ts`:
  - Badges « 2FA active » and « Changement de mot de passe requis ».
  - Actions « Réinitialiser la double authentification » and « Exiger un nouveau mot de passe » (confirm dialogs, ADMINISTRATEUR only).
- Network admin: `src/components/admin/device-pairing-dialog.tsx`, opened from `network-admin-view.tsx` (row action « Appairer l'écran » + status column « Écran appairé / non appairé · dernier contact »).
  - Generate or rotate (confirm « L'ancien écran sera déconnecté »).
  - Shows the key once, with the full pairing URL `${window.location.origin}/ecran/{id}?cle=…`, a copy button, « Ouvrir le lecteur » (new tab), and a QR code of the URL.
  - « Révoquer ».
  - Warning « Cette clé ne sera plus affichée ».
- Player (`/ecran/[supportId]`):
  - `page.tsx` passes `cle` to `PlayerScreen`.
  - `PlayerScreen` on mount: if `cle` is valid → `storeDeviceKey`, then `history.replaceState` removes `cle` (and keeps `datetime`). Reads the key with `readDeviceKey`.
  - No key → `UnpairedSlide` « Écran non appairé — demandez à un administrateur TPUB de générer le lien d'appairage (Réseau › Porteur › Appairer l'écran) », no polling.
  - `DEVICE_KEY_INVALID` → `clearDeviceKey`, then `UnpairedSlide`.
  - `DEVICE_RATE_LIMITED` → back off using `Retry-After` (planAfterError).
  - When `?datetime` was requested and the response has `simulatedTime === false`, the overlay shows « Heure simulée ignorée : le serveur utilise son horloge ».

---

## 4. L3 `carte-prix`: polygons, heatmaps, dynamic pricing

### 4.1 Configuration: `config/GeoPricingProperties` (prefixes `tpub.geo` and `tpub.pricing.dynamic`; one class per prefix, registered by `config/GeoPricingConfig`)

| Key | Default |
|---|---|
| `tpub.geo.polygon.max-vertices` | `100` (per ring, closing point excluded) |
| `tpub.geo.polygon.max-total-vertices` | `200` |
| `tpub.geo.polygon.max-parts` | `5` (MultiPolygon) |
| `tpub.geo.polygon.max-holes` | `5` (per polygon) |
| `tpub.geo.polygon.min-area-km2` | `0.01` |
| `tpub.geo.polygon.max-area-km2` | `2000` |
| `tpub.geo.polygon.max-radius-km` | `50` (circumscribed radius from the centroid) |
| `tpub.geo.heatmap.max-range-days` | `366` |
| `tpub.pricing.dynamic.enabled` (`TPUB_DYNAMIC_PRICING_ENABLED`) | `true` |
| `tpub.pricing.dynamic.min-multiplier` | `0.70` |
| `tpub.pricing.dynamic.max-multiplier` | `1.60` |
| `tpub.pricing.dynamic.hour-bands` | `[{start: "00:00", end: "07:00", multiplier: 0.70, label: "Nuit"}, {start: "07:00", end: "10:00", multiplier: 1.15, label: "Pointe du matin"}, {start: "10:00", end: "16:00", multiplier: 1.00, label: "Journée"}, {start: "16:00", end: "20:00", multiplier: 1.25, label: "Pointe du soir"}, {start: "20:00", end: "24:00", multiplier: 0.90, label: "Soirée"}]` (must cover 00:00–24:00 without overlap, else startup fails) |
| `tpub.pricing.dynamic.day-multipliers` | `MONDAY 1.00, TUESDAY 1.00, WEDNESDAY 1.00, THURSDAY 1.00, FRIDAY 1.05, SATURDAY 1.15, SUNDAY 0.90` |
| `tpub.pricing.dynamic.demand-weight` | `0.30` |
| `tpub.pricing.dynamic.demand-support-share` | `0.60` (zone share = 1 − 0.60) |
| `tpub.pricing.dynamic.scarcity-weight` | `0.20` |

No profile overrides. The test profile uses the defaults.

### 4.2 Polygon geometry (`util/PolygonGeometry`, pure; mirrored in `FrontEnd/src/lib/polygon.ts` with the same constants and tests)

- **Input** is GeoJSON `Polygon` (`coordinates: [ring…]`, ring = `[[lng, lat], …]`) or `MultiPolygon`. Coordinates are rounded to 7 decimals. Unclosed rings are closed automatically. Consecutive duplicates are removed.
- **Validation** (in order, the first failure wins). Every failure is 400 `INVALID_POLYGON`, with `errors = { "zones[i].polygon": "<French reason>" }` (emergencies: key `polygon`):
  1. Type not Polygon/MultiPolygon, or a malformed array → « Géométrie invalide (Polygon ou MultiPolygon attendu). »
  2. lat outside −90..90 or lng outside −180..180 → « Coordonnées hors limites. »
  3. A ring with < 3 distinct vertices → « Un polygone doit avoir au moins 3 sommets. »
  4. Vertex, part or hole limits exceeded → « Polygone trop détaillé (100 sommets au plus). » (the message states the limit reached)
  5. A self-intersecting ring (any pair of non-adjacent edges intersecting, O(n²)), or a hole not inside its outer ring → « Le tracé du polygone se croise. »
  6. Area < min → « Zone trop petite (0,01 km² minimum). »; area > max → « Zone trop grande (2 000 km² maximum). »
  7. Circumscribed radius > max → « Zone trop étendue (50 km autour de son centre au maximum). »
- **Area:** planar shoelace after an equirectangular projection around the centroid latitude: `x = R·lng_rad·cos(lat0)`, `y = R·lat_rad`, R = 6371.0088 km. Outer ring minus holes, summed over parts.
- **Centroid:** area-weighted centroid in that projection (MultiPolygon: weighted by part area), converted back to lat/lng.
- **Circumscribed radius:** max haversine distance from the centroid to any vertex (km, 3 decimals).
- **Point in polygon:** even-odd ray casting on (lng, lat) over every ring of a part. A point lies in a MultiPolygon when it lies in any part. Points on an edge (distance < 1e-9 degrees) count as **inside**.

### 4.3 Campaign zones: circles and polygons

`CampaignZoneRequest` becomes:

```ts
interface CampaignZonesRequest { zones: CampaignZoneInput[] /* 1..5, circles and polygons together */ }
type CampaignZoneInput =
  | { type?: "CERCLE"; latitude: number; longitude: number; radiusKm: number /*0.1..50*/; label?: string|null }
  | { type: "POLYGONE"; polygon: GeoJsonPolygon | GeoJsonMultiPolygon; label?: string|null };
interface CampaignZoneResponse { id: number; zoneId: number; zoneName: string; label: string|null;
  type: "CERCLE"|"POLYGONE"; latitude: number; longitude: number; radiusKm: number;   // polygon: centroid + circumscribed radius
  polygon: GeoJsonPolygon | GeoJsonMultiPolygon | null; areaKm2: number; supportsInside: number }
```

- For polygons, the row stores `latitude/longitude = centroid` and `radius_km = circumscribed radius` (at least 0.1). This keeps every consumer that only reads circles safe: the bounding circle always contains the polygon. `zone_id` is resolved from the centroid, as in R1.
- `areaKm2` for circles = π·r², 3 decimals.
- **Enforcement:** `ReservationService.insideAnyCircle(support, zones)` becomes "inside any target": haversine for CERCLE, point-in-polygon for POLYGONE (name kept for callers; javadoc updated). It is used by reservation creation (R1 check 6 → still 400 `SUPPORT_OUTSIDE_CAMPAIGN_ZONE`), by `DiffusionService.supportInsideCampaignZones` (automatic), by `CampaignZoneService.supportInsideAny` (TEMPORAIRE cancellation), by availability with a `campaignId` target, and by `CampaignMapper` `supportsInside`.
- Availability `distanceKm` for polygons = 0 inside, otherwise the distance to the centroid.
- Other R1 codes are unchanged (`ZONE_LIMIT_EXCEEDED`, `INVALID_ZONE`, `VALIDATION_FAILED` on an empty list).

### 4.4 Emergency polygon targeting

- `EmergencyRequest` gains `polygon?: GeoJsonPolygon | GeoJsonMultiPolygon | null`.
- Target priority: polygon > circle > zone. Polygon and circle together → 400 `EMERGENCY_TARGET_CONFLICT` « Choisissez un cercle ou un polygone, pas les deux. »
- No zone, no circle and no polygon → 400 `EMERGENCY_TARGET_REQUIRED` (R1).
- Polygon without `zoneId` → the zone is resolved from the centroid (R1 rule).
- Stored in `emergency_messages.target_polygon`. `EmergencyResponse` gains `targetPolygon: GeoJsonPolygon | GeoJsonMultiPolygon | null`.
- Targeting (`util/TargetingGeometry.emergencyTargets(EmergencyMessage, DiffusionSupport)`, pure): polygon → PIP; circle → R1; else zone id. Used by `DiffusionService.targets` and `EmergencyService.affectedSupports` (L3 hunks §9.3).

### 4.5 Heatmaps

All points are GeoJSON `FeatureCollection<Point>` with coordinates `[lng, lat]` and `properties.weight ≥ 0`. Ranges: `from`, `to` are inclusive dates. `to < from` or range > `max-range-days` → 400 `INVALID_RANGE`.

| Method & path | Roles | Behaviour |
|---|---|---|
| `GET /api/heatmap/diffusions?from&to&contentType&zoneId` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | Defaults: last 30 days, `contentType=PUBLICITE` (comma list). One feature per support with ≥ 1 log in range. `weight` = number of diffusion logs; `properties: { supportId, supportName, zoneId, zoneName, weight, clicks }`. |
| `GET /api/heatmap/demand?from&to&zoneId` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | Defaults: today → today+29. `reservations`: one feature per support, `weight` = reserved slot-hours (below), `properties: { supportId, supportName, zoneId, zoneName, weight, occupancy }`. `targets`: one feature per campaign zone of campaigns not in `BROUILLON` whose period overlaps the range (point = circle centre or polygon centroid), `weight = 1`, `properties: { campaignZoneId, campaignId, type, weight }`. `byZone` per active zone. |
| `GET /api/heatmap/demand/public?startDate&endDate&startTime&endTime` | ANNONCEUR, ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | For the wizard. `startTime ≥ endTime` → 400 `INVALID_TIME_RANGE`; range limits as above. One feature per ACTIF support, `weight = occupancy` (0..1) on the window; `properties: { supportId, zoneId, zoneName, weight }` (**no campaign or client data**). `byZone: { zoneId; zoneName; occupancy; availableSupports; totalSupports }[]`. |

```ts
interface HeatmapResponse<P> { from: string; to: string; maxWeight: number; totalWeight: number;
  points: { type: "FeatureCollection"; features: { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: P }[] } }
interface DemandHeatmapResponse { from: string; to: string; reservations: HeatmapResponse<…>["points"]; targets: HeatmapResponse<…>["points"];
  maxReservationWeight: number; byZone: { zoneId: number; zoneName: string; reservedHours: number; capacityHours: number;
  occupancy: number; targets: number }[] }
```

- **Slot-hours:** for each TEMPORAIRE/CONFIRMEE reservation overlapping the range, `overlapDays × hours(startTime, endTime)`.
- **Capacity hours** of a support = `rangeDays × 16 × capacity` (07:00–23:00 service day).
- `occupancy = min(1, reserved / capacity)`.
- Zone `occupancy` = Σ reserved / Σ capacity over its ACTIF supports.

### 4.6 Dynamic pricing

**Pricing** (`service/pricing/DynamicPricingService`, pure core `PricingCalculator`) for one support S, a window W = [sd, ed] × [st, et), and an optional campaign C to exclude:

```
base         = R1 estimatedCost(S, W)                                   // views × CPM / 1000, 2 decimals
hour         = Σ_band (minutes of [st,et) ∩ band × band.multiplier) / minutes(st,et)
day          = mean over each date d in [sd,ed] of dayMultiplier(d.dayOfWeek)
occS         = min(1, Σ_other-campaign TEMPORAIRE|CONFIRMEE reservations r on S overlapping W of overlapMinutes(r, W) / (capacity(S) × minutes(W)))
               where overlapMinutes = overlapDays × overlapping minutes of the time ranges; minutes(W) = days × minutes(st,et)
occZ         = same ratio summed over every ACTIF support of S.zone (numerator and denominator)
demand       = 1 + demand-weight × (share × occS + (1 − share) × occZ)                       // 1.00..1.30
availability = DISPONIBLE supports of S.zone on W (R1 §2.7, excluding C) / ACTIF supports of S.zone (1 when 0)
scarcity     = 1 + scarcity-weight × (1 − availability)                                       // 1.00..1.20
raw          = hour × day × demand × scarcity
multiplier   = round(clamp(min, max, raw), 4, HALF_UP)        clamped = raw != clamp(min, max, raw)
finalCost    = round(base × multiplier, 2, HALF_UP)            (disabled → multiplier 1, factors 1)
unitCost     = round(R1 unitCost × multiplier, 4, HALF_UP)    // diffusion consumption for a reservation
```

**Breakdown type:**

```ts
interface PriceBreakdown { baseCost: number; multiplier: number; finalCost: number; clamped: boolean; enabled: boolean;
  factors: { hour: number; dayOfWeek: number; demand: number; scarcity: number };       // 4 decimals
  details: { supportOccupancy: number; zoneOccupancy: number; zoneAvailability: number;
             hourBands: { label: string; minutes: number; multiplier: number }[];
             days: { dayOfWeek: "LUNDI"|"MARDI"|"MERCREDI"|"JEUDI"|"VENDREDI"|"SAMEDI"|"DIMANCHE"; count: number; multiplier: number }[] };
  explanations: string[] }   // French, e.g. « Créneau en pointe du soir : ×1,25 », « Zone occupée à 64 % : ×1,19 »
```

**Where it applies:**
- `EstimationService.estimate(...)` returns `Estimate(views, cost = finalCost, breakdown)`. The existing signature is kept, plus an overload with `excludeCampaignId`.
- `POST /api/estimates`: body gains `campaignId?: number|null` (excluded from occupancy). `lines[]` gain `baseCost` and `pricing: PriceBreakdown`. The response gains `totalBaseCost`. `totalCost` = Σ final.
- `GET /api/estimates/campaign/{id}`: lines gain `baseCost`, `priceMultiplier` and `pricing` (the stored breakdown; null for reservations created before V8, which then show multiplier 1).
- Reservation creation (single and batch) stores `estimated_cost = finalCost`, `base_cost`, `price_multiplier` and `pricing_breakdown` computed at booking time. **Prices are not recomputed afterwards.**
- `AvailabilityResponse.supports[]` gain `priceMultiplier`. `estimatedCost` is dynamic (window of the query, campaign excluded when `campaignId` is given). `summary.estimatedCostAvailable` and zone recommendations therefore become dynamic automatically.
- Diffusion consumption: `DiffusionService` uses `estimationService.unitCost(support, reservation)` = R1 unit cost × `reservation.priceMultiplier` (1 when null) for the budget gate and consumption (L3-owned). Today `DiffusionService.next` computes a single `unitCost(support)` before `candidates(...)`. L3 moves that computation **per candidate**, because each candidate reservation has its own multiplier: `isCampaignEligible` and `diffuseAd` receive the candidate's own unit cost. `unitCost(DiffusionSupport)` stays as the multiplier-1 overload.
- `GET /api/pricing/config` (4 roles): `{ enabled, minMultiplier, maxMultiplier, hourBands, dayMultipliers: Record<DayOfWeekFr, number>, demandWeight, scarcityWeight }`, so the UI can explain the pricing.
- Brief guardrail: dynamic prices appear **only inside the app** as « estimation », never on marketing pages (`/tarifs` untouched).

### 4.7 `V8__polygons_pricing.sql`

```sql
ALTER TABLE campaign_zones
    ADD COLUMN geometry_type VARCHAR(10) NOT NULL DEFAULT 'CERCLE',
    ADD COLUMN polygon JSONB,
    ADD COLUMN area_km2 NUMERIC(10,3);
ALTER TABLE campaign_zones
    ADD CONSTRAINT chk_campaign_zones_geometry_type CHECK (geometry_type IN ('CERCLE', 'POLYGONE')),
    ADD CONSTRAINT chk_campaign_zones_geometry CHECK (
        (geometry_type = 'CERCLE' AND polygon IS NULL) OR (geometry_type = 'POLYGONE' AND polygon IS NOT NULL));
UPDATE campaign_zones SET area_km2 = ROUND((PI() * radius_km * radius_km)::numeric, 3) WHERE area_km2 IS NULL;

ALTER TABLE emergency_messages ADD COLUMN target_polygon JSONB;
ALTER TABLE emergency_messages ADD CONSTRAINT chk_emergency_messages_polygon_xor_circle
    CHECK (target_polygon IS NULL OR (latitude IS NULL AND longitude IS NULL AND radius_km IS NULL));

ALTER TABLE reservations
    ADD COLUMN price_multiplier NUMERIC(6,4) NOT NULL DEFAULT 1.0000,
    ADD COLUMN base_cost NUMERIC(12,2),
    ADD COLUMN pricing_breakdown JSONB;
ALTER TABLE reservations ADD CONSTRAINT chk_reservations_price_multiplier CHECK (price_multiplier BETWEEN 0.5 AND 2.0);
UPDATE reservations SET base_cost = estimated_cost WHERE base_cost IS NULL;
```

### 4.8 Frontend (L3)

- `src/lib/polygon.ts`: `validatePolygon(rings, limits)` → `{ ok: true; areaKm2; centroid; radiusKm } | { ok: false; reason: string }` (same French reasons), `pointInPolygon`, `polygonAreaKm2`, `centroid`, `circumscribedRadiusKm`, `ringsToGeoJson`, `geoJsonToRings`. Unit-tested against the backend vectors (square around Tunis, self-intersecting bow tie, hole, MultiPolygon, point on an edge).
- `src/lib/api/types-carte.ts` / `endpoints-carte.ts`:
  - `GeoJsonPolygon`, `GeoJsonMultiPolygon`, `CampaignZoneInput`, `CampaignZoneResponseCarte`, `EmergencyRequestCarte`, `EmergencyResponseCarte`, `PriceBreakdown`, `EstimateResponseCarte`, `CampaignEstimateResponseCarte`, heatmap DTOs, `PricingConfig`.
  - `campaignZonesApi.set(id, body)`, `emergencyCarteApi.create(body)`, `heatmapApi.{ diffusions, demand, demandPublic }`, `pricingApi.config()`, `estimatesCarteApi.{ compute, campaign }`.
- `src/components/map/**` (owned). `NetworkMapProps` / `EngineProps` gain optional props:
  - `polygons?: { id: string; rings: LngLat[][][] /* parts → rings → vertices */; label?: string; tone?: "brand"|"urgent"|"muted"; active?: boolean }[]` (MapLibre fill + line layers; SVG fallback paths).
  - `polygonDraft?: { vertices: LngLat[]; closed: boolean }` plus `onPolygonDraftChange?: (draft) => void`. When provided, the toolbar shows the tool « Dessiner un polygone ».
    - Click adds a vertex.
    - Click on the first vertex, double-click or `Enter` closes the ring.
    - `Backspace` removes the last vertex; `Échap` cancels.
    - Vertices are draggable once closed.
    - Live validation from `validatePolygon`, shown under the map.
    - No MapLibre plugin: custom GeoJSON source + circle layer for vertex handles.
  - `heatmap?: { points: FeatureCollection; maxWeight: number; label: string }` → a MapLibre `heatmap` layer (`heatmap-weight` = weight / maxWeight, `heatmap-radius` interpolated 12→40 px between zooms 6 and 14, the theme's colour ramp from `map-style.ts`, opacity 0.75), plus a circle layer from zoom ≥ 13. SVG fallback = proportional circles.
  - A legend component `HeatmapLegend` (gradient + « Faible / Forte »).
- `PolygonVertexEditor` (new, `src/components/map/polygon-vertex-editor.tsx`): an accessible list of vertices with latitude/longitude inputs, « Ajouter un sommet », « Supprimer », « Fermer le polygone ». It is the keyboard and screen-reader equivalent of drawing, and edits the same draft.
- Wizard step 3 (`step-zones.tsx`, `zone-model.ts`):
  - Each zone has a segmented choice « Cercle / Polygone ».
  - The zone list shows the area (« 3,2 km² ») and Porteurs inside (client-side PIP).
  - Toggle « Afficher la demande » loads `heatmapApi.demandPublic` for the campaign window (legend « Occupation des Porteurs sur votre créneau »).
  - Persists through `campaignZonesApi.set`; server `INVALID_POLYGON` errors are shown on the matching zone.
- `estimate-invoice.tsx` and `step-review.tsx`:
  - A « Détail du prix » disclosure per line: base cost, the four factors with their French explanations, final multiplier (« ×1,18 »), plus a note « Estimation : tarif ajusté selon le créneau, le jour et la demande ».
  - Totals: « Coût de base » and « Coût estimé ».
  - `step-zones` availability rows show the multiplier chip when ≠ 1.
- `campaign-zones-map.tsx`: renders polygons.
- `emergency-form-dialog.tsx` / `emergency-schema.ts`: target « Zone TPUB / Cercle / Polygone »; polygon drawn with `zone-map-picker.tsx` (extended with `polygonDraft`).
- Page `/admin/carte-chaleur` (`src/app/admin/carte-chaleur/page.tsx`, `src/components/admin/heatmap-view.tsx`, `heatmap-model.ts`):
  - Tabs « Diffusions » and « Demande »; period picker; content-type filter (Diffusions); zone filter.
  - Full `NetworkMap` with heatmap and legend.
  - Side table (top 10 Porteurs by weight, and zones with occupancy for Demande) as the non-visual equivalent.
  - Empty state « Aucune diffusion sur la période ».
  - URL state `?onglet=&du=&au=`.

---

## 5. L4 `supervision`: SSE, heartbeat, approvals, notifications, exports

### 5.1 Configuration: `config/SupervisionProperties` (prefixes `tpub.supervision`, `tpub.approval`, `tpub.notifications`; one class per prefix, registered by `config/SupervisionConfig`)

| Key | Env | Default |
|---|---|---|
| `tpub.supervision.heartbeat-interval-seconds` | | `30` |
| `tpub.supervision.offline-timeout-seconds` | | `90` |
| `tpub.supervision.presence-check-cron` | | `*/15 * * * * *` |
| `tpub.supervision.saturation-threshold` | | `0.90` |
| `tpub.supervision.saturation-cron` | | `0 */5 * * * *` |
| `tpub.supervision.emitter-timeout-minutes` | | `30` |
| `tpub.supervision.keepalive-seconds` | | `20` |
| `tpub.supervision.max-emitters` | | `200` |
| `tpub.approval.emergency-required-approvals` | `TPUB_EMERGENCY_APPROVALS` | `2` (`1` disables) |
| `tpub.approval.campaign-required-approvals` | `TPUB_CAMPAIGN_APPROVALS` | `2` (`1` disables) |
| `tpub.approval.campaign-risk-threshold` | `TPUB_CAMPAIGN_APPROVAL_RISK` | `50` |
| `tpub.notifications.retention-days` | | `90` |
| `tpub.notifications.mail.from` | `TPUB_MAIL_FROM` | empty (mail disabled) |
| `tpub.notifications.mail.min-severity` | | `CRITIQUE` |
| `tpub.notifications.mail.base-url` | `TPUB_PUBLIC_URL` | `http://localhost:3000` (links in mails) |

- **Mail** is enabled only when a `JavaMailSender` bean exists (Spring Boot creates one when `SPRING_MAIL_HOST` is set, together with `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`) **and** `mail.from` is non-blank. Otherwise nothing is sent and nothing is simulated. `application.yml` gets **no** `spring.mail.host` default. Maven: `spring-boot-starter-mail`.
- **Test profile:** defaults. Schedulers are off through `tpub.scheduler.enabled=false`.

### 5.2 Player heartbeat and presence

- `POST /api/diffusion/heartbeat?supportId=` (device, §1.1). Body (optional): `{ playerVersion?: string /*≤40*/; currentDiffusionLogId?: number|null; visible?: boolean }`.
  - Unknown support → 404 `SUPPORT_NOT_FOUND`.
  - 200 `{ supportId: number; state: "EN_LIGNE"; serverTime: string; nextHeartbeatSeconds: number }`.
- `support_presence` row upsert: `last_heartbeat_at = now`, `last_ip`, `player_version`, `current_diffusion_log_id`.
  - Previous state `HORS_LIGNE` or absent → state `EN_LIGNE`, `state_changed_at = now`, SSE `presence`, and the open `SUPPORT_OFFLINE` alert for the support is resolved.
- A `DiffusionRecordedEvent` (every `/diffusion/next` call) touches presence the same way, without a player version.
- `scheduler/PresenceScheduler` (`presence-check-cron`): `EN_LIGNE` rows whose `last_heartbeat_at < now − offline-timeout` become `HORS_LIGNE`, then SSE `presence`.
  - For supports with `technical_status = ACTIF`, it also opens a `SUPPORT_OFFLINE` alert (severity `CRITIQUE`) and notifies (§5.5).
- Presence of a support with no row = `INCONNU`.
- Frontend `src/components/player/use-heartbeat.ts` (L4):
  - `useHeartbeat(supportId, currentLogId)` reads the key with `readDeviceKey`.
  - Plain `fetch("/api/diffusion/heartbeat?supportId=…", { method: "POST", headers: { "content-type": "application/json", [DEVICE_KEY_HEADER]: key }, body })` every `nextHeartbeatSeconds` (initially 30).
  - Keeps running while the tab is hidden (`visible: false`).
  - Stops on 401 (the player handles unpairing).
  - Exponential backoff up to 5 minutes on errors.
  - No key → no heartbeat.

### 5.3 Realtime (SSE)

| Method & path | Roles | Events |
|---|---|---|
| `GET /api/realtime/supervision` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | `snapshot` (first event), then `diffusion`, `presence`, `emergency`, `alert`, `stats` (every 60 s) |
| `GET /api/realtime/notifications` | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | `unread-count` (first event), then `notification`, `unread-count` |
| `GET /api/supervision/snapshot` | same as supervision | 200 `SupervisionSnapshot` (JSON fallback when SSE fails) |

**Transport:**
- `SseEmitter(timeout = emitter-timeout-minutes)`, `produces text/event-stream`.
- Every event has `id` = monotonic long, `event` name, `data` = JSON. The first line sent is `retry: 5000`.
- A comment `: ping` every `keepalive-seconds`.
- `Last-Event-ID` is ignored: every reconnection gets a fresh snapshot.
- More than `max-emitters` open → 503 `REALTIME_CAPACITY_REACHED`.
- Failed sends remove the emitter.
- Broadcasting happens after commit (`@TransactionalEventListener(phase = AFTER_COMMIT)`) on a dedicated single-thread executor, so a slow client never blocks a request thread.
- The notifications stream only delivers the recipient's own notifications.

```ts
interface SupervisionSnapshot { serverTime: string;
  supports: { supportId: number; name: string; zoneId: number; zoneName: string; latitude: number; longitude: number;
    technicalStatus: TechnicalStatus; presence: "EN_LIGNE"|"HORS_LIGNE"|"INCONNU"; lastHeartbeatAt: string|null; playerVersion: string|null;
    current: { contentType: "PUBLICITE"|"URGENCE"|"DEFAUT"; title: string|null; campaignId: number|null; emergencyId: number|null; diffusedAt: string } | null }[];
  emergencies: EmergencyLiveEvent[];            // state EN_COURS or EN_ATTENTE_APPROBATION or PROGRAMME
  alerts: SupervisionAlert[];                   // open, newest first, ≤ 50
  recentDiffusions: DiffusionLiveEvent[];       // last 50
  stats: { onlineSupports: number; offlineSupports: number; unknownSupports: number; diffusionsLastHour: number; activeEmergencies: number; openAlerts: number } }
interface DiffusionLiveEvent { diffusionLogId: number; supportId: number; supportName: string; zoneName: string|null;
  contentType: "PUBLICITE"|"URGENCE"|"DEFAUT"; campaignId: number|null; campaignName: string|null; emergencyId: number|null; title: string|null; diffusedAt: string }
interface PresenceEvent { supportId: number; presence: "EN_LIGNE"|"HORS_LIGNE"; lastHeartbeatAt: string|null; changedAt: string }
interface EmergencyLiveEvent { emergencyId: number; title: string; urgencyLevel: UrgencyLevel; state: EmergencyStateV2;
  approvalStatus: "EN_ATTENTE"|"APPROUVE"|"REFUSE"; approvalsCount: number; approvalsRequired: number; affectedSupports: number }
interface SupervisionAlert { id: number; type: "SUPPORT_OFFLINE"|"ZONE_SATURATION"|"EMERGENCY_PENDING_APPROVAL"|"CAMPAIGN_PENDING_APPROVAL";
  severity: "INFO"|"AVERTISSEMENT"|"CRITIQUE"; title: string; message: string; supportId: number|null; zoneId: number|null;
  emergencyId: number|null; campaignId: number|null; createdAt: string; resolvedAt: string|null;
  acknowledgedAt: string|null; acknowledgedByName: string|null }
```

**Alerts API:**
- `GET /api/supervision/alerts?status=OUVERTE|RESOLUE|TOUTES&type&page&size` (staff) → `PageResponse<SupervisionAlert>`. Default status `OUVERTE` (= `resolved_at IS NULL`).
- `POST /api/supervision/alerts/{id}/acknowledge` (staff) → 200 `SupervisionAlert`. Unknown id → 404 `ALERT_NOT_FOUND`. Audit `ALERT_ACKNOWLEDGED`.

**Alert rules:**
- Zone saturation (`saturation-cron`): for each active zone with ≥ 1 ACTIF support, `occupancyNow` = ACTIF supports having ≥ capacity CONFIRMEE reservations covering now / ACTIF supports.
  - `≥ threshold` → open `ZONE_SATURATION` (AVERTISSEMENT), unless one is already open.
  - `< threshold − 0.10` → resolve the open one.
- `EMERGENCY_PENDING_APPROVAL` and `CAMPAIGN_PENDING_APPROVAL` open on the first approval and resolve on the final decision.

**Security:**
- `SecurityConfig` gets `DispatcherType.ASYNC` (hunk §9.3).
- `GlobalExceptionHandler` handles `AsyncRequestTimeoutException` and `AsyncRequestNotUsableException` without writing a body (hunk §9.3).

**Next route `src/app/api/realtime/[...path]/route.ts`** (GET only):
- Session cookie required: no or invalid session → 401 JSON `SESSION_EXPIRED_BODY`.
- Forwards `authorization`, `accept: text/event-stream`, and the client context headers to `${backend}/api/realtime/<path>`, with `signal: req.signal`.
- Streams `upstream.body` untouched with headers `content-type: text/event-stream; charset=utf-8`, `cache-control: no-cache, no-transform` (`no-transform` stops Next's gzip from buffering), `x-accel-buffering: no`.
- Upstream 401/403 with a session-end code → clears cookies + 401.
- Unit test with a mocked streaming upstream: chunks arrive before the stream ends.

**Frontend client** `src/lib/realtime/use-event-stream.ts`:
- `useEventStream(path, handlers, { fallback: () => Promise<void>, fallbackIntervalMs = 15000 })` wraps `EventSource`.
- States: `connecting | open | fallback`.
- After 3 consecutive errors within 60 s it switches to polling `fallback`, retries SSE every 60 s, and announces « Flux temps réel interrompu : actualisation toutes les 15 s » (`aria-live="polite"`).
- Closed on unmount.

### 5.4 Multi-level approval

**Effective required approvals:** `required = min(configured, number of active ADMINISTRATEUR accounts)`, never below 1. The configured value is returned too, so the UI can explain « 1 seule approbation : un seul administrateur actif ». An approval record = one distinct administrator.

**Emergencies:**
- `POST /api/emergency` (existing): the creator's creation counts as approval 1.
  - `required ≤ 1` → `approval_status = APPROUVE`, `approved_at = now` (broadcast immediately, as in R1).
  - Otherwise `EN_ATTENTE`: **not broadcast**. An alert and notifications go to the other ADMINISTRATEUR accounts.
- **Broadcast gate:** `EmergencyMessageRepository.findActiveOnDate` (used by the diffusion engine) returns only `approval_status = 'APPROUVE'` rows (L4 owns the repository). The auto-stop scheduler also deactivates `EN_ATTENTE` messages whose window ended (`stop_reason AUTO`).
- `POST /api/emergency/{id}/approve` (ADMINISTRATEUR), body `{ comment?: string|null /*≤500*/ }`:
  - Same admin already approved → 409 `APPROVAL_ALREADY_GIVEN` « Vous avez déjà approuvé ce message. »
  - Status not EN_ATTENTE → 409 `APPROVAL_NOT_PENDING`.
  - Message inactive or ended → 409 `EMERGENCY_NOT_APPROVABLE`.
  - Effect: insert an approval; when the count reaches `required` → `APPROUVE`, `approved_at`, SSE `emergency`, notifications `EMERGENCY_BROADCAST` to all staff.
  - Audit `EMERGENCY_APPROVED`. 200 `EmergencyResponse`.
- `POST /api/emergency/{id}/refuse` (ADMINISTRATEUR, **not** the creator → 409 `APPROVAL_SELF_REFUSAL`), body `{ reason: string /*3..500*/ }`:
  - Missing reason → 400 `REFUSAL_REASON_REQUIRED`.
  - Status not EN_ATTENTE → 409 `APPROVAL_NOT_PENDING`.
  - Effect: `REFUSE`, `is_active=false`, `stopped_at`, `stop_reason = REFUSE`, approval row with decision REFUSE.
  - Audit `EMERGENCY_REFUSED`. 200.
- `EmergencyResponse` gains `approvalStatus`, `approvalsRequired`, `approvalsRequiredConfigured`, `approvals: ApprovalResponse[]`, `approvedAt`.
- `state` gains `EN_ATTENTE_APPROBATION` (active, not ended, approval pending) and `REFUSE`. `GET /api/emergency?state=` accepts both.

**Campaign validation** (`POST /api/admin/campaigns/{id}/validate`, `AdminCampaignService` owned by L4):
- Every R1 precondition is checked first, in R1 order, with the same errors.
- `needsDouble` = `campaign-required-approvals ≥ 2` ∧ (status is REVIEW_REQUIRED, i.e. an override, ∨ the latest non-preview check `riskScore ≥ campaign-risk-threshold`).
- `cycleKey = "check:" + latestNonPreviewCheckId`. An AI re-run or a resubmission starts a new cycle; approvals of old cycles are ignored.
- `needsDouble` with fewer than `required − 1` existing approvals of the cycle → record the approval (details: `overrideAi`, `comment`, `priorityScore`, `riskScore`) and respond **202** `{ pending: true; approval: CampaignApprovalStatus }`. The campaign is unchanged and no ADMIN decision log is written. Alert + notifications for the other admins. Audit `CAMPAIGN_APPROVAL_RECORDED`.
- Same admin approving twice in a cycle → 409 `APPROVAL_ALREADY_GIVEN`.
- Final approval (count reaches `required`) or `!needsDouble` → R1 validation effects, using the **final** request body (comment; priorityScore of the latest non-null among the approvals).
  - The ADMIN decision log reason lists the approvers: « Validée par A et B ».
  - Audit `CAMPAIGN_VALIDATED` / `CAMPAIGN_VALIDATED_OVERRIDE` with details `approvers: [ids]`.
  - 200 `CampaignResponse`.
- Reject: a single admin, R1 unchanged. It closes the cycle and resolves the pending alert.

**Approvals API:**
- `GET /api/approvals/pending` (ADMINISTRATEUR, SUPERVISEUR) → `{ campaigns: PendingCampaignApproval[]; emergencies: PendingEmergencyApproval[] }`.
- `GET /api/approvals/campaigns/{id}` (ADMINISTRATEUR, SUPERVISEUR) → `CampaignApprovalStatus`. Unknown → 404 `CAMPAIGN_NOT_FOUND`.

```ts
interface ApprovalResponse { id: number; approverUserId: number; approverName: string; decision: "APPROUVE"|"REFUSE";
  comment: string|null; createdAt: string }
interface CampaignApprovalStatus { campaignId: number; required: boolean; reasons: ("DEROGATION_IA"|"RISQUE_ELEVE")[];
  riskScore: number|null; riskThreshold: number; approvalsRequired: number; approvalsRequiredConfigured: number;
  approvals: ApprovalResponse[]; cycleKey: string|null; canApprove: boolean /* current user is ADMIN and has not approved */ }
interface PendingCampaignApproval extends CampaignApprovalStatus { campaignName: string; clientName: string; status: CampaignStatus; requestedAt: string }
interface PendingEmergencyApproval { emergencyId: number; title: string; urgencyLevel: UrgencyLevel; zoneName: string;
  startDate: string; endDate: string; createdByName: string; approvalsRequired: number; approvals: ApprovalResponse[]; canApprove: boolean; requestedAt: string }
```

### 5.5 Notifications

**Types and recipients** (only active users of the listed roles):

| `type` | Severity | Recipients | Link |
|---|---|---|---|
| `EMERGENCY_APPROVAL_REQUIRED` | CRITIQUE | ADMINISTRATEUR except approvers | `/admin/approbations` |
| `EMERGENCY_BROADCAST` | CRITIQUE | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | `/admin/urgences` |
| `EMERGENCY_REFUSED` | AVERTISSEMENT | creator | `/admin/urgences` |
| `CAMPAIGN_APPROVAL_REQUIRED` | AVERTISSEMENT | ADMINISTRATEUR except approvers | `/admin/approbations` |
| `SUPPORT_OFFLINE` | CRITIQUE | ADMINISTRATEUR, SUPERVISEUR, OPERATEUR | `/admin/supervision?porteur={id}` |
| `ZONE_SATURATION` | AVERTISSEMENT | ADMINISTRATEUR, SUPERVISEUR | `/admin/carte-chaleur?onglet=demande` |

**API:**

| Method & path | Roles | Behaviour |
|---|---|---|
| `GET /api/notifications?unreadOnly&page&size` | staff | `PageResponse<NotificationResponse>`, `createdAt desc` |
| `GET /api/notifications/unread-count` | staff | `{ count: number }` |
| `POST /api/notifications/{id}/read` | staff (own) | 204. Someone else's or unknown → 404 `NOTIFICATION_NOT_FOUND` |
| `POST /api/notifications/read-all` | staff | `{ updated: number }` |

```ts
interface NotificationResponse { id: number; type: string; severity: "INFO"|"AVERTISSEMENT"|"CRITIQUE"; title: string; message: string;
  link: string|null; entityType: string|null; entityId: string|null; createdAt: string; readAt: string|null }
```

**Delivery:**
- Mail, when enabled: severity ≥ `min-severity`, sent asynchronously after commit to the recipient's e-mail. Subject « [TPUB] <title> », plain text + link `base-url + link`. `emailed_at` is set on success; a failure logs a WARN and never fails the transaction.
- Purge scheduler (daily 04:00): deletes read notifications older than `retention-days`.

### 5.6 PDF and Excel exports

- Maven: `com.github.librepdf:openpdf:2.0.3`, `org.apache.poi:poi-ooxml:5.4.1`.
- `GET /api/statistics/export.pdf` and `GET /api/statistics/export.xlsx`: same query and roles as R1 `export.csv` (`type=views|dashboard|mine|campaign`, `from`, `to`, `groupBy`, `campaignId`), same `EXPORT_TYPE_INVALID`.
  - Content types `application/pdf` and `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
  - `Content-Disposition` filename `tpub-statistiques-<type>-<from>-<to>.pdf|.xlsx`.
- `service/export/ReportModelBuilder` builds a neutral `ReportModel { title; subtitle; periodLabel; generatedAt; kpis: {label, value, unit}[]; tables: {name, headers, rows: Cell[][]}[]; image?: {mediaId} }` from the existing `StatisticsService` responses.
  - `CsvExportService` keeps its format. Renderers: `PdfReportRenderer`, `XlsxReportRenderer`.
- **PDF (A4 portrait):** TPUB header, title, period, generated date (Africa/Tunis, `dd/MM/yyyy HH:mm`), KPI grid, tables with repeated headers, page footer « Page n / N · Estimations internes TPUB ». Helvetica (Cp1252); characters outside Cp1252 are replaced by « ? » (documented).
  - `type=campaign` adds identity (name, advertiser, status label, period, budget, consumed), the AI summary (latest non-preview check: status, risk, quality, top 5 issues), and the primary visual. IMAGE/BANNER: the media file read through `FileStorageService.resolve`. VIDEO: the §1.2 thumbnail if present. Scaled to 60 mm height; skipped when unreadable.
- **XLSX:** sheet « Synthèse » (KPIs), then one sheet per table (« Par jour », « Par campagne », « Par Porteur », « Par zone »).
  - Numbers as numeric cells (TND format `#,##0.00 "TND"`, counts `#,##0`), dates as date cells `dd/mm/yyyy`, bold header row, autosized columns (≤ 60 characters), frozen header.
  - **Formula-injection safety:** never `setCellFormula`. Text starting with `= + - @`, tab or CR is written as a string cell with `CellStyle.setQuotePrefixed(true)`.
- Tests: open the generated bytes with OpenPDF `PdfReader` (page count, text) and POI `XSSFWorkbook` (sheets, a numeric cell, a quote-prefixed malicious name).

### 5.7 `V9__supervision_approvals_notifications.sql`

```sql
ALTER TABLE emergency_messages
    ADD COLUMN approval_status VARCHAR(12) NOT NULL DEFAULT 'APPROUVE',
    ADD COLUMN approvals_required SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN approved_at TIMESTAMPTZ;
ALTER TABLE emergency_messages ADD CONSTRAINT chk_emergency_messages_approval_status
    CHECK (approval_status IN ('EN_ATTENTE', 'APPROUVE', 'REFUSE'));
ALTER TABLE emergency_messages DROP CONSTRAINT IF EXISTS chk_emergency_messages_stop_reason;
ALTER TABLE emergency_messages ADD CONSTRAINT chk_emergency_messages_stop_reason
    CHECK (stop_reason IS NULL OR stop_reason IN ('MANUEL', 'AUTO', 'REFUSE'));
UPDATE emergency_messages SET approved_at = created_at WHERE approved_at IS NULL;

CREATE TABLE approvals (
    id BIGSERIAL PRIMARY KEY,
    entity_type VARCHAR(12) NOT NULL,
    entity_id BIGINT NOT NULL,
    cycle_key VARCHAR(40) NOT NULL,
    approver_user_id BIGINT NOT NULL REFERENCES users(id),
    decision VARCHAR(10) NOT NULL,
    comment VARCHAR(1000),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_approvals_entity_type CHECK (entity_type IN ('CAMPAIGN', 'EMERGENCY')),
    CONSTRAINT chk_approvals_decision CHECK (decision IN ('APPROUVE', 'REFUSE')),
    CONSTRAINT uq_approvals_approver UNIQUE (entity_type, entity_id, cycle_key, approver_user_id)
);
CREATE INDEX idx_approvals_entity ON approvals (entity_type, entity_id, cycle_key);

CREATE TABLE support_presence (
    support_id BIGINT PRIMARY KEY REFERENCES diffusion_supports(id) ON DELETE CASCADE,
    state VARCHAR(10) NOT NULL,
    last_heartbeat_at TIMESTAMPTZ NOT NULL,
    state_changed_at TIMESTAMPTZ NOT NULL,
    last_ip VARCHAR(64),
    player_version VARCHAR(40),
    current_diffusion_log_id BIGINT REFERENCES diffusion_logs(id) ON DELETE SET NULL,
    CONSTRAINT chk_support_presence_state CHECK (state IN ('EN_LIGNE', 'HORS_LIGNE'))
);

CREATE TABLE supervision_alerts (
    id BIGSERIAL PRIMARY KEY,
    alert_type VARCHAR(30) NOT NULL,
    severity VARCHAR(15) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    support_id BIGINT REFERENCES diffusion_supports(id) ON DELETE CASCADE,
    zone_id BIGINT REFERENCES zones(id) ON DELETE CASCADE,
    emergency_id BIGINT REFERENCES emergency_messages(id) ON DELETE CASCADE,
    campaign_id BIGINT REFERENCES campaigns(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_supervision_alerts_type CHECK (alert_type IN ('SUPPORT_OFFLINE', 'ZONE_SATURATION', 'EMERGENCY_PENDING_APPROVAL', 'CAMPAIGN_PENDING_APPROVAL')),
    CONSTRAINT chk_supervision_alerts_severity CHECK (severity IN ('INFO', 'AVERTISSEMENT', 'CRITIQUE'))
);
CREATE INDEX idx_supervision_alerts_open ON supervision_alerts (alert_type, resolved_at);
CREATE INDEX idx_supervision_alerts_created ON supervision_alerts (created_at DESC);

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(40) NOT NULL,
    severity VARCHAR(15) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    link VARCHAR(300),
    entity_type VARCHAR(40),
    entity_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    emailed_at TIMESTAMPTZ,
    CONSTRAINT chk_notifications_type CHECK (notification_type IN ('EMERGENCY_APPROVAL_REQUIRED', 'EMERGENCY_BROADCAST', 'EMERGENCY_REFUSED',
        'CAMPAIGN_APPROVAL_REQUIRED', 'SUPPORT_OFFLINE', 'ZONE_SATURATION')),
    CONSTRAINT chk_notifications_severity CHECK (severity IN ('INFO', 'AVERTISSEMENT', 'CRITIQUE'))
);
CREATE INDEX idx_notifications_recipient ON notifications (recipient_user_id, read_at, created_at DESC);
```

`EmergencyStopReason` gains `REFUSE`.

### 5.8 Frontend (L4)

- `src/lib/api/types-supervision.ts` / `endpoints-supervision.ts`:
  - `supervisionApi.{ snapshot, alerts, acknowledge }`
  - `approvalsApi.{ pending, campaign(id), validateCampaign(id, body) → { kind: "validated"; campaign } | { kind: "pending"; approval }` (distinguished by `"pending" in body`), `approveEmergency, refuseEmergency }`
  - `notificationsApi.{ list, unreadCount, markRead, markAllRead }`
  - `exportsApi.{ pdf(query), xlsx(query) }` (through `downloadAndSave`)
- `/admin/supervision` (`src/components/supervision/**`):
  - Live map: an own MapLibre component `supervision-map.tsx` using `buildMapStyle` from `@/lib/network/map-style` (import only). Markers coloured « En ligne » (success), « Hors ligne » (danger), « Inconnu » (muted), with a pulse on each new diffusion.
  - Side feed « Diffusions en direct » (the last 50, `aria-live="polite"`, pause button « Suspendre le défilement »).
  - Panels « Alertes » (acknowledge), « Urgences » (state + approvals) and KPI chips.
  - Connection indicator « Temps réel · connecté / reconnexion / actualisation périodique ».
  - Table « Porteurs » as the non-visual equivalent (filters by presence).
  - `?porteur=` focuses a support.
- `/admin/approbations`:
  - Two lists (campaigns, emergencies), each with reasons (« Dérogation IA », « Risque 62 ≥ 50 »), approvals so far (« 1/2 · Amina B., 14:02 »), and actions « Approuver » (opens the existing review dialog for campaigns; confirmation for emergencies) and « Refuser » (reason).
  - Read-only for SUPERVISEUR. Empty state « Aucune approbation en attente ».
- `campaign-review-dialog.tsx`:
  - Shows `CampaignApprovalStatus` (« Double validation requise », approvers).
  - Validation goes through `approvalsApi.validateCampaign`. A 202 shows the toast « Approbation enregistrée : un second administrateur doit valider ».
  - `APPROVAL_ALREADY_GIVEN` is shown inline.
- `emergency-view.tsx`: badges « En attente d'approbation (1/2) », « Refusé », list of approvers, actions « Approuver » / « Refuser ». `EmergencyState` labels for the new states.
- Notification centre:
  - `src/components/notifications/notification-bell.tsx` in the admin topbar (`app-shell.tsx`), for staff. Unread badge (`aria-label` « 3 notifications non lues »), popover with the last 10, « Tout marquer comme lu », link « Voir toutes ».
  - Live through `/api/realtime/notifications`, with a 60 s polling fallback of `unread-count`.
  - CRITIQUE notifications also raise a toast.
  - Page `/admin/notifications`: paginated list, unread filter.
- Exports: `src/components/exports/export-menu.tsx` (« Exporter » → CSV / Excel / PDF). It replaces `CsvExportButton` in `admin/statistics-view.tsx`, `admin/overview-view.tsx`, `espace/statistics-view.tsx` and `campaign/campaign-stats-card.tsx` (all L4-owned). `CsvExportButton` stays exported for compatibility.
- `overview-view.tsx`: card « À approuver » (count + link) for ADMINISTRATEUR/SUPERVISEUR and card « Écrans hors ligne » (from the snapshot).
- Player: `use-heartbeat.ts` + one hunk in `player-screen.tsx` (§9.3).

### 5.9 Navigation, badges, shortcuts (L4 adds all of them)

`src/content/nav.ts`:
- `AppNavIcon` gains `"supervision"`, `"approvals"`, `"heatmap"`, `"aiQuality"`, `"notifications"`, `"account"`.
- `NavBadgeKey` gains `"approvals"`, `"alerts"`.
- `ADMIN_NAV`, final order:

| Label | href | Icon (lucide) | Group | Roles | Badge |
|---|---|---|---|---|---|
| Vue d'ensemble | `/admin` | overview | Opérer | all | |
| **Supervision** | `/admin/supervision` | supervision (`Activity`) | Opérer | all | alerts |
| Modération | `/admin/moderation` | moderation | Opérer | admin+sup | moderation |
| **Approbations** | `/admin/approbations` | approvals (`CheckCheck`) | Opérer | admin+sup | approvals |
| Réservations | `/admin/reservations` | reservations | Opérer | admin+sup | conflicts |
| Réseau | `/admin/reseau` | network | Réseau | all | coherence |
| Messages prioritaires | `/admin/urgences` | emergency | Réseau | all | emergencies |
| Statistiques | `/admin/statistiques` | stats | Analyser | all | |
| **Carte de chaleur** | `/admin/carte-chaleur` | heatmap (`Flame`) | Analyser | all | |
| Journal | `/admin/journal` | journal | Analyser | all | |
| **Qualité IA** | `/admin/ia-qualite` | aiQuality (`Gauge`) | Analyser | admin+sup | |
| Utilisateurs | `/admin/utilisateurs` | users | Administrer | admin+sup | |
| Règles IA | `/admin/regles-ia` | rules | Administrer | admin+sup | |

- New `ADMIN_ACCOUNT_NAV = [{ label: "Mon compte", href: "/admin/compte", icon: "account" }, { label: "Notifications", href: "/admin/notifications", icon: "notifications" }]`, shown in the staff account menu (`menus.tsx`).
- Shortcuts (`src/lib/shortcuts.ts`): `g o` Supervision, `g b` Approbations, `g c` Carte de chaleur, `g q` Qualité IA, `g n` Notifications. Command palette entries match. Tab bar unchanged.

---

## 6. Profiles summary

| Concern | default (`application.yml`) | `local` (start-local) | `docker` | `test` |
|---|---|---|---|---|
| JWT secret | required, fail fast | generated in `.tpub-local.secrets` | `.env` `JWT_SECRET` (required) | fixed test value in `application-test.yml` |
| Media signing / TOTP keys | derived from JWT when empty | generated | `.env` recommended | fixed test values |
| Simulated player time | off | **on** | off | on |
| Bootstrap admin must change password | true | false (password generated and printed by start-local) | true | n/a |
| OCR | auto (Tess4J if tessdata, else simulated) | auto, `TPUB_OCR_TESSDATA=BackEnd\tessdata` | tess4j (tessdata baked in the image) | simulated |
| AI provider | local | local unless `TPUB_AI_PROVIDER` is set before launch | from `.env` | local |
| 2FA required roles | none | none | recommended `ADMINISTRATEUR,SUPERVISEUR,OPERATEUR` | none |
| Emergency / campaign approvals | 2 / 2 (capped by active admins) | 2 / 2 | 2 / 2 | 2 / 2 (tests set explicitly) |
| Dynamic pricing | on | on | on | on |
| Mail | off (no SMTP) | off | on when `SPRING_MAIL_HOST` + `TPUB_MAIL_FROM` | off |
| Schedulers | on | on | on | off |

## 7. Migrations summary

| Version | Lane | Tables touched | Depends on |
|---|---|---|---|
| V6 | L1 | `ai_content_checks` (+2 columns, engine CHECK), new `ai_calibrations` (+ seed v1), `ai_feedback` | V3 |
| V7 | L2 | `users` (+7 columns), `login_history` CHECK, new `user_recovery_codes`, `login_challenges`, `support_device_keys` | V5 |
| V8 | L3 | `campaign_zones` (+3 columns), `emergency_messages.target_polygon`, `reservations` (+3 columns) | V3, V4 |
| V9 | L4 | `emergency_messages` (+3 columns, stop_reason CHECK), new `approvals`, `support_presence`, `supervision_alerts`, `notifications` | V4, V5 |

No migration depends on another round-2 migration, so V6–V9 apply in order after any merge order. V8 and V9 touch different columns and constraints of `emergency_messages`. Rules from R1 §3 still apply: PostgreSQL 16-compatible SQL, partial indexes only in SQL, JSON columns as `@JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb")`, CHECK values identical to the Java enums.

---

## 8. Cross-lane integration checklist (verified at merge time)

1. After L2 + L4: the heartbeat without a key → 401 `DEVICE_KEY_REQUIRED`; with the key → 200 and `presence` EN_LIGNE on the supervision stream.
2. After L2 + L1: `AiMediaAnalysisV2.thumbnailUrl` and gallery URLs carry `exp`/`sig`; they load through `/uploads` and stop working after `exp`.
3. After L2 + L4: the PDF of a campaign with an image embeds the visual (read from disk, not from a URL).
4. After L3 + L4: an emergency with a polygon that is still pending approval is not diffused; once approved, only supports inside the polygon receive it.
5. After L1 + L4: a campaign validated after two approvals yields exactly **one** `ai_feedback` row.
6. After L3 + L2: diffusion logs store unsigned media URLs, and consumption uses `unitCost × priceMultiplier`.
7. Both SSE streams deliver events through `next start` with no buffering: an event is visible in the browser less than 2 s after `/diffusion/next`.

---

## 9. File ownership

### 9.1 Backend (paths under `BackEnd/src/main/java/com/example/tpubpfe/` unless absolute; tests belong to the owner of the class under test)

**L1 `ia-ocr`**
- `service/ai/**` (incl. new `ocr/`, `media/`, `provider/`, `learning/` subpackages; delete `TesseractOcrService`)
- `service/AiVerificationService`, `AiDashboardService`, `AiDecisionQueryService`, `AiRuleService`
- controllers `AiController`, `AiRuleController`, new `AiQualityController`
- dto `AiReportResponse`, `AiIssuesResponse`, `AiDashboardResponse`, `AiRule*`, `AiDecisionLogResponse`, new `AiMediaAnalysisResponse`, `AiQualityResponse`, `AiFeedbackResponse`, `AiCalibrationResponse`, `AiProvidersResponse`
- models `AiContentCheck`, `AiDecisionLog`, `AiModerationRule`, `AiMediaAnalysis`, `AiIssue`, `AiIssueSource`, `AiMatchedRule`, `AiEngine`, `OcrEngine`, `AiCheckStatus`, `AiContentType`, `AiAdminDecision`, `AiDecisionType`, `AiModerationSeverity`, `AiRuleType`, `AiSector`; new `AiCalibration`, `AiFeedback`, `AiFeedbackOutcome`, `AiProviderType`
- repositories of those entities (+ new)
- `scheduler/AiRecalibrationScheduler`, `AiFeedbackSyncScheduler`
- `config/AiAnalysisProperties`, `AiAnalysisConfig`
- `db/migration/V6__ai_ocr_learning.sql`
- `BackEnd/Dockerfile`, `BackEnd/.gitignore`, `BackEnd/scripts/fetch-tessdata.{ps1,sh}`, `BackEnd/scripts/tessdata.sha256`
- tests `service/ai/**`, `service/AiVerificationServiceTest` (new)

**L2 `securite`**
- `security/**` (except `DeviceRequest`, §1.1), `exception/**`
- `config/TpubProperties`, `DataInitializer`, `GlobalExceptionHandler`, `AppConfig`, `CorsConfig`, `MediaWebConfig`, `OpenApiConfig`, new `SecretsValidator`, `DeviceWebMvcConfig`
- `service/storage/**` (`FileStorageService`, new `MediaUrlSigner`), `MediaService`, `AuthService`, `MeService`, `SessionService`, `LoginHistoryService`, `AdminUserService`, `AccountErrors`, `SecurityUtils`, `AuditService`, `InteractionService`, `DiffusionLogQueryService`, new `TwoFactorService`, `DeviceKeyService`, `LoginChallengeService`
- controllers `AuthController`, `MeController`, `AdminUserController`, `AuditController`, `DiffusionController`, `MediaController`, new `DeviceKeyController`, `TwoFactorController`
- dto `AuthResponse`, `LoginRequest`, `RegisterRequest`, `Me*`, `PasswordChangeRequest`, `Session*`, `LoginHistoryResponse`, `AdminUser*`, `ClientValidationRequest`, `AuditLogResponse`, `RoleResponse`, `RevokedCountResponse`, `MessageResponse`, `MediaFileResponse`, `DiffusionResponse`, `DiffusionLogResponse`, `InteractionRequest`, new 2FA / device DTOs
- models `User`, `Client`, `ClientValidationStatus`, `Role`, `RoleCode`, `UserSession`, `SessionRevokeReason`, `LoginHistory`, `LoginFailureReason`, `AuditLog`, `MediaFile`, `MediaFileType`, `DiffusionInteraction`, `InteractionType`, `DiffusionLog`; new `RecoveryCode`, `LoginChallenge`, `SupportDeviceKey`
- their repositories
- `scheduler/LoginChallengeCleanupScheduler`
- `src/main/resources/application.yml`, `src/test/resources/application-test.yml`
- `db/migration/V7__security_2fa_devices.sql`
- tests `security/**` (incl. `RoleMatrixWebTest`, `AccountsSecurityWebTest`), `exception/ApiErrorBodyTest`, `MediaServiceTest`, `MeServiceTest`, `SessionServiceTest`, `AdminUserServiceTest`
- repo root: `.env.example`, `.gitignore`, `docker-compose.yml`, `start-local.ps1`

**L3 `carte-prix`**
- `service/DiffusionService`, `EstimationService`, `ReservationService`, `AvailabilityService`, `AvailabilityRules`, `CampaignZoneService`, `CampaignMapper`, `ZoneRecommendationService`, `ZoneService`, `SupportService`, `SupportBlockService`, `TimeWindow`, `NetworkErrors`, `CampaignReservationSync`, new `pricing/**`, `HeatmapService`, `EmergencyTargeting`
- `util/**` (`GeoUtils` + new `PolygonGeometry`, `TargetingGeometry`)
- controllers `EstimateController`, `AvailabilityController`, `ReservationController`, `ZoneController`, `SupportController`, `CampaignController`, new `HeatmapController`, `PricingController`
- dto `Estimate*`, `CampaignEstimateResponse`, `Availability*`, `Reservation*`, `CampaignZone*`, `CampaignResponse`, `CampaignRequest`, `Zone*`, `Support*`, `EmergencyRequest`, new heatmap/pricing DTOs
- models `CampaignZone`, `Reservation`, `ReservationStatus`, `AvailabilityStatus`, `DiffusionSupport`, `Zone`, `SupportAvailability`, `SupportType`, `TechnicalStatus`, `PorteurType`, `Campaign`, `CampaignStatus`, `CampaignAiStatus`, `CampaignAdminStatus`, `TerminationReason`
- their repositories, plus `DiffusionLogRepository`
- `config/GeoPricingProperties`, `GeoPricingConfig`
- `db/migration/V8__polygons_pricing.sql`
- tests `DiffusionServiceTest`, `EstimationServiceTest`, `ReservationServiceTest`, `CampaignZoneServiceTest`, `AvailabilityRulesTest`, `NetworkDiffusionIntegrationTest`, `SupportServiceTest`, `GeoUtilsTest`, `CampaignServiceTest`, `CampaignLifecycle*Test`, `CampaignAccessGuardTest`, `LaneBWebLayerTest`

**L4 `supervision`**
- `service/AdminCampaignService`, `EmergencyService`, `StatisticsService`, `CsvExportService`, `CampaignService`, `CampaignLifecycle`, `CampaignDuplicationService`, `CampaignSearchSpecifications`, `CampaignAccessGuard`, `CampaignErrors`
- new `service/realtime/**`, `approval/**`, `notification/**`, `export/**`, `supervision/**`
- controllers `AdminCampaignController`, `EmergencyController`, `StatisticsController`, new `RealtimeController`, `SupervisionController`, `ApprovalController`, `NotificationController`, `HeartbeatController`
- dto `AdminValidateRequest`, `AdminRejectRequest`, `PriorityRequest`, `DuplicateRequest`, `EmergencyResponse`, `DashboardResponse`, `Statistics*`, new supervision/approval/notification DTOs
- models `EmergencyMessage`, `EmergencyStopReason`, `UrgencyLevel`, `Statistic`, `PaymentSimulation`, `PaymentStatus`; new `Approval`, `SupportPresence`, `SupervisionAlert`, `Notification` + enums
- their repositories
- `scheduler/**` except those listed for L1/L2 (`CampaignLifecycleScheduler`, `EmergencyAutoStopScheduler`, `ReservationExpiryScheduler`, `StatisticsSnapshotScheduler`, new `PresenceScheduler`, `SaturationScheduler`, `NotificationPurgeScheduler`), `config/SchedulingConfig`, `ClockConfig`, `ValidationMessages`
- `config/SupervisionProperties`, `SupervisionConfig`
- `db/migration/V9__supervision_approvals_notifications.sql`
- tests `AdminCampaignServiceTest`, `EmergencyServiceTest`, `CsvExportServiceTest`, `scheduler/**` (`CampaignLifecycleSchedulerTest`, `LaneBSchedulersTest`, and the new scheduler tests)
- `BackEnd/pom.xml`: shared, see §9.3 (owner L1)

### 9.2 Frontend (paths under `FrontEnd/`)

**L1:**
- `src/components/ai/**`, `src/components/campaign/ai-analysis.tsx`
- `src/components/admin/ai-rules-view.tsx`, `ai-rules-model.ts`, new `ai-quality-view.tsx`, `ai-quality-model.ts`
- `src/app/admin/ia-qualite/**`, `src/app/admin/regles-ia/**`
- `src/lib/api/types-ia.ts`, `endpoints-ia.ts`
- matching `__tests__`

**L2:**
- `src/lib/api/{types,endpoints,client,errors,messages,index}.ts`, `src/lib/backend.ts`, `session*.ts`, `resource-cache.ts`, `use-resource.ts`, new `media-url.ts`, `src/lib/player/device-key.ts`
- `src/middleware.ts`
- `src/app/api/[...path]/**`, `src/app/api/session/**`, `src/app/uploads/**`
- `src/app/(auth)/**`, `src/app/ecran/**`, `src/app/admin/compte/**`, `src/app/admin/utilisateurs/**`, `src/app/espace/profil/**`, `src/app/admin/reseau/**`
- `src/components/auth/**`, new `src/components/account/**`, `src/components/espace/profile-view.tsx`, `profile-model.ts`
- `src/components/admin/users-view.tsx`, `users-model.ts`, `network-admin-view.tsx`, new `device-pairing-dialog.tsx`
- `src/components/player/**` except the new `use-heartbeat.ts`
- `src/components/campaign/media-gallery.tsx`, `screen-mockup.tsx`, `media-model.ts`
- `src/components/network/creative-preview-import.tsx`, `src/components/porteur3d/creative-texture.ts`
- `e2e/**`
- `package.json`, `package-lock.json`, `next.config.ts`
- `FrontEnd/README.md`, `FrontEnd/.gitignore`
- `scripts/**` (seed and scenario; see §10 for L4 hunks)

**L3:**
- `src/components/map/**`, `src/lib/network/**`, `src/lib/geo.ts`, new `src/lib/polygon.ts`
- `src/components/campaign/step-zones.tsx`, `zone-model.ts`, `campaign-zones-map.tsx`, `estimate-invoice.tsx`, `step-review.tsx`, `campaign-wizard.tsx`, `wizard-chrome.tsx`, `step-details.tsx`, `step-content.tsx`, `use-submit-flow.ts`
- `src/components/network/**` except `creative-preview-import.tsx`
- `src/components/admin/emergency-form-dialog.tsx`, `emergency-schema.ts`, `zone-map-picker.tsx`, `zone-form-dialog.tsx`, `network-admin-map.tsx`, `network-map-model.ts`, new `heatmap-view.tsx`, `heatmap-model.ts`
- `src/app/admin/carte-chaleur/**`, `src/app/espace/campagnes/nouvelle/**`
- `src/lib/api/types-carte.ts`, `endpoints-carte.ts`

**L4:**
- `src/content/nav.ts`, `src/lib/shortcuts.ts`, `src/lib/routes.ts`, `src/components/shell/**`, new `src/lib/realtime/**`
- `src/components/supervision/**`, `notifications/**`, `approvals/**`, `exports/**`
- `src/components/admin/campaign-review-dialog.tsx`, `moderation-view.tsx`, `moderation-model.ts`, `emergency-view.tsx`, `overview-view.tsx`, `overview-model.ts`, `statistics-view.tsx`, `stats-model.ts`, `admin-controls.tsx`, `decision-dialogs.tsx`
- `src/components/espace/statistics-view.tsx`, `statistics-model.ts`, `csv-export-button.tsx`, `dashboard-view.tsx`
- `src/components/campaign/campaign-detail.tsx`, `campaign-stats-card.tsx`
- `src/components/player/use-heartbeat.ts`
- `src/app/admin/supervision/**`, `approbations/**`, `notifications/**`, `moderation/**`, `urgences/**`, `statistiques/**`, `src/app/admin/page.tsx`, `src/app/api/realtime/**`
- `src/lib/api/types-supervision.ts`, `endpoints-supervision.ts`

Unlisted existing files: anyone who must change one records a Deviation first. Files nobody changes stay untouched.

### 9.3 Shared files: the only permitted cross-lane hunks

| File (owner) | Lane | Exact hunk |
|---|---|---|
| `BackEnd/pom.xml` (L1) | L4 | Insert `spring-boot-starter-mail`, `com.github.librepdf:openpdf:2.0.3` and `org.apache.poi:poi-ooxml:5.4.1` (inline versions) **directly after the `flyway-database-postgresql` `</dependency>`**. L1 inserts its four dependencies directly after the `jjwt-jackson` `</dependency>`. No `<properties>` edits. |
| `security/SecurityConfig` (L2) | L4 | `.dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.FORWARD)` → `.dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.FORWARD, DispatcherType.ASYNC)`. (L2 adds `"/api/diffusion/heartbeat"` itself.) |
| `config/GlobalExceptionHandler` (L2) | L4 | One new method at the end of the class: `@ExceptionHandler({AsyncRequestTimeoutException.class, AsyncRequestNotUsableException.class}) public void asyncDone() { }` (no body written) |
| `src/main/resources/application.yml` (L2) | L1 | Nothing (L1 uses env-backed defaults in `AiAnalysisProperties`). |
| same | L3, L4 | Nothing (Java defaults). |
| `src/test/resources/application-test.yml` (L2) | L1 | Directly before the line `  # Lane B: keep test uploads out of the source tree`, insert these lines (two-space indent, children of `tpub:`): `  analysis:` / `    ocr:` / `      mode: simulated` / `    provider:` / `      type: local` |
| `service/DiffusionService` (L3) | L2 | In `diffuseAd`: keep `mediaUrl` (signed) for the response; pass `media != null ? storage.canonicalUrl(media.getFilePath()) : null` to `saveLog` instead of `mediaUrl`. `FileStorageService.canonicalUrl(String)` (L2) returns the unsigned `base/relativePath`. |
| same | L4 | (a) Add field `private final org.springframework.context.ApplicationEventPublisher eventPublisher;` as the **first** field (before `supportRepository`). (b) In `saveLog`, replace `return diffusionLogRepository.save(…);` with `DiffusionLog saved = diffusionLogRepository.save(…); eventPublisher.publishEvent(new DiffusionRecordedEvent(saved.getId(), support.getId())); return saved;`. L4 may also add the matching constructor argument (a mock publisher) wherever `DiffusionServiceTest` or `NetworkDiffusionIntegrationTest` build the service by hand. |
| `service/EmergencyService` (L4) | L3 | (a) In `create`: replace the two target checks and the zone resolution block with a call to `EmergencyTargeting.resolve(request, zoneService, zoneRepository)` (L3 class, returns zone + circle + polygon, throws the §4.4 errors). (b) In the builder: `.targetPolygon(target.polygon())` after `.radiusKm(...)`. (c) Body of `affectedSupports` → `TargetingGeometry.emergencyTargets(message, s)` inside the ACTIF filter. (d) `toResponse`: `.targetPolygon(message.getTargetPolygon())` after `.radiusKm(...)`. |
| `model/EmergencyMessage` (L4) | L3 | Field `@JdbcTypeCode(SqlTypes.JSON) @Column(name = "target_polygon", columnDefinition = "jsonb") private Map<String, Object> targetPolygon;` **directly after `radiusKm`**. L4's own fields go directly after `stopReason`. |
| `dto/EmergencyResponse` (L4) | L3 | `private Map<String, Object> targetPolygon;` directly after `radiusKm`. L4's fields go after `createdAt`. |
| `service/DiffusionService` `targets` (L3) | none | L3 itself delegates to `TargetingGeometry`. |
| `repository/MediaFileRepository` (L2) | L1 | Use only (`save`, existing finders). |
| `src/components/admin/campaign-review-dialog.tsx` (L4) | L1 | One import `import { AiMediaInsights } from "@/components/ai/ai-media-insights";` after the `@/components/admin/moderation-model` import block, and, in the report section, `<AiReportBlock report={report.data} />` → `<><AiReportBlock report={report.data} /><AiMediaInsights report={report.data} /></>`. `AiReportBlock` (which already lists `mediaAnalyses`) is not edited. `AiMediaInsights` renders only the V2 additions: thumbnail, frames, metrics, colours, OCR and provider badges. |
| `src/components/player/player-screen.tsx` (L2) | L4 | One import `import { useHeartbeat } from "@/components/player/use-heartbeat";` after the `use-now` import, and one statement `useHeartbeat(supportId, state.diffusion?.diffusionLogId ?? null);` directly after the line `const { diffusion, error } = state;`. |
| `src/app/api/[...path]/route.ts` (L2) | none | L4 uses its own `realtime` route. |
| `start-local.ps1` (L2) | L1 | L2 writes the L1 lines itself (§10). |
| `.env.example` (L2) | L1, L3, L4 | L2 documents every env key of §2.1, §3.1, §4.1 and §5.1 (placeholders only). Other lanes do not edit it. |
| `FrontEnd/docs/api-contract.md` (L2) | L1 | New subsection `### 5.4b IA : qualité, calibration, moteurs` directly after §5.4. |
| same | L3 | `### 5.5b Polygones, cartes de chaleur, tarification dynamique` directly after §5.5. |
| same | L4 | `### 5.9b Supervision, approbations, notifications, exports` directly after §5.9. L2 edits §1.3, §5.1, §5.2, §5.7. |
| `docs/round2-contract.md` (all) | each | Only its own subsection of §11 "Deviations". |

---

## 10. Demo & docs impact

**`start-local.ps1` (L2):**
1. Creates `.tpub-local.secrets` (repo root, gitignored, `KEY=value` lines) on first run and reuses it afterwards: `JWT_SECRET` (64 hex from `RandomNumberGenerator`), `MEDIA_SIGNING_SECRET`, `TOTP_ENCRYPTION_KEY`, `TPUB_ADMIN_INITIAL_PASSWORD` (20-character generated).
2. Sets the backend environment from that file, plus `SPRING_PROFILES_ACTIVE=local` (simulated time on) and `TPUB_ADMIN_MUST_CHANGE_PASSWORD=false`.
3. Sets `TPUB_AI_PROVIDER` to `local` only when it is not already set, and `TPUB_OCR_TESSDATA=<repo>\BackEnd\tessdata`.
4. Prints « OCR simulé : lancez BackEnd\scripts\fetch-tessdata.ps1 pour activer Tesseract » when `fra.traineddata` is missing. It never downloads by itself.
5. The final message no longer prints a hard-coded password: « Admin : admin@tpub.local — mot de passe dans .tpub-local.secrets (TPUB_ADMIN_INITIAL_PASSWORD) si la base a été créée par ce script ; une base existante garde son mot de passe ».
6. Removes the committed JWT secret and `OPENAI_ENABLED` lines.
7. Existing local database: the admin created by the old `DataInitializer` keeps its old password (`must_change_password = false` from V7); docs recommend changing it.

**`FrontEnd/scripts/lib/tpub-api.mjs` + `seed-demo.mjs` (L2):**
- Admin credentials come from `TPUB_ADMIN_EMAIL` (default `admin@tpub.local`) and `TPUB_ADMIN_PASSWORD`, else `TPUB_ADMIN_INITIAL_PASSWORD` read from `../.tpub-local.secrets`. Nothing found → exit 1 with a French message. **No password literal remains in tracked scripts.**
- TOTP: if login returns `TOTP_REQUIRED`, the scripts compute the code from `TPUB_ADMIN_TOTP_SECRET` (new `scripts/lib/totp.mjs`, RFC 6238 with `node:crypto`), otherwise exit with instructions. `mustChangePassword: true` → exit with « Connectez-vous une première fois sur /connexion pour définir le mot de passe administrateur, puis relancez avec TPUB_ADMIN_PASSWORD ».
- Demo account passwords (annonceur, opérateur, superviseur, second admin): `TPUB_DEMO_PASSWORD` if set, else generated once into the gitignored `FrontEnd/scripts/.demo-accounts.json` and reused. Printed at the end.
- New account `admin2@tpub.local` (ADMINISTRATEUR), so the two-admin approval can be demonstrated.
- Device keys: for every ACTIF Porteur without an active key (`GET /supports/device-keys`), `POST /supports/{id}/device-key`. Keys are written to the gitignored `FrontEnd/scripts/.demo-device-keys.json` (`{ "<supportId>": "tpd_…" }`). Pairing URLs `http://localhost:3000/ecran/<id>?cle=…` are printed. `--rotate-keys` re-issues all keys.
- `FrontEnd/.gitignore` gains `scripts/.demo-accounts.json` and `scripts/.demo-device-keys.json`. The root `.gitignore` gains `.tpub-local.secrets`.

**`demo-scenario.mjs` (L2, with L4 content defined here):**
- The player steps (14–15, 18) send `X-TPUB-Device-Key` from `.demo-device-keys.json`. A missing key → the scenario pairs the support as admin first.
- `datetime` works only with the `local` profile. The scenario checks `simulatedTime` in the response and warns « le backend n'est pas en profil local : horloge serveur utilisée ».
- Step 13 (validation): on a 202 (double approval) the scenario logs in as `admin2@tpub.local` and validates again. The log shows « 1/2 approbations » then « validée par … et … ».
- Step 17 (emergency): created by admin, then approved by `admin2` (`POST /emergency/{id}/approve`) before the player poll shows the takeover.
- New optional step « Supervision »: sends a heartbeat and prints `GET /supervision/snapshot` counts.

**Docs:**
- `FrontEnd/README.md` « Démo avec le vrai backend » (L2): secrets file, tessdata script, pairing URLs, second admin, simulated time only in the local profile, 2FA and forced password change, and a security note stating that **the JWT secret previously committed in `.env.example` and `start-local.ps1` is in git history and must be treated as compromised**.
- `FrontEnd/docs/api-contract.md`: per §9.3 anchors.
- `.env.example` (L2): every new key with placeholders (`JWT_SECRET=<générez 64 caractères hexadécimaux>`, `OPENAI_API_KEY=`, `ANTHROPIC_API_KEY=`, `TPUB_AI_PROVIDER=local`, `SPRING_MAIL_HOST=`, …). No concrete secret. `docker-compose.yml` (L2) passes nothing new explicitly (it uses `env_file`), but gets a comment stating that `JWT_SECRET` is required.

---

## 11. Deviations

_Lanes append entries under their own heading as `YYYY-MM-DD · lane · what changed · why`._

### L1 `ia-ocr`

- 2026-09-17 · L1 · Work branch is `lane/ia-ocr` (not `r2/ia-ocr`) · the orchestration harness names lane branches `lane/*`.
- 2026-09-17 · L1 · `GET /api/ai/quality`: when only `to` is given, `from` defaults to `to − 89` (not `today − 89`); a reversed range also gives 400 `INVALID_RANGE`. `GET /api/ai/feedback` rejects a reversed range with the same code · keeps the default window valid for any `to` and gives one error code for every bad period.
- 2026-09-17 · L1 · `VisionModerationProvider` has an extra `String model()` (configured model) and `ProviderException` is a nested class · `GET /api/ai/providers` needs the model without calling the provider.
- 2026-09-17 · L1 · `OcrService` gains a default `extractImage(BufferedImage, Path, String)` next to `extract(Path, String)` · video frames and already decoded images are OCR'd without re-reading a file; the simulated OCR keeps using the file name.
- 2026-09-17 · L1 · `AiProvidersResponse.configured` is `true` for `LOCAL`; `video.webm` is always `false` · the local analysis needs no key; JCodec only reads MP4.
- 2026-09-17 · L1 · Worst-frame metrics of a video take width, height, aspect and dominant colours from the middle frame (sharpness/contrast min, brightness farthest from 127.5, text coverage max, as §2.3) · §2.3 does not say which frame supplies the non-"worst" fields.
- 2026-09-17 · L1 · `AiCalibrationService` creates version 1 (`INITIAL`, 31/70) when `ai_calibrations` is empty · H2 tests have no Flyway seed; on PostgreSQL V6 already inserts it, so nothing happens.
- 2026-09-17 · L1 · Dockerfile `tessdata` stage is `alpine:3.20` with `curl` + `coreutils` running `fetch-tessdata.sh /tessdata` · the script needs `sha256sum` and a downloader, absent from the Maven build image.
- 2026-09-17 · L1 · `/admin/ia-qualite` puts the KPI tiles, charts, « Précision par règle », « Calibration » and « Moteurs » under a « Synthèse » tab next to « Retours »; the period defaults to 90 days, and a custom period over 366 days is refused client-side before any call. The weekly chart is two `ColumnChart`s (decisions, errors) plus one data table with the four weekly figures · the existing chart primitives draw one series per chart.
- 2026-09-17 · L1 · `AiMediaInsights` takes an optional `className` (default `mt-6`); `AiReportBody` renders it after the scores/issues grid with no extra margin · the advertiser report lays its blocks out in a flex gap.

### L2 `securite`

- 2026-09-17 · L2 · No `qrcode` / `@types/qrcode` npm dependency: QR codes (TOTP enrolment, pairing URL) are drawn by the dependency-free encoder `FrontEnd/src/lib/qr-code.ts` (byte mode, error correction M, unit-tested in `src/lib/__tests__/qr-code.test.ts`) through `components/account/qr-code-svg.tsx` (`role="img"`, `aria-label`). `package.json` / `package-lock.json` are unchanged · lanes may not run `npm install`, and the owner decision allows a tiny dependency-free generator.
- 2026-09-17 · L2 · Challenge pages: besides the httpOnly `tpub_challenge` cookie (token, path `/api/session`), the Next routes set `tpub_challenge_actif=1` (httpOnly, path `/connexion`, same max-age, no token). The middleware checks this marker on `/connexion/verification` and `/connexion/activer-2fa` · a cookie scoped to `/api/session` is never sent with page requests, so the middleware could not see it. Both are cleared on success and on `CHALLENGE_EXPIRED`. The middleware redirect stays `/connexion?expire=1` (+ `next`). An expiry noticed by the screens themselves goes to `/connexion?verification=expiree`, which shows « La vérification en deux étapes a expiré » instead of the session-expired notice.
- 2026-09-17 · L2 · The challenge e-mail and `expiresAt` (never the token) are kept in `sessionStorage` (`components/auth/challenge-storage.ts`) for the countdown and the « Compte : … » line of the verification screens.
- 2026-09-17 · L2 · `config/SecretsValidator` also refuses an unedited `<…>` placeholder from `.env.example` for `JWT_SECRET`, `MEDIA_SIGNING_SECRET` and `TOTP_ENCRYPTION_KEY` (« … contient encore la valeur d'exemple de .env.example ») · the placeholders are longer than 32 bytes and publicly known, so they would otherwise pass the length check. In `.env.example`, `TPUB_ADMIN_INITIAL_PASSWORD` is empty (random password logged once) rather than a placeholder that would be a valid password.
- 2026-09-17 · L2 · `start-local.ps1` keeps the literal password of the portable **local** PostgreSQL cluster (`tpub_local_dev`, bound to localhost) · clusters already initialised with it would stop working. Every application secret (JWT, media signing, TOTP key, initial admin password) now comes from the gitignored `.tpub-local.secrets`.
- 2026-09-17 · L2 · Unlisted shared file `FrontEnd/src/lib/campaign-status.ts`: `LOGIN_FAILURE_LABEL.TOTP_INVALID`, `AUDIT_ACTION_LABEL` entries for `USER_PASSWORD_CHANGE_REQUIRED`, `USER_2FA_ENABLED|DISABLED|RESET`, `SUPPORT_DEVICE_KEY_ISSUED|ROTATED|REVOKED`, and `AUDIT_ENTITY_LABEL.SUPPORT_DEVICE` (additive lines at the end of each record) · these `Record<…>` maps must stay exhaustive once `types.ts` gains the round-2 values. Merge note: L1/L4 labels appended at the same anchors merge by keeping both sides.
- 2026-09-17 · L2 · New files not named in §9.1/§9.2 but inside L2 areas: `src/lib/use-signed-media.ts` (expired signed URL → refetch the owning resource once, shared by the media consumers and the profile logo), `components/account/{password-change-card,sessions-card,two-factor-card,account-view,code-input,totp-setup-panel,two-factor-model}`, `components/auth/{forced-password-change,totp-verification-form,totp-enrolment-flow,challenge-storage}`, `scripts/lib/demo-auth.mjs` (credentials, generated demo passwords, device keys of the scripts, next to `scripts/lib/totp.mjs`). `LoginHistoryCard` lives with `SessionsCard` in `components/account/sessions-card.tsx`; `profile-view.tsx` re-exports `PASSWORD_CHANGED_NOTICE` and `LOGIN_HISTORY_LIMIT`.
- 2026-09-17 · L2 · Player: a 429 is classified as the new `rate-limited` error kind and waits `max(backoff, Retry-After)` (capped at 60 s). When `localStorage` is unavailable the `?cle=` key still works for the current page view. The unpaired slide says whether a stored key was refused (« révoquée ou remplacée »). The overlay is hidden on the unpaired slide.
- 2026-09-17 · L2 · Users admin: « Réinitialiser la double authentification » and « Exiger un nouveau mot de passe » live in the account detail dialog (section « Sécurité du compte »), with the two badges in the list rows. Reset is disabled (with its reason) when 2FA is not active, and the password action when a change is already required.
- 2026-09-17 · L2 · `POST /api/me/2fa/disable` on an account without TOTP → 409 `TOTP_NOT_ENABLED` (case not specified; checked after the role rule).
- 2026-09-17 · L2 · Demo scenario: the optional « Supervision » step is reported as skipped when `POST /api/diffusion/heartbeat` answers 404 without `SUPPORT_NOT_FOUND` (backend without L4). The scenario also asserts that the signed media URL loads and that the unsigned path answers 403.
- 2026-09-17 · L2 · `e2e/fixtures`: the mocked login answers `{ status: "AUTHENTICATED", user }`, `GET /api/me/2fa` and `GET /api/supports/device-keys` are mocked, and `prepare()` stores a device key for Porteurs 1–50 so `/ecran/*` captures stay paired.

### L3 `carte-prix`

_None yet._

### L4 `supervision`

_None yet._

### Integration

_None yet._
