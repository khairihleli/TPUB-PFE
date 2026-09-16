# TPUB frontend: design reference

Source studied (read-only): `site tukh/corporate` (Angular 20, the Tukhnanutha corporate site, which is the quality bar) and `site tukh/tpub.html` (older TPUB static page, used for content only).
Files read: `src/styles.scss`, `src/index.html`, `app.html/ts/scss`, `layout/header/*`, `layout/footer/*`, `pages/home/*`, `pages/company/*` (subsidiary page), `pages/careers/*`, `pages/what-we-do/*`, `shared/*.directive.ts`, `portal/styles/_base.scss` + `_cadre.scss` (the corporate client space), `data/entities.ts` (TPUB entry), `public/assets/tpub.png`.

Notes up front:
- There is no theme service. The corporate site is dark only, with one token set on `:root`. The client portal uses the same dark tokens.
- There is no `/contact` page. "Contact" links go to `/portal/connexion`, so the client login is the contact door. That is a useful pattern for TPUB: "Espace annonceur" is the main CTA.
- The site's name for its look is "Sovereign editorial": warm espresso near-black, champagne gold as the single accent, verdigris (green) as a rare counter-accent. It does not use flat navy and it does not use rainbow gradients. **The quality comes from restraint: one accent, hairline borders, frosted surfaces, slow ambient motion, a big serif display face and small uppercase tracked labels.**

---

## 1. Design tokens (corporate, verbatim values)

### 1.1 Colour palette

