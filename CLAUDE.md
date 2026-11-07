# CLAUDE.md

## Purpose and release status

PIALAX coordinates family trips above Google Flights (booking) and Flighty
(day-of tracking). The shared trip is the source of place, dates, people, answers,
bookings and stage; the app helps the family decide and coordinate.

This branch implements PIA-147 for v2.0.0. Public cutover is pending the release
record in [RELEASE_V2.md](RELEASE_V2.md). The implementation follows
[PLAN_PIA_147_CUTOVER.md](PLAN_PIA_147_CUTOVER.md) and the current v2 requirements
in [PIALAX_HQ.md](PIALAX_HQ.md) §12. Historical v1 documents describe prior
releases; the purpose/disposition table in [V2_ACCEPTANCE.md](V2_ACCEPTANCE.md)
records v2's deliberate feature retirements.

## Architecture

No framework, package.json or build step. GitHub Pages serves
`https://shwinster101.github.io/PIALAX/` from main.

- `app.html`: the single vanilla HTML/CSS/JS app, IIFE + strict mode. Trips
  (Ideas/Family), Map, Calendar; one sheet at a time; light/dark system tokens;
  centered phone layout on desktop from 700px. No standalone web-app mode.
- `index.html`, `pialax.html`, `pialax-mobile.html`: fixed sibling redirects to
  `app.html`, preserving query and hash verbatim with `location.replace`.
  JavaScript-disabled fallback explains the requirement and offers an app link.
- `short/` (PIA-163): the whole Cloudflare Pages site of the short address
  (`pialax.pages.dev`; setup in [SHORT_LINK.md](SHORT_LINK.md)). `index.html`
  forwards to the fixed `https://shwinster101.github.io/PIALAX/app.html` with the
  query and hash verbatim; `_headers` and `_redirects` (`/i/<id>` → the Worker).
  The app never runs on a second origin: each phone's storage (list, edit keys,
  token, me) and the Worker's CORS belong to `shwinster101.github.io`. Moving
  the app needs a storage handoff and a budgeted Worker deploy.
- `scripts/trip-model.js`: pure derivation of the one shared `/idea` record.
  The marked region is inlined byte-identically in `app.html`; drift fails tests.
- `worker.js` + `wrangler.toml`: existing Cloudflare backend. PIA-147 does not
  deploy or change it. `/idea*` writes serialize through IdeaRoom, backed by KV.
  Paid routes require `authGate` and `spendGate`; SpendMeter makes caps exact.
  Fare cache uses canonical parameters and retains the original fetch timestamp.

## v2 contracts

- **D1:** cover or explicitly retire each v1 feature's purpose; do not revive
  estimated-price UI, extraction UI or duplicate desktop/mobile code for parity.
- **D2:** derive trip facts from `/idea` through the model on each render.
- **D3:** per-phone lists store known IDs, not a backend family list. Trips travel
  by shared links. Newly created trips do not automatically appear on other phones.
- **D4:** real fares only, explicit organizer search, shown cost before spending.
  At most 4 searches per tap and 8 per visit. Daily locks lift next UTC day;
  monthly locks follow their reset. Cached HITs preserve age and spend nothing.
- **D5:** the same app and behaviors serve phone and centered desktop.

`familyForDate` uses JAX before 2026-09-01, then LGA with JFK in its alternate
set. Mom & Dad count as two, Ashwin one, Anjo one. Keep the Peoria ORD drive
pivot. A missing fare remains unsearched; no synthetic total or estimated week.

Answer-note markers (PIA-157) come after 📞/🛬/🛫 in one fixed order (🚗 claims,
🚌, 🚙, 🐈, 🧺, 🛬 airport, 🛫 airport (PIA-159; only an airport outside the hub,
on a booked leg with a time), then the text); a new marker kind is only ever
appended last, so an older build keeps the markers it does not know as text,
byte for byte. A
ride claim lives in the driver's own answer; runs and ⏰ are derived, never
stored (a phone keeps just its last 📅 Phone signature of them, in `pialax_ui_v1`). No
flight numbers or confirmation codes. A marker or time write over 280 is
refused, never clipped. Pets (PIA-158) come from the family preset (`PETS`,
`familyKey`): only 🐈's legs are written, in the owner's answer; Kona and the
house scene are derived, never stored. `pialax_ui_v1` also keeps this phone's
P-pet ticks (`pet`) and its 🎊 flag (`party`), for the trips in its list.

Shared storage keys retain v1 formats: `pialax_idea_keys_v1`,
`pialax_idea_me_v1`, `pialax_idea_seen_v1`, `pialax_proxy_token`,
`pialax_proxy_url`, price cache and quota keys. Never delete or replace an edit
key. `pialax_watchlist_v1` is read-only. Boot discovers legacy IDs once; explicit
PIA-146 import may rediscover later additions. Nothing seeds personal trips on boot.
The frozen history source exists only for explicit organizer review/import.

Keep legacy `?idea=`, `?w=`, `?wl=`, `?tripIdea=` and organizer fragment formats;
`?l=` is the v2 list format. Secrets leave the address bar after the app consumes
them. Organizer credentials never enter guest shares or calendar files. Fixed
entry redirects never use query values as a destination.

