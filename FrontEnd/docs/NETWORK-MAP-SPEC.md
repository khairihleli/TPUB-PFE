# ZELQANE — Carte du réseau, Porteurs & Studio 3D (spec feature v2)

Single source of truth for the "map + Porteur + 3D configurator" feature. Read with `docs/SPEC.md` (stack, conventions, quality bar), `docs/api-contract.md`, `docs/zelqane-brief.md` (guardrails: no invented figures, « intention de conception » wording) and `docs/COMPONENTS.md` (existing design system — reuse it).

## 0. Goal
An advertiser opens **Réseau** in the client space and gets a full interactive map of Tunisia: zones (circles), **Porteur positions** (the backend "supports"), map tools, filters and search. They choose zones and Porteurs directly on the map. Clicking a Porteur opens the **Studio 3D**: a live 3D Porteur (type A/B/C/D) they can orbit, inspect (hotspots), preview their creative on its screen, day/night, camera viewpoints, and **configure the booking right there** (campaign, dates, day-part) → real reservation through the backend. The same map powers the campaign wizard step « Zones & écrans » (tab « Carte ») and ZELQANE staff tools in `/admin/reseau` (place/move Porteurs, draw zone radius, set type/height/orientation). The 3D scene is built so a real **GLB** supplied later drops in with no code change ("repère" calibration mode).

Libraries already installed (do NOT npm install anything else): `maplibre-gl@5`, `three@0.180` (+ `@types/three`). **No react-three-fiber** (React 19.3 peer conflict): use plain three.js inside a client component (`useEffect`, own render loop, dispose everything on unmount). Load both only client-side (`next/dynamic` with `ssr:false`) so marketing/first-load bundles are unaffected.

## 1. Backend additions (additive, backward compatible)
Flyway `BackEnd/src/main/resources/db/migration/V2__porteur_fields.sql` on table `diffusion_supports`:
- `porteur_type VARCHAR(1) NULL CHECK (porteur_type IN ('A','B','C','D'))`
- `mast_height_m SMALLINT NULL CHECK (mast_height_m IN (15,20,25,30))`
- `heading_deg SMALLINT NULL CHECK (heading_deg BETWEEN 0 AND 359)` — direction the main screen face points (0 = north, clockwise)
- `address VARCHAR(255) NULL`

DTOs (JSON names):
```ts
export type PorteurType = "A" | "B" | "C" | "D";
export type MastHeight = 15 | 20 | 25 | 30;
// SupportRequest gains (all optional; on update null = unchanged, like technicalStatus):
porteurType?: PorteurType | null; mastHeightM?: MastHeight | null; headingDeg?: number | null; address?: string | null;
// SupportResponse gains (nullable):
porteurType: PorteurType | null; mastHeightM: number | null; headingDeg: number | null; address: string | null;
```
New read-only endpoint (no campaign/client data exposed):
```
GET /api/supports/{id}/availability?from=YYYY-MM-DD&to=YYYY-MM-DD
roles: ANNONCEUR, ADMINISTRATEUR, SUPERVISEUR, OPERATEUR ; from/to optional (default today → today+90) ; 404 if support unknown
→ SupportAvailabilitySlot[] = { startDate: string; endDate: string; startTime: string; endTime: string; reservationStatus: "TEMPORAIRE" | "CONFIRMEE" }[]
   (reservations on that support with status TEMPORAIRE or CONFIRMEE overlapping [from, to], sorted by startDate)
```
Backend conflict rule unchanged (date-range overlap per support, times ignored) — the UI must reflect that: a day already covered by a TEMPORAIRE/CONFIRMEE reservation is **unavailable for the whole day** on that support.

