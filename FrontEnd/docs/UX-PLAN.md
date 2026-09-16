# TPUB — Plan UX exécutable (espace annonceur & back-office)

> Status: approved plan for the next implementation round. Source: UX audit (lenses `ia-navigation`, `task-flows`, `visual-system`, `feedback-a11y`; screenshots under `.qa/ux/**`, `CAPTURE.md`).
> Binding references: `SPEC.md`, `COMPONENTS.md`, `api-contract.md` (§7 backend limits), `tpub-brief.md` (no invented figures, honest labels), `NETWORK-MAP-SPEC.md`, `design-reference.md` §7.3.
> Scope: `/espace/**`, `/admin/**`, auth pages (copy only), shared `src/components/{ui,shell}`, `src/lib`, `src/content`. The marketing site and the player `/ecran/[id]` are out of scope. The shared primitives they use must not regress.
> Every finding ID from the audit appears in §14 (traceability). Deferred items and their reasons are in §15.

---

## 0. Lecture rapide

| Package | Owns | Main outcome |
|---|---|---|
| **F — Fondation** | `src/components/ui`, `src/components/shell`, `src/lib`, `src/content`, `globals.css`, `middleware.ts`, espace/admin `layout` + `not-found` + `error` + catch-all | One shell, one trail, palette ⌘K, shortcuts « ? », mobile tab bar, page anatomy primitives, sortable URL tables, French date/time fields, form safety (dirty guard, drafts, autosave, error summary), session-expiry warning, honest slow/timeout errors, semantic status palette, blur removal in app surfaces, overlay tokens |
| **A1 — Assistant de campagne** | wizard files in `src/components/campaign`, `/espace/campagnes/nouvelle` | 3-step wizard, availability-first Porteur selection, booking on « Continuer » with explicit consequence, « Changer de période », French dates, drafts/autosave |
| **A2 — Suivi des campagnes** | list/detail/edit files in `src/components/campaign`, `/espace/campagnes`, `/espace/campagnes/[id]/**` | One editing flow per status, « what happens next » with time cues, Porteur/zone deep links, honest not-found, safe delete |
| **B — Pilotage annonceur** | `src/components/espace`, `/espace`, `/espace/reservations`, `/espace/statistiques`, `/espace/profil`, auth copy | Action-first dashboard and first-run, URL filters and sorting on Réservations, drill-down Statistiques, partial-failure rendering, consistent money labels |
| **C — Réseau & Studio 3D** | `src/components/{network,map,porteur3d}`, `/espace/reseau` | Discoverable Studio 3D, Back closes the Studio, campaign-first booking, opens on a free slot, mobile scroll-safe canvas, no blur over WebGL |
| **D — Back-office** | `src/components/admin`, `/admin` pages | URL-synced moderation, fast keyboard triage with next item and bulk validation, advertiser identity plus refusal message template, safe emergency messages (multi-zone, impact, confirm), staff overview « À surveiller » |

Order: **F first** (merge and freeze its contracts, §13.2). Then A1, A2, B, C and D run **in parallel** on strictly disjoint paths. A short integration pass follows (§13.4).

---

## 1. Principes cibles

1. **The shell never disappears inside the product.** 404s, runtime errors, access refusals and session expiry all render inside AppShell, with a way back into the user's workspace, never onto the public site.
2. **One location signal per page.** One breadcrumb trail (topbar), one h1 and an eyebrow only when it adds information. Primary content starts within **280 px** of the viewport top on desktop (1440×900) and within **200 px** below the topbar on mobile (390×844).
3. **One primary action per view region.** It is a filled blue `primary` button in `PageHeader.primaryAction` or in a sticky action bar, never both in the same viewport. Orange is identity only (logo, active nav), never an action.
4. **Every object is linkable and every list state is in the URL.** Campaigns, Porteurs, zones, reservations filters, moderation tab, search and the open review all survive refresh, Back and sharing. Overlays that look like pages (Studio sheet, review dialog) create a history entry.
5. **Validate before commit, and state the consequence in the action itself.** Unavailable Porteurs are greyed before selection. Irreversible actions (booking, submission, emergency broadcast, delete) name the object, the scope and the irreversibility in the button label or directly above it. Confirmation modals are reserved for truly destructive or public-impact actions.
6. **Status tells users what happens next and when.** Status labels differ only when the required action differs. Every waiting state shows elapsed time from real data and the published support hours (lun–ven, 9 h–18 h). No SLA is invented.
7. **Honest system feedback.** Slow is not offline. Partial data is not an error page. An estimate is labelled as an estimate with its rule. Nothing claims an automatic notification, refresh, or proof that doesn't exist.
8. **Typed input is never lost.** A dirty guard runs on every form. Drafts are kept in sessionStorage before the server draft exists, and autosaved once it does. The session-expiry warning appears 10 min before the JWT deadline, and a 401 never silently discards input.
9. **Work surfaces are calm and fast.** No `backdrop-filter` in `/espace` and `/admin` (and never over a WebGL canvas), no infinite decorative animation, no stock illustrations in operational screens, 12 px minimum readable text, 44 px touch targets below `sm`.
10. **One vocabulary** (§3.6), one number and date formatting path (`src/lib/format.ts`), and one semantic status palette (§4.8) that is separate from categorical colours.
11. **Keep what works.** Existing URL state (`campaign-list.tsx`, `explorer-url-state.ts`, `network-admin-view.tsx`), `useResource`, `ConfirmDialog`, `EmptyState`/`ErrorState`, radix primitives and the dark brand ground all stay. Changes are extensions, not rewrites, unless a finding requires it.

---

## 2. Arbitrages (conflicts resolved between lenses)

