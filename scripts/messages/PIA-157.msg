feat(rides): who drives each run, when to leave home, in the key, P-rides and the phone calendar; ⚙ #157

The owner, now that Thanksgiving is booked: "Now that we're booked what's
the focus here? I don't want it to focus on the flight tracking too much but
really own that planning and booking phase like we've done, and logistics
like family pickup and to/from airport." Getting between O'Hare and Peoria
is a mix: a family member drives, or the traveler takes the bus or a rental
car.

- Which trips have rides (the model's rides(), marked region, inlined): a
  host who is not Out lives at a DRIVE_PIVOT airport (Peoria, PIA) and the
  destination is PIA or ORD; anything else (New York, no Peoria host, a
  host who said Out, a removed trip) is null. Its runs follow pickups' ⏱
  rule on booked times only (never a ≈ cached time; on the organizer's
  token phone a ≈ chip can still join a Map bracket that no run holds):
  legs of one kind at one airport on one day, chained at most RUN_GAP (2h)
  apart by runChain, the one rule for the Map's brackets and the runs. A
  traveler's own 🚌 / 🚙 leg is in no run. Nothing about a run is stored
  (D2).
- pickups() now chains arrivals and departures apart: departures get their
  ⏱ bracket too, and a departure between two arrivals no longer splits the
  arrivals' run (b2cfd85 chained only neighbouring arrivals in the
  time-sorted lane, and never departures). Every
  timed leg carries its run id; a run of two or more its group (the
  bracket). An untimed chip merges only with one of the same 🚌 / 🚙.
- ⏰ leave home: a pickup leaves its drive before the first landing and is
  back its drive after the last; a drop-off leaves its drive plus RIDE_LEAD
  (2:00) before the earliest flight and is back after twice the drive. The
  drive is HOME_DRIVE (PIA 0:20) at the home airport, else the hub pair's
  DRIVE (PIA|ORD 2:30). P town: Ashwin lands 14:35 → leave home 12:05, back
  17:05; he flies 15:30 → leave 11:00, back 16:00. An arrival before 02:30
  leaves the day before.
- A claim lives in the driver's own answer note, "🚗ashwin-p8.aORD1120"
  (the traveler, a|d, the airport, MMDD; never the time): a time change
  that day keeps it and moves ⏰; a day or airport change leaves it moved
  (⚠, open) until ✓ (op 'ok') moves it to the leg as it is now. A claim
  counts only from one of that run's candidates as it is now: the hosts
  not Out, then the travelers there all that day (answered, d1 < day <
  d2), in trip order. Ignored: a claim on a leg nobody flies (unbooked,
  Out, removed), on a leg the traveler covers themselves (🚌 beats a
  claim), on the driver's own leg, by a driver who said Out, or by someone
  who can no longer drive that run (a traveler whose own days moved off
  it: that leg is open again); the driver's next ride write drops every
  claim that does not count.
- The answer note's grammar: ['📞'] ['🛬HH:MM'] ['🛫HH:MM'] ['🚗'claims]
  ['🚌'legs] ['🚙'legs] ['🐈'legs] ['🧺'dishes] text. parseRespNote reads
  each new kind once and the first unknown, malformed or repeated token
  starts the text, so a #156 phone (b2cfd85's functions, verbatim in the
  test) reads 🛬 / 🛫 from a #157 note, keeps the rest as text and writes
  it back byte for byte. 🐈 and 🧺 are read and written by the grammar now
  (DISH_PALETTE is defined) so PIA-158 needs no format change; no screen
  shows them. buildRespNote refuses (null) a note whose markers alone pass
  280; respondRequest refuses any marker or time write that would pass 280,
  never clips; typedNote strips a forged leading marker; noteRoom counts
  the markers.
