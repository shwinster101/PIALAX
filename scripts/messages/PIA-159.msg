feat(airports): each leg's real airport, one drive to two airports, 12-hour times, 14 + 5; ⚙ #159

The owner: Anjo flies LGA→MDW 10:30 PM on 11/20 and MDW→LGA 5:10 PM on
11/30; Ashwin LAX→ORD 2:35 PM and ORD→LAX 3:47 PM. The app could only say
"O'Hare" for her and showed 24-hour times nobody in the family reads. His
picks: 12-hour display everywhere (stored 24-hour HH:MM), 14 ordinary words a
screen with the 5 marked label words, the Midway drives as named DRIVE
entries, the forced airport pick on rides trips, and the rest as specced.

- Markers (the model's marked region, inlined): two after 🧺 and before the
  text, 🛬IATA and 🛫IATA, read in any order, a repeat as text, built after
  🧺 inside the 280 check (a write that does not fit is refused, never
  clipped). legChoices(dest): the hub pair, its metro, and an airport within
  NEAR_MIN (60) of the hub by DRIVE (ORD [ORD, MDW, PIA], PIA [PIA, ORD,
  MDW], LGA [LGA, JFK, EWR], BOS [BOS]); legOutsideHub, hubNear (the hub
  nearest an airport by drive, else the destination), driveMin, homeDrive.
  apHonored: a marker counts only while the member is booked, the leg has
  its time, the airport is among the choices and outside the hub pair, and
  the leg's effective hub field equals hubNear; tripModel's arrAp / depAp,
  legAp(x, k) the one reader. In respondRequest a patched marker that cannot
  be honored returns null and a carried one that no longer holds is dropped;
  a marker with no time is refused. legPatch / legRequest send a leg's times
  and airports in one complete answer (time-only requests equal #157's
  timesRequest; a hub pick writes arrive_at / leave_from and clears the
  marker; a code not offered, not booked, no time or no change builds
  nothing; timesRequest reads a null, 0 or false time as '', as #157's
  did); bookedRequests clears the markers when unbooking and resets a hub
  field equal to hubNear. HOST_MARKS keeps host promotion to #157's five.
- DRIVE gains 'PIA|MDW': '2:45' and 'ORD|MDW': '0:45', each with "owner-
  confirmed 2026-10-31; change here".
- rides(): step 1 is #157's per-lane runChain; step 2 joins, per kind and day,
  a drive's stops greedily on exact minutes (a pickup whose first landing is
  within RUN_GAP, either way, of the car's arrival there; a drop-off that
  reaches its airport by its deadline and within RUN_GAP of it), each airport
  once, the home airport never; a run's key stays its lead's and uid is
  kind + MMDD + '-' + lead (no airport). Its leave is rounded down to 5
  minutes, its stops walked from there (a pickup stop at the later of its
  last landing and the car's arrival), its back rounded up to 5; exact
  {leave, back} kept. R.apart says why a drive stayed its own: 'wait' (with
  the gap), 'late' or 'nodrive'. Pickups add a lane for each extra airport a
  leg uses (Midway), after the destination and its alternate. rideClaims
  keeps a driver's claim token on a leg only as it is now, else (no current
  token) their first moved one, so a second moved token for one leg, which
  #157 / #158 kept, is dropped on their next write.
