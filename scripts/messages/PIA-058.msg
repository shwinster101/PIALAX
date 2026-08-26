fix(watchlist): survive a d3/CDN failure; button-by-button tab audit

Button-by-button audit of the Watchlist tab (Ashwin: "doesn't spaz into
different tabs when I click every button"). Every control was activated
in headless Chromium with the active tab asserted after each activation:
header collapse/expand, row expand (click + Enter/Space), stage select
change/restore, notes blur, next-action blur, all 5 blocker chips x2,
＋ next step hint, ＋ New trip / mode toggles / Add / Cancel, ✕ delete,
Share plan, Google Flights + Flighty link sanity (href + _blank, no
navigation), and the ?flags=assistant surface (decision card, context
log, alert settings, preview, composer). 126/126 checks pass on both
files; Open ↗ is the only control that navigates, and it lands exactly
on the planner tab by design.

The audit found one real defect, fixed here in both files:

- redrawMap() now bails when d3 is undefined. The map is a progressive
  enhancement; previously every caller (boot, tab switches, mode
  switches, home-airport change) threw mid-handler if the d3 CDN load
  failed — outage, SRI hash break, or offline.

- boot() paints renderWatchlist() BEFORE planner/map init, and wraps
  setMode() in try/catch. With d3 unloadable, desktop boot previously
  died inside setMode() and the Watchlist home rendered permanently
  EMPTY. Mobile only survived by luck (its map starts collapsed at zero
  size), so it gets the same ordering + guard for parity.

No behavior change when the CDN loads normally: the guard is a no-op and
the boot reorder only moves the home paint earlier.

Tests: 27 + 217 + 36 checks passing; node --check clean on all inline
scripts. Preflight: known sandbox cdnjs-403 SRI NO-GO only.

Rollback: revert.
