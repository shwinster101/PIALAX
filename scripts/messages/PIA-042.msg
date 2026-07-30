feat(test): T1 — pure-function harness + F2 migration-filter fix

Security/data-integrity ticket. No security surface touched (SRI/CSP/secrets
untouched); adds a new test harness (scripts/test-core.{sh,js}) and fixes a
silent-data-loss bug found by the 2026-07-30 audit. T3 acceptance optional
per HQ §4 fast-path — code-verifiable in diff + the harness's own self-test.

F2 fix (silent data loss): _isSeedDupMemphis matched any solo Memphis trip
by mode+dest alone, with no date scoping. Because Memphis was promoted from
a user-added item to a WATCHLIST_SEED entry, this migration filter would
have silently dropped every FUTURE Memphis trip forever (e.g. one added
next March), not just the one genuine duplicate it was meant to catch. Now
date-scoped to the seeded Aug 31-Sep 4 2026 window — only a genuine overlap
is treated as a duplicate.

New: scripts/test-core.sh + scripts/test-core.js. PIALAX has no build
system and no module boundary - every function lives inside one page-level
IIFE, not exported to window. The harness extracts each file's app <script>
block, strips the IIFE wrapper, neutralizes the trailing boot()/
initShellView() invocation, and evaluates the body under `new Function`
with a minimal browser shim (a self-referential Proxy stub covers arbitrary
DOM/d3 chains generically). Captures 13 pure functions/constants and
asserts against them - this pass covers only the F2 regression (4 cases x
2 files); the same capture list already carries what the audit's later
tasks (estimate stability, share-link isolation) will need next, so no
re-architecture is required then.

Fails loudly by design: exits 1 if a file can't be loaded or an expected
symbol can't be captured, rather than silently testing nothing. Verified
against a corrupted IIFE marker (exit 1) and the clean files (exit 0).
Standalone for now - NOT yet wired into preflight.sh (separate follow-up
task); picked up automatically by preflight's existing bash -n / shellcheck
steps since it's a new scripts/*.sh file.

Mirrored across pialax.html + pialax-mobile.html.

Rollback: revert this commit. _isSeedDupMemphis reverts to its unscoped
form (safe short-term - only re-opens the future-Memphis-trip risk, does
not reintroduce a currently-active bug). scripts/test-core.{sh,js} are new
files with no other callers; deleting them is a no-op for the app.

Closes PIA-042 (T1 of the audit-remediation plan; T2-T6 follow separately).