| Token | Hex / value | Role |
|---|---|---|
| `--bg` | `#0c0a09` | page ground (warm near-black) |
| `--bg-2` | `#131009` | band backgrounds, card gradient bottom |
| `--surface` | `#19150f` | cards, logo pills, inputs |
| `--surface-2` | `#221c14` | icon tiles, tags, tracks band |
| `--surface-3` | `#2c241a` | scrollbar thumb, deepest raised |
| `--gold` | `#e7c479` | primary accent: links, active, icons |
| `--gold-2` | `#d2a857` | eyebrow text, mid-gradient |
| `--gold-3` | `#a87f3e` | gradient dark stop, dim accents |
| `--gold-light` | `#f4dca0` | gradient highlight, active nav text |
| `--gold-soft` | `rgba(231,196,121,.10)` | tinted fills (pills, active nav) |
| `--gold-line` | `rgba(231,196,121,.24)` | accent borders on hover/active |
| `--verd` / `--verd-2` | `#58a78c` / `#3f8a72` | secondary accent (partner cards, success-ish) |
| `--verd-soft` / `--verd-line` | `rgba(88,167,140,.12)` / `.28` | tints |
| `--text` | `#f3ede0` | body text (warm paper, not pure white) |
| `--text-strong` | `#fdfaf3` | headings over imagery |
| `--text-soft` | `#d8cfbd` | lead text over imagery |
| `--muted` | `#b3a892` | secondary text, nav links |
| `--muted-2` | `#8a8068` | tertiary text, credits, dt labels |
| `--line` | `rgba(243,237,224,.09)` | default hairline border |
| `--line-strong` | `rgba(243,237,224,.16)` | ghost button border, chips on imagery |
| `--on-gold` | `#211803` | ink on gold fills |
| Cluster hues | `--c-sense #5fbfa6`, `--c-infra #6aa0e0`, `--c-energy #e8b54b`, `--c-audi #e08bb0` (TPUB's cluster), `--c-cmd #a896e0`, `--c-ai #9b8ce8` | per-entity `--cc` custom property: 3–4px top bar, icon colour, hover tint via `color-mix` |

Status pill pattern (company page): `color: var(--sc); background: color-mix(in srgb, var(--sc) 12%, transparent); border: 1px solid color-mix(in srgb, var(--sc) 30%, transparent)`. The same 12% fill + 30% border recipe is used for every tinted icon tile. **Reuse it for dashboard status badges.**

Portal alerts use a muted red `#e79a9a` on `rgba(214,106,106,.1)` and a danger button `#e08b8b`. Danger is desaturated so it doesn't shout against the warm palette.

### 1.2 Gradients
- **Primary button:** `linear-gradient(120deg, var(--gold) 0%, var(--gold-2) 45%, var(--gold-3) 100%)` + `box-shadow: 0 12px 30px rgba(240,205,97,.24), inset 0 1px 0 rgba(255,255,255,.45)`. The inset top highlight gives it a physical, lit feel.
- **Gold text:** `linear-gradient(100deg, gold-3, gold, gold-light, gold, gold-3)` at `background-size: 220%`, animated sheen over 7s.
- **Card gradient:** `linear-gradient(180deg, var(--surface), var(--bg-2))`.
- **Hairline separators:** `linear-gradient(90deg, transparent, var(--gold-line) 20%, var(--gold) 50%, var(--gold-line) 80%, transparent)`. Used on the footer top border with `box-shadow: 0 0 28px rgba(231,196,121,.18)` glow.
- **Vertical dividers (stat band, FAB):** `linear-gradient(180deg, transparent, rgba(231,196,121,.34), transparent)`, 1px wide.
- **Eyebrow dash:** `linear-gradient(90deg, var(--gold), transparent)`, 26×1.5px.

### 1.3 Aurora / living background (signature effect)
Two fixed, oversized radial blobs sit behind everything and drift using transform only (GPU):
```scss
body::before, body::after {
  content: ""; position: fixed; z-index: -1; inset: -25%;
  pointer-events: none; will-change: transform;
}
body::before {
  background: radial-gradient(42% 42% at 50% 50%, rgba(231,196,121,.11), transparent 70%);
  animation: aurora-a 34s ease-in-out infinite alternate;
}
body::after {
  background: radial-gradient(40% 40% at 50% 50%, rgba(88,167,140,.10), transparent 70%);
  animation: aurora-b 46s ease-in-out infinite alternate;
}
@keyframes aurora-a { 0% { transform: translate3d(-22%,-14%,0) scale(1); } 100% { transform: translate3d(26%,18%,0) scale(1.32); } }
@keyframes aurora-b { 0% { transform: translate3d(24%,20%,0) scale(1.12); } 100% { transform: translate3d(-20%,-16%,0) scale(1.38); } }
```
Each `.section` also carries a slow tint drift:
```scss
.section::before {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(55% 50% at 18% 0%, var(--gold-soft), transparent 60%),
    radial-gradient(50% 55% at 92% 100%, var(--verd-soft), transparent 60%);
  background-size: 200% 200%, 200% 200%;
  animation: sec-drift 30s ease-in-out infinite alternate;
}
@keyframes sec-drift { 0% { background-position: 0% 0%, 100% 100%; } 100% { background-position: 38% 28%, 64% 72%; } }
```
On phones (≤640px) the aurora slows to 70s/90s and section drift is turned off.
The portal (dashboard) uses a **static** version instead:
```scss
background:
  radial-gradient(1100px 620px at 12% -8%, rgba(231,196,121,.07), transparent 62%),
  radial-gradient(900px 520px at 100% 0%, rgba(88,167,140,.06), transparent 60%), var(--bg);
```

### 1.4 Surfaces, borders, glass
- **Frosted glass on all cards (global override):**
  ```scss
  .card, .svc-card, … { background: color-mix(in srgb, var(--surface) 58%, transparent) !important;
    backdrop-filter: blur(14px) saturate(125%); }
  ```
- **Card:** `border: 1px solid var(--line); border-radius: 18px; padding: 30px`.
- **Gradient border on hover** (mask trick):
  ```scss
  .card::before {
    content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
    background: linear-gradient(140deg, var(--gold-line), transparent 40%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: 0; transition: opacity .35s ease; pointer-events: none;
  }
  .card:hover { transform: translateY(-6px); border-color: var(--gold-line); box-shadow: var(--shadow); }
  .card:hover::before { opacity: 1; }
  ```
- **Glass on imagery:** `background: rgba(243,237,224,.05); border: 1px solid var(--line-strong); backdrop-filter: blur(6px)`.
- **Glass button:** `rgba(255,255,255,.08)`, border `rgba(255,255,255,.28)`, `blur(8px)`. On hover: bg `.16`, border `#fff`.
- **Header bar:** `rgba(7,11,20,.72)` + `blur(14px)` + bottom hairline.
- **Floating capsule (FAB):** `linear-gradient(180deg, rgba(34,28,20,.74), rgba(12,10,9,.88))`, border `rgba(231,196,121,.18)`, `blur(18px) saturate(130%)`, shadow `inset 0 1px 0 rgba(231,196,121,.18), 0 18px 50px rgba(0,0,0,.55), 0 6px 26px rgba(231,196,121,.07)`.
- **Inputs (portal):** `background: rgba(0,0,0,.24); border: 1px solid var(--line-strong); radius 12px; padding 12px 14px`. On focus: border `--gold-line`, bg `.34`. Labels are 0.72rem Sora 600, uppercase, `.11em` tracking, muted.

### 1.5 Radii
`--radius-sm: 12px` (buttons, icon tiles, inputs), `--radius: 18px` (cards), `--radius-lg: 26px` (video frame, panels, logo tiles), `--radius-pill: 999px` (chips, nav pills, eyebrow pill, FAB). Small icon squares use 9px. Portal cards use 14px.

### 1.6 Shadows
`--shadow: 0 26px 64px rgba(0,0,0,.55)` (hovered cards, video frame). `--shadow-sm: 0 12px 32px rgba(0,0,0,.42)` (lift). Accent glow shadows are always low alpha (`.22–.36`) and tinted with the accent.

### 1.7 Spacing, containers, breakpoints
- Spacing (4px base): `4, 8, 12, 16, 24, 32, 48, 64, 96, 128` (`--space-1..10`).
- Section rhythm: `--section-y: clamp(72px, 9vw, 130px)`, and `clamp(54px, 13vw, 84px)` on phones. Tight sections use 64px.
- Container: `max-width: 1200px; padding: 0 clamp(20px, 3.6vw, 56px)`. Gutter is 24px ≤768 and 16px ≤640.
- Header height 68px (44px in landscape mobile). Portal: sidebar 264px, sticky top bar 68px, main `max-width: 1280px`.
- Content widths: section-head 760px, hero content 740px, hero lead 560px, CTA inner 760px, video 980px, prose `56ch`.
- Breakpoints in use: **1240, 1040, 900, 880 (nav → burger), 768, 760, 640, 600**, plus `(max-height:500px) and (orientation:landscape)`, `(hover:hover) and (pointer:fine)`, `(hover:none)`, `(pointer:coarse)`. Portal sidebar collapses at 1000px.
- Tailwind v4 mapping: `md` = 768, `lg` = 1040 (custom), `xl` = 1240.

---

## 2. Typography

**Google Fonts loaded** (index.html): `Fraunces:ital,opsz,wght@0,9..144,400;500;600;700;1,9..144,400`, `Inter:300..800`, `Sora:400..800`, `Space Grotesk:400..700`, plus unused/legacy Playfair Display, Cinzel, Libre Baskerville, Rajdhani, Noto Naskh Arabic. That request is far too heavy. For TPUB, load only what is used, through `next/font`.

| Role | Family | Weight | Size | LH | Tracking |
|---|---|---|---|---|---|
| `--font-display` | **Fraunces** (fallback Playfair, Georgia) | 600 | display `clamp(2.9rem, 6vw, 5rem)` | 1.02 (1.08 mobile) | -0.02em |
| h1 | Fraunces | 600 | `clamp(2.3rem, 4.6vw, 3.6rem)` | 1.12 | -0.015em |
| h2 | Fraunces | 600 | `clamp(1.85rem, 3.4vw, 2.85rem)` | 1.12 | -0.015em |
| h3 | Fraunces (Sora in list rows) | 600 | `clamp(1.3rem, 2vw, 1.6rem)` | 1.12 | -0.015em |
| lead | Inter | 400 | `clamp(1.05rem, 1.4vw, 1.25rem)` | 1.7 | normal; `text-wrap: pretty`; muted colour |
| body | **Inter** | 400 | 1rem | 1.6 | antialiased |
| small | Inter | 400–500 | 0.875rem | 1.55–1.6 | |
| xs | Inter / Sora | 500–600 | 0.78rem | | |
| `--font-label` eyebrow | **Sora** | 600 | 0.78rem | | **0.22em, UPPERCASE**, colour gold-2 |
| Buttons | Sora | 600 (primary 700) | 0.875rem | | |
| Nav links | Sora | 500 | 13px | | 0.01em |
| Brand wordmark | Sora | 700 | 13.5px | | 0.14em, uppercase; subline 10px at 0.13em in gold-2 |
| Footer column h4 | Sora | 700 | 9.5px | | 0.22em uppercase gold |
| Footer monument name | Sora | 700 | `clamp(13px,1.8vw,22px)` | | **0.36em**, gold gradient text |

Heading treatments:
- All headings use `text-wrap: balance`.
- **Gradient text** (`.gold-text`) is applied to *the second half* of a headline only: "One ecosystem. / **Every service you need.**", "Build the thing, **not the slide deck**", "What we're **writing**". Never the whole headline.
- **Eyebrows** are uppercase, tracked 0.22em, and preceded by a 26px gradient dash that pulses (opacity .55 → 1 over 3.4s). In centred `section-head` the dash is hidden. In the hero the eyebrow becomes a **pill**: `padding 8px 16px; border 1px gold-line; radius pill; bg gold-soft; blur(6px)`.
- No italics in practice, although the Fraunces italic is loaded.
- `.display-alt` gives an alternative geometric display: Space Grotesk 700, -0.02em, LH 1.04.
- Big numbers (stats, list indices `01`, `02`) use the display serif, in the accent/cluster colour.

---

## 3. Layout and section patterns

### 3.1 App shell
Structure: `scroll-progress` bar (3px fixed gold gradient, CSS `animation-timeline: scroll(root)`, hidden when unsupported or under reduced motion) → header → `<main>` → footer. Private spaces (`/portal`, `/interne`) hide the marketing header and footer and render their own shell with a sidebar. **TPUB should split the same way: a `(marketing)` layout and an `(espace)` layout.**

### 3.2 Header / nav behaviour (distinctive)
- **At the top of the page:** a fixed full-width bar, 68px, glass (`rgba(7,11,20,.72)` + blur 14px + hairline bottom). The **logo is dead centre**, with nav groups `flex:1` on each side (left group `justify-content:flex-end`, right group `flex-start`). Four items per side keep the logo optically centred. On load it slides in (`hdr-in .7s`), the brand appears at 0.14s and links cascade outward from the logo (0.24 / 0.32 / 0.40s).
- **Nav link:** a pill, `padding 7px 13px`, muted colour. On hover the text lightens and an **underline slides in** from the left (`scaleX(0→1)`, 1.5px gold gradient, inset to the label). **Active** is a champagne pill: `linear-gradient(180deg, rgba(gold,.2), rgba(gold,.06))` + `inset 0 0 0 1px rgba(gold,.24)`, text gold-light, no underline.
- **Client-login CTA inside the nav:** a gold-outlined pill (`gold-soft` bg, `gold-line` border, gold text, FA icon). On hover it fills with a `gold-light → gold-2` gradient, `on-gold` ink and a glow shadow. It reads as a door, not a page link.
- **Once scrolled (>24px):** the full header slides up and out (`translateY(-100%)`, `.42s cubic-bezier(.4,0,.2,1)`). Three things replace it:
  1. A **floating capsule nav bar centred at the bottom** (FAB). It springs in with `transform .5s cubic-bezier(.34,1.3,.42,1)` (overshoot) and its zones assemble at 0.1 / 0.16 / 0.22s. Layout: links | hairline | logo | hairline | links + CTA.
  2. A **fixed corner logo** at top-left (44px, drop-shadow glow).
  3. A **Tunisian flag** badge at top-right (42×28, 7px radius). Both unblur in (`blur(5px)` + `scale(.85)` → none; the flag is 0.08s late).
- **Mobile (≤880px):** the burger becomes a 44px frosted round button with a gold-line border. Its three bars morph into an X (`translateY(7px) rotate(45deg)`, middle `scaleX(.4)` + fade). The FAB shrinks to just the burger. The drawer drops from the top (`translateY(-102%) → 0`, `.55s ease-out`, bg `rgba(7,11,20,.97)` blur 16). Links are 48px tall, separated by hairlines, and cascade in with 0.05s steps from 0.08s. The client link is split off by a top border and coloured gold. Escape closes it.
- **For TPUB:** the centred-logo header and the bottom capsule bar are the most recognisable parts of the group look. Reuse them on marketing pages, keeping the TPUB logo centred and "Espace annonceur" as the gold-pill equivalent (brand-red/orange).

### 3.3 Hero construction
- **Home hero:** `min-height: 100vh` (100svh mobile), with a full-bleed `<video muted loop playsinline>` lazily played (IntersectionObserver). The scrim is layered:
  ```scss
  .hero-scrim { background:
    linear-gradient(180deg, rgba(10,8,6,.74) 0%, rgba(10,8,6,.52) 40%, rgba(10,8,6,.88) 100%),
    radial-gradient(1100px 600px at 75% 30%, rgba(231,196,121,.14), transparent 60%); }
  ```
  Content is left-aligned, max 740px: eyebrow pill → display h1 split into two masked lines (second line gradient) → lead (560px, text-soft) → CTA row (primary + glass). Below that: a **scroll cue** (22×34 mouse outline with an animated dot, "SCROLL" tracked label, hidden ≤1040px). The **stat band** is pinned to the hero bottom: `border-top: gold-line; bg rgba(10,8,6,.46); blur(10px)`, four columns (two on mobile), serif numbers in gold gradient that **count up**, xs muted labels, and vertical gradient dividers.
- **Masked line reveal** (headline lines rise out of a clip):
  ```scss
  .hl { display: block; overflow: hidden; padding-bottom: .12em; margin-bottom: -.12em; }
  .hl-in { display: inline-block; transform: translateY(112%); transition: transform .8s cubic-bezier(.16,1,.3,1); }
  .hl:nth-child(2) .hl-in { transition-delay: .14s; }
  .hero-content.in .hl-in { transform: none; }
  /* eyebrow/lead/cta: opacity 0 + translateY(18px); lead delay .34s, cta .5s */
  ```
- **Inner page hero (`.page-hero`):** `padding: 150px 0 70px`, background image with slow **Ken Burns** (`scale(1.06) → scale(1.16) translate(-1.5%,-1.5%)`, 26s alternate), scrim `linear-gradient(180deg, rgba(7,11,20,.74), rgba(7,11,20,.92)) + radial-gradient(900px 460px at 78% 20%, rgba(240,205,97,.12), transparent 60%)`. Content: eyebrow.light → display h1 with a gradient phrase (`reveal-blur`) → lead → hero-cta. Delays .05 / .18 / .34s.
- **Entity hero (company page):** `min-height: 70vh; align-items: flex-end` (content sits at the bottom). Order: breadcrumb (sm, chevrons at 9px .6 opacity) → identity row (84px glass logo tile radius 26 + level label in Sora uppercase gold with a status pill + display name + role) → serif tagline `clamp(20px,3vw,30px)` → CTA row. The scrim's radial uses the **entity colour**: `color-mix(in srgb, var(--cc) 26%, transparent)`.

### 3.4 Section header pattern
```html
<div class="section-head">  <!-- max-width 760, centred, margin-bottom 48px -->
  <span class="eyebrow">What we provide</span>   <!-- no dash when centred -->
  <h2>Services across six domains</h2>           <!-- margin 16px 0 12px -->
  <p>Pick a single capability or a fully integrated…</p> <!-- lead size, muted, balance -->
</div>
```
Eyebrows are 2–3 words. Titles are short (3–7 words), the lede is one sentence. Alternate: **left-aligned editorial split** ("statement"), a grid `1.1fr .9fr`, left eyebrow (with dash) + display h2, right lead + ghost button, with the right column having `padding-left: 24px; border-left: 1px solid var(--gold-line)`.

### 3.5 Card grids
- **Service card** (`svc-card`): 3 columns (2 at ≤1040, 1 at ≤640), gap 24. A 3px top bar in the category colour `--cc`, a 44px icon tile (surface-2, radius 12, icon in `--cc`) that on hover does `translateY(-3px) rotate(-4deg)`, then h3, muted sm paragraph (`flex:1`) and pill tags. It has **3D tilt** (max 5.5°, scale 1.012, lerp .14) and a **cursor spotlight**. An odd last card is centred: `.svc-grid > :last-child:nth-child(3n+1) { grid-column: 2; }`.
- **Image sector card:** height `clamp(260px,38vh,360px)` (4-up on desktop), radius 18, image fills the card, overlay `linear-gradient(180deg, rgba(10,8,6,.12) 0%, .52 45%, .96 100%)`, a 4px colour top bar, content at the bottom. **On hover:** a second overlay tinted with `--cc` fades in, the paragraph expands (`max-height 0→80px`), the "View services →" arrow nudges 4px and the image Ken Burns speeds up (7s).
- **Why/feature card:** 56px tinted icon tile (`--cc` 12% fill, 30% border), h3, muted body. It uses tilt + spotlight.
- **Numbered list rows** (company services): a full-width card row with a serif `01` in `--cc` (scales 1.12 on hover), Sora h3 + small "by X" meta, and an "Enquire →" link on the right. **The row slides right 8px** on hover instead of lifting.
- **Related cards:** a horizontal card with a 3px left colour bar, 52px logo tile and an arrow that turns gold and moves 4px on hover.
- **Sticky "At a glance" aside:** a card, `position: sticky; top: 96px`, with a `dl` whose rows are separated by hairlines, `dt` xs uppercase muted-2 and a full-width primary button. **Good template for campaign summary / booking recap.**
- **Filter chips:** Sora sm 600 pills. Hover lifts 2px with a gold-line border. `.on` = gold gradient fill with on-gold ink; `:active` scales .97.
- **Portfolio card:** 16/10 cover, gradient scrim at the bottom, a tag pill top-left (`color-mix(--cc 78%, dark)`, blur 4), then the body.
- **R&D card:** a 3px gold top bar that **draws left→right** (`scaleX 0→1`, .8s, .35s delay) once the grid reveals, and lifts 5px on hover.

### 3.6 Stat band
See the hero band above. Elsewhere, a "glass pillar" pattern: `rgba(243,237,224,.05)` + line-strong + blur 6, 26px gold icon, serif value, xs uppercase `.08em` label.

### 3.7 Feature rows with images (immersive split)
Porteur feature: a full-bleed image behind a **directional scrim** `linear-gradient(110deg, rgba(10,8,6,.96) 38%, rgba(10,8,6,.7) 70%, rgba(10,8,6,.55))` (dark where the text is, image visible on the right). Grid `1.05fr .95fr`. Left: eyebrow.light, display h2, lead, primary CTA (`reveal-left`). Right: a 2-column list of glass items (34px gradient gold icon square, bold title, muted entity) with a hover that slides 6px and rotates the icon -10° at 1.12 scale (`reveal-right` + stagger).

### 3.8 CTA band
Full-bleed image, scrim `linear-gradient(180deg, rgba(10,8,6,.82), rgba(10,8,6,.94))`, centred inner 760px: display h2 (one long, conversational sentence), lead, centred CTA row (primary + glass). Uses `reveal-blur`.
Careers alternative: an **apply panel** card, grid `1.6fr 1fr`, `padding: 48px; radius 26; border line-strong`. Left has copy, right stacks buttons.

### 3.9 Marquee logo strip
Two identical tracks, each `translateX(-100%)` over 30s linear (56s on phones), pausing on hover. Edges fade with `mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)`. Pills are 164×120 cards.

### 3.10 Footer ("editorial monument")
A full viewport tall on desktop, dark gradient `var(--bg) → #06080e`, top 1px gold gradient line with glow and a radial bloom `60% 40% at 50% 0%, rgba(gold,.06)`. From top to bottom:
1. **Monument wordmark:** the name in Sora 700 at 0.36em tracking with gold sheen, centred.
2. **Intro:** centred tagline (sm, muted, 480px) + 36px social tiles that turn gold-filled and lift 3px on hover.
3. **Three nav columns** (h4 9.5px 0.22em gold; links 12.5px muted with underline-slide). On pointer devices, hovering a column **dims its siblings to .55** and draws a gold dash under the h4.
4. **Credits row:** tagline in gold-3 on the left ("Holding · R&D · 12 subsidiaries"), © + legal link on the right.

Each separator carries a **travelling light**: a 1px gradient highlight sweeping across (`ft-sweep 6s`, staggered -2s/-4s). The back-to-top button is a 40px gold-soft pill at the top-right. The footer uses `.reveal-blur` / `.reveal-stagger`.

### 3.11 Client space shell (portal)
Fixed 264px aside (`color-mix(surface 88%, black)`, right hairline), brand block (38px logo + Sora 0.16em name + gold subline), vertical nav (11×13px padding, radius 12, 18px icon column, hover `rgba(255,255,255,.04)`, **active = gold-soft bg + gold-line border + gold text**), an admin group separated by a hairline, and a footer link. The sticky 68px top bar (`color-mix(bg 82%, transparent)` + blur 14) holds the identity (38px gradient avatar with initials, name + uppercase role) on the left and actions on the right. Main area max 1280px, `padding: clamp(22px,3.4vw,44px) clamp(16px,3vw,34px) 96px`. Below 1000px the aside becomes a drawer with a `rgba(0,0,0,.62)` veil. A "concentrated" mode hides the aside for focused flows (for TPUB: the campaign creation wizard). Buttons in the portal are **pills** (`10px 18px`, Sora .84rem), unlike the 12px-radius marketing buttons. Spinner: a 17px ring with a gold top border rotating over .75s.

---

## 4. Motion

Tokens: `--ease: cubic-bezier(.22,.61,.36,1)` (smooth decel, used for hovers) · `--ease-out: cubic-bezier(.16,1,.3,1)` (expressive, used for reveals) · durations `--dur-1 .18s`, `--dur-2 .32s`, `--dur-3 .55s`, `--dur-4 .8s`. Spring for the FAB: `cubic-bezier(.34,1.3,.42,1)`.

**Reveal on scroll.** An IntersectionObserver with `threshold: 0, rootMargin: '0px 0px -10% 0px'` adds `.in` once, then unobserves. A documented bug explains why the threshold is 0: 12% of a very tall element is unreachable, so the element never revealed.
```scss
.reveal { opacity: 0; transform: translateY(26px); transition: opacity .8s var(--ease-out), transform .8s var(--ease-out); }
.reveal.in { opacity: 1; transform: none; }
.reveal-left { transform: translateX(-32px); }  .reveal-right { transform: translateX(32px); }  .reveal-zoom { transform: scale(.94); }
.reveal-blur { filter: blur(8px); transform: translateY(26px); transition: opacity .8s, transform .8s, filter .8s var(--ease-out); }
.reveal-blur.in { filter: none; transform: none; }
.reveal-stagger > * { opacity: 0; transform: translateY(20px); transition: opacity .55s var(--ease-out), transform .55s var(--ease-out); }
.reveal-stagger.in > * { opacity: 1; transform: none; }
.reveal-stagger.in > *:nth-child(2) { transition-delay: .07s; } /* +.07s per child, up to .35s (6th); 7th = .42s */
```
Usage: section heads use `reveal-blur`, grids use `reveal-stagger` (sometimes plus `reveal-zoom`), split columns use `reveal-left` / `reveal-right`, CTA bands use `reveal-blur`.

**Hover vocabulary:**
- Buttons lift `translateY(-2px)`, the arrow icon moves `translateX(3px)`, and the primary gets a **sheen sweep** (`::after` white 45% diagonal band `translateX(-120% → 120%)`, .6s).
- Primary CTAs have a **magnetic pull** (max 6px, lerp .16, uses the CSS `translate` property so it composes with the hover transform).
- Cards lift -6px (global) or -3/-4px (lift). Tilt cards don't lift. List rows slide +8px.
- Icon tiles: `translateY(-3px) rotate(-4deg)` or `rotate(-10deg) scale(1.12)`.
- **Spotlight:** `radial-gradient(240px circle at var(--mx) var(--my), color-mix(gold 13%, transparent), transparent 70%)` fading in on hover (fine pointers only).
- Underline slide on text links.
- Footer column sibling dimming.
- Count-up: 1.4s ease-out cubic, IO threshold .4, keeps prefix/suffix ("45+", "98%").

**Ambient motion:** aurora (34s/46s), section drift (30s), Ken Burns on hero/cover images (26–36s), a subtle float on *every* image (13s, scale 1.008→1.028), eyebrow dash pulse, gold text sheen (7s), footer line sweeps (6s), scroll-cue bob (2.4s), marquee (30s).
**Page transitions:** View Transitions API cross-fade, old `→ opacity 0, -10px`, new `from opacity 0, +14px`, .42s. In Next.js App Router this can be reproduced with the `unstable_ViewTransition` / CSS `@view-transition` or a simple template fade.

**Touch:** `@media (hover:none)` → `.btn:active { transform: scale(.96) }`, cards `:active scale(.985)`. Tap highlight is removed. ≤640px stops image float and section drift.

**Reduced motion:**
```scss
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }
  .reveal, .reveal-stagger > * { opacity: 1 !important; transform: none !important; }
  .reveal-blur { filter: none !important; }
  .marquee-track { animation: none !important; } .spotlight::after { display: none; }
  body::before, body::after { animation: none !important; }
}
```
JS effects (tilt, magnetic, spotlight, count-up) do not attach under reduced motion or on coarse pointers.

**Do not copy for TPUB:** the global `scroll-snap-type: y proximity` + `min-height: 100svh` on every section, and the 100svh footer. The code carries several long comments about bugs this caused (frozen touch scrolling, empty panels, landscape hacks with `!important`). The universal `img` float also shouldn't reach dashboard thumbnails or campaign previews.

---

## 5. Imagery style

- **Always under a scrim.** Imagery is never shown raw behind text. The scrim is a vertical dark gradient (≈.5–.75 at the top, .88–.96 at the bottom) plus a **soft accent radial glow** (gold 12–14%, or the entity colour at 26%) positioned upper-right (≈75–80% x, 20–30% y). Feature splits use a **110° directional** scrim.
- **Warm, desaturated-looking** by virtue of the near-black warm overlay. Photos are Unsplash-style editorial (cities, infrastructure, tech).
- **Aspect ratios:** 16/10 for portfolio covers, 16/9 video frame (radius 26, gold-line border, big shadow), fixed-height clamp cards for sectors, full-bleed for heroes/CTA.
- **Framing:** radius 18 (cards) / 26 (feature frames), 1px hairline border that turns gold-line on hover, `overflow: hidden; isolation: isolate`.
- **Always slowly moving** (Ken Burns), deeper on hover.
- Logos sit in glass tiles (`rgba(255,255,255,.08)` + `rgba(255,255,255,.2)` border + blur 8) or on surface pills, with `object-fit: contain` and a faint accent drop-shadow (`drop-shadow(0 2px 8px rgba(gold,.25))`).
- Colour-coded 3–4px top/left bars carry category identity without tinting the photo.

---

## 6. Copy tone and structure (corporate, English)

- **Voice:** confident, plain and concrete. It avoids hype words; short declaratives with a turn in the second half. Examples: "One ecosystem. Every service you need."; "Build the thing, not the slide deck"; "Tell us what you need — we'll bring the right companies to the table".
- **Honest status:** entities carry `live` / `rnd` / `concept` pills, and careers copy admits "most of it is still being built". **TPUB should not invent inflated stats** (the old page's "1M+ appareils" and "+300 % ROI" contradict this tone). Use real or clearly-labelled target figures.
- **Section recipe:** eyebrow (2–3 words: "What we provide", "Why work with us", "In motion") → title (3–7 words, benefit or noun phrase) → one-sentence lede that explains the *so-what* for the client. Titles often use the client's perspective ("so clients engage a single group instead of a dozen vendors").
- **CTAs:** verb + object, with an arrow icon ("Explore our services →", "Start a conversation →", "Request this service →", "Talk to us"). Secondary CTAs are glass/ghost buttons with softer verbs ("See what we work on").
- **Cards:** a title of 2–3 words + a single short sentence ("From booking to broadcast, handled."; "Impressions and analytics you can act on.").
- **Existing TPUB entry in corporate data:** tagline "Reach real audiences on real screens." Services: Digital out-of-home advertising · Screen & display networks · Campaign management · Audience measurement & analytics. Features: Screen network / Campaign management / Measured audience. Clients: Brands · agencies · advertisers. Status: `concept`. Cluster: Media, Audience & Data (`--c-audi #e08bb0`). TPUB powers Porteur core n°2, "Advertising screen".

---

## 7. Proposed TPUB palette (dark-first, logo-derived)

Logo colours sampled from `tpub.png`: red **#DF1B25 / #E31627**, orange **#F07019**, blue **#0255A3**. The brief's values (#E11D2A / #F07A1A / #0A5CA8) match within a few units, so we use the brief's values as canonical.

### 7.1 Strategy (why)
1. **Keep the corporate structure and swap the hue.** Corporate uses a warm near-black with a single champagne accent. TPUB uses a **cool-neutral ink** (a hint of blue, to echo the logo's blue and the "screen/LED" world) with a **warm signal accent** (red→orange, the top bar + stem of the T).
2. **Three logo colours but one lead accent per context.** Using all three at equal weight would recreate the rainbow look of the old tpub.html. Roles:
   - **Red = brand & signal.** Logo, the thin brand hairline/glow, key numbers, the marketing primary CTA gradient start, the "live / en diffusion" dot.
   - **Orange = energy & emphasis.** Gradient partner of red, gradient text in headlines (replaces `.gold-text`), eyebrows, hover glows.
   - **Blue = trust & data.** Links, focus rings, charts, info, and the **primary action colour inside the dashboard**.
3. **Avoid red-vs-danger confusion in the client space.** In the dashboard, primary buttons are **blue** and red is reserved for the brand mark and destructive actions (which always carry an icon + label). On marketing pages the primary CTA is the **red→orange gradient**, which reads as brand rather than error.
4. Dark raw brand red `#E11D2A` is only **4.13:1** on the dark ground, which is under AA for body text. So brand red/blue are used as **fills** (white text on them passes), and lighter **"-text" tints** are used for coloured text on dark.

### 7.2 Dark token set (marketing + default client space)

| Token | Hex | Role | Contrast (AA 4.5 body / 3.0 large) |
|---|---|---|---|
| `--bg` | `#0A0B10` | page ground | |
| `--bg-2` | `#0F1117` | alternating bands, sidebar | |
| `--surface` | `#151821` | cards, inputs | |
| `--surface-2` | `#1C2029` | icon tiles, tags, table header, hover rows | |
| `--surface-3` | `#252A35` | pressed/selected, scrollbar | |
| `--line` | `rgba(245,243,239,.08)` | hairline | |
| `--line-strong` | `rgba(245,243,239,.15)` | inputs, ghost buttons | |
| `--text-strong` | `#FFFFFF` | headings over imagery | 16.3 on surface-2 |
| `--text` | `#F5F3EF` | body | **17.74** on bg · **14.71** on surface-2 |
| `--text-soft` | `#D5D8DE` | lead over imagery | **13.77** on bg · 11.42 on surface-2 |
| `--muted` | `#A3A9B5` | secondary text, nav | **8.33** on bg · 7.51 surface · 6.91 surface-2 |
| `--muted-2` | `#7F8693` | tertiary, captions, placeholders | **5.37** bg · 4.84 surface · **4.45 surface-2 (just under AA; use only ≥14px bold or non-essential on surface-2)** |
| `--red` | `#E11D2A` | brand fill (logo red) | white on it **4.76** ✓; as text on bg 4.13 ✗ (large text only) |
| `--red-600` | `#C8101C` | pressed/hover-dark fill | white on it **5.92** |
| `--red-text` | `#FF5A63` | red text/icons on dark | **6.45** bg · 5.82 surface · 5.35 surface-2 |
| `--orange` | `#F07A1A` | brand fill, gradient, eyebrow | **7.02** as text on bg; ink `#1A0F05` on it **6.73**; ⚠ white on orange only 2.80, **never white text on orange** |
| `--orange-text` | `#FF9A45` | orange text on raised surfaces | 8.41 surface · 7.73 surface-2 |
| `--blue` | `#0A5CA8` | brand fill, dashboard primary button | white on it **6.75** ✓; as text on dark 2.88 ✗ |
| `--blue-text` | `#5AA9F0` | links, focus ring, chart primary | **7.83** bg · 6.50 surface-2 |
| `--red-soft` / `--red-line` | `rgba(225,29,42,.12)` / `.30` | tinted fills/borders | |
| `--orange-soft` / `--orange-line` | `rgba(240,122,26,.12)` / `.30` | active nav pill, hover | |
| `--blue-soft` / `--blue-line` | `rgba(10,92,168,.16)` / `.38` | selected rows, info bg | |
| `--success` | `#34D399` | diffusée, approuvée, payée | **9.22** on surface |
| `--warning` | `#FBBF24` | en attente de modération, budget bas | **10.62** on surface |
| `--danger` | `#F87171` | rejetée, échec, erreur | **6.41** on surface (distinct from brand red: pinker, lighter) |
| `--info` | `#60A5FA` | brouillon, programmée | **6.97** on surface |
| `--on-brand` | `#FFFFFF` | ink on red/blue fills | |
| `--on-orange` | `#1A0F05` | ink on orange fills | |

Status badge recipe (from corporate): `color: var(--sc); background: color-mix(in srgb, var(--sc) 12%, transparent); border: 1px solid color-mix(in srgb, var(--sc) 30%, transparent)`, plus a 6px dot. Suggested campaign-state mapping: Brouillon → info · En modération → warning · Approuvée/Programmée → blue-text · En diffusion → success with a pulsing dot · Terminée → muted · Rejetée → danger.

**Gradients:**
```css
--grad-brand:   linear-gradient(120deg, #E11D2A 0%, #F0501F 48%, #F07A1A 100%);   /* primary CTA (marketing), avatar, progress */
--grad-text:    linear-gradient(100deg, #FF5A63, #FF9A45, #FFC08A, #FF9A45, #FF5A63); /* animated sheen, bg-size 220% */
--grad-tricolor:linear-gradient(90deg, transparent, #E11D2A 22%, #F07A1A 50%, #0A5CA8 78%, transparent); /* footer/header hairline, scroll-progress: the only place all 3 appear together */
--grad-card:    linear-gradient(180deg, var(--surface), var(--bg-2));
```
- White text on the brand gradient: the lightest stop `#F07A1A` gives 2.80, which is not enough. **Use ink `#1A0F05` on the gradient CTA** (≥6.7 across the orange half; on the red end it is ≈4.2), **or** use a red-weighted gradient `#C8101C → #E0461A` with white text (≥5.9 on the red side). Recommendation: **white label + `linear-gradient(120deg, #C8101C, #E11D2A 55%, #E8551C)`** with the orange carried by the glow shadow `0 12px 30px rgba(240,122,26,.28)` + `inset 0 1px 0 rgba(255,255,255,.35)`. This keeps a warm, bright feel and passes AA at the label position.

**Aurora (TPUB version):**
```css
body::before { background: radial-gradient(42% 42% at 50% 50%, rgba(240,122,26,.10), transparent 70%); animation: aurora-a 34s ease-in-out infinite alternate; }
body::after  { background: radial-gradient(40% 40% at 50% 50%, rgba(10,92,168,.14), transparent 70%); animation: aurora-b 46s ease-in-out infinite alternate; }
/* optional third, very faint red at the hero only: radial-gradient(900px 500px at 78% 22%, rgba(225,29,42,.12), transparent 60%) */
```
This gives a warm orange drift against a cool blue drift, mirroring the logo's stem and bowl, with red kept for sharp marks. The hero scrim should be `linear-gradient(180deg, rgba(10,11,16,.72), rgba(10,11,16,.5) 40%, rgba(10,11,16,.9))` + a red/orange radial glow top-right.

**Signature DOOH touch (optional, on-brand):** a faint LED-pixel grid on hero/feature imagery, e.g. `background-image: radial-gradient(rgba(255,255,255,.06) 1px, transparent 1.2px); background-size: 4px 4px;` over the scrim at 40% opacity. It evokes a screen without clip-art.

### 7.3 Light variant (client dashboard work surfaces, optional)
Corporate keeps the portal dark, and **dark-first is recommended for TPUB's shell too**, for brand continuity. Dense data screens (tables, invoices, media library, long forms) can offer a light theme via `data-theme="light"`:

| Token | Hex | Contrast |
|---|---|---|
| `--bg` | `#F7F7F5` | |
| `--bg-2` | `#EFEFEC` | |
| `--surface` | `#FFFFFF` | |
| `--surface-2` | `#F3F4F6` | |
| `--line` / `--line-strong` | `rgba(15,18,25,.08)` / `.14` | |
| `--text` | `#0F1219` | **18.74** on white · 17.47 on bg |
| `--muted` | `#4A5160` | **7.96** white · 7.42 bg |
| `--muted-2` | `#6B7280` | **4.83** white · 4.51 bg (AA, borderline) |
| `--red` (brand + text) | `#C8101C` | **5.52** on bg; white on it 5.92 |
| `--orange-text` | `#B4530A` | **5.02** white · 4.68 bg (keep raw `#F07A1A` for fills/illustration only) |
| `--blue` (primary/link) | `#0A5CA8` | **6.30** on bg · 6.75 white |
| `--success` | `#067647` | 5.31 on bg |
| `--warning` | `#B54708` | 5.06 on bg |
| `--danger` | `#B42318` | 6.13 on bg |
| `--info` | `#175CD3` | 5.58 on bg |

In light mode the sidebar stays dark (`#0F1117`) so the brand frame persists and only the work canvas turns light. Aurora is off, and there is a static 4% orange/blue radial at the top corners.

### 7.4 Typography for TPUB
- **Recommended:** `Sora` (display + headings, 600/700, tracking -0.02em; its geometry matches the T/P monogram and it is already the group's label font) + `Inter` (body/UI, 400/500/600, tabular numbers for dashboards via `font-variant-numeric: tabular-nums`). Optionally add `Fraunces` 600 **only** for large marketing display lines, if closer kinship with the corporate site is wanted. Load via `next/font/google` with `subsets: ['latin', 'latin-ext']` (French accents), `display: 'swap'`.
- Keep the corporate scale verbatim (`--fs-display` … `--fs-xs`), the uppercase 0.22em eyebrow with the 26px gradient dash (red→orange), and gradient text on the second half of headlines.

### 7.5 Tailwind v4 starter (`app/globals.css`)
```css
@import "tailwindcss";
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

@theme {
  --color-bg: #0A0B10; --color-bg-2: #0F1117;
  --color-surface: #151821; --color-surface-2: #1C2029; --color-surface-3: #252A35;
  --color-ink: #F5F3EF; --color-ink-strong: #FFFFFF; --color-ink-soft: #D5D8DE;
  --color-muted: #A3A9B5; --color-muted-2: #7F8693;
  --color-line: rgb(245 243 239 / .08); --color-line-strong: rgb(245 243 239 / .15);
  --color-brand-red: #E11D2A; --color-brand-red-600: #C8101C; --color-brand-red-text: #FF5A63;
  --color-brand-orange: #F07A1A; --color-brand-orange-text: #FF9A45; --color-on-orange: #1A0F05;
  --color-brand-blue: #0A5CA8; --color-brand-blue-text: #5AA9F0;
  --color-success: #34D399; --color-warning: #FBBF24; --color-danger: #F87171; --color-info: #60A5FA;

  --font-display: var(--font-sora), "Sora", system-ui, sans-serif;
  --font-sans: var(--font-inter), "Inter", "Segoe UI", sans-serif;
  --font-label: var(--font-sora), "Sora", sans-serif;

  --radius-sm: 12px; --radius-md: 18px; --radius-lg: 26px;
  --shadow-card: 0 26px 64px rgb(0 0 0 / .55); --shadow-lift: 0 12px 32px rgb(0 0 0 / .42);
  --ease-smooth: cubic-bezier(.22,.61,.36,1); --ease-expo: cubic-bezier(.16,1,.3,1);
  --breakpoint-lg: 65rem;   /* 1040 */
  --breakpoint-xl: 77.5rem; /* 1240 */

  --text-display: clamp(2.9rem, 6vw, 5rem);  --text-display--line-height: 1.02; --text-display--letter-spacing: -.02em;
  --text-h1: clamp(2.3rem, 4.6vw, 3.6rem);   --text-h1--line-height: 1.12;
  --text-h2: clamp(1.85rem, 3.4vw, 2.85rem); --text-h2--line-height: 1.12;
  --text-h3: clamp(1.3rem, 2vw, 1.6rem);
  --text-lead: clamp(1.05rem, 1.4vw, 1.25rem); --text-lead--line-height: 1.7;
}
:root[data-theme="light"] { /* redefine the --color-* tokens from §7.3 */ }

@utility container-site { width: 100%; max-width: 1200px; margin-inline: auto; padding-inline: clamp(20px, 3.6vw, 56px); }
@utility eyebrow { display:inline-flex; align-items:center; gap:9px; font-family:var(--font-label); font-size:.78rem; font-weight:600; letter-spacing:.22em; text-transform:uppercase; color:var(--color-brand-orange); }
@utility text-gradient-brand { background-image: linear-gradient(100deg,#FF5A63,#FF9A45,#FFC08A,#FF9A45,#FF5A63); background-size:220% auto; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; animation: sheen 7s linear infinite; }
@keyframes sheen { to { background-position: 220% center; } }
```
Reveal helpers: implement a tiny `<Reveal variant="up|left|right|zoom|blur" stagger>` client component (IntersectionObserver, `threshold: 0`, `rootMargin: "0px 0px -10% 0px"`, add `data-in`) plus the CSS from §4. Tilt / magnetic / spotlight become small hooks gated on `matchMedia('(hover:hover) and (pointer:fine)')` and not reduced motion.

---

## 8. TPUB marketing content (harvested from tpub.html, rewritten in clean French)

Source facts: the old page targeted PFE students, with an IoT/LED hero, stats, about, a tech stack, PFE subjects and a contact form. The PFE subject descriptions reveal the real product model. **Drop** the PFE framing, the generic tech-stack logos (AWS/Hadoop/TensorFlow…), the emoji icons and the unverifiable figures ("1M+ appareils", "+300 % ROI", "100 % ciblage").
Product model, as described in the subjects: a client account → subscription/plans → campaign creation and scheduling → admin moderation/validation → a decision engine picks content by region, hour, zone type and active campaigns → broadcast on **two media**: users' devices connected to the AEROLINK network, and **LED screens mounted on the Tukhnanutha Porteurs** → broadcast logs → display statistics → analytics dashboard → invoicing. Also: national supervision of screens (fault detection), **emergency messages override ads**, municipal/institutional partnerships, priority zones, national rollout.

### 8.1 Hero
- Eyebrow: `Affichage numérique · Tunisie`
- Titre : **La rue devient votre écran.** / *Diffusez là où la Tunisie regarde.* (the second line takes the gradient)
- Alternatives: "Vos campagnes, sur les écrans qui comptent." · "Réservez l'espace urbain en quelques clics."
- Lede : « TPUB est la plateforme tunisienne de publicité numérique extérieure : choisissez vos zones, déposez vos visuels, et suivez chaque diffusion sur un réseau d'écrans LED connectés. »
- CTA : `Lancer une campagne →` (primaire) · `Voir le réseau d'écrans` (verre)
- Microcopy under the CTAs: « Sans engagement · Validation des contenus sous 24 h · Rapports de diffusion détaillés » (the 24h figure is to be confirmed by the team)

### 8.2 Stat band (verify real numbers before launch, and label targets honestly)
- `24` gouvernorats visés
- `XX` écrans actifs (réel), or "Écrans LED urbains" with a real count
- `24/7` diffusion supervisée
- `100 %` des contenus vérifiés avant diffusion (modération IA + humaine; this is a process claim, so it is safe)

### 8.3 « Pourquoi TPUB » (4 cards)
Eyebrow `Pourquoi TPUB`. Titre « La publicité extérieure, enfin pilotable ». Lede « Tout ce qu'il fallait négocier au téléphone se fait désormais en ligne, en temps réel. »
1. **Réseau national** : « Des écrans LED installés sur les porteurs Tukhnanutha, dans les zones à fort passage, avec une couverture qui s'étend gouvernorat par gouvernorat. »
2. **Ciblage par zone et par horaire** : « Choisissez les zones, les créneaux et le type de lieu. Le moteur de diffusion place vos contenus au bon endroit, au bon moment. »
3. **Contenus vérifiés** : « Chaque visuel est analysé par notre modération automatique, puis validé avant sa mise à l'antenne. Votre marque apparaît dans un environnement sûr. »
4. **Mesure transparente** : « Journal de diffusion, impressions estimées et statistiques par zone : vous savez exactement ce que votre budget a produit. »

### 8.4 Double diffusion (feature split with image)
Eyebrow `Deux supports, une campagne`. Titre « Sur l'écran de la rue et dans la poche du passant ».
Lede « TPUB diffuse sur deux canaux complémentaires : les écrans LED urbains pour l'impact visuel, et les appareils connectés au réseau AEROLINK pour la proximité. » (Only if the AEROLINK channel is actually offered in V1. Otherwise present it as « Bientôt ».)
List items: Écrans LED urbains · Réseau connecté AEROLINK · Planification centralisée · Rapports unifiés

### 8.5 Comment ça marche (4 steps, numbered 01–04)
Eyebrow `Comment ça marche`. Titre « De l'idée à l'écran en quatre étapes ».
1. **Créez votre compte** : « Inscription en quelques minutes, pour une entreprise ou une agence. »
2. **Composez votre campagne** : « Sélectionnez les supports et les zones, fixez les dates, les créneaux et le budget. »
3. **Déposez vos contenus** : « Images ou vidéos au bon format. Notre modération les vérifie et vous prévient en cas de souci. »
4. **Suivez la diffusion** : « Votre campagne passe à l'antenne. Suivez les diffusions et les statistiques depuis votre tableau de bord, et téléchargez vos factures. »

### 8.6 Espace annonceur (dashboard showcase)
Eyebrow `Votre espace annonceur`. Titre « Un tableau de bord, toutes vos campagnes ».
Bullets : Création et planification des campagnes · Bibliothèque de médias · Suivi de modération en temps réel · Statistiques d'affichage par zone et par écran · Abonnements, paiements et factures · Historique complet des diffusions.
CTA `Accéder à mon espace →`

### 8.7 Cas d'usage (image cards, 4-up)
Eyebrow `Pour qui`. Titre « Une audience réelle, pour chaque ambition ».
- **Marques nationales** : « Lancements de produits et campagnes de notoriété sur tout le territoire. »
- **Commerces de proximité** : « Faites venir le quartier : diffusez uniquement autour de votre point de vente. »
- **Agences média** : « Gérez les campagnes de plusieurs clients depuis un même compte, rapports à l'appui. »
- **Institutions et municipalités** : « Informez les citoyens : événements, services publics, campagnes de sensibilisation. »

### 8.8 Confiance / service public
Eyebrow `Responsabilité`. Titre « Un réseau utile, même quand il ne vend rien ».
Lede « En cas d'alerte, les messages d'urgence des autorités sont prioritaires et remplacent immédiatement les publicités programmées. Nos écrans font aussi partie du dispositif d'information citoyenne. »
Plus: « Supervision nationale des écrans : détection des pannes et maintenance suivie » and « Données protégées, accès sécurisés ».

### 8.9 Écosystème
Eyebrow `Groupe Tukhnanutha`. Titre « Porté par un écosystème technologique tunisien ».
Lede « TPUB est la filiale média du groupe Tukhnanutha. Ses écrans sont intégrés au Porteur, la cellule standardisée du groupe qui réunit connectivité, énergie et supervision. Chaque porteur déployé est un point de diffusion de plus. »
CTA `Découvrir le groupe` (external link to tukhnanutha.com)

### 8.10 Mission (short statement block)
« Rendre la publicité numérique de qualité accessible à toutes les entreprises tunisiennes, et offrir aux passants des messages pertinents, jamais intrusifs. »

### 8.11 CTA final
Titre « Parlez à la ville. Nous nous occupons des écrans. »
Lede « Annonceurs, agences, collectivités : créez votre compte ou échangez avec notre équipe commerciale. »
CTA `Lancer une campagne →` · `Contacter l'équipe`

### 8.12 Contact block / footer
- Contact: Tunis, Tunisie · contact@tpub.tn (from the old page; verify) · Lun–Ven, 9 h–18 h. The phone number was a placeholder (`+216 XX XXX XXX`) and must not be used.
- Contact form subjects: Publicité · Partenariat · Collectivité / institution · Information · Autre
- Footer columns: **Plateforme** (Fonctionnement, Réseau d'écrans, Tarifs, Espace annonceur) · **Ressources** (Formats et spécifications des contenus, Centre d'aide, Blog) · **Légal** (Conditions d'utilisation, Politique de confidentialité, Mentions légales, Cookies)
- Footer credits tagline (gold-3 equivalent in orange-text): « Affichage numérique · Tunisie · Groupe Tukhnanutha » · « © 2026 TPUB. Tous droits réservés. »
- Monument wordmark: `TPUB`, Sora 700, tracking 0.36em, brand gradient text, with the tricolour hairline sweep under it.
