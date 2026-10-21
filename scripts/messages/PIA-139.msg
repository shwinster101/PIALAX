feat(v2): booking — Book and 🎫, times for the pickups, Done by itself

Booking is one obvious control: each traveler's ✈ Book ↗ and 🎫 sit
together once the dates are set, the 🎫 invites its tap when the traveler
comes back from Google Flights, and after it the bar asks for the flight
times the hosts' pickups need. Booked times reach everyone's pickups (a
3:10 PM never saved as 03:10), the stage moves on from the booked flags
alone, 💵 can be recorded only once everyone has booked and always asks
first, and the trip goes into Apple or Google calendars with only its
guest link. app.html is still linked from nowhere. pialax.html,
pialax-mobile.html, index.html, worker.js and scripts/trip-idea-builder.js
are unchanged.

- scripts/trip-model.js (region, inlined byte-identical in app.html):
  - bookSlot(model, code, today): one traveler's hand-off slot, by the
    trip view's own rules (primaryAction, bookToggle): 'gf' before 🔒,
    'book' [✈ Book ↗ | 🎫] once set, 'booked' [✈⏱↗ | 🎫] after their 🎫;
    tk 'self' (my own) or 'org' (the organizer's for someone else), none
    on a host, a guest's view of someone else, or a closed trip.
  - typedTime(s, half): '15:10', '1510', '0905', '0:30' → 'HH:MM'; '6:05
    pm', '6pm', '11:05a' too; '' clears; anything else null. An hour 1–12
    typed with no leading 0 and no am / pm ('310', '9:05', '1105',
    '12:30') is not a time until its half is picked (half 'am' | 'pm').
    timeHalves(s) gives the two readings ('310' → 03:10 / 15:10);
    dayPart(t) 'day' 06:00–17:59 (☀) or 'night' (🌃): the two readings
    of one hour never share a part.
  - timesBy(model, code): 'self' (a booked traveler), 'proxy' (the
    organizer for them), '' (not booked, a host, out, a closed trip, a
    guest looking at someone else, a v1 doc).
  - timesRequest(doc, code, arr, dep, by): one complete answer with the
    🛬HH:MM / 🛫HH:MM note prefixes (the spec's mapping onto the Worker's
    note field), days, airports, origin, 🎫 and the note's text kept; their
    own write clears 📞, the organizer's keeps it as it reads; null for no
    change, a bad time, someone not booked.
  - respondRequest refuses times that would cut the note's text (the
    Worker clips the whole note at 280).
  - bookedRequests: taking a 🎫 back with times recorded sends one
    complete answer clearing 🛬 / 🛫 first (the Worker keeps the 🎫
    through it), then the 🎫; their own clears 📞, the organizer's keeps it.
  - pickups: a recorded time is drawn only while its traveler is booked;
    a cached offer's time only as HH:MM (cachedTime: 'HH:MM' or a
    'YYYY-MM-DD HH:MM' stamp, anything else no time), so a malformed or
    hostile fare-cache value never reaches a chip or a ⏱ run; chips merge
    only with the same 🎫.
  - paidCheck(model): why 💵 can't be recorded ('org', 'token', 'legacy',
    'closed', 'nobody', 'unbooked' with the codes still to book,
    'nodates'), who hasn't answered and which booked travelers have no 🛬
    time (whom and what 💵 freezes), and again (a paid amount the
    organizer can enter again on his token phone).
  - paidHeld(fresh, again): the same on the record it is sent against
    ('closed', 'unbooked', ''); again: '' only while it is still paid.
  - organizerEdit: 💵 on an open trip builds nothing unless every
    traveler on the fresh record has booked; on a trip with no choice
    (never 🔒, or unlocked since) it is [🔒 the plan, then 💵], because
    the Worker's booked needs a chosen. ↩ restoring a dropped paid trip
    and 💵 entered again on a paid one are one booked update.
  - typedPaid(s): whole dollars ('$1,490' → 1490), ≥1 and < 1,000,000.
  - calendarAdd: null without a plan (an undated idea makes no event,
    even for someone with their own window; it had made one over the
    whole window).
