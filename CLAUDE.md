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

Screens have at most 10 ordinary visible words plus at most 3 marked label
words (`data-lbl3`) from the PIA-154 allowlist (Coming?, Hosting?, Lock dates,
I booked, Landing time, Track, Lands, Leaves; Tue, Wed, Thu on Calendar only);
popups at most 20 and mark none. Count visible
whitespace-separated tokens with a Unicode letter, including names, airport
codes, labels, placeholders and typed values. Trip names and the expandable Nebby travel-reference notes marked `data-free`,
numerals, prices, dates, emoji and glyphs are exempt. Use named 44px targets,
keyboard focus/Back, glyph explanations and the existing sheet patterns.

Preserve strict CSP, exact d3/topojson paths and their frozen SRI hashes, exact
world-atlas@2.0.2 URL and runtime SHA-256, no external fonts/styles/images, and
faces/pickups fallback if any map asset fails. Entry files load no external assets.
Credentials remain in existing storage/header formats, never logs or fixtures.

## Verification and shipping

`bash scripts/preflight.sh` is mandatory. It checks all four HTML files,
secrets, script balance, live SRI/map hashes, shell syntax, Worker, trust, model,
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
