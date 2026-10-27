feat(declutter): every symbol means one thing; +3 label words where they matter; 🔒 Lock dates; ⚙ #154

- The word rule: a screen keeps ≤10 ordinary words and may add ≤3 marked
  label words (data-lbl3) from one list: Coming?, Hosting?, Lock dates,
  I booked, Landing time, Track, Lands, Leaves, and Tue / Wed / Thu in
  Calendar's weekday header (gridHTML lbl3). A popup keeps 20 and marks
  nothing. screenWords() / countWords(root, {lbl3}) count ordinary words
  only, so fitNames never drops a name for a label.
- One next step: primaryAction (trip-model, inlined) returns share |
  lock | book | times | track | none for every role, with travelWindow
  (booked, d1−1…d2) and lockable (the organizer's updated open trip with
  a plan and a place that has not begun). primaryHTML draws it: [share
  Share]; [🔒 Lock dates] (lockDates: the dlock no-move write,
  organizerWrite {decision: chosen} with closedGuard; toast 🔒 with ↩,
  unlockUndo = the existing unlock write with bookedGuard); [✈ Book ↗ |
  🎫 I booked]; [🛬 Landing time] (mytimes); [✈ Track ↗] (Flighty). The
  card's slot follows the same rule: ✈↗ only once 🔒, 🛬 once booked,
  ✈⏱↗ in the travel window, the share symbol for the organizer while
  someone waits, nothing for lock; the host's 🏠 kept, and 🧭↗ Explore
  on the organizer's card of an idea with no place (guests and the trip
  page no longer show it). bookSlot's 🎫 outcomes are unchanged.
- One glyph, one meaning: SHARE, an inline SVG of the share symbol in
  currentColor, replaces 📣 in the nav, the Share primary, P-person's
  nudge, More's Share row and the list's top row (LISTSHARE deleted; its
  +N badge kept, on an organizing phone only); attention is a small dot
  on it (sharePulse), not a filled pulse, and it rests for the visit
  once he has shared that plan (S.sharedNow); the toast is the symbol ✓.
  🎫 only means booked (a face badge, "🎫 I booked" / "🎫 Booked"; the
  history importer's stage tools are words); 🔒 only on the pill, in
  P-dates and Lock dates (gone from postcard corners and the hero disc);
  stage pips, the US locator, the book-by arc, 👋 on rows, ☀ / 🌃 on
  saved times (they stay at time entry) and 📌 on pills are retired (it
  stays where the event day is set: P-dates, the create and edit
  steps); ⏳ is a plain number, red only on the organizer's late card,
  "Days left" on a long press; 🛬 / 🛫 always beside a word (P-person,
  the Map's columns, P-mapairport). LEGEND gains share, more, notime,
  askme and the stepper dots; every data-k drawn has its entry.
- No placeholders: no $— chips (P-total's never-searched legs read —;
  P-person's unsearched legs are one 🔍N), no 0 or dots on calendar days
  (the numeral only where someone travels), no ––:–– placeholder in the
  time fields; a booked traveler with no landing time shows a muted 🛬?
  over his bar on the organizer's phone only.
- Trip page: the nav is ‹, 📶⚠, ⤒, the organizer's share (hidden while
  the primary is Share, not on a dropped trip), ⓘ (no first-run pulse
  while my answer is awaited: keyBtn(quiet)) and ⋯ More; ✎ and 📅＋ moved
  into More. A compact header (tripHead: a small postcard with the hosts
  in the house, the title, 📝 only with a caption, 📍 under it) replaces
  the hero, its stage disc and heads ring. The date row is the pill (no
  📌, no −1 / +1) and whoChip: my answer as a chip ("✓ In ⌄", achip
  opens In / Maybe / Out in place, S.ansOpen), 🏁 / 🗑, "Trip over", 👋 ?
  or 🙋＋⏳ (a phone that is nobody on a paid or dropped trip gets 👋 ?
  beside 🏁 / 🗑: P-face is how it reaches its Track). The answer row
  asks "Coming?" / "Hosting?" while awaited; a
  host's default In is an ordinary unpressed button (the dotted ring
  stays on the face). The mine line shows only for days outside the
  plan, and goes after Keep mine. The board names every row (mine
  tinted; namePrio drops my name first, those the trip waits on last;
  shrinkNames measures with a Range, so "Mom & Dad" shrinks to fit the
  76px column instead of ending in an ellipsis a quarter pixel short),
  one top badge per face, no 🏠 / ⚠ bar tags and no tail column. One
  price row (totalRow: "🔍 Price N", "$1,234" with a stacked bar of the
  priced travelers and 🔍N, or "💵 $X") opens P-total; "💵 Paid"
  replaces 💵 ＋.
- ⋯ More (P-stage): the trip's title across its header (with its
  picture only when the title does not start with it), a stepper of
  the five stages with dots, then 44px rows ☆/⭐ Pin, 🗄 Archive, Share,
  📅 Calendar, 📝 Note, ✎ Edit, 🗑 Drop / ↩ Restore, and 💵. Opened
  from a card too (⋯ where the stage disc was). From the trip page's
  💵 Paid it holds the amount alone (named "Paid"), so its field and
  Save stay in view over the keyboard.
