feat(watchlist): booked-reality sync, urgency window, Thanksgiving seed

Ashwin booked the next three trips separately, outside the app (Flighty
screenshots are ground truth) — this update syncs the watchlist to
reality and ships sprint items #2 (urgency window) and #3 (Thanksgiving
meetup emphasis, leaning PIA). Both files:

Reality sync (PIA-064):
- New seed 'nyc' — B6 424 LAX→JFK Fri Aug 28, BOOKED, one-way on
  purpose: it chains into Memphis instead of returning to LAX.
- 'memphis' — BOOKED, and the real itinerary departs LGA (DL 4903
  LGA→MEM Mon Aug 31), returns Thu Sep 3 via DFW (AA 3932 + AA 1913).
  Dates corrected Sep 4 → Sep 3.
- 'peru' — BOOKED via LATAM through Santiago (LA 603/650/2028), NOT the
  direct red-eye the plan assumed; lands CUZ 2:25p Sep 5, 2.5h before
  the briefing. Return LA 2224/2478. Trip binder flights updated to
  match on both trips.
- Targeted migrations (same pattern as _scrubStalePeruDep): stale
  pre-booking stage/dep/ret overrides on peru+memphis are dropped so a
  device that touched them keeps showing BOOKED (user-typed notes,
  nextAction and blockers survive); a hand-added NYC trip in the booked
  Aug 28 window is deduped against the new seed (_isSeedDupNyc).

Urgency window (sprint #2):
- An unbooked (watching/planning) trip inside 7 days of departure gets a
  red card border + "⏰ departs in N days — still unbooked"; inside 14,
  amber. Booked trips get a calm "✈ departs in N days" countdown inside
  two weeks. Header gains a "🔴 N URGENT" count.

Thanksgiving (sprint #3):
- New family seed 'tgiving' (key 'thanksgiving'): Nov 25–29, hub leaning
  PIA — the first LGA-era family gathering (sister's first trip home,
  LGA→PIA). Stage planning, next action "lock the hub, then one live
  fetch"; estimates via the LGA fare model (≈$740 total at PIA today).
  Open ↗ lands on the planner with the Nov dates via the existing
  holiday preset path.

Also: PIA-063 alert ACTIVATION marked deferred in backlog.md (can't sign
up for Resend right now — merged code stays dormant in preview-only).

Verified headless-Chromium (both files, 20 checks): seeds render booked
with countdowns; stale overrides scrubbed while a user note survives;
NYC dup dropped; a 3-days-out unbooked trip renders the red card + ⏰
line + header URGENT count; Thanksgiving renders a family estimate and
Open lands on the planner at Nov 25–29. Watchlist button audit re-run on
the 5-card board: 192/192. Tests: 27 + 217 + 60 passing; node --check
clean. Preflight: known sandbox cdnjs-403 SRI NO-GO only.

Rollback: revert.
