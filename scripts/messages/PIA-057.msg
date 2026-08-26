feat(solo): remember the search setup + one-tap save to watchlist

Ashwin missed a family fare window because solo mode reopened blank and
feature-heavy every visit. Two fixes, both files:

1. Saved search setup (pialax_solo_prefs_v1). Home airport, trip type,
   dep/ret dates and mode persist to localStorage on every state change —
   written from syncURL(), the single funnel all state changes already
   flow through — and are restored in boot(). Share URLs still win
   (restore only runs when no URL state loaded); saved dates are dropped
   once the departure has passed, so the app never reopens on a stale trip.

2. ☆ Save to watchlist on every solo card. saveSoloTrip(dest) snapshots
   the card's origin + current dates into the watchlist: updates the
   existing solo item for that dest (no duplicates, same watchlistSoloItem
   match the notes/blockers sync already uses), creates one with the
   Thu→Sun default when no dates are set, and the card flips to a passive
   "✓ On watchlist" once the item matches the current setup. This wires
   the save action addCurrentToWatchlist() modeled but nothing exposed.

Verified headless-Chromium on both files: prefs written on home change;
home/trip/dates/solo-mode restored after reload (Oct 15–18 case); past
dep drops dates; ?hub= share link beats prefs; save button creates the
watchlist item with correct origin+dates and flips to ✓; no new page
errors (d3 ReferenceError on file:// is pre-existing, cdnjs unreachable
in sandbox).

Tests: 27 + 217 + 36 checks passing. node --check clean on all inline
scripts. Preflight: known sandbox cdnjs-403 SRI NO-GO only.

Rollback: revert.
