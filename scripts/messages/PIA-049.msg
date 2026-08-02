feat(assistant): decision engine, fare snapshots, reviewed handoff

Phase 4 of the 2026-08-02 sprint. Ships DARK — the engine is complete and
fixture-tested, but no UI renders it yet (Phase 5). Everything a user will
act on is computed here, deterministically, from facts THEY confirmed —
never by the model.

computeRecommendation() evaluates four states in strict priority:
  CHANGE_DATES — a confirmed itinerary cannot meet a hard commitment
  COORDINATE   — an unsettled contradiction, or someone still tentative
  BUY          — complete, unblocked, AND positive evidence
  WAIT         — feasible, but nothing argues for acting today
Priority is the point: a cheap fare for a trip that misses a paid trek is
not a buy signal, so a blocker outranks any price however good. BUY requires
positive evidence (at/under target, cheapest quartile, or deadline within 3
days) — the absence of blockers is never itself a reason to spend money.
Pure, with `now` injected; determinism is asserted by re-running every
fixture and deep-comparing.

buildHandoffUrl() is the ONLY place a booking URL is built, from confirmed
facts only, and returns null — disabling the CTA — when the trip is
incomplete, contradicted, or date-blocked. buildReviewLine() renders the
human line above it, and a fixture cross-checks that every airport it names
appears in the decoded URL, because if the line and the link can disagree
the review step is theatre.

Two real defects found and fixed while probing, both invisible to the
fixtures as first written:

1. A CHANGE_DATES trip still produced a live booking URL for the exact dates
   the engine had just called infeasible — the CTA would have contradicted
   the headline directly above it and invited the user to buy the ticket
   they were being warned about. The spec forbids this explicitly (scenario
   A) and my own fixture asserted the WRONG expectation, so it passed.
   buildHandoffUrl now also fails closed on constraint violations, and the
   fixture is corrected with a dedicated handoff case alongside it.

2. Round trips had nowhere to store a return date: TripState carries
   ordered legs, so "LAX to ORD Sep 17-20" collapsed to a one-way search.
   A stated range now derives the return leg (is_inferred, source_text
   quoting the range, user still confirms). Applied ONLY when there is
   exactly one segment, so a genuine open jaw is never extended — and
   round-trip vs open-jaw is now DERIVED by comparing legs rather than
   declared by a flag, which makes "never collapse an open jaw" structural
   rather than a rule someone has to remember.

Fare snapshots read cached/mock prices only and never fetch, so computing a
recommendation on every render cannot spend SerpAPI quota. Mock prices are
deliberately excluded from the persisted history: letting fabricated numbers
into the series would make typicalRangeFor() report a "typical range" nobody
ever quoted and then cite it as evidence to buy. Verified — three recomputes
against mock-only data record zero history points. typicalRangeFor also
returns null below 3 points, because "typical" from two samples is a story.

Known limitation, deliberately conservative: constraint checking is
day-granularity (TripState has departure dates, not arrival times, and there
is no flight-duration model), so "departs on or after the anchor day" counts
as a violation. That will occasionally flag a short domestic hop that would
have been fine. The asymmetry justifies it — a spurious "check your dates"
costs seconds; silently green-lighting a departure that misses a paid,
non-refundable trek costs the trek. Documented at the function and tracked as
standing risk R3.

Tests: 34 new decision/handoff fixtures (spec scenarios A–D plus deadline
windows, constraint-after-departure, tentative-vs-confirmed companions,
conflict-outranks-price, CTA-disabled cases, quartile math). Every
recommendation is also checked structurally — <=3 evidence items, a next
action always present, and the trip_state_version it saw recorded.
165 checks in test-extraction; 27 + 36 + 21 elsewhere.

Verified end-to-end as a real slice — note → parse → facts → confirm →
TripState → recommendation → URL — for round trip, open jaw, blocked, vague
and one-way notes.

Invariants: SRI unchanged (4/file), no new loadPrices(true) sites, both
files at parity across all 9 new symbols.

Rollback: revert this commit. Nothing calls the engine yet; the fare-history
key is additive and inert to prior code.

Closes Phase 4. Phase 5 (the flag-gated card UI + meetup answer-first) is the
first phase that puts any of this on screen.
