feat(housekeeping): remove an old trip as it is; More says what it does; whose fare; ⚙ #155

The owner, on #154: "I'm trying to delete this because it's a duplicate of
the other trip which is our Thanksgiving trip... what is price 1, is it
worth being there? How would I understand this menu?"

- Remove a v1 trip for everyone, as it is. updateRequest (trip-model,
  inlined) refused every write on a docLegacy record but P-migrate, so
  P-stage greyed 🗑 with "⤒ Update trip first"; yet the Worker's
  /idea/update takes a decision alone on any record (applyDecision only
  touches doc.decision; every Worker-created record has one). The model's
  legacyDecision now lets exactly two edits through on a v1 record: a
  decision to dropped, and the ↩ that undoes it (restoreDelta of that
  dropped record, nothing else), each a decision alone, so no idea is ever
  sent and the v1 idea stays byte-identical (the trip still reads as v1).
  Every other v1 edit still builds nothing, and a record with no decision
  object takes neither (model.hasDecision; the Worker would throw).
- restoreDelta moved from app.html into the model region (unchanged for v2
  trips) so updateRequest can tell the one ↩. On a v1 record it sends:
  {decision: {stage: booked, actual_total}} when it was paid (the Worker's
  booked keeps its choice untouched, re-stamping booked_at); else
  {decision: {stage: chosen, chosen: <a copy of the record's own stored
  decision.chosen>}} when it held a choice (decisionBody, for a dropped v1
  record with no idea sent: the Worker re-reads it through validateIdea, so
  its place, days, familyTotal and estimate_total come back as they were;
  only chosen_at is re-stamped; a v1 choice unlike its recommendation stays
  as chosen); else {decision: {stage: proposed}}. ⤒ Update trip on a
  restored record goes through as before.
- Two organizer phones: when ours finds the record already where the tap
  would put it (another phone removed it before our 🗑 Remove, or restored
  it before our ↩; or the reply to ours was lost before ⚠ ↻),
  organizerWrite settles with nothing sent (an updated trip simply sends
  the idempotent repeat), instead of a bad_body ⚠ ↻ that never clears. Only a removal
  and restoreDelta's ↩ settle so; every other v1 edit is still refused.
- P-stage: 🗑 is live for the organizer on a v1 trip; it waits ("⤒ Update
  trip first", pointing to ⤒) only while a ⤒ update of that trip is half
  done on this phone (midUpdate: its transfer journal not done) or on a v1
  record with no decision object (removeHeld; an updated record with none,
  never drawn by the Worker, shows no 🗑 at all). The same P-drop, ↩ toast
  and shelf ↩ as a v2 trip; other phones shelve it as removed. A removed
  trip's card and nav carry no ⤒ invitation (migInvite): its next step is
  ↩, then ⤒ is back.
- ⋯ More says what it does: the stage is one quiet line (stageLine: five
  dots on a hairline track, filled done, a ring now, hollow later, and only
  the stage it is at; role img, "Stage 2 of 5, Asking" on a long press;
  no pointer, no border), not five rows that read like radio choices; a
  removed trip's line dims its dots only ("Removed" at full ink: AA).
  "🗄 Hide on my phone" / "🗄 Show on my phone" (a toggle whose name
  changes carries no aria-pressed; not drawn on a trip the shelf holds
  anyway, removed or over, where it would change nothing), "🗑 Remove for
  everyone", "↩ Restore"; P-drop (its dialog named "Remove trip") with
  "🗑 Remove" beside Keep, P-edit's tile "Remove", a removed trip
  "Removed" (stageName, the closed chip, LEGEND.dropped);
  LEGEND.hidehere "Hide on my phone"; the stepper's CSS and its sdone /
  snow / snext keys deleted. The shelf row stays "🗄 Archive n".
- The price row says whose fare: priceAsk draws 🔍 with the faces of the
  travelers whose flight is not searched yet (unpricedOf: an unbooked
  traveler with a missing leg P-total's tap would search; up to 3, then
  +N), "🔍 Price 🗽" with nothing cached, "$1,234 🔍🗽" beside a total;
  priceWho names them ("Price Anjo’s flight"; "and 1 more flight"; my
  own unnamed v1 "Me" is "my") in the row's label, or on the faces beside
  a total. The count and the cost stay on P-total's 🔍N (D4 unchanged),
  and every 🔍N (spendBtn) now says what its number is on a long press,
  as its spoken name does ("Search 1 fare"); the lock chip (⛔) is
  unchanged. priceShown: the row
  shows before 🔒, once a fare is cached, or once paid; after 🔒 with
  nothing cached there is none (each traveler's P-person keeps its 🔍N;
  ✈ Book ↗ opens Google's live prices), and the card's 🔍N follows the
  same rule. searchChip lost its unused word form; the 🔑🔍 door is
  unchanged.
- barTimes: no muted 🛬? on my own bar while my primary already is
  "🛬 Landing time"; other booked travelers keep it on the organizer's.
- BUILD and <meta name="pialax-build"> read 155.

Tap counts (test-words, real taps through the real Worker): remove a v1
trip for everyone 3 (⋯, 🗑 Remove for everyone, 🗑 Remove) from its card or
its trip page (before: impossible without ⤒ Update); hide on my phone 2
(⋯, Hide); price an unbooked traveler after 🔒 2 (their face, 🔍N).

Tests: test-trip-model (the v1 drop and its ↩ through the real worker.js,
idea JSON compared byte for byte, the decision before the drop and after
the ↩ compared field for field but chosen_at, the exact ↩ body, a v1
choice unlike its recommendation, a paid and a never chosen v1 trip, a v2
↩ still built from its plan, ⤒ after the restore, every other v1 edit
null, no decision object); test-app (the card and trip-page removals of
idea-thanksgiving-legacy.json, Mom's shelf, toast and shelf ↩ with the
estimate kept, two organizer phones racing on the drop and on the ↩, the
half-done update, More in seven states ≤20 words and unmarked, no 🗄 on a
removed or past trip, the price row before and after 🔒 and with a cached
fare, priceWho's words, my bar's 🛬?); test-words
(the tap counts, P-stage and P-drop counted in every state, its long
press, a 🔒 trip priced from Leo's sheet); test-viewport (the stage line
and P-drop at 360/390/430 light and dark, the faces row whole);
test-migration-browser (its stage read from the new line). No Worker,
storage or link format change; no Worker deploy.

Decisions:
- A v1 ↩ sends the record's own stored choice back (read from the fresh
  organizer GET, never caller data), so the trip comes back as it stood,
  estimate included; the Worker has no way to keep chosen_at, so that one
  field is re-stamped (as booked_at is for a paid trip). A v2 ↩ is still
  built from the plan, as every 🔒.
- Only restoreDelta's own ↩ goes on a dropped v1 record (not any stage),
  so a v1 record never takes a decision the app would not build itself; a
  race is settled in organizerWrite (nothing sent) rather than by letting
  the model build a repeat.
- The card's money chip keeps its 🔍N before 🔒 (the spec asked for faces
  on the trip page's row; a card has no room for them): it is named
  "Group total, not searched, N to search" and opens P-total, where the
  cost shows before anything is spent.
- The stage word "Dropped" reads "Removed" everywhere it is said (the
  closed chip, a day's why, LEGEND), the word 🗑 now carries.

Owed (needs a person or a real device):
- On the owner's iPhone once main updates: ⚙ #155; remove the duplicate
  "🦃 Thanksgiving at home — Peoria" (3 taps), check it sits on Mom's
  🗄 Archive shelf; the price row on "P town thanksgiving" (none after 🔒).

Closes PIA-155.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
