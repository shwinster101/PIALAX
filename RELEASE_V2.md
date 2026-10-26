# v2.0.0 release candidate — PIA-147

Status: implementation prepared; public cutover and release tag pending.
Dependency: [PIA-146 PR #33](https://github.com/shwinster101/PIALAX/pull/33),
commit `07a13220da09ef14a06c4f7d18c26beea07057a4`.

## Result and breaking changes

All three entry pages forward to the same `app.html`, keeping query/hash bytes
and avoiding an extra Back-history entry. Existing organizer/member links,
legacy watchlist links, builder links and v1 storage formats are covered by tests.
The app identifies itself as 2.0.0. Desktop uses its centered phone layout.

The old V3.0 dashboard label belongs to the retired UI, not this SemVer release.
Retired v1 purposes are itemized in [V2_ACCEPTANCE.md](V2_ACCEPTANCE.md): estimates,
automatic mock rankings, extraction/task UI, settlement controls and alert UI do
not carry forward. Real prices require an explicit search. Family lists are
per-phone; share new trips explicitly. History import remains an organizer review.
Worker services, shared records and credentials retain their existing contracts.

## Coverage disposition

| Old assertion group | Retained or replacement evidence |
|---|---|
| `test-core` v1 UI/model, local assistant state and calendar | Retired v1-only assertions; retained trip facts, calendar files and prices tested by `test-trip-model`, `test-gflinks`, `test-app`, Calendar/word jobs |
| `test-extraction` browser parser/assistant | Deliberately retired UI; `test-worker` still verifies extraction API/auth/caps |
| `test-trip-idea` duplicate builder and three-way source drift | Retired builder UI/module; new/create/edit/RSVP/booking/pricing jobs retained in app/browser suites; old builder URL fixture still opens create |
| v1 viewport, token panel, four-tab UI | Removed; v2 layout jobs retain 360/390/430 light/dark coverage; cutover adds centered desktop and all entry URLs |
| v1 client trust cases | Removed duplicated runtime tests; v2 actual spend path retains auth, HIT age/no spend, MISS counting, day/month/session locks; frozen v1 fare serialization remains checked |
| v1 family/nearby/quota function comparisons | Captured outputs in `scripts/fixtures/v1-cutover-contract.json`; model compares against them across date boundary and quota transitions |
| v1 encoders used to construct test data | Frozen compact-list, builder, history, CDN and URL contracts; v2 reads actual pre-retirement outputs |
| Pre-cutover unlinked-entry assertion/harness default | Replaced by fixed redirects, exact query/hash handoff, Back/reload, app-default harness and no external redirect destination |
| Model inline drift, Worker concurrency, price trust, security hashes | Retained and mandatory |
| Migration, Calendar, words/taps, viewport, map | All five retained; cutover is the sixth required browser suite |

Fixture provenance is recorded in the JSON. It was generated from shipping v1
functions before replacement, not from the v2 functions under test. No v1 runtime
is retained as a publicly accessible alternate app. Git history holds old code.

Unknown legacy-only search/debug parameters survive the redirect but do not
restore retired app modes. Malformed links stay inert. Without JavaScript the
fallback offers a link and explains the requirement; it cannot copy dynamic hash
credentials. Browser booking/share tests cannot prove native phone behavior.

## Release evidence checklist

| Evidence | Status / reference |
|---|---|
| PIA-146 merged and deployed | Main `309145fa26cb8a15e7884774373581b7c8cfd4a5`; served app matches PIA-146 blob `59277c08623e944d27d28087654a4488792ecb59` |
| Candidate commit / PR | One PIA-147 commit on `codex/pia-147-cutover`; PR identifies its immutable head |
| PIA-147 preflight | PASS: Worker 91, trust 70, model 388, booking links 100, app 505; all six browser suites passed (cutover 215, migration 197, Calendar 104, words 146, viewport 16, map 110). Live pinned-asset verification passed; optional shellcheck unavailable |
| Same-day actual organizer migration and shared-ID reconciliation | Pending owner/device evidence |
| Uncertain imports reconciled; original notes/source backup | Pending owner/device evidence |
| Mom & Dad recognizable and count as two | Pending human evidence |
| Two-person list comprehension | Pending human evidence |
| Actual phone booking-return, keyboard and calendar-file checks | Pending device evidence |
| Real adults=2 provider price convention | Pending scoped organizer verification |
| Original six asks | Exact source unavailable; available checklist reviewed, no independent original-text claim |
| Pre-cutover main SHA and last three green main SHAs | Current pre-cutover main: `309145f` (146); prior verified releases `ba862fb` (144/145) and `8a50c4f` (143). Recheck main before release |
| Candidate UI rollback drill | PASS: isolated candidate commit/revert restores baseline tree and byte-identical PIA-146 entry/app/harness/preflight files; runtime already covered by PIA-146 preflight. No live data changed |
| Pages served bytes and real URL smoke | Pending release |
| Annotated v2.0.0 tag and final release date | Pending verified main |

Automated fixture success does not mark human/live-data rows complete. Keep
private data and organizer access URLs out of public evidence. No live migration
or paid search is performed by this build.

## Release and rollback

Phone build check (PIA-152): open ⚙ (ⓘ → ⚙ on any phone); ⚙ #NNN must equal `<meta name="pialax-build">` in main's `app.html`.

Follow [PLAN_PIA_147_CUTOVER.md](PLAN_PIA_147_CUTOVER.md). Merge the dependency,
rebase/retest if its tree changes, complete same-day migration and human checks,
then merge the verified cutover. Compare served bytes for `/`, `index.html`,
`pialax.html`, `pialax-mobile.html` and `app.html` against the release commit.
Check a member invitation and organizer access before sharing family links.
Date the release changelog and tag the verified main merge SHA as v2.0.0.

Restore the pre-cutover UI if entry/access, dates/bookings, secret handling or
critical launch smoke regresses. For the single implementation commit:
`git revert <PIA-147-commit>`. If reverting the merge instead, inspect its parents
and use `git revert -m 1 <PIA-147-merge-sha>`. Run restored preflight and verify
Pages again. Do not revert PIA-146, clear storage, reset journals or rewrite KV.
UI rollback does not undo family-data migration and cannot make v1 display every
v2 fact. Resolve data corrections against known shared IDs separately.
