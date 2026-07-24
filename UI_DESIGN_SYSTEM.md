# PIALAX UI Design System — PIA-031

_Date: 2026-07-24 · Author: A2 (Design System) · Consumers: A3 (desktop `pialax.html`), A4 (mobile `pialax-mobile.html`) · Canonical CSS: **`ui-tokens.css.frag`** (paste verbatim at the top of each file's `<style>`, replacing the existing `:root`)_

This spec systematizes the existing PIALAX identity — it does **not** replace it. The dark navy/slate look (`#07101e`-family surfaces, `#2e7cf6` blue accent) is kept and formalized; every hardcoded hex/size in the A1 inventory (§V) maps to a token below or is intentionally kept raw with a reason (§7).

---

## 1. Design principles

1. **Dark-first, light-capable.** The dark navy dashboard is the primary design; light mode is a full override of the *same* custom properties via `@media (prefers-color-scheme: light)` — no second stylesheet, no class toggles, no duplicated component CSS.
2. **Watchlist-as-home.** PIALAX is a trip watchlist / group-coordination product. Visual hierarchy serves that framing: watchlist stage colors and data-freshness pills are first-class token families, not ad-hoc hexes.
3. **No external assets (CSP is law).** Fonts are the system stack only (`--font`); no remote images, no `@import`, no external `url()`. Icons remain emoji/inline SVG data-URIs. The existing CSP/SRI surface (inventory §S) is untouched by this layer.
4. **Estimates look like estimates.** Sample/estimate data always carries the `--sample` treatment and `~$`/`est.` labeling; live data earns `--live` green. The token layer encodes this so implementers can't drift.
5. **Evolve incrementally.** Every legacy variable name in either file is preserved as an alias (`--green`, `--text-main`, `--radius-md`, …), so the fragment can land before a single component is restyled and nothing breaks. The previously **undefined `var(--ink)` / `var(--line)`** are now defined as the canonical text/border tokens — that hazard is closed by construction.

### Recommended direction (A) — "Systematized Navy"
Keep the current identity exactly: navy surfaces, blue `#2e7cf6` accent, emerald success, amber warnings. All deltas are reconciliations (one green, one base font size, one border hex), not redesigns. **The `.css.frag` implements this.**

### Variant B (for human consideration only — not implemented)
"Warm-accent split": keep the navy shell but promote the home-airport amber (`#f59e0b`) to a co-primary "action" accent for date/trip-commitment controls (Lock dates, Get Live Fares), leaving blue for navigation/selection. It would sharpen the "browsing is free, committing costs quota" mental model, at the cost of amber double-duty with warning states. If chosen, only `--warm*` usage widens; token names are already in place.

---

## 2. Token tables

All values are the canonical dark-mode values; §5 covers light mode. Names in `code` are the custom properties in `ui-tokens.css.frag`.

### 2.1 Color — surfaces & chrome

| Token | Value | Use |
|---|---|---|
| `--bg` | `#07101e` | page background |
| `--surface` | `#0f1d2e` | sidebar, level-1 cards (mobile `--card`) |
| `--surface-2` | `#162233` | nested cards, inputs, chips (alias `--surface2`) |
| `--surface-3` | `#1e3550` | pressed/tertiary fills (was raw in `#api-clear`) |
| `--backdrop` | `rgba(0,0,0,.55)` | modal/sheet backdrop |
| `--tooltip-bg` | `rgba(8,14,26,.96)` | `#tip` map tooltip |
| `--overlay-bg` | `rgba(7,16,30,.9)` | map legend, `.route-price-panel` |

### 2.2 Color — ink & lines

| Token | Value | Use |
|---|---|---|
| `--ink` | `#e8f0f8` | primary text (**newly defined** — was referenced ~40× undefined; alias `--text`, `--text-main`) |
| `--ink-muted` | `#7a99b8` | secondary text (alias `--muted`, `--text-muted`) — see drift table |
| `--ink-faint` | `#5b7a99` | tertiary/disabled labels |
| `--ink-ghost` | `#253548` | near-invisible footer (`#sb-foot`) |
| `--ink-on-accent` | `#ffffff` | text on accent/success/danger fills (replaces raw `#fff`) |
| `--ink-on-warn` | `#07101e` | text on amber fills (replaces raw `#000` on `.src-badge`) |
| `--line` | `#1c2f45` | default border (**newly defined**; alias `--border`) — see drift table |
| `--line-strong` | `#243b55` | emphasized border (alias `--border2`) |

### 2.3 Color — accent & status

| Token | Value | Use |
|---|---|---|
| `--accent` / `--accent-dim` / `--accent-soft` | `#2e7cf6` / `rgba(46,124,246,.12)` / `.07` | brand blue, selected tint, row-hover tint (aliases `--primary`, `--a-dim`) |
| `--success` / `--success-dim` | `#10b981` / `rgba(16,185,129,.1)` | savings, live, confirmed (alias `--green` — **canonical, replaces mobile `#00c853`**) |
| `--warn` / `--warn-dim` | `#f59e0b` / `rgba(245,158,11,.12)` | pending, no-date, cached (alias `--amber`) |
| `--danger` / `--danger-dim` | `#ef4444` / `rgba(239,68,68,.1)` | errors, price-up, conflicts (alias `--red`) |
| `--info` | `#38bdf8` | informational highlight (JFK banner strong text) |

### 2.4 Color — data freshness & quota

| Token | Value | Use |
|---|---|---|
| `--live` | → `--success` | 🟢 LIVE pill (≤24h) |
| `--cached` | → `--warn` | 🟡 CACHED pill (24h–7d) |
| `--sample` | `#94a3b8` | ⚪ SAMPLE pill, estimate labeling, muted slate |
| `--booked` | `#3b82f6` | 🔒 BOOKED pill |
| `--quota-ok` / `--quota-amber` / `--quota-red` / `--quota-locked` | → success / warn / danger / danger | quota bar fill tiers (≥800 amber, ≥950 red, ⛔ lock) |

### 2.5 Color — watchlist stages & modes

| Token | Value | Use |
|---|---|---|
| `--stage-watching` | `#38bdf8` | 👀 Watching |
| `--stage-planning` | `#f59e0b` | 📝 Planning |
| `--stage-booked` | `#10b981` | ✅ Booked |
| `--stage-completed` | `#94a3b8` | 🏁 Completed |
| `--mode-family` / `--mode-solo` | `#a855f7` / `#2e7cf6` | FAMILY / SOLO chips |

Implementation note (A3/A4): `WATCHLIST_STAGES` JS colors should read these values — either use `var(--stage-*)` in generated inline styles, or keep the JS hexes byte-identical to this table (JS-side constants are allowed to stay hex where they feed SVG attrs; see §7).

### 2.6 Color — map & chart series (d3 arcs, markers, DC palette)

| Token | Value | Airport / use |
|---|---|---|
| `--co-lax` | `#2e7cf6` | LAX (alias `--lax`) |
| `--co-jax` | `#f59e0b` | JAX (alias `--jax`) |
| `--co-pia` | `#a855f7` | PIA (alias `--pia`) |
| `--co-ord` | `#06b6d4` | ORD (alias `--ord`) |
| `--co-mia` / `--co-jfk` / `--co-lhr` / `--co-cuz` / `--co-lim` | `#14b8a6` / `#ec4899` / `#e11d48` / `#22c55e` / `#eab308` | MIA / JFK / LHR / CUZ / LIM |
| `--co-fallback` | `#888` | unmodeled dest fallback |
| `--map-bg` | `#060e1a` | SVG background rect |
| `--map-land` / `--map-land-hover` | `#132134` / `#1a2f48` | state/country polygons (`.sp`) |
| `--map-outline` | → `--accent` | border strokes |
| `--map-label` / `--map-label-dim` / `--map-label-home` | `#a0c4e8` / `#4a6a88` / `#6ee7b7` | hub label / other airports / ⌂ HOME |
| `--map-hub-dot` / `--map-home-dot` | `#ffffff` / → `--success` | ★ MEETUP dot / home pulse |

### 2.7 Color — calendar tiers & trip binder

| Token | Value | Use |
|---|---|---|
| `--tier-cheap` / `--tier-mid` / `--tier-pricey` | `#10b981` / `#f59e0b` / `#ef4444` | calendar `$` tiers (aliases `--cheap`/`--mid`/`--pricey`); also sparkline down/up = cheap/pricey |
| `--tb-flight` / `--tb-trek` / `--tb-lodging` / `--tb-tour` / `--tb-transfer` / `--tb-other` | accent / success / warn / `#a855f7` / `#06b6d4` / `#94a3b8` | `TB_COL` binder segment types |

### 2.8 Color — warm block (home-airport selector)

`--warm #f59e0b`, `--warm-hover #fbbf24`, `--warm-border #d97706`, `--warm-deep #b45309`, `--warm-label #b8852b`, `--warm-ink #1a1a1a`, `--warm-option-bg #1f2937`. Replaces the raw orange cluster on `#home-sel`; the deliberate "this control is different" treatment survives, tokenized.

### 2.9 Type scale

**Base size decision: `15px` — the mobile side wins; `pialax.html` changes `font-size:14px` → `var(--fs-base)` (15px).** Rationale: 14px × the dominant `.5–.62rem` sub-scales yields 7–8.7px text on desktop, below comfortable legibility; 15px lifts the whole ramp ~7% at zero layout risk (everything is rem-relative), and unifies rem math across files so one recipe serves both.

| Token | Value | ≈px @15 | Use |
|---|---|---|---|
| `--fs-base` | `15px` | 15 | html base |
| `--fs-micro` | `.55rem` | 8.25 | badges, est-tags, sub-metadata (absorbs `.48–.57rem` cluster) |
| `--fs-tiny` | `.6rem` | 9 | labels, notes, hints (absorbs `.58–.63rem`) |
| `--fs-caption` | `.66rem` | 9.9 | pills, chips, legend, stats (absorbs `.64–.7rem`) |
| `--fs-body-s` | `.73rem` | 11 | buttons, banner body, toast (absorbs `.72–.76rem`) |
| `--fs-body` | `.82rem` | 12.3 | card headlines, date values (absorbs `.78–.88rem`) |
| `--fs-title` | `.95rem` | 14.25 | route prices, section titles (absorbs `.9–1.05rem`) |
| `--fs-price` | `1.1rem` | 16.5 | finder/hero prices |
| `--fs-display` | `1.5rem` | 22.5 | app `h1` (mobile's `1.6rem` reconciles down) |

Weights stay as-is (400/700/800/900 pattern). Line heights: `--lh-tight 1.2`, `--lh-normal 1.4`, `--lh-loose 1.65`. Fonts: `--font` (system stack), `--font-mono` (proxy-URL input).

### 2.10 Spacing scale

| Token | Value | Legacy alias |
|---|---|---|
| `--sp-1` | 4px | — (chip gaps) |
| `--sp-2` | 6px | `--space-xs` |
| `--sp-3` | 10px | `--space-sm` |
| `--sp-4` | 14px | — (card padding) |
| `--sp-5` | 16px | `--space-md` |
| `--sp-6` | 24px | `--space-lg` |
| `--sp-7` | 32px | — (section gaps) |

### 2.11 Radius scale

| Token | Value | Use | Absorbs |
|---|---|---|---|
| `--rad-xs` | 4px | micro inputs, src badges | 2/3/4px cluster |
| `--rad-sm` | 6px | calendar cells, small buttons | 5/6/7px cluster |
| `--rad-md` | 10px | default controls/cards (alias `--r`) | 8/9/10/11px cluster |
| `--rad-lg` | 14px | popovers, calendar panel (mobile alias `--radius-md`) | 14px |
| `--rad-xl` | 20px | mobile hero cards (mobile alias `--radius-lg`) | 20px |
| `--rad-sheet` | 18px | bottom-sheet top corners | 18px |
| `--rad-pill` | 999px | pills, chips, toasts, progress | 20px "pill" uses |

### 2.12 Elevation

`--shadow-1` (card focus, `0 4px 20px rgba(0,0,0,.4)`), `--shadow-2` (tooltip/popover, `0 6px 24px .6`), `--shadow-3` (modal/calendar, `0 24px 64px .75`), `--shadow-sheet` (bottom sheet, `0 -8px 40px .7`), `--focus-ring` (`0 0 0 2px rgba(46,124,246,.4)`).

### 2.13 Motion

Easings unchanged: `--ease cubic-bezier(.4,0,.2,1)`, `--fast cubic-bezier(.25,.1,.25,1)`.

| Token | Value | Use |
|---|---|---|
| `--t-fast` | .12s | micro feedback (hover, toggle) |
| `--t-quick` | .15s | default control transitions |
| `--t-med` | .18s | card border/shadow |
| `--t-slow` | .28s | toast slide |
| `--dur-pop` | .16s | calendar/sheet entrance (`calIn`) |
| `--dur-spin` | .6s | spinners |
| `--dur-arc` | 1.8s | map route dash (`rd`) |
| `--dur-blink` | 2.4s | live-pill dot |
| `--dur-pulse` | 2.6s | home-hub pulse |
| `--dur-strip` | 2.8s | meetup-strip shimmer |

**`prefers-reduced-motion: reduce`** zeroes all duration tokens and force-shortens every animation/transition (implemented in the frag). d3-injected SVG keyframes (`rd`, `pulse`) read `--dur-arc`/`--dur-pulse` when implementers move the injected `<style>` strings to token references; until then the global reduced-motion rule still neutralizes them.

---

## 3. Drift reconciliation table

Every currently-known desktop/mobile disagreement → the canonical decision. **"Winner"** = the side whose value survives; the other side changes when the frag lands.

| Surface | Desktop today | Mobile today | Canonical token → value | Winner / rationale |
|---|---|---|---|---|
| Green | `--green:#10b981` | `--green:#00c853` | `--success:#10b981` | **Desktop.** `#10b981` is already hardcoded ~11× in *both* files (freshness pills, sparkline, TB_COL, stages) — mobile's `:root` was the outlier. |
| Base font | `14px` | `15px` | `--fs-base:15px` | **Mobile.** Legibility at the sub-rem scale; see §2.9. Desktop html rule changes. |
| Default border | `--border:#1c2f45` | `--border:#1a2d44` | `--line:#1c2f45` | **Desktop.** 1-hex-digit drift; desktop value pairs with `--line-strong:#243b55`. |
| Muted text | `--muted:#5b7a99` | `--text-muted:#7a99b8` | `--ink-muted:#7a99b8` | **Mobile.** Better contrast on `#0f1d2e` (≈4.5:1 vs ≈3.2:1). `#5b7a99` survives as `--ink-faint` for tertiary text. |
| Primary text | `--text:#e8f0f8` | `--text-main:#e6edf6` | `--ink:#e8f0f8` | **Desktop.** Imperceptible delta; one value. |
| `--r` control radius | `10px` | `var(--radius-md)`=14px | `--r → --rad-md:10px` | **Desktop** for `--r` consumers (small controls). Mobile's card look is preserved via `--radius-md → --rad-lg:14px` and `--radius-lg → --rad-xl:20px` aliases — mobile *cards* don't change, only mobile controls using `--r` tighten 14→10px. |
| Spacing tokens | none (raw px) | `--space-xs/sm/md/lg` | `--sp-1…7` (+ aliases) | **Mobile's system, extended.** Desktop adopts it during Phase 3. |
| `var(--ink)` / `var(--line)` | undefined (inherit) | undefined (inherit) | `--ink:#e8f0f8`, `--line:#1c2f45` | **Defined by construction.** ~40 generated-HTML references resolve correctly the moment the frag lands; visible effect is nil in dark mode (inherit was already `#e8f0f8`-ish) and *correct* in light mode where inherit would have broken. |
| App h1 | `1.5rem` | `1.6rem` | `--fs-display:1.5rem` | **Desktop.** At 15px base, 1.5rem ≈ old mobile 24px anyway. |
| "Solo Mode" vs "Solo Weekend" label | Solo Mode | Solo Weekend | *(copy, not token)* | Defer to A3/A4 shell tickets (PIA-032/033); recommend "Solo" with room for a subtitle. Not resolved here. |
| No-proxy banner copy "sidebar" vs "Advanced Settings" | sidebar | Advanced Settings | *(copy, not token)* | Intentional divergence — each names its real location. Keep. |
| Sheet corner radius | 18px (≤640px cal) | 18px | `--rad-sheet:18px` | Already agreed; tokenized. |
| Live-pill dot size | 6px | 7px | recipe: 6px | **Desktop**; trivial, recipe-level. |

---

## 4. Component recipes

Defined **purely in tokens**; the frag ships them as `.u-*` utility classes. Implementers may apply the class or copy the declarations into existing selectors — behavior/IDs must not change (inventory contract).

- **Card** (`.u-card`, `.u-card--raised`) — `--surface-2` fill, `1px --line-strong` border, `--rad-md`, padding `--sp-3 --sp-4`. Raised variant: `--surface` + `--shadow-1`. Stage-tinted watchlist cards add `border-color: var(--stage-*)` + a `--stage-*` at ~8% alpha background (use `color-mix` is NOT allowed — keep the existing hex+`12` alpha-suffix pattern in JS, reading the stage hex table §2.5). Solo dest cards: `1.5px` border, `--rad-md`, focus = dest series color border + `--shadow-1`.
- **Pill / badge** (`.u-pill` + `--success/--warn/--accent` variants) — `--rad-pill`, `--fs-caption`, weight 700. Freshness pills use `--live/--cached/--sample/--booked` as fill with `--ink-on-accent` (green/blue) or `--ink-on-warn` (amber/slate) text. `src-badge` = `--fs-micro`, `--rad-xs`.
- **Chip** (`.u-chip`) — selectable: rest = `--surface-2`/`--line-strong`/`--ink-muted`; hover & active = `--accent` border+text, active adds `--accent-dim` fill; disabled/stale = `.45` opacity + dashed border. Covers `.hol-btn`, `.tt-btn`, `.nt-mode-btn`, `.mode-btn`, `.mt-btn`, `.ord-toggle-btn`, blocker chips (blocker active state may substitute `--warn` for `--accent`).
- **Button** (`.u-btn` + variants) — primary `--accent`/`--ink-on-accent`; secondary `--surface-3` + `--line-strong` + `--ink-muted`; danger `--danger`; ghost transparent + `--line-strong`; disabled `.4` opacity. `--rad-md`, `--fs-body-s`, weight 800, `:active` scale(.98), `:focus-visible` `--focus-ring`. `#search-btn` = primary; `#api-clear` = secondary; quota-locked = disabled + title (behavior frozen).
- **Banner** (`.u-banner` + `warn/danger/success/info`) — `1.5px` status border, `--*-dim` fill, `--rad-md`, `--fs-tiny`, `--lh-normal`. Covers quota-warning banner (amber/red tiers), JFK banner (info), completed-trip marker (success), API banner shell (neutral).
- **Sheet / modal** (`.u-sheet`, `.u-sheet--bottom`, `.u-backdrop`) — `--surface`, `--line-strong` border, `--rad-lg` + `--shadow-3` (floating, desktop calendar) or `--rad-sheet` top corners + `--shadow-sheet` (bottom sheet, mobile calendar); entrance `u-pop` at `--dur-pop`.
- **Table / ledger row** (`.u-row`) — flex space-between, `--line` top border, `--fs-caption`, hover `--accent-soft`. Covers cost-split rows, `.wknd-row` (weekend rows keep click→preview behavior), binder segment rows (left-edge tint = `--tb-*`).
- **Toast** (`.u-toast`) — fixed bottom-center, `--success` fill, `--rad-pill`, `--fs-body-s` 800, slide-up `--t-slow --ease`. `aria-live` stays on the element (behavior frozen).
- **Progress bar — quota** (`.u-progress` + `__fill` + `--amber/--red`) — 5px track `--surface-3`, `--rad-pill`; fill `--quota-ok` → `--quota-amber` (≥800) → `--quota-red` (≥950/locked); width transition `--t-slow`.
- **Stat tile** (`.u-stat`) — `--fs-micro` uppercase `--ink-muted` label over `--fs-body` 900 `--ink` value. Covers `#statsbar` items, freshness-header fragments, finder price blocks.

---

## 5. Light-mode strategy

One `@media (prefers-color-scheme: light)` block (in the frag) re-declares **only color/elevation tokens** on `:root`; no component rule is duplicated. Key moves:

- Surfaces invert to `#f2f5f9 / #ffffff / #e9eef5`; ink to navy `#0f1d2e`; lines to `#d7e0ea/#c2cfdd`.
- Text-bearing statuses darken for contrast on white: accent `#1f66d6`, success `#0b9668`, warn `#b45309`, danger `#dc2626`, sample `#64748b`; stage/mode colors get matching darker variants.
- Map tokens flip to a paper look (`--map-bg #e4ebf3`, land `#ffffff`); because redrawMap reads hexes from JS today, the *map* only benefits once A3/A4 switch injected SVG fills to `var(--map-*)` (CSS vars work in SVG presentation attributes via `style`); until then dark map on light chrome is the accepted interim.
- Shadows soften to navy-tinted low alphas.
- Legacy `index.html` already supports light mode; nothing to change there.

Because `--ink`/`--line` are now real tokens, the ~40 inline `var(--ink)`/`var(--line)` references in generated HTML become light-mode-correct automatically — previously they'd have inherited dark-mode text colors.

---

## 6. Adoption rules for A3/A4

1. Paste the frag verbatim at the top of the `<style>` block in **both** files, deleting each file's old `:root` (and mobile's legacy-alias comment block). Everything else keeps working via aliases — this is safe as its own first diff.
2. Restyle per surface (PIA-034…039) by swapping raw hexes/sizes for tokens per §7; never change IDs, classes read by JS, or behavior.
3. JS-side color constants (`DC`, `TB_COL`, `WATCHLIST_STAGES`, `_freshPill`, redrawMap fills): where the value lands in an inline `style="…"` or SVG `style`, prefer `var(--token)`; where it feeds a d3 `.attr('fill', …)` or string concatenation with alpha suffixes (`hubCol+'12'`), keep the hex but it MUST byte-match the token table (A6 audit greps for orphan hexes).
4. New sub-rem font sizes are forbidden — pick the nearest `--fs-*` step.
5. Reduced-motion: don't add new infinite animations outside the tokenized durations.

---

## 7. Coverage checklist (inventory §V → token)

Every distinct hex / cluster from the A1 catalog. "raw-JS" = value stays a JS hex constant byte-matched to a token (rule §6.3).

| Inventory value(s) | Replacing token | Notes |
|---|---|---|
| `#07101e` | `--bg` | |
| `#0f1d2e` | `--surface` | |
| `#162233` | `--surface-2` | |
| `#1e3550` | `--surface-3` | was raw on `#api-clear` |
| `#1c2f45` | `--line` | |
| `#243b55` | `--line-strong` | |
| mobile `#1a2d44` | `--line` | reconciled → `#1c2f45` |
| `#e8f0f8` / mobile `#e6edf6` | `--ink` | reconciled |
| `#5b7a99` | `--ink-faint` | demoted from muted |
| `#7a99b8` (+`#6e93bd`, `#d6e0ec` mobile-only) | `--ink-muted` / `--ink` | mobile one-offs collapse into the ink ramp |
| `#253548` | `--ink-ghost` | |
| `#fff`/`#ffffff` (24×) | `--ink-on-accent` (on fills) or `--map-hub-dot` (map) | white-on-white light-mode bug class eliminated |
| `#000` (9×) | `--ink-on-warn` | src-badge text on amber/green |
| `#2e7cf6` | `--accent` / `--co-lax` / `--tb-flight` / `--mode-solo` / `--map-outline` | per context |
| `#10b981` | `--success` (& `--stage-booked`, `--tier-cheap`, `--tb-trek`, `--live`) | |
| mobile `#00c853` | `--success` | **eliminated** |
| `#f59e0b` | `--warn` (& `--co-jax`, `--stage-planning`, `--tier-mid`, `--tb-lodging`, `--cached`, `--warm`) | |
| `#ef4444` | `--danger` (& `--tier-pricey`; sparkline "up") | |
| `#38bdf8` | `--info` / `--stage-watching` | |
| `#3b82f6` | `--booked` | |
| `#94a3b8` | `--sample` / `--stage-completed` / `--tb-other` | |
| `#a855f7` | `--co-pia` / `--mode-family` / `--tb-tour` | |
| `#06b6d4` | `--co-ord` / `--tb-transfer` | |
| `#14b8a6` `#ec4899` `#e11d48` `#22c55e` `#eab308` | `--co-mia` `--co-jfk` `--co-lhr` `--co-cuz` `--co-lim` | raw-JS (DC palette feeds d3 attrs + alpha-suffix concat) |
| `#888` | `--co-fallback` | raw-JS |
| `#060e1a` | `--map-bg` | raw-JS until SVG fills move to vars |
| `#132134` / `#1a2f48` | `--map-land` / `--map-land-hover` | raw-JS (injected `.sp` style string) |
| `#a0c4e8` / `#4a6a88` / `#6ee7b7` | `--map-label` / `--map-label-dim` / `--map-label-home` | raw-JS (d3 text fills) |
| `#f59e0b #fbbf24 #d97706 #b45309 #b8852b #1a1a1a #1f2937` (home-sel block) | `--warm`, `--warm-hover`, `--warm-border`, `--warm-deep`, `--warm-label`, `--warm-ink`, `--warm-option-bg` | |
| `#1e293b #334155` (JFK banner) | `--surface-2` + `--line-strong` | banner recipe (info variant); slate one-offs eliminated |
| `#4a6080` (`.b-mock`) | `--sample` | mock badge joins the freshness family |
| `#2a4060` | `--line-strong` | nearest step |
| `#a0c4e8`-adjacent `#7a99b8` (`.si strong`) | `--ink-muted` | |
| `#fca5a5 #7f1d1d` (mobile error overlay) | **intentionally kept raw** | debug-only surface, hidden unless a JS crash occurs; not a design surface |
| `#0b1726 #1f3350` (mobile one-offs) | `--bg`-adjacent → `--surface-2` / `--surface-3` nearest step | A4 sweeps during Phase 3 |
| `rgba(46,124,246,.12/.14/.18/.07)` | `--accent-dim` (.12), `--accent-soft` (.07); .14/.18 → `--accent-dim` | ±.02–.06 alpha collapse, imperceptible |
| `rgba(16,185,129,*)`, `rgba(245,158,11,*)`, `rgba(239,68,68,*)` | `--success-dim` / `--warn-dim` / `--danger-dim` | strip gradient may keep its two-stop gradient using these |
| shadows `0 24px 64px…`, `0 6px 24px…`, `0 4px 20px…`, `0 -8px 40px…` | `--shadow-3/-2/-1/-sheet` | |
| Font sizes `.48–.57rem` / `.58–.63` / `.64–.7` / `.72–.76` / `.78–.88` / `.9–1.05` / `1.1` / `1.5–1.6rem` | `--fs-micro` / `--fs-tiny` / `--fs-caption` / `--fs-body-s` / `--fs-body` / `--fs-title` / `--fs-price` / `--fs-display` | 8-step ramp; base 14px→**15px** desktop |
| Radii 2–4 / 5–7 / 8–11 / 14 / 18 / 20(pills) px | `--rad-xs` / `--rad-sm` / `--rad-md` / `--rad-lg` / `--rad-sheet` / `--rad-pill` (+ `--rad-xl` mobile cards) | |
| Motion `blink 2.4s`, `spin .6s`, `calIn .16s`, `stripBorder 2.8s`, `rd 1.8s`, `pulse 2.6s`, transitions `.1–.3s` | `--dur-blink/-spin/-pop/-strip/-arc/-pulse`; `--t-fast/-quick/-med/-slow` | reduced-motion honored globally |
| SVG data-URI select carets (`fill='%235b7a99'` etc.) | **intentionally kept raw** | CSP-safe inline data-URIs; the encoded fill can't read a CSS var — keep hexes matched to `--ink-faint`/`--warm-ink` per context |

---

## 8. Token counts (for the Manager's gate)

Color: 78 canonical custom properties (surfaces 7 · ink 6 · lines 2 · accent 3 · status 9 · freshness 4 · quota 4 · stages 4 · modes 2 · series 10 · map 9 · tiers 3 · binder 6 · warm 7) + 24 backward-compat aliases. Type: 12 (base + 8 sizes + 3 line-heights, + 2 font stacks). Spacing: 7 (+4 aliases). Radius: 7 (+1 alias). Elevation: 6. Motion: 12 (2 easings + 10 durations). Utility classes: 13 recipe primitives.