- The phone's clock: runLive(run, today, hhmm), nextDrive(R, code, today,
  hhmm) (a drive stays next until it is home, overnight too); primaryAction
  takes hhmm (without it, PIA-157's rule: any drive still ahead by day); the poll's
  backPassed moves the primary, the slot and P-rides' focus on once a drive
  this phone drives has come home (no timer of its own). The time is the
  phone's floating wall clock (a DST night is documented, not fixed).
- Words and calendar: clock, clockRange, rideWhere ("O'Hare (ORD)", "Midway
  (MDW)", "Peoria (PIA)"), rideFull (the full names, the calendar's
  LOCATION), rideWhoLegs per stop, rideLine "Fri 11/20: pick up Ashwin at
  O'Hare (ORD), lands 2:35 PM (leave home 12:05 PM, home about 5:05 PM).";
  rideEvents' title names each stop of a joined drive, its DESCRIPTION is
  the words then the guest link alone, its UID run.uid, and its signature's
  leg ends in '@' + its airport where that is not the first stop's (a run at
  one airport keeps #158's signature).
- 12-hour display (app.html): clockHTML ("10:30 <span class=mer>PM</span>"),
  the board, P-person, P-rides, the primary, the card's slot, the Map's
  chips and lanes, P-day, P-mapairport, the toasts (⛔ 5:00 PM), every spoken
  name. Durations carry data-dur and stay H:MM; a drive of its own's long
  press says its wait in hours ("7:55 hours after Ashwin").
- P-person's booked legs: [code time] (a 44px tmb button into its edit row,
  read only where the phone cannot record it), the edit row: the field (the
  12-hour digits, 92px), the fixed [AM | PM] segment (.ampm: a carried half
  pulses once per value), the pills (legChoices, ≥64×44). tmRead / typedOf
  read a leg's state (saved, ok, carried, wait, bad, blank); forcedPick on a
  rides trip whose choices reach past the hub; legPick (a 🛫 still without
  its time follows the landing's pick where it was planned at the landing's
  airport). timesWait / timesHold: a close holds once for each reason, the
  most urgent first ("🛬⚠", "🛬 AM or PM?", "🛬 Airport?", "🛬 Time?"), ⚠
  and the half once for each leg (HOLD_LEG: L.timesHeld.bad.arr, .half.dep),
  the airport and "Time?" once a sheet (L.timesHeld.ap / .time), so a hold
  spent on the half never spends the airport's ("1030", ⌄, PM, ⌄ still asks
  "🛬 Airport?") and one leg's never spends the other's ("1030" and "510":
  "🛬 AM or PM?", then "🛫 AM or PM?"); a close for a reason already held
  (for that leg) lets it go; a followed 🛫 is not a pick of its own, and a
  time that is no time or waits for its half is never held as "Time?".
  saveTimes: one write through legRequest (or the times
  alone where the note has no room: "📝 Too long: MDW"), the echo on every
  save with timesTell (ride.by and ride.was on the record as it is now);
  flushTimes keeps a waiting, a carried and an unpicked first entry. A field
  focused becomes its leg's edit row; back from a day's calendar the edit
  row holds the field in focus.
- The board: barTimes' labels (data-nm 260+row, 280+row; the landing over
  the bar, the leaving one under it, the airport where it is not the
  destination; the AM / PM at line-height 1, so a label keeps its 16px
  band); fitNames(scr, screenWords, 14); flightAria complete.
- The drive primary names the code of the first stop this phone drives (a
  joined drive shared with another driver); the card's slot reads the leave
  day's numerals ("🚗 11/20" for a drive leaving the evening before a 1:30 AM
  landing) and goes two lines from the day before the leave day.
- P-rides by day (.rday), ①② and the drive between stops, the R.apart long
  press, the 20-word ladder (Drive on later runs, then weekdays, then the
  runs but one fold to chips: runfocus). P-mapairport (its member pick by
  legAp) and P-day map mode take any lane airport (ACTS.mapairport too).
  placeToast keeps a bottom toast 8px above the primary or the tab bar (on
  scroll and resize), else at the top. LEGEND: ① Stops in order; ☀ / 🌃
  removed, with their unused CSS (the model's dayPart, now called by no app
  code, stays for its tests); the unused leaveAt goes.
- BUILD and <meta name="pialax-build"> read 159.