Migration progress lives in `pialax_transfer_v1`; Web Locks serialize tabs.
Confirmed IDs resume incomplete writes. An uncertain creation cannot be blindly
retried or cleared: the Worker has no creation-idempotency lookup. Actual-family
migration and on-device checks are recorded separately from fixture evidence.

## UI and security

Screens have at most 14 ordinary visible words (PIA-159) plus at most 5 marked label
words (`data-lbl3`, PIA-156) from the allowlist (Coming?, Hosting?, Lock dates,
I booked, Landing time, Track, Lands, Leaves; Tue, Wed, Thu on Calendar only;
Booked, Waiting, Hosting in the trip page's key rows only; Rides in the trip
page's key rows and primary only); popups at most 20
and mark none. ✈ alone means booked. Count visible
whitespace-separated tokens with a Unicode letter, including names, airport
codes, labels, placeholders, typed values and a time's AM / PM. Trip names and the pet travel and at-home reference folds marked `data-free`,
numerals (a time's digits too), prices, dates, emoji and glyphs are exempt. A
person reads every clock time in 12-hour; it is stored as 24-hour HH:MM. Use named 44px targets,
keyboard focus/Back, glyph explanations and the existing sheet patterns.

Type, spacing and radii come from the :root tokens (PIA-160). Text sizes a person
reads come from seven tokens (13/15/17/18/20/22/28px); glyph-only boxes, face marks
and the named exceptions keep px. Weights are 400/600/700; spacing tokens are
4/8/12/16/24/32; controls and containers use 8/12/16/20/pill radii (faces stay
round). Nothing a family member reads is under 13px (the organizer's P-cheapest bar
values excepted); names shrink no lower than 13px; AM/PM is ≥13px in the time's
ink; inputs are ≥16px. iOS Text Size is honoured through `html { font:
-apple-system-body }`, screens capped at ×1.118 and sheets, toasts and labels at
×1.353. Tappable edges use --edge (≥3:1); small text is ≥4.5:1 in light, dark and
Increase Contrast; ink outlines mark selected or pressed (a booking toggle's stays
green), plus the organizer's invitations and an arrival on the Map's lanes; on the trip page, P-person and
P-rides dashed means not settled;
read-only controls are quiet (--sunk, --ink2, solid --edge), never faded. The
board, key, Map lanes and trip title share one name column (80px, 88px at larger
text). Board times stay inside their track; '+N' is a count, not a button. Every
attention motion has a still reduced-motion cue. System fonts only (ui-rounded for
numerals). Polish never adds a word: test-words compares each screen and popup it
measures with `scripts/fixtures/census-159.json` (captured at #159).

Preserve strict CSP, exact d3/topojson paths and their frozen SRI hashes, exact
world-atlas@2.0.2 URL and runtime SHA-256, no external fonts/styles/images, and
faces/pickups fallback if any map asset fails. Entry files load no external assets.
Credentials remain in existing storage/header formats, never logs or fixtures.

## Verification and shipping

`bash scripts/preflight.sh` is mandatory. It checks all four HTML files and
`short/index.html`, secrets, script balance, live SRI/map hashes, shell syntax, Worker, trust, model,
Google Flights links, app and all six browser suites (cutover, migration,
Calendar, words/taps, viewport, map). Missing or skipped required suites fail.
Shellcheck remains advisory unless `STRICT=1`.

Install Node, global Playwright and Chromium; configure `NODE_PATH` and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` if needed. `PIALAX_TEST_REPORT_DIR` chooses the
browser evidence directory. `PIALAX_MAP_ASSETS` can supply previously downloaded
assets, still verified by hash. Job-flow tests serve over local HTTP.
`node scripts/harness.js` defaults to `app.html`. Legacy UI suites and the
three-way builder drift check are retired; captured v1 compatibility fixtures
remain tested. Detailed coverage mapping is in `RELEASE_V2.md`.

Every ticket has one implementation commit, an Unreleased changelog entry, and
`scripts/messages/<ticket>.msg` plus `.files`. The manifest includes both envelope
files and exactly the ticket diff (including deleted paths). Run preflight before
push. Existing user authorization governs publishing; do not repeat approvals.
A build request can prepare a PR while actual release prerequisites are pending.
Never declare Pages current without comparing served and committed bytes.

A PIA ticket also bumps `BUILD` and `<meta name="pialax-build">` in `app.html` to
its number (test-app fails otherwise). To check a phone's build against main, open
⚙ (ⓘ → ⚙ on any phone): ⚙ #NNN must equal main's `pialax-build`.

Release v2.0.0 only after the same-day migration and device/provider evidence in
`RELEASE_V2.md`. Date the changelog on release, then create an annotated tag at
verified main. Preserve unrelated Unreleased entries. Revert only PIA-147 for UI
rollback; retain shared records and local migration journals. No Worker deploy
is required. If a later ticket does deploy the Worker, `verify-live.sh` spends
one authorized SerpAPI search and must be explicitly budgeted.
