feat(housekeeping): hide or drop from the card; 👪 plan vs my days; old trips first-class; ⚙ #153

- Cards: the stage disc is a 44px button with a thin ring, named by its
  stage ("Asking"; stageBtn), that opens P-stage over the list; opened
  from a card, P-stage's header names the trip (free: the card is under
  the sheet). P-stage keeps ☆/⭐ and 🗄 and, for the organizer, adds 🗑
  Drop (stagedrop opens the existing P-drop confirm, with its undo) or ↩
  on a dropped trip. 🗄 from a card closes the sheet with 🗄 ✓ (the
  shelf's 🗄 n is the receipt, and a second tap never quietly undoes
  it); from the trip page it stays open as before. On a v1 trip 🗑 is
  greyed and says "⤒ Update trip first" (needsUpdate: the organizer's v1
  trip, or an update left half done). The shelf restores as before.
- The organizer's v1 card carries ⤒ (migcard, "Update trip"): one tap
  opens the trip with P-migrate on top and spends the visit's pulse. It
  pulses with the trip view's ⤒ (pulseFor, MIG_LIST for the list, the
  same MIG_PULSE_MS / MIG_SPENT rules; ⤒ tapped in the trip spends the
  cards' pulse too); while it pulses ⓘ and 📣 wait (S.hush / hushed(),
  reset by Family and Map / Calendar), so one thing pulses at a time.
- P-migrate's first page shows the trip's name and picture with
  P-edit's own controls (titleFields, shared by P-new and P-migrate):
  migrateRequests takes choice.title (refused when it has no name, sent
  only when it differs) inside the update's one write; an emptied name
  pulses the field and sends nothing; what was typed comes back when the
  sheet is closed and opened again (S.drafts.mig, memory only) and
  survives a re-review of a record that changed meanwhile. Current /
  Travelers are filled with ✓ when picked, outlined otherwise
  (aria-pressed styled), each with its m/d–m/d. After the update the
  sheet closes back to the trip (migDone) with a ✓ toast, 🔒 ✓ when the
  trip is now Dates set.
- Plan vs mine: the trip's date pill carries 👪 ("group plan" in its
  label); my own days carry my face (mineLine); when they differ, ⚠
  on my line (amber inside the plan, red outside it) is a "My days"
  button that opens P-mine: 👪 with the plan and my face with my days
  (🎫 when booked), 🗓 Follow plan (ownDays' patch through freshWrite,
  never for a booked traveler; ↩ in its toast puts my days back,
  mineBack, held by a 🎫 or close made meanwhile), Keep mine (quiets ⚠
  on my line and the card's ⚠🗓 on this phone until the days change:
  pialax_ui_v1.kept, v2-only, keyed by the days, pruned only for trips
  no longer on the phone) and, for the organizer, 👪 Make plan
  (planDelta through organizerWrite with bookedGuard; ⚠🎫×n Confirm
  first when someone has booked; undo as P-dates). Locked, closed, past
  and v1 say why (on a v1 trip "⤒ Update trip first", pointing to ⤒).
  mineVsPlan (trip-model, inlined) decides all of it from the model.
  ⓘ explains 👪, my face line and ⚠.
- v1 trips are first-class: earlyBook no longer excludes a v1 record,
  so a traveler with their own face gets the flight section (✈ Book ↗,
  🎫, then the 🛬/🛫 times in the note) through bookedRequests /
  timesRequest, which the Worker takes on any record. Only the
  organizer's 🎫 and days for someone else, the answer rows for others,
  Make plan and P-dates' trip half wait for the update: each is greyed,
  says "⤒ Update trip first" and pulses ⤒ (migNudge / migPoint), now
  also in P-person's header for the organizer (reached from the Family
  board or the Map).
- Smaller fixes on these screens: 📜 for Import history (it shared ⤒),
  in ⓘ and V2_ACCEPTANCE.md too; a join request pending on this phone
  shows 🙋＋⏳ "Asked to join" where 👋 ? was; "Mom & Dad" keeps its
  spaces (oneWord) and is drawn "Mom&Dad" (tightAmp) only where a word
  or the room is short: fitNames over the word budget, shrinkNames when
  it would be cut ("Mom & D…"), P-new-who's one-word chips and P-face
  above six people; a greyed toggle half looks greyed; 🗑 in the danger
  colour.
