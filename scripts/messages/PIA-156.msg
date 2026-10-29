feat(whoset): a quiet key under the board; ✈ means booked; two more label words; ⚙ #156

The owner, on #155: "Current look; can the trip page use the blank space
below for something high leverage and not take too much visual effort.
Build something more with the emoji as the ticket did not immediately stand
out to me as flight booked or others being somewhat vague. Add a word or 2
recommended?"

- Who's set: under the trip page's board a quiet key of at most three 44px
  rows answers "who is still to book, who has booked, who is hosting" in
  words, and doubles as the board's legend. Each row is a glyph and one
  marked word in the board's name column (secondary ink, a hairline above,
  no card), then that group's faces (28px faces, 44px-high targets at a
  36px pitch, their outer padding overlapping only; as many as the row
  holds, at most 6, then +N).
- The rows are the model's new whoSet (marked region, inlined), read from
  the record as every screen is, ⏳ Waiting first: before 🔒 and while
  nobody has booked, "⏳ Waiting" = who has not answered (never a host: an
  unconfirmed host is Hosting) and "🏠 Hosting" = the hosts; once 🔒 or
  anyone has booked, "⏳ Waiting" = every traveler not booked yet (waitsOn:
  In, Maybe or not answered, me too), "✈ Booked" = the travelers who
  booked, and "🏠 Hosting"; everyone travelling booked is ✈ Booked (+ 🏠
  Hosting). Someone Out is in no row; a paid, removed or past trip has no
  key.
- The key only takes the space the page left: renderTrip draws it after
  the rows already under the board (the price row, 💵 Paid, the
  organizer's 🔑🔍) and above the primary. On a 678px-tall phone (the
  owner's iPhone with Safari's bars) with a sticky primary those rows keep
  their first-screen place, and on a family trip's three-row board with
  nothing else under it the Waiting row and its Remind show whole above
  the primary; with the organizer's price row before 🔒 the key is a short
  scroll down.
