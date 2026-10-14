feat(nearby): one search covers the home airport and its neighbors

Over the holiday, BUR/LGB/SNA/ONT (Ashwin) and JFK/EWR (Anjo) are often
$100+ apart. Comparing them meant one search per airport, because the
Worker allowlisted a single 3-letter code.

- worker.js:
  - departure_id / arrival_id take up to 5 comma-joined IATA codes
    (IATA_LIST_RE);
  - canonicalSearch sorts and de-dups the list, so any order is one
    KV cache entry and a single code is byte-identical (existing keys
    survive);
  - authGate / spendGate unchanged;
  - /account adds features.multi_airport.
- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - tripFareParse adds byDep / byArr, the cheapest fare per airport
    across all offers.
  - Groups: TRIP_NEARBY_GROUPS (LA, NYC), tripNearbyGroup (sorted,
    keyed by the traveler's date-aware airport). The per-traveler
    toggle is in pialax_leg_nearby_v1. It only works after
    tripNoteWorkerFeatures sees features.multi_airport, so an old
    Worker never gets a comma.
  - Legs carry searchFrom / searchTo (the metro), one search per leg:
    - tripLegPrice uses the chosen airport's own fare from that search,
      else its own cache or an estimate;
    - tripLegsToPrice looks at the search itself, so it is never
      repeated.
  - tripLegNearby / tripLegNearbyHtml show the winner and the saving
    (both from the same search) and a "Use X" button. tripIdeaSetOrigin
    re-POSTs the answer with the new origin.
  - _tripIdeaRewriteAnswer is the shared write behind the flex tap
    (PIA-121) and "Use X".
- Both files: fetchFlights keeps byDep/byArr; syncSerpApiAccount
  calls tripNoteWorkerFeatures; CSS.
- CLAUDE.md: Anjo flies from LGA after Sep 1 (JFK is the alternate),
  plus the /search multi-airport note.
- verify-live.sh: A3's one search is LAX,BUR (the HIT is BUR,LAX), it
  lists the airports priced, notes price_insights /
  google_flights_url, and checks /account features (free).
- Tests:
  - test-trust:
    - 6 codes, a trailing comma and lowercase all → 400 with 0
      upstream calls;
    - LAX,BUR,SNA is one call, and SNA,LAX,BUR,LAX is a HIT;
    - /account features.
  - test-trip-idea:
    - metros (JAX before Sep 1 has none);
    - capability gate;
    - per-airport minima;
    - LAX keeps $220 while BUR wins at $190 (saves $30);
    - LAX missing from the results isn't faked;
    - toggle gating;
    - real-Worker "Use BUR".

Closes PIA-122 once deployed and verify-live passes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
