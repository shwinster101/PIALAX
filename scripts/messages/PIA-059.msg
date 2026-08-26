feat(search): selectable From airport in quick-add + JFK as a home

Ashwin: "why is it still only one airport showing in the flight search?
Home airport should be selectable." Two gaps, fixed in both files:

1. The watchlist "＋ New trip" quick-add pinned the origin silently to
   S.home — the search showed one airport with no way to pick another.
   The form now has a From selector offering every home airport the app
   models as an origin (ROUTE_GRAPH keys: PIA, ORD, LAX, JAX, JFK),
   pre-selected to the current home. addNewTrip() stamps the chosen
   origin on the item (origin, routeTxt, gf.from). For a solo trip from
   a different origin it also switches the home airport — by setting
   #home-sel and dispatching its change event, so labels, price-cache
   reset and the PIA-057 saved prefs all update through the one proven
   handler — and the solo board then shows the new trip's card instead
   of silently filing it under another origin. Family trips leave the
   home airport untouched (family origins are fixed).

2. JFK added to the #home-sel dropdown. It was already a fully modeled
   origin (AIRPORTS entry, ROUTE_GRAPH.JFK = PIA/ORD/LAX, JFK-* mock
   fares) but not selectable — relevant now: sister departs JFK from
   Sep 1, 2026.

Verified headless-Chromium on both files: home-sel offers 5 airports;
JFK as home renders "Routes from JFK" with its 3 route cards; solo
quick-add from ORD to DEN creates origin:ORD item, switches home to ORD
(persisted in pialax_solo_prefs_v1, restored after reload), stays on the
watchlist tab, and the ORD solo board shows the DEN card; family-mode
add keeps the home untouched by design. Watchlist button-by-button
audit re-run: 126/126 passing, no regressions.

Tests: 27 + 217 + 36 checks passing; node --check clean on all inline
scripts. Preflight: known sandbox cdnjs-403 SRI NO-GO only.

Rollback: revert.