- A face in the key opens their sheet (the board's own 'person' act). On
  the organizer's phone the Waiting row ends in the share symbol, Remind:
  one person waiting besides him → the existing nudge act with their own
  guest link, named "Remind Anjo" (handoffs' new `remind`: the same
  /i/<id>#m= link for someone else the trip waits on, so a traveler In but
  not booked is reachable, which P-person's nudge rule does not offer);
  several → the trip's guest share (tshare), except while the primary
  already is that Share. Guests get none; no link carries a key or token.
- Each row is a group named in a full sentence ("Booked: Ashwin", "Not
  booked yet: Anjo", "No answer yet: Anjo", "Hosting: Mom & Dad"); a long
  press on its word says what it means ("Not booked yet"); LEGEND / ⓘ:
  ✈ Booked, ⏳ No answer yet (waitans, before 🔒 while nobody has booked)
  or ⏳ Not booked yet (waitbook, once 🔒 or anyone has booked), 🏠 Host,
  and Remind (the share symbol).
- ✈ means booked: the booked face badge (the trip board, Family cells,
  every face that carries the mark) is ✈ where 🎫 was (iPhone draws 🎫 as
  a "LIVE CONCERT TICKET"), on the same light chip in both schemes; every
  other visible 🎫 is ✈ too (⚠✈ "Someone booked", ✈↩ on an armed Out,
  ⚠ ✈×N Confirm, the toasts ✈ / ✈ 🏁 / ✈⚠ / ✈↩?, P-cheapest's and
  P-mine's marks, LEGEND). Code comments keep their history. ✈ otherwise
  only leads the arrowed hand-offs (✈ Book ↗, ✈ Track ↗, ✈↗, ✈⏱↗), so
  the glyphs that used it for something else moved: a round-trip fare is
  ↔ (LEG_GLYPH.rt, LEGEND.rt and its "same fare" mark in a traveler's day
  prices), a flight with no link ↗⚠ ("No flight link"), and dates that
  cannot be flown or priced 🗓⚠ ("Fix dates": the primary, the card slot,
  P-cheapest's blocked weeks). ⓘ groups entries by glyph, and ✈ is now the
  glyph of one entry, Booked.
- The booking toggles read as checkboxes, the same words both ways
  (aria-pressed): "☐ I booked" beside ✈ Book ↗ and in my sheet, "☑ I
  booked" there once booked (two taps undo it, as before); the organizer's
  "☐ Booked" / "☑ Booked" for someone. ☑ carries U+FE0E (TK_ON), text
  presentation like ☐. LEGEND tkoff ☐ "Not booked", tkon ☑ "Booked"; the
  unused mybook key is gone. Same writes (mybook / unbook / booked →
  bookedRequests) and the same confirms.
- The word rule (the owner's "a word or 2"): ≤10 ordinary + ≤5 marked
  label words a screen (was 3); the allowlist adds Booked, Waiting and
  Hosting (the key's rows only); popups unchanged (≤20, none marked).
  renderTrip hands the key the marked words the screen has left (5, less
  "Coming?" / "Hosting?" and the primary's): where "Hosting?", Lock dates
  and three rows would make 6, the third row keeps 🏠 and its faces and
  drops its word.
- The job-flow gate gives each browser suite 30 minutes (was 20): test-words
  alone measured 16m33s at #155, 16m39s to 17m00s with this ticket before
  its fix pass and 16m41s after it (169 checks; 16m37s inside this
  commit's preflight, GO in 24m06s); a missing, skipped or timed-out suite
  still fails.
- BUILD and <meta name="pialax-build"> read 156.

Tap counts (test-words, real taps through the real Worker): remind the one
unbooked traveler 1 tap on the organizer's phone (before: 2, her face then
Share, and none once she was In); remind several 1 (the trip's guest
share); a face in the key → their sheet 1.

Tests: test-trip-model (whoSet / waitsOn / remind on records the real Worker
wrote: answers stage, 🔒, a booking before 🔒, Maybe, not answered, Out, an
Out host, the all-set, paid / removed / over, the v1 Thanksgiving, the
8-member trip; Waiting first); test-app (the key per stage and role through
the real worker.js: "P town" on the organizer's, Anjo's and Mom's phones,
hosts, Out, Maybe, me, an unconfirmed host, the v1 trip, the 8-member trip's
+N at 360px with and without Remind; its place after the 🔑🔍 row and,
before 🔒 on a token phone, after the price row and above the primary;
Remind named "Remind Anjo"; nudge for one vs tshare for several, none on a
guest's phone; no key on a paid, removed or past trip whose board drew; the
busiest marked state at 5; ✈ on the board, Family and sheets; ✈ the glyph
of one LEGEND entry (rt ↔, nolink ↗⚠, fixdates 🗓⚠); the checkbox toggles'
/idea/booked writes; no 🎫 left outside comments; the Map lanes and pickups
carry no ✈); test-words (the cap 10 + 5 and its self-test: a 6th marked
word fails, 5 passes, a marked "Waiting" outside the key's rows fails;
every trip page measured within it, the marked words expected on each
updated; P town's key, ⓘ, the word's and Remind's long presses, the Remind
tap count, Anjo's 5 marked words, the busiest state, the 8-member row at
360; a long press that is late looks again for up to 600ms before calling
the bubble missing); test-viewport (the key at 360/390/430, light and dark:
the set trip and the 8-member trip, hairline, 44px rows and targets,
secondary ink, faces apart (on the 8-member trip each taking its own tap
at its centre), Remind at the row's end and reachable, ✈ legible on its
chip, no sideways scroll; at 678px tall the price row before 🔒 and the key's ⏳ Waiting row
with Remind after 🔒 whole above the sticky primary); test-calendar-browser
and test-map-browser count ≤5 marked words. No Worker, storage or link
format change; no Worker deploy.

Decisions:
- The layout (the fix pass, after an audit at the owner's real phone
  height): the spec put the key above the price row, but at 393x678 with a
  sticky primary that pushed the organizer's 🔍 price row (before 🔒) and
  half the Waiting row behind the primary. The key now comes after the
  rows that were already there and Waiting is its first row, so every row
  that was on the first screen stays on it (the primary settles at the
  foot of the screen, as on any longer page) and the headline Remind
  shows; before 🔒 the organizer scrolls a little for the key (his Share
  primary already reaches everyone waiting).
- After 🔒 a member who has not answered is in ⏳ Waiting (the spec said
  "in or maybe"): they are still to answer and to book, and the model's
  own Done needs them booked; "Out members appear nowhere" holds.
- Remind counts the people waiting besides me: when I am the only one,
  there is no Remind; when one other waits it is their nudge even while
  the primary is Share (a different, personal link); several while the
  primary is Share already add no second share (as the nav's share hides
  then).
- Remind reuses the nudge act; handoffs gains `remind` (the same guest
  link builder) rather than widening `nudge`, so P-person's Share rule
  and its word budget are unchanged (the model's comment names the seam).
- The key's faces show at most 6 and as many as the row holds at the
  phone's width (at 360, 4 beside Remind and 5 without), so no row ever scrolls
  sideways; the group's name lists everyone.
- The word's long press says its meaning without names (a 9-member row
  could pass 20 words); each face names itself.
- The key's ⏳ shares its glyph with the card's days-left ⏳, never on the
  same screen.

Owed (needs a person or a real device):
- On the owner's iPhone once main updates: ⚙ #156; "P town thanksgiving"
  shows ⏳ Waiting 🗽 (Remind) / ✈ Booked 💪 / 🏠 Hosting 🌽 under the
  board; ✈ reads as a plane on Ashwin's badge; one tap on Remind shares
  Anjo's own link.
- iPhone, light and dark: "☐ I booked" / "☑ I booked" (and the organizer's
  "☐ Booked" / "☑ Booked") read as a matching checkbox pair, ☑ drawn as
  text like ☐; ↔ on a round-trip fare reads as one fare both ways.

Closes PIA-156.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