- No Worker, storage-format or link change; BUILD and pialax-build 153.
- Tests: test-trip-model (v1 bookSlot for Anjo, the organizer and the
  organizer for Anjo; 🎫 and times on the v1 record through the real
  Worker, then the update keeping them; the rename "Chicago trip" →
  "🦃 Thanksgiving" in one update, the same name sending identical
  bodies, nameless names refused; mineVsPlan's cases and Follow / Make
  plan through the real Worker; oneWord); test-app (the card's stage
  button, P-stage naming its trip, hide closing with 🗄 ✓ and restore,
  drop and its undo, greyed 🗑 and ⤒ pulsing again, one pulse at a time
  on the list and the trip and not on Family / Map, ⤒ in the trip
  spending the cards' pulse, guest and dropped P-stage, ⤒ on the card,
  P-migrate renamed with its pressed states, closing with 🔒 ✓, the
  empty-name guard, the typed name kept on reopening and through a
  changed record's re-review (one update), Anjo's v1 flight section
  booked with times, the organizer's greyed 🎫 / days / answer / P-dates
  half / Make plan each pointing to ⤒, P-mine for a member, the
  organizer, a booked traveler, a locked plan and a v1 trip, Follow
  plan's ↩ and its 🎫 hold, Keep mine quiet only for the kept days (her
  start or the plan moved elsewhere brings ⚠ back; the card too) and its
  pruning, a 🎫 landing after P-mine was drawn holding Follow plan
  (🎫⚠) and Make plan (⚠🎫 confirm), 📜 and the pending join; each new
  guard mutation-checked against the suite); test-migration-browser
  (the update reached from the card, renamed, pressed styles differ,
  one update, 🔒 ✓ and back on the trip with its new name, at every
  width and theme); test-words (the card's ⤒ and stage, P-stage, its
  why, P-migrate with a 12-word name, the 👪 pill and ⚠ line, P-mine
  with Make plan's why, Keep mine, Anjo's sheet on the organizer's
  phone, a guest's own flight section, words counted); test-viewport
  (each new state on the organizer's and Anjo's phones, 360/390/430,
  light and dark).

Decisions:
- Drop keeps P-drop's confirm: the card reaches 🗑 in two taps (stage,
  🗑) and the confirm is the third, so a trip the family shares is never
  dropped by a stray tap; 🗄 Hide stays two taps.
- Drop on a v1 trip waits for ⤒ Update trip (greyed, says so): every
  other organizer edit of a v1 record goes through P-migrate's one
  reviewed update, and a drop through updateRequest on an unmigrated
  record is not a path this ticket risks on the family's live trips;
  🗄 beside it clears the trip from his own list in the same two taps.
- Keep mine is a per-phone acknowledgement, not shared state: it
  quiets ⚠ on my line and my card only for those exact days; nothing
  is written. My face's ⚠ mark (in the me row and on the board) stays:
  it is the same mark everyone's phone shows for my days.
- Make plan is offered only to the organizer; on a v1 trip it is
  greyed ("⤒ Update trip first"), as P-dates' trip half is: the plan's
  own move waits for the update. Follow plan stays on a v1 trip for
  everyone, now with ↩ (it is the existing follow-plan write).
- The organizer's date pill on a v1 trip still opens his own days, with
  the trip's half greyed and saying "⤒ Update trip first" (the queued
  fix's second option): making the pill explain-only would take away
  his quickest way to his own days on the family's live trip.
- A v1 traveler's 🎫 and times are allowed because the Worker's
  /idea/booked and /idea/respond accept any record; the organizer's 🎫
  for others waits, since a v1 row may not yet be the person it names.

Owed (needs a person or a real device):
- On the owner's iPhone after main updates: the Thanksgiving card shows
  ⤒ and its stage button; ⤒ → rename "Chicago trip" → "🦃
  Thanksgiving", Update, 🔒 ✓; then hide the superseded card from its
  stage button; ⚙ #153. Consider updating the live Thanksgiving before
  the family books.

Next (not in this ticket):
- The empty first-run screen's ghost card still uses stand-in faces
  (🦊🐼🐸) and has no glyph row saying a trip arrives by link.
- The v1 "Me" has no read-time display name (Mom and Anjo know Ashwin
  by 💪 alone until the update).
- Greyed rows reached from Calendar or P-day on a v1 trip say "⤒ Update
  trip first" but have no ⤒ of their own (P-person's header now does).
- P-migrate's rename saves only with Update on page 3 (two ▶ away); a
  calm unsaved mark on ▶ or an Update on page 1 would say so.
- The list's ⓘ names the stage disc by its stage, not as the way to
  hide or drop (no key entry was added for that).
- Follow plan and Make plan sit side by side for the organizer; which
  is primary could depend on whose days differ.

Closes PIA-153.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
