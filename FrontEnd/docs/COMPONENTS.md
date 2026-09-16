# TPUB shared components — builder reference (UX foundation)

Read this instead of the source. Imports use barrels: `@/components/ui`, `@/components/marketing`,
`@/components/shell`, `@/lib/api`. All UI text is French. No literal colours in pages: use the
token utilities below. Server components by default; the listed "client" components are already
`"use client"` — you can render them from server pages.

---

## 1. Token utilities (Tailwind v4, `src/app/globals.css`)

The default Tailwind palette is **deleted** (`bg-red-500` compiles to nothing). Available colours
(all usable as `bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, with opacity `/12` etc.):

| Group | Names |
|---|---|
| Ground | `bg`, `bg-2`, `surface`, `surface-2`, `surface-3`, `scrim` |
| Lines | `line`, `line-strong` |
| Text | `ink-strong` (headings), `ink` (body), `ink-soft` (lead), `muted`, `muted-2` (captions) |
| Brand fills | `brand-red`, `brand-red-600`, `brand-orange`, `brand-blue`, `brand-blue-600` |
| Brand text on dark | `brand-red-text`, `brand-orange-text`, `brand-blue-text` (links/focus) |
| Tints | `red-soft`/`red-line`, `orange-soft`/`orange-line`, `blue-soft`/`blue-line` |
| Feedback | `success`, `warning`, `danger`, `info` (use `bg-success/12 border-success/30`) |
| Violet (« Programmée ») | `violet`, `violet-text`, `violet-soft`, `violet-line` |
| Status inks (§6) | `status-draft`, `status-pending`, `status-scheduled`, `status-live`, `status-ended`, `status-problem` |
| Categorical (non-status series, Porteur types A–D) | `cat-1` (orange), `cat-2` (blue), `cat-3` (violet-grey), `cat-4` (teal) |
| Overlays (replace `bg-white/x` / `bg-black/x`) | `overlay-subtle` (3 %), `overlay-hover` (6 %), `overlay-strong` (10 %), `overlay-inset` (dark well), `scrim` (dialog backdrop) |
| Ink on fills | `on-brand` (white on red/blue), `on-orange` (dark ink on orange — never white on orange) |
| Misc | `white`, `black`, `transparent`, `current` — **never** as translucent overlays in `/espace` and `/admin` |

`<html data-theme="dark">` is fixed (phase 1, no toggle). The light palette lives in
`src/lib/contrast.ts` (`LIGHT_THEME_TOKENS`) until phase 2; `src/lib/__tests__/contrast.test.ts`
asserts ≥ 4.5:1 for every text/status ink × surface in both sets. `--muted-2` is `#8e95a2`.

Examples: `bg-bg text-ink`, `text-brand-orange-text`, `border-line`, `bg-orange-soft`, `text-danger`.

Other theme tokens:
- Fonts: `font-display` (Sora, headings), `font-label` (Sora, labels/buttons), `font-sans` (Inter, body; default).
- Type scale: `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-lead` (each sets size + line-height + tracking + weight). Tailwind defaults (`text-sm`…) still exist.
  App scale (UX-PLAN §4.9): `text-caption` 12px, `text-label` 13px, `text-body` 15px, `text-title` 17px, `text-h3` 20px, `text-h2` 24px, `text-h1` 32px (26px below sm). Inside `.app-ground` (app shells, auth) `h1/h2/h3/label` are re-scoped to these values; marketing keeps its display clamps. Readable text ≥ 12px.
- Layout CSS vars: `--topbar-h` 68px, `--bottom-bar-h` (set by the mobile tab bar, else 0px), `--toast-offset` (set by `useStickyBarOffset`, else 0px).
- `hit-area` utility: invisible 44×44 target below sm without changing the visual size (Button `size="sm"`, small text buttons).
- Radius: `rounded-control` (12px inputs/buttons), `rounded-card` (18px), `rounded-panel` (26px), `rounded-full`.
- Shadows: `shadow-card`, `shadow-lift`, `shadow-brand` (orange glow), `shadow-blue`.
- Easing: `ease-smooth` (hover), `ease-expo` (reveals), `ease-spring`.
- Spacing: `min-h-touch` / `size-touch` (44px). CSS vars: `var(--header-h)` 72px, `var(--sidebar-w)` 264px → `h-(--header-h)`.
- Z-index vars: `z-(--z-sticky)`, `z-(--z-header)`, `z-(--z-modal)`, `z-(--z-toast)`.
- Breakpoints: `sm` 640, `md` 768, **`lg` 1040**, **`xl` 1240**. Mobile-first; avoid `max-*:` variants.
- Animations: `animate-sheen`, `animate-pulse-dot`, `animate-fade-in`, `animate-panel-in`, `animate-drawer-in`, `animate-ken-burns`.

Custom utilities / classes:

| Class | Effect |
|---|---|
| `container-site` / `container-narrow` | 1240px / 820px centred container with fluid gutters |
| `section-y` / `section-y-tight` | vertical section rhythm |
| `eyebrow` (+ `eyebrow-plain` no dash, `eyebrow-pill` hero pill) | uppercase .22em Sora label with red→orange dash (static inside `.app-ground`; use in app pages only when it adds meaning, e.g. « CAMP-00007 ») |
| `text-gradient` | animated red→orange sheen text (use on the 2nd half of a headline only) |
| `bg-grad-brand`, `bg-grad-card`, `bg-scrim-v`, `bg-scrim-side` | brand CTA gradient, card gradient, hero scrim, 110° side scrim |
| `glass`, `glass-light` | frosted surface (surface 58% + blur 14) / light glass over imagery — **marketing only**; no `backdrop-filter` in `/espace`, `/admin`, ui or shell (VD-03) |
| `glass-card` (+ `data-interactive="true"`) | glass card with hover lift + gradient border |
| `border-glow` | gradient border revealed on hover/focus-within |
| `hairline`, `hairline-tricolor` | 1px dividers (tricolor = the only place red+orange+blue meet) |
| `pixel-grid` | LED dot grid (put on an absolute overlay, `opacity-40 mix-blend-overlay`) |
| `pulse-dot` | pulsing dot in `currentColor` |
| `underline-slide` | gradient underline sliding in on hover |
| `btn-sheen` | diagonal light sweep on hover |
| `tabular` | tabular numbers |
| `aurora` | drifting orange/blue background (marketing layout root) |
| `app-ground` | static glow ground (app shells, auth) |
| `image-frame` | overflow/border + slow zoom on hover (used by ImageFrame) |
| `ken-burns` | slow ambient zoom |
| `enter`, `enter-1..4` | CSS-only entrance (no JS needed; use above the fold) — or `style={{"--enter-delay": "200ms"}}` |
| `line-mask` | masked headline line rise (`<span class="line-mask"><span>…</span></span>`) |
| `reveal`, `reveal-stagger` | scroll reveal (use the `<Reveal>` component, not the classes) |
| `meter-fill` | bar that fills when its Reveal ancestor enters |
| `prose-tpub` | long-form text styling (legal pages): h2/h3/p/ul/ol/a |
| `no-scrollbar`, `fade-edges-y` | scroller helpers |

Reduced motion: every CSS animation/reveal is neutralised globally. For JS animation use `useReducedMotion()` from `@/lib/use-reduced-motion`.

---

## 2. UI kit — `@/components/ui`

```ts
Button(props: ButtonHTMLAttributes & {
  variant?: "primary"|"secondary"|"ghost"|"danger"|"link" | "brand"|"outline"|"glass"; // default secondary; brand/outline/glass = marketing only
  size?: "sm"|"md"|"lg";            // sm: 36px visual, 44px hit area below sm
  shape?: "control"|"pill";          // default "control" (12px); "rounded" = legacy alias of control
  loading?: boolean; loadingLabel?: string;
  disabledReason?: string|null;      // aria-disabled + accessible description; stays focusable
  onDisabledClick?: () => void;      // called instead of onClick while gated
  iconLeft?: ReactNode; iconRight?: ReactNode; fullWidth?: boolean; wrap?: boolean; asChild?: boolean })
```
`<Button variant="primary" loading={saving} onClick={save}>Enregistrer le brouillon</Button>` ·
`<Button variant="primary" disabledReason={selected === 0 ? "Sélectionnez au moins un Porteur" : null} onDisabledClick={() => hintRef.current?.focus()} onClick={book}>Réserver 2 Porteurs et continuer</Button>` ·
`<Button asChild variant="secondary"><Link href={routes.espace.campaign(7)}>Voir</Link></Button>`
- Gate actions with `disabledReason` (FFA-17), not `disabled`. `asChild` ignores `loading`/`iconLeft`/`iconRight`/`disabledReason`. `buttonClasses({variant,size,shape})` returns the class string (server-safe). Ladder in §7.

```ts
Field({ label, children, hint?, error?: string|null, required?, disabled?, id?, hideLabel?, labelAside?, className? })
Input(InputHTMLAttributes) · Textarea(TextareaHTMLAttributes) · Select(SelectHTMLAttributes & { placeholder? }) · PasswordInput(Omit<InputProps,"type">)
```
`<Field label="E-mail" error={errors.email} required><Input type="email" autoComplete="email" value={v} onChange={…}/></Field>`
- Exactly one control per Field; ids, `aria-describedby`, `aria-invalid`, `required` are wired automatically. The error `<p>` has **no** `role="alert"` (FFA-12): summarise on submit with `ErrorSummary`. Pass `id` when an ErrorSummary links to the field.

`Checkbox({ label: ReactNode, description?, error?, ...input })` — error text is not a live region either.

`Card({ as?, variant?: "solid"|"glass"|"outline"|"inset", padding?, interactive?, className })` + `CardHeader(…)` + `CardFooter` — `glass` is now an opaque `surface-2` card (no blur). Prefer `SectionCard` for app sections.

`SectionCard({ icon?: LucideIcon, title, description?, aside?, footer?, id?, as?: "section"|"div", headingAs?: "h2"|"h3", padding?: "md"|"sm"|"none", children })` — the single section header recipe (36px icon tile + 17px title + one-line description + aside). `as="section"` is labelled by its heading.
`<SectionCard icon={CalendarRange} title="Créneaux" description="Porteurs bloqués pour cette campagne" aside={<EstimateTag />}>…</SectionCard>`

`Badge({ tone?: "neutral"|"muted"|"warning"|"violet"|"success"|"danger"|"info"|"blue"|"brand"|"cat-1"…"cat-4", dot?, pulse?, size?, icon?, title? })` — status tones in §6; `blue` is for links/actions only, `info` for informational notes, `cat-*` for categories.

```ts
StatusPill({ size?, className? } & (
  | { type: "campaign"; campaign: {status,startDate,endDate}; today?; audience?: "annonceur"|"staff"; showHint? }
  | { type: "campaign-status"; status: CampaignDisplayStatus; audience?; showHint? }
  | { type: "reservation"; status; long? }      // « Bloqué » / long « Bloqué · en attente de décision TPUB »
  | { type: "support"; status } | { type: "urgency"; level } | { type: "ai"; status }
  | { type: "custom"; label; tone: BadgeTone; description?; pulse? }))
```
`<StatusPill type="campaign" campaign={c} audience="annonceur" showHint />` → « En examen TPUB » + « Analyse favorable ».
- `audience` default: from the session (ANNONCEUR → annonceur, staff → staff), `staff` outside a session (public pages). Pass it explicitly in shared components.

`EstimateTag({ rule?, label?="Estimation", className? })` + `formatEstimate(n, unit = "DT")` (also in `@/lib/format`) — neutral outline tag + rule tooltip (VD-16). `<span>{formatEstimate(r.estimatedCost)}</span> <EstimateTag rule={ESTIMATE_COST_RULE} />` → « ≈ 120 DT ».

`Dialog` (Radix Root), `DialogTrigger`, `DialogClose` (guard-aware), `DialogContent({ title, description?, children?, footer?, size?, hideCloseButton?, preventOutsideClose?, dirty?, onDiscard?, className? })`
```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent title="Modifier la zone" dirty={isDirty} onDiscard={reset}
    footer={<><DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose><Button variant="primary" onClick={save}>Enregistrer</Button></>}>…</DialogContent>
</Dialog>
```
- `dirty`: outside click, Escape, the X and `<DialogClose>` show an inline bar « Abandonner les modifications ? » (Garder / Abandonner) instead of closing; no stacked modal. `preventOutsideClose` only blocks outside clicks (pending saves). Overlay is `bg-scrim`, no blur; close button 44px.

`ConfirmDialog({ open, onOpenChange, title, description?, children?, confirmLabel?, cancelLabel?, tone?, onConfirm, confirmDisabled? })` — reserve for truly destructive / public-impact actions.

`DropdownMenu({ trigger, items: MenuAction[], align?, label?, header?, contentClassName?, open?, onOpenChange? })` + low-level `DropdownMenuRoot/Trigger/Content/Item({tone?})/Separator/Label`.
`MenuAction { label; onSelect?; href?; external?; icon?; tone?: "danger"; disabled?; description? }` — destructive items are always rendered last after a separator; `external` opens a new tab with `rel="noopener noreferrer"`.

`Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverClose`, `PopoverContent({ align?, sideOffset?, … })` — opaque surface, portal, collision padding.

`ToastProvider` (mounted by AppShell) · `useToast().toast({ title, description?, variant?, duration?, action?: { label, href?, external?, onClick? } })`. Viewport: top under the topbar below sm; bottom-right from sm, lifted by `--toast-offset` + `--bottom-bar-h`; close button 44px; no blur.
`useStickyBarOffset(ref, active = true, gap = 12)` — publishes a sticky bottom bar height as `--toast-offset` on `<html>` (resets on unmount).

`Tabs`, `TabsList` (overflow fade on the hidden side + scroll-snap + active tab scrolled into view, automatic), `TabsTrigger({ value, count?, icon? })`, `TabsContent`.

`Skeleton`, `SkeletonText`, `SkeletonCard`, `LoadingRegion({ label?, children, slow?, onRetry?, slowAfterMs = 4000, retryAfterMs = 8000 })` — after 4 s « Chargement plus long que d'habitude… », after 8 s « Réessayer » (when `onRetry`). `<LoadingRegion label="Chargement des réservations…" slow={res.slow} onRetry={res.reload}>…</LoadingRegion>`

`EmptyState({ icon?, title, description?, action?, compact? })` — first-use empty state (one primary action). Filtered empty state: see §8.

`ErrorState({ error, onRetry?, title?, message?, backHref?, backLabel?, scope?: "page"|"section", digest?, compact? (deprecated) })` — categories: unreachable, **slow** (Hourglass, « Le service met trop de temps à répondre »), offline (only when `navigator.onLine === false`), unauthorized, forbidden, not-found, invalid, conflict, server. `scope="section"` renders a compact card inside the failing section.

`PartialNotice({ message? = "Données partielles", onRetry?, className? })` — small warning line inside a tile whose data is incomplete.

`ErrorSummary({ errors: {fieldId, message}[], title?, autoFocus? = true, focusKey?, className? })` (ref: `{ focus() }`) + `focusField(id)` — `role="alert"`, heading « 3 champs à corriger », links focus each field. Render for 2+ errors; for one error call `focusField(id)`.

`DraftRestoreNotice({ restoredAt: Date, onDiscard, className? })` — « Saisie restaurée (il y a 5 min). » + « Effacer ».

`AutosaveStatus({ state: "idle"|"saving"|"saved"|"error", savedAt?, onRetry?, className? })` — `role="status"`: « Enregistrement… » · « Enregistré · il y a 5 s » · « Échec de l'enregistrement · Réessayer ».

`Kbd({ keys?: string, children?, platform?: "auto"|"apple"|"other", size? })` — `<Kbd keys="mod+k" />` → ⌘ K (Apple) / Ctrl K; sequences read « G puis D ».

`StatCard({ label, value, hint?, icon?, accent?, estimate?, estimateRule?, loading? })` — `estimate` renders a neutral EstimateTag « Estimation indicative ».

`Stepper({ steps, current, state?, orientation?, label? })` · `ScoreMeter({ label, value, max?, kind, hint?, size? })` · `Tooltip({ content, children, side? })`, `InfoTip({ label, content })` · `Spinner({ size?, label? })`, `VisuallyHidden`.

`DataTable`, `FilterBar`, `PageHeader`, `DateField`/`DateRangeField`/`TimeRangeField`: see §7–§10.

---

## 3. Marketing kit — `@/components/marketing`

**Page structure rule:** the header overlays the first section. Every marketing page must start with `<PageHero>` (it reserves `var(--header-h)`). One `<h1>` per page = PageHero.

`PageHero({ eyebrow?, title, highlight?, breakBeforeHighlight?=true, lede?, actions?, note?, image?: {src, alt?, position?}, aside?, breadcrumbs?, size?: "full"|"default"|"compact", bottom? })`
```tsx
<PageHero eyebrow="Tarifs" title="Un prix média," highlight="pas un prix au mètre carré." lede="…"
  image={{ src: "/images/screen-mall.jpg" }} actions={<Button asChild variant="brand" size="lg"><Link href="/inscription">Créer mon compte</Link></Button>} />
```
- `size="full"` for home (+ `aside={<BroadcastScreen/>}` + `bottom={<StatBand variant="overlay" …/>}`), `compact` for legal pages (no image). CSS-only entrance (no JS).

`Section({ id?, children, tone?: "default"|"band"|"deep"|"glow", spacing?: "default"|"tight"|"none", divider?: "none"|"hairline"|"tricolor", container?: "default"|"narrow"|"wide"|"full"|false, labelledBy?, className?, containerClassName? })` — `<Section tone="band" labelledBy="etapes">…</Section>`. Vary tones between consecutive sections.

`SectionHeader({ eyebrow?, title, highlight?, breakBeforeHighlight?, lede?, align?: "left"|"center"|"split", as?: "h1"|"h2"|"h3", size?: "display"|"lg"|"md", id?, actions?, reveal?=true })`
`<SectionHeader id="etapes" eyebrow="Comment ça marche" title="De la zone au rapport," highlight="en quatre étapes" align="split" lede="…" />`

`Container({ as?, size?: "default"|"narrow"|"wide"|"full" })`

`Reveal({ as?, variant?: "up"|"left"|"right"|"zoom"|"blur"|"fade", stagger?, delay?(ms), className, ...props })` (client) — `<Reveal stagger className="grid gap-4 md:grid-cols-3">{cards}</Reveal>`. Visible without JS and under reduced motion. Don't wrap the hero h1 (PageHero already animates via CSS).

`GlassCard({ as?, interactive?, padding?: "none"|"sm"|"md"|"lg", accent?: "none"|"red"|"orange"|"blue"|"brand", radius?: "card"|"panel" })` — `<GlassCard interactive accent="orange"><h3>…</h3></GlassCard>`

`IconTile({ icon, tone?: "orange"|"blue"|"red"|"success"|"neutral", size?: "sm"|"md"|"lg" })`

`ImageFrame({ src, alt, sizes (required), ratio?: "16/9"|"21/9"|"4/5"|"4/3"|"3/2"|"1/1"|"3/4"|"fill", priority?, scrim?: "none"|"soft"|"bottom"|"side"|"full", pixelGrid?=true, kenBurns?, hoverZoom?=true, radius?: "none"|"card"|"panel", label?, caption?, objectPosition?, children? })`
`<ImageFrame src="/images/zones-map.jpg" alt="Vue aérienne illustrant des zones de diffusion" ratio="1/1" sizes="(min-width:1040px) 40vw, 100vw" label="Illustration" />`

`FeatureSplit({ eyebrow?, title, highlight?, lede?, children?, actions?, image: {src, alt, ratio?, label?, position?}, reverse?, media?, headingId?, headingAs? })` + `FeatureList({ items: ReactNode[] })`
`<FeatureSplit eyebrow="Le réseau" title="Chaque Porteur est conçu" highlight="pour devenir un écran." image={{src:"/images/screen-street.jpg", alt:"…", ratio:"4/5", label:"Illustration"}}><FeatureList items={[…]} /></FeatureSplit>`

`NumberedSteps({ steps: {title, description, icon?}[], layout?: "grid"|"chain", headingAs? })` — 01–04 cards or vertical chain (use chain for the 9-step journey).

`StatBand({ items: {label, detail?, icon?, countTo?, prefix?, suffix?}[], variant?: "band"|"overlay", label? })` — **mechanism items only** (Par zone / Par créneau / Double contrôle / Journalisé). `countTo` exists but must never carry invented figures.

`CountUp({ to, from?, duration?, decimals?, prefix?, suffix? })` (client) — real, sourced figures only.

`CtaBand({ title, highlight?, lede?, primary: {label, href}, secondary?, image?: {src, alt?, position?} | null, note?, headingId? })` — full-bleed closing CTA (default image coastal-billboard).

`Faq({ items: {question, answer: ReactNode}[], defaultOpen?, headingLevel?: "h2"|"h3"|"h4" })` (client, Radix Accordion).

`BroadcastScreen({ creatives?: {kicker, line, sub, campaign, theme: "brand"|"blue"|"green"|"amber"}[], interval?, hideLog? })` (client) — « DÉMO » dot, « Exemple » creatives, simulated « Illustration » log, static under reduced motion, pauses off-screen.

`ModerationPipeline({ riskScore?=20, qualityScore?=75 })` — campaign → AI gauges → « Validé par un expert TPUB », values labelled « Valeurs d'exemple ».

`ConfidenceLadder({ steps?: {level, nature: "observed"|"estimated"|"counterfactual", natureLabel, inTpub, icon?}[], footnote? })` — defaults = brief §8.4 table (`DEFAULT_CONFIDENCE_STEPS`).

`StatusBanner({ message? })`, `SiteHeader()`, `SiteFooter()` — already in the `(marketing)` layout; don't render them in pages.

---

## 4. Shell — `@/components/shell`

- `/espace/*` and `/admin/*` layouts render `SessionProvider` + `AppShell`. AppShell mounts: `ToastProvider`, `NavigationGuardProvider`, `ShortcutsProvider`, `BreadcrumbProvider`, `CommandPaletteProvider`, sidebar (grouped nav « Piloter / Explorer » or « Opérer / Réseau » + badges + account menu), opaque topbar (« ‹ Parent » back control or logo mark below lg · trail · « Rechercher… ⌘K » · read-only chip / lock icon · help menu « ? » · create CTA), `SessionExpiryBanner`, `SessionExpiredListener` (dialog), `AccessNotice` (`?acces=reserve` toast), mobile drawer and `MobileTabBar`. Pages render only content, starting with `<PageHeader>`; `<main id="contenu">` is provided.
- Unknown `/espace/**` and `/admin/**` URLs render `SectionNotFound` inside the shell; segment errors render `SectionError` (reset, section home, digest).
- `useSession()` (client) → `{ user: {email, nom, role, userId, exp}, role, isAdmin, isStaff, canAct (ADMINISTRATEUR only), loggingOut, logout(), deadline: { exp, expiresAt, phase: "ok"|"warning"|"critical"|"expired" } }`. `useOptionalSession()` returns null outside the provider.
- Topbar CTA rule (IA-12, `createCtaMode(variant, pathname)`): filled primary « Nouvelle campagne » on `/espace` and `/espace/campagnes` (≥ sm), secondary « Créer » elsewhere (≥ md), none in the wizard, on mobile or in the back-office.
- Tab bar: 4 items from `nav.ts` (`tab.order`) + « Plus » (drawer); hidden on `/espace/reseau` and `/espace/campagnes/nouvelle` (`TAB_BAR_HIDDEN_ROUTES`); publishes `--bottom-bar-h`.
- Badges (`useNavBadges(variant, role)`): espace « À finaliser » (drafts without active créneau + REJECTED_BY_AI), admin moderation (APPROVED_BY_AI + REVIEW_REQUIRED), coherence issues (danger + warning), active emergencies; hidden at 0; shared cache 30 s, revalidated on focus.
- `(auth)` layout: split screen, pages render a ≤460px column with their own h1.
- `/ecran` layout: black full-screen `<main>`; the page renders everything else.

---

## 5. Data layer — `@/lib/api`, `@/lib/*`

- `campaignsApi.{mine, all, get, create, update, remove, submit, duplicate}`, `aiApi.{checkContent, report}`, `adminApi.{validate, reject(id, reason?)}`, `zonesApi.{all, active, get, create, update, remove}`, `supportsApi.{all, byZone, get, create, update, availability}`, `reservationsApi.{all, byCampaign, create}`, `statisticsApi.dashboard` (staff only), `emergencyApi.{all, create, deactivate}`, `diffusionApi.next({supportId, datetime, zone?})`, `sessionApi.{get, login, register, logout}`. Every function takes an optional last `{ signal }`.
- Low level: `apiFetch<T>(path, {method, body, query, signal, timeoutMs, retry?})` — GET retries **once** after 800 ms on a transport error or timeout (`retry: false` to opt out); mutations are never replayed.
- Errors: `ApiError`, `ApiTransportError {kind}`, `presentError(e) → {category, title, message, fieldErrors, retryable}`, `errorCategory(e)` (timeout → `slow`, network → `offline` only when `navigator.onLine === false`, else `unreachable`), `isBrowserOffline()`, `isRetryableTransportError(e)`, `isAbortError`, `isNoAiReportError(e)`, `isReservationConflictError(e)`.
- `useResource(key | null, (signal) => fetcher, options?)` → `{ data, error, loading, reload, setData, slow, lastUpdatedAt, revalidating }`.
  Options: `revalidateOnFocus = true` (focus/visibilitychange, throttled by `focusThrottleMs = 30000`), `pollInterval: number | null` (paused while hidden), `slowAfterMs = 8000`, `cacheKey` (shared cache entry), `staleTime = 30000`. Background failures keep the previous data.
  `useResource("mine", (s) => campaignsApi.mine({ signal: s }), { cacheKey: resourceKeys.campaignsMine, pollInterval: pending ? 10_000 : null })`
- `@/lib/resource-cache`: `fetchCached(key, fetcher, { staleTime?, force?, signal? })` (deduplicated, primes on success, errors never cached), `getCached`, `primeCache`, `invalidate(prefix)`, `isFresh`, `subscribeCache`, `clearResourceCache` (tests), `resourceKeys.{campaignsMine, campaignsAll, supportsAll, zonesAll, zonesActive, emergencies, reservationsByCampaign(id), supportAvailability(id, from, to)}`. Call `invalidate("campaigns:")` after a mutation.
- `@/lib/format` (the only formatting path; every number formatter normalises U+202F → U+00A0): `formatTND`, `formatNumber`, `formatCompact`, `formatEstimate(n, unit)`, `normalizeNumberSpaces`, `formatDate(v, "long"|"medium"|"short")`, `formatDateTime`, `formatTime` (« 14:32 »), `formatDateRange`, `formatDateRangeLong(start, end, { weekday?, withDuration? })` (« du mercredi 10 février au mardi 16 février 2027 · 7 jours »), `formatTimeRange`, `formatTimeRangeLong` (« de 09:00 à 18:00 · 9 h »), `countDaysInclusive`, `formatRelative(from, now?)` (« il y a 3 h », « dans 5 jours », « demain »), `formatCoordinatesFr(lat, lng)` (« 36,8829° N · 10,3301° E »), `toApiTime`, `toApiTimeOrNull`, `fromApiTime`, `todayISO()` (Africa/Tunis), `toLocalIsoDateTime()`, `initials`, `formatCount`.
- `@/lib/date-input`: `parseFrDate`, `formatFrDateInput`, `maskFrDateInput`, `isValidISODate`, `addDays`, `addMonths`, `daysInclusive`, `presetRange("1w"|"2w"|"1m", start, today)`, `DATE_PRESET_LABEL`, `buildMonthGrid` (Monday first), `mondayIndex`, `moveCalendarFocus(iso, key, shift)`, `formatMonthTitle`, `formatDayLong`, `clampISODate`, `firstUnavailableRun`, `timeOptions(step)`, `timeToMinutes`, `WEEKDAYS_SHORT/LONG`.
- `@/lib/campaign-status`: see §6.
- `@/lib/routes`: see §11. `@/lib/url-state`: see §11.
- `@/lib/network/availability`: + `firstFreeWindow(slots, lengthDays, fromISO, horizonDays = 90)`, `isRangeFree(slots, start, end)`. `@/lib/network/use-supports-availability`: `useSupportsAvailability(ids, from, to, { concurrency = 4, enabled = true })` → `Map<id, { state: "loading"|"free"|"busy"|"error"; slots }>`, `runWithConcurrency`.
- `@/lib/network/porteur`: `PORTEUR_TYPES[t].tone` is categorical (`cat-1` A, `cat-2` B, `cat-4` C, `cat-3` D) + `category` 1–4; `accent` is deprecated.
- `@/lib/review-triggers`: `detectReviewTriggers(text)` → `{ term, match, index }[]` (« gratuit(e)(s) », « garanti(e)(s) »), `reviewTriggerTerms`, `reviewTriggerHint(term)`.
- `@/lib/search`: `normalizeSearch`, `matchScore`, `rankItems(items, query, limit = 8)` (prefix › word start › substring).
- `@/lib/use-dismissible`: `const [dismissed, dismiss, restore] = useDismissible("hint:studio")` (localStorage per user, try/catch).
- `@/lib/session-deadline`: `useSessionDeadline(exp)`, `sessionPhase(exp, now)`, `msUntilNextPhase`, `SESSION_WARNING_MS` (10 min), `SESSION_CRITICAL_MS` (2 min).
- `@/lib/shortcuts`: see §12. `@/lib/forms/*`: see §10. `@/lib/contrast`: WCAG helpers + light tokens.
- `@/lib/session-cookie` (pure, client-safe): `safeNextPath(next)`, `canAccessPath(role, path)`, `roleHome(role)`. `@/lib/session` is server-only (`getSession()`).
- `@/content/site`: `SITE`, `CONTACT`, `SOCIAL`, `GROUP`, `STATUS_NOTICE`, `LEGAL_REVIEW_NOTICE`, `copyrightLine()`.
- `@/content/nav`: `MAIN_NAV`, `FOOTER_COLUMNS`, `LEGAL_NAV`, `ESPACE_NAV` (no Profil; « Réseau & Studio 3D »), `ACCOUNT_NAV` (Profil), `ADMIN_NAV`, `AppNavItem { label, href, icon, exact?, group?, badgeKey?, tab? }`, `groupNav`, `tabItems`, `isTabBarHidden`, `isNavActive`.
- `@/content/glossary`: `GLOSSARY` (Porteur, Écran, Créneau, Budget déclaré, Coût estimé des créneaux, Vues estimées, Diffusions journalisées), `RESERVATION_LABEL` / `RESERVATION_LABEL_LONG` / `RESERVATION_HINT`, `ESTIMATE_RULE`, `ESTIMATE_COST_RULE`, `ESTIMATE_VIEWS_RULE`, `ESTIMATE_LABEL`, `SUPPORT_HOURS` (« lun–ven, 9 h–18 h »), `SUPPORT_HOURS_LONG`, `REVIEW_WAIT_SENTENCE`, `BOOKING_CONSEQUENCE`, `SUBMIT_CONSEQUENCE`.
- `@/lib/cx` (`cx(...classes)`), `@/lib/use-reduced-motion` (`useReducedMotion()`).

---

## 6. Statuts & palette (UX-PLAN §4.8)

One tone per lifecycle phase (`PHASE_TONE`), asserted by `campaign-status.test.ts`:

| Phase | Tone | Badge recipe | Campaign statuses |
|---|---|---|---|
| draft | `neutral` | ink-soft on surface-3 | BROUILLON |
| pending | `warning` | amber | PENDING_AI_CHECK, APPROVED_BY_AI, REVIEW_REQUIRED |
| scheduled | `violet` | violet-text on violet-soft | VALIDATED_BY_ADMIN, SCHEDULED |
| live | `success` + pulse | green | ACTIVE (in window) |
| ended | `muted` | muted | TERMINATED, ENDED |
| problem | `danger` | red | REJECTED_BY_AI, BLOCKED |

- `campaignStatusFor(status, audience = "staff")` → `{ label, tone, description, hint, phase, pulse? }`; `CAMPAIGN_STATUS` (staff: « Analyse IA en attente », « Avis IA favorable », « Revue manuelle », « Validée »…) and `CAMPAIGN_STATUS_ANNONCEUR` (« Analyse IA en cours », « En examen TPUB » ×2, « À corriger », « Programmée », « En diffusion », « Terminée », « Refusée » + hints).
- `getCampaignStatusMeta(c, { audience?, today? })` (legacy `getCampaignStatusMeta(c, today)` still works) adds `key` and the real start date in the scheduled hint.
- `getCampaignTimeCue(c, today?, now?)` → `{ label, tone } | null`: « Soumise il y a 3 h » (submittedAt), « Diffusion dans 5 jours », « Jusqu'au 31 oct. 2026 », « Terminée le 12 oct. 2026 », « Date de début dépassée » (warning). Never invents a timestamp.
- List tabs `CAMPAIGN_FILTERS` (`?statut=`): `toutes`, `a-finaliser`, `en-examen`, `validees` (« Validées », description « Programmées ou en diffusion »), `terminees` (« Terminées & refusées »). `parseCampaignFilter(raw)` maps legacy `brouillons→a-finaliser`, `validation→en-examen`, `diffusion→validees`, `refusees→terminees`. `matchesCampaignFilter(statusOrCampaign, filter, today?)` — pass the campaign so derived states land in the right tab.
- `CAMPAIGN_BUCKETS` (charts, dashboard hints, Statistiques, admin overview): `brouillons`, `a-corriger`, `en-examen`, `programmees`, `en-diffusion`, `terminees`, `refusees`, each `{ label, description, phase, tone, statuses, filter }` with the tone read from the status map; `getCampaignBucket(c)`.
- `RESERVATION_STATUS[s]` → `{ label: "Bloqué"|"Confirmé"|"Libéré"|"Passé", longLabel, tone, description }`. `URGENCY_LEVEL`: LOW neutral, MEDIUM info, HIGH warning, CRITICAL danger.
- KPI values are neutral; attention tones only when value > 0 and the metric is a problem. Categorical series use `cat-1..4`, never status tones.

---

## 7. Anatomie de page & hiérarchie des boutons

Vertical order in every `/espace` and `/admin` page: topbar (trail · search · help · CTA) → session banner (only < 10 min) → `PageHeader` → `FilterBar` (lists) → content (`SectionCard` / `DataTable` / map) → states → sticky action bar (flows only) → mobile tab bar.

```ts
PageHeader({
  title: ReactNode; meta?: ReactNode;            // pill rendered right after the h1
  description?: ReactNode;                        // one sentence, 72ch
  eyebrow?: string;                               // only when meaningful
  primaryAction?: ReactNode;                      // at most one filled primary
  secondaryActions?: ReactNode | MenuAction[];    // ≤ 2; MenuAction[] collapse into « … » below sm
  overflowActions?: MenuAction[];                 // « … » DropdownMenu, destructive last
  overflowLabel?: string;                         // default « Plus d'actions »
  actions?: ReactNode;                            // @deprecated, rendered after secondary
  breadcrumbs?: Breadcrumb[];                     // registers into the topbar trail inside AppShell
  back?: { href; label? };                        // inline outside AppShell; trail parent inside
  className?: string })
```
```tsx
<PageHeader title={c.name} meta={<StatusPill type="campaign" campaign={c} audience="annonceur" />}
  breadcrumbs={[{ label: "Campagnes", href: routes.espace.campaigns() }, { label: c.name }]}
  primaryAction={<Button asChild variant="primary"><Link href={routes.espace.wizard(c.id, "porteurs")}>Finaliser</Link></Button>}
  secondaryActions={[{ label: "Modifier les détails", href: routes.espace.wizard(c.id, "details") }]}
  overflowActions={[{ label: "Dupliquer", onSelect: dup }, { label: "Supprimer", tone: "danger", onSelect: askDelete }]} />
```
- DOM/tab order primary → secondary → overflow. More than two actions move to their own row below xl. `overflowActions` with functions require a client component.

| Level | Variant | Use in app | Shape |
|---|---|---|---|
| Primary | `primary` | the one main action of a region (PageHeader or sticky bar, never both) | control |
| Secondary | `secondary` | alternatives (« Modifier », « Ajouter à la sélection ») | control |
| Tertiary | `ghost` / `link` | cancel, « Quitter l'assistant », inline actions | control |
| Destructive | `danger` | inside a destructive confirmation, or « Supprimer » in overflow menus | control |
| Marketing only | `brand`, `outline`, `glass` | forbidden in `/espace` and `/admin` | pill |

Pills are for chips, tabs and filters. Gated actions use `disabledReason`. Orange is identity (logo, active espace nav), never an action; blue is actions/links.

---

## 8. États (recettes)

| State | Use | Notes |
|---|---|---|
| Loading | `LoadingRegion` + skeletons shaped like content | caption at 4 s, « Réessayer » at 8 s; pass `slow={res.slow}` |
| Empty (first use) | `EmptyState` (dashed card) | icon, one-line why, one primary action |
| Empty (filtered) | `DataTable emptyFiltered` / inline `<p role="status">Aucun résultat pour ces filtres</p>` + « Réinitialiser les filtres » | no card |
| Error (section) | `ErrorState scope="section" onRetry` inside the section | data outside the section stays |
| Error (page) | `ErrorState` | only when the page's primary resource fails |
| Partial | `PartialNotice onRetry` | « Données partielles · Réessayer » |
| Slow / timeout | `ErrorState` (category `slow`, Hourglass) | never « hors ligne » unless offline |
| Not found (object) | neutral card, h1 « {Objet} introuvable », recent objects, `useCommandPalette().open()` | |
| Not found (route) | automatic (`SectionNotFound`) | |

---

## 9. Tables & filtres

```ts
DataTable<T>({
  columns: { key; header; cell(row); align?; className?; primary?; hideOnMobile?;
             sortable?; sortValue?(row): string|number|null; sortLabel?; mobileMeta?; nowrap? }[];
  rows; getRowKey; caption; showCaption?;
  empty?; emptyFiltered?;                          // emptyFiltered wins when provided
  mobileFooter?(row); rowActions?(row); rowActionsLabel?;
  sort?: { key; dir: "asc"|"desc" } | null; onSortChange?(sort); sortCaption?; manualSort? })
```
- Sortable headers are `<button>`s with a chevron and `aria-sort` on `<th>`; without `onSortChange` the table sorts itself (client consumer required). Nulls sort last; strings use French collation. `sortCaption="attente la plus longue"` renders « Trié par : attente la plus longue ».
- Mobile cards (< md): title = `primary` cell + up to 2 `mobileMeta` cells on the right; details in 2 columns from 340px; `rowActions` go in the card footer. Never truncate `nowrap` dates/amounts. No clickable rows: put a Link in the name cell.
- URL sort: `const { sort, setSort } = useTableSort("tri", { defaultSort: { key: "debut", dir: "asc" } }); <DataTable sort={sort} onSortChange={setSort} … />`.

```ts
FilterBar({ search?: { value; onChange; placeholder?; label?; shortcut? = true },
            children?;                                  // filter controls
            sort?: { value; options: {value,label}[]; onChange; label? };
            resultCount?: string; activeCount: number; onReset(); sheetTitle?; className? })
```
- One row ≥ md; below md: search + « Filtres (n) » bottom sheet with the filters and sort. `shortcut` registers « / » for the page search (the palette then leaves « / » to the page). Presentational: keep state in `useUrlState`.

---

## 10. Champs de date & sécurité des saisies

```ts
DateField({ value: "YYYY-MM-DD"|""; onChange(v); min?; max?; isDateDisabled?(iso); id?; name?; disabled?; echo? = true; onValidityChange?(msg|null) })   // inside <Field>
DateRangeField({ value: {start, end}; onChange(v); min?; max?; presets?: false | ("1w"|"2w"|"1m")[];
  unavailable?(iso): boolean; unavailableMessage?(range): string; echo? = true; startLabel? = "Début"; endLabel? = "Fin";
  errors?: { start?, end? }; disabled?; lockedReason?; required?; id?; hint?; className? })          // renders two Fields: ids `${id}-start` / `${id}-end`
TimeRangeField({ value: {start: "HH:mm", end}; onChange; step?: 15|30 = 30; dayParts?: {label,start,end}[]; echo? = true;
  startLabel?, endLabel?, errors?, disabled?, required?, id?, hint?, className? })
```
- Text entry « jj/mm/aaaa » (digits, slashes auto-inserted; accepts j/m/aaaa, jj.mm.aaaa, jj-mm-aaaa, ISO paste), calendar button 44px « Choisir une date » → APG grid (lundi first, arrows, PageUp/Down, Shift+PageUp/Down, Home/End, Enter, Esc), today marked (Africa/Tunis), disabled days announced « indisponible ». Errors: « Date invalide (format jj/mm/aaaa) », « La date de fin doit suivre la date de début », default unavailable message « Ce Porteur est déjà réservé du 14 au 20 sept. » (the crossing range is not committed). Echo `aria-live="polite"` linked by `aria-describedby`. `lockedReason` makes inputs read-only with the reason.
```tsx
<DateRangeField id="periode" value={{ start, end }} min={todayISO()} onChange={({ start, end }) => set({ start, end })}
  unavailable={(d) => blocked.has(d)} errors={{ start: errors.startDate, end: errors.endDate }} />
<TimeRangeField id="heures" value={{ start: startTime, end: endTime }} onChange={setTimes} dayParts={[{ label: "Journée", start: "08:00", end: "20:00" }]} />
```

Form safety (UX-PLAN §7):
- `useUnsavedChangesGuard({ dirty, message? })` (`@/lib/forms/unsaved-guard`, re-exported by `@/components/shell`): `beforeunload` while dirty; inside AppShell, same-origin link clicks (capture phase), sidebar, tab bar, trail, back control and palette ask « Quitter sans enregistrer ? ». Opt a link out with `data-guard="off"`. Back (popstate) is not intercepted: pair with drafts.
- `useNavigationGuard()` → `{ confirmNavigation(href, { replace?, newTab? }), confirmAction(fn) }`; `GuardedLink` = next/link routed through it. Helpers: `hasUnsavedChanges()`, `suspendUnsavedGuards(ms)`, `shouldInterceptLinkClick`.
- `useFormDraft({ key, value, dirty, userId?, version? = 1, enabled? = true, onRestore?(value, savedAt), delay? = 500 })` → `{ restoredValue, restoredAt, discard(), clear() }` (`@/lib/forms/form-draft`): sessionStorage `tpub:draft:v{version}:{userId}:{key}`, ignored after 24 h, try/catch everywhere. Call `clear()` after a successful save/submit. Keys: `campaign:new`, `campaign:{id}:details`, `campaign:{id}:edit`, `network:quick-draft`, `admin:emergency:new`, `admin:zone:{id|new}`, `admin:support:{id|new}`. `hasDirtyDrafts()` drives the session-expired wording.
- `useAutosave({ value, save, enabled, delay? = 1500, isEqual? })` → `{ state, savedAt, retry(), flush(), pending }` (`@/lib/forms/autosave`): enable only for BROUILLON/REJECTED_BY_AI drafts with an id and a valid value; a failure waits for `retry()` or the next edit. Show `<AutosaveStatus state savedAt onRetry={retry} />`.
- Submit: `ErrorSummary` for 2+ errors, `focusField(id)` for one; `mapServerFieldErrors` keeps mapping server errors. Dialog forms: `DialogContent dirty`.
- Session: banner at T−10 min (`role="status"`, « Masquer »), again at T−2 min (`role="alert"`); 401 or T → non-dismissible « Session expirée » dialog → `/connexion?next={path}&expire=1`. The banner's « Se reconnecter » opens `/connexion?next=…&renouveler=1` in a new tab (middleware lets it through).

---

## 11. État d'URL & routes

```ts
routes.espace.{ home(), campaigns({ statut?, q?, tri? }), campaign(id), campaignEdit(id),
  wizard(id | null, step?: "details"|"porteurs"|"verification"|1|2|3|4),   // etape=1|2|3, legacy 4 → 3
  reservations({ statut?, campagne?, zone?, tri? }), statistics(), network({ zone?, porteur?, vue?, fond? }), profile() }
routes.admin.{ home(), moderation({ onglet?: "a-traiter"|"revue"|"ia"|"toutes", q?, examen?, tri? }),
  network({ onglet?: "carte"|"ecrans"|"zones", porteur?, panneau?: "coherence" }), emergencies() }
routes.player(id) · routes.login({ next?, expire?, renew? }) · withQuery(path, query) · parseWizardStepParam(raw) · sectionOf(pathname)
```
```ts
const [state, setState] = useUrlState({
  statut: param.enum(RESERVATION_VALUES, "toutes"), campagne: param.id(), q: param.string(),
}); // default history "replace"
setState({ campagne: 12 });                       // replace (filters, search, sort, tabs, map view)
setState({ examen: 3 }, { history: "push" });     // overlays that look like pages
```
- Codecs: `param.string(default?)`, `param.id()`, `param.enum(values, default, legacy?)`, `param.optionalEnum(values)`, `param.boolean()`; pure `readUrlState`, `writeUrlState`, `hrefWithParams`.
- Sort: `useTableSort(param = "tri", { defaultSort?, allowedKeys? })` → `{ sort, setSort, isDefault }`; pure `parseSortParam`, `serializeSort`, `nextSort`. Hooks need a `<Suspense>` boundary (useSearchParams) and a client component.
- Closing an overlay opened in this session: `router.back()`; otherwise replace the param away.

---

## 12. Palette de commandes & raccourcis

- `useCommandPalette().open(query?)` opens ⌘K (also bound globally to `mod+k`, even in inputs, and « / » when the page has no FilterBar search).
- `useRegisterCommands(commands, deps)` — page commands shown first under « Cette page »:
  `Command { id; label; group; keywords?; shortcut?: string | string[]; icon?; description?; href?; run?() }`. `href` navigations go through the navigation guard; ⌘/Ctrl+Enter opens a new tab.
  `useRegisterCommands([{ id: "valider-" + c.id, label: "Valider #" + c.id, group: "Cette page", run: validate }], [c.id])`
- `useRecordRecent({ label, href, kind: "campagne"|"porteur"|"zone"|"page" })` — object pages feed « Récents » (5 per user, localStorage).
- Data groups (lazy, shared cache): Campagnes (`mine` → detail, drafts also « Finaliser » → wizard step 2; staff `all` → `?examen=`), Porteurs (active only for advertisers → `?porteur=`; staff → `onglet=ecrans&porteur=`), Zones. OPERATEUR has no campaign list; « Nouveau message prioritaire » is ADMINISTRATEUR only.
- `useShortcut(keys, handler, { description, section, when?, allowInEditable?, allowInDialog?, enabled? })` — registers into the « ? » sheet (`ShortcutsDialog`). Grammar: `"mod+k"`, `"shift+?"`, `"g d"` (1.2 s sequence), `"j"`, `"escape"`, `"plus"`. Single-key shortcuts never fire in inputs/textarea/select/contenteditable/combobox, with Ctrl/⌘/Alt, or inside another dialog (unless `allowInDialog`), and can be turned off in the sheet (WCAG 2.1.4). Outside ShortcutsProvider the hook binds its own listener.
  `useShortcut("v", validate, { description: "Valider", section: "Examen de modération", allowInDialog: true, when: () => canValidate })`
- Registry (`@/lib/shortcuts`): `NAV_SEQUENCES`, `globalShortcutSection`, `navigationShortcutSection`, `MAP_SHORTCUT_SECTION` (mirrors `network-map-client.tsx`), `STUDIO_SHORTCUT_SECTION` (mirrors `porteur-studio-canvas.tsx`), `MODERATION_SHORTCUT_SECTION` (J/K/V/R/Esc, handlers owned by the moderation review), `shortcutSectionsFor(variant, pathname)`, `parseKeys`, `matchesStroke`, `isEditableTarget`, `keyLabels`, `keysAriaLabel`, `registerPageSearch`, `focusPageSearch`, `singleKeyShortcutsEnabled`. `useShortcutsHelp().openHelp()` opens the sheet.
- Trail: `useBreadcrumbs(items)` (or `PageHeader breadcrumbs`) sets the topbar trail, cleared on unmount; `useDocumentTitle(name, section?)` → « Ouverture boutique La Marsa — Campagnes — TPUB ».