## 2. Frontend domain layer — `src/lib/network/` (pure, unit-tested)
- `porteur.ts`: `PORTEUR_TYPES` (A Écran panoramique 360° — ronds-points & places ; B Double face — grands axes ; C Écran simple à hauteur des yeux — rues piétonnes ; D Infrastructure sans écran — non réservable), each with label, context, screen description, faces count (A: 1 wrap, B: 2, C: 1, D: 0), icon, tone. Copy in French, from brief §8.3 + corporate PORTEUR_TYPES (design-intention wording, mention « intention de conception »). `MAST_HEIGHTS` [15,20,25,30] with tier names (Compact, Urbain, Majeur, Phare) — no kW/kWh figures in the client UI. `resolvePorteurType(support)` → `{ type, inferred }`: declared `porteurType` wins; else infer ECRAN→A, PANNEAU_NUMERIQUE→C, POINT_WIFI→D, other→C with `inferred: true` (UI shows « typologie estimée »). `isBookable(support)` = technicalStatus ACTIF && type !== "D".
- `geo.ts`: haversine distance (m), `circlePolygon(center, radiusKm, steps)` GeoJSON, `pointInRadius`, `bboxOf(points)` with padding, `bearingLabel(deg)` (N, NE, E…), `formatDistance` (« 850 m », « 12,4 km »), Tunisia bounds constant `[[7.5, 30.2],[11.9, 37.6]]`.
- `selection.ts`: immutable selection model `{ zoneIds: number[]; supportIds: number[] }` + reducers (toggle zone selects/deselects its bookable supports, toggle support, select within radius, clear) + derived summary. 100% unit tested.
- `availability.ts`: expand slots to blocked ISO days, `isRangeFree(slots, start, end)`, first free window finder, `DAY_PARTS` presets: Matin 07:00–11:00, Midi 11:00–15:00, Après-midi 15:00–19:00, Soirée 19:00–23:00, Journée 08:00–22:00, Personnalisé.
- `geojson.ts`: build FeatureCollections for zones (circle polygons + centroid labels), supports (points with properties: id, name, type, inferred, status, bookable, zoneName, heading, height, selected), heading cones (small wedge polygon from heading for A/B/C), 3D extrusion footprints (tiny square polygons, height ∝ mast height ×10 for visual scale in 3D map view).
- Extend `src/lib/api/types.ts` + `endpoints.ts` with the §1 fields and `supportsApi.availability(id, {from,to})`.

