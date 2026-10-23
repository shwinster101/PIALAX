# PIA-147 — cutover to v2.0.0

Status: implemented as a release candidate; production entry points have not switched.
Updated 2026-10-23. Build evidence and release gates: [RELEASE_V2.md](RELEASE_V2.md).

As a family member, opening PIALAX or an existing invitation should take me to
the same v2 app, with my trips, identity and access intact. Desktop uses the same
app in its centered layout. This ticket completes the release, rather than
adding another trip model, backend list or planning feature.

## Requirements and precedence

Read this plan with [CLAUDE.md](CLAUDE.md),
[HQ §12](PIALAX_HQ.md#12-v2--apphtml-its-decisions-the-word-rule-and-the-cutover-pia-134-2026-10-18)
and [V2_ACCEPTANCE.md](V2_ACCEPTANCE.md). HQ §12 and the amended v2 rules govern
this release. The July [overhaul plan](PLAN_UI_OVERHAUL_2026-07-24.md),
[release report](RELEASE_UI_OVERHAUL.md),
[feature inventory](FEATURE_INVENTORY_UI_OVERHAUL.md) and
[project definition](PIALAX-PROJECT-DEFINITION.txt) are historical inputs.
Their duplicate desktop/mobile implementation, estimated fares and universal
feature-retention rules have been superseded for v2. Use the acceptance report's
purpose/disposition table to account for retired features; do not reintroduce
them merely to satisfy an older document. Anjo's current primary is LGA, with
JFK an alternate; historical dates before 2026-09-01 use JAX.

The separate original six-asks text remains unavailable. Reconcile it if supplied;
do not report its wording independently verified. The owner's posted PIA-140–145
checklist and repository job targets remain the available acceptance contract.

## Starting point

PIA-138–145 are merged. PIA-146 is implemented in
[PR #33](https://github.com/shwinster101/PIALAX/pull/33), head
`07a13220da09ef14a06c4f7d18c26beea07057a4`; merged to main as `309145fa26cb8a15e7884774373581b7c8cfd4a5`. Its full preflight passed, including 197 migration browser checks.
Those tests use fixtures: they neither migrated the family's live records nor
completed on-device checks. Recheck PR/main state when implementation starts.

## Release gates and order

Implementation and fixture testing can proceed before device checks. Switching
the public entry points waits for the release gates below. Preparing this plan
does not itself merge PR #33, publish links, migrate records or deploy a Worker.

| Gate | Required evidence | Current status |
|---|---|---|
| PIA-146 dependency | Merged implementation; deployed app bytes verified | Complete; see RELEASE_V2.md |
| Same-day live migration | Organizer reviews/imports on the actual phone on cutover day; reconciles shared IDs, people, dates, notes, stages and bookings | Pending |
| Migration recovery | All affected sources mapped to known records or explicitly held; no unresolved uncertain creation affecting launch trips | Pending |
| Human comprehension | Mom & Dad icon/headcount check and two-person list check recorded | Pending |
| Device/provider checks | Booking return, keyboard, calendar files and real adults=2 fare interpretation recorded | Pending |
| Candidate verification | Full preflight passes against exact release candidate, including new cutover jobs | Pending |
| Deployment verification | Pages serves committed entry/app bytes and launch smoke passes | After merge |

Use private organizer verification for readiness. Do not circulate v2 family
links before cutover; share the family links once the deployed release is verified.
If preparation spans days, repeat the live migration reconciliation on release day.

## Build scope

1. Replace `index.html`, `pialax.html` and `pialax-mobile.html` with small,
   same-origin redirect shims to the sibling `app.html`. Use `location.replace`
   so Back does not bounce through a shim. Remove device detection. Preserve
   `location.search` and `location.hash` verbatim, including encoded values and
   parameter order; the shim must not parse or consume access credentials.
2. Provide a minimal manual fallback to the same destination, preserving query
   and hash when JavaScript is available. With JavaScript disabled, show a clear
   app link/requirement; a static no-script link cannot dynamically copy a hash.
   Do not claim credential-preserving no-JavaScript operation for this JS app.
   Preserve noindex/nofollow/noarchive and existing security protections. Avoid
   third-party dependencies or a standalone/installable web-app mode.
3. Make v2 the harness default and update the tests that assumed v1 dashboards.
   Replace the pre-cutover assertion that nothing links to `app.html` with
   assertions for the intended shims and their fixed same-origin destination.
4. Retire v1 UI/parity and three-way builder drift gates. Keep live v2, Worker,
   pricing, concurrency and compatibility coverage as described below. Remove
   unused v1-only builder/runtime test dependencies after checking their callers.
5. Publish release documentation for v2.0.0: breaking UI/feature changes,
   explicit import, per-phone trip lists, link compatibility and recovery limits.
   Update current architecture, commands and cutover status; retain historical
   release reports as history rather than rewriting their original results.

Expected affected files: the three entry HTML files, `app.html` for release
metadata if needed, `scripts/harness.js`, `scripts/test-app.js`,
`scripts/test-trust.js`, `scripts/test-job-flows.js`, `scripts/preflight.sh`,
new `scripts/test-cutover-browser.js` and its shell wrapper, legacy-only tests
and builder files proven unused, `CLAUDE.md`, `PIALAX_HQ.md` §12,
`V2_ACCEPTANCE.md`, `CHANGELOG.md`, this plan, a v2 release/rollback report,
and `scripts/messages/PIA-147.{msg,files}`. Final manifest must match the actual
diff and include both envelope files. One implementation ticket = one commit.

## Coverage transition: retire UI duplication, retain trust

The current harness defaults to both v1 pages. `test-core`, `test-extraction`
and `test-trip-idea` load those pages; `test-trust` has legacy client checks;
`test-app` uses v1 functions to generate compatibility inputs and checks that
the v1 pages remain unlinked. Redirects will intentionally break those assumptions.
The required job-flow HTTP server currently serves only `/app.html`; extend it
with a fixed allowlist for root/index and the two legacy paths, including the
`/PIALAX/` deployment prefix. Do not add a general file-serving endpoint.

| Existing purpose | PIA-147 disposition |
|---|---|
| v1 dashboard UI, mock estimator, extraction UI and builder parity | Retire from active gates with a documented mapping to deliberate retirements |
| Old `?w=`, `?wl=`, `?tripIdea=` and storage compatibility | Keep immutable, provenance-labelled v1 payload/storage fixtures; run them through v2, without executing retired pages |
| Unauthorized paid actions, concurrent writes, cache age/spend | Keep Worker and v2 trust assertions mandatory; remove only obsolete v1 rendering cases |
| Model drift, family date boundary, Mom & Dad ×2, Google Flights links | Keep model/app/golden-link suites mandatory |
| Migration, Calendar, words/taps, viewport and verified map | Keep all five existing browser suites mandatory; add cutover as a sixth |
| CSP, exact SRI, pinned map-data digest, secrets and syntax | Keep checks and live hash verification; scan entry shims too; correct outdated script comments |

Inventory references to retired files before deleting any helper. Port any
still-relevant assertion before removing its old suite. Missing Node/browser,
skipped required tests, unavailable asset verification, timeout or failed
assertion yields NO-GO. A smaller suite count alone is not proof of regression;
record which old assertions were retained, replaced or deliberately retired.

## Observable acceptance criteria

| ID | Outcome | Evidence |
|---|---|---|
| 147-A | Root, explicit index, desktop and mobile legacy URLs open v2 on phone and desktop | Chromium navigation matrix under `/` and `/PIALAX/`; direct `app.html` does not redirect |
| 147-B | Invitations retain their query/hash through exactly one shim hop | Observe navigation before app credential cleanup; encoded/Unicode/unknown params, empty params and fragments; fixed same-origin target; no redirect loop |
| 147-C | Personal, group, list and organizer links still perform their intended jobs | `?idea=`, member/face links, `?l=`, v1 `?w=`/`?wl=`, builder `?tripIdea=`, organizer `#k=…&t=…`; fixture values only |
| 147-D | Access survives reload and returning from booking without leaking secrets | Key/identity/token formats retained; app strips credentials as before; guest share/copy/calendar payloads exclude organizer secrets; Back returns to prior page |
| 147-E | Existing local history and shared records remain coherent | Previously migrated phone, first v2 open, new IDs added by v1 after first open, explicit import, interrupted journal, read-only source storage, no boot seeding or automatic paid searches |
| 147-F | Entry changes preserve all v2 contracts | Existing model/trust/browser suites; 10/20 word limits, 44px targets, 360/390/430 light/dark and centered desktop; map asset failures retain faces/pickups |
| 147-G | Release can be identified and reversed | Committed version metadata/release report, verified deployed bytes, documented pre-cutover SHA and tested UI rollback |

Preserving an old URL's bytes is distinct from preserving every retired v1
screen behavior. Catalogue legacy-only search/debug parameters and record their
v2 disposition instead of promising unsupported modes. Malformed or hostile
links must remain inert and must never select an external redirect destination.

## Actual-phone and provider checklist

- On the organizer's phone, make the PIA-146 source-only backup. It excludes
  edit keys/tokens; retain organizer access through existing secure own-device
  mechanisms. Review live trips using their existing IDs. Reconcile imported
  history once, then distribute the known shared IDs at launch.
- Preserve NYC's absent return, London's historical JAX origin, postponed Cary's
  dropped state, hosts' attendance, personal windows and booked-date protection.
  Do not manufacture a fare, return date, booking payment or attendance span.
- If a create reply was lost and the journal says uncertain, hold that source
  and reconcile the actual record. Do not clear the marker or blindly retry a
  POST; the Worker has no creation-idempotency lookup. Confirmed IDs can resume.
- Verify Mom & Dad are recognizable and count as two. Have two people explain
  where a shared trip came from and whether future trips appear automatically.
  Each phone has its own list; newly created trips need another shared link.
- On the actual phone, open a Google Flights booking handoff and return; use
  the keyboard in sheets; download/open a calendar file with the intended dates.
  Browser fixtures do not test the native share sheet or calendar application.
- Verify the provider's real two-adult price convention against the app's
  family total. Record route, dates, adults, timestamp and interpretation without
  secrets. Any paid verification needs a scoped organizer-authorized search;
  fixture preflight makes no live paid requests.

## Release and rollback runbook

1. Recheck main and PR #33, merge the dependency when authorized, and base the
   cutover candidate on the resulting main. Record that exact pre-cutover SHA
   and the last three green main SHAs in the rollback report (HQ §2.4 D3).
2. Finish same-day migration and human/provider checks; record actor, UTC date,
   result and evidence location. Keep family details/access secrets out of public
   logs. Pending checks remain pending; fixtures cannot sign them off.
3. Run `PIALAX_TEST_REPORT_DIR=<evidence-dir> bash scripts/preflight.sh` on the
   exact candidate. Save per-suite logs and report, and the assertion disposition
   mapping. Fix failures before shipping; do not bypass required checks.
4. Finalize `[2.0.0] — <actual release date>` and breaking changes in CHANGELOG,
   preserving unrelated unreleased items. Verify the exact ship envelope and
   candidate diff. Release to main under the user's existing deployment scope.
5. Verify Pages serves committed bytes for all three shims and `app.html`.
   Open the ordinary root on a phone and desktop, an existing member invitation,
   and an organizer fixture link. Recheck reload, Back and credentials cleanup.
   If serving is delayed, investigate Pages rather than calling the release done.
6. After verification, create annotated `v2.0.0` at the verified main merge SHA;
   record commit, deployment evidence and check results in the release report.
   Share family links only after verification. No Worker deployment is required.

For broken entry/access, regressions in dates/bookings, secret leakage or failed
critical smoke checks, restore the pre-cutover UI promptly. Prepare and test the
rollback on a temporary branch before release. For a dedicated cutover commit,
use `git revert <PIA-147-commit>`; if reverting its merge commit instead, inspect
parents and use `git revert -m 1 <PIA-147-merge-sha>`. Run the restored gate and
verify served bytes again. Do not revert PIA-146 or clear storage/journals/KV.
UI rollback cannot undo live migrations or guarantee v1 displays every v2 fact;
reconcile any necessary data correction separately using known shared records.

## Completion record

PIA-147 remains unreleased until implementation evidence, release gates and deployment are
recorded. Fill in: candidate/merge SHA; pre-cutover SHA; assertion disposition;
preflight report; same-day migration reconciliation; human/provider outcomes;
served-byte verification; rollback drill; release tag. Public evidence must use
redacted fixtures rather than live organizer URLs, tokens or edit keys.
