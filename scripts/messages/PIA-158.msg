feat(pets): Nebby per trip, Kona at home, the house fills up, who brings what, 🎊 once; ⚙ #158

The owner: "Where do I get the little side bubble with a cat? I'm bringing
Nebby. Pet in cabin. ... Make it more fun and incentivize us as users to
want to log in." His picks: 🐈 Nebby per trip and a 🎉 fun layer, and:
"Home has Kona, family dog. She deserves a spot too."

- The pets come from the family preset, never from a stored field (the
  model's marked region, inlined): PETS beside FAMILY (Nebby 🐈 flies with
  Ashwin, Kona 🐕 is at home with Mom & Dad), familyKey (familyOf's name
  rule with the face left free, read from the record row, so a v2
  "💪 Ashwin" is 'ashwin'; a label that is only a face counts only as the
  preset's own face; a renamed member or a moved home airport is nobody's)
  and a member field fam. petOf(x): {g, name, legs, flies} for a traveler
  who answered In or Maybe with 🐈 legs, {g, name, home} for a host not
  Out; petsOf(model) is a function, never baked into the model (its string
  and price scans walk the model object). Kona is never written and never
  in heads.
- Writes, the one path (respondRequest → respond() / freshWrite):
  petRequest(doc, code, legs, by, today) and dishRequest(doc, code,
  dishes, by, today) with by 'self' or 'keep'; petPatch / dishPatch hold
  the same refusals without the note's room, so the phone tells "⚠ Too
  long" (nothing built or sent) from the rest (rideClaims' pattern);
  petGuard / dishGuard hold 'closed' and 'same' on the fresh record. null
  for a closed or past trip, the organizer's write for someone on a v1
  trip, no change; 🐈 also for someone who is not a traveler In or Maybe
  or whose preset has no pet that flies; 🧺 also for someone Out, a
  traveler who has not answered, a 4th dish or one off DISH_PALETTE. A
  host on their default answers In through respondRequest's existing rule
  (📞 when the organizer writes it). Every other marker is kept: a dish
  write keeps the driver's 🚗 claims and a 🐈 write keeps 🛬 / 🛫, byte for
  byte on a note in the app's own marker order (a hand-made note's
  repeated claim or out-of-order markers are tidied, as every #157 marker
  write already does).
- "+ Nebby 🐈": rideWho names the traveler "Ashwin + Nebby 🐈" on a leg she
  flies, so Ask, Remind, Tell and the driver's calendar SUMMARY say it;
  rideEvents' signature ends that leg's time in "+🐈" (rideSigAhead still
  keys off field [1]), so the driver's 📅 Phone, card and Trips numeral get
  their dot. No name or pet field is added to a run, so every signature of
  a run without her is #157's byte for byte (no 📅 dot lights for nothing),
  and runSaid, namesOf and the ride controls' spoken names are unchanged.
- houseScene(model, today) → {win, path, door, walk, lit} by day alone;
  allSet(model, today): at least one traveler, all booked, rides null or
  no open run ahead and no booked leg ahead without its time, not removed
  or over.
