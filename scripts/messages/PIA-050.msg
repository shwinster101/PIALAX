feat(assistant): decision-first card UI, context log, fact review

Phase 5 — the first phase that puts any of the previous three on screen, and
therefore the first that could tell me whether the design actually held.
It mostly did; four real defects only became visible once wired, all fixed
here rather than deferred.

FIRST PRINCIPLES

A watchlist card exists to answer ONE question at a glance: does this trip
need me right now? So the collapsed card now leads with the decision, and the
fare estimate — previously the most prominent thing on the card despite being
the least actionable — moves to supporting detail.

TripState is DERIVED, never stored. A watchlist item already owns the user's
own route and dates; they typed them or the seed declared them, so they are
confirmed data by definition. Duplicating them into a second store would
create two truths that drift the moment either is edited. The item stays the
source of truth for what it owns, confirmed facts supply what it cannot
express (commitments, companions, targets, deadlines), and state is recomputed
each render. Nothing to desync. Confirming a fact the item owns writes THROUGH
to the item, closing the loop from the other side.

WHAT WIRING IT EXPOSED

1. The engine was blind to what the app already knew. Peru's seeded trip has a
   real conflict — the trek briefing — and the old trek card had been warning
   about it for weeks. But constraints came only from confirmed ParsedFacts,
   which a seeded trip has none of, so the shiny new decision card cheerfully
   said "nothing to do yet" directly above a card warning otherwise. Shipping
   that would have been worse than shipping no engine. Constraints are now
   also read from the trip binder, where must-attend commitments already live.
   Peru correctly reads CHANGE DATES, and its booking CTA correctly disappears.

2. Memphis rendered "$0 est." — getMock has no entry for LAX→MEM and returned
   zero, which the fare line dutifully formatted as a price. A fabricated $0
   is worse than admitting nothing is known. Non-positive prices are now
   treated as no fare at all.

3. Mock prices were being narrated as observations: "a few more fare checks
   will show whether $339 is good" about a number nobody ever quoted. The
   engine now cites a fare only when it was actually observed (live/cached),
   and BUY can never fire on a sample price however far under target it sits.
   Estimates are still SHOWN — labelled — because the old UI showed them and
   they are useful; they are simply no longer reasoned about.

4. Confirming a date change was silently lost on reload. Seeded trips persist
   only {stage, notes, nextAction, blockers} — dates were seed-only and could
   not be overridden. The change appeared to work, survived a re-render, and
   vanished on refresh: exactly the silent data loss this whole feature exists
   to prevent. dep/ret are now part of the override payload.

Also fixed, found by walking the loop end to end: a note that UPDATES an
existing trip ("moving departure to Sep 4") produced nothing usable, because
the parser only emitted segment facts when it could find a full route inside
that one note — the single most common kind of note did nothing. It now uses
the trip's existing route as context, gated on an explicit departure cue so a
passing date mention cannot rewrite an itinerary. And a note saying "…to make
the briefing" was fabricating a hard constraint out of a nearby date; a
commitment now needs its time actually stated.

UI

Collapsed: decision badge + honest fare line + one next action + a review
count when facts are pending. Expanded, in order: decision card (one primary
CTA, replaced by the unblocking question when the trip is blocked — a booking
link for dates the app just called infeasible would contradict its own
headline), itinerary, facts needing review, append-only context log, then the
existing editors unchanged. Every proposed fact shows the text it came from,
so confirming never requires taking the app's word for it.

Flag still defaults OFF and the off path is byte-identical to today's app —
verified in a browser: the old notes textarea returns with its content intact,
context events stay stored, and the confirmed date persists.

Tests: 175 in test-extraction (2 new fixtures pin "a mock price is never a buy
signal"); the two BUY fixtures that broke were under-specified rather than
wrong and now state that their fare was observed. The viewport suite runs the
mobile file with the flag ON and expands a card first — cards render collapsed,
so without that it would have measured the sparse layout and proved much less
than it appeared to. Densest state is clean at 360/390/430.

Invariants: SRI unchanged, no new loadPrices(true) sites, rendering reads
cached/mock only and never fetches, both files at full parity across all 12
new symbols.

Rollback: revert, or just turn the flag off. Nothing is destroyed either way.

Closes Phase 5. Phase 6 (alerts + preflight gate wiring + docs) remains.