- app.html:
  - Trip view: [✈ Book ↗ | 🎫] (the Book link carries data-ret=<id> and
    data-code, whose search it is). A Book tap is remembered (bookOut);
    the page hidden or blurred (bookAway) then shown or focused again
    (bookBack) makes that traveler's 🎫 glow (mine, or the organizer's 🎫
    for the person he booked for, in their sheet and on their board row)
    for INVITE_MS (8s) with "Booked? Tap to mark" for a screen reader; a
    ring stays while it invites (reduced motion too). Once per Book tap; a
    tap on the 🎫 spends it, a Book tap waits 3h at most, and one that has
    not left within LEAVE_MS (8s), or is followed by any other tap in the
    app, is dropped. One that left is kept in sessionStorage
    (pialax_ret_v2 {id, code, at}), so a page the phone discarded meanwhile
    invites the tap once when it loads again (bookResume).
  - My 🎫: one tap, a toast with ↩ for 5s. Then the bar is [🎫 🛬 ––:–– |
    ✈⏱↗]: a button (mytimes, data-k booked) that opens my own sheet with
    🛬 focused, pulsing once (TIMES_PULSE_MS) right after the 🎫 (and the
    🛬 field in the sheet inviting the time: the organizer's 🎫 for
    someone does the same in their sheet); it shows my 🛬 time with its ☀
    / 🌃, and on a paid trip 🔒. Flighty is the square beside it
    ("Track flight"). No static pill styled as a button is left.
  - P-person: the same slot for each traveler (bookRow): my [Book | 🎫]
    (the 🎫 glows there too), my [Flighty | 🎫] with my 🎫 taking it back
    on a second tap that waits with no time limit (arm sticky, 🎫↩?), the
    organizer's [their Book | his 🎫] and [Flighty | 🎫] on someone else
    (bookToggle's confirms); without a link, the trip view's own reason
    (noFlight). Once booked, a times row: 🛬 and 🛫 fields (digits and a
    colon only; an am / pm typed decides the half at once), each reading
    back ☀ / 🌃, selecting what they hold when entered. A field left with
    an hour that could be either half shows [☀ 15:10 | 🌃 03:10] (tmhalf,
    daytime first, ≥44px, no words); one left with a non-time is marked
    ⚠. Times go as the sheet closes (also under another sheet, or on ‹),
    on ↵ (🛬 → 🛫 → saved), or when the page is hidden (flushTimes: what
    can go goes, what waits stays typed). A close with a time that cannot
    go yet holds once (timesHold: the field marked and focused, 🛬⚠ or
    🛬☀🌃?); the next close lets it go unsent. A time typed for someone
    unbooked meanwhile is not sent (🎫⚠). Where a time can't be typed it
    shows beside that leg's day, with ☀ / 🌃, and 🔒 "Times locked" on a
    paid trip.
  - Map tab: the selected trip's pickups (lanesHTML, from the model's
    pickups): one lane per labelled airport (the destination's pin and
    trip emoji, the hub's other airport as a hollow pin), chips "→🛬 11/24
    15:10☀ 🗽" / "🛫→ 11/29 18:05🌃 🌴🗽" (four faces, then +n), a 🎫
    corner on a booked traveler's, maybe dashed, the organizer's token
    phone's cached-offer times grey with ≈, ⏱ brackets for arrivals ≤2h
    apart with how long the run waits (key: "Pickup wait"). Times are
    escaped and HH:MM only. A chip is named for a screen reader ("Lands
    PIA 11/24 at 15:10, booked, Anjo"); one traveler's opens their sheet,
    several opens P-day. No prices.
  - P-stage: 💵 (paidRow) on the organizer's token phone only: at 🏁 Done
    a field (whole dollars) and Save, also reached from the trip view's
    💵 ＋ (paidopen, the field focused); before that a greyed 💵 with the
    faces still to book whose tap says "Not everyone booked" (or "No
    dates"). Save always asks first through the app's confirm (arm:
    ARM_MS, any other tap or a new amount puts it back, the second tap of
    a double tap dropped): ⚠ the unanswered, 🛬 the booked with no landing
    time (three faces each, then +n), 🔒, read out as "Closes answers and
    flight times; no answer from …; no landing time from …", long press
    "Closes answers"; the amount reads back as $1,490. While it is out ◷
    (aria-busy, not disabled), after a failure ⚠↻; a stale 🎫 holds it
    back on the fresh record (organizerWrite guard paidHeld, toast 🎫⚠).
    Paid: 💵 $1,490 in P-stage (✎ enters it again: paidedit, one update)
    and on his card.
  - P-calendar-add (data-popup P-calendar-add): calendar-plus in the trip
    nav on a trip with a plan (handoffs().calendar), a mini postcard with a
    "?" corner while tentative, my days (or the plan) as a pill, and two
    56px links: 📅 .ics (a data:text/calendar URL with a download name,
    named ".ics calendar file, for Apple Calendar") and ↗ Google
    (calendarAdd's TEMPLATE link, a new tab); a tap toasts 📅✓ / ↗✓.
  - P-key reads a glyph with two meanings by both labels (keyLabel:
    "Booking · I booked"); errInfo gains unbooked; LEGEND gains calplus,
    ics, gcal, tentative, pickup, altpin, mybook, tday, tnight, runwait,
    closes, timelock; Flighty reads "Track flight". The sheet's ⌄ and ‹
    are never dropped as the second tap of a pair. S gains ret, invite,
    timesPulse and armSticky.
- Tests:
  - test-trip-model (+23): Set → Booking → Done through the real Worker,
    identical on the organizer's, the traveler's, a host's and a
    faceless phone; answers still taken at Booking (Maybe) and Done (the
    hosts' In); the organizer's 🎫 for someone unanswered or out (In 📞
    first, her note kept); bookSlot in every role and stage; typedTime
    (310, 6:05, 905, 1105, 12:30 wait for a half; the halves never share
    ☀ / 🌃; am / pm typed); timesBy; times through the Worker with note,
    days, ORD leave, EWR and 🎫 kept, read on the host's and a guest's
    pickup chips; the 🎫 taken back clearing them (one answer, then the
    🎫); a stale prefix without a 🎫 and a hostile or stamped cached time;
    the organizer changing one time (📞 kept, a blank clears); the
    280-character note; no answer (409) once paid; paidCheck in every case
    (notimes, again); 💵 in one update on a 🔒 trip, two on an unlocked
    one, and entered again (1,940); paidHeld on a stale 🎫 and a paid
    record (again: held once dropped or reopened); typedPaid;
    calendar-plus at every dated stage, tentative until 🔒, only the guest
    link, none for an undated idea with someone's own window.
  - test-gflinks: an undated idea's own window makes no event (it was a
    tentative 12/19–12/27 one).
  - test-app (+33, against the real Worker): [Book | 🎫] on the trip
    view and in my sheet; no glow without a Book tap, without leaving, or
    8s after a Book tap that never left; the glow after leaving and coming
    back, in both, once, fading by itself, and once after a discarded page
    reloads (none for a kept tap older than 3h or not a trip id); the 🎫
    tap (one /idea/booked), my bar [🎫 🛬 ––:–– | ✈⏱↗] pulsing then not,
    its sheet at 🛬, ↩ taking a mistaken 🎫 back; the organizer's [their
    Book | his 🎫] on Mom & Dad (their own search; back from it his 🎫 for
    them glows in their sheet and on their row, not his own; one tap) and
    the no-link reason (📍? No home airport); times typed, kept through a
    redraw and saved as the sheet closes in ONE answer; the host's and a
    guest's Map chips (🎫 corner, ☀ / 🌃), one traveler's chip opening
    their sheet and several P-day; a hostile cached time (no markup, no
    time) and a stamped one (≈15:20); the organizer's 🛫 change (📞
    kept); a guest reading the times (☀ / 🌃); 25:99 held once, then not
    sent; 440 asking [☀ 16:40 | 🌃 04:40] only once left, holding the
    close, ☀ sent as 16:40; 6:05 pm sent as 18:05; 905 never sent as
    09:05; a time going when the page hides; my 🎫 taken back past 6s
    (sticky), its times cleared in the same write; a time for someone
    unbooked meanwhile not sent; the board's 🎫 for Anjo unanswered
    (confirm, In 📞, booked; Booking on both phones, her answer row
    kept); the card, trip view and P-stage reading Set, Booking, Done on
    three phones, the host answering at Done; 💵 greyed with 🗽, absent
    without the token and on a guest's phone, "0" refused, Save always
    asking (🛬🌽🌴🗽 🔒, named), lapsing after 6s, put back by a new
    amount, $1,490 in one update, 💵 $1,490 in P-stage and on his card but
    no $ on a guest's, ✎ and 1,940 in one update; ⚠🌽 🛬🌴🗽 then 🔒 + 💵
    905; five unanswered as ⚠🌽🐝🦉+2 and named +2; a stale 🎫 holding it
    back; the trip view's 💵 ＋ (not on a guest's); P-calendar-add in the
    nav of dated trips only, tentative and set, with no edit key or token
    in the .ics or the Google link (on the organizer's phone holding
    both), and its spoken names; the key's "Booking · I booked".
  - test-words (+7): two new phones on a Done 8-member long-name trip (its
    organizer on his token phone; a booked traveler, who is also Leo on
    the set Christmas trip), walked at every width with the others; the
    walk types times into every time field (deep), then 310 and 25:99
    left ([☀ | 🌃] asked, ⚠), types 💵 and taps Save (Confirm) after the
    sheet's long presses, or taps the greyed 💵 (its label counted), and
    opens P-calendar-add from every dated trip view (each event checked
    for the guest link only); real clicks through the real Worker: Leo's
    Book (the hand-off itself held back, offline), hidden and shown again,
    the 🎫 glowing ("Booked? Tap to mark"), the 🎫 (one write), his bar
    [🎫 🛬 | ✈⏱↗] pulsing, its button opening his sheet at 🛬, 0905 ↵ 1720
    saved on ⌄ before his whole note, his 🎫 taken back still asking after
    6.3s and ⌄ sending nothing of it, P-calendar-add (12/22–12/27, end
    12/28, confirmed, both links 56px); Bartholomew's 410 (nothing asked
    while typing; left: [☀16:10 | 🌃04:10], ≥44px), ☀, 🛬 16:10 saved, and
    the Map's SAV lane (16:10☀, a ⏱ 0:35 run of 15:05 and 15:40, 18:05🌃,
    20:00, 🎫 corners; ⓘ and long-press over the lanes), a chip opening
    his sheet; the organizer's 💵 ＋ opening P-stage at the field, 1490
    double-tapped (only asks: ⚠ hosts, 🛬, 🔒, $1,490; ⚠'s long press
    "Closes answers"), ↵ paying it (booked, $1,490), 💵 $1,490 and ✎, the
    trip closed 🏁.
  - test-viewport: +19 states per size and scheme (the glow, my [Book |
    🎫], a booked traveler's sheet and a typed time, ☀ / 🌃 asked and a
    time marked ⚠, my booked bar and its sheet, 💵 from 💵 ＋ typed and
    asking first, the greyed 💵, a paid trip with 🔒 times, 💵 with ✎ and
    entered again, P-calendar-add tentative and set, the Map's pickups
    with a ⏱ run and 🎫 corners, a chip's sheet) at 360/390/430, light
    and dark.
  - test-app's seeded ids now stay unique past 99 seeds (they repeated
    from the 100th); its loadApp can share one sessionStorage between page
    loads (a tab outliving its page).