- P-dates: [👪 Plan | my face Mine]; 📌 Event, 🗓⊘ Clear, 📉 Cheaper as
  labelled chips; holidays only while there is no plan; no 👥 (Calendar
  › a day is P-day); −7 −1 +1 +7 always there, a shift that cannot go
  dimmed with its numeral and its why; the main button is 🔒 Lock dates
  once nothing is left to save on a lockable plan (a Save that leaves it
  where Save was holds taps for a moment, so a double tap never locks;
  focus lands on the new main button); a saved plan that cannot be
  locked yet (no destination, already begun, over) shows it greyed,
  saying why, and dlock writes only on a lockable plan. My own days:
  "My days" by my face, no [🛬 | ↔ | 🛫] segment, "👪 11/6–11/9" and the
  shift row only once a day is picked or my days are my own. One end
  from P-person reads "🛬 Arrive" / "🛫 Leave". Calendar and P-dates
  share tripCell: my days underlined only where they leave the plan, a
  day's spoken count only where its numeral is drawn, the ⟦ ⟧ window
  ends in P-dates alone (no lone bracket on Calendar).
- P-person: "🛬 Arrive" / "🛫 Leave" rows, a day that follows the plan
  dimmed, PIA | ORD only while unbooked, a code only where it is not the
  destination, open-jaw one-ways only before booking; ±1 day fares only
  for an end already priced; the visit's dots only when ≤4 remain or a
  lock is on; the organizer's "🎫 Booked" for someone (orgTkBtn: the
  board's 🎫 column moved here, for someone Out too); Share first for
  someone waiting; "📝 Note" or the
  note's first words (as many as the sheet's 20 leave, 2–8). ⇄ in my
  own sheet's header.
