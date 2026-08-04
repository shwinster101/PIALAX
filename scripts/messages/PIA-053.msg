data(peru): departure settled Sep 4 — red-eye makes the briefing

The Sep 5 clash is RESOLVED. The friend going on the same trek shared their
booked itinerary (2026-08-02): depart home Friday Sep 4 evening, overnight
into Lima, morning hop to Cusco landing Sep 5 before 11 AM — comfortably
ahead of the 17:00 briefing — then leave Cusco the night of Sep 12 after the
trek and fly home Sep 13. That is exactly the "Fri Sep 4 late red-eye"
option this app has been recommending since the clash was detected; the
user is mirroring it from LAX.

Data changes, both files:
- Watchlist seed: dep 2026-09-05 → 2026-09-04 (ret stays 2026-09-13);
  notes rewritten to record the decision; 'dates' blocker CLEARED (that
  blocker existed solely for this clash), 'price' kept — flights are still
  unbooked. nextAction is now the booking itself.
- Trek card fits-line flips ⚠→✅: the standing warning ("Sep 5 red-eye
  lands Sep 6, after the briefing") described a plan that no longer exists.
- Binder seeds: outbound flight segment Sep 4→5 with the briefing now
  REACHABLE (its note said "you are in the air" — no longer true); the
  deliberate seeded overlap that surfaced the clash on the timeline is gone
  because the clash is gone.
- Holiday quick-pick "Peru Sep 5–13" → "Peru Sep 4–13"; HOLIDAYS anchor,
  applyHoliday branch, solo preset chip (id cuz-sep5 → cuz-sep4, referenced
  nowhere else), peruFlightOptionsHtml default, and every stale comment.

One-off migration (_scrubStalePeruDep): PIA-050 persists dep/ret in
localStorage overrides on every save, so any device that touched the app
while the seed said Sep 5 carries overrides.peru.dep='2026-09-05' as a
stale echo of the OLD seed — and would silently clobber the corrected date
forever. On load, exactly that value on exactly that trip is dropped;
any genuinely user-chosen date (Sep 6, anything else) survives. Same
targeted-migration pattern as _isSeedDupMemphis, applied at both restore
sites (localStorage + ?wl= share links, which can carry the stale date
too). Verified in a browser: a seeded stale override renders Sep 4 with
the user's own notes intact.

Decision-engine effect (flag-on), verified in a browser: Peru flips
CHANGE_DATES → WATCHING, the booking CTA returns, and the review line reads
"Searching LAX → CUZ Sep 4; LIM → LAX Sep 13 · Multi-city". The Memphis
clash chip semantics change from back-to-back to a same-day chain — which
is now deliberate, and commented as such.

PII discipline (PIA-044): the friend's flight numbers, airlines, and
routing stay OUT of the repo. Public text carries only what was already
disclosed — a friend is in Cusco Sep 5–12 — plus the user's own plan dates.

Known follow-up, out of scope here: with the assistant flag ON, the
collapsed row's cross-trip clash chip is not rendered (the decision line
replaced the legacy second line wholesale in PIA-050). Flag-off default UX
still shows it. Worth folding clash info into COORDINATE evidence later.

Rollback: revert. The scrub is inert once the seed and the stored value
agree.
