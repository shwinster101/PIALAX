feat(book): book-now link from the live fare, confidence and book-by

The Book buttons opened a free-text Google Flights query that might
show a different flight. Nothing said how old the fare was, or when
to book by.

- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - tripFarePick(from, to, dep, ret, adults) reads only the 24h cache.
    It gives Google's own results link for that exact search (1 adult)
    and the fare's nonstop / airline.
  - tripIdeaFlightUrl(…, pick):
    - uses that link, else adds "nonstop" / "on <airline>";
    - the 5-argument output is byte-identical;
    - tripIdeaLegLinks passes picks, so every book row, route card and
      RSVP sheet link upgrades once a leg is priced.
  - tripLegItinerary: "American AA 1 + AA 2 · 6:00a→3:40p · 1 stop" on
    each live leg.
  - fareConfidence / tripTravelerConfidence: ≤6h solid, ≤24h recheck,
    older stale, any estimate → estimate.
  - tripBookBy:
    - order: confirmed decision_deadline fact, else the trip's bookBy,
      else 21 days before leaving;
    - amber ≤7 days, red when passed.
  - The book cue (route card) and book list (trip card) show
    confidence, the book-by chip and Mark booked ✓. Mark booked is on
    the organizer device only, once the Worker reports can_book.
  - tripIdeaMarkBooked(id, code) goes through tripIdeaSetBooked, then
    re-applies the RSVP.
- Both files:
  - _googleFlightsUrl uses tripFarePick (the planner cards' links);
  - the Thanksgiving seed gets bookBy '2026-11-01';
  - CSS for the cue chips.
- Not built: "Open on airline.com". booking_options needs a second,
  paid booking_token call.
- Tests:
  - test-trip-idea:
    - link pick: Google link vs narrowed query, 2 adults never get
      the 1-adult link;
    - book rows upgrade only the priced leg;
    - itinerary text;
    - confidence tiers;
    - book-by default and fact amber/red;
    - cue gating;
    - real-Worker Mark booked drops Me from the watch and Get Live
      Fares.
  - test-viewport: the cue shows "Fare: estimate" and "Book by Sun
    Nov 1"; Mark booked flips Me's RSVP row and the strip leaves.

Closes PIA-124.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