## 3. Map — `src/components/map/` (client)
`network-map.tsx` (dynamic-imported wrapper exported as `NetworkMap`), props:
```ts
{ zones: ZoneResponse[]; supports: SupportResponse[];
  mode: "explore" | "select" | "admin";
  selection?: Selection; onSelectionChange?(s: Selection): void;
  focusSupportId?: number | null; onOpenPorteur?(supportId: number): void;
  onPlacePoint?(lngLat: {lng:number; lat:number}): void;   // admin: click-to-place
  onMoveSupport?(id: number, lngLat): void;                 // admin: drag marker
  onZoneRadiusChange?(zoneId: number, radiusKm: number): void; // admin: drag handle
  height?: string; className?: string }
```
- MapLibre with an **inline style object** (never a remote style.json, so the map still renders its own layers when tiles are unreachable): background `var(--color-bg)` equivalent hex from tokens file, raster basemaps switchable: **Sombre** (CARTO `https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png`), **Clair** (CARTO `light_all`), **Satellite** (Esri World Imagery `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` + CARTO `dark_only_labels` overlay). Correct attributions (© OpenStreetMap contributors, © CARTO, © Esri) in the attribution control. Initial view fits the bounding box of **all Porteurs** (+ the circles of their zones) with padding clear of the floating tools; Tunisia bounds only when there is no Porteur.
- Layers: zone fill (orange-soft) + dashed outline + labels; selected zones highlighted; supports as circles with type letter glyph (symbol layer using text, no external sprite/glyph server: render the letter with an HTML marker OR use `text-font` only if glyphs are available — prefer **HTML markers** for Porteurs (crisp, accessible, focusable `button` with aria-label « Porteur Type A — Écran LED Avenue Habib Bourguiba — Actif »). **Every Porteur is drawn individually at its exact position** (marker centre anchored on its lat/lng, no CSS translate): below zoom 9 a compact 16 px dot (type colour + status ring, letter hidden, same name, focus and mini card), the lettered marker from zoom 9. Markers that would overlap on screen (distance < marker size) are **fanned out** (`src/lib/network/spiderfy.ts`: circle up to 8, spiral beyond, deterministic, no overlap after layout) around a small dot at the exact position with thin leader lines, recomputed on zoom/rotate/pitch/move, instant with reduced motion; a fanned marker behaves like any marker (dragging needs a zoom where it is not fanned). Grouping into count bubbles (grid clustering in `geojson.ts`, no dependency) is **opt-in** only: « Regrouper les Porteurs proches » in the Couches tool (`?regrouper=1` in the explorer). Status ring colour: ACTIF success, MAINTENANCE warning, INACTIF/HORS_LIGNE muted/danger. Selected = blue-text ring + check. Heading cones layer. Pulse for focus.
- **Map tools** (floating glass toolbar, keyboard accessible, tooltips, French labels): zoom in/out, recentrer (« tous les Porteurs » par défaut, « toute la Tunisie »), ma position (geolocation, graceful denial), plein écran, fond de carte (Sombre/Clair/Satellite), couches (zones, Porteurs, orientations, étiquettes, « Regrouper les Porteurs proches » désactivé par défaut), vue 2D/3D (pitch 60° + fill-extrusion columns sized by mast height), **mesurer** (click points → polyline + total distance, Esc to finish), **zone de chalandise** (click centre + drag/slider radius → circle, list + « Sélectionner les Porteurs réservables dans ce rayon »), recherche (zones + Porteurs by name/address, keyboard list, fly-to), filtres (type A–D, statut, réservable seulement — par défaut rien n'est masqué), légende, compteur « 8 Porteurs affichés sur 8 » et, quand un filtre masque des Porteurs, « n masqués par les filtres » + « Tout afficher ». Mobile: toolbar collapses into a menu button, bottom sheet for lists.
- Hover/focus Porteur → mini card (name, type, zone, status, hauteur, orientation, latitude/longitude with « Copier les coordonnées » and « Ouvrir dans OpenStreetMap » in a new tab). Porteur list rows show the address (or zone) and « 36.79980, 10.18170 »; the studio « Identité » and the admin inspector show the same exact position and actions. Click → `onOpenPorteur(id)` in explore/select modes; in select mode a secondary « + Ajouter à la sélection » action in the card.
- **Fallback**: if WebGL is unavailable or MapLibre throws, render the existing SVG `src/components/espace/tunisia-map.tsx` projection with the same Porteurs/zones and selection behaviour (reduced tool set; every Porteur at its projected exact point, same spiderfy in SVG space, « Vue rapprochée — Grand Tunis » inset when Porteurs pile up, as on the original network map) + notice « Carte simplifiée (WebGL indisponible) ». Always pair the map with an accessible list (the list is the non-visual equivalent).
- Reduced motion: no flyTo animation (jumpTo), no pulses.
- Map CSS: import `maplibre-gl/dist/maplibre-gl.css` once in the map module; override controls/popups to match tokens in a scoped way.

## 4. Studio 3D — `src/components/porteur3d/` (client, plain three.js)
`porteur-studio.tsx` exported via dynamic import as `PorteurStudio`, props `{ support: SupportResponse; type: PorteurType; creative?: { url: string; kind: "image" | "video" } | null; face?: "all" | 1 | 2; timeOfDay: "jour" | "nuit"; view: CameraPresetId; repere?: boolean; onHotspot?(id: HotspotId): void; onReady?(): void; className?: string }`.
- Scene: ground disc with subtle Tunisian urban context (paved roundabout ring for A, road lanes for B, sidewalk strip for C, open ground for D) built procedurally, soft shadows, fog, sky gradient; **day** (warm sun, blue sky) / **night** (dark navy, screen emissive glow, street-light points). ACES tone mapping, sRGB output, pixel ratio capped at 2, render on demand (only while interacting/animating) to save battery/memory.
- **Procedural Porteur** per type, dimensions in metres at scale (`mastHeightM`, default 20): fluted aluminium mast (Lathe/cylinder with vertical grooves), cylindrical base plinth, collar, **screen** (A: cylindrical 360° band; B: two back-to-back vertical panels; C: one vertical panel at eye level ~2.2–4 m; D: none + sensor box), inclined solar panel on two triangular arms, rotating copper/black **energy sphere** on top (auto-rotate unless reduced motion). Materials: brushed metal, dark glass, emissive screen. Orient main face to `headingDeg` (scene north = −Z).
- **Screen content**: the `creative` (image → `TextureLoader`, video → `VideoTexture`, muted loop) mapped on screen meshes; default = animated ZELQANE gradient canvas texture with « VOTRE MESSAGE ICI » + « Aperçu » label (CanvasTexture). `face` highlights/limits preview on B. Correct aspect: A band UV wraps, B/C panels portrait 9:16.
- **Cameras** (`scene-config.ts` presets, smooth tween, OrbitControls with damping, limits: no under-ground, min/max distance): `orbite` (3/4 view), `pieton` (1.7 m eye height, 25 m away, looking at screen), `conducteur` (1.2 m, 60 m, slight offset), `drone` (high oblique), `face` (frontal on screen). Buttons + keyboard (1–5), « Réinitialiser la vue ».
- **Hotspots** (`scene-config.ts`): écran, panneau solaire, sphère énergie, mât, base, capteurs — 3D anchor points projected to DOM buttons each frame (accessible buttons, not canvas-only), clicking shows a card with design-intention copy (from corporate PORTEUR data, French, no kW/kWh figures) and focuses camera.
- **GLB drop-in** (`porteur-model.ts`): try, in order, `/models/porteur-type-{a|b|c|d}.glb`, `/models/porteur.glb` (HEAD fetch first; 404 → procedural). Use `GLTFLoader` + `DRACOLoader` (copy decoder files from `node_modules/three/examples/jsm/libs/draco/gltf/` to `public/draco/`) + `MeshoptDecoder`. Normalise: compute bbox, scale so height = `mastHeightM` if `scene-config.glb.autoScale`, recentre base at origin. Naming convention to find parts: meshes/nodes whose name matches `/^Screen/i` receive the creative texture (per face: `Screen_Face_1`, `Screen_Face_2`, `Screen_360`), `/Energy_Sphere/i` rotates, `/^Hotspot_(\w+)/` empties override hotspot anchors. Document everything in **`docs/PORTEUR-3D.md`** (glTF 2.0 binary, Y-up, metres, origin at base centre, main face towards −Z, material `M_Screen` with 0–1 UVs covering the full display, poly/texture budgets: ≤ 150k triangles, ≤ 4 × 2K textures, Draco or Meshopt compression, file names, how to test with `?repere=1`).
- **Repère mode** (`repere` prop, enabled by `?repere=1` on the page): axes helper with X/Y/Z labels, 1 m grid + 5 m major lines, model bounding box with W×H×D readout, hotspot anchor spheres with coordinates, live camera position/target readout and a « Copier la vue » button that copies a ready-to-paste preset JSON for `scene-config.ts`, model source readout (procédural / chemin GLB), triangle count.
- Fallback when WebGL unavailable: the static type render `public/porteur/porteur-type-{a..d}.png` with the creative shown in a CSS screen mockup (reuse `src/components/campaign/screen-mockup.tsx` idea) + notice.
- Dispose geometries/materials/textures/renderer and cancel RAF on unmount; pause when tab hidden or canvas off-screen.

## 5. Explorer page — `/espace/reseau`
Full-height layout inside AppShell: header strip (title « Réseau », counts, « Aide » popover explaining the tools), main **map** (left/centre) and a **side panel** (right, collapsible; bottom sheet on mobile) with tabs: **Porteurs** (virtualised-simple filtered list synced with map: hover highlights marker, click opens studio), **Zones** (list with Porteur counts, click selects/fits), **Sélection** (current selection, per-Porteur type/status/bookable, remove, « Réserver la sélection »).
**Studio sheet**: `?porteur=<id>` opens a large right drawer / full-screen dialog on mobile with two columns: 3D studio (top/left) and **configurateur** (right):
1. Identité: name, zone, type (+ « typologie estimée » badge if inferred), hauteur de mât tier, orientation (« Écran principal orienté NE »), adresse, statut; D or non-ACTIF → booking disabled with the reason.
2. Aperçu: import a creative (image/video, local preview only, same honest notice as the wizard; reuse `creative-store.ts` so a creative chosen in the wizard for the campaign is reused), face selector (B: Les deux / Face 1 / Face 2; A: 360°; C: Face unique), jour/nuit, viewpoints.
3. Créneau: date range (min today) + day-part presets (§2) or custom times; availability calendar strip for the next 60 days from the availability endpoint (blocked days hatched, legend) and inline « période indisponible » validation.
4. Campagne: select one of my **BROUILLON** campaigns (from `/campaigns/mine`) or « Créer un brouillon rapide » (name, objective, budget — validated with the existing campaign zod schema; campaign dates/times = chosen créneau) → then « Réserver ce Porteur » → `POST /reservations` with the support's own zoneId → success toast with links « Voir la campagne » and « Continuer dans l'assistant » (`/espace/campagnes/nouvelle?id=…&etape=3`). Conflict error mapped inline. Explain: « Réservation temporaire, confirmée à la validation ZELQANE. La réservation porte sur l'écran complet du Porteur. »
Selection booking: « Réserver la sélection » dialog → choose campaign (same picker) + créneau → per-Porteur results list (réservé / indisponible / non réservable) with retry.
URL state: `?zone=`, `?porteur=`, `?vue=3d`, `?fond=satellite`, `?regrouper=1` kept in sync (shareable), `?repere=1` passes through to the studio.

## 6. Wizard integration — `/espace/campagnes/nouvelle` step « Zones & écrans »
Add a view switch « Liste | Carte ». Carte = `NetworkMap mode="select"` showing every Porteur of the open zones (non-réservables included, not selectable) bound to the step's existing selection/reservation logic (selected supports = screens to reserve with the campaign dates/times). Clicking a Porteur opens the studio (read-only créneau = the campaign's dates/times; configurator section 4 hidden; primary action « Ajouter à la campagne »). Keep all existing behaviour and tests green.

## 7. Admin tools — `/admin/reseau`
Add a map-first « Carte » view (keep tables as « Tableau » view): `NetworkMap mode="admin"`.
- **Placer un Porteur**: tool button → click on map → opens the support form prefilled with lat/lng (and zone auto-suggested = nearest zone whose radius contains the point).
- **Déplacer**: drag a Porteur marker → confirm dialog showing old/new coordinates and distance moved → `PUT /supports/{id}`.
- **Zones**: click map to create a zone at a point; selected zone shows a draggable radius handle → confirm → `PUT /zones/{id}`.
- Support form gains fields: type de Porteur (A–D cards with thumbnails from `public/porteur/`), hauteur de mât (15/20/25/30), orientation (0–359 with a compass dial preview), adresse; the zone form keeps lat/lng/radius with a mini-map picker.
- **Contrôle de cohérence** panel: Porteurs outside their zone radius, Porteurs without declared type/orientation, zones without Porteurs, type D marked as ECRAN, inactive zones with active Porteurs — each with « Localiser » and « Corriger ».
- Studio 3D available read-only from a Porteur (« Voir en 3D », repère mode toggle for staff).

## 8. Seed + demo data
`FrontEnd/scripts/seed-demo.mjs`: after creating supports, `PUT` each with realistic porteurType/mastHeightM/headingDeg/address (Avenue Habib Bourguiba roundabout → A 25 m; Lac 2 corridor → B 30 m; Corniche La Marsa → C 15 m; Place Barcelone → C 15 m; Port El Kantaoui → A 20 m (maintenance); Bab Bhar → B 25 m) and add 2 more: « Porteur relais Route de Bizerte » D 30 m (POINT_WIFI) in Tunis Centre, « Rond-point Sfax El Jadida » A 25 m in Sfax Centre. Idempotent (update only when fields are null). E2E mocks (`e2e/fixtures/demo-data.ts`, `api.ts`) gain the same fields + the availability endpoint.

## 9. Quality
Same bar as SPEC §4 (a11y, French, tokens only, no invented figures, states). Unit tests for all pure modules. The map/3D must not break SSR/prerender and must not load on marketing pages. Playwright: add `e2e/network.spec.ts` (explorer renders map or fallback, list↔map sync, open studio, configure day-part, create quick draft + reserve with mocked API, wizard map tab, admin place tool) + screenshots of `/espace/reseau`, studio open (day + night), wizard map tab, `/admin/reseau` map (desktop + mobile). Headless Chromium has WebGL via SwiftShader — if it is unavailable, the fallback path must be what gets tested, not a crash.
