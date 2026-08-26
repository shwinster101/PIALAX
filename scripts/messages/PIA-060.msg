feat(family): official JAX→LGA hub transition + tab-scoped mobile chrome

PIA-060 — the sister's NYC move (Sep 1, 2026) is now marked OFFICIAL with
LGA as her primary airport (closer to her than JFK). Data-driven where
possible; both files:

- FAMILY_INFO.JAX.moveAirport: 'JFK' → 'LGA'. familyForDate(),
  computeRanking(), the weekend finder, map arcs and legend all follow
  automatically (they read moveAirport).
- LGA added to AIRPORTS (LaGuardia), DC colors, ROUTE_GRAPH (as origin
  PIA/ORD/LAX and as dest from PIA/ORD/LAX), MOCK fares (PIA/ORD/LAX/JAX
  pairs), the Home Airport dropdown, and hubOrder.
- loadPrices() meetup hub push reads FAMILY_INFO.JAX.moveAirport instead
  of hard-coding 'JFK'.
- NYC banner now says sister departs LGA; JFK noted as the alternate.
  JFK stays fully modeled (alternate origin + JFK–LHR transatlantic).

PIA-061 (folded in — same files, same sweep) — harsh-UX pass from the
phone screenshots: every tab led with diagnostics instead of its primary
feature.

- Mobile chrome is now tab-scoped via body.tab-* classes + CSS: the
  "Choose dates…" prompt, fares-freshness line, quota bar and stats
  strip render on the Meetup (plan) tab only; Advanced Settings renders
  on the Watchlist home only; the sticky Get Live Fares CTA is plan-tab
  only (was: hidden only on Watchlist). The quota WARNING banner and
  last-error chip stay global on purpose — failures must surface
  anywhere.
- "≈ $0" bug fixed in both files: getMock()'s zero-fare stub for
  unmodeled routes painted "≈ $0" on watchlist cards (Memphis, NYC) and
  fed $0 into assistant snapshots. Zero now means "no data" → "—".

Verified headless-Chromium (both files): post-Sep-1 meetup shows the LGA
banner and prices the sister from LGA (JAX absent); LGA works as a solo
home (PIA/ORD/LAX cards); home-sel offers PIA/ORD/LAX/JAX/LGA/JFK;
Memphis card shows "—" while Peru keeps ≈ $895; per-tab chrome asserts
pass on watchlist/plan/map; watchlist button audit re-run 126/126.

Tests: 27 + 217 + 36 checks passing; node --check clean. Preflight:
known sandbox cdnjs-403 SRI NO-GO only.

Rollback: revert.