| Topic | Positions in audit | Decision |
|---|---|---|
| Breadcrumbs (IA-03, VD-09, FLOW-17) | topbar-only trail vs. page trail; hide one | **Topbar is the only trail.** `PageHeader.breadcrumbs` keeps its type but no longer renders in the app shell. It registers into `BreadcrumbContext`, so existing call sites keep working. Below `lg` the trail collapses into a « ‹ Parent » back control (IA-17). |
| Booking in wizard step 2 (FLOW-01, FLOW-08, FFA-02, FFA-03) | editable selection until Continuer vs. confirm dialog on unbooked vs. consequence label | **Remove the separate « Bloquer le créneau » button.** The sticky bar's primary action is « Réserver N Porteurs et continuer ». It books every pending Porteur, then advances only if all succeed. The consequence line sits directly above the button. This makes the silent-drop bug (FFA-02) structurally impossible, so no extra modal is needed. |
| Wizard length (FLOW-08, IA-04, FFA-21) | 4 → 3 steps | **3 steps: 1 Détails · 2 Porteurs · 3 Vérification & envoi.** The creative preview (non-persisted, no upload) becomes an optional collapsible section in step 3. Legacy `?etape=3` and `?etape=4` both map to step 3. |
| Submit gate (FLOW-08) | checkbox + modal | **Single gate:** the charter checkbox inline, then « Soumettre à la modération » directly. The button is `aria-disabled` with a reason until the box is checked (FFA-17). The irreversibility sentence stays next to the button. |
| Native date inputs (FLOW-06 vs. VD-22/FFA-20) | custom French picker vs. keep native + echo | **Shared French `DateRangeField` / `DateField` / `TimeRangeField`**: text entry `jj/mm/aaaa` with a calendar popover, presets and 24 h selects, **plus** the always-visible French echo tied with `aria-describedby`. Native `type="date"`/`type="time"` are removed from app areas. Keyboard entry keeps the accessibility benefit of native inputs. |
| Campaign status vocabulary (VD-01, VD-02, FLOW-19, VD-06) | several proposals | Advertiser statuses and tabs in §4.8. Staff keep precise AI statuses. One tone per lifecycle phase, and charts read tones from the same map. |
| Eyebrow | remove vs. keep when meaningful | Remove eyebrows that restate the area (« Espace annonceur », « Back-office », « Tableau de bord »). Keep them when they add meaning (campaign reference `CAMP-00007`, « Assistant »). The dash animation stops in app areas. |
| Global « Nouvelle campagne » CTA (IA-12, IA-11) | hide vs. ghost vs. tab bar | Filled primary in the topbar only on `/espace` and `/espace/campagnes`. Elsewhere, a `secondary` « Créer » button on `≥sm` and nothing on mobile, where creation is reachable via the palette, the dashboard and the Campagnes page. Never shown on the wizard. |
| Error scope (VD-14, FLOW-12, FFA-05) | page vs. section | **Section-level errors** with retry. Whole-page ErrorState only when the page's primary resource fails (e.g. `/campaigns/mine` on the list page). |
| Light theme (VD-10) | full light theme vs. tokens first | **Phase 1 now** (overlay tokens, contrast test, `data-theme` plumbing). **Phase 2 (toggle + light palette) deferred** until the contrast gate passes on every surface (§9, §15). |
| Blur (VD-03, FFA-15, FLOW-11 #5) | remove vs. profile | **Remove now** in app surfaces (cheap, visually near-identical on dark), then profile on a real GPU as an acceptance step. `.glass` stays for marketing. |
| Estimate labels (VD-16, FLOW-20) | tone and rule | Neutral `EstimateTag` (not amber) with the documented rule. Amber is reserved for statuses that need attention. |
| 404 copy (IA-01, FLOW-13, FFA-14, VD-23) | varied | h1 « Page introuvable ». Description « Ce lien ne correspond à aucune page de votre espace. » Three role-specific exits plus the ⌘K trigger. No « Signaler un lien cassé » (it targets visitors). |

---

## 3. Modèle de navigation

### 3.1 Carte des routes

**Espace annonceur (ANNONCEUR)**

| Nav group | Item (label) | Route | Badge | Mobile tab bar |
|---|---|---|---|---|
| Piloter | Tableau de bord | `/espace` | — | « Accueil » |
| Piloter | Campagnes | `/espace/campagnes` | count of drafts without active reservation + `REJECTED_BY_AI` (aria-label « N à finaliser ») | « Campagnes » |
| Piloter | Réservations | `/espace/reservations` | — | « Réservations » |
| Piloter | Statistiques | `/espace/statistiques` | — | under « Plus » |
| Explorer | Réseau & Studio 3D | `/espace/reseau` | — | « Réseau » |
| (account menu) | Profil | `/espace/profil` | — | under « Plus » |

Object routes (not in nav): `/espace/campagnes/nouvelle?id=&etape=1|2|3`, `/espace/campagnes/[id]`, `/espace/campagnes/[id]/modifier` (non-draft editable statuses only; drafts redirect to the wizard), `/espace/reseau?zone=&porteur=&vue=&fond=`.

**Back-office (ADMINISTRATEUR, SUPERVISEUR, OPERATEUR)**

| Nav group | Item | Route | Badge | Mobile tab bar |
|---|---|---|---|---|
| Opérer | Vue d'ensemble | `/admin` | — | « Accueil » |
| Opérer | Modération | `/admin/moderation?onglet=&q=&examen=` | count `APPROVED_BY_AI + REVIEW_REQUIRED` (same filter as the overview hero) | « Modération » |
| Réseau | Réseau | `/admin/reseau?onglet=&porteur=…` | coherence issue count (warning tone) | « Réseau » |
| Réseau | Messages prioritaires | `/admin/urgences` | active message count (neutral) | « Urgences » |

Badges are computed in the shell from resources already fetched (`campaignsApi` mine/all, `supportsApi.all` + `zonesApi.all` for coherence, `emergencyApi.all`). They are revalidated on focus with the shared cache (`resource-cache.ts`, §11.5) and hidden at 0. No new endpoint.

### 3.2 Shell (AppShell)

**Desktop sidebar (≥ lg):** logo linking to the section home, role badge, grouped nav with small group headings (« Piloter » / « Explorer », « Opérer » / « Réseau »), and badges. At the bottom, the **account menu trigger** (avatar, name on line 1, e-mail on line 2, `title` attribute, no truncation of the name before 200 px). The « Besoin d'aide ? » mailto block and « Voir le site TPUB » move into the menus below.

**Topbar (all widths), left to right:**
1. `< lg`: drawer trigger (44 px) plus a **back control** « ‹ {parent label} » when the route is deeper than its nav item. Otherwise the logo mark links to the section home (IA-17).
2. Trail (`≥ lg`, and `sm–lg` when there is room): `Nav item › Object name › Sub-page`. Every segment except the last is a link. No « Espace annonceur / Back-office » prefix, since the sidebar badge carries the area.
3. Search trigger: `≥ sm` a field-like button « Rechercher… ⌘K » (« Ctrl K » on non-Apple), `< sm` a 44 px icon button (aria-label « Rechercher »).
4. Read-only chip for SUPERVISEUR/OPERATEUR: `≥ sm` « {Rôle} · lecture seule »; `< sm` a lock icon with aria-label « Accès en lecture seule » (IA-24).
5. Help menu « ? » (radix DropdownMenu): « Raccourcis clavier » (opens ShortcutsDialog), « Comment ça marche » (`/fonctionnement`, new tab), « FAQ » (`/faq`, new tab), « Contacter TPUB » (mailto), « Voir le site TPUB » (new tab, `rel="noopener"`).
6. Contextual create CTA (espace only, rule in §2).

**Account menu (sidebar bottom on desktop; drawer bottom on mobile):** Profil (espace only), « Aide & raccourcis », « Voir le site TPUB » (new tab), separator, « Se déconnecter ». Profil is removed from `ESPACE_NAV`.

**Admin context accent (IA-24):** in `variant="admin"`, the active nav pill uses `border-blue-line bg-blue-soft text-blue-text`, and the topbar gets a 2 px top border in `--blue`. The espace keeps the orange active pill.

**Mobile bottom tab bar (< lg, IA-11):** 5 slots (4 items + « Plus », which opens the existing drawer). Height 56 px + `env(safe-area-inset-bottom)`, 44 px targets, `aria-current="page"`, badge dots with aria-labels. It is **hidden on `/espace/reseau`** (the explorer owns its bottom bar) and on `/espace/campagnes/nouvelle` (the wizard owns a sticky action bar). `main` gets `pb-[calc(56px+env(safe-area-inset-bottom)+1rem)]` when the bar is shown. It sets the CSS variable `--bottom-bar-h` on `<html>`, which toasts and sticky bars read.

**Drawer (IA-16):** the close button moves into the logo/badge flex row, so it no longer overlaps the badge. Verify at 320 and 390 px.

### 3.3 Fil d'Ariane unique

- `BreadcrumbProvider` lives in AppShell. The default trail is derived from the pathname and nav: `[navItem]`, plus a `Page` label for known sub-routes.
- Pages refine it with `<PageHeader breadcrumbs={…}>` (unchanged API) or `useBreadcrumbs(items)`. The last item has `aria-current="page"`.
- `document.title` follows the last trail label through each route's metadata. Client pages that learn an object name call `useDocumentTitle(name)` (« Ouverture boutique La Marsa — Campagnes — TPUB »).

| Route | Trail |
|---|---|
| `/espace` | Tableau de bord |
| `/espace/campagnes` | Campagnes |
| `/espace/campagnes/nouvelle` (no id) | Campagnes › Nouvelle campagne |
| `/espace/campagnes/nouvelle?id=7` | Campagnes › {name} › Finaliser |
| `/espace/campagnes/7` | Campagnes › {name} |
| `/espace/campagnes/7/modifier` | Campagnes › {name} › Modifier |
| `/espace/campagnes/999999` (not found) | Campagnes › Introuvable |
| `/espace/reseau?porteur=12` | Réseau & Studio 3D › {Porteur name} |
| `/admin/moderation?examen=3` | Modération › Examen #3 |
| unknown `/espace/**` | Page introuvable |

### 3.4 États de bord de navigation

| Situation | Behaviour |
|---|---|
| Unknown URL under `/espace/**` or `/admin/**` | `src/app/{espace,admin}/[...rest]/page.tsx` calls `notFound()`. `src/app/{espace,admin}/not-found.tsx` renders inside the layout: `PageHeader title="Page introuvable"` + EmptyState (SearchX) + 3 exits (espace: Tableau de bord / Campagnes / Réseau & Studio 3D; admin: Vue d'ensemble / Modération / Réseau) + « Rechercher (⌘K) » button. |
| Runtime error in a segment | `src/app/{espace,admin}/error.tsx` (client) renders inside the layout with `ErrorState`: « Réessayer » (reset), a link to the section home, and « Référence de l'incident : {digest} » when a digest exists. The root `error.tsx` is kept for marketing. |
| ANNONCEUR opens `/admin/**` (or staff opens `/espace/**`) | Middleware and layouts redirect to the role home with `?acces=reserve`. The shell shows an info toast once, « Cette section est réservée à l'équipe TPUB. » (staff: « Cette section est réservée aux comptes annonceurs. »), then strips the param with `replaceState`. |
| Session near expiry / expired | §7.5. |

### 3.5 Contrat d'URL (`src/lib/routes.ts`)

Typed builders are the only way to create internal hrefs for objects and filtered lists. Every package consumes them.

```ts
export const routes = {
  espace: {
    home: () => "/espace",
    campaigns: (q?: { statut?: CampaignFilterValue; q?: string; tri?: string }) => string,
    campaign: (id: number) => `/espace/campagnes/${id}`,
    campaignEdit: (id: number) => `/espace/campagnes/${id}/modifier`,
    wizard: (id: number | null, step?: "details" | "porteurs" | "verification") => string, // etape=1|2|3
    reservations: (q?: { statut?: ReservationStatus; campagne?: number; zone?: number; tri?: string }) => string,
    statistics: () => "/espace/statistiques",
    network: (q?: { zone?: number; porteur?: number; vue?: string; fond?: string }) => string,
    profile: () => "/espace/profil",
  },
  admin: {
    home: () => "/admin",
    moderation: (q?: { onglet?: "a-traiter" | "revue" | "ia" | "toutes"; q?: string; examen?: number; tri?: string }) => string,
    network: (q?: { onglet?: "carte" | "ecrans" | "zones"; porteur?: number; panneau?: "coherence" }) => string,
    emergencies: () => "/admin/urgences",
  },
  player: (supportId: number) => `/ecran/${supportId}`,
};
```

History policy (`useUrlState`, §11.8): **replace** for filters, search, sort, tabs, map view and basemap; **push** for opening an overlay that looks like a page (`?porteur=` Studio, `?examen=` review). Closing such an overlay calls `router.back()` when it was opened in this session, and otherwise replaces the param away.

Security note (contract §7.16): ids from the URL are never trusted for authorization. Detail pages resolve campaigns from `/mine` (A2 already does this through `loadOwnedCampaign`).

### 3.6 Glossaire (`src/content/glossary.ts`, documented in `tpub-brief.md`)

| Term | Meaning | Use | Never |
|---|---|---|---|
| **Porteur** | Physical mast carrying the screen faces | Nav, map, lists, table columns, CTAs (« Réserver ce Porteur ») | « emplacement », « support » (UI) |
| **Écran** | A face of a Porteur (Studio only) | Studio 3D copy | as a synonym of Porteur in lists |
| **Créneau** | A reservation of a Porteur for the campaign period | Reservation lists, KPIs (« Créneaux »), booking copy | « écran réservé » |
| **Budget déclaré** | Sum of campaign budgets entered by the advertiser | Dashboard, Statistiques, admin overview | « Budget total », « Budget estimé », « Budgets déclarés » |
| **Coût estimé des créneaux** | Sum of `estimatedCost` (10 % of the budget per créneau, fixed at booking, §7.17) | Wizard, detail, Réservations, stats, with `EstimateTag` | « prix », « facture » |
| **Vues estimées** | `estimatedViews` (fixed 1000 per créneau) | Always with `EstimateTag` | « audience », « impressions » |
| **Diffusions journalisées** | Player log lines (plays, not audience) | Admin only until the backend exposes per-campaign logs | « preuve » as a delivered feature |

Reservation status labels (advertiser): `TEMPORAIRE` « Bloqué · en attente de décision TPUB » (short: « Bloqué »), `CONFIRMEE` « Confirmé », `ANNULEE` « Libéré », `EXPIREE` « Passé ».

---

## 4. Anatomie de page

### 4.1 Ordre vertical (every `/espace` and `/admin` page)

```
Topbar (68 px, sticky): back/trail · search · help · CTA
[Session banner — only when < 10 min]
PageHeader: h1 + meta (status pill) · description (≤ 1 line on desktop) · actions
FilterBar (lists only): search · filters · sort · result count · reset
Content: sections (SectionCard) / DataTable / map
States: LoadingRegion (slow caption) · EmptyState · ErrorState (section) · PartialNotice
Sticky action bar (flows only: wizard step 2/3, Studio): consequence line + one primary
Mobile tab bar (< lg, where shown)
```

Budgets: PageHeader top margin + height ≤ 150 px desktop without description, ≤ 190 px with. The first content block starts ≤ 280 px from the viewport top (desktop 1440×900).

### 4.2 PageHeader

- h1 `--text-h1` (32 px desktop, 26 px mobile), and the status pill **immediately** after the title in the same flex-wrap row (VD-20).
- `description`: one sentence, `--text-body` muted, max 72ch. It is omitted on repeat visits of flows (wizard steps after 1).
- Actions: `primaryAction` (at most one), `secondaryActions` (≤ 2 visible), `overflowActions` (« … » DropdownMenu, including destructive items last in danger style). When more than 2 actions exist, actions render on their own row under the title on `< xl`, so the title keeps its full width. On `< sm`, secondary actions collapse into the overflow menu, and DOM/tab order is **primary → secondary → overflow** (FFA-24).
- `eyebrow` only when meaningful (§2).

### 4.3 FilterBar

One row on `≥ md`: search input (with `/` shortcut hint), filter selects/segmented tabs, sort select (for mobile, where headers are hidden), result count « 12 réservations », « Réinitialiser » when anything is active. On `< md`: search plus a « Filtres (n) » button opening a bottom sheet containing the filters and sort. Status tabs above the bar use `Tabs` with an overflow fade and scroll-snap (FFA-23). All state lives in the URL through `useUrlState`.

### 4.4 Tables (DataTable)

- Sortable columns: a header `<button>` with a chevron, `aria-sort` on `<th>`, and sort key/direction in the URL param `tri=colonne` / `tri=-colonne`. The default sort is shown in a caption line: « Trié par : attente la plus longue ».
- Row actions: a dedicated right-aligned last column (`rowActions`). In mobile cards they go in the footer. The row name cell is a Link. **No clickable `<tr>`** (the existing a11y rule stays).
- Mobile cards (< md): title line = primary cell plus up to 2 `mobileMeta` cells right-aligned (status pill, amount). The `dl` switches to 2 columns from `min-[340px]`. Target ≤ 150 px per reservation card.
- Never truncate dates or amounts (`whitespace-nowrap`). Names truncate with `title`.
- Empty filtered result: inline EmptyState « Aucun résultat pour ces filtres » + « Réinitialiser les filtres ». This is distinct from the first-use empty state.

### 4.5 SectionCard (one card header recipe)

36 px icon tile + `--text-title` (17 px) title + optional one-line description + optional `aside` (pill or link) on the right. It replaces the three header variants on the campaign detail (VD-20), and is used across B/D sections.

### 4.6 États (recipes, documented in COMPONENTS.md)

| State | Container | Content | Role |
|---|---|---|---|
| Loading | `LoadingRegion` skeleton shaped like the content | After **4 s** the caption « Chargement plus long que d'habitude… » appears, and after **8 s** a « Réessayer » link | `aria-busy`, caption in `role="status"` |
| Empty (first use) | dashed neutral card | icon, 1-line why, 1 primary action | — |
| Empty (filtered) | inline, no card | « Aucun résultat pour ces filtres » + reset | `role="status"` |
| Error (section) | red-tinted card inside the section | category title, message, « Réessayer », digest if any; already-loaded data outside the section stays | — |
| Partial | small warning note in the affected tile/section | « Données partielles · Réessayer » | — |
| Slow / timeout | as Error, Clock/Hourglass icon | « Le service met trop de temps à répondre » / « TPUB met plus de temps que prévu à répondre. Nouvel essai… » | — |
| Offline | as Error, WifiOff icon | only when `navigator.onLine === false` or fetch TypeError while offline | — |
| Not found (object) | neutral card | « {Objet} introuvable », neutral ownership wording, recent objects as links, ⌘K | h1 carries « introuvable » |
| Not found (route) | §3.4 | | |

### 4.7 Hiérarchie des boutons (VD-08)

| Level | Variant | Use in app | Shape |
|---|---|---|---|
| Primary | `primary` (blue filled) | the one main action of the region | `rounded-control` |
| Secondary | `secondary` (neutral bordered) | alternatives, « Ajouter à la sélection », « Modifier » | `rounded-control` |
| Tertiary | `ghost` / link | cancel, « Quitter l'assistant », inline actions | `rounded-control` |
| Destructive | `danger` | only inside a destructive confirmation, or « Supprimer » in overflow menus | `rounded-control` |
| Marketing-only | `brand`, `outline` | forbidden in `/espace` and `/admin` (checked by grep in each package acceptance) | pill |

Pills are for chips, tabs and filters only. Buttons that gate an action use `aria-disabled` + `disabledReason` (§11.1) instead of `disabled`.

### 4.8 Statuts & couleurs (VD-01, VD-02, VD-07, FLOW-19)

Semantic status tones (tokens in `globals.css`; every ink × surface pair ≥ 4.5:1, asserted by a unit test):

| Tone token | Meaning | Hue (dark) |
|---|---|---|
| `status-draft` | yours to edit | neutral grey (`--muted` ink, `--surface-3` fill) |
| `status-pending` | waiting for TPUB | amber (`--warning`) |
| `status-scheduled` | validated, not yet on air | violet (new `--violet`, `--violet-text` ≈ `#b9a2ff`, `--violet-soft`, `--violet-line`) |
| `status-live` | on air | green (`--success`) + pulse |
| `status-ended` | finished | muted |
| `status-problem` | refused / to fix | red (`--danger`) |

`info` is no longer a status tone (it stays for informational Alerts only). `blue` is reserved for actions and links.

**Campaign statuses, advertiser audience** (`getCampaignStatusMeta(c, { audience: "annonceur" })`):

| Backend status (display) | Label | Secondary line | Tone |
|---|---|---|---|
| BROUILLON | Brouillon | « Vous pouvez tout modifier. » | draft |
| PENDING_AI_CHECK | Analyse IA en cours | « Résultat sur cette page après actualisation » | pending |
| APPROVED_BY_AI | En examen TPUB | « Analyse favorable » | pending |
| REVIEW_REQUIRED | En examen TPUB | « Quelques points à vérifier par l'équipe » | pending |
| REJECTED_BY_AI | À corriger | « Dupliquez la campagne pour la corriger » | problem |
| VALIDATED_BY_ADMIN / SCHEDULED | Programmée | « Diffusion à partir du {startDate} » | scheduled |
| ACTIVE (in window) | En diffusion | — | live |
| TERMINATED / ENDED | Terminée | — | ended |
| BLOCKED | Refusée | « Contactez TPUB pour connaître le motif » | problem |

**Staff audience** keeps the precise labels (« Avis IA favorable », « Revue manuelle », « Analyse IA en attente »…) with the same tones.

**List tabs** (`CAMPAIGN_FILTERS`, URL `?statut=`): `toutes` Toutes · `a-finaliser` À finaliser (BROUILLON, REJECTED_BY_AI) · `en-examen` En examen (PENDING_AI_CHECK, APPROVED_BY_AI, REVIEW_REQUIRED) · `validees` Validées — programmées ou en diffusion (VALIDATED_BY_ADMIN, ACTIVE) · `terminees` Terminées & refusées (TERMINATED, ENDED display, BLOCKED). Legacy values map: `brouillons→a-finaliser`, `validation→en-examen`, `diffusion→validees`, `refusees→terminees`. The same buckets and labels feed dashboard hints, Statistiques and the admin overview. `CAMPAIGN_BUCKETS` reads its tone from `CAMPAIGN_STATUS` (test-enforced).

**Categorical palette** (`--cat-1..4`: orange, blue, violet-grey, teal; no hue equal to danger/success/warning) is used for Porteur types A–D, map markers and chart series that are not statuses. Porteur type C stops using `danger`.

**KPI value colour:** neutral by default. Attention tones only when the value is > 0 **and** the metric is a problem (e.g. « Inactifs ou hors ligne »).

### 4.9 Typographie, nombres, dates

- Type scale tokens in `@theme`: `--text-caption` 12px, `--text-label` 13px, `--text-body` 15px, `--text-title` 17px, `--text-h3` 20px, `--text-h2` 24px, `--text-h1` 32px. Readable text is ≥ 12 px (chart ticks, chip counters, availability legend and booking explainer included). Labels in definition lists are sentence case, 13 px, medium. Uppercase tracked micro-labels are marketing-only.
- `--muted-2` is lightened to meet ≥ 4.5:1 on `surface-2` and glass-free surfaces (target `#8e95a2`, verified by the contrast test).
- Numbers: every `Intl` formatter goes through one normaliser (U+202F → U+00A0): « 4 000 », « 9 700 DT ». Tabular numbers in tables and KPIs.
- Dates: display with `formatDate`/`formatDateRange` (« 10 févr. 2027 », « du mer. 10 févr. au mar. 16 févr. 2027 · 7 jours »), time 24 h « 09:00 – 18:00 », input `jj/mm/aaaa`. Coordinates display with `formatCoordinatesFr` (« 36,8829° N · 10,3301° E », 4 decimals); `formatLatLng` (dot) only for clipboard/URL.

---

## 5. Couche productivité

### 5.1 Palette de commandes (⌘K / Ctrl+K)

- Trigger: topbar button, `⌘K`/`Ctrl+K` anywhere (even inside inputs), and `/` when focus is not in an editable element and the page has no local search (a page with a FilterBar search takes `/` for itself).
- UI: radix Dialog (no blur), input `role="combobox"` + `aria-expanded` + `aria-activedescendant`, results `role="listbox"` grouped with `role="group"` headings. ↑/↓ move, Enter runs, ⌘/Ctrl+Enter opens in a new tab for navigation items, Esc closes. It is full-height on mobile.
- Empty query: « Récents » (last 5 visited objects, localStorage per user) + « Navigation » + « Actions ».
- Filtering: client-side with `normalizeSearch` (accent and case insensitive), ranked by prefix, word-start, then substring, max 8 per group. Data comes from the shared cache (`resource-cache.ts`, §11.5), loaded lazily on first open, with a skeleton row while loading and « Recherche indisponible · Réessayer » on error. No backend search is claimed (api-contract §7.10).

| Group | ANNONCEUR | Staff |
|---|---|---|
| Navigation | all nav items, Profil | all nav items |
| Actions | « Nouvelle campagne », « Ouvrir la carte du réseau », « Raccourcis clavier », « Se déconnecter » | « Traiter la file (N) », « Nouveau message prioritaire » (ADMINISTRATEUR/OPERATEUR only, per existing permissions), « Raccourcis clavier », « Se déconnecter » |
| Campagnes | `campaignsApi.mine` → « {name} · {status label} » → `routes.espace.campaign(id)`; secondary action on drafts « Finaliser » → wizard | campaigns all → « #{id} {name} · {status} » → `routes.admin.moderation({ examen: id })` |
| Porteurs | `supportsApi.all` (active) → « {name} · {zone} » → « Ouvrir le Studio : {name} » → `routes.espace.network({ porteur })` | → `routes.admin.network({ onglet: "ecrans", porteur })` |
| Zones | `zonesApi.active` → `routes.espace.network({ zone })` | `zonesApi.all` → `routes.admin.network({ onglet: "zones" })` |
| Page commands | registered via `useRegisterCommands` (e.g. moderation « Valider #3 »), shown first when present | idem |

Navigation through the palette goes through the navigation guard (§7.1).

### 5.2 Raccourcis clavier et feuille « ? »

- `?` (Shift+/) outside editable elements opens `ShortcutsDialog`. It is also reachable from the help menu and account menu.
- Global: `⌘K`/`Ctrl K` palette · `?` shortcuts · `/` page search · `G` then `D` Tableau de bord / `C` Campagnes / `R` Réseau / `V` Réservations / `S` Statistiques (espace) · `G` then `A` Vue d'ensemble / `M` Modération / `R` Réseau / `U` Urgences (admin) · `N` Nouvelle campagne (espace, not in wizard). The `G` sequence has a 1.2 s window.
- Contextual sections are listed only on their pages, sourced from a registry (`src/lib/shortcuts.ts`) that mirrors the existing handlers without changing them: Carte du réseau (from `network-map-client.tsx` handlers), Studio 3D (from `porteur-studio-canvas.tsx`), Examen de modération (`J`/`K` précédente/suivante, `V` valider, `R` refuser, `Esc` fermer — D).
- Rules: no single-key shortcut fires when focus is in input/textarea/select/contenteditable, when a modifier other than Shift is held, or when a dialog other than the palette has focus (except the dialog's own registered keys). All shortcuts are listed with `<kbd>` and platform-aware modifier labels. WCAG 2.1.4: single-key shortcuts can be turned off with a « Désactiver les raccourcis à une touche » switch in the dialog (localStorage).

---

## 6. Communication de statut (« et ensuite ? »)

1. **Every campaign status surface** (list row, detail header, dashboard item) shows: label + secondary line (§4.8) + **time cue** from real data: « Soumise il y a 3 h » (from the latest known submit/update timestamp available in `CampaignResponse`; if no timestamp exists, omit rather than invent), « Diffusion dans 5 jours », « Terminée le 12 oct. ».
2. **Waiting on TPUB:** « Examen par l'équipe TPUB en jours ouvrés (lun–ven, 9 h–18 h). » This uses the support hours already published on the profile page. No duration promise.
3. **Freshness:** `useResource` revalidates on window focus / `visibilitychange` (throttled 30 s). The detail page polls every 10 s while `PENDING_AI_CHECK` (stop after 2 min, paused when hidden) and every 60 s while `APPROVED_BY_AI`/`REVIEW_REQUIRED`. It shows « Mis à jour à 14:32 » with a manual refresh icon button. Copy never promises a notification.
4. **Stepper truth:** `VALIDATED`/`SCHEDULED` show « Validation TPUB ✓ » and a Diffusion step labelled « Dans 5 jours », not current. ACTIVE in window marks Diffusion current with pulse.
5. **« Prochaine étape » card** (A2) on validated campaigns: « Envoyez votre visuel à TPUB avant le {startDate} » + mailto prefilled with `CAMP-000xx`, name and period (upload doesn't exist). On BLOCKED: « Contactez TPUB pour connaître le motif » + mailto. On REJECTED_BY_AI: « Dupliquer et corriger ».
6. **Reservations:** « Bloqué · en attente de décision TPUB » with tooltip « Le créneau est retenu pour cette campagne jusqu'à la décision de TPUB. Il n'est pas libérable en ligne. »
7. **Estimates:** `EstimateTag` with the rule (§3.6). The Statistiques « Budget consommé » tile is replaced by the note « Suivi de consommation : pas encore disponible » (§7 contract: always 0).
8. **Proof of broadcast:** the auth panel and Statistiques state the real situation: « Journal de diffusion par campagne — mise en service progressive. Les diffusions sont journalisées côté TPUB ; le rapport annonceur n'est pas encore ouvert. » + contact link.

---

## 7. Formulaires & sécurité des saisies

### 7.1 Navigation guard (`useUnsavedChangesGuard`)

`NavigationGuardProvider` sits in AppShell. A form calls `useUnsavedChangesGuard({ dirty, message? })`. While any registered guard is dirty:
- a `beforeunload` listener is attached (browser-native prompt);
- a capture-phase click listener on `document` intercepts same-origin `<a>` without `target`/modifier keys and opens `ConfirmDialog` « Quitter sans enregistrer ? » (« Vos modifications seront perdues. » · « Rester » primary · « Quitter » danger-ghost);
- sidebar, tab bar, palette, back control and breadcrumbs call `guard.confirmNavigation(href)`;
- `popstate` (Back) is not interceptable reliably; drafts (§7.2) cover it.

### 7.2 Brouillons locaux (`useFormDraft`)

`useFormDraft<T>({ key, value, dirty, userId, version })` saves to sessionStorage (`tpub:draft:v{version}:{userId}:{key}`) debounced 500 ms while dirty. It returns `{ restoredValue, restoredAt, discard(), clear() }`. On mount with a stored value, the form shows `<DraftRestoreNotice>` (info Alert): « Saisie restaurée ({relative time}). » + « Effacer ». It is cleared on successful save/submit and ignored if older than 24 h. All access is wrapped in try/catch; if storage is unavailable, the notice never shows.

Keys: `campaign:new` (wizard step 1 before POST), `campaign:{id}:details`, `campaign:{id}:edit`, `network:quick-draft`, `admin:emergency:new`, `admin:zone:{id|new}`, `admin:support:{id|new}`.

### 7.3 Autosave (server drafts)

`useAutosave({ value, save, enabled, delay = 1500, isEqual })` → `{ state: "idle" | "saving" | "saved" | "error", savedAt, retry }`. It is enabled only for BROUILLON/REJECTED_BY_AI campaigns with an id, and only when the value validates (zod partial success for the fields being saved; invalid fields keep local draft only). `<AutosaveStatus>` sits near the actions: « Enregistrement… » / « Enregistré · il y a 5 s » / « Échec de l'enregistrement · Réessayer ». Autosave never books, submits or changes dates on a draft with active créneaux (dates are locked; §12.A1).

### 7.4 Validation et erreurs

- Field errors: `Field` keeps `aria-invalid` + `aria-describedby`, and **drops `role="alert"`** (FFA-12).
- `<ErrorSummary errors={[{ fieldId, message }]} />` at the top of the form on submit: Alert danger, `role="alert"`, heading « {n} champ(s) à corriger », anchor links focusing each field, receives focus on submit failure. For a single error, focus goes to the field directly and no summary is shown.
- Validate on blur once a field is touched. Cross-field date rules (end ≥ start, start ≥ today for new campaigns) are validated inline as soon as both values exist.
- Server field errors are mapped into the same structure (`mapServerFieldErrors` stays).

### 7.5 Expiration de session (FFA-01)

- `useSessionDeadline()` in SessionProvider reads `user.exp`. It re-reads `sessionApi.get` on window focus to pick up a re-login from another tab.
- **T − 10 min:** `<SessionExpiryBanner>` below the topbar (non-modal, `role="status"`): « Votre session expire à 12:14. Enregistrez votre travail. » · « Se reconnecter » (opens `/connexion?next={path}` in a new tab) · « Masquer » (hides until T − 2 min). **T − 2 min:** reappears with `role="alert"` once.
- **401 / T = 0:** `SessionExpiredListener` no longer calls `router.replace` directly. It opens `<SessionExpiredDialog>` (not dismissible): title « Session expirée ». The description is « Vos saisies de cette page sont conservées sur cet appareil. Reconnectez-vous pour continuer. » when any `useFormDraft` is registered dirty, otherwise « Reconnectez-vous pour continuer. » · primary « Se reconnecter » → `/connexion?next={path}&expire=1`.
- After login, forms restore from §7.2.
- Silent token refresh needs a backend endpoint (deferred).

### 7.6 Dialogs with forms

`DialogContent` gets `dirty?: boolean`. When dirty, outside click, Escape and the close button show an inline confirmation bar inside the dialog footer (« Abandonner les modifications ? » · « Garder » · « Abandonner »), with no stacked modal. `preventOutsideClose` stays for pending saves.

---

## 8. Sélecteur de date et d'heure (français)

**Library-free**, built from radix Popover + a small grid. It follows the WAI-ARIA APG « Date Picker Dialog » pattern.

- **Input:** text `jj/mm/aaaa` with auto-inserted slashes, digits only, `inputMode="numeric"`, placeholder « jj/mm/aaaa ». Parsing (`parseFrDate`) also accepts `j/m/aaaa`, `jj.mm.aaaa`, `jj-mm-aaaa` and ISO paste. Invalid entry shows an error on blur: « Date invalide (format jj/mm/aaaa) ».
- **Calendar button** (44 px, aria-label « Choisir une date »): popover with month title « février 2027 », prev/next month buttons, a grid with weeks starting **lundi**, day names « lun. mar. … », `aria-selected`, today marked, disabled days (`min`, `max`, `isDateDisabled`) announced « indisponible ». Keys: arrows (day/week), PageUp/PageDown (month), Shift+PageUp/Down (year), Home/End (week), Enter/Space select, Esc close with focus return. Today is computed in Africa/Tunis (`todayISO`).
- **Range:** two inputs + one popover. The first click sets start, the second sets end, and hover previews the range. Presets (chips, above the grid and inline under the inputs): « 1 semaine », « 2 semaines », « 1 mois », which set end from the chosen start (or from tomorrow if no start). Optional `unavailable(iso)` shades days and prevents a range that spans an unavailable day, with the message « Ce Porteur est déjà réservé du 14 au 20 sept. ».
- **Echo:** always visible under the field, `aria-live="polite"`, linked with `aria-describedby`: « du mercredi 10 février au mardi 16 février 2027 · 7 jours ». Invalid order shows the error « La date de fin doit suivre la date de début ».
- **Time:** `TimeRangeField` has two Selects (00:00 → 23:30, 30-min steps, 24 h labels « 09:00 »), optional day-part chips from `booking-plan` (« Journée 08:00–20:00 », etc., passed by the consumer), and the echo « de 09:00 à 18:00 · 9 h ».
- **Values:** strings `YYYY-MM-DD` and `HH:mm` (same as today). API conversion stays in `format.ts`.
- **Consumers:** wizard step 1 and `/modifier` (via `campaign-form-fields.tsx`), Studio `schedule-fields.tsx`, quick draft, emergency form, and any admin date filter.

---

## 9. Apparence (décision)

- The audit supports a light option (VD-10; design-reference §7.3 already specifies light tokens with AA ratios). Contrast **cannot be guaranteed today**: 50+ component files use literal `bg-white/x` / `bg-black/x` overlays, `--muted-2` is borderline (4.51:1) on the light `bg`, and MapLibre styles, three.js materials and charts are tuned for dark.
- **This round (Phase 1, F + all workstreams):**
  1. F adds overlay tokens `--overlay-subtle`, `--overlay-hover`, `--overlay-strong`, `--scrim`, plus `data-theme` plumbing (`<html data-theme="dark">` fixed, no toggle), and a **contrast unit test** that computes WCAG ratios for every ink × surface × status token in both the dark set and the §7.3 light set (light `--muted-2` adjusted to `#646b78` so it passes on `bg`).
  2. F replaces literal overlays in `ui` and `shell`. Each workstream replaces them in its owned files (acceptance: `rg "bg-(white|black)/" <owned paths>` returns nothing, except the player and marketing).
- **Phase 2 (deferred, §15):** light palette under `:root[data-theme="light"]`, dark sidebar kept, `.app-ground` radials off, « Apparence : Sombre / Clair / Système » in the account menu + Profil, pre-paint script in `layout.tsx`, MapLibre light basemap, chart tokens. **Ship gate:** the contrast test passes for light, grep shows zero literal overlays in app areas, and manual review covers the 13 app routes plus map, Studio and charts in light.

---

## 10. Performance visuelle

- Remove `backdrop-filter` from: dialog overlay (use `--scrim` `bg-black/70`), drawer overlay, topbar (opaque `bg-bg/95`), toasts, `.glass` usages in app components (→ `bg-surface-2/95 border-line`), map markers, labels, search, toolbar and panels (C), Studio sheet and explorer header (C).
- Stop infinite animations in app areas: the eyebrow dash pulse, any ambient loop. `prefers-reduced-motion` stays respected everywhere.
- Acceptance (manual, real GPU laptop, Chrome Performance panel with CPU 4× throttle): opening the moderation review dialog has INP < 200 ms; `/admin/reseau` renders the map and table < 3 s after data; panning the map shows no long frames > 50 ms caused by paint. Results are recorded in the PR description. Playwright is not required.

---

## 11. Composants : ajouts et modifications

Signatures are normative for consumers. Implementation details are free if the props hold.

### 11.1 `ui/button.tsx` / `button-classes.ts` (change)

```ts
interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "brand" | "outline"; // brand/outline: marketing only
  size?: "sm" | "md" | "lg";            // sm keeps 36 px visual, 44 px hit area below sm
  shape?: "control" | "pill";           // app default "control"
  /** Keeps the button focusable; click calls onDisabledClick instead of onClick. */
  disabledReason?: string;              // sets aria-disabled + aria-describedby to a visually hidden reason
  onDisabledClick?: () => void;         // e.g. scroll to and highlight the blocking message
  loading?: boolean;                    // existing behaviour if any; spinner + aria-busy
}
```

### 11.2 `ui/page-header.tsx` (change)

```ts
interface PageHeaderProps {
  title: ReactNode;
  meta?: ReactNode;                 // rendered immediately after the h1
  description?: ReactNode;
  eyebrow?: string;                 // only when meaningful
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;     // ≤ 2
  overflowActions?: readonly MenuAction[]; // MenuAction { label; onSelect | href; icon?; tone?: "danger"; disabled? }
  /** @deprecated use primaryAction/secondaryActions; still rendered after them. */
  actions?: ReactNode;
  /** Registers into the topbar trail inside AppShell; rendered inline only outside AppShell. */
  breadcrumbs?: readonly Breadcrumb[];
  back?: { href: string; label?: string }; // outside AppShell only
  className?: string;
}
```

### 11.3 New UI primitives (`src/components/ui`)

| Component | Props (essentials) | Notes |
|---|---|---|
| `DropdownMenu` (+ `MenuAction`) | `trigger`, `items: MenuAction[]`, `align?` | radix DropdownMenu; destructive items last |
| `Popover` | radix re-export + `PopoverContent` styled (no blur) | |
| `FilterBar` | `search?: { value; onChange; placeholder; shortcut?: boolean }`, `children` (filters), `sort?: { value; options: {value,label}[]; onChange }`, `resultCount?: string`, `activeCount: number`, `onReset(): void` | mobile bottom-sheet collapse |
| `DataTable` (change) | column: `sortable?: boolean`, `sortValue?: (row) => string \| number \| null`, `mobileMeta?: boolean`, `nowrap?: boolean`; table: `sort?: { key: string; dir: "asc" \| "desc" }`, `onSortChange?(s)`, `sortCaption?: string`, `rowActions?: (row) => ReactNode`, `emptyFiltered?: ReactNode` | uncontrolled sort if `onSortChange` absent; use `useTableSort` + `useUrlState` for URL |
| `Tabs` (change) | `TabsList` gets overflow fade + scroll-snap automatically; `TabsTrigger` `count?: number` | |
| `SectionCard` | `icon?: LucideIcon`, `title`, `description?`, `aside?`, `footer?`, `id?`, `as?: "section" \| "div"` | |
| `EstimateTag` | `rule?: string` (default glossary rule), `className?` | neutral outline + InfoTip; value helper `formatEstimate(n, unit)` → « ≈ 120 DT » |
| `StatusPill` (change) | `status: CampaignDisplayStatus`, `audience?: "annonceur" \| "staff"`, `showHint?: boolean` or existing `{label,tone}` | tones from §4.8 |
| `DateField` | `value: string`, `onChange(v: string)`, `min?`, `max?`, `isDateDisabled?(iso)`, `id?`, `name?` | inside `Field` |
| `DateRangeField` | `value: { start: string; end: string }`, `onChange(v)`, `min?`, `max?`, `presets?: false \| ("1w" \| "2w" \| "1m")[]`, `unavailable?(iso): boolean`, `unavailableMessage?(range): string`, `echo?: boolean = true`, `startLabel = "Début"`, `endLabel = "Fin"`, `errors?: { start?: string; end?: string }`, `disabled?`, `lockedReason?: string` | renders two Fields |
| `TimeRangeField` | `value: { start: string; end: string }`, `onChange`, `step?: 15 \| 30 = 30`, `dayParts?: { label; start; end }[]`, `echo?: boolean = true`, `errors?`, `disabled?` | |
| `ErrorSummary` | `errors: { fieldId: string; message: string }[]`, `title?` | focus management via ref |
| `DraftRestoreNotice` | `restoredAt: Date`, `onDiscard()` | |
| `AutosaveStatus` | `state`, `savedAt?`, `onRetry?` | `role="status"` |
| `Kbd` | `children`, `platform?: "auto"` | |
| `PartialNotice` | `message?`, `onRetry()` | |
| `LoadingRegion` (change) | `slow?: boolean` (or internal timers 4 s / 8 s), `onRetry?` | |
| `ErrorState` (change) | new category `slow`; `scope?: "page" \| "section"` (section = compact) | |
| `Dialog` (change) | `dirty?: boolean`, overlay without blur, `onRequestClose?` for guarded close | |
| `Toast` (change) | viewport: top below topbar on `< sm` (`top-[calc(68px+0.5rem)]`), bottom on `≥ sm` offset by `var(--toast-offset, 0px)` + `var(--bottom-bar-h, 0px)`; close button 44 px | `useStickyBarOffset(ref)` sets `--toast-offset` |
| `Field` (change) | error `<p>` without `role="alert"` | |

### 11.4 Shell (`src/components/shell`)

| Component / hook | Contract |
|---|---|
| `AppShell` | as today + BreadcrumbProvider, NavigationGuardProvider, CommandPaletteProvider, ShortcutsProvider, SessionExpiryBanner, SessionExpiredDialog, MobileTabBar, AccountMenu, HelpMenu, AccessNotice (`?acces=reserve`) |
| `useBreadcrumbs(items: Breadcrumb[])` | sets the trail for the current route; cleared on unmount |
| `useDocumentTitle(label: string \| null)` | |
| `CommandPalette` / `useCommandPalette()` → `{ open(query?) }` | |
| `useRegisterCommands(cmds: Command[], deps)` | `Command { id; label; group: string; keywords?: string[]; shortcut?: string[]; icon?; run(): void; href?: string }` |
| `ShortcutsDialog` / `useShortcut(keys: string, handler, opts?: { when?: () => boolean; description: string; section: string })` | registers into the sheet |
| `MobileTabBar` | `items` from `nav.ts` (`tab?: { label; order }`), hidden routes list |
| `NavBadge` counts | `useNavBadges(variant)` from the shared cache |
| `SessionExpiryBanner`, `SessionExpiredDialog` | §7.5 |

### 11.5 `src/lib` (new or changed)

| Module | Exports |
|---|---|
| `routes.ts` | §3.5 |
| `url-state.ts` | `useUrlState<T>(schema: { [k]: { parse(raw: string \| null): V; serialize(v: V): string \| null } }, opts?: { history?: "replace" \| "push" })` → `[state, setState(partial, { history? })]`; `useTableSort(param = "tri")` |
| `use-resource.ts` | + `revalidateOnFocus?: boolean = true`, `pollInterval?: number \| null`, `slowAfterMs = 8000` → `slow: boolean`, `lastUpdatedAt: Date \| null`, `cacheKey?`/`staleTime?` via `resource-cache.ts`; data kept during reload (already) |
| `resource-cache.ts` | module-level SWR cache `getCached/primeCache/invalidate(prefix)` with 30 s staleTime; used by palette, badges, B reservations N+1 |
| `api/errors.ts` | category `slow` for timeouts (title « Le service met trop de temps à répondre », Hourglass); `offline` only when offline; `retryable` flag |
| `api/client.ts` | one automatic retry with 800 ms backoff for idempotent GET on transport error/timeout (not for POST/PUT/DELETE) |
| `format.ts` | shared NBSP normaliser for all number formatters; `formatRelative(from, now)` « il y a 3 h », « dans 5 jours »; `formatDateRangeLong` for echoes; `formatCoordinatesFr` |
| `date-input.ts` | `parseFrDate`, `formatFrDateInput`, `addDays`, `presetRange`, `daysInclusive`, month grid builder (Monday-first) |
| `campaign-status.ts` | §4.8: tones, audience labels + hints, new `CAMPAIGN_FILTERS` with legacy mapping, `CAMPAIGN_BUCKETS` derived, `getCampaignTimeCue(c, today)` |
| `review-triggers.ts` | `detectReviewTriggers(text): { term: string; index: number }[]` for « gratuit », « garanti » (accent/case-insensitive, word forms gratuite(s)/garanti(e)(s)) |
| `network/availability.ts` | + `firstFreeWindow(slots, lengthDays, fromISO, horizonDays = 90)`, `isRangeFree(slots, start, end)`, `useSupportsAvailability(ids, from, to, { concurrency = 4 })` → `Map<id, { state: "loading" \| "free" \| "busy" \| "error"; slots }>` |
| `network/porteur.ts` | Porteur type tones → categorical tokens (no `danger`) |
| `session-deadline.ts` / hooks | `useSessionDeadline` |
| `forms/unsaved-guard.ts`, `forms/form-draft.ts`, `forms/autosave.ts` | §7 |
| `use-dismissible.ts` | `useDismissible(key)` → `[dismissed, dismiss]` (localStorage per user, try/catch) |
| `shortcuts.ts` | registry of global + map + Studio + moderation shortcut descriptions |

### 11.6 `src/content`

- `nav.ts`: `AppNavItem` + `group`, `badgeKey?`, `tab?`. Espace label « Réseau & Studio 3D ». Profil removed from `ESPACE_NAV` (kept in `ACCOUNT_NAV`).
- `glossary.ts`: §3.6 terms, reservation labels, estimate rule strings, support hours string.

### 11.7 Tokens (`globals.css`)

Status tokens (§4.8), violet set, categorical `--cat-1..4`, overlay tokens, type scale, `--muted-2` update, `--bottom-bar-h` / `--toast-offset` defaults, removal of the eyebrow infinite animation under `.app-ground` scopes (keep for marketing).

### 11.8 Documentation

`COMPONENTS.md` gains sections: page anatomy, button ladder, states recipes, status palette, date fields, form safety, URL state, palette/shortcuts registration. `tpub-brief.md` gains the glossary.

---

## 12. Écrans : changements et critères d'acceptation

Each item lists the finding IDs. « AC » = acceptance criteria (verifiable by targeted vitest/RTL or manual check on the local stack with the listed accounts).

### 12.F Shell, layouts, cross-cutting (Fondation)

1. **In-app 404 and errors** (IA-01, IA-02, FLOW-13, FFA-14, VD-14, VD-23). AC: `/espace/nimporte` and `/espace/campagnes/7/xyz` render the sidebar + h1 « Page introuvable » + 3 exits + search button. Same for `/admin/xyz` with admin exits. A thrown render error in an espace page shows ErrorState inside the shell with « Réessayer » (calls `reset`) and no link to `/`.
2. **Single trail + back control** (IA-03, IA-17, VD-09). AC: no page under `/espace` or `/admin` renders a `nav[aria-label="Fil d'Ariane"]` inside `main`. The topbar trail links every non-last segment. At 390 px on `/espace/campagnes/1`, a 44 px « ‹ Campagnes » control is present. Eyebrow dash animation is `animation: none` in app areas.
3. **Navigation groups, account menu, help menu, badges** (IA-18, IA-20, IA-21, IA-13 nav label). AC: Profil is only in the account menu. « Voir le site TPUB » opens in a new tab. With `demo@annonceur.tn`, Campagnes shows the draft count badge when > 0. With `admin@tpub.local`, Modération shows the same count as the overview hero. Badges hidden at 0.
4. **Mobile tab bar + drawer fix** (IA-11, IA-16, FFA-18). AC: at 390 px, 5 tabs visible on `/espace`, hidden on `/espace/reseau` and the wizard. All targets ≥ 44 px. The drawer badge is not overlapped at 320/390 px. The topbar create button is not shown on mobile.
5. **CTA rule** (IA-12). AC: the filled topbar CTA renders only on `/espace` and `/espace/campagnes`. It is `secondary` elsewhere on ≥ sm and absent in the wizard.
6. **Command palette + shortcuts** (IA-09, IA-21). AC: `Ctrl+K` opens the palette from any app page, including with focus in an input. Typing « marsa » lists the campaign « Ouverture boutique La Marsa » for demo, and Enter navigates. A Porteur result opens `/espace/reseau?porteur={id}`. `?` opens the sheet listing global + map + Studio sections. Single-key shortcuts don't fire in inputs. RTL tests cover filtering, keyboard selection and role scoping.
7. **Access notice + admin accent + read-only on mobile** (IA-24). AC: an annonceur visiting `/admin` lands on `/espace` with the info toast once and the param removed. The admin active pill is blue. The lock icon with aria-label appears at 390 px for SUPERVISEUR/OPERATEUR.
8. **Session expiry** (FFA-01). AC (unit + RTL with fake timers): banner at exp−10 min with the formatted time, `role="alert"` at exp−2 min; a 401 opens the non-dismissible dialog instead of navigating; with a dirty `useFormDraft` the dialog says saisies conservées; after reload the form shows `DraftRestoreNotice`.
9. **Honest slow/offline + retry + slow caption** (FLOW-12, FFA-04, VD-14). AC: a mocked timeout yields category `slow`, title « Le service met trop de temps à répondre », no WifiOff icon. `offline` only when `navigator.onLine=false`. A GET transport error retries once. `LoadingRegion` shows the slow caption at 4 s (fake timers).
10. **useResource freshness + shared cache** (FLOW-14 part, FFA-05 part). AC: tests prove revalidation on `visibilitychange` (throttled), polling start/stop, `lastUpdatedAt`, cache hit across two consumers within 30 s.
11. **Status palette + vocabulary + filters** (VD-01, VD-02 lib part, FLOW-19 lib part, VD-06 labels lib). AC: `campaign-status.test.ts` asserts no two lifecycle phases share a tone, every bucket tone equals its pill tone, annonceur labels for APPROVED_BY_AI/REVIEW_REQUIRED are both « En examen TPUB », legacy `?statut=` values map. The contrast test passes.
12. **Colour semantics** (VD-07 lib part). AC: Porteur type C tone is categorical. `rg "danger" src/lib/network/porteur.ts` returns no type mapping.
13. **Numbers & coordinates** (VD-04, VD-18 lib part). AC: `formatNumber(4000) === "4 000"` (NBSP), `formatCompact` normalised, `formatCoordinatesFr(36.8829, 10.3301)` → « 36,8829° N · 10,3301° E ».
14. **Blur removal in shared surfaces** (VD-03, FFA-15 shared part). AC: `rg "backdrop-blur|\.glass" src/components/{ui,shell}` returns nothing. Manual profiling note (§10).
15. **Buttons, type scale, contrast, touch** (VD-08, VD-17 tokens, FFA-17, FFA-18, FFA-19). AC: `disabledReason` renders `aria-disabled` + description; clicking calls `onDisabledClick`. `size="sm"` hit area ≥ 44 px below sm (computed style test on the pseudo-element class). Type tokens exist. `--muted-2` passes 4.5:1 on `surface-2`.
16. **Date/time fields** (FLOW-06, VD-22, FFA-20). AC: RTL: typing `10022027` gives value `2027-02-10` and echo « du mercredi 10 février … »; calendar keyboard navigation per APG; a range crossing an `unavailable` day is rejected with the message; presets set end; TimeRangeField lists 48 options in 24 h.
17. **Form safety primitives** (FLOW-07, FFA-07, FFA-12). AC: guard intercepts an internal link click when dirty and not when clean; `beforeunload` attached only when dirty; DialogContent with `dirty` shows the inline confirmation on Escape; `Field` error has no `role="alert"`; ErrorSummary focuses and links to fields.
18. **Toast placement** (FFA-11, FLOW-09 shared part). AC: at 390 px the toast viewport is anchored at the top below the topbar. On desktop with `--toast-offset: 88px` it sits above a sticky bar.
19. **Overlay tokens Phase 1** (VD-10 phase 1). AC: `rg "bg-(white|black)/" src/components/{ui,shell}` returns nothing; contrast test covers dark + light sets.
20. **Glossary + docs** (IA-15). AC: `src/content/glossary.ts` exists; COMPONENTS.md and tpub-brief.md updated.
21. **Test split** (enabler). `campaign-pages.test.tsx` split into `campaign-detail.test.tsx` and `campaign-wizard.test.tsx`, pure move, both green.

### 12.A1 Assistant de campagne — `/espace/campagnes/nouvelle`

1. **Header & chrome** (IA-04, FLOW-17, VD-09, VD-19, FFA-21). Before creation: h1 « Nouvelle campagne », trail « Campagnes › Nouvelle campagne ». With `id`: h1 = campaign name, meta « Brouillon · Étape 2 sur 3 », trail « Campagnes › {name} › Finaliser ». A compact sticky strip merges stepper and summary (name truncates with title; period and budget never truncate). The step description shows only on step 1. Ghost « Quitter l'assistant » → detail page (guarded if dirty). Below sm, the current and next step labels are visible (« Étape 2/3 · Porteurs → Vérification »). AC: at 1440×900 the first step control starts ≤ 280 px from the top; at 390 px the step heading is above the fold.
2. **3 steps** (FLOW-08). Steps: Détails · Porteurs · Vérification & envoi (optional collapsible « Aperçu du visuel (facultatif) » containing today's preview). `parseWizardStep` maps legacy `3`/`4` → 3. `campaign-actions.ts` `WIZARD_STEPS`, `maxReachableStep`, `wizardHref` delegate to `routes.espace.wizard`. AC: unit tests for the mapping and reachability; `?etape=4` of an existing draft opens Vérification.
3. **Step 1 fields** (FLOW-06, FLOW-05, FLOW-20, FFA-12, FLOW-07). Use `DateRangeField` (presets) + `TimeRangeField` (day parts). Objective: live `detectReviewTriggers` hint under the textarea next to the counter: « Le terme « gratuit » déclenche généralement un examen manuel ; précisez la condition (ex. « entrée gratuite pour les moins de 12 ans »). », tone info, never blocking. Budget edited on a draft with créneaux shows « Les estimations des créneaux déjà bloqués restent calculées sur l'ancien budget. ». ErrorSummary on submit. `useFormDraft("campaign:new")` before POST; `useAutosave` after the draft exists; `AutosaveStatus` near actions; navigation guard while dirty. AC: RTL: typing then clicking a sidebar link opens the guard; reload restores the typed values with the notice; 5 empty required fields produce one summary with 5 links and no field `role="alert"`.
4. **Locked period + « Changer de période »** (FLOW-01). When active créneaux exist, dates/times render read-only with the reason « La période est verrouillée : des Porteurs sont bloqués sur ces dates. » and a secondary « Changer de période… ». Dialog: new `DateRangeField`/`TimeRangeField` + per-Porteur availability pre-check for the new period (slots identical to this campaign's own créneaux are ignored) + consequence text « Nous créons une copie du brouillon sur la nouvelle période, supprimons l'actuel (ses créneaux sont libérés), puis re-bloquons les Porteurs disponibles. Les Porteurs indisponibles ne seront pas conservés. » + confirm « Changer la période ». Sequence: `duplicate(source, {dates})` → `remove(original)` → `reservationsApi.create` per available Porteur (concurrency 1–2) → navigate to `wizard(newId, "porteurs")` with a result summary Alert (« 3 Porteurs re-bloqués · 1 indisponible : {name} »). Failure rules: duplicate fails → nothing changed; delete fails → delete the duplicate, show error, stay; booking failures → listed in the summary. The conflict message « Choisissez d'autres dates » is replaced by « Ce Porteur est déjà réservé sur votre période » + « Changer de période… ». AC: unit test of the orchestration with mocked API for all three failure branches.
5. **Step 2 Porteurs, availability-first** (FLOW-02, FLOW-21, IA-13 wizard part, VD-23). All active zones' Porteurs are listed by default, grouped by zone with sticky zone headers; zone chips are filters with « Toutes » selected; a text filter « Rechercher un Porteur ou une rue » (name + address). Availability for the campaign period is fetched with `useSupportsAvailability`. Each card shows « Disponible sur votre période » or « Réservé du 14 sept. au 13 oct. » (disabled, sorted last), free first. Zone chip counts count free Porteurs, and zones with 0 active Porteurs are disabled chips « Aucun écran actif » at the end. Mobile: chips in one horizontal scroll row. Each card has a « Voir en 3D » link (`routes.espace.network({ porteur })`, new tab not required; guarded). « Capacité de diffusion : 6 » becomes « Jusqu'à 6 campagnes en rotation » or is hidden if unit is uncertain (decision: hide for advertisers). AC: RTL with mocked availability: busy card disabled with the date range, free cards first, chip counts correct.
6. **Booking on Continue** (FFA-02, FFA-03, FLOW-09, FLOW-20, FFA-17, FFA-11). The sticky bar renders only when ≥ 1 pending selection or ≥ 1 créneau exists (slide-up, reduced-motion aware); the scroll area gets matching bottom padding and `useStickyBarOffset`. Content: « 2 Porteurs sélectionnés · ≈ 240 DT (estimation provisoire, 10 % du budget par créneau) », consequence line « Bloquer verrouille la période de ce brouillon. Un créneau n'est pas libérable en ligne. », primary « Réserver 2 Porteurs et continuer » (or « Continuer » when nothing pending and ≥ 1 créneau). With 0 créneaux and 0 selection the button is `aria-disabled` with reason « Sélectionnez au moins un Porteur » and clicking scrolls/highlights the hint. On partial failure, stay on step 2, show per-Porteur results inline in the bar, no toast. Selected-not-booked cards show badge « À réserver »; booked cards « Bloqué · en attente de décision TPUB ». The separate « Bloquer le créneau » button and the booking toast are removed. Blocked list keeps a « Libérer ce créneau » link → mailto prefilled with campaign reference and reservation id. AC: RTL: selecting 2 and clicking the primary calls create twice then moves to step 3; one 409 keeps the user on step 2 with that Porteur flagged; no path reaches step 3 with pending unbooked selection.
7. **Map view** (FFA-10). `step-screens-map.tsx` grid gets `grid-cols-[minmax(0,1fr)]`; every `grid gap-*` without explicit columns in A1 files is audited. AC: at 390 px no element in `main` has `getBoundingClientRect().right > innerWidth` (RTL/jsdom layout can't prove it: manual check + existing `step-screens-map.test.tsx` updated for structure).
8. **Step 3 Vérification & envoi** (FLOW-05, FLOW-08, VD-16, FFA-13 submit part). Summary lines include « Termes à préciser : « gratuit » » when triggers exist. `EstimateTag` on cost and views. Single gate: checkbox + « Soumettre à la modération » (`aria-disabled` + reason until checked), the sentence « Après envoi, la campagne n'est plus modifiable. » next to it. Submit flow: navigation guard + `beforeunload` while submitting/analysing, 90 s client timeout on `checkContent`; on timeout show « L'analyse continue côté serveur ; retrouvez le résultat sur la page de la campagne dans quelques minutes. » + link to detail. AC: `use-submit-flow.test.ts` covers timeout branch; no ConfirmDialog in the submit path.
9. **Wizard Porteur dialog & availability strip** (VD-17 in owned files, FFA-18 text sizes). AC: no `text-[0.5rem|0.625rem|9px|6px]` in owned files.
10. **Overlay tokens + blur** (VD-10 phase 1, VD-03). AC: `rg "bg-(white|black)/|backdrop-blur" <A1 paths>` empty.

### 12.A2 Suivi des campagnes — `/espace/campagnes`, `/espace/campagnes/[id]`, `/modifier`

1. **List** (VD-02, FLOW-19, VD-24, FFA-23, VD-01, VD-13). Tabs per §4.8 with counts and overflow fade; `?statut=` and `?q=` keep working (legacy mapping from F), add `?tri=` (Début, Mise à jour, Nom). Rows: status pill (annonceur audience) + hint + time cue (« Diffusion dans 5 jours », « Soumise il y a 3 h » when a timestamp exists); StepSegments removed. Draft rows: primary row action « Finaliser » → `wizard(id, next step)`. AC: RTL: tab « Validées » includes a future ACTIVE campaign labelled « Programmée »; no « En diffusion » tab label exists.
2. **Detail header & actions** (IA-05, FFA-24, VD-20, IA-12). PageHeader: title + pill inline; drafts: primary « Finaliser » (→ wizard step 2 if no créneaux else 3), secondary « Modifier les détails » (→ wizard step 1), overflow « Dupliquer », « Supprimer » (danger, last). Non-draft editable statuses keep `/modifier`. Delete dialog: title « Supprimer « {name} » ? », description « {n} créneaux bloqués du {range} seront libérés. Action définitive. ». AC: for BROUILLON no link to `/modifier` exists; tab order primary → secondary → overflow.
3. **`/modifier` routing & form safety** (IA-05, FLOW-07, FFA-07, FFA-12, FFA-01). Server/client redirect BROUILLON → `wizard(id, "details")`. For allowed statuses: `DateRangeField` via shared form fields, guard, `useFormDraft("campaign:{id}:edit")`, ErrorSummary; autosave not used outside drafts (explicit « Enregistrer »). AC: RTL: dirty edit + sidebar link click → guard dialog.
4. **Status communication** (FLOW-14, FFA-13, VD-16). Status card: label + hint + time cue + support hours sentence while waiting; polling rules (§6.3) with « Mis à jour à HH:MM » + refresh button; PENDING_AI_CHECK empty state copy « Le résultat s'affiche ici dès qu'il est prêt (actualisation automatique pendant 2 minutes). » + inline « Relancer l'analyse » when allowed; stepper truth for future ACTIVE; « Prochaine étape » card (§6.5). AC: fake-timer test proves polling stops after 2 min and when hidden; copy no longer says « Vous serez informé ».
5. **Linked objects** (IA-06, IA-07 detail part, IA-13). `ReservationList`: Porteur name → `network({ porteur })` with visible « Voir en 3D » affordance, zone → `network({ zone })`, status labels from glossary, « Tout voir dans Réservations » → `reservations({ campagne: id })`. AC: links present with correct hrefs in RTL.
6. **Not found** (IA-23). h1 « Campagne introuvable », trail « Campagnes › Introuvable », message « Cette campagne n'existe pas ou n'appartient pas à votre espace. », 3 most recent campaigns from `/mine` + « Rechercher (⌘K) ». AC: RTL on unknown id.
7. **No AI report fetch for drafts** (FLOW-18, FFA-16). `loadAiReportState` short-circuits to `{ kind: "none" }` for BROUILLON. AC: unit test asserts `aiApi.report` not called.
8. **Section cards & estimate** (VD-20, VD-16, IA-15). Detail sections use `SectionCard`; estimate invoice labelled « Coût estimé des créneaux » + `EstimateTag`; `campaign-ui.tsx` `EstimateTag` re-exports the ui one; « Budget déclaré ». AC: grep no « Budget total » in owned files.
9. **Duplicate dialog** stays API-compatible (consumed by B). **Overlay tokens + blur** (VD-10 p1). AC: grep empty in owned paths.

### 12.B Pilotage annonceur — `/espace`, `/espace/reservations`, `/espace/statistiques`, `/espace/profil`, auth copy

1. **First-run dashboard** (FLOW-10, VD-11, IA-22, IA-13 onboarding copy). With 0 campaigns (`client@tpub.tn`): hero « Lancez votre première campagne » with primary « Créer ma première campagne » and secondary « Voir les Porteurs en 3D » (→ `/espace/reseau`); 3 milestones from real data only (Brouillon créé · Porteurs réservés · Soumise), progress « 0 sur 3 »; « Comment ça marche » 3 honest steps (Brouillon → analyse IA puis examen par l'équipe TPUB → diffusion sur la période validée) replacing the photo; non-counted link « Vérifier les informations de votre société » (→ profil). KPI tiles and Estimations card hidden until ≥ 1 campaign. « À faire » shows the next milestone instead of « Rien à faire ». Profile page copy: « Ce sont les informations transmises à TPUB pour examiner vos campagnes. Une correction ? Contactez votre interlocuteur. ». AC: RTL with empty `/mine`: no KPI tile, exactly one primary button, no « Rien à faire pour le moment ».
2. **Returning dashboard** (IA-14, VD-12, FLOW-16, VD-05, VD-19). Mobile order: greeting → À faire (if items) → Prochaines échéances → Campagnes récentes (3 on mobile, 5 on desktop, + « Toutes les campagnes ») → KPI strip (compact, ≤ 80 px tall, 3-up or horizontal scroll). « Prochaines échéances »: client-derived from `/mine` (starts within 7 days, ends within 7 days, drafts whose start is within 14 days), real dates only. Todo hrefs: reserve → `wizard(id,"porteurs")`, submit → `wizard(id,"verification")`, duplicate → opens `DuplicateCampaignDialog`, analysis → detail, blocked → detail. « Budget déclaré » label. AC: RTL: todo « Réserver des créneaux » href equals wizard step 2; at 390 px (DOM order) À faire precedes KPIs.
3. **Partial failure & N+1** (FFA-05, FLOW-12). `espace-data.ts`: add `loadCampaignsWithReservationsSettled` (Promise.allSettled per campaign, uses shared cache 30 s) returning `{ campaigns, reservationsByCampaign, failedCampaignIds }`; keep `loadCampaignsWithReservations` exported and unchanged for C. Dashboard/Réservations/Statistiques render campaigns as soon as `/mine` resolves; dependent tiles show `PartialNotice`. AC: RTL: one reservations call rejecting still renders campaign names and a « Données partielles » notice; the page ErrorState appears only when `/mine` fails.
4. **Réservations table** (IA-07, IA-06, VD-13, FFA-23, IA-15, VD-16). URL state `?statut=&campagne=&zone=&tri=` via `useUrlState`; FilterBar (mobile « Filtres (n) » sheet); DataTable sortable by Période (default: début croissant), Coût, Porteur, Statut, with caption; columns « Campagne », « Porteur » (link + « Voir en 3D »), « Zone » (link), « Période », « Statut » (glossary labels), « Coût estimé » (`EstimateTag`); mobile cards with status + cost on title line; explainer « Bloqué, puis confirmé » dismissible via `useDismissible`; KPI « Créneaux actifs ». AC: loading `/espace/reservations?campagne=1&statut=TEMPORAIRE` pre-filters; changing a filter updates the URL with replace; Back after navigation restores filters.
5. **Statistiques** (IA-07, VD-01, VD-05, VD-15, VD-19). Status breakdown rows are links (buckets → `campaigns({ statut })`, reservation statuses → `reservations({ statut })`); donut/legend tones from `CAMPAIGN_BUCKETS`; « Budget déclaré » then « Coût estimé des créneaux » with one-line definitions; « Budget consommé » tile replaced by the note; chart labels line-clamp-2 with title; « Preuve de diffusion » card copy per §6.8 with contact link. AC: RTL: « En examen » legend row href `/espace/campagnes?statut=en-examen`; no « Budget estimé » string.
6. **Auth panel copy** (VD-15). `/connexion`, `/inscription` side panel bullet becomes « Journal de diffusion par campagne — mise en service progressive ». AC: grep « Recevez la preuve » returns nothing in `src/app/(auth)`, `src/components/auth`.
7. **Overlay tokens + blur + type sizes** in owned files (VD-10 p1, VD-17). AC: grep empty for overlays; no text < 12 px in charts.

### 12.C Réseau & Studio 3D — `/espace/reseau`

1. **Studio discoverability** (IA-13, VD-18). Porteur list rows: explicit « 3D » icon button (tooltip « Ouvrir le Studio 3D », 44 px on mobile) next to locate and add; secondary line « {zone} · {address} » truncated with title; coordinates removed from annonceur rows (kept in Studio with « Copier les coordonnées »), French formatter where displayed. First visit: dismissible hint « Touchez un Porteur pour le voir en 3D et le réserver » (`useDismissible("hint:studio")`). AC: RTL: each row has a button with accessible name « Ouvrir le Studio 3D : {name} ».
2. **History semantics** (IA-08). `use-explorer-url-state.ts`: `porteur` null→id uses push; closing a Studio opened in this session uses `router.back()`; Escape, X and Back share one close path; other params keep replace. AC: unit test on the policy function (`explorer-url-state.test.ts`): open → push, close-after-open → back, deep-link close → replace.
3. **Campaign-first booking** (FLOW-03, FFA-08, FFA-03). Configurator order « 01 Campagne » → « 02 Créneau »; choosing a draft applies its period (`scheduleFromCampaign`) and locks it with reason « Période de la campagne » (+ « Réserver hors période » requires an explicit checkbox acknowledgement, copy: « Le créneau ne correspondra pas à la période de la campagne. »); with no campaign, default slot = `firstFreeWindow` of 7 days; conflicts show `role="alert"` only after user change, before that a neutral note « Prochaine disponibilité : 14 oct. → 20 oct. » + « Utiliser ces dates »; « Réserver ce Porteur » is `aria-disabled` with reason (« Choisissez une campagne ») until campaign + free slot; label includes scope « Réserver ce Porteur · 10–16 févr. »; consequence line « Non libérable en ligne. »; success shown inline in the footer (no toast); « Prochain créneau libre » jump on the 60-day strip; `DateRangeField`/`TimeRangeField` in `schedule-fields.tsx`. AC: `porteur-configurator.test.tsx`: opening with a conflicting default no longer renders an alert; selecting a campaign sets its dates; button click without campaign focuses the campaign section.
4. **Quick draft form** (FLOW-05, FLOW-06, FLOW-07, FFA-01). Objective trigger hint, date fields, `useFormDraft("network:quick-draft")`, guard. AC: RTL hint appears for « entrée gratuite ».
5. **Mobile Studio** (FFA-09, FFA-22, FFA-18). Below md: canvas `touch-action: pan-y` until tapped (overlay « Toucher pour explorer en 3D », then « Terminer » chip restores pan); preview capped at 38vh and collapses to an 80 px thumbnail after scrolling past; sticky footer = CTA + consequence line only (summary + explainer move into section 02); explainer text ≥ 12 px. Selection toggle: stable label « Ajouter à la sélection » with `aria-pressed` and checked visual (no label swap). AC: RTL: canvas container has `touch-action: pan-y` initially at mobile breakpoint (class assertion).
6. **Blur & tokens over WebGL** (VD-03, FFA-15, VD-07, VD-08). Map markers, labels, search, toolbar, panels, studio sheet, explorer header: opaque tokens, no `backdrop-filter`; markers use categorical tokens for Porteur types; « Ajouter à la sélection » is `secondary`. AC: `rg "backdrop-blur|glass" src/components/{map,network,porteur3d}` empty; manual profiling note.
7. **Mobile bottom bars** (IA-11 réseau part). The explorer floating bar respects `env(safe-area-inset-bottom)` and publishes `--toast-offset`. AC: at 390 px no double bottom bar (manual).
8. **Overlay tokens + type sizes** (VD-10 p1, VD-17). AC: grep empty in owned paths.

### 12.D Back-office — `/admin`, `/admin/moderation`, `/admin/reseau`, `/admin/urgences`

1. **Moderation URL state** (IA-10, VD-13). `?onglet=a-traiter|revue|ia|toutes`, `?q=` (replace), `?tri=` (Début le plus proche | Attente la plus longue, default attente), `?examen={id}` (push; closing = back or replace). AC: `moderation-view.test.tsx`: initial URL with `examen=3` opens the dialog on #3; closing removes the param.
2. **Queue table** (FLOW-11, FLOW-04, VD-21, VD-13, VD-06). Columns: Campagne (#id + name), Annonceur « Annonceur n° {clientId} », Début (« dans 2 j », warning tone < 3 days, danger if past), Avis IA pill named after the tab (« Avis IA favorable » / « Revue manuelle »), Soumise, action « Examiner » (`secondary`; row name is a link to `?examen=`). Sort caption. « À traiter »: row checkboxes + « Valider la sélection (n) » enabled only for APPROVED_BY_AI with ≥ 1 active créneau, sequential `adminApi.validate`, result summary Alert (« 3 validées · 1 échec : #5 — Réessayer »), confirm dialog listing ids (public impact). Permissions: hidden for read-only roles. AC: RTL: selection of a REVIEW_REQUIRED row is not possible; summary counts after mocked partial failure.
3. **Review dialog throughput** (FLOW-11, FLOW-04, IA-06 admin part, VD-23, VD-16). Header shows « Annonceur n° {clientId} » and reference `CAMP-000xx`; decision inline in the footer (Valider primary; Refuser reveals the reason textarea with preset chips « Allégation « gratuit » non justifiée », « Objectif trop vague », « Période incohérente », « Visuel ou texte non conforme »), no nested modal except the existing WILL_NOT_AIR warning which becomes an inline Alert; after a decision, load the next campaign of the current tab (« Campagne suivante · 2 restantes ») or show « File traitée » with close; keys J/K/V/R/Esc registered with `useShortcut` and shown in a footer hint; after refusal, « Copier le message pour l'annonceur » (clipboard, French template with reference, reason, next step « Dupliquer et corriger »); reservation rows link Porteur → `routes.admin.network({ onglet: "ecrans", porteur })`; « Score de risque » without duplicated « /100 »; `EstimateTag` on estimated views. AC: RTL: pressing V on a validatable campaign calls validate once and advances to the next id; R focuses the reason textarea; copy button writes a string containing the reason.
4. **Overview** (IA-19, VD-06, VD-21, VD-05, VD-23, IA-10). One primary « Traiter la file (N) »; hero « À décider par TPUB » = APPROVED_BY_AI + REVIEW_REQUIRED from the campaigns list, broken down « 1 avis IA favorable · 1 revue manuelle »; stat card « Analyse IA en attente » derived from the same list; « À surveiller » panel replaces the illustration: coherence issues → `network({ onglet: "ecrans", panneau: "coherence" })`, Porteurs en maintenance / hors ligne, messages prioritaires actifs → `/admin/urgences`; « Lecteur de démonstration » becomes a secondary link; queue rows are Links to `?examen=`; uniform 4-col grid on xl, zero cards dimmed, no « 01/02 » kickers; labels « Budget déclaré », « Validées (programmées ou en diffusion) », « Porteurs actifs » (no quoted enums). AC: RTL: hero and card numbers are consistent for the fixture; queue row href contains `examen=`.
5. **Emergency messages** (FLOW-15, FFA-06, FFA-07, VD-07, FLOW-06, FLOW-07). Zone multi-select with « Toutes les zones »; Contenu détaillé optional in UI (defaults to the title on submit, backend requires non-blank) with note « Pas encore affiché sur les écrans »; priority as segmented « Normale / Passe en premier » mapped to the existing numeric field; title counter recommending ≤ 60 characters; `DateRangeField`/`TimeRangeField` (note: players ignore times, §5.9, stated in hint); impact line from supports « Visible sur {n} Porteurs actifs à {zones}, dès aujourd'hui »; submit (`primary`, siren icon) leads to an in-dialog review step « Confirmer la diffusion » with full-size preview and a warning Alert when start = today; sequential POST per zone with per-zone result; success toast action « Vérifier sur un écran » → `/ecran/{supportId}` new tab; `DialogContent dirty` + `useFormDraft("admin:emergency:new")`. AC: RTL: selecting 2 zones posts twice after confirm; Escape with typed title shows the inline discard confirmation.
6. **Zone & Porteur dialogs, network admin** (FFA-07, VD-07, VD-23, FFA-01). `dirty` on dialogs, drafts restore, KPI value colours neutral at 0, « Porteurs actifs » wording. AC: Escape on a dirty zone dialog doesn't discard.
7. **Overlay tokens + blur + type sizes** (VD-10 p1, VD-03, VD-17). AC: grep empty in owned paths.

---

## 13. Découpage du travail

### 13.1 Packages et chemins possédés (strictly disjoint)

| Package | Owned paths |
|---|---|
| F | `src/components/ui/**`, `src/components/shell/**`, `src/lib/**`, `src/content/**`, `src/app/globals.css`, `src/app/layout.tsx`, `src/middleware.ts`, `src/app/espace/layout.tsx`, `src/app/espace/not-found.tsx`, `src/app/espace/error.tsx`, `src/app/espace/[...rest]/**`, `src/app/admin/layout.tsx`, `src/app/admin/not-found.tsx`, `src/app/admin/error.tsx`, `src/app/admin/[...rest]/**`, `docs/COMPONENTS.md`, `docs/tpub-brief.md`, `src/components/campaign/__tests__/campaign-pages.test.tsx` (split then deleted) |
| A1 | `src/components/campaign/{campaign-wizard,step-details,step-screens,step-screens-map,step-creative,step-review,wizard-chrome,wizard-porteur-dialog,availability-strip,ai-analysis,creative-dropzone,screen-mockup,campaign-form-fields}.tsx`, `src/components/campaign/{use-submit-flow,creative-store,campaign-schema,campaign-actions}.ts`, `src/components/campaign/__tests__/{campaign-wizard.test.tsx,step-screens-map.test.tsx,use-submit-flow.test.ts,campaign-actions.test.ts,campaign-schema.test.ts}`, `src/app/espace/campagnes/nouvelle/**` |
| A2 | `src/components/campaign/{campaign-list,campaign-detail,campaign-edit,campaign-ui,reservation-list,duplicate-campaign-dialog,estimate-invoice}.tsx`, `src/components/campaign/{campaign-list-model,campaign-data}.ts`, `src/components/campaign/__tests__/{campaign-detail.test.tsx,campaign-data.test.ts,campaign-ui.test.tsx}`, `src/app/espace/campagnes/page.tsx`, `src/app/espace/campagnes/[id]/**` |
| B | `src/components/espace/**`, `src/app/espace/page.tsx`, `src/app/espace/reservations/**`, `src/app/espace/statistiques/**`, `src/app/espace/profil/**`, `src/app/(auth)/**`, `src/components/auth/**` |
| C | `src/components/network/**`, `src/components/map/**`, `src/components/porteur3d/**`, `src/app/espace/reseau/**` |
| D | `src/components/admin/**`, `src/app/admin/page.tsx`, `src/app/admin/moderation/**`, `src/app/admin/reseau/**`, `src/app/admin/urgences/**` |

Not owned by anyone this round: marketing (`src/components/{marketing,home,offer,story,contact,brand}`, `src/app/(marketing)`), player (`src/components/player`, `src/app/ecran`), root `not-found.tsx`/`error.tsx`/`global-error.tsx`. The docs `SPEC.md`, `api-contract.md`, `NETWORK-MAP-SPEC.md`, `PORTEUR-3D.md` and `UX-PLAN.md` are read-only for packages.

### 13.2 Contrats gelés par F (consumers rely on them)

`routes.ts` (§3.5), `useUrlState`/`useTableSort`, `PageHeader` props (§11.2), `Button.disabledReason`, `DataTable` sort/rowActions props, `FilterBar`, `SectionCard`, `EstimateTag`, `StatusPill` audience, `campaign-status.ts` labels/filters/tones/time cue, `DateField`/`DateRangeField`/`TimeRangeField`, `ErrorSummary`, `DraftRestoreNotice`, `AutosaveStatus`, `useUnsavedChangesGuard`, `useFormDraft`, `useAutosave`, `DialogContent.dirty`, `useBreadcrumbs`, `useDocumentTitle`, `useRegisterCommands`, `useShortcut`, `useStickyBarOffset`, `useResource` new options, `resource-cache`, `useSupportsAvailability`/`firstFreeWindow`/`isRangeFree`, `detectReviewTriggers`, `useDismissible`, `formatRelative`/`formatCoordinatesFr`, glossary, overlay/status/categorical/type tokens.

### 13.3 Contrats inter-workstreams (existing exports that must stay compatible)

- A1 keeps exports of `campaign-schema.ts` (used by C `campaign-picker`) and `creative-store.ts` (used by C `explorer-side-panel`), and `wizardHref(id, step)` keeps accepting numbers (1–3, legacy 4→3) for B and A2.
- A2 keeps `ReservationList`, `DuplicateCampaignDialog`, `loadScreenCatalogue`, `joinReservations`, `sumEstimatedCost`, `activeReservations` signatures (used by A1, B, C).
- B keeps `loadCampaignsWithReservations` (used by C `network-explorer`) and `NetworkView` export (used by D `network-admin-view` and `/admin/reseau`).
- New cross-package helpers go to F only. If a workstream needs a shared change, it records it in its hand-off notes for the integration pass instead of editing another package's path.

### 13.4 Séquencement et intégration

1. F implements and merges. It runs `vitest` on `src/components/ui`, `src/components/shell`, `src/lib`, the split campaign tests, and `tsc --noEmit` once at the end, plus eslint on changed files.
2. A1, A2, B, C, D run in parallel. Each runs targeted vitest on its tests, eslint on changed files, and one `tsc --noEmit` at the end. No `next build`, no playwright, no `npm install`.
3. Integration pass (lead): full `npm run check`, then a production restart via `start-local.ps1` and a manual walkthrough with the three accounts at 1440 and 390 px against the AC lists. Then GPU profiling (§10) and Phase 2 appearance decision.

---

## 14. Traçabilité des findings

| ID | Sev. | Package(s) | Plan section |
|---|---|---|---|
| IA-01 | critical | F | 3.4, 12.F.1 |
| IA-02 | major | F | 3.4, 12.F.1 |
| IA-03 | major | F (+ all remove area eyebrows) | 3.3, 12.F.2 |
| IA-04 | major | A1 | 12.A1.1 |
| IA-05 | major | A2 | 12.A2.2–3 |
| IA-06 | major | A2, B, D | 12.A2.5, 12.B.4, 12.D.3 |
| IA-07 | major | B, A2 | 12.B.4–5, 12.A2.5 |
| IA-08 | major | C | 12.C.2 |
| IA-09 | major | F | 5.1, 12.F.6 |
| IA-10 | major | D (+F routes/palette) | 12.D.1, 12.D.4 |
| IA-11 | major | F (+C réseau bar) | 3.2, 12.F.4, 12.C.7 |
| IA-12 | major | F | 2, 12.F.5 |
| IA-13 | major | C (+F nav label, B onboarding, A1/A2 links) | 12.C.1 |
| IA-14 | major | B | 12.B.2 |
| IA-15 | major | F (+ all apply) | 3.6, 12.F.20 |
| IA-16 | minor | F | 12.F.4 |
| IA-17 | minor | F | 3.2, 12.F.2 |
| IA-18 | minor | F | 3.2, 12.F.3 |
| IA-19 | minor | D | 12.D.4 |
| IA-20 | minor | F | 3.1, 12.F.3 |
| IA-21 | minor | F | 5.2, 12.F.3 |
| IA-22 | minor | B (backend part deferred) | 12.B.1, 15 |
| IA-23 | minor | A2 | 12.A2.6 |
| IA-24 | minor | F | 3.4, 12.F.7 |
| FLOW-01 | critical | A1 (backend part deferred) | 12.A1.4, 12.A1.6, 15 |
| FLOW-02 | critical | A1 (+F availability hook) | 12.A1.5 |
| FLOW-03 | critical | C | 12.C.3 |
| FLOW-04 | critical | D (backend part deferred) | 12.D.2–3, 15 |
| FLOW-05 | major | A1, C (+F detector) | 12.A1.3, 12.A1.8, 12.C.4 |
| FLOW-06 | major | F (+A1, A2, C, D adopt) | 8, 12.F.16 |
| FLOW-07 | major | F (+A1, A2, C, D adopt) | 7, 12.F.17 |
| FLOW-08 | major | A1 | 2, 12.A1.2, 12.A1.6, 12.A1.8 |
| FLOW-09 | major | A1 (+F toast offset) | 12.A1.6, 12.F.18 |
| FLOW-10 | major | B | 12.B.1 |
| FLOW-11 | major | D (+F blur) | 12.D.2–3 |
| FLOW-12 | major | F, B (backend nice-to-have deferred) | 12.F.9, 12.B.3 |
| FLOW-13 | major | F | 12.F.1 |
| FLOW-14 | major | F, A2 | 6, 12.F.10, 12.A2.4 |
| FLOW-15 | major | D | 12.D.5 |
| FLOW-16 | minor | B | 12.B.2 |
| FLOW-17 | minor | A1 (+F trail) | 12.A1.1 |
| FLOW-18 | minor | A2 | 12.A2.7 |
| FLOW-19 | minor | F, A2 | 4.8, 12.A2.1 |
| FLOW-20 | minor | A1 | 12.A1.3, 12.A1.6 |
| FLOW-21 | minor | A1 | 12.A1.5 |
| VD-01 | critical | F (+A2, B consume) | 4.8, 12.F.11 |
| VD-02 | critical | F, A2, B, D | 4.8, 12.A2.1, 12.B.5, 12.D.4 |
| VD-03 | critical | F, C (+A1, B, D grep) | 10, 12.F.14, 12.C.6 |
| VD-04 | major | F | 12.F.13 |
| VD-05 | major | F glossary, B, D | 3.6, 12.B.2, 12.B.5, 12.D.4 |
| VD-06 | major | D | 12.D.4 |
| VD-07 | major | F, C, D | 4.8, 12.F.12, 12.C.6, 12.D.5–6 |
| VD-08 | major | F (+C, D apply) | 4.7, 12.F.15 |
| VD-09 | major | F (+ all) | 2, 12.F.2, 12.A1.1 |
| VD-10 | major | F + all (phase 1); phase 2 deferred | 9, 12.F.19, 15 |
| VD-11 | major | B | 12.B.1 |
| VD-12 | major | B | 12.B.2 |
| VD-13 | major | F, B, D | 4.4, 12.B.4, 12.D.1–2 |
| VD-14 | major | F | 4.6, 12.F.1, 12.F.9 |
| VD-15 | major | B (backend part deferred) | 6.8, 12.B.5–6, 15 |
| VD-16 | minor | F (+A1, A2, B, D) | 11.3, 12.A1.8, 12.A2.8 |
| VD-17 | minor | F tokens, all in touched files (full codemod deferred) | 4.9, 12.F.15, 15 |
| VD-18 | minor | C, F | 12.C.1, 12.F.13 |
| VD-19 | minor | A1, B, F | 12.A1.1, 12.B.5, 3.2 |
| VD-20 | minor | F, A2 | 4.2, 4.5, 12.A2.2 |
| VD-21 | minor | D | 12.D.2, 12.D.4 |
| VD-22 | minor | F | 8, 12.F.16 |
| VD-23 | minor | D, A1, F | 12.D.3–4, 12.A1.5, 12.F.1 |
| VD-24 | minor | A2 | 12.A2.1 |
| FFA-01 | critical | F (+A1, A2, C, D restore) | 7.5, 12.F.8 |
| FFA-02 | critical | A1 | 2, 12.A1.6 |
| FFA-03 | major | A1, C (backend undo deferred) | 12.A1.6, 12.C.3, 15 |
| FFA-04 | major | F | 12.F.9 |
| FFA-05 | major | B, F (backend nice-to-have deferred) | 12.B.3, 12.F.10 |
| FFA-06 | major | D | 12.D.5 |
| FFA-07 | major | F, D, A2 | 7.6, 12.D.5–6, 12.A2.3 |
| FFA-08 | major | C (+F firstFreeWindow) | 12.C.3 |
| FFA-09 | major | C | 12.C.5 |
| FFA-10 | major | A1, C | 12.A1.7, 12.C.1 |
| FFA-11 | major | F, A1, C | 12.F.18, 12.A1.6, 12.C.3 |
| FFA-12 | major | F (+A1, A2, D) | 7.4, 12.F.17 |
| FFA-13 | major | A2, A1 | 12.A2.4, 12.A1.8 |
| FFA-14 | major | F | 12.F.1 |
| FFA-15 | major | F, C (manual profiling) | 10, 12.C.6 |
| FFA-16 | minor | A2 | 12.A2.7 |
| FFA-17 | minor | F, A1, C | 11.1, 12.A1.6, 12.C.3 |
| FFA-18 | minor | F, C | 12.F.15, 12.C.5 |
| FFA-19 | minor | F | 4.9, 12.F.15 |
| FFA-20 | minor | F | 8 |
| FFA-21 | minor | A1 | 12.A1.1 |
| FFA-22 | minor | C | 12.C.5 |
| FFA-23 | minor | F, B, A2 | 4.3, 12.B.4, 12.A2.1 |
| FFA-24 | minor | A2 | 12.A2.2 |

---

## 15. Différé

| Item | Findings | Reason |
|---|---|---|
| `DELETE /api/reservations/{id}` (or PATCH dates) while BROUILLON; real « Libérer ce créneau » and in-place period change | FLOW-01 #4, FFA-03 | **Backend change required** (§7.7, no endpoint). Frontend ships consequence labels, mailto release request and the duplicate → delete → rebook « Changer de période » workaround. |
| Advertiser identity (`clientName`, `clientEmail`) in admin payload; latest rejection reason on `GET /api/campaigns/{id}` shown to the advertiser | FLOW-04 | **Backend change required** (§7.5, §7.9). Frontend ships `clientId`, message template and reason presets. |
| `GET /api/reservations/mine` to remove the N+1 | FLOW-12, FFA-05 | **Backend nice-to-have**. Frontend ships allSettled + 30 s cache + partial rendering. |
| Per-campaign diffusion log endpoint and « Diffusions journalisées » table | VD-15 | **Backend change required** (§5.10). Frontend ships honest roadmap copy. |
| Profile update endpoint; « Compléter le profil » wording | IA-22 | **Backend change required** (§7.4). Frontend ships « Vérifier les informations ». |
| Silent token refresh | FFA-01 | **Backend change required** (no refresh endpoint, §1.3). Frontend ships warning + draft preservation. |
| Server-side search endpoint for the palette | IA-09 | Not needed at current volumes (api-contract §7.10). Revisit when an account has > 500 campaigns or the network > 2 000 Porteurs. |
| REVIEW_REQUIRED validated by admin never airs | FLOW-05 context, §7.14 | **Backend bug**. Frontend keeps the existing WILL_NOT_AIR warning (now inline) and adds the pre-submit trigger hint. |
| Light / system appearance toggle (Phase 2) | VD-10 | Contrast can only be guaranteed after all packages remove literal overlays and after MapLibre, three.js and chart colours are verified in light. Shipping a toggle before the gate (§9) would break the « contrast guaranteed » requirement. Phase 1 prerequisites ship now. |
| Repository-wide type-scale codemod + ESLint rule against arbitrary `text-[…]` | VD-17 | Minor severity. A codemod across ~370 occurrences in parallel packages causes merge churn. Tokens ship in F; packages fix sizes < 12 px and touched components; the codemod + lint run after integration. |
| Wizard route move to `/espace/campagnes/{id}/finaliser` | IA-04 (optional part) | Churn without user value beyond the trail/title fix already planned. Revisit if analytics show shared wizard links. |
| Real-GPU profiling automation | VD-03, FFA-15 | Requires hardware/playwright runs excluded on this machine. Manual profiling is an integration acceptance step (§10). |