Tests: test-trip-model (509 checks, +18): the grammar in every combination
with the older markers and text, any read order, a repeat as text, 280
refused never clipped; the honor rule (a #157 unbook's leftover markers, a
destination moved to LGA, a hand-typed 🛬BOS, a patched hub marker refused,
a carried one dropped, an airport with no time refused); #158's note
functions kept verbatim read and rewrite a #159 note byte for byte and keep
arrive_at through the Worker; legChoices, hubNear, legPatch / legRequest
through the real Worker (a 270-unit note: legRequest null, the times alone
go; a null, 0 or false time clears as '' does), unbooking; rides() on P town with the real flights (keys, uids, stops,
leave / back / exact, R.apart wait 475, a 'late' and a 'nodrive' case, the
home airport never joining, a 1:30 AM Midway landing leaving home the day
before); the pickup join on exact minutes (ORD 2:00 + MDW 3:00 PM one drive;
ORD 2:32 + MDW 2:40 PM: leave 12:00, Midway 15:17, home 18:05, exact 18:02;
a car reaching O'Hare after its landing; the RUN_GAP boundary either way; a
landing the car reaches too late: 'late'), each airport once (ORD, MDW, ORD
drop-offs: two drives), a second moved claim dropped; claims, nextDrive /
primaryAction at 4:59 PM, 5:06 PM, 12:30 AM, 1:16 AM and 5:16 PM, and
without hhmm pinned to 2cf6ec9's answers on all three phones; the words,
the calendar (DESCRIPTION the words plus exactly the guest link), clock /
clockRange, the DST night pinned. test-app (660, +19): the 12-hour sweep
over the trip pages, P-person, P-rides, the Map, P-day, P-mapairport, the
card and its slot; the board's labels exactly (Midway once, both ends of an
open jaw, a lone 🛫, none at 📍ORD, data-nm 260 / 280 + row); P-rides by
day, ①②, the apart long press and the joined drive's calendar title;
Midway's lane, P-mapairport and P-day on MDW (on 11/30 the joined drive,
its spoken name stop by stop); a note of markers alone showing no 📝; the
primary and slot on the phone's clock, the poll's flip at 5:06 PM on its
own (one frame for the driver, none for a phone that drives nothing), the
day-before primary and slot (11/20 numerals, two lines from Thu 11/19), a
joined drive with two drivers (the primary names Midway); Anjo's first
entry (pills, "🛬 AM or PM?" held once, the 🛫 following, one write, the
echo), a hold for each reason ("1030", ⌄, PM, ⌄ asks "🛬 Airport?"; ⚠ then
the airport; "Time?" then the half; the 🛫's half then the 🛬's airport)
and ⚠ and the half for each leg (both halves asked, then the airport, both
legs at Midway; the 🛫's ask ignored and let go, the 🛬 saved; two ⚠s),
her 🛫 following a saved Midway 🛬, "🛬 Time?", the organizer's airport-only
fix with Tell from ride.was, "📝 Too long: MDW", the flush (an unpicked
first entry and a carried half unsent), New York with no hold, LEGEND; and
every PIA-151 / 152 / 153 / 157 / 158 check re-pinned to 12-hour and the
edit row (the day-cap ⛔ 5:00 PM, the board's labels, the [code time]
buttons, the ride words with "home about", the calendar's notes and
location). test-trust (70): the day cap reads ⛔ 5:00 PM. test-words (181,
+3; 17m05s of its 30): the counter and the gate at 14 + 5 (15 fails, a
sixth marked word fails; ::before / ::after text counted), Anjo's first
times in 6 taps on the one new phone (p9anjo), Ashwin's 3:47 PM in 3
(prorg), the organizer's airport-only fix in 4 with Tell (paorg), Leo's
first time on a rides trip (his airport asked for), the 8-name board at 14
words (labels dropped before names, every bar's spoken name complete), the
Family board of 13 at 14 words (9 names kept, 5 at 10), P-rides by day on
P town and on the 8-member trip (the ladder folding to chips), the 12-hour
Map and ⛔ 5:00 PM. test-viewport (22; 6m08s): Ashwin's 🛬 edit row (the
92px field, two 52×44 AM / PM radios on one line, three ≥64×44 pills) and
the echo toast clear of the primary and the tab bar at 360/390/430, light
and dark; on Mom & Dad's phone P town all set with the real flights: the
board's labels inside their tracks, meeting no label or face, at ≥4.5:1
(AM / PM too), and "🎊 All set", opened from the card, clear of the drive
primary and the tab bar (the #158 screenshot's overlap); Ashwin's own
P-rides (his joined-drive leg with 🚌 / 🚙 inside the sheet); the booked
[code time] rows; P-rides on the 8-member trip by day. test-map-browser
(121, +2): no Midway pin, Anjo's arcs unchanged at the ORD pin, Midway's
own row; 12-hour P-day. test-calendar-browser (104) and the map suite at
14 + 5. Preflight: GO on the final tree, all 6 job-flow suites (cutover
215, migration 239, Calendar 104, words 181, viewport 22, map 121), with
test-worker 91, test-trust 70, test-trip-model 509, test-gflinks 100 and
test-app 660 (shellcheck advisory, not installed here).

Decisions:
- Candidate widening (owner #4) is not built: the PIA-157 candidate rule is
  kept exactly; PIALAX_HQ.md's PIA-159 amendment lists it under "Not built
  (LATER)" with the spec's other later items.
- The safer variants (S1–S9) are followed where the spec offered a choice,
  except S4 (one hold a sheet): the fix passes hold once for each reason (⚠
  and the half once for each leg), so the forced airport pick (owner #5) is
  never skipped by a hold spent on the half, nor one leg's AM / PM by the
  other's.
- The board's AM / PM stays at §6's .78em of the 13px label; PIA-160's
  spec sets its 13px floor.

Known (recorded, not built): a #157 / #158 phone shows "🛬MDW 🛫MDW" as note
text and rewrites it byte for byte; times entered before #159 at O'Hare need
the 4-tap airport fix before anyone claims; floating wall-clock arithmetic
across a DST change is off by the change, and a phone outside Central time
reads ride times as airport-local; on the 8-name organizer board the 14
words go to the names, so its time labels are dropped (the bars' spoken
names keep every time). The calendar UID's format changes once: a rides
event a driver added on #157 / #158 is added again beside the old one on
its next 📅 Phone; the leave rounded down to 5 minutes gives a phone that
added P town's rides on #158 one 📅 dot (11:17 → 11:15). Typed prose that
starts with 🛬 or 🛫 and three capital letters, saved on #158, reads as an
airport marker on #159 and its next write drops it. An airport marker adds
6 UTF-16 units (12 for both legs), so a long note's 🐈 / 🧺 / 🚗 / 🚌 write
meets the 280 refusal sooner. Out drops a leg's airport markers (not booked) but keeps
its times, so Out → In → re-book brings the times back at the planned
airport; clearing a time on a Peoria trip leaves the hub field its marker
wrote (arrive_at 'ORD'); unbooking resets a traveler's own hub pick when it
equals hubNear. Spec tests not written here are recorded
as pending in V2_ACCEPTANCE.md (the moved 🚗 tag, the 8-member board's
label overlap, the two-face day-before primary at 360, Mom's cover-both and
all-three flows, the hold and the flush as real clicks, the Map ladder's
drop order, P town's exact fitter outcomes and the full AM / PM lists in
test-words' P-rides pins).

Owed (needs a person or a real device; V2_ACCEPTANCE.md lists them pending):
- (#10) ⚙ #159 on Mom's and Dad's phones before 11/19 and before anyone
  claims a ride.
- (#11) Rollout: ship → ⚙ #159 on the parents' phones → Anjo enters her
  times only once her phone shows ⚙ #159 → claims.
- The device checks (Mom's labels, P-rides lines and primary at her text
  size; 📅 Phone's Midway event, alarms, location and re-add; the 🎊 / echo
  toast clear of the primary; Anjo's 6 taps and the app-switch flush;
  Ashwin's 3 taps; a stale #157 / #158 tab).
- Confirm nobody added P town's rides with 📅 Phone (the UID change would
  add them again once), that the live trip has no claims yet, and that no
  live note starts with 🛬 or 🛫 and three capital letters.

Closes PIA-159.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
