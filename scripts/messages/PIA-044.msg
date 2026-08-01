fix(privacy): redact third-party PII from seed data + block indexing

Disclosure ticket, shipped independently and ahead of everything else per
explicit instruction — a public-HTML PII leak gets strictly worse with time
(can't be un-indexed) in a way a trust bug doesn't, so it doesn't wait on
the shared-contract work in flight.

The seeded Peru trip (WATCHLIST_SEED, TREK_INFO, TRIP_BOOKINGS_SEED) carried
real third-party data in the publicly-served HTML on GitHub Pages:
  - a friend's real first name (as a trek contact + a companion reference)
  - the trek operator's specific street address and office number
  - a real trek booking confirmation code
  - a friend's specific flight routing (airports + connections)

None of this is the app owner's own data — it's a friend's name, a friend's
itinerary, and a real booking code that could plausibly be used to look up
or reference an actual reservation. Family role labels (Mom & Dad, Sister,
Me) were already generic in FAMILY_INFO and are unchanged; this only
touches values that identify a third party or a real credential-like code.

Fix: genericized every identifying value in place (e.g. 'Eduardo' → 'trek
contact' / 'arrange a late trek join'; the street address → 'trek operator
office'; the confirmation code → 'confirmed'; the friend's routing →
dropped, keeping only the schedule-overlap fact that's actually load-bearing
for the app's clash detection). No field, function, or data shape changed —
only string values. Same redactions applied to the two ops docs
(LESSONS_LEARNED_2026-07-30.md, FEATURE_INVENTORY_UI_OVERHAUL.md) that
quoted the same strings.

Also added, as a forward-looking mitigation (does not undo any prior
indexing): <meta name="robots" content="noindex, nofollow, noarchive"/> on
all three served HTML files, plus a site-wide /robots.txt disallowing all
crawling. This is a personal family tracker, not a public product, and
was never gated from search engines before.

Mirrored across pialax.html + pialax-mobile.html. Verified: node --check on
both extracted app bodies, bash scripts/test-core.sh (10/10 — confirms
neither file's IIFE/app body broke), bash scripts/preflight.sh (GO except
the known sandbox SRI/cdnjs 403, unrelated — SRI integrity= count unchanged
at 4/file, confirming CDN/SRI untouched), full-repo grep for the four
redacted PII strings (0 hits after this commit).

Residual risk, out of scope for this ticket: git history prior to this
commit still contains the original strings, and GitHub repo history is
itself crawlable/searchable independent of robots.txt (which only governs
the served Pages site, not the repo). Rewriting history is a destructive,
force-push operation on shared refs and was not requested — flagging for a
separate, explicit decision rather than acting on it here.

Rollback: revert this commit. All changes are string substitutions plus two
new meta tags and one new static file — reverting restores prior behavior
exactly, with no functional regression either way.

Closes the disclosure item from the 2026-08-01 audit (personal-data gating).
Sample/live honesty + recovery (the second item) follows as a separate
ticket per instruction.