- Cards: one 8px dot after n/N where the card needs this phone's look,
  the very cards tripsBadge counts: my answer awaited (any phone,
  "Your answer"), else new answers on the organizer's own cards; one ⚠
  whose cause is its long press. Family: names on every row (mine
  tinted in my colour: .self on its head and cells, so nothing there
  takes the trip page's .mine line style), one badge per cell, empty
  not-invited cells. Map (the faces off the map under a hairline): the trip's
  title opens it (selTitle, for the mini card); the pickups are a table
  (lanesHTML: 🛬 Lands | 🛫 Leaves, one row per hub airport, its head the
  airport button; chips "MM/DD HH:MM" over the faces, solid when
  booked; P-mapairport's rows "🛬 Arrive" / "🛫 Leave"). Calendar: all
  seven weekdays, plain cells. P-day's ＋ only on
  an organizing phone, under the faces. P-calendar-add: 📅 Phone, no ?
  corner (the event's own title says "? "). ⚙ on a phone that
  organizes nothing: the build and one 🔑 (orgreveal); on the
  organizer's, 📜 Import and 🔑📱 Devices labelled.
- The trip page's ±1 is gone (ACTS.shift removed); a ±1 run kept by an
  earlier build is still sent on the next load, and a booked replay
  asks in P-error as before. What the removed controls left is deleted:
  ACTS.dlook and lookMode (👥), ACTS.dend (the segment), S.facePulse
  (the me row), avatar's per-face dot, and the hero, pip, locator,
  book-by arc, board tail, total block and me-row styles. personKeys (a
  traveler's 🔍N) is the model's tapKeys for that one traveler: one rule
  for which legs a tap searches. No Worker, storage or link format
  change; every write goes through respondRequest, bookedRequests,
  timesRequest, freshWrite or organizerWrite. BUILD and pialax-build 154.
  The accessible names start with the words shown ("I booked, tap to
  mark"; "Price, group total, …").
- Tests: test-trip-model (primaryAction's every branch, travelWindow,
  lockable, bookSlot unchanged); test-app (Lock dates through the real
  Worker with its ↩ and the guest who cannot, every primary incl. Track,
  the answer chip, the share dot, the price row, More's rows, P-dates'
  Lock as main button, the kept-run replay, every data-k with a LEGEND
  entry and every marked word on the list, none in a sheet; a nobody
  phone on a paid and a dropped trip, the follow chip and shift row,
  the greyed Lock dates that writes nothing, the share dot's rest, the
  cards' dot, 💵 Paid's sheet, Calendar's marks, More's header, the
  Family tint, the dead paths); test-words (the counter and its list
  with a self-test, and the gate itself driven end to end: measureScreen
  and measurePopup on pages over the limits must fail, at the limits
  must not; Tue / Wed / Thu marked on Calendar only; the walk on every
  phone at 360/390/430, the B1 states with their marked words, the
  section C tap counts with real clicks: nudge 2, Lock 1 and ↩, Edit /
  Note 2, Calendar 3 (the 📅 Phone file link tapped), build 2, answer
  change 2, guest share 2, flights before 🔒 2 (the ✈↗ link tapped),
  the organizer's 🎫 for someone 2; Diwali 13 / Tahoe 19 re-measured;
  the native share sheet and the opened tab are not counted);
  test-viewport (the header, the date row with its chip
  and the pickups table at 360/390/430, light and dark; P-dates with
  Lock as its main button); the calendar, map and migration browser
  suites follow the moved controls.

Decisions:
- P-dates shows no "✓ Saved" once a lockable plan is saved: its main
  button becomes 🔒 Lock dates at once (the save's own toast 🗓✓ says
  it landed); Save stays, disabled with why, where nothing can be
  locked.
- ⓘ's first-run pulse waits while my answer is awaited: the answer row
  is the one call on that screen.
- Holiday chips show only before a plan exists; once there is one,
  −7 −1 +1 +7 move it.
- ±1 day fare chips appear for an end only after that end's own fare is
  cached (the person's 🔍N first), so no chip ever reads $—.
- A booked traveler's sheet has no fare rows (the flight is bought).
- ✈ Book ↗ only once the model's dates are locked; before that (and on
  a v1 trip) the plain ✈↗ search stays, beside 🎫 I booked when the days
  are known (earlyBook).
- The P-person note preview takes what the sheet leaves of its 20
  words (2–8): the longest name with the answer row and a full flight
  section leaves fewer.
- A locked, unbooked guest's pill still opens My days with Save (B7
  calls that sheet read-only): it keeps PIA-138's own days while locked
  in 4 taps, where read-only would leave two one-end picks (6 taps);
  while those days follow the plan the sheet shows no follow chip and
  no shift row, so the clutter the spec meant to remove is gone.
- The cards' one dot also marks a card waiting on my answer on any
  phone (spec B2 drew it on the organizer's cards alone): it is exactly
  the set the Trips numeral counts, so "2" on the tab points at two
  cards; it reads "Your answer" (key askme), apart from "New answer".
- The Share dot rests for the visit once he has shared that plan, even
  while someone still has to answer; ⓘ's first-run pulse is unchanged
  (one cue fewer, no new rule for ⓘ).
- 🔒 Lock dates in P-dates stands greyed with why on a saved plan that
  cannot be locked (no destination, already begun, over), where the old
  🔒 tool did; the trip page's primary keeps the spec's rule (Share when
  nothing is lockable).
- Not changed (rejected, with why): the nameless v1 "Me" row keeps no
  name (it was so before; naming it from a preset at read time could
  name the wrong person on a v1 doc, and ⤒ Update trip names it); ⓘ's
  first-run pulse does not wait for the Share dot (the dot now rests
  after a share, which removes the case the audit saw); P-dates keeps
  its ⟦ ⟧ window ends even where one end is off the month (B7 draws
  them there; only Calendar drops them).

Owed (needs a person or a real device):
- On the owner's iPhone after main updates: ⚙ #154; the Thanksgiving
  trip's primary; 🔒 Lock dates and its ↩; ⋯ More's rows; Map's pickups
  table; the share symbol reads as "share" to Mom.

Next (not in this ticket):
- 12-hour display of saved times; a "Needs you" header with counted
  chips; a mono-SVG chrome icon set; "Remind" for travelers still
  unbooked after 🔒 (spec section D).

Closes PIA-154.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