Checked (before the fix pass) against deliberate mutations in scratch
copies, each failing a suite: 💵 built without every traveler booked (organizerEdit); times
written over the end of a long note; the 🎫 glowing on any focus, with no
Book tap away first; 💵 offered before everyone booked; the Map's chips
without their times; the invitation not spent by the 🎫 tap.

Decisions:
- Booked times live in the answer's note as 🛬HH:MM / 🛫HH:MM prefixes
  (the spec's mapping): validateResponse has no time field. They are
  written by one complete answer rebuilt from a fresh read, so nothing
  else in the answer moves, and refused when they would cut the note.
- Times are 24-hour, and an hour 1–12 typed with no leading 0 is not a
  time until ☀ (06:00–17:59) or 🌃 is picked between its two readings:
  no words, and a family that reads 12-hour clocks never saves 3:10 PM
  as 03:10. Saved times show their ☀ / 🌃 wherever they are read, so a
  wrong half stands out. 🌃, not 🌙: 🌙 already counts nights.
- A recorded time is a pickup only while its traveler is booked, and a 🎫
  taken back clears its times in the same write.
- Times save as P-person closes (the spec's flow), on ↵, or as the page
  is hidden; the fields take digits and a colon only (an am / pm typed is
  converted at once), so a typed value is never a word.
- The return from Google Flights is the page hidden or blurred after a
  Book tap, then shown or focused again; it invites the tap once (a
  pulse and a ring, gone after 8s), never on a plain focus, never from a
  Book tap that did not leave within 8s.
- After my 🎫 the primary slot goes to my flight times (the next job for
  the pickups), Flighty a square beside it.
- calendar-plus sits in the trip view's nav (the spec), not in P-stage
  (the prototype); hand-offs keep PIA-137's ✈⏱↗ for Flighty (the spec
  wrote 🛂↗). No event without a plan.
- The .ics is a data: URL with a download name (no blob, no script), so
  the event is in the page and the test can read it.
- 💵 is the organizer's on his token phone only (the amount is a price,
  and prices stay there); before Done it is shown greyed with the faces
  still to book rather than hidden, so the organizer knows it is coming.
