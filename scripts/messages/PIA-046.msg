fix(mobile): audited defect pack, a11y pass, admin panel, feature flags

Phase 1 of the 2026-08-02 "Context to Decision" sprint. No new user-facing
feature: this clears the audited defects and lands the infrastructure the
later phases build on, so each of those can ship behind a flag.

Source reconciliation (spec §0 stop-condition): RESOLVED, no mismatch. Tree
was clean, HEAD == origin/main == 4dc1bd9 == what Pages serves, and the
Watchlist/New-trip/Next-action UI is present in local source. The spec's
"not found by text search" note described a stale local checkout, not this
repo. No user work was at risk and none was discarded.

Defects fixed:
- Meetup read "Step 1 → Step 3 → Step 4" because PIA-033 moved Step 2 into
  the Calendar tab. Rather than renumber (the numbers were right; the
  navigation was missing), added a Step 2 bridge control that names the
  step, shows whether it's satisfied, and opens the tab that owns it.
- renderMeetupRoutes() rendered full route cards — real-looking airlines,
  flight numbers and prices from the mock table — directly beneath its own
  "⚠ no dates selected" header. That reads as live data for a trip the user
  hasn't scheduled. Now fails closed with a single guidance card.
- The "＋ New trip" form's Add/Cancel row could sit under the fixed "Get
  Live Fares" CTA at the end of a long list. Root cause was that the CTA
  rendered on every tab, including Watchlist where it has nothing to act on;
  scoping it away from that tab fixes the overlap and the contextless
  control at once, and the body reserve shrinks so no dead band is left.
- Holiday quick-pick scrolled horizontally with the scrollbar hidden and no
  edge treatment, so chips past the fold were undiscoverable. Added a
  right-edge fade that clears once scrolled to the end.
- Multiple watchlist cards could be expanded at once (the open-state was a
  map, so every card ever opened stayed open). Now one at a time.
- Flighty was linked from every trip card. Flighty owns post-booking ops, so
  on a trip still being shopped it advertises a tool that cannot help yet.
  Gated on stage === 'booked' at both render sites.

Accessibility: accessible names for the date, calendar-nav, mode, trip-type,
map-view and holiday controls; aria-pressed on toggle groups; aria-current
on the tab bar; role/tabindex/aria-expanded plus real Enter/Space handling
for .wl-row, .wl-blocker and the panel header, which were clickable divs and
spans reachable only by mouse. aria-pressed is kept truthful by one delegated
sync pass rather than by editing each of the ~10 sites that set `.on` — any
one of those drifting would leave a screen reader announcing the wrong state,
which is worse than announcing none.

Admin & Diagnostics: the "Data Source" panel now carries the quota controls
and the feature-flag toggle, and is titled for what it is.

Feature flags (first in this codebase): pialax_flags_v1, modeled on the
existing proxy-URL persistence. With no build step the only ways to flip one
on the deployed page are ?flags=assistant (persists, ?flags=-assistant or
?flags=none to clear) and the Admin checkbox. Unknown names are ignored AND
scrubbed from storage on load. Flags are deliberately never serialized into
?wl= share links — a shared plan must not enable an in-progress feature for
whoever opens it. Nothing is gated by a flag yet; 'assistant' defaults off.

Tests: new scripts/test-viewport.{sh,mjs} drives headless Chromium at
360x800 / 390x844 / 430x932 and asserts on measured geometry — no horizontal
overflow, the new-trip Add/Cancel row never intersecting the fare CTA,
accessible names, and touch-target sizing. It SKIPS with exit 0 when node or
Playwright is absent (this repo has no package.json and never will), so it
gates where it can run and is silent where it cannot. It found two real
problems while being written: a 23px touch target on the panel header I had
just made a control, and a stale-key bug in the flag parser — both fixed
here rather than by relaxing the assertion. Documented limitation: over
file:// with no network, pialax.html's boot throws "d3 is not defined"
before the watchlist renders (pre-existing, verified identical at HEAD), so
its viewport checks cover only the static shell.

test-core.js gains the flag cases and, more usefully, a parity assertion
that every captured pure function is byte-identical across the two files —
the hand-mirroring contract had nothing enforcing it until now. 27 checks
passing, 21 viewport checks passing.

Mirrored across pialax.html + pialax-mobile.html; the Step 2 bridge and the
holiday-row fade are mobile-only because the desktop layout has neither the
tab split nor the horizontal scroll.

Rollback: revert this commit. The flag key is inert to prior code, the new
test scripts have no other callers, and every UI change is additive or a
conditional around existing markup.

Closes Phase 1. Phases 2-6 (data layer, extraction, decision engine, card
UI, alerts) follow as separate tickets.
