# v2 acceptance review — PIA-145–147

PIA-144/145 established this acceptance contract. PIA-146 adds explicit migration;
PIA-147 implements entry cutover as a release candidate. See [RELEASE_V2.md](RELEASE_V2.md)
for the coverage disposition and pending actual-family launch checks.
The acceptance contract is the owner's posted PIA-140–145 checklist and the
repository's documented job/tap targets. The separate original “six asks” text
was not available; this review does not invent it or claim to verify its wording.

## Browser evidence and gate

`bash scripts/preflight.sh` runs the Node suites and `test-job-flows.sh`.
The latter must launch Chromium and complete every suite; an unavailable browser,
a skip, a timeout or a failing assertion blocks shipping. It serves the app over
loopback HTTP, so file-URL browser policy cannot silently remove coverage.
Per-suite logs and `report.json` are written under the printed evidence directory
(`PIALAX_TEST_REPORT_DIR` overrides its temporary default).

| Contract | Required evidence |
|---|---|
| PIA-140: one real-fare total, cost before spend, limits and shared cache | Existing app/trust/word/viewport cases; map destination cases; no guest prices; 4/tap and 8/visit, daily UTC and monthly reset checks |
| PIA-141: Thanksgiving S1, fixed dinner day, no estimated fare | Model and real-Worker browser S1 jobs; pinned event date; cached/current/week total agreement |
| PIA-142: people × trips, hosting counts, four columns at 360px | Full Family word/viewport jobs, role/answer cases and board model tests |
| PIA-143: exact SRI/data pins and useful fallback | Live security hashes plus verified-asset browser jobs, each library/data/digest failure, shared airport choices and destination-preview races |
| PIA-144: presence and double-bookings | Calendar browser jobs at all three widths/themes; every day checked against the shared record; inclusive overlap, headcount two, Maybe, cross-phone Out, person/Back and dated creation |
| PIA-145: bounded jobs and consistent facts | Full word jobs, Calendar, v2 viewport and map suites invoked by the required preflight gate |

The existing Diwali/Tahoe totals remain 13/19 taps: 11/17 in-app taps plus two
assumed native chat/Send steps, as their original assertions document. Browser
tests verify the actual share payload; they do not automate a phone's native
share sheet. Group-link RSVP remains three steps. Calendar adds one tap from a
trip/list to Calendar, one from a day to P-day, one from its face to P-person,
and one from P-day ＋ to the normal create flow with the selected date.

