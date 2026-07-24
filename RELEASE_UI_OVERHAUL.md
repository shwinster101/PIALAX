# Release — UI Overhaul (PIA-030 … PIA-040)

_Date: 2026-07-24 · Branch: `claude/projects-ui-overhaul-plan-nh20q9` · Head: `61c1394` · Base: `246d1d9`_

The projects UI overhaul: both dashboards rebuilt onto a shared design-token layer with a new app shell (watchlist as home), **every existing feature kept**. Verified against `FEATURE_INVENTORY_UI_OVERHAUL.md` — 69/69 rows present, 0 suspect.

## What's in it

| Ticket | Commit(s) | What |
|---|---|---|
| PIA-030 | `85f2e0d` | Feature Freeze Inventory — the zero-feature-loss contract |
| PIA-031 | `6e7e9cf` | Design system: `UI_DESIGN_SYSTEM.md` + `ui-tokens.css.frag` (187 custom properties, light mode, reduced motion) |
| PIA-032 | `c9973f5` | Desktop app shell — token layer + top-level nav (Watchlist · Meetup · Map · Calendar) |
| PIA-033 | `ed4be2d`, `a85ef40` | Mobile app shell — bottom tab bar, sheet details, share-link landing parity |
| PIA-034…039 | `db6f131`…`433c871` (desktop), `17e82da`…`829b47d` (mobile) | Component restyle sweep: watchlist, meetup, map, calendar/charts, binder/RSVP, data & API surfaces |
| PIA-034 fix | `770cacc` | Stage colors use theme-aware tokens (light-mode contrast) |
| PIA-040 | `61c1394` | Audit fixes — **security**: attribute XSS via `?wl=` links; mobile quota-warning banner; shared-link stage crash; share-card fallback; landing-tab parity |

## Bugs fixed that predate this work

1. **Attribute XSS in shared watchlist links** (since PIA-024). A crafted `?wl=` link could break out of `data-*` attributes and execute script in the page origin, reaching every localStorage key including the proxy URL. Now validated at both untrusted boundaries by `sanitizeWatchlistItem()`. Exploit was reproduced live before the fix and proved closed after.
2. **Mobile quota-warning banner never displayed** — stylesheet `display:none` versus JS clearing only the inline style. Users got no warning before the 990-call cutoff.
3. **A shared link with an unknown stage blanked the whole watchlist** (threw in the render sort).
4. **Desktop light mode was structurally broken** — a legacy `:root` re-pinned dark backgrounds after the light override without re-pinning text color. Retiring it fixed the ghosted text and enabled light mode.

## Before shipping — the one check this environment can't run

`scripts/preflight.sh` passes every step except **5/7 (live SRI freshness)**, which fetches cdnjs; this sandbox's proxy returns 403. The pinned hashes were verified out-of-band (byte-compared against genuine d3 7.9.0 / topojson 3.0.2 package bytes, and the `integrity=` lines are byte-identical to pre-overhaul). Re-run where cdnjs is reachable:

```bash
bash scripts/preflight.sh        # expect: PREFLIGHT: GO
# or just the SRI check:
bash scripts/verify-sri.sh       # expect: two OK lines, exit 0
```

## Rollback (D3 drill)

The overhaul is a contiguous run of commits on a branch. Whole-release rollback:

```bash
git revert --no-commit 246d1d9..61c1394 && git commit -m "revert: UI overhaul"
```

Per-surface rollback (each restyle ticket is one commit per file, so a single surface can be reverted without touching the others):

```bash
git revert <sha>                 # e.g. ca0dcd0 = desktop map, 6a84951 = mobile map
```

Reverting the shell tickets (`c9973f5`, `ed4be2d`) also reverts the token layer for that file, so revert the restyle commits for that file first or revert the whole range.

## After shipping — live-site verification (D4)

GitHub Pages lags the push by 30 s – 2 min. Open `https://shwinster101.github.io/PIALAX/`, view source, and confirm:

| Check | Search for | Expect |
|---|---|---|
| Token layer live | `--stage-watching` | present in both files |
| New shell live | `initShellView` (desktop) / `initialTab` (mobile) | present |
| Security fix live | `sanitizeWatchlistItem` | present in both files |
| SRI untouched | `integrity="sha512-vc58qv` | unchanged |

Then, in the app: watchlist home renders with stage headers; the four nav tabs switch; a `?wl=` share link opens on the watchlist; light and dark both read cleanly.

## Known cosmetic follow-ups

Tracked as **PIA-041** in `backlog.md` — none are blockers: two light-mode contrast nits (ORD badge, FAMILY/SOLO chip), the desktop proxy panel being reachable only from the Meetup tab, calendar positioning when opened from the Map tab, unused `u-*` utility CSS, binder "days free" rows reading as warnings, and `TB_COL` hexes not following the light theme.
