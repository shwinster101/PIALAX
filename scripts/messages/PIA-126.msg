feat(family): pickup timeline — who lands when, and the gap

Mom & Dad make one airport run if Ashwin and Anjo land close together,
and a 6-hour gap means two. No arrival time was read anywhere. Since
PIA-121 the cached fares carry their offers' airports and times.

- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - tripLegOffers: a leg's cached offers (on a nearby search, only
    its own airport's).
  - _tripLegShownOffer: the offer behind the shown price.
  - tripPickupTimeline:
    - landings use the in-leg arrival; leavings use the home-leg
      departure;
    - each side reports its rows, who's still waiting for a live
      fare, same airport or not, the gap in minutes (crosses
      midnight), and within 2h.
  - tripPickupBestPair: the cheapest combination of cached offers at
    one airport within 2h. Pure arithmetic, no search.
  - tripPickupHtml / tripLinkedSummaryHtml: "🚗 Pickup timeline",
    shown with "✓ within 2h · one trip", "different airports — two
    trips" or "Nh Nm apart", plus the cheapest pair (+$ vs shown).
- Both files: renderMeetupRoutes leads a linked trip's breakdown with
  it; CSS.
- Tests (test-trip-idea), all with 0 fetches:
  - Me 3:40p / Anjo 4:55p at PIA = 75 min, one trip;
  - ORD departures 6h 20m apart, with the cheapest pair AA 4 + UA 6 =
    $290 (+$20);
  - 11:30p → 12:45a = 75 min;
  - PIA vs ORD = two trips;
  - no live fare → "waiting on Anjo’s live fare".

Closes PIA-126.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