PIA-154 re-measured both: Diwali and Tahoe stay 13/19 (the new trip's Share is
its primary, one tap, as 📣 was). Paths it moved, each counted by `test-words`
with real clicks: the phone calendar is 3 taps (⋯ More, 📅 Calendar, 📅 Phone),
Edit and the caption 2 (⋯, the row); sharing a trip is 1 for the organizer (the
Share primary while someone waits, else the nav's share symbol) and 2 for a guest
(⋯, Share); nudging one waiting person 2 (their face, Share); locking the dates 1
once everyone answered ("🔒 Lock dates", ↩ in its toast), else 2 from P-dates;
changing my answer 2 (my answer chip, the new answer); the organizer's booking
mark for someone 2 (their face, "☐ Booked", 🎫 until PIA-156); flights before 🔒 2 (my bar, ✈↗); the build
check stays 2 (ⓘ, ⚙). Group-link RSVP stays three steps; a nudge link two.
Two jobs got longer on purpose: moving the plan a day is 3 taps (the pill, −1 or
+1 in P-dates, Save) where the trip page's ±1 was 1, since a set plan rarely
moves; and 🧭↗ Explore for an idea with no place is the organizer's card alone
(guests cannot change the destination, and the trip page's primary is Share).

PIA-155 adds three, each counted by `test-words` with real taps through the real
Worker: removing a trip for everyone is 3 taps (⋯ More, 🗑 Remove for everyone,
🗑 Remove) from its card or its trip page, a v1 trip too, as it is (before, it was
impossible without ⤒ Update trip first); ↩ in the toast, or on the removed card on
the 🗄 Archive shelf, puts it back as it stood (paid with its amount, or chosen
with its own stored choice and estimate), and other phones see it there like any
removed trip; a removal or ↩ another organizer phone made first settles with
nothing sent. Hiding a trip on this phone is 2 taps (⋯ More, 🗄 Hide on my
phone; "Show on my phone" once hidden; nothing is sent). Pricing one unbooked
traveler after 🔒 is 2 taps (their face, 🔍N with its cost), since the trip page
shows no price row after 🔒 until a fare is cached.

PIA-156 adds one and keeps the rest, counted by `test-words` with real taps:
reminding the one traveler still to book is 1 tap on the organizer's phone (the
key's Remind, "Remind Anjo", ending its first row, ⏳ Waiting: their own guest
link; before, her face then Share, and her sheet offered no Share once she had
answered In); several waiting is 1 tap too (the key's Remind, the trip's guest
share, or the Share primary when that is already the primary, and the key then
adds none). Nudging someone who has not answered stays 2 from their sheet (or 1
from the key when they are the only one waiting besides the organizer). The
booking toggles keep their taps ("☐ I booked" 1; "☑ I booked" 2 to undo; the
organizer's "☐ Booked" 2 from the face). The word rule allows 5 marked label
words a screen (Booked, Waiting, Hosting join the list, for the key's rows only;
a row past the 5 keeps its glyph and faces and drops its word). On a short phone
(678px tall) the key takes only the space under the rows that were already there
(the price row, 💵 Paid), so they keep their first-screen place, and its ⏳ Waiting
row with Remind comes first.

The suites compare dates, event-day constraints, answers, stages, bookings,
headcounts, airport choices and totals with the same shared record/model.
Writing jobs use the real in-process Worker. Paid upstreams are fixtures; no
live search, email, extraction or other paid action is used for acceptance.

## v1 purposes and their v2 disposition

Reviewed against `FEATURE_INVENTORY_UI_OVERHAUL.md`, current v1 page controls and
the later PIA-047–131 implementations in the shipping pages. Rows group controls
by purpose; keeping a purpose does not require keeping every v1 widget (D1).
Retirements below are explicit design choices under D1/D4, not claims of parity.

| v1 purpose / controls | Disposition in v2 |
|---|---|
| Find, create and revisit trips; watchlist stages and quick-add | Covered by Ideas, the create flow, stage controls, shelf and shared trip links; PIA-155: ⋯ More's 🗄 Hide on my phone (this phone) and 🗑 Remove for everyone (a v1 trip too, before ⤒ Update trip), both undone from the shelf |
| Keep each trip's decisions coherent across surfaces | Covered by the shared `/idea` record and derived trip model; no second local trip-facts store |
| Coordinate arbitrary people, family defaults and party sizes | Covered by create/edit presets and members; date-aware JAX/LGA transition, Mom & Dad ×2 retained |
| Solo travel versus family meetups | Covered by the same one-person/multi-person trip model; separate app modes retired |
| Ask who is coming and let people answer | Covered by personal/group links, face choice, In/Maybe/Out, joins, nudges and organizer proxy answers |
| Agree on dates without erasing people's own plans | Covered by plan/own-date pickers, presence board, lock/unlock and booked-date guards |
| Choose a holiday and keep the dinner/event day fixed | Covered by holiday picks, pin and shared date constraints |
| Compare candidate travel weeks | Covered by on-demand real-fare cheapest week, S1 regression and explicit Move; mock cheap-day scores retired |
| Compare a different meeting city / hub | Covered by explicit Map destination previews and Use; automatic estimated all-hub rankings retired |
| Use PIA/ORD or LGA/JFK and different in/home airports | Covered by hub/metro rules, open-jaw links and personal airport choices; ORD drive pivot retained |
| Search nearby origin airports and identify the real winner | Covered by capability-gated multi-airport searches, winner facts and editable origin; no synthetic saving claims |
| Book a traveler's flight with correct party size and dates | Covered by Google Flights handoffs, per-leg links and golden-link tests |
| Standalone global one-way search mode | Deliberately retired; dated shared trips and their one-way leg handoffs are retained |
| See a single family cost and who is still unpriced | Covered by the shared priceRows/priceTrip rule, total/parts and partial-fare faces |
| Know price age, quality, source and movement | Covered by age, stops, Google price level, real previous-fetch delta and unsearched/no-fare states |
| Synthetic price charts and long-term sample-price history | Deliberately retired; no estimated history masquerades as a real offer |
| Trigger live pricing while controlling spend | Covered by the single explicit runSearch path, shown cost, cache, visit/day/month caps and token gate |
| Remember a traveler booked and record flight times | Covered by booking marks (✈, PIA-156; the trip page's key says who booked, who is still to book and who hosts), flight-time entry, return invitation and recorded pickup times |
| Track an actual flight on travel day | Covered by Flighty handoff; live flight tracking remains outside PIALAX |
| Coordinate rides, arrival gaps and alternate airports | Covered by Map, shared pickup lanes, P-day map mode and cheapest cached pickup pair |
| See geographic routes at home or abroad | Covered by pinned world map, origin faces, routes, destination/alternate pins and fallback roster |
| See who hosts and who should host next | Covered by Family's cross-trip hosting counts and headcounts |
| Expense allocation, reimbursements and cash settlement | Deliberately retired; the paid trip total remains, but PIALAX is not a settlement ledger |
| Spot schedule conflicts and people present each day | Covered by Calendar and P-day using existing presence/clash rules; other-trip knowledge is limited to this phone |
| Put a trip into an external calendar | Covered by `.ics` and Google Calendar handoffs, own dates and exclusive event-end tests |
| Communicate a plan to another person | Covered by native share/copy and safe guest links; standalone exported image cards retired |
| Move an organizer's access to another device | Covered by own-device organizer links; guest payloads exclude keys/tokens |
| Save/share a set of trips | Covered by per-phone lists and list links; newly created trips do not silently appear on another phone |
| Preserve legacy link/storage compatibility | Covered by existing link/storage/router tests; live legacy-document/history conversion is explicitly PIA-146 |
| Keep a short trip caption or personal note | Covered by shared captions and response notes, with visible limits rather than hidden loss |
| Paste/email/PDF extraction, assistant fact/event log and decision engine | Deliberately retired from v2; direct shared edits, bookings and notes replace its planning inputs, not its full extraction feature |
| Structured passport/PTO/baggage task lists and local blocker/next-action widgets | Deliberately retired as separate task-management controls; not claimed to be reproduced by a short caption |
| Price targets, background watches, emailed alerts and outbox/test-email UI | Deliberately retired from the v2 interface; manual freshness/spend controls remain. Existing Worker/v1 services are not changed by these tickets |
| Saved-search setup and automatic seeded personal trips | Separate setup/seed engine retired; real shared trips, own origins and explicit group presets remain. Personal history import is PIA-146 |
| Desktop/mobile navigation, themes, labels and touch access | Covered by three labelled tabs, centered desktop phone layout, one sheet, keyboard focus/Back, glyph key, strict words and viewport gates |
| Security, credentials and cache trust | Covered by unchanged Worker authorization plus app token/header, share-privacy, CSP/SRI/data-digest and v1 cache-compatibility tests |
| Debug flags, mock/live badges and unrestricted proxy overrides | Debug/mock presentation retired; settings are limited to the configured CSP Worker peers and explicit organizer access |
| Root URL / old-page replacement | Implemented by PIA-147 redirect shims; public deployment pending release checks |

## PIA-146 migration and history import

`P-migrate` is offered only with valid organizer access. It reviews the existing
plan or the confirmed travelers' span, names/faces and notes. It updates the same
record and preserves member codes, access keys, personal dates, airport picks,
answers and booking marks. Booked travelers' inherited dates are pinned before
a plan move. Chosen legacy prices are removed; undated ideas retain their window.
Fresh reads reject a stale review before writing. Partial steps are journalled,
and a lost update reply is recognized from its resulting record rather than
blindly repeated. A changed record requires review again.

Settings' explicit 📜 import reconstructs v1's six real starter records with its
existing corrections, local overrides and added items. It also discovers live
shared IDs/keys added since this phone first opened v2. Linked trips are reused;
new records require review of dates, travelers and the shortened shared note.
Original notes can be read in pages, and a source-only JSON backup preserves
the full original storage and resolved records without keys or tokens. The v1
storage is never modified. Importing a past booking marks confirmed travelers,
not a fabricated payment. Postponed Cary is dropped without attendance; NYC
keeps its absent return, shows its known departure and has no invented continuous
Calendar presence. London uses four people and Anjo's historical JAX origin.

`pialax_transfer_v1` holds per-phone progress, source mappings and migration
steps. Web Locks serialize imports across tabs. Unsupported locking, corrupt
progress or unavailable durable storage stops creation. Confirmed creations
resume remaining writes after reload; known matching shared history is reused.
There is no global list: another phone must receive the shared IDs before it can
recognize those records. The unchanged Worker generates a random ID/key on
creation and has no idempotency lookup. If its creation response is lost, that
source is marked uncertain and cannot be blindly retried. This is a deliberate
duplicate-prevention stop, not a claim of automatic recovery of unknown IDs.

`test-migration-browser.js` runs real Chromium against the in-process Worker,
covering the three mobile widths and both themes, storage/source compatibility,
partial and lost writes, stale reviews, booking protection, history, word budgets,
44px targets and no paid requests. It is required by the job-flow preflight gate.
These are fixture migrations; no family's live shared records are changed by tests.

## Remaining cutover requirements

Implementation order, test-retirement mapping, intent-level acceptance criteria,
release evidence and rollback are specified in
[`PLAN_PIA_147_CUTOVER.md`](PLAN_PIA_147_CUTOVER.md). This is a plan, not evidence
that the pending checks below have passed.

- Use PIA-146's review/import on the organizer's actual phone and reconcile the
  resulting shared IDs before PIA-147. A green fixture suite is not a live-data import.
- PIA-147 switches entry URLs, preserving query strings and hashes, only after migration.
- Record the two-person shared-list comprehension check and Mom & Dad icon check.
- Complete previously recorded real-device booking-return, keyboard and calendar-file checks and the real adults=2 fare-price verification. Browser fixtures are not proof of a provider's live party-price convention.
- If the separate original six-asks document becomes available, reconcile its exact wording before claiming that original review complete.

No pre-cutover human check is represented as an automated pass.