- P-person: Ashwin's flight section (once he has answered, after
  bookRow, before the note row is fitted) "☐ 🐈 Nebby" / "☑ 🐈 Nebby"
  (tkBox, aria-pressed, "Nebby comes"): both ways (🐈ad) or none, on his
  phone ('self') or the organizer's for him ('keep', not on a v1 trip;
  petWrite, groundWrite's shape: 🐈✓ with ↩, no Tell), then › to P-pet
  with 2/5 on his own phone; elsewhere, and on a closed or past trip,
  "🐈 Nebby ›" to read while she comes. Mom & Dad's sheet: "🐕 Kona" on its
  own row after their 🏠 line (the host line itself unchanged), and while
  Nebby comes "🐈 11/20–11/30 ›" (her owner's days) into P-pet with "At
  home with Kona" open.
- The side bubble: an avatar() option, passed only by the trip board (16px
  at top 13px, left -8px on its 44px faces: clear of ×2 above and 📝
  below) and P-person (18px at mid-height on the 72px face); none on 28px
  faces (P-rides puts 🐈 beside Ashwin's face on each leg she flies), the
  Family board, or the 40 / 48px sheets (P-day and the Calendar's day
  among them). Markup <span class="pet" data-k="petfly|pethome"> (class
  first, so the PIA-142 cross-view reading of board marks is untouched); a
  long press names it in place ("Pet flying", "Pet at home"). personAria,
  which names a member's face wherever one is spoken (the board, P-person,
  the key, Family cells, the Map and P-total), adds ", with Nebby" /
  ", Kona at home", bubble or not.
- P-pet (SHEET_NAME 'Nebby'): on the owner's own phone while she comes, 44px
  ☐ / ☑ ticks kept in pialax_ui_v1.pet[id] ('adcpf' letters, pruned to the
  trips in the list, in memory where storage refuses): 🛬 Reserved and 🛫
  Reserved for the legs she flies, 👜 Carrier (🧳 stays Trips), 📄 Papers,
  💲 Fees; then the reference folds (data-free): nebbyTravelNotes moved here
  from SHEETS.note (now tripNoteHTML alone, the trip's caption and the
  draft's), "In cabin with" rideLabel(owner), the Peoria line only on a
  PIA | ORD trip, "Still unconfirmed" removed, the fees, screening room and
  return kept; "At home with Kona" where a host has a pet at home.
  renderSheet keeps both folds' open state across a redraw (type 'pet').
- The living postcard: sceneSVG(kind, emoji, hostFaces, scene), postcard
  passing houseScene for 'home' (2 in the window and on the path on the
  card and header, 4 in P-house): hosts not Out and whoever is there today
  in the window, the booked travelers still to come on a path up the lawn
  (faces 18 apart from x 30 at y 85, Nebby beside Ashwin clear of the next
  face), Kona at the door (Nebby too once he is there), and a --sun glow
  round the window when everyone is (--win equals --lit in both themes, so
  no fill swap). What the scene adds stays inside x 22–138 (the path's
  round cap ends at 22.5; the card's crop is x 20–140). Every other kind
  ignores the scene; with no scene, or only the window's ≤2 faces, nothing
  on the path or at the door and not lit, the home is #157's picture byte
  for byte (test-app compares e06cd5e's sceneSVG verbatim).
- P-house (SHEET_NAME 'House'): tripHead's picture is a <button class="pc
  th" data-act="house" aria-label="House"> on a hosted trip not removed
  (72×44 by the global button reset; the 678px gate unchanged). The sheet:
  the trip's emoji, ⏳ days left (togo) before the trip starts (as the
  card's ⏳, paid or not; "1 day left" the day before), the large .pc.big
  picture (aspect 16/9) with the table strip of everyone's dishes (role
  img, named in words: "Home: Mom & Dad, Kona. On the way: Ashwin with
  Nebby. Not booked yet: Anjo."), then 🧺: my chip first (my face and my
  dishes, or 🍽), then everyone else who picked. My chip, and on the
  organizer's phone the chip of anyone who has picked (not on a v1 trip),
  opens the 18 dishes in place (44px tiles, data-pic, aria-pressed, long
  press their DISH_NAMES); a 4th pick pulses ✓; ✓, the chip again or the
  sheet closing (closeSheet's and sheetBack's loops) saves once through
  dishWrite (nothing when unchanged), ◷ then ⚠ ↻, 🧺✓ with ↩. Read only on a
  paid, removed or past trip.
- 🎊: cheer(id) from openTrip after render(), so only on a tap that opens
  the trip (its card, or wherever a tap opens a trip); never from
  render(), the poll, or the boot's router (a link or a reload that lands
  on the trip page). It runs right after that tap (later(…, 0)) and only
  while the trip page shows with no sheet over it (a card's 🚗 opens
  P-rides on top, which would hide the toast): allSet → burst() from the
  header's picture and the toast "🎊 All set", pialax_ui_v1.party[id] = 1
  (pruned to the list). rideAck now returns whether it toasted "📅 Rides
  changed"; then 🎊 waits (party unset) for the next open, as the toast has
  one place.
- LEGEND / ⓘ: petfly 🐈 Pet flying, pethome 🐕 Pet at home, petgo › Pet plan,
  carrier 👜, papers 📄, fees 💲 Pet fees, dish 🧺 Bringing, dishadd 🍽 Pick
  dishes (＋ keeps its one meaning, New trip), allset 🎊 All set. CLAUDE.md:
  "the pet travel and at-home reference folds" are data-free; pialax_ui_v1
  also keeps pet and party.
- BUILD and <meta name="pialax-build"> read 158.

Words (P town, 10/30, the probe through the app's own builders and the
browser gate): every trip page +0 (Anjo's and Mom & Dad's host-default
pages stay at their caps); Ashwin's P-person 9 → 10 ("Nebby", 2/5 free),
3 → 4 on other phones; Mom & Dad's 3 / 4 → 4 / 5 on their phone ("Kona"),
6 / 7 → 7 / 8 on the organizer's; P-rides +0; P-pet 6 on Ashwin's phone,
1 elsewhere; P-house 0; toasts "🎊 All set" 2, "🐈✓" and "🧺✓" 0; a bubble's
long press "Pet flying" / "Pet at home" 2. No label word added (LBL3_OK
stays 15).

Tap counts (test-words, real taps through the real Worker): Ashwin, Nebby
on 2 (his bar, ☐ 🐈 Nebby); a prep tick 3 (his face, ›, 👜 Carrier);
Mom & Dad's home prep 2 (their face, "🐈 ›": At home with Kona open);
House 1 (the header's picture); the potluck 4 (the picture, their 🧺,
Pie, ✓); the bubbles, Kona, the house filling up and 🎊: 0.

Tests: test-trip-model (491 checks, +13): familyKey (faced v2, v1 Me,
no name, the preset's own face alone, another face alone → none, renamed /
moved → none), petsOf (Out host → no Kona, Ashwin Out, a trip to LAX, New
York), 🐈 and 🧺 through the real Worker with the by-rules (own: no 📞; the
organizer's for a host-default: 📞 In), their refusals, petPatch / dishPatch
refusing all of them but the note's room (paid, removed, unanswered, Out,
no pet that flies, v1 'keep', after the trip, a bad leg, a 4th dish, off
the palette), the patch / request length split and the guards, a dish
write keeping 🚗 claims and a 🐈 write keeping 🛬 / 🛫, houseScene on 10/30,
11/20 and 12/1, allSet with its no-time case, each predicate on its own
(New York with no rides and one traveler unbooked, everyone Out: no 🎊 and
no glow; one of two there: not lit; 5 travelers: 4 on the path and 4 in
the window), the Nebby text, ICS SUMMARY and signature (🐈ad, 🐈a, none:
#157's byte for byte), #157 notes round-tripping. test-app (641 checks,
+21): the bubble on the board and P-person only (none on the key's,
P-rides', Family's, the person-note header's, P-day's or the Calendar
day's faces), the toggle's write and ↩, the row by stage and role (read
only on a paid or past trip, none before he answers, read only on a v1
trip on another member's organizer phone, whose forced tap reads nothing;
the organizer's 'keep' keeps his 📞, his own 'self' clears it), "⚠ Too
long" for 🐈 and 🧺 with nothing sent (the refused 🐈 leaves a phone his
#m= link greeted unconfirmed, and P-house keeps its ✓, not ⚠ ↻), P-pet's
ticks per phone (nothing fetched) and on a phone whose storage refuses
writes, pialax_ui_v1.pet and .party pruned to the trips in the list (only
P-pet's letters count, once each), the folds' copy per trip (no Peoria
line for New York), no fold in the Note sheet (caption and
draft), Kona's row under the unchanged host line (the PIA-157 regex)
opening P-pet at home, Kona at the header's door, the calendar's "+ Nebby
🐈" and the dot once she stays home, P-house's dishes (18 tiles, the 4th
refused, ✓ keeping the claims, a save on close, nothing when unchanged,
read only when paid or past, ⏳ on a paid trip and "1 day left", the
organizer changing Mom & Dad's picked Pie with their claim kept and ↩, no
House on a removed trip or one nobody hosts), 🎊 once a phone with its 14
confetti counted, behind "📅 Rides changed" and a sheet over the page,
never on the read and redraw that make an open trip all set, once a visit
without storage (every "nothing came" waits real time past later()'s
timer), every non-home scene and a plain home byte-identical to e06cd5e's,
the path's spacing, LEGEND (each new glyph one meaning), ⚙ #158; node
mutation probes of the critics' named mutants (the 🎊 guards, the
bubble's opt-in, the row's gates, the Too long holds (petWrite's or
dishWrite's first hold alone, and both of a function's holds), the patch
refusals, allSet's and the house's predicates and caps, familyKey's face
rule, the pet and party prunes, keptPet's letter filter and its
de-duplication) are all killed. test-words (178 checks, +4; 17m00s of its
30): the PIA-148 block now asserts P-note has no fold and P-pet's fold
copy is checked on Ashwin's phone, opened before a tick and still open
after its redraw; the
flows above inside the existing ptmom / prorg / paorg phones (no new
phone), a long press on each board bubble naming it, every new popup ≤20
and unmarked. test-viewport: a P town copy with 🐈ad and Mom & Dad In with
a note: both bubbles 16px and meeting no other mark, P-person's 18px, the
72×44 House button, P-house's picture and its 18 tiles inside the sheet,
Ashwin's Nebby row (two 44px targets) and P-pet (5 ticks, a tick on, the
travel plan open) measured at 360/390/430, light and dark; the list's
shelf is clicked by its selector (a stale handle once threw at 360 light
when a doc's arrival redrew the list). Preflight: GO on the final tree,
all 6 job-flow suites (cutover 215, migration 239, Calendar 104, words
178 in 17m00s, viewport 22 in 5m41s, map 119), with test-worker 91,
test-trust 70, test-trip-model 491, test-gflinks 100 and test-app 641
(shellcheck advisory, not installed here).

Decisions (the simpler, more obvious option where the spec left a choice):
- The addendum's corrections are followed where they differ from the spec:
  the bubble opt-in, 16px on the board, none on the Family board; Kona on
  her own row; 👜 for Carrier; the "+🐈" signature change only on the legs
  she flies; 🎊 in openTrip only and behind rideAck's toast; allSet's
  no-time rule; houseScene's 4 in the model, 2 drawn on the card and header.
- 🎊 only on a tap that opens the trip (the addendum's openTrip hook, the
  safer choice on live main): a link or a reload that lands on the trip
  page does not cheer, so a phone that arrives by its link cheers on its
  first tap of the trip's card.
- An Out member brings nothing (dishPatch refuses), and a traveler who has
  not answered answers first (no chip for them to pick). The organizer
  changes the dishes of someone who has picked; starting a first dish for
  someone else is not offered (no chip for them).
- 🍽 marks an empty 🧺 chip ("Pick dishes"): ＋ already means New trip.
- ⏳ shows in P-house on a paid trip too, as the card's ⏳ does.
- familyKey counts a label that is only a face only when it is the
  preset's own face (rideName's rule for a nameless member), so a stranger
  at LAX or PIA with a face and no name has no pet.
- The read-only "🐈 Nebby" on other phones ends in › too (P-pet with the
  folds alone). On Ashwin's own phone the › is there while Nebby stays
  home as well (the folds help decide); the ticks and 2/5 show only while
  she comes.
- The toggle writes both ways or none; a note's 🐈a or 🐈d (another
  phone's, or a later one-way UI) reads on and a tap turns it off.
- P-pet's ticks use the booking toggles' ☐ / ☑ (tkBox), as P-rides'
  Drive does; P-pet and P-house have no ⓘ of their own (their glyphs are
  in LEGEND, the trip page's ⓘ lists the bubbles).
- The house's art below y 74 is cut by P-drop's wide crop (decorative).
- A dish save made on the way to another chip, or as the sheet closes,
  reports a failure as P-error with ↻ (the sheet's own ⚠ ↻ is for ✓).

Known (recorded, not built): a stale #157 tab shows nothing of the pets
but keeps 🐈 and 🧺 byte for byte (its grammar already reads them), and a
#≤156 tab shows them as note text (PIA-157's known limit); Kona and Nebby
depend on familyKey, so a renamed member or a moved home airport loses the
pet silently; every 🐈 or 🧺 write is an answer write (the organizer's
new-answer dot); trips already all set (every traveler booked and no ride
open, New York trips with no rides, one-traveler trips and paid trips not
over among them) cheer once on each phone's first tap-open after #158; the
tap that completes a trip (the last 🚗 Drive or time) does not cheer
itself, nor does a link or a reload: 🎊 comes on the next tap that opens
the trip; a hand-made note holding the same marker kind twice (two 🐈 or
two 🧺 tokens) cannot have it changed (respondRequest refuses the rebuild,
nothing is sent) and the phone says "⚠ Too long", as #157's 🚗 / 🚌 / 🚙
toggles do on such a note; the app never writes one; with a pet on the
trip the trip page's ⓘ lists 🐕 / 🐈 too and can run to a second page
(◀ 1/2 ▶); one-way Nebby and
the rest of the spec's LATER list are not built.

Owed (needs a person or a real device):
- ⚙ #158 on Mom's and Dad's phones.
- The 16px bubble readable on an iPhone, light and dark, and not touching
  ×2 or 📝 on Mom & Dad's face (the tight case: the boxes clear in
  Chromium; its 1.5px halo comes within a hair of both rings, and Apple
  Color Emoji may draw 📝 taller).
- Mom finds P-house from the header's picture (no cue on it but its name
  on a long press).
- Re-adding a rides .ics that now says "+ Nebby" (does it replace the
  events by UID or duplicate them; already owed for #157).
- The owner confirms Kona on every trip Mom & Dad host.

Closes PIA-158.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