- Writes, all through the one path (freshWrite → respondRequest):
  ridesRequest(doc, driver, runKey, 'on' | 'off' | 'ok', by, today) and
  groundRequest(doc, traveler, kind, 'bus' | 'rent' | '', by, today), each
  one complete answer rebuilt on the fresh record; null for no change, a
  closed or past trip, a run behind us, a driver who is not a candidate,
  the organizer's write for someone on a v1 trip, or a note too long.
  rideClaims and groundPatch are the same rules without the note, so the
  phone tells a note with no room ("⚠ Too long", errInfo too_large,
  nothing built or sent) from the rest. rideToggle is the one rule for a
  toggle's tap and its aria-pressed: 'on' while a leg of the run has no
  driver ('on' claims every such leg, a traveler who joined the run since
  too), else 'off' when the driver has a leg of it (a run shared with
  another driver is let go), else 'on'. rideGuard holds a tap, on this
  phone's record before anything is built and on the fresh one: 'taken'
  (every leg is someone else's: "🚗 Already covered", nothing sent),
  'same' (the record already is what the tap asks, as when Mom's phone
  and Dad's, one member, claim one run within a poll: 🚗✓, nothing sent,
  no error), 'gone' (the run changed: 🚗⚠), 'closed' (🏁); groundGuard
  holds 🚌 / 🚙 as 'same' or 'closed' on the fresh record. A host-default's first
  ride write answers In ('self': no 📞; the organizer's: 📞). Toasts 🚗✓ /
  🚌✓ / 🚙✓ carry ↩ (the inverse op through the same builder), except after
  an 'on' that added to legs the driver already had, which an 'off' would
  not undo.
- The trip page: whoKey adds the 🚗 Rides row after ⏳ Waiting (whoSet's
  rows keep their order; alone on a paid trip): a dashed chip per open run
  still ahead (🛬 / 🛫, the day, the faces; ⚠ moved), "🛬? 💪" for a booked
  leg with no time (that sheet at the time), as many as the row holds then
  +N, the organizer's Ask at its end (rideAsk: one candidate → nudge with
  their own link, "Ask Mom & Dad"; several → tshare, "Ask"); covered, the
  drivers' faces and the travelers' 🚌 / 🚙. Its word "Rides" (marked)
  while the screen has one left and the primary is not "🚗 Rides".
- primaryAction keeps every step and adds rideStep after them: 'drive' (I
  drive a run still ahead) before 'rides' (open runs ahead, and I am the
  organizer or a host who can drive one). 'drive' also on a paid trip;
  never 'rides' for a traveler. "🚗 Rides" opens P-rides; 'drive' reads
  "🚗 11/20 ⏰12:05" with the faces of the travelers I drive on that run
  ("Leave home 12:05 Friday for Ashwin"; a traveler who joined it with no
  driver yet is not among them). The card's slot: 🚗? / 🚗11/20 / from the
  day before 🚗⏰12:05, in a host's 🏠 place only then.
- P-rides: a section per airport with runs (📍ORD first, then the other
  pin); each run: its end, day, ⏰ (a long press: "Leave home 12:05: 2:30
  drive, at ORD as Ashwin lands"), ⏱ for several legs ("Time apart"), and
  a line per leg (face, time, who drives). A candidate's own phone: "☐ 🚗
  Drive" on each run they can drive (the word while the sheet keeps ≤20);
  the organizer's: each candidate's face as a toggle (both by rideToggle),
  ✓ for a moved ride, Remind for a run one driver has. 🚌 (never at home's
  airport) / 🚙 inline on a lone leg and on the traveler's own phone,
  behind a tap on their face in a run of several; the quiet lines (own 🚌
  / 🚙, no time yet, still to book); a greyed control says why (Trip
  closed, Removed, Trip over, ⤒ Update trip first).
- 📅 Phone (a driver, in P-rides): rideEvents' one VCALENDAR (icsCalendar,
  which icsText now uses too, byte-identical), a VEVENT per run still ahead
  from leaving home to back in floating local time, VALARMs at -P1D and
  -PT30M, DESCRIPTION the guest link alone, UID <id>-<driver>-<run>@pialax,
  rides-<slug>.ics. pialax_ui_v1.rides keeps its signature (each run's key,
  its day, ⏰ and its legs' times), read back less the runs already behind
  us (rideSigAhead: a run that passes is no change). Any difference with
  the rides ahead dots 📅 Phone, the card and the Trips numeral
  (rideChanged), also once this phone drives nothing ahead while its
  calendar still holds the old events: opening the trip then says "📅
  Rides changed" once and forgets what it added (rideAck). A phone that
  never added its rides gets no dot.
- Words beside a guest link, never a key, token or price (rideText, 12-hour
  times): Ask "🚗 Can you drive? Fri 11/20: pick up Ashwin at ORD Chicago,
  lands 2:35 PM (leave home 12:05 PM).", Remind "🚗 Reminder: …", and the
  times toast's share symbol when a 🛬 / 🛫 is saved on a leg someone else
  drives (timesTell: "Tell Mom & Dad", their own link, on the organizer's
  phone; "Tell", the trip's link, elsewhere): "🚗 Ride update: …".
  shareLink takes the text: navigator.share {text, url}, the clipboard text
  and link; without text it is unchanged ({url}). A nameless v1 "Me" is
  named in these words and in the ride controls' spoken names as the
  family preset names that airport and face ("Ashwin": rideName,
  rideLabel), never "Person" or a bare face.
- Elsewhere: a booked leg in P-person carries its ride after its time (a
  44px button into P-rides, named by its leg and day: "Landing 11/20 ride:
  Mom & Dad driving") and a host's line "🏠 ORD 🚗2"; on a rides trip each
  booked Map chip with its time (or its own 🚌 / 🚙) an 18px corner badge
  (the driver's face, 🚌, 🚙, a dashed ?, ⚠; never on a ≈ chip) said in its
  name; P-day's map mode a 🚗 per run. The trip page's 💵 Paid waits while
  a run ahead is open; ⋯ More's 💵 confirm names them (paidCheck(model,
  today).norides: "; rides open: Ashwin, Anjo").
- LEGEND / ⓘ: noride 🚗? No driver yet, lvhome ⏰ Leave home, bus 🚌 Bus,
  rental 🚙 Rental car, ridemoved ⚠ Ride changed, ask (the share symbol)
  Ask, notimed 🛫? No leaving time, ridenew (the dot) Rides changed; ⏱ is
  "One ride" and its time "Time apart". errInfo gains taken and gone.
- The word rule's allowlist adds Rides (the key's row and the primary
  only; CLAUDE.md, HQ §12, V2_ACCEPTANCE, test-words). No flight number or
  confirmation code is stored; nothing tracks a flight. No Worker change,
  no Worker deploy, no storage or link format change (pialax_ui_v1 gains a
  rides field).
- BUILD and <meta name="pialax-build"> read 157.

Tap counts (test-words, real taps through the real Worker): Mom & Dad
from Ashwin's iMessage, the "🚗 Rides" primary (1) → "☐ 🚗 Drive" (2);
from the list, the card's 🚗? (1) → Drive (2); 📅 Phone 1 more in the same
sheet; when to leave 0 (the card's 🚗11/20, the trip page's primary).
Ashwin: what is uncovered 0 (the key's chips, the card's 🚗?); Ask 1 (the
key's share); cover a run for Mom & Dad 2 (its chip, 🌽); remind the
driver 2 (the row, the run's share); a moved ride back 2 (its ⚠ chip, ✓);
Anjo as renting 2 (her chip, 🚙). Anjo, the coach home 2 (her 🛫 chip,
🚌). ↩ 1.

Tests: test-trip-model (478 checks) through records the real
in-process Worker wrote, on a P town fixture: the grammar's round trips
in every order, forged tokens, noteRoom, the 280 refusal on an 8-member
trip with 32-character codes; b2cfd85's parseRespNote / buildRespNote /
timesRequest verbatim reading and rewriting a #157 note byte for byte, and
a marker before 🛬 breaking it; every ⏰ (12:05 / 17:05 / 11:00 / 16:00),
Anjo's chained runs, the interleaved-departure fix against b2cfd85's
pickups, an arrival before 02:30, a same-day time change, a day or airport
change → moved → ok, unbook / Out / removed, 🚌 over a claim, two drivers,
a past run, no rides for New York or no Peoria host; the write rules
(host-default → In with or without 📞, the organizer on an answered host,
v1, paid → null and the Worker's 409, the taken guard); primaryAction for
every role and stage; norides; rideEvents and rideText; calendarAdd and
icsText byte-identical to b2cfd85; a share of a run let go (rideToggle
'off', Bob's claim kept, through the Worker), a joined traveler's leg
claimed, 'same' / 'taken' guards and groundGuard, rideClaims / groundPatch
telling a note too long apart, a claim from a traveler no longer there
ignored then dropped by their next write (through the Worker), the 📅
signature less the runs behind us, rideName for the v1 "Me". test-app (620
checks) through the real worker.js: the Rides row per role and stage (the
organizer, Mom & Dad, Anjo, nobody; paid alone; removed and past none), the
budget-drop rule, Ask for one candidate (Mom & Dad's own link) and for
several ("Ask": the trip's /i/<id> link and the ask in words, no key, no
#m=), P-rides' contents and controls, a claim and its ↩, both runs → the
drive primary, slot and 📅 file (alarms, floating times, the guest link, no
key), a time change → Tell and the card's dot, P-person's glyphs (named by
leg and day) and host line, the organizer's 📞 claim, Anjo's 🚌 and its ↩,
a revealed leg, paid (alone, the door waits, the confirm names the open
rides), Map badges and brackets and P-day's 🚗, shareLink {url} unchanged
without text, LEGEND, BUILD 157; and Mom's and Dad's phones claiming one
run (🚗✓, nothing sent, no "Not saved"), ⚠ Too long with nothing sent, a
shared run's ☑ let go, a joined traveler left out of the drive primary,
a kept run behind us no change, the dot once nothing is driven and its
one "📅 Rides changed". test-words (174 checks): the tap counts above,
every new state ≤10 + 5 and P-rides ≤20 unmarked on every phone (the
8-member trip's too), the self-test for Rides marked outside the key's
row and the primary, and every face in a ride control marked a picture
for the glyph check. test-viewport (22 checks): P town's key with its
Rides row and P-rides on the organizer's phone, and the 8-person P-rides
on a host's, at 360/390/430, light and dark: 44px named targets, nothing
over an edge, no sideways scroll; at 678px tall ⏳ Waiting with its Remind
whole above the sticky "🚗 Rides". test-map-browser (119 checks): the real
map's brackets on both columns, the badges, P-day's 🚗 and a claim through
the real Worker redrawing them. Preflight: GO, all 6 job-flow suites
(test-words 16m37s of its 30).

Decisions:
- A removed trip has no rides at all (rides() is null), so it shows no
  'drive' either; a paid trip keeps 'drive' until its last run's day.
- A claim by a driver who said Out is ignored: they are not there to drive.
  So is one by a traveler who is no longer a candidate of that run (the
  spec's "ignored" rule extended, rather than "moved": nobody could ✓ it).
- A run's key is kind + airport + MMDD + its first traveler in the trip's
  order (not its first time), so a time change that day keeps the key and
  the claim.
- The key's Rides row needs a run still ahead; a booked leg with no time
  alone does not draw it (its 🛬? chip shows once there is a run).
- A traveler is a candidate only once answered (In or Maybe) and there the
  whole day (d1 < day < d2). Every host not Out is a candidate, as the
  spec says, wherever they live.
- groundRequest does not require a booking; the app offers 🚌 / 🚙 on a
  booked leg only.
- Remind's and Tell's openings ("🚗 Reminder:", "🚗 Ride update:") are this
  ticket's wording.
- The organizer's primary before 🔒 stays Share / Lock dates (PIA-154's
  step 2), so "🚗 Rides" shows on his phone once the dates are 🔒.
- The key's Rides row fits its chips by width estimates measured in
  Chromium (a chip 48px + 8.2 a character of its day + 17 a face): on the
  organizer's phone with Ask beside them, P town shows its first run and
  +1 at 360 and 375 and both runs from 390 (test-viewport asserts both at
  390 and 430).
- P-rides budgets "Drive" at 20 less a code a section and "Phone": with at
  most 8 members (at most 14 runs) it never runs out, and test-words checks
  that on the 8-member trip.
- The Map's ride badge is 18px (the spec said 16px): the size of the
  app's other corner marks (a face's status mark, the count badges).
- ⏱'s LEGEND words change on purpose ("Pickup run" → "One ride", "Pickup
  wait" → "Time apart"): it now brackets drop-offs too, so "Pickup" would
  no longer be true.
- The dot for a driver who drives nothing clears when the trip opens (the
  one place it can be seen and said), not at 📅 Phone, which a non-driver
  does not have.

Known (recorded, not built): a stale #≤156 tab shows the markers as note
text, and its note editor could delete a claim; every ride write is an
answer write, so it lights the organizer's new-answer dot; two phones
writing one member's answer at once is still last write wins. Times are
wall-clock on the leg's own day: a landing after midnight on the day after
the traveler's first day, or a ride across the night the clocks change
(2026-11-01), puts ⏰, the calendar event and its alarms off by that day or
hour. A host who lives at ORD would be offered Drive with Peoria's ⏰. An
earlier traveler joining a run changes its key and so the calendar
event's UID (adding it again may make a second event). Marking 🚌 / 🚙 on
a leg someone drives gives no Tell (its toast keeps ↩); the driver sees it
in the app, and by the card's dot only once they added the calendar. A
traveler cannot ask for a ride yet (the organizer's Ask is the one share;
a later ticket can put it on their own dashed 🚗?).

Owed (needs a person or a real device):
- The owner confirms DRIVE 2:30, HOME_DRIVE PIA 0:20 and RIDE_LEAD 2:00;
  that Mom & Dad's first ride answers Hosting? as In; and the paid door's
  wait (for P town: no 💵 until the 11/30 drop-off is covered).
- On Mom's iPhone: the multi-event rides .ics from 📅 Phone imports with
  Add All and keeps both alarms; whether adding it again after a change
  replaces the events (by UID) or duplicates them.
- ⚙ #157 on Mom's and Dad's phones.
- Whether Mom & Dad read the 24-hour ⏰12:05 and 14:35 correctly (the
  calendar and the iMessage say 12-hour).
- Whether 🚗 and 🚙 can be told apart on their screens, light and dark.

Closes PIA-157.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
