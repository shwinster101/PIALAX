feat(trip-ideas): rank recommendations from cached fares, zero quota

- tripIdeaFareFor: read-only lookup per hub airport and destination:
  24h dated _flightCache, then planner S.prices when dates match,
  then labelled getMock sample fare. Cached beats estimated; never fetches.
- Row total = per-ticket fare x hub headcount (PIA_ORD = 2) via
  familyForDate/headcountFor; rows carry fareFrom/fareTo/priceStatus.
- Results summary counts cached vs estimated rows; drop the hard-coded
  "estimated" status override.
- Fix: missing fare scored 100 for price; now 0 and "No fare yet".
- Fix: GF handoff used hub key (PIA_ORD) instead of an airport.
- Tests: cache hit/stale/other dates, planner dates, headcount, cheapest
  airport, unavailable routes, zero network calls.

Closes PIA-070.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