- Paying closes answers and freezes times (the Worker's 409), so Save
  always asks first, naming who has not answered and who has no landing
  time; the amount can be entered again on a paid trip (the Worker takes
  a second booked decision).
- The pickups show on the Map tab under the selected trip, as lanes, now;
  a chip of one traveler opens their sheet until PIA-143 hangs the chips
  under its pins and adds P-day's map mode.

Owed (needs a person, a device, a Worker change or a later ticket):
- Times can't be recorded or changed after 💵: the Worker answers 409 to
  every /idea/respond on a paid trip. 💵's confirm now names who has no
  landing time, and frozen times read 🔒 "Times locked"; a note-only
  route, or times in their own field, would need a Worker change.
- 💵 closes the hosts' answers (they stay "in by default"); the confirm
  names them. A Worker that kept RSVP open on paid trips would remove it.
- The ☀ / 🌃 pick and the 🎫 meaning both a stage and a button: part of
  the Mom & Dad icon check owed before cutover (the key now reads
  "Booking · I booked"; a different stage glyph is a spec change).
- A host on a personal #m= link who only looks (the pickups) is asked
  "Who are you?" again on the next open: identity is remembered only on a
  first write (PIA-137's rule against forwarded links); remembering a
  look-only host needs that rule decided again.
- The card's $— is still one tap target that opens the trip (P-total is
  PIA-140's); the trip view's 💵 ＋ is the door to 💵 for now.
- The return glow on real iOS Safari and Android Chrome (a new tab, the
  app switcher, an in-app browser, a discarded page reloading): checked
  in Chromium with synthetic visibilitychange events and a reload sharing
  sessionStorage (the hand-off itself is held back offline), not on a
  device; the glow and its label with VoiceOver / TalkBack.
- Times flushed as the page hides, and select-on-entry of a time field,
  on a real phone (iOS numeric keypad, Android); the ☀ / 🌃 pick with
  VoiceOver / TalkBack.
- The .ics download on a real iPhone (Safari offers "Add to Calendar"
  for text/calendar) and in in-app browsers that block downloads.
- Predicted (≈) pickup times come only from cached offers on the
  organizer's token phone; nothing searches until PIA-140.
- The Map's pins, arcs, the P-day map mode with names and times, ★ the
  cheapest pair landing ≤2h apart, and the alternate pin's airport
  switch are PIA-143's.
- The 2-person comprehension and icon checks listed in CLAUDE.md before
  cutover.

Refs PIA-139.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
