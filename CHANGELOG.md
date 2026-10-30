# Changelog

All notable changes to PIALAX. Versions follow [Semantic Versioning](https://semver.org/)
and are git tags (`vMAJOR.MINOR.PATCH`) on `main`; GitHub Pages serves whatever is on `main`.

- **MAJOR** — breaking change to shared state: share-link/URL params, localStorage keys, Worker API.
- **MINOR** — new user-visible feature (one or more `feat` tickets).
- **PATCH** — fixes only (`fix` tickets, tooling, docs).

Add entries under **Unreleased** in the same commit as the ticket; on release, rename the
heading to the version + date and tag the merge commit (see `CLAUDE.md` → Versioning).

## [Unreleased]

### Added (PIA-158) — Nebby per trip, Kona at home, the house fills up, who brings what, 🎊 once
- Nebby per trip: Ashwin's flight section (P-person, once he has answered) has "☐ 🐈 Nebby" / "☑ 🐈 Nebby" (aria-pressed, "Nebby comes"): both ways or not at all, written as 🐈ad in his own answer (the PIA-157 grammar; his phone, or the organizer's for him, which adds no 📞), one complete answer from a fresh read through the one write path (`petRequest` → `respondRequest` → freshWrite), 🐈✓ with ↩; a note with no room says "⚠ Too long" and sends nothing. Other phones read "🐈 Nebby ›". The pets come from the family preset (`PETS`, by `familyKey`: the preset person by home airport and name, whatever the face), so only her legs are ever written.
- P-pet (› from his row): on his own phone a checklist kept on that phone alone (pialax_ui_v1.pet: 🛬 Reserved and 🛫 Reserved for the legs she flies, 👜 Carrier, 📄 Papers, 💲 Fees; his row shows how many are done, 2/5), then the reference folds, outside the word budget: her travel plan (moved here from every trip's Note sheet, which is now the caption alone; "In cabin with Ashwin", the Peoria line only on a PIA | ORD trip, the stale "Still unconfirmed" line gone) and, where Mom & Dad host, "At home with Kona". Every other phone: the folds only.
- Kona at home: Mom & Dad's sheet has "🐕 Kona" on its own row under their 🏠 line (unchanged), and while Nebby comes "🐈 11/20–11/30 ›" (Ashwin's days), which opens P-pet with "At home with Kona" open. Kona is derived, never written, never in heads.
- A small bubble beside a face, only where it is asked for (the trip board's 44px faces, 16px between ×2 and 📝; P-person's 72px face, 18px): 🐈 on a traveler whose pet flies, 🐕 on a host with a pet at home; a long press names it in place ("Pet flying", "Pet at home"). None on 28px faces (P-rides puts 🐈 beside Ashwin's face on the legs she flies), the Family board, P-day or the other sheets. Wherever a member's face is named for a screen reader (`personAria`: the board, P-person, the key, Family cells, the Map and P-total), the name adds "with Nebby" / "Kona at home", bubble or not.
- "+ Nebby 🐈" in the ride words (Ask, Remind, Tell) and the driver's calendar events on the legs she flies; each such leg's time ends its 📅 signature in "+🐈", so a driver's 📅 Phone, card and Trips numeral get their dot; a run without her keeps #157's words and signature byte for byte.
- The living postcard: a home trip's picture is drawn from the model's `houseScene`, by day: the hosts not Out and whoever is there today in the window, the booked travelers still to come on the path (Nebby beside Ashwin; someone not booked yet is not drawn, so booking is what fills the house), Kona at the door (and Nebby once Ashwin is there), a warm glow once everyone is. Every other scene, and a home with nothing new, is #157's picture byte for byte.
- P-house: on a hosted trip that is not removed, the trip header's picture is a 72×44 button, "House" (1 tap): the large picture with a table strip of everyone's dishes, ⏳ the days left before the trip starts (as the card's ⏳, paid or not; "1 day left" the day before), and 🧺 who brings what. My chip (my face and my dishes, or 🍽), and on the organizer's phone the chip of anyone who has picked, opens the 18 dishes in place, up to 3 (a 4th pulses ✓ instead), saved once on ✓ or as the sheet closes (nothing when unchanged): one complete answer (`dishRequest`; the driver's 🚗 claims and every other marker token kept; a host on their default answers In, with 📞 when the organizer writes it), ◷ then ⚠ ↻ on a failure, 🧺✓ with ↩. Read only on a paid, removed or past trip. No words.
- 🎊 All set, once a phone: the first time a tap opens the trip page on this phone (its card, or wherever a tap opens a trip) with every traveler booked and every ride covered (`allSet`: no open run ahead, and no booked leg ahead without its time), a burst from the header's picture (none with reduced motion) and the toast "🎊 All set" (pialax_ui_v1.party; without storage, once a visit). Never on a card, a redraw or the poll, nor on a link or a reload that lands on the trip page; it comes right after the tap that opened the trip, and when that tap brings a sheet over the page (a card's 🚗 opens P-rides) or opening the trip says "📅 Rides changed", it waits for a later open. A trip that is already all set cheers once on its first such open after this build.
- ⓘ adds 🐈 Pet flying, 🐕 Pet at home, › Pet plan, 👜 Carrier, 📄 Papers, 💲 Pet fees, 🧺 Bringing, 🍽 Pick dishes (＋ keeps its one meaning, New trip), 🎊 All set. No word added to any trip page (Anjo's and Mom & Dad's host-default pages stay at their caps); P-person +1 ("Nebby" / "Kona"), P-pet 6 on Ashwin's phone (1 elsewhere), P-house 0. No Worker change and no Worker deploy; no storage or link format change (pialax_ui_v1 gains `pet` and `party`). ⚙ #158. Tests: the model (familyKey with its face-alone rule, petsOf, 🐈 / 🧺 writes through the real Worker with their refusals, petPatch / dishPatch refusing all of them but the note's room, the 280 split and guards, a dish write keeping 🚗 claims and a 🐈 write keeping 🛬 / 🛫, houseScene on 10/30, 11/20 and 12/1, allSet with its no-time case, each of allSet's and the house's rules and caps on its own, "+ Nebby 🐈" in the words, the calendar and the signature, #157 notes round-tripping), test-app (the bubble only on the board and P-person, none on P-day's or the Calendar day's 48px faces, the toggle and ↩, the Nebby row by stage and role, "⚠ Too long" for 🐈 and 🧺 with nothing sent (a phone a #m= link greeted stays unconfirmed, P-house keeps its ✓), P-pet's ticks per phone, one-way and without storage, pialax_ui_v1.pet and .party pruned to the list, the folds' copy (a v1 "Me" named Ashwin), no fold in the Note sheet, Kona's row under the unchanged host line, the calendar's Nebby and the dot, P-house's dishes saved on ✓ and on close, read only when paid or past, the organizer changing a picked dish and ↩, ⏳ and "1 day left", 2 on the card's path and 3 in P-house's, 🎊 once a phone with its burst counted, behind "📅 Rides changed" and a sheet, never on the read and redraw that make an open trip all set, every non-home scene byte-identical, LEGEND with each new glyph one meaning, ⚙ #158), test-words (Mom & Dad's card and 📅 dots, a long press on each bubble naming it, Kona → P-pet in 2 taps, the potluck in 4, Nebby on in 2, a prep tick in 3 with the travel plan staying open, Remind with Nebby, 🎊 once; P-person, P-pet and P-house ≤20 unmarked), test-viewport (the bubbles never meeting ×2, 📝, the badge or the status mark, the 72×44 header button, P-house and its dishes, Ashwin's Nebby row and P-pet at 360/390/430, light and dark).

### Added (PIA-157) — Rides: who drives each run, when to leave home, in the key, P-rides and the phone calendar
- A trip to a home the family drives from has rides: a host who is not Out lives at a drive-pivot airport (Peoria, PIA) and the destination is PIA or ORD. Its runs follow the Map's ⏱ rule (`runChain`) on booked times only (never a ≈ cached time, so on the organizer's token phone a ≈ chip can still join a Map bracket that no run holds): the legs of one kind at one airport on one day, chained at most 2 hours apart. A traveler's own 🚌 (the coach, never at home's own airport) or 🚙 (a rental car) leg is in no run. Each run says when to leave home (⏰): a pickup leaves home its drive before the first landing, a drop-off its drive plus 2 hours before the earliest flight; the drive is 0:20 to PIA and 2:30 to ORD. Departures now get their ⏱ bracket too, and a departure that falls between two arrivals no longer splits their run (both on the Map's pickups table and in the runs); the model's one rule is `runChain`.
- Who drives is claimed in the driver's own answer note ("🚗ashwin-p8.aORD1120": the traveler, the end, the airport and the day, never the time), so a time change that day keeps the ride and moves its ⏰, while a day or airport change leaves it "moved" (⚠, open again) until the driver, or the organizer, says ✓. Who can drive a run: the hosts not Out, then the travelers who are there all that day. A claim by someone who said Out or who can no longer drive that run (a traveler whose own days moved off that day), on their own leg, or on a leg nobody flies is ignored (the leg is open again); a claim that does not count is dropped by its claimer's next ride write. No flight number or confirmation code is stored, and nothing tracks a flight.
- The trip page: after ⏳ Waiting, the key's 🚗 Rides row (its word, a new marked label word, while the screen has one left and the primary is not "🚗 Rides") holds a dashed chip for each open run still ahead (🛬 or 🛫, the day, the travelers' faces; ⚠ when a ride moved), "🛬? 💪" for a booked leg with no time yet (that traveler's sheet at the time), then +N, and the organizer's Ask at its end (one candidate → "Ask Mom & Dad", their own link; several → the trip's guest link); once every run is covered it shows the drivers' faces and the travelers' own 🚌 / 🚙. After Book, Landing time, Track, Share and Lock dates, which keep their precedence, the primary is "🚗 Rides" while a run ahead has no driver (the organizer's phone, and a host's who can drive one; never a traveler's), and once I drive, my next drive: "🚗 11/20 ⏰12:05" and the faces of the travelers I drive on it ("Leave home 12:05 Friday for Ashwin"; a traveler who joined that run later with no driver yet is not among them). The card's slot says the same (🚗?, 🚗11/20, from the day before 🚗⏰12:05), in a host's 🏠 place only then.
- P-rides (the key's row, the primary, the card, a leg's ride glyph or the Map): one section per airport with runs, the destination first; each run with its end, day, ⏰ (a long press says the arithmetic: "Leave home 12:05: 2:30 drive, at ORD as Ashwin lands") and ⏱ how far apart its legs are, then a line per leg (the face, the time, who drives: the driver's face, a dashed 🚗? or ⚠ with the claimer's dimmed face). A candidate's own phone has "☐ 🚗 Drive" on each run they can drive (the word while the sheet keeps ≤20 words; ☑ once nothing on the run is left for them to take and they drive a leg of it, so a tap takes their share back); the organizer's has each candidate's face as a toggle by the same rule, ✓ for a moved ride and Remind for a run one driver has; a traveler's own 🚌 / 🚙 sit on their leg (the organizer's for anyone). Below: the legs travelers cover themselves (a tap goes back to a family ride), legs with no time yet, who still has to book, and for a driver "📅 Phone".
- Every ride write is one complete answer from a fresh read through the one write path (freshWrite → respondRequest, built by the model's new ridesRequest / groundRequest): "🚗 Drive" claims every leg of the run nobody covers yet; with nothing left to take it takes back the legs this driver has (a run shared with another driver too); 🚗✓ / 🚌✓ / 🚙✓ in the toast with ↩ (none after a claim that added to legs the driver already had, where taking the whole run back would not undo it). Every leg already someone else's holds the tap ("🚗 Already covered", nothing sent); a record that already is what the tap asks (Mom's phone and Dad's are one member, so one may claim what the other just did) says 🚗✓ / 🚌✓ / 🚙✓ and sends nothing; a run that changed meanwhile says 🚗⚠; a paid or removed trip 🏁. The organizer's claim for a host who has not answered makes their answer In, marked 📞. A claim, 🚌 or 🚙 that would take a note past 280 characters is refused, never clipped, and the tap says "⚠ Too long".
- 📅 Phone: the driver's runs still ahead as one calendar file, an event from leaving home to being back (a pickup until the last landing plus the drive, a drop-off until twice the drive after leaving), in floating local time, with alarms a day and 30 minutes before, the trip's guest link as its only description, and a UID from the trip, the driver and the run. 📅 Phone carries a dot until this phone has added the rides as they are now; it keeps what it added (pialax_ui_v1.rides), read less the runs already behind us (a run that passes is no change), and once the rides ahead differ from that, the dot shows again there, on the card (after n/N) and in the Trips tab's numeral. That includes a phone that no longer drives any of them (its ride taken back or moved, the traveler unbooked or Out) while its calendar still holds them: the card's dot and the numeral show, and opening the trip says "📅 Rides changed" once and forgets what it added. A phone that never added its rides gets no dot.
- Telling people, in words beside the link (never a key, token or price): Ask ("🚗 Can you drive? Fri 11/20: pick up Ashwin at ORD Chicago, lands 2:35 PM (leave home 12:05 PM)."), Remind ("🚗 Reminder: …") and, when a traveler saves a 🛬 / 🛫 on a leg someone else drives, the time toast's share symbol ("Tell Mom & Dad" on the organizer's phone, their own link; "Tell" elsewhere, the trip's guest link: "🚗 Ride update: …"). The share sheet gets the text and the link; the clipboard both.
- Elsewhere: a booked leg in a traveler's sheet carries its ride after its time (a 44px button into P-rides: the driver's face, 🚗?, ⚠, 🚌 or 🚙, named by its leg and day, "Landing 11/20 ride: …") and a host's line says how many rides they drive (🏠 ORD 🚗2); on a rides trip every booked chip with its time (or its own 🚌 / 🚙) on the Map's pickups table wears an 18px corner badge (the driver's face, 🚌, 🚙, a dashed ?, ⚠) said in its name, and P-day's map mode has a 🚗 per run. The trip page's 💵 Paid waits while a run ahead has no driver; ⋯ More's 💵 confirm names the open rides (paidCheck's new norides). ⓘ adds 🚗? No driver yet, ⏰ Leave home, 🚌 Bus, 🚙 Rental car, ⚠ Ride changed, Ask, 🛫? No leaving time and the dot "Rides changed"; ⏱ reads "One ride" and its time "Time apart".
- The answer note's markers: after 📞 / 🛬 / 🛫, in a fixed order, 🚗 claims, 🚌 legs, 🚙 legs, then 🐈 and 🧺 (the grammar reads and writes them now, so a later ticket needs no format change; no screen shows them yet), then the typed text. Each new kind is read once; the first unknown or malformed token starts the text, so an older build keeps the markers as text byte for byte. The word rule's allowlist adds Rides (the trip page's key row and primary only, enforced by `test-words`).
- The words beside a ride (Ask, Remind, Tell, the calendar's events) and the ride controls' spoken names call a nameless v1 "Me" by the family preset's name for that airport and face ("Ashwin"), as ⤒ Update trip does, never "Person" or a bare face.
- No Worker change and no Worker deploy; no storage or link format change (pialax_ui_v1 gains a `rides` field). ⚙ #157. Tests: the model (the note grammar and its round trips and refusals, the old pickups kept verbatim to show the interleaved fix and the departure brackets, runs, ⏰, claims, moved / ✓, two drivers, 🚌 / 🚙, primaryAction, paidCheck, the texts and the calendar file, all through the real Worker; `icsText` byte-identical; a share of a run released, a joined traveler, the "same" and "taken" guards, too long told apart, a claim from someone no longer there, the 📅 signature less the runs behind us), test-app (the key, primary, card, P-rides, claims and ↩, 📅 Phone, the time toast's Tell, P-person, the organizer's 📞 claim, 🚌 / 🚙, paid, Map badges and brackets, LEGEND; Mom's and Dad's phones claiming one run, ⚠ Too long with nothing sent, a shared run's ☑, the joined traveler's primary, the dot once nothing is driven and its one "📅 Rides changed", the several-candidate Ask), test-words (Mom & Dad claiming from the list and from their link, the organizer's Ask / ✓ / cover / Remind, Anjo's 🚌, the organizer's 🚙, the 8-member P-rides, every state ≤10 + 5 and P-rides ≤20 unmarked; Rides allowed only in the key's row and the primary), test-viewport (P town's key with its Rides row and P-rides on the organizer's phone, and the 8-person P-rides on a host's, at 360/390/430, light and dark; at 678px tall ⏳ Waiting with its Remind whole above "🚗 Rides"), test-map-browser (the real map: brackets on both columns, the badges, P-day's 🚗, a claim through the real Worker redrawing the badges).

### Changed (PIA-156) — Who's set: a quiet key under the board; ✈ means booked; two more label words
- The trip page answers "who is still to book, who has booked, who is hosting" in words, under the board: a quiet key of at most three 44px rows under a hairline, each a glyph and one word in the board's name column, in secondary ink, then that group's faces (28px faces, 44px-high targets at a 36px pitch, only their outer padding overlapping; as many as the row holds, at most 6, then +N). Before the dates are 🔒 and while nobody has booked: "⏳ Waiting" (who has not answered; never a host) and "🏠 Hosting" (the hosts, an unconfirmed host too). Once the dates are 🔒 or anyone has booked: "⏳ Waiting" (every traveler not booked yet: In, Maybe or not answered, me too), "✈ Booked" and "🏠 Hosting"; everyone travelling booked leaves ✈ Booked (+ 🏠 Hosting), the all-set state. Someone Out is in no row; a paid, removed or past trip has no key. It reads the model's new whoSet / waitsOn (the shared record, as every screen), so the key is also the board's legend.
- The key only takes the space the page left: it comes after the rows already under the board (the price row, 💵 Paid, the organizer's 🔑🔍) and above the primary, and ⏳ Waiting is its first row. On a 678px-tall phone (the owner's iPhone with Safari's bars) with a sticky primary, those rows keep their first-screen place, and on a family trip's three-row board with nothing else under it the Waiting row and its Remind show whole above the primary; with the organizer's price row before 🔒 the key is a short scroll down.
- A face in the key opens that person's sheet (the board's own 'person' act). On the organizer's phone the Waiting row ends in the share symbol, Remind: one person waiting besides him → their own link, named "Remind Anjo" (the existing nudge act; handoffs' new `remind` is the same personal guest link for a traveler not booked yet, whom P-person's nudge rule did not offer), so reminding the one unbooked traveler is 1 tap; several → the trip's guest share (tshare), except while the primary already is that Share. Guests get no Remind. No link carries a key or token.
- Each row is a group named in a full sentence ("Booked: Ashwin", "Not booked yet: Anjo", "No answer yet: Anjo", "Hosting: Mom & Dad"); a long press on its word says what it means; ⓘ lists ✈ Booked, ⏳ No answer yet (before 🔒 while nobody has booked) or ⏳ Not booked yet (once 🔒 or anyone has booked), 🏠 Host and Remind.
- ✈ means booked, one glyph one meaning: the booked face badge (the trip board, Family cells, sheets) is ✈ where 🎫 was (iPhone drew 🎫 as a "live concert ticket"), and every other visible 🎫 (the ⚠✈ confirms, ✈↩ on Out, the toasts ✈ / ✈⚠ / ✈↩?, P-cheapest and P-mine marks, LEGEND and ⓘ) is ✈. ✈ otherwise only leads the arrowed hand-offs (✈ Book ↗, ✈ Track ↗, ✈↗, ✈⏱↗), so the fare and link glyphs that used it moved: a round-trip fare is ↔ (its glyph and its "same fare" mark in a traveler's day prices), a flight with no link ↗⚠ ("No flight link"), and dates that cannot be flown or priced 🗓⚠ ("Fix dates": the primary, the card slot, P-cheapest's blocked weeks). The booking toggles read as checkboxes with the same words both ways (aria-pressed): "☐ I booked" beside ✈ Book ↗ and in my sheet ("☑ I booked" once booked, two taps to undo), the organizer's "☐ Booked" / "☑ Booked" for someone, ☑ in text presentation (U+FE0E) to match ☐; the same writes and confirms as before.
- The owner's "a word or 2": a screen keeps ≤10 ordinary words and now ≤5 marked label words (was 3); the allowlist adds Booked, Waiting and Hosting (the key's rows only, which `test-words` now enforces). Popups keep 20 and mark none. Where "Hosting?", a two-word primary and three key rows would make 6, the key's third row keeps its glyph and faces and drops its word.
- No Worker, storage or link format change; no write path added. ⚙ #156. Tests: the model (whoSet / waitsOn / remind through records the real Worker wrote, every stage and role), test-app (the key per stage and role: hosts, Out, Maybe, me, an unconfirmed host, the v1 Thanksgiving, the 8-member trip's +N; its place after the price row and 🔑🔍; nudge for one vs tshare for several; none for a guest; none on a paid, removed or past trip whose page drew; ✈ badges; ✈ the glyph of one ⓘ entry only; the checkbox toggles' writes; no 🎫 left), test-words (every trip page ≤10 + 5, the cap's self-test: a 6th marked word fails, 5 passes, a marked Waiting outside the key fails; the Remind tap count), test-viewport (the key at 360/390/430, light and dark, with the 8-member trip, each face taking its own tap; at 678px tall the price row and the first key row with Remind whole above the primary). The job-flow gate gives each browser suite 30 minutes (was 20; test-words runs about 17).

### Changed (PIA-155) — Remove an old trip without updating it; a More sheet that says what it does; a price row that says whose fare
- A trip not updated from v1 yet can be removed for everyone as it is: ⋯ More › "🗑 Remove for everyone" › "🗑 Remove" (3 taps, from its card or its trip page), one decision-only update that leaves its v1 idea byte-identical (the Worker takes a decision alone on any record). ↩ in the toast, or on the removed card on the 🗄 Archive shelf, puts it back as it stood: paid again with its amount, or chosen again with the record's own stored choice (its place, days and estimate; only the time it was chosen is new), else open. Other phones see it on their shelf like any removed trip; when another organizer phone removed or restored it first, the tap settles with nothing sent (no ⚠ ↻ that never clears). 🗑 waits ("⤒ Update trip first") only while a ⤒ update of that trip is half done on this phone, or on a v1 record with no decision object; a removed trip's card and trip page offer ↩, not ⤒.
- ⋯ More says what each row does: the stage is one quiet line (five dots and the stage it is at, "Stage 2 of 5, Asking" on a long press), not five rows that read like choices; "🗄 Hide on my phone" ("Show on my phone" once hidden; 2 taps, nothing sent; not on a trip the shelf holds anyway, removed or over) and the organizer's "🗑 Remove for everyone"; P-drop (named "Remove trip") reads "🗑 Remove" beside Keep, P-edit's tile "Remove", a removed trip "Removed" (its dots dimmed, the word at full ink). Pin, Share, Calendar, Note and Edit are unchanged; the list's shelf row stays "🗄 Archive n".
- The price row says whose fare instead of a bare count: "🔍 Price 🗽" (the faces of the travelers whose flight is not searched yet, up to 3 then +N), "$1,234 🔍🗽" once some are cached, named on a long press and to a screen reader ("Price Anjo’s flight"; my own unnamed v1 "Me" is "my"). The searches and their cost still show on P-total's 🔍N before anything is spent, and every 🔍N says what its number is on a long press ("Search 1 fare"). It shows before the dates are 🔒, once a fare is cached, or once paid; after 🔒 with nothing cached there is no row and no card 🔍N (each unbooked traveler's sheet keeps its 🔍: 2 taps, their face and 🔍; ✈ Book ↗ shows Google's live price).
- My own booked bar no longer shows the muted 🛬? while my primary already is "🛬 Landing time"; other booked travelers keep it on the organizer's phone.
- No Worker, storage or link format change; every write is the existing organizerWrite → organizerEdit → updateRequest path (restoreDelta moved into the model, unchanged for v2 trips). ⚙ #155. Tests: the model (a v1 drop and its ↩ through the real Worker with the idea JSON compared byte for byte and the decision field for field, a v1 choice unlike its recommendation, a paid and an open v1 trip, every other v1 edit still refused, a record with no decision object), test-app (the card and trip-page removals, Mom's shelf, both ↩, two organizer phones racing, the half-done update, More in every state, the price-row rule before and after 🔒 and with a cached fare, my bar's 🛬?), test-words (the tap counts with real taps, More in every state ≤20 words and unmarked), test-viewport (the stage line and P-drop at 360/390/430, light and dark; the faces row whole), test-migration-browser (its stage read from the new line).

### Changed (PIA-154) — Declutter: every symbol means one thing; three label words only where they matter; 🔒 Lock dates
- The word rule gains three marked label words a screen (`data-lbl3`), from one list: Coming?, Hosting?, Lock dates, I booked, Landing time, Track, Lands, Leaves, and Tue / Wed / Thu in Calendar's header; a popup still keeps 20 and marks nothing. The app's own fitter counts ordinary words only, and test-words counts the two apart (11 ordinary, 4 marked, a word off the list or a mark in a sheet fail).
- One next step per trip, for every role, from the model's new primaryAction (with travelWindow and lockable): the organizer's Share while anyone waits, then "🔒 Lock dates" (one tap; ↩ in its toast unlocks; the same write as P-dates' lock, now lockDates); "✈ Book ↗ | 🎫 I booked" once the dates are locked; "🛬 Landing time" once booked; "✈ Track ↗" in the travel window; else nothing. The card's slot follows the same rule (never ✈↗ before 🔒, never 🔒 as a call to act).
- One glyph, one meaning: one share symbol (an inline SVG, a dot on it while it asks for attention, resting for the visit once he has shared that plan) replaces 📣 everywhere; 🎫 only means booked (a face badge and the labelled toggles; the history importer's stages are words); 🔒 only on the date pill, P-dates and Lock dates; ☀ / 🌃 only while a time is typed (saved times are plain HH:MM); 📌 only where the event day is set (P-dates, the create and edit steps), never on a pill; ⏳ a plain number (no book-by arc; a long press says "Days left"); stage pips and the postcard locator retired; 👋 only on P-face's entry; 🛬 / 🛫 always beside a word (P-person, the Map's columns and P-mapairport).
- No placeholders: no $— chips, no 0 calendar days or dots, no ––:–– box (the organizer's board shows a muted 🛬? for a booked traveler with no landing time); "🔍 Price N" or 🔍N stands where a fare can be searched.
- The trip page: a compact header (a small postcard, the title, 📝 only with a caption, 📍 under it), the date pill with my answer as a chip ("✓ In ⌄", one tap opens In / Maybe / Out in place), "Coming?" / "Hosting?" over the answer row while it is awaited, the board with every name (mine tinted, dropped first when short of words) and no tail column, one price row, and ⋯ More (P-stage: ☆ Pin, 🗄 Archive, Share, 📅 Calendar, 📝 Note, ✎ Edit, 🗑 Drop, 💵) where ✎, 📅＋ and the trip page's ±1 were. P-dates keeps −7 −1 +1 +7 and makes 🔒 Lock dates its main button once nothing is left to save; holidays only before a plan; no 👥 (Calendar › a day is P-day).
- P-person: "🛬 Arrive" / "🛫 Leave" rows, PIA | ORD only while unbooked, the organizer's "🎫 Booked" for someone (where the board's 🎫 column was), Share first for someone waiting, "📝 Note"; ±1 day fares only for an end already priced. Cards: one dot after n/N where the card needs this phone's look (my answer awaited, on any phone; new answers, on the organizer's own cards), ⋯ More where the stage disc was, one ⚠ naming its cause on a long press; 🧭↗ Explore stays on the organizer's card of an idea with no place (guests and the trip page no longer show it). Family: every row named, mine tinted in my colour. Map: the selected trip's title opens it; a pickups table (🛬 Lands | 🛫 Leaves, one row per airport), the faces off the map under a hairline. Calendar: all seven weekdays, plain cells (no lone ⟦ ⟧ bracket; my days underlined only where they leave the plan; a day speaks its count only where its numeral shows). P-day's ＋ only on an organizing phone; ⚙ on a phone that organizes nothing shows the build and one 🔑.
- A phone that is nobody on a paid or dropped trip still shows 👋 ? beside 🏁 / 🗑 (P-face is how it says who it is, and so reaches its Track). P-dates: a saved plan that cannot be locked yet (no destination, already begun) shows 🔒 Lock dates greyed, saying why; my days that follow the plan show no follow chip and no shift row until a day is picked. 💵 Paid opens the amount alone; ⋯ More's header is the trip's title (its picture once). "Mom & Dad" shrinks to fit the board's name column before it is ever cut.
- No Worker, storage or link format change; every write uses the existing paths (respondRequest, bookedRequests, freshWrite, organizerWrite); a ±1 kept by an earlier build is still sent on the next load. The paths the removed controls left (👥's lookMode, the [🛬|↔|🛫] segment's dend, the me row's facePulse, the per-face dot, the hero / pip / locator / board-tail styles) are deleted. ⚙ #154. Tests: the model's new rule, every glyph key in LEGEND, the marked-word counter and its list (and the gate driven end to end on pages over the limits; Tue / Wed / Thu marked on Calendar only), every B1 state and the section C tap counts with real clicks (the phone calendar's file and the flights link tapped too), the header, date row and pickups table at 360/390/430 in light and dark.

### Changed (PIA-153) — Housekeeping in two taps, the plan vs my days at a glance, old trips first-class
- Each card's stage disc is now a named 44px button (a thin ring, like ⤒ beside it) that opens P-stage straight from the list, its header naming the trip: ☆/⭐ and 🗄 as before (🗄 from a card closes the sheet with 🗄 ✓, so a second tap never quietly undoes it), and for the organizer 🗑 Drop (the existing P-drop confirm, with its undo; a dropped trip offers ↩). On a trip not updated from v1 yet 🗑 is greyed and says "⤒ Update trip first". The shelf restores as before.
- The organizer's v1 card carries ⤒ (one tap opens the trip with P-migrate on top); it pulses with the trip view's ⤒, one pulse on screen at a time (📣 and ⓘ wait).
- P-migrate shows the trip's name and picture with P-edit's own controls, sent in the update's one write (what was typed comes back if the sheet is closed and opened again, and through a re-review of a record that changed meanwhile); Current / Travelers show which is picked (filled with ✓ vs outlined, aria-pressed); after the update the sheet says ✓ (🔒 ✓ when the dates are set) and closes back to the trip.
- The trip's date pill carries 👪 (the group plan) and my own days carry my face; when they differ, ⚠ on my line opens P-mine: both ranges with 👪 and my face, 🗓 Follow plan (the existing follow-plan write, with ↩ in its toast; never for a booked traveler), Keep mine (quiets ⚠ on my line and my card's ⚠🗓 on this phone, only while the plan and my days stay as they were) and, for the organizer, 👪 Make plan (the plan-move path, asking first when someone has booked, with undo; on a trip not updated from v1 yet it is greyed and says "⤒ Update trip first"). ⓘ explains 👪, the face line and ⚠.
- A v1 trip's traveler with their own face gets the v2 flight section (✈ Book ↗, 🎫, then the times) through the same write path; the organizer's 🎫 and days for others, the answer row, Make plan and P-dates' trip half say "⤒ Update trip first" and point to it; P-person on a v1 trip carries ⤒ for the organizer.
- Smaller fixes: 📜 for the history import (it shared ⤒'s glyph; V2_ACCEPTANCE.md too), a pending join shows 🙋＋⏳ "Asked to join", "Mom & Dad" keeps its spacing on the board and in sheets (drawn "Mom&Dad" only where names must fit or it would be cut, and on one-word chips), ⤒ tapped in a trip spends the cards' pulse too, a greyed toggle looks greyed, 🗑 reads in the danger colour.
- No Worker, storage or link format change (Keep mine sits in the per-phone pialax_ui_v1). ⚙ #153. Tests: the model (v1 🎫 and times through the real Worker, the rename in one update, mineVsPlan's cases, Follow / Make plan through the real Worker), test-app (every new control, the drop and its undo, the greyed paths, P-mine's states, Follow plan's ↩, Keep mine coming back when the days or the plan move, a 🎫 landing after P-mine was drawn, the review keeping its typed name, one pulse at a time per screen; each guard mutation-checked), the migration and word suites in Chromium (the update renamed, closed with 🔒 ✓, the card's ⤒, Anjo's own flight section, Make plan's why), and test-viewport (each new state at 360/390/430, light and dark).

### Changed (PIA-152) — A smooth first look: old trips show the family's faces, ⤒ Update trip invites its tap, ⚙ shows the build
- A trip not updated from v1 yet now shows the family's own faces wherever it appears (cards, the trip page and its board, every sheet, Family, Map, Calendar): 🌽 Mom & Dad, 💪 Ashwin (v1's "Me" at LAX), 🗽 Anjo (at JAX, LGA or JFK). It recognises exactly the people ⤒ Update trip would (their home airport, and a matching name, v1's "Me" or no name; a v1 "Me" there that already has a face takes the family's, as the update always wrote). Anyone else keeps the face they showed before (a friend Sam added to the Thanksgiving stays 🐢), except a friend whose face was one the family now shows (🌽 or 🗽): they get the next free face. Faces stay unique within a trip and a face a label already has is never taken (if a friend's own face is 🌽, Mom & Dad keep the face they showed before), and v1's "Me" still has no name to pick. This is read from the trip as it is: nothing is written, and after ⤒ Update trip every face stays exactly as it was (the update writes the faces already shown, a friend's too, so it no longer gives a friend a face the family has).
- On a v1 trip the organizer's ⤒ Update trip pulses once a visit (as 📣 does) until the trip is updated (drawn again mid-pulse, it carries on rather than starting over); it is still labelled "Update trip". A greyed answer row for someone else now says "⤒ Update trip first" on a tap and points to it: ⤒ pulses again once that sheet is closed. No word is added to any screen.
- ⚙ shows the build as a number beside its glyph (#152, no word), on every phone (ⓘ → ⚙), from one constant in app.html that `<meta name="pialax-build">` repeats. Compare it with main's to know a phone has the new build. Every ticket bumps it: a test fails when it is not the newest ticket's number.
- No Worker, storage or link format change; trips already saved keep the faces stored in them. Tests: the legacy Thanksgiving on the organizer's and Mom's phones, every view; recognition by P-migrate's own rule, with its labels pinned as they were; friends' faces against the rule before this change (Sam 🐢 kept, Nina 🗽 and Frank 🌽 moved, 300 trips with friends) and unique; a face already taken; the update through the real Worker with no face jumping; the pulse once a visit, carried on when drawn again, pointed to again, spent by a tap, back on a new visit (Node, and in Chromium); ⚙'s number at 360/390/430 light and dark.

### Added (PIA-151) — My flight: pick, book and record each leg in one place; who lands when on the trip page
- Each traveler's sheet is their flight section: a 🛬 row and a 🛫 row, each with its day, the airport (PIA | ORD and LGA | JFK only, as before) and, once booked, the time field in that row, all read from the model's one flightEnds. It opens in one tap from a traveler's bar on the trip page (your own on any phone, anyone's on the organizer's phone, focused on a missing landing time), from your booked bar, and from any face as before. Days show whether they follow the plan (🗓, dimmed), are the traveler's own (underlined; ⚠ when outside the plan, still allowed) or booked, and a long press on the day says which.
- A row's day opens a month calendar for that end alone, on that end's own month (a 🛫 across a month or a year opens on its day): one tap on a day saves it (no Save to find), with the plan, 📌, paging, and past days or days that would cross the other end greyed with why. The first move after your 🎫 asks ⚠ 🎫 once a visit; ◷ while saving, ⚠ ↻ after a failure (the day stays picked), then back to the flight section at that end's time. ±1 stays until you book; then the time takes its place, and the day-before / day-after price chips only read their price (a tap says to tap the day).
- ✈ Book ↗ and 🎫 sit under the rows for exactly those days and airports, also before the dates are 🔒 (a trip still Asking): a flight bought early can be recorded, your own 🎫 once you have answered, the organizer's for anyone with days ahead (a confirming tap for someone who has not answered). The trip view's [📣 Share | ✈↗] and the board's 🎫 marks keep their rule until someone has booked.
- A booked traveler's pick is always stored as their own day, the plan's own day too (one tap records "my flight is this day"), and a booked day never goes back to following the plan (no Follow plan for a booked traveler in any picker), so a later plan move never moves a booked flight (blank booked ends are still pinned before every move). Unbooked, a pick on the plan's day keeps following the plan, decided on the fresh record the answer is sent against (a plan moved on another phone meanwhile never turns a pick into "follow").
- The trip page's board now carries the final check: a booked traveler's bar shows the landing time over its start and the leaving time under its end (☀ / 🌃), ––:–– in amber when no landing time is recorded yet; near the range's edges a label is anchored at its bar's other edge, so it never runs off its track. Days on a closed, paid or past trip, or before an answer, say why when tapped.
- Back on a person's sheet with ‹, its time field is not focused again (no keyboard on every back); a time typed in the flight section that still needs ☀ / 🌃 holds a close made from the calendar on top once, back in the flight section.
- One complete answer per save through the existing fresh-read write path; times stay in the note's 🛬HH:MM / 🛫HH:MM form; no flight numbers, no estimates, no Worker, storage or link format change. Tests: different days per person (Anjo vs Ashwin) agree across rows, Book links, the organizer's search, Calendar and Map; month and year turns, a hub trip's airports kept, a plan moved meanwhile, an Asking trip's 🎫; tap counts (🎫 → landing time in 2, booked day + time from the trip page in 5) in Chromium.

### Changed (PIA-150) — Family faces: Ashwin 💪, Anjo 🗽
- The 👪 family preset now gives Ashwin 💪 (Mom & Dad stay 🌽, Anjo stays 🗽), so new family trips, the legacy-trip review's suggestions and the history import's family and solo drafts all show him as 💪.
- Trips already saved keep the faces stored in them. The organizer can change a face in ✎, where 💪 is now pickable (one tap after 🌴) and fits its 44px tile.
- 💪 is added at the end of the face list. Every face picked or derived before stays the same, including the faces a faceless legacy trip shows on screen. No Worker, storage or link format change.

### Changed (PIA-149) — Shorter Nebby notes
- Condense the in-app travel guidance while retaining airline confirmation, carrier requirements, pet fees, vet advice and private security screening. No behavior or data changes.

### Added (PIA-148) — Nebby travel notes
- Expandable in-cabin travel guidance in trip Notes, including carrier/vet preparation, airline reservation and fees, security, and Peoria airport tradeoffs. Available in new, legacy and shared trips; reference text is exempt from word limits.
- Existing shared notes, human headcounts, RSVP answers and airfare remain unchanged. Pet availability and fees must be confirmed with the airline.

### Changed (PIA-147) — v2.0.0 cutover candidate
- Root, desktop and mobile entry URLs now redirect to one app, preserving query strings and fragments with Back-safe navigation. The app and shims identify as 2.0.0; actual release date/tag await launch checks.
- Retire the v1 dashboard, duplicate builder/parity and v1-only UI tests. Keep immutable v1 link/storage/quota/fare contracts and all Worker/v2 trust coverage. Add mandatory browser checks for redirects, organizer access, list import, fallback and desktop layout.
- Real fares only, explicit history import and per-phone shared lists replace the old estimated-price dashboard; deliberate feature retirements and migration limitations are recorded in V2_ACCEPTANCE.md and RELEASE_V2.md. Same-day live migration/device evidence and deployed-byte verification remain release gates.

### Added (PIA-146) — Review legacy trips and import family history
- Organizers can update a legacy shared trip in place, reviewing dates and identities before saving. The event day, member codes, access, personal windows, airport choices and bookings survive; a moved plan pins a booked traveler's inherited dates first. Chosen legacy estimates are cleared. Undated ideas keep their existing window.
- Settings offers an explicit history import with date, traveler and shared-note review. It reconstructs v1's real starter history plus saved changes and added trips, reuses shared records, preserves NYC's absent return and treats postponed Cary as dropped. Original source storage stays unchanged and can be downloaded without organizer credentials. Nothing imports automatically or searches for fares.
- Durable progress and cross-tab locks prevent repeated creations; confirmed partial updates resume after reload. A lost creation response blocks blind retries because the existing Worker cannot recover the generated ID/key. The new Chromium suite joins required preflight. Entry URLs and the PIA-147 cutover remain unchanged.

### Added (PIA-145) — Required browser job-flow gate and purpose review
- Preflight now requires Chromium and runs the full word/tap-count jobs, Calendar, v2 viewport assertions and verified-map jobs through one non-skipping runner. It starts its own local HTTP server, records per-suite logs and a JSON report, and blocks on a missing browser, skip, timeout or failed assertion. Existing 13/19-tap creation and three-step RSVP targets remain checked.
- Adds cross-screen agreement, failed-write, cross-phone RSVP, year-boundary, crowded day and Calendar glyph coverage. Calendar month arrows and holidays are now included in ⓘ, while the pinned event's own picture is identified as a trip picture.
- `V2_ACCEPTANCE.md` records evidence against the posted 140–145 checklist, purpose coverage and deliberate retirements for v1 features, plus the remaining migration, cutover and human checks. The unavailable original six-asks wording is not represented as verified. No entry URL changes.

### Added (PIA-144) — Calendar presence and overlapping trips
- Calendar now shows the selected trip's month, plan, fixed event day, personal dates and daily presence by headcount. Its day sheet uses the same presence calculation and identifies overlapping people/trips already known on this phone. Maybe remains separate; Mom & Dad count as two.
- Every day opens its people in one tap; a person opens their existing sheet with Back. A future/today day offers ＋ into the normal create flow with that date prefilled. Month browsing survives tab changes and resets when the selected trip changes. Calendar makes no paid requests, works without map assets and preserves the word and touch-target limits. `app.html` remains unlinked.

### Added (PIA-143) — Map, pickups and destination previews (in `app.html`, still unlinked)
- Map draws origin faces, routes, destination and alternate-airport pins from the selected trip. Its d3 7.9.0 and topojson 3.0.2 scripts use v1's exact SRI hashes. The world-atlas 2.0.2 data is verified with SHA-256 before parsing; the security gate checks its exact version and digest too. Faces, airport choices and pickups remain usable when any asset fails or its digest differs.
- Every pickup chip opens that airport's day with names and recorded or explicitly marked cached flight times. The organizer can see the cheapest fresh cached pair landing within two hours, without spending a search. Overnight offers never appear as landing on the departure day. Alternate-pin airport choices write the shared arrival/departure fields, keeping links and pickups in agreement.
- Organizers can preview another destination on chosen dates, see its real cached total and the exact search cost, then explicitly use it. Preview searches share the existing fare cache, 4-per-tap / 8-per-visit caps and daily/monthly locks. A preview changes no shared facts until Use; Use rechecks the fresh record. Locked, closed, past, undated or already-booked trips cannot spend on another destination. Guests and phones without the organizer token see no prices.
- Adds model and browser coverage for map assets, failures, word budgets, touch targets, alternate airports, destination pricing, spend limits and stale previews. Calendar work and the full job-flow suite remain PIA-144 and PIA-145; v1 and the cutover remain unchanged.

### Fixed — v2 merge review
- The Google Flights glyph fits inside its bordered 48px card button with wider emoji fonts; the tap target stays 48px. This fixes the card-fit browser assertion at 360px.

### Added (PIA-142) — Trips › Family: the people × trips board (in `app.html`, still not linked from anywhere)
- **Who is coming to which idea, at a glance.** Trips › Family is a board: one row per person, merged across every trip on this phone by name (me first, 👋; two people of one name on a trip stay two rows), one column per trip in the cards' order. A v1 "Me" is my row when it is this phone; on anyone else's phone it is that trip's organizer, whom v1's family preset names by airport (P-migrate's own suggestion: "Me" at LAX is Ashwin), so it joins that person's row instead of showing as a nameless stranger (any other v1 "Me" is a row of its own, after the named ones). Each cell shows that person's answer on that trip as its own face shows it in the trip view (✓, ?, ⊘, ◌, and a host's unconfirmed default drawn outlined), with the same marks (⚠ and 🎫 or 🏠 in one corner, 📞 and 📝 in the other, on a chip that stays light in dark mode so a dark 📞 reads) and, under it, the day they set to arrive. Someone not on a trip is a faint dot.
- **Who hosts, who is counted.** Each row's 🏠n is how many of this phone's trips that person hosts, past and planned (lives at the destination or a hub-pair drive away and has not said Out; dropped trips never), so the fairest next host shows at a glance; ⓘ and a long press call it "Hosted or hosting". Each column's foot is that trip's heads by headcount (Mom & Dad count 2), the same n/N as its card and its heads ring.
- **Act from a cell.** A cell opens that person on that trip (their sheet, with the answer row): the organizer answers for them (📞), anyone can nudge someone who has not answered (📣: the organizer hands out their own link, anyone else the group link), and my own cell gives me my own In / Maybe / Out. My name's cell on a trip this phone is nobody on yet asks "Who are you?" first, my face outlined, and one tap there opens my sheet in its place. On a phone that has no name yet (a first visit from a list link), any cell's sheet carries 🙋 It's me: one tap makes that face this phone's and the sheet its own, answer row included; 🙋＋ on it asks to join (P-face with the join row open). A face lights its row up across the trips; a column's head opens that trip, and a long press on it names the trip (its title, free under the word rule, then its days).
- **Trips that are over, and v1 trips.** On a trip whose days are past (not closed) the answer row stays greyed and says "Trip over" on a tap (the trip view's own row too), and nobody is nudged. On the unmigrated v1 Thanksgiving the organizer's row for someone else is greyed with "Update trip first" until PIA-146 brings that update.
- **Pages and history.** 4 trips a page with ◀ ▶ (a page shows me and the people on its trips); the column heads stay in view under the top row while a long board scrolls; 🗄 adds the past trips as columns (kept on this phone), and the board shows the page where they start. A short tap on n/N, a faint dot or the page dots names it, as a long press does. A board with nothing upcoming shows its ghost row of dotted faces with ＋ (and 🗄 when there are past trips to bring in); trips not read yet show ◷.
- **Words.** The screen stays within 10 words in every state: optional names beside the faces are dropped from the bottom up as the board fills, the names of hosts and of people who still have to answer last (every face stays, and names itself on a long press); trip names never appear on it. No prices on the board, on any phone.
- `scripts/trip-model.js` (inlined byte-identical in `app.html`): `familyBoard(models, {past, name})` builds the board from the trips' own models (cells are their member objects), so the board can never say anything a trip's card or view does not.
- Tests: `test-trip-model` (+16: columns and their order, 🗄 and dropped trips, people merged by name, two Sam Lees, v1 "Me" rows — mine, and another phone's joining the preset's named row, or staying its own after the named rows — heads by headcount, 🏠n across past and active trips, never a dropped trip or an Out host, the unconfirmed host default, own arrival days, marks, the profile fallback for me, a clash mark, no price on any row); `test-app` (+24: cross-view consistency — all 23 cells of five trips against each trip view's faces and the cards' faces, every column's heads against its card and its ring — paging, 🗄, the organizer's 📞 answer and 📣 through the real Worker, my own answer row, who-are-you then my sheet under one history entry, a guest's nudge with the group link and not one /search or /account call, /account at most once on the organizer's phone, 🙋＋, a first-run phone's 🙋 It's me then her own answer, 🙋 on a trip view's sheet, the greyed rows of a past trip and a v1 doc, the heads' titles, the v1 "Me" folded on Mom's board, which names go last, no price, nothing searched, the ghost row and ◷); `test-words` (every page of every phone's board at 360/390/430 with 🗄 off and on, a cell's sheet on each, 13 people with long names at exactly 10 words, real clicks on ◀ ▶, 🗄, cells, 📣 and a column head, a past trip's "Trip over" and its head's long press, the ghost row, who-are-you then my sheet, a first-run phone's 🙋 It's me and 🙋＋, a v1 doc's "Update trip first"; every write read back by polling the real Worker's record, never after a fixed sleep); `test-viewport` (the board's pages, 🗄, a cell's sheet and the ghost row at 360/390/430, light and dark; every mark chip light with dark ink in both schemes; the heads opaque under the top row when scrolled).

### Added (PIA-141) — the cheapest week on demand: real searches only, the cost first, the trip moved in one tap (in `app.html`, still not linked from anywhere)
- **📉 in P-dates opens P-cheapest.** Only on the organizer's phone that holds the token, for a trip whose dates can still move. It is greyed and says why on a tap while the dates are 🔒 ("Dates locked", beside 🔓: a week is never moved to while the dates are locked), when nobody follows the plan (everyone set both ends, or booked), with no place, no nights or no window yet, someone with no airport to fly from, or no week that fits; phones without the token never show it. ‹ goes back to P-dates.
- **Weeks that keep the trip.** Each bar is one candidate week from the trip model: the plan's length (or an undated idea's 🌙N), the 📌 day inside, within the flex window (the plan ± 7 days, or the idea's ⟦window⟧), starting tomorrow at the earliest. Thanksgiving's 📌 11/26 keeps every week around the dinner, however wide the window: 10 weeks, 11/17–11/26, never one after it. Only people who follow the plan move with a week; ends someone set stay where they are and are priced as they are, and a booked traveler keeps the days they booked (their flight is bought: never searched here, and its cached price is the same in every week).
- **Nothing estimated.** A week nobody searched is a dashed hollow bar with its cost on top (🔍≤2: the legs not fresh on this phone; a cache hit costs nothing); a priced week is filled to its total, from the same pricing rule as every other $, grey while a fare is a day old ("Old fares" in its ⓘ: Move waits for fresh fares, the week's refresh is shown first, cost and all); $∅ where a search found no fares. Each total is the trip's whole cost: a flight already booked adds its cached price to every week alike, so the plan's own week, once priced, reads exactly P-total's total, booked or not, and the weeks still compare only what a Move changes. ★ marks the cheapest only once two weeks are priced and one is cheaper. The plan's own week is outlined. A week that would leave someone's own days outside the plan carries ⚠ and their face.
- **The cost before every spend.** Selecting a week shows its parts (each face with their $, own days underlined, 🎫 and its muted price for a flight already bought) and one 56px button that stays in view at the sheet's bottom, however long the party: 🔍N, PIA-140's own spend control and path (≤4 a tap, 8 a visit, the Worker's day cap until 00:00 UTC, the month lock, the cache), never a second way to search. ≤7 bars a page (6 on a phone narrower than 340px), ◀ ▶ (paging) and the dashed ⟦◀ ▶⟧ (widening) in two groups on their own row below; ⟦◀ ▶⟧ show only where they add a week, and save the window a week wider (one edit; the plan, 📌 and 🌙 stay; the toast shows the window saved). A short tap on a face chip, its ⚠, the week's readout, 🔍 26/30 ("Searches left") or the visit's dots names it, as a long press does; keyboard focus moves to the button that replaced the one tapped.
- **Move.** Once a week is filled, Move makes it the plan in one write (the same plan edit as P-dates' Save, 📌 kept): every plan-follower's Google Flights link, bar, pill and card follow in the same render, and 📣 pulses for the organizer to tell everyone. It asks for a confirming tap when the week would leave someone's own days out (⚠🗽 Confirm), or, once a visit, when anyone has booked (⚠🎫×n Confirm); a booking or a 🔒 another phone made meanwhile holds it back on the fresh record (a booking asks here; a 🔒 shows 🔒, a closed trip 📉⚠ "Trip closed"). A failed Move shows ⚠ ↻, and ↻ asks its confirm again at once. Then ‹ P-dates on the new plan (🔒 one tap away; an undated idea it dated is in dates mode), with ↩ in the toast. P-dates under P-cheapest follows each of its writes from the moment it is drawn, so ‹ (even while a write is out) shows the trip as it now stands and its Save never puts the old dates or window back.
- `scripts/trip-model.js` (inlined byte-identical in `app.html`): `cheapCandidates` now leaves booked travelers out of what a week searches and of what fills or greys it, adds their cached price to every week alike (`bought`), and marks a week that would leave their booked days out; it says what one 🔍 on a week searches (`need`: none for a week a search found no fares for, or where someone cannot be priced), whether it is priced but a day old, and ★s only a cheaper week; `cheapWhy` (why 📉 cannot open), `widenWin` / `widenDelta` (⟦◀ ▶⟧), `moveDelta` (Move), `followsPlan`; `spendable` takes every candidate week's legs while the cheapest week can be asked for, and none once the dates are 🔒.
- Tests: `test-trip-model` (+20: the Thanksgiving S1 sample pinned on the migrated legacy doc — 10 weeks, 5 marked 🗽, ≤2 searches each, $890 ★ on 11/22 — never a week after the dinner however wide the window, an undated idea's 🌙4 weeks, tomorrow at the earliest, a booked follower, a booked flight's price in every week alike (the plan's bar is P-total's $955), every reason 📉 is greyed, ★, $∅, a day-old week, a week that cannot be priced, `spendable`, Move and ⟦◀ ▶⟧ through the real Worker); `test-app` (+24: S1 with real data through the real Worker and its SerpAPI stubbed: 📉, 10 weeks on 2 pages, ⚠🗽, 🔍≤2, the cost before the spend, 🔍2 → $890 ★, Move drawn at once and written once, no price in any write, ↩; the ⚠ and 🎫 confirms; 🔒 and nobody-follows; a 🔒 meanwhile; no token; the day cap and the visit's 8; ⟦◀ ▶⟧; paging 7/7/7/1; an undated idea moved, then ‹ in dates mode; ▶⟧ then ‹ with nothing to save; ‹ while Move is out, with a poll meanwhile and a double tap; a failed Move and its ↻; a failed ▶⟧ and its ↻; a booking made meanwhile asking here); `test-trust` (+1: the cheapest week spends only through the PIA-140 path; the A1 run now counts 24 legs of the trip's own); `test-words` (+14: P-cheapest in every state on every organizer token phone and width, the worst case with 8 long names, and S1 with real clicks through the real Worker, keyboard focus after 🔍, short taps that name a chip, 🔍 26/30 and ⚠, an undated idea moved and ‹); `test-viewport` (+10 states per size and scheme, one only when the 8-member trip has a week besides the plan's: P-cheapest's at 360/390/430, light and dark, with its button whole and in view on a 640px-high phone and 6 bars at 320px).

### Added (PIA-140) — prices: one honest total from real fares, never spent without a tap (in `app.html`, still not linked from anywhere)
- **One number, built only from fares that were really fetched.** On the organizer's phone that holds the token, the trip's total, each person's amount on the people board, the card's total and every leg price come from the one pricing rule in the trip model, so they always agree. A leg never searched is a hollow dashed $—, never an estimate; a search that found nothing is $∅. Guests, and any phone without the token, show no $ anywhere and never call the Worker's paid routes.
- **P-total: trust the one number.** The card's total and the trip page's total block open it, headed by the trip's own picture: one row per traveler (their face opens their sheet), a round trip as ✈ one fare, open-jaw as 🛬 and 🛫 (the two one-way searches the total adds up). Each priced leg shows how old the fare is (a clock wedge), Google's own price level (a low-to-high gauge with the level's own bar filled: green low, red high, never read as signal strength), its stops, and the airport that won when it isn't their own, on the side it is on (🛬 BUR→ $305 where the way in leaves, 🛫 →JFK where the way home lands), all from the search already paid for. Each part names itself on a long press ("Fetched 2h ago", "Price low", "1 stop", "From BUR"), the sheet's own ⓘ explains every glyph in it ($—, $∅, ★, ⛔, the visit's dots, 🔍), and a screen reader hears it in words ("Arrive, $305 from BUR, fetched 2 hours ago, price low, 1 stop"). The sum on top shows ▼$40 / ▲$40 only when every leg in it was fetched twice for the identical search.
- **Every search is on purpose.** Nothing searches by itself: not opening the app, a refresh, the 60s poll, coming back to the tab or opening a sheet. The one spend control, 🔍N, shows how many searches its tap makes before it is tapped (missing legs first, then day-old ones, never a past day, never a booked traveler's: their flight is bought), and 🔍1/3 when the caps cut it short. The tap never spends more than it showed: if the cost grew meanwhile (an /account answer still on its way switched nearby airports on), it is drawn again with its new cost and nothing is spent. One tap makes at most 4, one visit at most 8 (P-total shows this visit's 8 as dots, and so does a person's sheet while it can search), and the Worker's searches left today read 🔍 26/30. The visit's count fails closed: every reply the Worker may have spent on counts, so a reply whose cache header can't be read still stops the visit at 8. Fares older than a day turn grey with 🔍, and P-total offers the one-tap refresh; a search that found no fares isn't offered again for 24 hours.
- **Locks say when they lift.** The Worker's daily cap (its 429) locks spending on this phone only until the next UTC day, shown as the local time it lifts (⛔ 17:00 in Los Angeles); the month lock (the organizer's own month cap, 990 searches, the plan's last 10, or SerpAPI itself refusing) locks every spend control, shows the 1st it lifts (⛔ 11/1) and says why on a tap ("SerpAPI refused", "Month cap"). A refusal by SerpAPI (which can be a passing hourly limit) is held a few minutes, then lifted by the next `/account` read that shows the plan has searches left, as v1's sync does; a plan with nothing left keeps it. Once the visit's 8 are spent, ⛔ ↻ says how it lifts: a confirming second tap starts a new visit, which spends nothing by itself. The trip page's total block shows the lock instead of a cost no tap would spend, a square ±1 button shows ⛔ alone (its time in its label), and a locked control explains itself on a tap and sends nothing. A token the Worker refuses shows 🔑⚠ in ⚙ and P-total, and `/account` is then not asked again for 5 minutes, unless a token is saved.
- **One traveler's end, a day either way.** In a person's sheet on the organizer's token phone, under their legs (with the airport that won, as in P-total): their fares, and for each end 🔍2 prices the day before and the day after (the same caps). The three days then show their $ with ★ on the cheapest (a round trip's own day shows ✈, the one fare above, not the same $ again), and the day before or after, raised like a button, is one tap from becoming their own day: the move is to the day the chip names, so a quick second tap moves nothing further, and the organizer moving someone else's day gets 📞 11/7 with ↩. A chip that can't move someone sits flat and says why on a tap ("Not answered yet").
- **Nearby airports only once the Worker takes them.** A traveler's nearby set (LAX BUR LGB SNA ONT, LGA JFK EWR, PIA with ORD) is searched as one comma-joined search, sorted as the Worker caches it, only once `/account` reports `features.multi_airport`; a tap made while that answer is still on its way waits for it (◷), so it never pays for single-airport searches the next redraw would drop.
- **Both apps on one phone agree.** The month's counter is v1's `pialax_serpapi_quota` in v1's format (read, migrated, bumped and locked as v1 does), the day lock is v1's `pialax_daily_cap_v1`, and `/account` sets v1's `pialax_multi_airport_v1`. A one-adult search is byte for byte v1's search, so both apps hit the same Worker cache entry; a fare v1 fetched counts here with its own fetch time, and one fetched here is written into v1's `pialax_prices_v1` as v1's own fetch would write it. A Worker cache HIT keeps its original fetch time ("fetched 2 hours ago", not "just now") and moves no counter. Fares live in `pialax_fares_v2` on this phone only: app.html never writes a price to the trip, a link, a share or a calendar event (a fare mirrored into v1's cache can reach v1's own opt-in fare-alert email on a phone that also runs v1, until the cutover).
- **⚙ on the organizer's phone** shows the Worker's searches left today, this visit's 8, and this month's searches against a month cap the organizer sets (digits only; v1's budget), each lock beside what it counts: the day's ⛔ 17:00 by today's searches, the visit's ↻ by its dots, the month's ⛔ 11/1 (and why) in the month's row. On the organizer's own phone without the token, the trip page shows one muted 🔑🔍 ("Add token") that opens ⚙ at the token field, and still no $.
- The board's price column holds a 4- or 5-digit partial sum ($1,387+, $10,987+) without pushing the page sideways; a dropped trip's card keeps its last total but offers no 🔍.
- A person's name at the top of their sheet breaks only at its spaces, never inside a word (not even at a hyphen). When a word of it has no room beside the face (‹ back to P-total, ⇄, ⓘ and ⌄ share that row on a 360px phone, or a long name such as "Bartholomew Montgomery-Fitzgerald"), the name takes its own line under the face and the buttons stay where they are; only a single word wider than the whole sheet is drawn smaller, and broken as a last resort, never scrolled sideways.
- A flight time typed for someone whose 🎫 was taken back on another phone is never sent, and now says 🎫⚠ even when this phone had not read the change yet: the read made just before the write holds it back, where it used to open an error sheet.
- **v1's `MAX_CALLS_PER_REFRESH` (3) is retired in v2.** v2 has no refresh that searches: a tap is the refresh, capped at 4 searches a tap (v1's `TRIP_LEG_CALLS_PER_PRESS`) and 8 a visit (v1's `MAX_CALLS_PER_SESSION`, kept for the tab across reloads until the organizer starts a new visit with ⛔ ↻). v1 keeps its own constant until the cutover.
- A confirming tap and the 🎫 glow now lapse by the app's clock, never by when a timer happens to fire.
- `scripts/trip-model.js` adds the spend rules: `searchQuery` (a fare key is exactly one Worker search, in v1's parameters), `fareFromSerp` / `fareFacts` / `prevDelta` / `priceDelta` (what a reply keeps and what a leg can say: age, level, stops, the winning airport, ▼ / ▲, all through the total's own rule), `spendKeys` / `spendCount` (what a tap may search, missing legs first, and what it costs), `tapKeys` / `spendable` (the legs of one trip a tap may search at all, never a booked traveler's), `spendLock` (month, day, visit) and `monthWhy` (which month lock), `quotaRead` / `quotaBump` / `quotaExceeded` / `quotaFromAccount` (v1's counter), `v1FareKey` / `fareKeyOfV1` / `fareFromV1` / `v1Fare` (v1's fare cache), `faresPut` and `endPrices` (one end ±1 day). Fare keys name their airports as a sorted set (the Worker's cache order).
- Tests: `test-trip-model` (+25: one end ±1 day, round trip and open-jaw, none to search for a booked traveler; a reply's facts and a hostile one; ▼ / ▲ only between two real fetches; every search the model builds accepted by the real Worker, nearby airports on and off; what a tap may search (missing first, never a booked traveler's) and cost; every lock and which month lock; v1's own `readQuota` / `bumpQuota` / `markQuotaExceeded` run in-process against the model's; `/account` lifting, holding and keeping a refusal; v1's fare cache both ways; read as source, no write builder that can reach a fare), `test-trust` (+8, the A1 / A3 trust gate now over app.html's spend path through the real Worker, every wait a tick and never a real timer, replacing PIA-134's "no /search at all" check: no token, or a guest holding it, → zero paid calls, no 🔍 and no $; nothing searches by itself; one tap on the drawn 🔍 one search per leg with the token in its header only; only the trip's own legs, never more than the control showed, ≤4 a tap, ≤8 a visit, also with the cache header unreadable; a HIT moves no counter and keeps its first fetch time; the daily cap locks until the next UTC day only; SerpAPI's own 429 locks the month until an `/account` with searches left lifts it, never right after the refusal; and v1's own fetch caches a fare exactly as app.html writes it), `test-app` (+29, against the real Worker: P-total, the trip page, the card, the board and a person's sheet agreeing; the cost before the tap, and a tap whose cost grew while it waited spending nothing; ages, levels, stops and winners in P-total and P-person; a day later grey with the refresh, then ▼$20 a leg and ▼$60 the total; a HIT from another phone; a booked traveler never searched; ±1 day with ★, a double tap moving one day, the organizer's move with ↩; a tap waiting for `/account`; ⛔ 17:00 and ⛔ 11/1 and why; the total block's lock, never 🔍0; ⛔ ↻ and a new visit; a refusal lifted; a refused token; stops read from the Worker's code; a run whose redraw throws; $∅ not offered again for a day; v1's fares both ways; no price in any write or share; guests and token-less phones and their 🔑🔍; ⚙; a dropped trip's card; 5-digit sums; a time typed for someone unbooked meanwhile, both when this phone has read it and when it has not; and its waits for a write no longer give up while the in-process Worker is still hashing the edit key on a loaded machine), `test-words` (+12: a worst-case trip of 8 long-named open-jaw travelers each won by another airport both ways, walked at every width; P-total from every card and trip page; real clicks through the real Worker for 🔍4/5 then 🔍1, P-total's and P-person's ⓘ with every glyph keyed and every part's long press, a person's ±1 day, ⛔ ↻ and ↻8?, ⛔ 11/1 and "SerpAPI refused", ⛔ 17:00 and its label, ⚙ with every lock, ◷ while `/account` is out, 🔑⚠; and the wait and the locks again at every width), `test-viewport` (+22 states per phone size and scheme: P-total from a card, the 8-member trip's $— block, P-total all $— and its ⓘ, 4 searched and all searched and its ⓘ, a person's fare row, ±1 days and its ⓘ, P-total and P-person locked, ⚙ with the budget, the visit's and the month's locks on the block, P-total and a square, ⚙ with every lock, the board with $10,987, $10,987+ and $1,387+; P-total's $— dashed and its gauge bottom-aligned as in P-person; and every person's sheet on the Diwali and the 8-member long-name trips, opened from P-total on the organizer's token phone (‹ and ⓘ, and ⇄ for the phone's own traveler) and from the board, its name breaking only at its spaces: no more lines than words, no word on two lines, nothing overflowing or covering a button, the buttons on the face's row). New fixture `scripts/fixtures/serp-flights.json` (one SerpAPI reply, LAX→PIA).

### Added (PIA-139) — booking: one booked control, flight times for the pickups, and a trip that reaches Done by itself (in `app.html`, still not linked from anywhere)
- **Book and 🎫 sit together once the dates are set.** On the trip page and in each traveler's own sheet: [✈ Book ↗ | 🎫]. ✈ Book ↗ opens that traveler's Google Flights search in a new tab; back in the app afterwards (the page shown again, or focused, after it was hidden), the 🎫 beside it glows for a few seconds, once, inviting the tap. That works even when the phone threw the page away while Google Flights was open (the tab remembers the Book tap); a Book tap that never left the app (nothing opened) is forgotten after a few seconds, or at the next tap, so a later trip to another app makes nothing glow. One tap on 🎫 marks me booked, and the toast's ↩ takes a mistaken tap back for 5 seconds.
- **After my 🎫, my flight times come next.** The trip page's bar becomes [🎫 🛬 ––:–– | ✈⏱↗]: the big button (it pulses once right after the 🎫) opens my own sheet with 🛬 ready to type, and shows my landing time once I have recorded it; Flighty is the square beside it ("Track flight"). In my sheet, a second tap on my 🎫 takes it back: the first tap says 🎫↩? and waits (no time limit) until I tap again or tap anything else.
- **The organizer books for anyone.** In someone else's sheet he gets their own ✈ Book ↗ and his 🎫 for them, as on the people board's 🎫 column; back from the Book he tapped for them, it is his 🎫 for them that glows (in their sheet and on their row), not his own. Marking someone who hasn't answered (or said Out) records them In first (📞), behind a confirming tap; never on a host or on his own row. Where someone has no flight link, their slot says why, as the trip page does (📍? No home airport, ✈⚠ Fix dates…).
- **Booked flight times reach the pickups.** Once booked, a traveler (or the organizer for them) types the time they land (🛬) and leave (🛫) in their sheet, 24-hour (`15:10`, `1510`, `0905`; `6:05 pm` where the keyboard has letters). An hour from 1 to 12 typed without a leading 0 (`310`, `1105`) could be either half of the day, so once the field is left it asks [☀ 15:10 | 🌃 03:10] and nothing is saved until one is tapped: a 3:10 PM never becomes 03:10 by itself. A field selects what it holds when entered, so typing replaces it. Times save as the sheet closes (or on ↵), or when the page is hidden (a phone that throws the page away loses nothing), written before the note, which is kept whole (times that would leave the note no room are refused with "Too long"). A time that isn't one, or still waits for ☀ / 🌃, keeps the sheet open once with the field marked; a second close lets it go unsent. Everyone reads the times beside that person's days, each with its ☀ or 🌃, and on the **Map**: one lane per labelled airport (the destination, and the hub's other airport, e.g. PIA and ORD) with a chip per landing and leaving day ("→🛬 11/24 15:10☀ 🗽", "🛫→ 11/29 18:05🌃 🌴🗽"); a booked traveler's chip carries a 🎫 corner; arrivals ≤2h apart at one airport are bracketed ⏱ as one pickup run with how long it waits. A chip of one traveler opens their sheet, a chip of several that day (P-day). Hosts see them too. Taking a 🎫 back clears its times in the same write, so no phone shows a pickup for a flight that is no longer booked. (The full map with pins and arcs is still PIA-143's.)
- **The stage moves on by itself.** 🎫 Booking once any traveler has booked, 🏁 Done once every one has, worked out from the booked flags on every phone alike (the card, the trip page and P-stage). A booking never closes anything: someone who hasn't answered (a host, or a traveler while others book) still answers, at Booking and at Done.
- **💵 what we paid, once everyone has booked.** On the organizer's phone with the token only: at 🏁 Done the trip page has 💵 ＋, and P-stage a 💵 field and Save (whole dollars, `$1,490` works). Before that the 💵 is greyed with the faces still to book, and a tap says "Not everyone booked". Paying closes the trip's answers and freezes everyone's flight times, so Save always asks first: ⚠ with who hasn't answered, 🛬 with who has no landing time yet, 🔒, the amount read back as dollars (a screen reader hears the names; the question lapses after a few seconds, a new amount puts it back, and a quick double tap is one tap). A trip whose dates were never 🔒 is locked on its plan first, then paid. A 🎫 taken away on another phone since this one drew 🏁 sends nothing (checked on the trip as it stands). The amount then reads 💵 $1,490 in P-stage and on his card, with ✎ to fix a typo (one more update); guests never see it. On a paid trip the times read with 🔒 ("Times locked").
- **Add to calendar.** On a trip with dates, a calendar-plus in the trip page's top bar opens **P-calendar-add**: a mini postcard and my days (my own, else the plan; a "?" corner until the dates are set), then [📅 .ics] (an all-day event file for Apple Calendar and most apps) and [↗ Google] (Google Calendar's own form, in a new tab); a tap says ✓. Both are tentative ("? " and STATUS:TENTATIVE) until 🔒 (or my own 🎫, or 🏁), and the only link inside either is the trip's guest link: never the edit key or the token. An undated idea has no event, even for someone who set their own window.
- **The key explains a glyph with two meanings on one screen** by both of them (🎫: "Booking · I booked").
- `scripts/trip-model.js` adds `bookSlot` (a traveler's [Book | 🎫] / [Flighty | 🎫] slot and whose 🎫 it is), `typedTime` (with `timeHalves` and `dayPart`: an hour that could be either half of the day is not a time until its half is picked), `timesBy` (who may record a traveler's times here) and `timesRequest` (the one complete answer that writes them, note kept), `paidCheck` (when 💵 can be recorded, who is still to book, who hasn't answered, who has no landing time, and whether a paid amount can be entered again), `paidHeld` (the same on the record it is sent against) and `typedPaid`. `respondRequest` refuses times that would cut a note; `bookedRequests` clears a 🎫's times as it is taken back; `organizerEdit` builds 💵 only once every traveler has booked, and 🔒 the plan first on a trip that was never chosen. `pickups` draws a recorded time only while its traveler is booked, and a cached offer's time only when it is HH:MM (`cachedTime`); `calendarAdd` makes no event without a plan.
- Tests: `test-trip-model` (+23, through the real Worker: Set → Booking → Done read the same by four phones, answers still taken at Booking and Done, In (📞) before a 🎫 for someone unanswered or out, times written with the note, days, airports and 🎫 kept and read on the host's and a guest's pickup chips, cleared when the 🎫 is taken back, `310` / `6:05` never read as 03:10 / 06:05, a hostile cached time drawn as none, the 280-character note, 💵 in one update or two and entered again, the stale 🎫, no event for an undated idea), `test-gflinks` (an undated idea's own window makes no event), `test-app` (+33, against the real Worker: the 🎫 glow only after a Book tap and a return, once, on the 🎫 of the traveler whose Book it was, and after a reload of a discarded page; nothing for a Book tap that never left; my booked bar and its sheet at 🛬; ↩ after a mistaken 🎫; the organizer's [Book | 🎫] in someone's sheet and its no-link reason; times typed and saved as the sheet closes or as the page hides, held once when not a time, `440` asking ☀ / 🌃, `6:05 pm`, the organizer's change keeping 📞, a guest reading them; the 🎫 taken back with a confirm that waits, its times cleared; the Map's chips (🎫 corner, ☀ / 🌃, one traveler's sheet) and a hostile cached time; the board's 🎫; the stage on three phones; 💵 greyed, refused, always asking first (who, +n), lapsing, chosen first, held back by a stale 🎫, entered again with ✎; the trip page's 💵 ＋; P-calendar-add tentative and set with no key or token in either link, its spoken names), `test-words` (+7; two new phones on a Done 8-member trip, walked at every width: time fields typed, ☀ / 🌃 asked and a time marked ⚠, 💵 typed and asking first, the greyed 💵 and its reason, P-calendar-add from every dated trip; real clicks through the real Worker for the Book return glow, the 🎫, my booked bar to my sheet at 🛬, the 🎫 taken back still asking after 6s, `410` and ☀, the Map's pickups and a chip's sheet, P-calendar-add, and 💵 from the trip page's 💵 ＋ (a double tap only asks; ⚠'s long-press label; ✎)), `test-viewport` (+19 states per phone size and scheme: the glow, [Book | 🎫] in my sheet, a booked traveler's sheet, a typed time, ☀ / 🌃 asked and a time marked ⚠, my booked bar and its sheet, 💵 typed and asking first, the greyed 💵, a paid trip with 🔒 times, 💵 with ✎ and entered again, P-calendar-add tentative and set, the Map's pickups with a ⏱ run and a chip's sheet). `test-app`'s seeded ids stay unique past 99 seeds.

### Added (PIA-138) — dates: the one picker (in `app.html`, still not linked from anywhere)
- **One tap moves the whole trip a day.** On the organizer's trip page −1 and +1 sit either side of the plan: the whole plan moves, keeping its length and 📌. In that same redraw everyone who follows the plan moves with it on this phone (their ✈↗ Google Flights search, their bar, the card's dates and the Map's pill); a day someone set themselves never moves, and shows ⚠ once it falls off the plan. A run of quick taps is one save, sent once the taps stop (a background refresh waits for it). A page closed or reloaded before then sends nothing built from what it read earlier: the move is kept on the phone and the next open of the app sends it, checked against the trip as it stands then, so a lock, a booking or someone else's newer change made meanwhile wins (a page brought back from the browser's back-forward cache sends it as it comes back). Other phones follow on their next refresh.
- **Moves that can't happen say why.** A shift that would start before today shows ⏳⚠, one that would leave the event day (📌) outside the plan shows 📌⚠; a tap or a long press on it names the reason. While the dates are 🔒 there is no −1 / +1 at all (the pill shows 🔒). Once anyone has booked, the first move of a visit asks for one confirming tap (⚠🎫), so nobody's booked days move by accident; a booked traveler's days are kept as their own before the plan moves.
- **A second phone can't move locked dates.** Every date change is checked again on the trip as it stands when it is sent. If another phone has locked the dates (or closed the trip) since this one last looked, nothing is sent: the page redraws locked and says 🔒 "Dates locked". If someone has booked since, the move isn't sent either; its button asks for the confirming tap first.
- **P-dates, the one date picker.** The date pill (on the trip page and on every card) and my own bar open it: the plan for the organizer (with [trip | me] when he travels too), my own days for anyone who has answered, and the plan to read for everyone else. Before someone answers, the pill pulses their answer row and says "👋 In / Maybe / Out": days are never set for someone who hasn't answered.
  - The organizer's tools (📌 👥 🔒 🗓⊘ ⬚) sit above the calendar, and the next 4 holidays from the month on show sit under them, so 🔒 is one tap after Save on any phone. Nothing hides under the Save bar: it is never see-through (a disabled Save greys its label, not the bar), and the rows fade into it when the picker scrolls. Every weekday is named; ⓘ explains the calendar's marks (dots, the numeral, hatching, the window, the plan's outline, my days).
  - Tap a start, then an end (no dragging). −7 −1 +1 +7 move the whole range; ◀ ▶ only page the month (◀ on this month says "Past"). Holiday chips (🦃 🎄 🎉 …, named by their holiday) pick the whole long weekend and its event day in one tap (Thanksgiving: Wed–Sun with 📌 on Thursday). 📌 then a day moves the event day; the plan can't be saved, locked or shifted with 📌 outside it (📌⚠).
  - Save stays open (✓ once saved), so 🔒 is the next tap; 🔒 locks the plan as it stands (with the dates just picked) and the picker stays open, now the plan to read with 🔓. Moving, unlocking or clearing after anyone booked asks once per visit, in a word (⚠ 🎫×n Confirm). While a save is out its button shows ◷ and keeps the keyboard focus, and the rest of the picker says "Saving" instead of taking a pick; ⚠ ↻ if it fails; a quick double tap is one save. Dates picked and closed without Save are not lost without a word: 🗑, and ↩ brings them back.
  - Every day shows who is there: a heat, dots for heads (the filled ones first, so they always match the numeral; hollow for someone not there yet, amber for maybe) and a bare numeral that never passes the heads ring; a long press on a day names it with its count ("12/11 · 👥6"). 👥 then a day (or any day of a plan to read) opens **P-day**: who is there, who said maybe, who isn't, each face one tap from their sheet.
  - Members set either end or both ([🛬 | ↔ | 🛫]), or follow the plan again: the "follow the plan" chip sits beside the dates, always in view, and an end that still follows the plan is drawn dimmed. A day picked on the plan's own first or last day keeps that end following the plan, so "arrive a day later" moves the arrival alone, and nobody's days change unless they changed them (Save says "No change" until then). Off the plan is allowed and shown in amber (⚠🗓 "Outside plan"). Their own days stay editable while the plan is 🔒, with one confirming tap after their 🎫. The organizer can set anyone's days for them (marked 📞).
  - An undated idea collects a rough window and 🌙 nights (⟦⟧, 🌙− / 🌙+; 🌙? until one is picked, so an untouched Save writes nothing). ⬚ the best window (from the people who set their own days only, never from people who just follow the plan) becomes the plan in one tap, with ↩ in the toast; 🗓⊘ clears a plan, so the idea is undated again (its window and length kept), also with ↩.
- **One leg at a time.** In a person's sheet each leg's day opens P-dates for that end, and −1 / +1 beside it move that end alone (it becomes their own, underlined; back on the plan's day it follows the plan again). Quick taps are one save; reversed days (⚠) can be fixed from there.
- Disabled controls say why: a tap shows their label, as a long press does (Before today, Event day outside, No destination, Ends cross, Past, No change, Saving …).
- Screen readers hear what a date pill shows ("Dates 11/6–11/9, 3 nights, event day 11/8, locked …"), my bar's and each leg's days; a long press still names them in a word or two.
- A control on the screen keeps the keyboard focus through a redraw (a refresh, or the tap's own); cards fly in without shrinking, so their date pill stays a full-size target.
- `scripts/trip-model.js` adds `moveRange` / `planShift` (one rule for every shift), `holidayPick`, `planCheck`, `planDelta` / `windowDelta` / `clearDelta` (the organizer edits that change dates), `datesHeld` (a date move on a locked or closed record builds nothing), `ownDays` / `legShift` (one person's ends, with `same` for "No change"), `dayPeople` (P-day, from `presentOn`) and `datesRole` (what the pill opens).
- Tests: `test-trip-model` (+36), `test-gflinks` (+7: the golden Google Flights links re-checked on shifted plans), `test-app` (+61, against the real Worker: two organizer phones and a stale lock, a booking after the last read, a page left mid-run and its next open (a lock, a booking, a newer answer or a newer plan since: nothing sent over them), one own end and "No change"), `test-words` (+10: P-dates and P-day on every trip view of every phone at every width, its ⓘ key, and on the 8-member trip the confirms, Saving, ✓ and ↩, with real clicks; a +1 then a reload, after a lock and on an open plan) and `test-viewport` (P-dates, P-day and the leg shifts at 360/390/430, plus P-dates at 360x740 and 375x667 with an occlusion gate, light and dark).

### Added (PIA-137) — the trip page and RSVP: the organizer page and the open portal (in `app.html`, still not linked from anywhere)
- **One trip page for everyone, read from the shared trip.** The picture with 📍 the destination (one tap shows the trip on the Map, for hosts too), the stage (a tap names the five stages) and the heads ring (a tap jumps to the people), then me, the plan and my own days, In / Maybe / Out, everyone on a day board, and one button for what to do next.
- **Answering takes 3 taps from the group link, 2 from a personal one.** A phone that is nobody on the trip gets the face picker ("Who are you?") by itself: one tap on your face, then In. A personal nudge link (the guest link with `#m=<code>`, or `?me=<code>` on an app link) greets that person straight away, and In answers. A hint never replaces who this phone already is: neither the face it remembers for the trip, nor its profile or its face on another trip when that names someone else here (a nudge link forwarded to Dad's phone asks instead of greeting Anjo). The picker then outlines and focuses the face this phone already is (👋), and marks the link's face with ✉. Nothing is written until the person answers, and a hinted first answer never replaces a profile that names someone else. A v1 "Me" shows as a dashed face with no word and is never offered as a name. On a phone whose storage refuses writes (blocked site data, a full quota, some in-app browsers), a link still opens its trip, even one that phone has never opened, and the face picked there answers: what could not be stored is kept in memory until the page closes.
- **Pick yourself, or ask to join.** The face picker lists the trip's own people (1-word names above six people). A trip saved from a list link now preselects the face whose name this phone already is on its other trips (never saved by itself); one tap, and its card shows my ✈↗. 🙋＋ asks the organizer to add me: a name (≤3 words) and an airport (a city typed there is cut to 3 letters and refused with ⚠ until it is a code; an unknown code is marked 📍⚠ and still goes), and 📣 shares the join link (`?idea=<id>&add=<name>.<IATA>`, URL only, "To organizer"). Until he adds me, my picker shows the request pending (🙋＋ ⏳ and my name), and 🙋＋ reopens it filled to send again. The link opens his people editor on his phone (PIA-136); on any other phone it no longer vanishes: a small sheet shows who asked, and 📣 sends it on. Once he has added me, the next refresh offers my new face.
- **In / Maybe / Out are labelled, saved on the tap, and never pre-filled.** Out is ⊘; sheets close with ⌄, never anything that looks like an answer. A host's In is drawn as a question until they tap it (grey and dotted, a hollow ✓ on their face: counted, not confirmed). A saved answer says ✓; while it is on its way the pressed answer breathes. Out on someone booked takes their 🎫 away, so it asks for a confirming tap (Out pulses with 🎫↩). Tapping the answer the organizer entered for me takes it over (📞 goes). Every answer is one complete write, rebuilt from a fresh read of the trip and sent one at a time, in order: answering never erases anyone's own days, note, home-airport override or airport picks, even from a screen a minute old or when two taps race (checked against the real Worker). A failed answer goes back on screen, and P-error says 📶⚠ Not saved; ↻ sends that same answer again. A paid or dropped trip shows 🏁 or 🗑 instead of taps that would fail; a trip that is merely Done (everyone booked) still takes answers.
- **Everyone sees everyone.** Each person's row shows their answer shape, their days as a bar (dashed while maybe, dotted while waiting, a hatched band for a host, 🚗 where they use the other airport of a hub pair), and their marks: ⚠, 🎫, 🏠, 📞 (the organizer answered for them, v1's "(entered by …)" too) and 📝. People who are out stay on the board, dimmed. A screen reader hears each face's name, answer and marks; a long press on a mark names the mark. Guests see no price and no flight link but their own, and someone else's sheet offers a guest nothing that would do nothing: their days and airports to read, their note, and 📣 Share (the group link: a guest never hands out someone else's personal link) while they have not answered or said maybe.
- **One button for what's next, the same rule for everyone.** Before the dates are set: 📣 Share and ✈↗ my search. Once set: ✈ Book ↗ and 🎫 I booked. After booking: Flighty. With no flight link it says why (📍? no place, with 🧭↗ Explore for an idea without one; 🚗 no flight needed; ✈⚠ the dates). Hosts, people who are out and guests who have not answered get none (the answer row is the call). The nav's 📣 steps aside while the button is Share.
- **The organizer chases answers.** From anyone's sheet he answers for them (marked 📞) and nudges just them (📣 hands the share sheet their personal link). Once the dates are set his 🎫 sits on every other traveler's row (never a host's, never his own); marking someone who is out or hasn't answered booked, or taking a 🎫 away, takes a confirming tap (the 🎫 pulses with ✓ or ↩, and any other tap, a closed sheet or 6 seconds put it back), and records them as in first (📞). His 📣 pulses while anyone hasn't answered, or once the plan has moved since he last shared, and stops the moment he shares. His token phone shows prices only once a leg has a cached fare (no column of $—).
- **One person's sheet.** Their airport cells where the destination is one of the Worker's hub pairs (Peoria: PIA | ORD; New York: LGA | JFK; nowhere else), each change redrawing their flight link (one multi-city search) and bar at once; where they fly from (🛫 PIA +1 ✎, dated or not; the field opens selected, any 3 letters; clearing it goes back home); their note; their flight link (or Flighty once booked); 🎫 to take back my own booking (two taps).
- **Notes.** A person writes their own note (📝＋ beside my face once I have answered), or the organizer writes it for them (📞): ≤20 words, saved with ✓ or when the sheet closes, inside one complete answer (📝✓). Everyone else reads it (an 8-word preview on the sheet, the whole note in P-note); someone else's note opens to read on the organizer's phone too, and ✎ makes it a field. A longer v1 note opens at its first 20 words with ⚠, and replacing it takes a second ⌄.
- **P-stage** names the five stages (a picture of where the trip is, not a menu) and holds ⭐ (pin the trip in my list) and 🗄 (hide it on this phone only); the stage button is named by the stage.
- 📍 on a trip opens the Map, and the phone's Back comes back to the trip.
- A long press names the glyphs a finger is on, never one hidden under the sticky button bar, the nav or a top row.
- `scripts/trip-model.js` adds `whoAmI` (who this phone is on a trip: what it remembers, a hint, a preselected name), `primaryAction` (the one rule) and `bookToggle` (the organizer's 🎫 on another row).
- Tests: `test-trip-model` (+19: who this phone is in every case, including two "Sam Lee"s, a v1 "Me" and a nudge link on a phone that is someone else here; the primary rule for every role and stage; the organizer's 🎫; each write the trip page makes, through the real Worker, keeping her days, note and origin; a Done trip that still takes answers and a paid one that is closed), `test-app` (+75, against the real Worker: the 3-tap and 2-tap answers counted by the actions that ran, a hint against a remembered face and against a profile, a v1 "Me", the list-link trip's preselected face and its card, the join request, its pending tile and P-joinfwd, labelled answers that are never pre-filled and a host's unconfirmed In, marks seen alike by guest and organizer, no price and one link for a guest, no $— before a fare, no dead control on someone else's sheet, 📍 for every role, the primary for every role, proxy answers, nudges (and a guest's group link), 🎫 and Out with their confirming taps, the share pulse, notes and their 📞, airport cells only on hub pairs redrawing at once, a stale phone's proxy answer and two racing taps, storage that refuses writes (a link through the router to a trip new to that phone, a full quota with another trip listed, every access throwing, a trip the Worker does not have), ↻ resending a failed answer, 📞 taken over, closed and Done trips, P-stage), `test-trust` (no share-sheet payload carries a secret, now with the nudge and the join request), `test-words` (every trip page and each of its sheets — every person, their notes, P-stage, P-face with the longest join name, P-joinfwd — on eight phones at every width, with long-press in each kind of sheet; the 3-tap and 2-tap answers and every new control with real, hit-tested clicks; a forwarded nudge link on Dad's phone; a host's dotted In; all 8 long-named sheets as the organizer and a note typed past 20 words; a set trip's 🎫 marks and Book; a paid trip's 🏁; the 📣 pulse stopping at once) and `test-viewport` (the trip page's states and sheets at 360/390/430, light and dark).

### Added (PIA-136) — create and edit: the one create path (in `app.html`, still not linked from anywhere)
- **One way to start a trip, in three steps, with pictures instead of prose.** ＋ opens a sheet: a picture (13 scenes; it follows the name until one is tapped), a name, and an optional destination (any 3 letters: one the app doesn't know is marked 📍⚠ and never blocks; an idea may have no place yet), with up to three recent places as chips. Then the people. Then plan dates (tap start, tap end, 📌 an optional event day) or a rough ⟦window⟧ with 🌙 nights, on one date grid that opens on next month, with holiday chips. Dates are optional. Create saves the trip to the Worker, keeps its edit key on this phone in v1's format, makes my 🙋 face me on it (and my profile), and opens it.
- **Nothing comes from hidden state.** The sheet always starts empty (no name, no place, no dates), whatever trip is open behind it. The people start from a group you can see as a pressed chip: 👪 the family on the organizer's token phone (date-aware: Anjo at LGA from 9/1, re-resolved against the departure at Create), else the people of the trip added to this phone last, with 🙋 me from my profile. Other phones never see 👪; they get the groups of trips they have opened.
- **People: faces, never duplicates.** Each person is a face (unique within the trip; a tap cycles to the next free one), a name (≤3 words), a home airport and ×N. The first person added to an empty sheet is 🙋 me; the sheet will not go on without a 🙋 (the 🙋 column pulses) or with a person named "Me" or an airport code cut short. Up to 8 people. Member codes never change, so answers survive every edit.
- **A failed Create keeps everything.** Create shows ⚠ ↻ and the draft is kept (`pialax_ui_v1.draft`); ＋ reopens it at the dates, one tap from a retry, with 🗑 to start over instead. It is the only thing ＋ ever restores. A sheet closed by mistake before Create (⌄, a tap beside it, Back) stores nothing, but the toast's ↩ brings it back as it was for 5 seconds. A Create that lands after its sheet was closed and another opened lists the trip and leaves that other sheet alone.
- **The organizer can fix any trip (✎ on the trip page).** Name, picture and destination (the destination stays put while the dates are 🔒, or once the trip is closed); people (removing someone who already answered asks twice, because their answers go too; clearing a name never removes anyone); the caption; the organizer link for my own devices (v1's own link on the app's folder, never naming `app.html`: copied only, never handed to a share sheet, with "🔑⚠ Your devices only"); and 🗑 Drop. Changing a member's home airport or the destination resends every answered member's answer with the new flights, keeping their dates and notes. Not offered on an unmigrated v1 trip (P-migrate comes first).
- **A Save changes only what it changed.** Edits are rebuilt from a fresh read and send only this edit's own changes: a member it did not touch goes back exactly as they are, so a change made on another device meanwhile survives, someone added meanwhile stays (with their face: a new row gives up a face it shares with them), and a name already on the trip is never refused (only a typed one is held to 3 words), so nobody has to rename someone else to save an unrelated change. If the update lands but an answer it owes does not (a dropped connection), ⚠ ↻ sends just the owed answers. More people than a trip holds (a join request on a full trip, or someone added meanwhile) shows ⚠ 9/8, and Save waits until someone is removed.
- **Text is never lost silently.** A name stops at 12 words, a person at 3 and the caption at 20 (typing past simply stops; nothing already there is cut). A paste past the cap keeps the words that fit, with ⚠ beside the field. A keyboard still composing a word (predictive text, IME) is never interrupted: the cap applies when the word is done, and typing never rebuilds the field being typed in. A longer caption from v1 opens at its first 20 words with ⚠, and replacing it takes a second ⌄. A caption that fails to save says so and comes back to try again.
- **Drop asks once, and can be undone.** P-drop shows the trip with a red-outlined 🗑 Drop and a primary Keep. Dropping sends the trip to the shelf; the toast's ↩ (or the shelf card's) brings it back as it stood (still 🔒 if it was).
- **Join requests and v1 links.** A join request link (`?idea=<id>&add=<name>.<IATA>`, built by the model's `joinLink` for PIA-137's 🙋＋) opens the people editor on the organizer's phone with that person added, whatever `?tab=` it also names; one Save adds them (on a full trip: ⚠ 9/8 first). On any other phone it just opens the trip. A v1 read-only `?tripIdea=` link opens the create sheet filled with its place, dates or window and event day (never its price); its note is on the sheet as 📝 (⚠ when v1's longer text was cut to its first 20 words), which opens it to read, change or clear before Create, and Create posts exactly that. A broken link says "Link broken".
- **Screen readers** hear the create step ("New trip, step 2 of 3"), whose 🙋 each toggle is ("Me: Priya"), and a headcount's value ("Headcount 2").
- **The trip's own 📣.** The trip page's nav shares the guest link `/i/<id>` through the phone's share sheet (URL only) and records the plan it carried.
- `scripts/trip-model.js` adds `wordsIn`, `capTyped`, `fitTyped` (a paste under a word cap), `firstWords`, `cleanName` / `keepName`, `joinLink` / `parseJoin`, `legacyDraft` (v1's `?tripIdea=` payload, its note capped visibly), `groupPresets` (never from an unmigrated v1 trip, whose faces are only stand-ins) and `freeFace`; `createRequest` and `updateRequest` now keep faces unique within a trip without ever rewriting a kept member's label; `organizerEdit` takes the answers an earlier edit still owes (`opts.owed`).
- Tests: `test-trip-model` (+28: typed caps and pastes, names typed and kept, join links, v1 idea links with their notes cut visibly, groups never from a v1 trip, unique faces with kept members in either order, an airport-only change, an owed answer rebuilt and sent, an airport change and a removal through the real Worker), `test-app` (+83, against the real Worker: create from the token phone and from a fresh one, the Diwali job tap by tap with each step's state checked, the draft kept on a failed Create and its retry, past-dated drafts, unknown and missing places, windows, presets by role, 👪 on a phone whose today is 8/1, every edit including an airport-only change and members changed or added meanwhile, long names already on a trip, captions, an update that lands while its answer drops and then ↻, 9 of 8, the organizer link on a phone with a share sheet and byte for byte v1's, drop and ↩, join requests including a full trip and ?tab=map, v1 idea links built by v1's own encoder with their note shown, edited and cleared, screen-reader names, ↩ for a closed unsent create), `test-trust` (+1: no share-sheet payload ever carries the token or an edit key), `test-words` (the create path on every phone at every width with the longest names it accepts, P-edit and its parts on the organizer's trips and the 8-member trip, the spec's tap counts measured with real clicks — Diwali 13, Tahoe 19 — a failed Create, a join request and one on a full trip, a v1 link with its note, typing that never rebuilds the field, a composing keyboard, a paste cut with ⚠, 🔑 with a share sheet present, a long caption; busiest popup 20 words) and `test-viewport` (every create and edit sheet at 360/390/430, light and dark, plus ⚠ 9/8 and a v1 link's note).

### Added (PIA-135) — Trips › Ideas, the shared watchlist (in `app.html`, still not linked from anywhere)
- **Each trip card reads at a glance, live from the shared trip, the same on every phone.** The postcard has a tiny US map with a dot on the destination (a globe for a known place abroad, ? for an idea with no place or a code the app doesn't know). The date pill shows the event day (📌) and ⏳ the days to go, with a thin book-by bar under it that empties as the book-by day (21 days out) nears. ⏳ turns red once book-by has passed and someone still has to book, for the organizer and for a traveler who answered and hasn't booked. Faces show their answer shapes, with ● on anyone who answered since I last looked, then heads in (3/4) and the trip's stage disc, which every phone now shows. Cards sort ⭐ first, then by date, undated ideas last.
- **My own flight search is one tap from the list, answered or not.** ✈↗ opens my Google Flights search (from my home airport on the plan's dates until I say otherwise). A host sees 🏠, a booked traveler the Flighty hand-off, and an idea with no place Google Flights Explore.
- **The one total, only on the organizer's phone with the token.** Built from cached real fares (`pialax_fares_v2`) on the trips that phone organizes: $— before any search; outlined with the faces still unpriced when part of the sum is missing, including a traveler priced by only one leg of an open-jaw trip (so a half-priced total never reads as final); grey with 🔍 when a fare is a day old; 💵 once paid. A guest's card has no price at all.
- **Share a list of trips, chosen by group.** The list-share button (📣 over two cards) shows +n for the trips in my list that haven't gone out in a list yet, whoever organizes them. Its sheet groups trips by the people in them, pre-checks the largest group, and never lists past or dropped trips. 📣 Share hands the phone's share sheet one link: the app's address with `?l=<trip ids>&f=<my face>`. It carries no key, token or price. Without a share sheet the link is copied, or shown to copy by hand; trips count as shared only once the link has actually gone out or been copied.
- **Receiving a list takes one tap.** A list link no longer adds trips by itself. It opens a sheet with the sender's face and only the trips that are new on this phone (never a past or dropped one), read live from the Worker, and one ⤓ Save; the saved cards fly into the list. ⌄ saves nothing. If none are new, the sheet shows them dimmed with no button; if all are gone, it says "Trip not found". v1's `?w=` / `?wl=` share links open the same sheet. My own devices link still adds everything with no taps, and only a link that carries a key or the token counts as mine. Opening a single trip link still saves that trip with no taps.
- **The 🗄 shelf really collapses.** It holds past, dropped and hidden trips; folded, it is one row with a count and draws none of their cards. An undated idea never falls onto it by date. The organizer can bring a dropped trip back with ↩, as it stood: locked again if its dates were set, booked again with the amount paid if it was paid, otherwise back to an idea.
- **New answers are counted.** The Trips tab carries a numeral for trips waiting on my answer or holding answers I haven't seen; opening the trip clears it. A failed refresh still shows 📶⚠ and dims the stale cards with ◷, and Map and Calendar still show the empty picture while the list is empty.
- **Screen readers and keyboards.** Each group chip is named by its people, the list-share button's name includes the count, and focus stays on a trip toggle or chip when the list-share sheet redraws. A long press names the glyphs inside the two sheets too, and ⓘ explains the map dot, the globe, ? and the book-by bar.
- `scripts/trip-model.js` adds the pure helpers this needs: answer times (`answerTimes`, `newestAnswerAt`, `newAnswers`, `awaitsMe`), `bookByCue`, `togoCue`, `tripGroups`, `listLink`, and the US map projection (`mapXY`, d3's Albers USA with its Alaska and Hawaii insets, checked against d3 for every airport in the table). "Seen" now records the newest answer even when the Worker's 50-entry log has dropped it, in v1's format.
- Tests: `test-trip-model` (+19), `test-app` (+50: totals by role including a half-priced open-jaw traveler, hand-offs including an unanswered guest, the locator's states, sharing and what counts as shared, receiving, the router's devices rule, the shelf and ↩ of a proposed, a locked and a paid trip against the real Worker, both halves of the Trips numeral, the empty tabs), `test-words` (the new sheets and states within the word budgets; every card fits at 360px, including the widest date row the app can draw; the share sheet hands over the link only; the cards fly in after ⤓ Save; long-press inside the sheets; keyboard focus and chip names) and `test-viewport` (both sheets at 360/390/430, light and dark, the receiving sheet with ⤓ Save and with nothing new).

### Added (PIA-134) — the v2 app shell, `app.html`, not linked from anywhere yet
- **A new `app.html` beside v1.** Nothing links to it until the cutover (PIA-147); `pialax.html`, `pialax-mobile.html`, `index.html` and the Worker are unchanged, so the family keeps using v1.
  - Three labelled tabs (Trips, Map, Calendar) and no wordmark. Trips has an [Ideas | Family] switch once the phone holds two trips. A fresh open always lands on Trips › Ideas, and the trip opened last is the one Map and Calendar show.
  - The Trips list draws every trip this phone has opened, live from the shared trip record through the trip model: picture, place, plan dates, faces with answer shapes, heads in, and my own Google Flights (or Explore / Flighty) link one tap away. Past, dropped and hidden trips sit on a shelf. Family, the trip page, Map, Calendar and "new trip" are frames that later tickets fill.
  - Bottom sheets open one at a time, each announced by its own name, and close with ⌄, ‹ (back to the sheet below), Esc, the phone's Back or a tap on the dimmed area around them, never by themselves. Whatever was typed into ⚙ and not saved is still there when it opens again. While a sheet is open the screen behind it takes no taps or keyboard focus, and closing it puts focus back where it was. ⓘ explains every symbol drawn on the screen; a long press names the button or symbol under the finger (a card's faces, dates and stage included) without pressing it, and never names a whole bar or panel. ⚙ (organizer token, Worker address, and links for my own devices, with a "your devices only" warning) is always reachable; it refuses a Worker address the page is not allowed to reach, and a v1 address v2 cannot reach is left for v1 and not used.
  - The phone's Back on a trip page returns to the list (or to Map, if the trip was opened there). The address bar keeps the selected trip on Map and Calendar too (`?idea=<id>&tab=map|cal`), so a reload stays put.
  - Trips refresh from the Worker when the app opens, when it comes back to the front, and every minute while it is visible; a refresh that changes nothing redraws nothing. A failed refresh shows 📶⚠ and dims the cards; it never opens a sheet. A refresh whose request overlapped a save in any way is ignored, so it can never put back the trip as it was before the save. Saves show at once, re-read the trip before an organizer edit, and undo themselves if the Worker refuses; a save made of two requests whose second fails shows what the first one did save. Errors are shown from the Worker's error code, never its message text, and an error never covers an open sheet: it waits until that sheet closes. A link to a trip the Worker does not have says "Trip not found" as soon as that trip's own answer arrives, however slowly the other trips load.
  - Links: opening a trip link (`?idea=` or `/i/`) saves the trip to this phone's list and opens it; organizer and devices links save their keys and token, then disappear from the address bar (a mistyped or cut-off key or token disappears too, and punctuation pasted after a link is ignored); a list link (`?l=<id>.<id>…&f=<face>`) adds its trips. v1's `?w=` and `?wl=` share links are read once for their trips, and the v1 list on this phone is read once and never changed.
  - Storage shared with v1 (edit keys, who I am on each trip, seen answers, token, Worker address) is read and written in v1's exact formats, so both apps see the same thing. No control can delete or replace an edit key.
  - No sample or estimated fares, no seeded trips and no fare searches: the app talks only to the Worker's free `/idea` routes. Its CSP allows no outside script, style, font or image. System fonts, inline pictures, light and dark colours, 44px targets, no sideways scrolling at 360–430px.
- **The strict word rule, enforced.** New `test-words` suite (headless Chromium, in preflight; skips itself without Playwright) counts the words actually rendered on every screen (≤10) and popup (≤20) on fixture phones: eight members with long names, unknown airports, an idea with no place, a long title, the unmigrated v1 Thanksgiving trip, every trip on the shelf, a revealed token, long typed values, a failed refresh and a link to a missing trip. It also checks the tabs, sheets (closing, focus, the scrim, waiting errors), ⓘ against every symbol in the rendered text, long-press on each kind of labelled control and symbol on each phone, ⚙, links, Back on a trip page and the focus refresh.
- New `test-app` suite (in preflight, offline): the trip model inside `app.html` must match `scripts/trip-model.js` byte for byte; the router, the v1-format storage and the store are tested against the real Worker in-process, including every way a refresh can overlap a save. `test-trust` now fails if `app.html` contains a fare search or the token header, or sends the token anywhere. `test-viewport` gains `app.html` at 360/390/430 in light and dark. `scripts/harness.js` takes the app file as an argument. Preflight checks `app.html` for `console.log`, secrets and `<script>` balance, and `verify-sri.sh` checks its `integrity=` attributes (none yet) however the `src` is quoted; `test-app` runs that check offline so it gates.
- `CLAUDE.md` and `PIALAX_HQ.md` record the v2 decisions (D1–D5), the word rule, the build-and-cutover plan and the amended domain rules (estimates retired in v2; the ORD drive pivot and the date-aware family kept).

### Added (PIA-133) — v2 groundwork, not used by the app yet
- **One link builder for every hand-off.** `scripts/trip-model.js` now builds each person's Google Flights, Explore, Flighty and calendar links from the shared trip record, so a date, airport or party-size change can't leave a stale or wrong link. Every hand-off opens in a new tab.
  - A round trip opens one round-trip search. Flying into PIA and home from ORD opens one multi-city search, plus the two one-way searches PIALAX prices. Links search the whole nearby-airport set, book for the household's headcount, and never add an airline or nonstop filter.
  - Hosts, people flying from inside the destination's own area, and people who are out get no flight link. Neither does someone with no home airport, or dates that are missing, reversed or already started. An idea without a place offers Google Flights Explore, not prefilled. A dropped trip offers no flight link, calendar event, Explore or nudge.
  - Flighty shows only once that traveler is booked.
  - Add to calendar (Google or an .ics file): one all-day event over my own travel days (hosts, and a reversed range, get the plan), marked "?" and tentative until the dates are set or I've booked. The only link inside is the family /i/ link, never an edit key or token. A stray line break or control character in a title or city can't add a line to the event.
  - A nudge link goes only to someone who hasn't answered or said maybe, never to a host.
  - If the link encoder ever fails, links fall back to the plain-text search form, using only the phrasing that was checked live (one airport per side, never past dates).
- New `test-gflinks` suite (93 checks) runs in preflight, offline. It pins the five links checked live and the v2 sample links byte for byte, and decodes every link it builds. The eight v2 sample links still need one manual open in Google Flights before ship.

### Added (PIA-132) — v2 groundwork, not used by the app yet
- **One trip model for v2.** `scripts/trip-model.js` turns one shared trip record into everything a v2 screen will show: one place, one plan, one head count, one stage, everyone's dates, their Google Flights links and the one total. It runs offline with no clock, so every screen and every phone reads the same facts.
  - Each person's dates are their own where they set them, else the plan's. Moving the plan never rewrites dates someone set, and booked travelers keep the days they booked.
  - Hosts (home airport at the destination or in its metro area, like Mom & Dad for Peoria) count as in until they answer. They are never nudged and get no flight links or searches.
  - Totals use only real cached fares, each marked fresh, stale, unsearched or "no fares". A missing fare is never estimated, and no price is read from the trip record. The cheapest-week bars use the same pricing rule, so a bar and the trip total always agree.
  - The live v1 Thanksgiving trip reads safely: its stale 11/25 plan, frozen $704 and "Me" label are never shown as facts, and Ashwin's link keeps his own 11/20–11/29.
  - Answer, booking and organizer-edit builders never drop a date, note, pick or member, proven against the real Worker in tests. They never write a "Me" or faceless name or send a price with 🔒, and they build nothing the Worker would refuse (on a paid or dropped trip, reopen before an edit that needs answers).
  - A built-in table of 348 airports (from OurAirports). Any other 3-letter code still works, just without a city or map position.
- New `test-trip-model` suite (179 checks) runs in preflight, offline, with today pinned to 2026-10-17.

### Fixed (PIA-131) — shorter share links
- **"Share idea" link:** the ORD trip's link went from 900 characters to 208.
  - **Cause:** the old `?wl=` link encoded the trip twice, escaped it a third time, and sent every empty or derived field.
  - **Now:** the new `?w=` link is base64url with short keys. It contains no `%`, `=` or `+`.
- **Starter trips:** a shared starter trip sends only what you changed, not its own built-in notes. An untouched one is a 51-character link.
- **Linked trips:** a trip already shared with the family sends its short invite link instead.
- **Device routing:** links point to the site root, so each device opens its own phone or desktop page.
- **Message layout:**
  - Dates read like "Tue Dec 22 – Sat Dec 26", and the route shows the flight target.
  - The link sits alone on the last line.
- **Compatibility:** old `?wl=` links already sent still open. Every shared trip still goes through `sanitizeWatchlistItem`.

### Fixed (sprint review, before merge)
- **Security:**
  - Google's results link is normalised when parsed and refused on read if it carries quotes, backticks or backslashes, so it can't break out of an `href` on the planner cards.
- **Alert cron:**
  - Once a traveler's leg has departed, the remaining leg is no longer measured against the in + home target.
  - The per-run limit counts real searches only, so cached fares and departure reminders still run for every watch.
  - A group's sum uses only prices fetched in that run.
  - One failed email no longer loses the day's alert state.
  - Groups get one departure reminder each, and re-alert only after a further $10 drop.
- **Dashboard:**
  - "At your target" emails respect each trip's alert switch; the banner still shows, once a day.
  - A linked trip sends no server watch until its RSVP has loaded, instead of the old whole-family watch.
  - A second quick date tap now says "Saving…" instead of vanishing.
  - A flex or "Use X" write needs a fresh read of the RSVP, and an open sheet repaints afterwards.
  - Two pricing runs can't overlap and overshoot the session cap.
  - A round-trip traveler reads "flies a round trip — not compared" on the pickup timeline.

### Fixed (PIA-130) — needs `wrangler deploy`
- **`/alerts/status` needs the organizer token.** It used to answer anyone with the masked alert email, the watch count and the last run.
- **The alert cron now spends like the dashboard.**
  - It goes through the same KV fare cache, so a fare priced today costs 0.
  - Misses go through the same daily serp cap; the run stops there and records `capped`.
  - Every cron email goes through the daily email cap.
  - `ALERT_CRON_MAX` defaults to 4, one Thanksgiving re-price.
- **Server alert watches for a linked trip are per leg.** Each leg's baseline is its own live fare, never the whole-family estimate that made a single fare look like a big drop. A traveler's legs share a `group` and their `target`, so the cron sends **one** "at your target" email per traveler per day when in + home together reach it.
- `verify-live.sh` A1 also checks that `/alerts/status` without a token returns 401 (free).
- Turning server alerts on (cron slot, ALERTS KV, `RESEND_API_KEY`) stays with PIA-128.

### Added (PIA-129)
- **Family total board** at the top of a linked trip's Flight Breakdown. It shows one number for everyone still to book, e.g. "$721 still to book · 2 of 2 travelers".
  - Each traveler's in + home fare.
  - The **cheapest live fares already seen** within ±2 days or at a nearby airport, with what it takes ("→ $300 with Mon 25 in") and the saving.
  - Booked vs not; booking someone moves them to ✓ Booked and out of the total.
- A saving is only claimed between live fares. With any estimate, the total reads "~$…" and is labelled "~ = includes estimates".

### Added (PIA-127) — phone
- **From open app to Google Flights in 2 taps.** A linked Thanksgiving card on the Trips tab has a **✈️ Book flights** button. It opens a bottom sheet with each traveler's ✈️ In / 🏠 Home links, the book-by countdown, fare confidence and Mark booked ✓.
- **Trip bar.** On a linked trip's Family tab, the Get Live Fares slot becomes **📅 Flex · 📍 Nearby · ⟳ Refresh (N) · ✈️ Book**.
  - There is no third bottom bar.
  - Refresh is the same spend-gated Get Live Fares, and it reads "Fresh ✓" when every leg has a live fare.
  - 📍 Nearby shows once the Worker supports it.
  - **Flex** opens a "Dates & airports" sheet with every traveler's ±2-day strip and nearby toggle, instead of the full RSVP calendar.
- Repaints and live refreshes keep your scroll position. Every target is ≥44px and nothing scrolls sideways at 360, 390 or 430px.

### Added (PIA-125)
- **One-tap nudge for day-old fares.** When you open the app or come back to it, with the organizer token set, it counts the watched legs whose fare is over a day old. It offers "N fares are a day old · Worker searches today 7/30 · **Refresh (N searches)**", at most 4 per tap.
  - Nothing is searched until you tap; searches are still never automatic.
  - ✕ hides the banner for this visit.
  - Without a token it stays silent.
- **Target alerts in the app.** After any pricing, a traveler at or under their target gets one alert per day: a banner ("🎯 At your target: Ashwin $389 ≤ $420"), a dot on the tab icon and "(1)" in the tab title.
  - The alert is queued in the existing outbox, so it is emailed once Resend is set up.
  - Desktop now has a tab icon too.
  - There is no browser notification, because nothing runs in the background.

### Fixed (PIA-125)
- Hitting the Worker's own daily search cap (a 429 `daily_cap`) used to lock live fares on the device for the **rest of the month**. It now locks only until tomorrow (UTC), with a toast that says so. A SerpAPI 429 still locks the month.

### Added (PIA-126)
- **Pickup timeline** at the top of a linked trip's Flight Breakdown. It shows when each traveler lands (in-leg) and leaves (home-leg), using the times already cached with each live fare.
  - It shows the gap and reads "✓ within 2h · one trip" when everyone uses the same airport within two hours, "different airports — two trips", or "6h 20m apart". Gaps across midnight count correctly.
  - When they aren't aligned, it shows the **cheapest pair within 2h** from the cached offers (e.g. "AA 4 7:10a + UA 6 8:00a = $290 (+$20)"). This never needs another search.
  - A traveler without a live fare reads "waiting on Anjo’s live fare".

### Added (PIA-122) — needs `wrangler deploy`
- **Nearby airports in one search.** "📍 Also try BUR · LGB · ONT · SNA" on a traveler's route card searches their whole metro in the same one search per leg: LA for Ashwin, NYC (JFK/EWR) for Anjo.
  - The traveler's own airport keeps its own fare.
  - The winning airport shows with its saving ("BUR $190 · saves $30 vs LAX"); both prices come from that one search.
  - **Use BUR** changes that traveler's RSVP origin, and their book links follow.
  - The metro follows Anjo's date-aware airport (LGA from Sep 1).
- **Worker:**
  - `/search` takes up to 5 comma-joined codes in `departure_id`/`arrival_id`, as a set: sorted and de-duplicated in the cache key, so a single code is unchanged and old cache entries survive.
  - Anything else is still a 400 with no spend.
  - `/account` reports `features.multi_airport`. The dashboard sends a comma only once it sees that, so an older Worker never gets one.
- `verify-live.sh` A3 now makes its one search a nearby search (`LAX,BUR`, re-ordered for the HIT) and checks the new `/account` feature flag.

### Added (PIA-124)
- **Book-now handoff:**
  - Once a leg has a live fare, its ✈️ In / 🏠 Home button opens Google Flights' own link for that exact search (1 adult). Otherwise the search is narrowed to that fare: "nonstop", "on American".
  - The flight behind the price is spelled out next to it, so you can find it: "American AA 1 + AA 2 · 6:00a→3:40p · 1 stop".
  - The planner's own Google Flights links follow the same rule.
- **Fare confidence** above each traveler's Book buttons, by fare age: "solid" (≤6h), "recheck on Google Flights before paying" (6–24h), "estimate — search first", or "stale — refresh first".
- **Book-by countdown:** Thanksgiving defaults to **Sun Nov 1**. A confirmed "decision deadline" note wins; otherwise it's three weeks before leaving. It turns amber within 7 days and red once passed.
- **Mark booked ✓** on the trip card and route card (organizer device) flips that traveler's RSVP row; they then drop off the fare watch and Get Live Fares.
- Not built: "Open on airline.com". It needs a second, paid SerpAPI call (`booking_token`).

### Added (PIA-123)
- **Fare watch per traveler.** On a linked trip, each traveler's route card and the trip's Trips card show:
  - their in + home price;
  - a **🎯 target** you can type in place;
  - the change since the last check, plus the fare's age ("checked 5h ago").
- **Each leg** also shows a sparkline and Google's own verdict (for example "high price · typical $180–$260") when Google provides one.
- **Targets live on this device.** A trip-wide "target per traveler" carries over to everyone, a traveler's own target wins, and a confirmed "target price" note on the Trips card seeds it.
- **Fare age is honest.** A Worker cache hit keeps its original fetch time. After 24 hours the leg greys out and reads "Last $212 · 1d ago · stale", with "Tap to refresh (1 search)" when a token is set. A stale price is never shown as current.
- **One "N ago" format everywhere** (fare pills, the last-error chip, the /account sync line): just now, Nm, Nh, Nd.

### Added (PIA-121)
- **One-way pricing for linked trips:** a trip linked to a family RSVP is now priced the way each traveler books it. For Peoria that's in to PIA plus home from ORD, as two one-ways. Before, it was priced as a round trip that nobody books.
  - Each Flight Breakdown card shows that traveler's in + home total, with `~$` on estimates.
  - The cost panel and the "At a glance" total use the same number.
- **±day flex strip** under each leg, showing the day before and after the plan date (tap "±2 days" for more).
  - Each chip shows a live fare from the 24h cache or a `~$` day-of-week estimate. Showing the strip never spends a search.
  - Tapping a day moves only that traveler's RSVP arrive or leave date and keeps the rest of their answer. A day that would put leaving before arriving can't be tapped.
  - "Price these (N searches)" prices the visible days, at most 4 per tap.
- **Get Live Fares on a linked trip** prices those legs (at most 4 searches per tap), and its label shows how many searches the next tap will spend.
- Live fares now also keep the cheapest few offers (with times and airports), Google's price insights and Google's own results link. The parser is shared by both dashboards.

### Changed (PIA-120)
- A trip linked to a family RSVP now has one place for its dates and one place to book from:
  - **Dates:** the Family tab's trip card shows the RSVP plan dates. The organizer changes them with
    **✎ Dates**, which opens the RSVP's plan calendar. The Family math follows the plan, "Step 2 ·
    Choose Dates" is hidden, and the date strip reads "Plan: … · from RSVP" instead of offering
    📅 pickers.
  - **Booking:** a **✈️ Book flights** list on the trip card gives each traveler their own dates and
    the same In/Home searches as the RSVP sheet (Peoria: in PIA, home ORD). Booked travelers show ✓.
  - **Flight Breakdown cards:** each card opens those same searches and shows "📋 RSVP" instead of
    "✱ custom".
- Copy: the booking nudge now matches the real buttons, and the empty state says "Calendar" tab.

## [1.3.1] — 2026-10-04

Fixes: exact daily spend caps (`SpendMeter` Durable Object, PIA-118). Saving the organizer token no
longer drops the dashboard to mock data, and Advanced shows whether the token works (PIA-119).
`verify-live.sh` passed 22/22 against Worker `0acad2c7` (merge `38f814e`).

### Fixed (PIA-119)
- Advanced → Admin: the Proxy URL box now shows the Worker in use instead of a blank placeholder.
  Tapping the button to save a token no longer drops the dashboard to Mock Data. A blank box now
  means "keep the built-in Worker"; only ✕ Disconnect turns live fares off.
- The button is now **Save & connect**, with a status line under the token: "No token yet",
  "✗ Token rejected" or "✓ Token accepted · Worker searches today 1/30".

### Fixed (PIA-118)
- The daily spend caps are now exact. A new `SpendMeter` Durable Object checks and reserves each
  paid call one at a time. Before, a burst of parallel calls all read the same KV counter, so 10
  calls against a cap of 3 could all spend.
- `/account` (organizer token required) now reports today's Worker-side spend per kind:
  `spend: { serp: {used, cap}, extract, email, exact }`.
- `wrangler.toml` adds the `SPEND_METER` binding and migration `v2`. Without the binding, the old
  KV counter still works and reports `exact: false`.

## [1.3.0] — 2026-10-04

Book from the RSVP, and the trust gate.
- **RSVP → booking:**
  - Book for these dates / Find my flight;
  - who's booked;
  - per-leg airports (PIA or ORD, LGA or JFK);
  - weekdays on every date;
  - a calmer RSVP screen and buttons;
  - the Family tab leads with the linked trip.
- **Trust (PIA-114…117):**
  - Paid Worker routes need the organizer token and stop at daily caps.
  - Cached fares keep their real age and don't spend quota.
  - Shared-trip writes are serialized by the `IdeaRoom` Durable Object.
  - Gate: `test-trust.sh` runs in preflight, and `verify-live.sh` passed 21/21 against the deployed
    Worker on 2026-10-04 (merge `0248830`).
- **Versioning note:** PIA-114 changes the Worker API, which `CHANGELOG` rules would call MAJOR.
  It ships as a minor because the API's only client, the dashboards on Pages, changed in the same
  merge, and no shared link, URL param or localStorage key breaks.

### Added (PIA-117) — trust release gate
- `scripts/test-trust.sh` (48 checks, in preflight) proves the three trust outcomes:
  - **A1:** every paid route, called without the token (or with a wrong one, a spoofed Origin, a
    cache-buster, `no_cache`, an unknown path or past the daily cap), makes zero upstream calls.
  - **A2:** three racing answers, a "booked" and an organizer edit all survive through
    `IdeaRoom`. A control run shows the old KV path losing 4 of 5.
  - **A3:** a repeated search is a HIT with the original `X-Fetched-At` and 1 upstream call, and
    both dashboards keep that age and don't count quota.
- `scripts/test-trip-idea.sh`: the Trip Idea Builder suite now actually runs in preflight.
- `scripts/verify-live.sh`: A1, A2 and A3 against the deployed Worker, with the token taken from
  `PIALAX_TOKEN` only. It aborts before spending anything if the Worker isn't gated.

### Fixed (PIA-116)
- Family answers no longer overwrite each other. Every write to a shared trip (an RSVP, "I booked
  ✓", an organizer edit or decision) now goes through that trip's own Durable Object (`IdeaRoom`),
  one change at a time, and is applied to the latest version. Before, two people answering at the
  same moment could erase one answer.
- Existing trips move into their room the first time they're touched. The room writes through to
  KV, so link previews keep working. Responses report `serialized: true`.
- `wrangler.toml` adds the `IDEA_ROOM` binding and a SQLite-class migration (Workers Free plan).

### Fixed (PIA-115)
- Fares now show their real age. A fare served from the Worker cache keeps its original fetch
  time (`X-Fetched-At`), so it reads "🟡 CACHED 5h ago" instead of "🟢 LIVE 1m ago". LIVE now means
  fetched within the last hour.
- Cache hits no longer count against the monthly SerpAPI quota, the per-session cap or the "live
  calls" counter. Only a real upstream search spends.
- The 24h client cache now runs from when the fare was fetched, not from when it arrived.

### Security (PIA-114) — breaking Worker API
- Paid Worker routes now require the organizer token (`X-Pialax-Token`, checked against the
  `PROXY_TOKEN` secret) and stop at server-side daily caps (`SERP_DAILY_CAP` 30,
  `EXTRACT_DAILY_CAP` 20, `EMAIL_DAILY_CAP` 10 → 429). The gated routes are fare search, the account
  check, `/extract`, `/alert` and `/alerts/sync`. Without the token they return 401 and spend nothing.
- Fare search moves to `GET /search` and accepts only allowlisted, validated params. `no_cache`
  and unknown params get 400, and an unknown path gets 404 instead of a SerpAPI call. The
  account check moves to `GET /account` and returns only quota fields.
- Fares are cached in KV for 24h, keyed by the canonical params, and stored with their original
  fetch time (`X-Proxy-Cache`, `X-Fetched-At`).
- Client: there's a new **Organizer token** field under Advanced. The organizer link (`#k=…&t=…`)
  carries the token to your other devices and strips it from the address bar. Without a token,
  fares stay as samples and show a one-time hint. Family links never carry the token.

### Changed (PIA-113)
- iPhone Family tab, opened from a trip with a family RSVP: it now leads with the trip, e.g.
  "🦃 Thanksgiving · Fri Nov 20 – Sun Nov 29 · All 3 in", with **👥 Open RSVP** and **Planner ▸**.
  Step 1 (mode, holiday quick-picks, home airport) stays folded until you tap Planner. Cheapest
  week and the fairness ledger become one-line drawers, and the "Last trip" chip and helper text
  hide. Fares, the cost split and Get Live Fares stay up front.

### Changed (PIA-112)
- The RSVP screen is calmer:
  - **Header:** one title line, then one plan line ("Plan Fri Nov 20 – Sun Nov 29 · ≈ $704" for
    the organizer, "Late Nov · pick your own dates" for family).
  - **Notes:** clipped to two lines; tap to expand. "Fare not priced yet" and the duplicate title
    card are gone.
  - **Status:** one line ("All 3 in · 1 of 2 booked").
  - **Folded:** the answers list ("Answers & notes") and the organizer tools (Nudge, Hold,
    Organizer link, Choose / Drop) start collapsed.
- Organizer: **✎** next to the plan dates opens the calendar to fix the proposal's dates (e.g. from
  the old Nov 25 to Fri Nov 20 – Sun Nov 29) and saves them to the shared trip.

### Added (PIA-111) — needs `wrangler deploy`
- Each traveler picks their own airports on their RSVP card: **In [PIA][ORD]** and
  **Home [PIA][ORD]**. One tap saves it. The same airport both ways gives one "Round trip · ORD ↗"
  search; different airports give "✈️ In PIA ↗" and "🏠 Home ORD ↗". The Book panel and the Trips
  card's per-person links follow each person's picks. The default stays in PIA, home ORD.
- The Worker stores the picks (`arrive_at` / `leave_from`), limited to the destination's hub
  airports (PIA/ORD, LGA/JFK), and keeps them when someone changes their answer or marks booked.
  The toggles appear once the Worker supports them.

### Changed (PIA-110)
- Dates show the weekday: "Fri Nov 20 – Sun Nov 29". This applies on the RSVP (window, answers,
  calendar range, Book panel), the Trips card's per-person links and the Family tab's date pills.
  The day strip has a weekday row, with weekends highlighted.

### Changed (PIA-109)
- Thanksgiving plan (Dad wants the Peoria parade): fly in direct to **PIA Fri Nov 20**, fly home
  from **ORD Sun Nov 29**, booked as two one-ways. The Trips card's flight links are now per
  traveler: "Outbound · LAX → PIA" (Nov 20) and "Return · ORD → LAX" (Nov 29), and the same for
  Anjo.
- RSVP for Peoria trips: the primary search is now **In PIA ↗ + Home ORD ↗** (one-ways on each
  person's own dates), on the Book panel and on "✈️ Fly in · PIA / 🏠 Fly home · ORD".
  Round trips into PIA or ORD remain as a one-line fallback.
- A device that saved the old Nov 25 start picks up Nov 20.

### Changed (PIA-108)
- Flight searches cover the whole hub. Peoria trips give every traveler two buttons, **PIA ↗**
  and **ORD ↗**, for flying into O'Hare and driving. Both use that person's own dates. New York
  works the same way (LGA ↔ JFK). "Find my flight · PIA" also offers "or ORD ↗".

### Changed (PIA-107)
- A trip linked to a family RSVP now leads with two buttons instead of eight:
  - **👥 Family RSVP** opens answers, the overlap, "Book for these dates" and organizer tools;
  - **📤 Share** says what it will send: "Share invite", "Nudge 1 waiting" or "Nudge 2 to book".
- Open, each person's Google Flights search, Add to calendar, Hold the dates and Organizer link
  move under **More actions**. The Google Flights help text is gone for these trips, since the
  searches live in the RSVP's Book panel.

### Added (PIA-106) — needs `wrangler deploy`
- Who's booked: after searching, each person taps **I booked ✓**. Everyone then sees "✈️ booked"
  on their row, their days turn green on the strip, and the page says "✈️ 1 of 2 booked". The
  Trips card chip adds "· ✈️ N booked".
- The organizer can **Mark booked** for anyone in the Book list (e.g. after booking for Mom &
  Dad). Once everyone has answered, **Nudge** asks the people who haven't booked yet
  ("Anjo, have you booked?").
- Changing an answer keeps "booked"; answering "out" clears it. Nothing booking-related appears
  until the Worker supports it.

### Added (PIA-105)
- RSVP → booking: under the family window, **✈️ Book for these dates** opens one Google Flights
  search per traveler, from their airport, on their own dates, for their own seats. Hosts are
  skipped. Searching one traveler at a time usually shows the lowest fare.
- Each family member's answer card has **✈️ Find my flight** for their own search.

## [1.2.0] — 2026-10-03

iPhone UI and family RSVP.
- **iPhone UI:** instant Trips, app shell, Trip Idea Builder above the tab bar, smooth map and clear labels.
- **Family RSVP:**
  - a page of its own for family members, and each phone remembers who is answering;
  - a calendar that opens on the trip's month, plus the best-overlap window;
  - organizer tools ("answer for", portable organizer link);
  - iMessage link previews, and prices withheld from family members by the Worker (deployed as version `2999c587`).

### Added (PIA-104) — needs `wrangler deploy`
- RSVP links get a real iMessage preview. The Worker serves `/i/<id>`:
  - chat-app link fetchers get "🦃 Thanksgiving at home — Peoria · Late Nov · Tap to say in /
    maybe / out and pick your dates", with no price and no exact dates, instead of
    "PIALAX — Family Flight Dashboard";
  - people tapping it go straight to the RSVP page.
- Prices are now withheld by the Worker, not just hidden on screen. Family members' requests get
  no fares; only requests carrying the organizer's key (`X-Idea-Key`) do. A device whose
  organizer key doesn't match is shown the family view.
- Safe before deploy: the app keeps sharing its own `?idea=` link and never sends the key header
  until the Worker announces the new features.

### Fixed (PIA-104)
- Worker: RSVP status and decision stage checks no longer accept `Object.prototype` names such
  as "toString".

### Added (PIA-103)
- Organizer: every family row on the RSVP has "✎ Answer for". When someone just texts "In",
  record it for them, e.g. "Save for Mom & Dad". It's tagged "(entered by Ashwin)" and doesn't
  change who your own phone answers as. Hosts who confirmed read "🏠 Hosting — confirmed".
- "🔑 Copy organizer link" (RSVP page and Trips card) lets you manage the trip from another
  phone or computer. The key travels in the link's `#k=` part, which never reaches a server or a
  link preview. It's removed from the address bar once saved, and it's only for you, not the
  family.

### Added (PIA-102)
- The RSVP shows when the family is actually together. With full overlap it says "Everyone's
  there Nov 26–29". Otherwise it shows the days most people are there and who's missing why:
  "Best window Nov 24–28 · 2 of 3 there (Kiran: here Nov 29–30)".
- A day strip under it has one row per person across the answered days, with hosts as a full
  🏠 bar and the best window outlined. Everyone sees it.
- Organizer: "📅 Hold Nov 26–29" puts the family window on the calendar, replacing the hold for
  the proposed dates. The organizer's header now reads "Proposed Nov 25–29" instead of raw dates.

### Added (PIA-101)
- RSVP dates are picked on a month calendar that opens on the trip's month (November for
  Thanksgiving) with nothing preselected. Tap the day you'd arrive, then the day you'd leave
  ("Nov 26–30 · 4 nights"). Past days are greyed out, and dots under a day show how many others
  already said they're there. It replaces the two date boxes, whose iPhone picker opened on
  today's month.

### Added (PIA-099, PIA-100)
- Family members who open an RSVP link get the RSVP as their whole page: no dashboard, settings,
  trips or close button behind it. "Open full PIALAX" at the bottom is the way out. The organizer's
  device (it holds the edit key) still opens it over the dashboard, with exact dates and the cost.
- "Who are you?" is a row of names to tap, and the phone remembers it. Next time the link opens
  straight to "Your answer · Anjo — ✅ In · here Nov 26–30 · from LGA" with **Change my answer**.
  Changing prefills the earlier answer. "Not Anjo?" forgets the name on that phone.
- Hosts (Mom & Dad for Peoria) get "🏠 hosting at home — no flights or dates needed" and a
  **Confirm we're hosting** button. Family members see the organizer as "Ashwin", not "Me".
- **Send my answer** sits in the sticky footer, so it's always on screen.
- An RSVP-only link no longer counts as a shared trip link, so the organizer's saved home and
  dates aren't skipped when they open their own link.

### Changed (PIA-098)
- RSVP invites and nudges no longer include a price or exact dates. They give a rough time
  ("🦃 Thanksgiving at home — Peoria · late Nov. Come and go on your own dates — tap to say
  in / maybe / out and when you’d be there:"), since each person can arrive and leave on their own days.
- The RSVP page now shows guests "Late Nov · pick your own dates" with empty arrive/leave fields.
  The organizer (the device holding the edit key) still sees the exact proposal dates, the family
  cost and prefilled dates.

### Changed (PIA-091)
- iPhone map labels no longer overlap. Airport codes, city names, fare tags and the PIA → ORD
  drive badge are placed together, clear of each other, of every labelled airport and of the
  focus chip. A label moved away from its spot gets a thin leader line back. When two-line fare
  tags can't sit by their routes (every phone width on the Thanksgiving map), all tags switch to
  one line ("≈ $342 RT") in the traveler's colour, and the badge shortens to "🚗 drive".
  Map text is now at least 11px (some was 8px).
- A tap goes to the nearest airport within 30px. Tapping the PIA dot no longer picks ORD (their
  tap circles overlapped), and LGA vs JFK follow the side tapped. Each airport is still a keyboard
  target, with a focus ring.
- Solo map: the in-map price box (8px text) is gone. Its best-weekend price now shows in the
  route list under the map.
- Light mode: the meetup hub and the picked destination were white on the light map; they now
  use the hub colour, so they show in both themes.

### Fixed (PIA-091)
- Opening the map from a New York (LGA/JFK) trip idea focused PIA/ORD instead of New York.
  Desktop has the same fix.

### Changed (PIA-090)
- iPhone map renders smoothly: it opens at its final size (no jump), re-fits correctly after
  rotating (it used to end up mis-sized and shrink ~7% after landscape → portrait), and price
  updates or the browser toolbar collapsing no longer rebuild the whole map. Redraws are
  coalesced to one per frame and skipped while the Map tab is hidden.

### Fixed (PIA-087)
- iPhone: the Trip Idea Builder now opens above the tab bar. Before, the tab bar covered its
  footer — on an iPhone SE "Find recommendations" couldn't be tapped at all. The footer puts
  the main action first at full width with the rest two-up (three-up in landscape) at 44px,
  respects the home-indicator and notch insets, the page behind no longer scrolls, the ✕ is a
  44px target, and it also goes full-screen in landscape.

### Fixed (PIA-086)
- iPhone shell: status bar / browser chrome follow the app colours (theme-color, color-scheme),
  booking numbers no longer turn into phone links, Home Screen launch is full-screen, and the
  missing tab icon is added. Toasts sit just above the tab bar (not mid-screen), wrap long
  messages, move to the top while a full-screen sheet is open, and no longer get cut short by
  an older timer. In landscape the tab bar and fare button line up with the content column, and
  the phone layouts (hub cards, route picker) apply to landscape phones too. The "sample fares"
  notice shows on Trips only (real quota warnings stay on every tab).

### Fixed (PIA-084)
- iPhone: Trips paints immediately instead of showing "Loading…" for 4–6s while map borders
  download; a tab tapped during startup is no longer overridden; inline-button globals exist
  as soon as the page loads. Map-border downloads give up after 4s and use the offline outline
  (desktop gets the same timeout).

### Added (PIA-083)
- One family trip, staggered arrivals: each person's RSVP has **I'd arrive / I'd leave** (prefilled
  with the trip dates). Their Google Flights link on the card uses their own dates
  ("Me (Nov 21–29) · LAX ⇄ PIA", "Anjo (Nov 24–29) · LGA ⇄ PIA"), Family Plan prices them on their
  own dates, and the estimate at "choose" re-prices each traveler on their dates.
- Hosts (members whose home airport is the destination — Mom & Dad for PIA) show "🏠 Hosting",
  skip the travel fields, and are never counted as waiting or nudged.
- The RSVP summary says when everyone overlaps ("everyone's there Nov 24–29").

### Changed (PIA-082)
- Trip Ideas: new **🦃 Thanksgiving at home — Peoria** card (PIA, Nov 25–29, Mom & Dad host) as the
  family RSVP test, with a flight search each for Ashwin (LAX) and Anjo (LGA). The Cary baby shower
  is postponed and archived to history; old saved "planning" state can't reopen it.

### Fixed (PIA-081)
- The organizer no longer shows as "waiting" on their own idea: creating a shared idea answers
  "in" for "Me" automatically (not counted as news, doesn't make the idea "answered"), and nudges
  never name the organizer.

### Added (PIA-080)
- Marking a linked Trip Ideas card "booked" (on the organizer's device) asks once for the whole-trip
  total and records it on the shared idea — choosing the proposal first if needed — so the decision
  log fills without reopening the builder. Blank skips; other devices just get a reminder.

### Added (PIA-079)
- The trip assistant reads RSVP answers: on linked cards, family members become companions
  (in → confirmed, maybe / no answer → tentative, out → out; the organizer is excluded), so its
  decision says "Confirm Anjo before booking" from real answers. Cards show "● new" when answers
  arrived since the organizer last opened them.

### Added (PIA-078)
- RSVP links go where the family talks: on phones "Share proposal" / "Ask the family" open the native
  share sheet (iMessage etc.) with "Cary shower trip Nov 6–9 — whole family ≈ $1,116. Are you in?";
  elsewhere the same text + link is copied. "📣 Nudge N waiting" names who hasn't answered.
  "📅 Hold the dates" downloads a calendar event for the proposed dates with the RSVP link inside.

### Added (PIA-077)
- Family Plan uses the family's own answers: opening a linked Trip Ideas card applies in / maybe / out
  from the RSVP link (maybe = tentative), so "out" members drop out of the total. Per-person selectors
  become read-only "answered" / "waiting" labels, with a "switch to what-if" escape. Answers follow a
  person across a home move (JAX → LGA) and are never written into the `ms=` URL.

### Added (PIA-076)
- Trip Ideas cards link to shared ideas (`sharedIdeaId`): sharing from the builder saves the card
  (no duplicates) and links it; the card shows live RSVP counts ("2 in · 1 maybe · 1 waiting") and
  "See answers". Family cards without a link get "Ask the family", built from the card's dates/airport
  with a whole-family estimate.

## [1.1.0] — 2026-10-02

Group decisions: trip ideas are priced from real cached fares, shared as RSVP links each
traveler answers for themselves, and closed out with estimate vs actual cost. Live on the
Worker since `0a9a42b` (IDEAS KV namespace bound and deployed).

### Changed (PIA-074)
- `wrangler.toml`: cron triggers set to `[]`. The account is at the free plan's 5-cron limit, so the
  daily alert schedule could not attach; alerts stay off until a slot is freed and `ALERTS` is set up.

### Added (PIA-073)
- Decision log: shared ideas move proposed → answered → chosen → booked (or dropped). The organizer
  (edit key on their device) chooses the option, then records the actual total paid; the Worker
  stores estimate vs actual and the % difference. "Past family decisions" in the builder lists
  this device's ideas with the average actual-vs-estimate gap.
- Shared ideas carry a whole-family estimate (every hub's fare × its travelers, home base = $0);
  that — not one hub's fare — is what the actual total is compared with.

### Fixed (PIA-073)
- Mobile had no Trip Idea Builder dialog or button, so shared links (and RSVP links) opened
  nothing on phones. Markup now matches desktop.

### Added (PIA-072)
- "Share proposal" creates an RSVP link (`?idea=<id>`) when the Worker has `IDEAS`; each family
  member answers in / maybe / out with their airport, the dates that work and a note. The idea
  shows who's in, travelers confirmed, and the date window that works for everyone.
  Falls back to the read-only `?tripIdea=` link when shared storage isn't set up.

### Added (PIA-071)
- Worker: shared trip ideas in KV (`IDEAS` binding). `POST /idea` returns an unguessable id
  and a one-time organizer edit key (stored only as a SHA-256 hash); `GET /idea`,
  `POST /idea/respond` (RSVP per listed member), `POST /idea/update` (organizer only).
  Strict field allowlists, 1-year expiry, 501 `no_kv` when not configured.

### Added (PIA-070)
- Trip Idea results are priced from fares the dashboard already cached (24h dated cache, then
  planner `S.prices` when dates match), falling back to labelled sample fares. Zero SerpAPI calls.
- Each row = per-ticket fare from the hub's cheapest airport × that hub's travelers
  (PIA/ORD = 2); a real cached fare beats a cheaper estimate.
- Results summary says how many rows use cached fares vs estimates.

### Fixed (PIA-070)
- A route with no fare scored 100 for price (`Number(null)`); now scores 0 and shows "No fare yet".
- Google Flights handoff from the builder uses a real airport (e.g. `ORD`), not the hub key `PIA_ORD`.

## [1.0.0] — 2026-10-01

First tagged release: baseline of everything shipped through PIA-068.

### Fixed (PIA-068)
- Trip Idea Builder: destination-only searches default to the next 90 days instead of
  returning dateless results labelled "Exact dates".
- Trip Idea Builder: reject reversed dates, return-only searches and reversed windows;
  an open-ended window gets a 30-day end.
- Trip Idea Builder: "Latest departure" bounds the departure date, not the return.
- Trip Idea Builder: long windows are scored across their whole span, not their first 8 days.
- Trip Idea Builder: notes are kept through to watchlist saves and share links.
- `scripts/trip-idea-builder.js` re-synced with both HTML files; tests enforce the mirror.
- `verify-sri.sh` works on Linux (GNU base64 line wrap), so preflight no longer false-fails.

### Highlights already on main before tagging
- Trip Idea Builder with share links; direct destination/date search with flexible windows (PIA-067).
- Trip Ideas as the default home; USA-first map.
- Watchlist Google Flights handoffs that use each traveler's airport and flexible dates.
- RDU family event hub and shareable family trip proposals.
- Decision-oriented dashboard revamp; mobile full-screen trip sheet.
- Real fare alerts with email delivery and a daily server-side check (activation deferred).
- Family home-airport transitions (JAX → LGA/JFK), date-aware.
- Trip assistant: Worker `/extract`, decision engine, fare snapshots.
- Quota-safe SerpAPI fetching with a fail-closed lock and labelled estimates.
- Test harness (`scripts/test-*.js`) and preflight gate.
