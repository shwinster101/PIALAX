fix(watchlist): drop MIA from the active board, fix blank Google Flights links

User report: opening the Peru trip lands on a blank Google Flights page with
no dates or airports filled in, and MIA (a Jun 2026 solo trip that already
happened) still shows up as an active Solo destination alongside PIA/ORD/JAX/
JFK/CUZ.

MIA (history-only)

MIA was still in ROUTE_GRAPH.LAX, so it kept rendering as a pickable Solo
destination card and in the "Routes from LAX" summary line long after that
trip (Jun 18–21, 2026) was over. Dropped 'MIA' from ROUTE_GRAPH.LAX in both
files — it's no longer an active board pick. AIRPORTS.MIA, its map color, the
MOCK fare data, and its TRIP_PRESETS entry are all left in place; nothing
reads ROUTE_GRAPH for "did this trip happen," so removing it from the one
place that drives the active card list is enough to keep it out of the board
while the historical record (fares, dates, presets) stays in the file.

BLANK GOOGLE FLIGHTS LINK — real bug, root-caused

Every "Google Flights ↗" link already embeds the trip's airports and dates in
its search text — that part was never missing. The Peru link specifically
was blank because Peru is an open-jaw (fly into Cusco, home from Lima), and
its link used a single COMPOUND query: "Flights from LAX to CUZ on <date>,
from LIM to LAX on <date>". Google's free-text flight search reliably parses
a plain one-way or round-trip sentence but not a two-different-city-pairs
sentence — it was landing on a generic, unfilled results page instead of
applying either leg.

The app already had the right pattern for this exact problem: the Peru solo
card's own flight-option comparison (peruFlightOptionsHtml, unchanged here)
already offers the outbound and return as two separate one-way searches
instead of one compound one. This carries that pattern to the two other
places that were still using the broken compound query:

- Watchlist card: watchlistGFUrl (single URL) → watchlistGFLinks (array).
  Non-open-jaw trips (JAX, Memphis, London) get the same one link as before,
  unchanged. Peru now renders two links — "LAX → CUZ ↗" and "LIM → LAX ↗" —
  each a simple, single-leg query.
- Solo destination card's "See real prices" CTA: for dest === 'CUZ' this now
  links to the outbound leg only (LAX → CUZ); the full outbound+return
  breakdown is peruFlightOptionsHtml right below it, which already worked.

Verified in a browser (both files): Peru's watchlist card now renders two
GF links with plain single-leg query strings
(".../travel/flights?q=Flights%20from%20LAX%20to%20CUZ%20on%202026-09-04" and
the LIM→LAX equivalent); JAX's single link is byte-for-byte what it was
before this change.

Known follow-up, out of scope here: buildHandoffUrl (the Trip Assistant's
decision-engine CTA, behind the assistant flag, default off) builds the same
kind of compound open-jaw query for a generalized two-segment trip and has
its own exact-match fixtures in test-extraction — changing it needs those
fixtures updated too, so it's left for a follow-up ticket rather than folded
in here.

Tests: 27 + 217 + 36 checks unchanged and passing. New parity check added
(watchlistGFLinks byte-identical across both files). SRI count unchanged
(4/file) — known sandbox cdnjs-403 NO-GO only.

Rollback: revert. Doesn't touch storage schema or the assistant-flagged path.
