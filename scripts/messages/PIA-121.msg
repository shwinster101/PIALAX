feat(family): price a linked trip's legs, with a ±day flex strip

On a trip linked to a family RSVP, the route card showed a round-trip
LAX→PIA price, but its buttons book two one-ways (in PIA, home ORD).
Get Live Fares spent searches on round trips on plan dates nobody
books. fetchFlights kept only best_flights[0], so nothing could say
whether a fare was good.

- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - tripFareParse: same headline price as before, plus up to 6 offers
    (airports, times, flight numbers, stops), price_insights (history
    in ms) and search_metadata.google_flights_url (google.com only).
  - tripLegsFor / tripLegsForRow: legs mirror tripIdeaLegLinks.
  - tripLegPrice: 24h cache or a ~$ day-of-week estimate. It never
    fetches.
  - tripTravelerCost and tripLinkedCostFor: only on the trip's own
    hub (PIA/ORD).
  - tripLegsFetch: the one paid path. Uncached legs only, one at a
    time, 4 per tap.
  - Flex strip (tripIdeaFlexStripHtml / tripIdeaLegsHtml):
    −1/plan/+1, ±2 on demand. Leave-before-arrive days are disabled.
  - tripIdeaSetTravelDate:
    - force-fetches the doc;
    - re-POSTs /idea/respond, keeping status, origin, note and legs;
    - adds "(entered by Ashwin)" when moving someone else;
    - a 409/400 shows a toast.
- Both files:
  - fetchFlights uses tripFareParse;
  - linked route cards show the in + home total and the strip;
  - memberCostsFor and the decision rail use the same leg cost;
  - loadPrices(true) on a linked trip prices the plan legs, and
    renders the other routes from cache;
  - the button reads "Get Live Fares (N searches)";
  - no group price record on linked trips (it would mix kinds).
- Tests:
  - test-trip-idea:
    - parse fixtures: bare offer, bad link;
    - legs: Me / Anjo / round / no leave date;
    - live vs ~$ vs none prices, search counts and flex order;
    - strip clamp and linked hub guard;
    - real-Worker flex writes: kept fields, tag, clamp, 409.
  - test-trust: the A3 sandbox runs tripFareParse; the cache entry
    keeps $210 and adds offers.
  - test-viewport:
    - the LAX card reads "in + home", 6 chips ≥44px;
    - a tap moves only Me's RSVP date and the trip card and route
      card agree;
    - 0 searches.

Closes PIA-121.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
