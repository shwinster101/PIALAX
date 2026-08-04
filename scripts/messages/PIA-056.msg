data(watchlist): remove the JAX trip card from the board

User asked to remove "the jax trip" — confirmed via clarifying question:
the whole watchlist card, not just its Google Flights link.

Dropped the { id:'jax', key:'jaxaug', ... } entry from WATCHLIST_SEED in
both files. The board now seeds three trips: Peru, Memphis, London.

Left untouched, on purpose: the "🏖 JAX Aug 7–9" Holiday Quick-Pick chip and
its HOLIDAYS.jaxaug / applyHoliday('jaxaug') branch in the Meetup planner —
that's a separate, still-useful date-preset picker, not a watchlist board
card, and the user's ask was scoped to the board.

A device with a stored localStorage override for the old 'jax' id (stage,
notes, dep/ret edits) just carries an orphaned key now — loadWatchlist()
only applies overrides to ids present in the current WATCHLIST_SEED, so it's
inert, the same way removing any other watchlist item already behaves.
No migration needed.

Verified in a browser (both files): watchlist renders exactly
['peru', 'memphis', 'london'], no dangling references, no console errors.

Tests: 27 + 217 + 36 checks unchanged and passing. SRI count unchanged
(4/file) — known sandbox cdnjs-403 NO-GO only.

Rollback: revert.
