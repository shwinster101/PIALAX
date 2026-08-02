feat(assistant): alerts (contract+preview), preflight gate, sprint close

Phase 6 — the final phase of the 2026-08-02 "Context to Decision" sprint.
No email provider exists (spec's explicit fallback), so this ships the full
contract, per-trip preferences, and a Preview panel that renders exactly
what a real send would contain; pialax_alert_log_v1 IS the outbox until
PIA-052 wires delivery.

A REAL BUG, FOUND ONLY BY THIS REVIEW

Before writing a single alert function, I re-read every file end to end, the
way the user asked. That surfaced something no fixture had caught:
recomputeTripDecision (built in Phase 4) read loadTripStates()[tripId] as if
it were the live TripState — but Phase 5 made TripState derived fresh from
the item + facts on every render, and never writes to trip_state_v1.
Nothing called recomputeTripDecision either. So it was a 100%-silent no-op:
every call found `states[tripId] === undefined` and returned null. Two real
consequences: fare history was NEVER actually recorded from a live render
(only from direct test calls), so typicalRangeFor() could never see live
data no matter how long a real user ran the app — Phase 4's "typical range"
promise was quietly broken since the day it shipped. And there was no home
for "did anything change since I last told this user something," which is
exactly what alerting needs.

Both are fixed here. Fare-history recording moved into assistantViewFor —
the one place a trip's fare is actually assembled — gated the same way it
always was (observed prices only, one point per day). trip_state_v1 is
repurposed as a small "last seen recommendation" cache used SOLELY for
alert diffing; it is explicitly never read back for rendering, which stays
fully derived per PIA-050. This is called out at length in PIALAX_HQ.md so
it isn't silently rediscovered later.

ALERTS

buildAlertEvent(tripState, rec, snapshot, prevSnapshot, prefs, now) is pure,
priority-ordered the same way computeRecommendation is: a blocked trip
outranks a price movement, because a fare drop on a trip whose dates still
conflict with something fixed is not good news — it's exactly spec scenario
H, and exactly why that branch explains the conflict instead of ever saying
to book. Verified: dropping Peru's fare while its briefing conflict remains
produces a 'fare_drop' event whose body names the conflict and — checked
directly — never contains "book"; the same conflict with no price movement
produces 'constraint_violation'; a tentative companion produces
'conflict_needs_you'; a clean drop on an unblocked trip is free to mention
booking, because that's when it's the correct advice.

Mock prices are excluded from alerting the same way they're excluded from
the decision engine (PIA-050): a fabricated "drop" from a sample number
never fires anything. alertDedupeKey buckets by day + $10 price band so
opening the app five times about the same wobble produces one event, not
five. checkAndQueueAlert runs after every card render, deduped and cheap,
and never throws into the render path — a broken alert must not break the
card.

One recipient email lives in Admin & Diagnostics (spec: "one verified
recipient per account"); per-trip settings are just enable + two
thresholds. UI: enable toggle, fare-drop %, deadline-days, Preview email
(builds and shows the real event honestly — including saying plainly when
there's nothing to alert on yet, never fabricating one), and a short sent
log. Turning the assistant flag off hides all of it; prefs and the log
persist regardless, verified in a browser.

A SECOND BUG, FOUND WHILE WIRING THE ABOVE

The Admin panel's alert-email input never restored its saved value on
reload, despite the value being correctly persisted. Root cause: its
one-time init IIFE sat near the OTHER early boot wiring (next to
wireFlagToggles, from Phase 1) — but it reads ALERT_PREFS_KEY, a top-level
`var` that's declared (hoisted) but not yet ASSIGNED that early; the alerts
data-layer block lives much later in the file. loadAlertSettings() silently
read `undefined` as the storage key and always came back empty. Moved the
init to run immediately before boot(), guaranteed to execute after every
earlier var assignment. Verified: save → reload → value restored.

PREFLIGHT + DOCS

preflight.sh gains step 8/8, running test-core.sh, test-extraction.sh, and
test-worker.sh (each already self-skips without node; a real failure in any
of them now blocks the push, same as every other step). test-viewport.sh is
deliberately NOT in this gate — it needs a browser and real wall-clock time,
so it stays a manual/CI-optional check. Renumbered steps 1-7 to 1-8.

worker.js documents the exact POST /alert design for a future provider
(Resend or MailChannels) — structurally identical to /extract, drop-in, not
a redesign — filed as backlog PIA-052. PIALAX_HQ.md gets a sprint
retrospective: what shipped, an honest caveat about the parser-accuracy
number (100% against fixtures the same person wrote proves consistency, not
real-world recall — the actual quality signal was probing with inputs that
had no fixture, which found 4 real bugs across the sprint), and the
TripState-is-derived architecture note so nobody reads trip_state_v1 back
for rendering by mistake again. Setup guide explains alerts are
preview-only and why the copy never says "book now" on a blocked trip.

Tests: 9 new alert fixtures (scenario H, plain constraint/coordinate cases,
clean fare-drop, deadline, disabled, below-threshold, mock-price exclusion,
unconfigured-trip) plus dedupe-key and settings-sanitizer coverage — two of
my own fixtures were wrong on first write (an H-scenario drop that didn't
clear the default threshold; a dedupe-key pair straddling a bucket boundary
by coincidence) and are corrected here rather than the assertions loosened.
217 checks in test-extraction; 27 + 36 + 21 elsewhere.

Invariants: SRI unchanged, no new loadPrices(true) sites, ANTHROPIC never
appears in either HTML file, both files at full parity across all 15 new
symbols, recomputeTripDecision fully removed rather than left as a second,
confusing dead path.

Rollback: revert, or turn the flag off. Alert keys are additive; nothing
existing changed behavior except the fare-history fix, which only makes an
already-shipped, already-advertised feature (typical range) start actually
working.

Closes Phase 6 and the sprint. PIA-052 (email delivery) is the one
deliberately deferred piece, tracked in backlog.md.
