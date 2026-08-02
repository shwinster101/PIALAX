feat(assistant): trip data layer, notes migration, fallback parser

Phase 2 of the 2026-08-02 sprint. Ships DARK: no UI, no call sites, nothing
reads any of it at runtime yet. That is deliberate — it keeps the commit
trivially revertible and lets the fixture suite exercise the logic before a
single byte of it reaches a user.

Three layers, per the spec:
  ContextEvent — immutable raw human input. Never edited, never rewritten.
  ParsedFact   — one atomic proposed/confirmed fact, traceable to its event.
  TripState    — decision-ready view, rebuilt from CONFIRMED facts only.

The merge contract is the point of the whole layer: a proposed fact never
overwrites a confirmed one; an identical repeat reinforces instead of
re-asking; a different value raises a conflict the user settles, with both
values kept; rejected facts stay for audit. Confirming one candidate
supersedes the rest of that field so a settled conflict cannot re-fire.

Notes migration is non-destructive by construction. Each watchlist item's
legacy `notes` blob becomes ContextEvent #1 under a deterministic id, and
the `notes` field is LEFT IN PLACE — so with the flag off the existing
textarea keeps working, and reverting this feature loses nothing. Verified
idempotent and verified not to mutate the input.

Four new versioned keys (context_events / parsed_facts / trip_state /
fare_history), each capped and sanitized on load so a corrupt value degrades
to empty rather than throwing, matching loadWatchlist/readQuota. Event
eviction spares notes_migration events specifically: those are the only
surviving copy of a note written before the assistant existed, and dropping
one would be precisely the silent data loss this feature exists to prevent.
Per-trip fare history is its own key because group_price_v1 only ever
recorded meetup hub totals.

The deterministic parser is the fallback for the Phase 3 LLM route, so the
feature never hard-depends on a network call or an API key. It emits the
same schema either way; only parser_version and the (lower) confidences
differ. Its governing bias: MISS rather than INVENT. A fabricated origin
silently produces a wrong price and a wrong booking link; a missing one just
asks the user a question. Multi-airport cities (Chicago, New York, London…)
are therefore never guessed — they become an explicit choice.

Tests: scripts/test-extraction.{sh,js} + a 41-case fixture file, with three
gates in descending order of trust — (1) nothing invented, a hard failure on
any fixture; (2) every emitted source_text quotes the input verbatim, so a
human reviewing a proposed fact can always see where it came from; (3) field
accuracy >= 90% (the spec's number). Currently 100% (89/89), nothing
invented, plus the merge contract, migration idempotence, and sanitizer
rejection of hostile ids. 57 checks.

100% on fixtures I wrote alongside the parser is a weak signal, so I probed
it with 14 inputs it had no fixtures for. That found two real bugs, both
fixed here rather than papered over:
  · "flying to Lima from Los Angeles" was dropped entirely; reading places in
    text order would have INVERTED the itinerary, so the direction word now
    decides, not the position.
  · "we land at 6am … briefing at 5pm" bound 6am to the briefing, because the
    time search scanned a window around the keyword rather than after it. A
    wrong constraint drives a wrong CHANGE_DATES recommendation downstream,
    so this one mattered. Times now bind to their keyword.
Both probes became fixtures, along with four more (ambiguous "9/4" left
unresolved rather than guessed, unmodelled destination, incidental place
mention, flight-number parsing).

scripts/harness.js: the loader (extract → strip IIFE → shim → capture) is now
shared by test-core and test-extraction instead of copied. It depends on
exact markers in the HTML files, and two drifting copies would mean one suite
silently testing a stale shape. test-core.js is unchanged in behavior — same
27 checks, same output format.

Mirrored across both files; the parity assertion added in PIA-046 now covers
all 14 new assistant functions and confirms they are byte-identical.

Invariants re-checked: SRI count unchanged (4/file), no new loadPrices(true)
call sites (quota untouched), flag still defaults off with nothing gated on
it, no console.log.

Rollback: revert this commit. All four keys are inert to prior code, no
existing function changed behavior, and the new scripts have no other
callers.

Closes Phase 2. Phase 3 (Worker /extract + client extraction pipeline)
follows.
