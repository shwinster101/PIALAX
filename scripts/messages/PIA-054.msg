fix(watchlist): Open no longer lands on the wrong trip

User report: "When I click open on the trip it takes me to family meetup and
random trip." Reproduced with exact data-wl-id matching (an earlier pass had
been fooled by a cross-trip clash chip literally containing another trip's
name inside the row's own text, which is a test-methodology bug, not this
one — noted here so it isn't rediscovered).

TWO REAL BUGS IN applyHoliday/openWatchlistTrip

Every watchlist item with a `key` field (jax, peru, london) has its Open
button delegate entirely to applyHoliday(t.key), ignoring the item's own
live dep/ret. Two consequences:

1. London's toggle-off branch fires on ANY second interaction with the
   London chip while it's already .active — including a second "Open"
   click, or an Open click after a direct chip click. It clears depDate/
   retDate/meetupHubOverride and returns early without touching mode or
   hub, leaving whatever the app happened to be showing before — which is
   exactly "family meetup and random trip." This was reachable from the
   watchlist the whole time; it just needed London opened twice, or a
   chip click followed by an Open click.

2. The peru/jaxaug/london branches hardcode literal preset dates
   (new Date(2026,8,4) etc). Since PIA-050 (Trip Assistant) lets a
   confirmed fact rewrite a trip's dep/ret in place, Open on an
   assistant-edited key trip would silently discard the edit and revert
   to the original hardcoded literal — a desync that didn't exist before
   PIA-050 shipped, when nothing else could touch those dates.

THE FIX

applyHoliday(key, opts) takes two additive options. opts.skipToggle
bypasses the london toggle-off branch entirely. opts.dep/opts.ret (ISO
strings) override the hardcoded per-branch preset immediately before
S.depDate/S.retDate are set, so the item's own current dates always win.
openWatchlistTrip's `if (t.key)` branch now calls
applyHoliday(t.key, { dep: t.dep, ret: t.ret, skipToggle: true }).

Both opts are additive and only ever set by this one caller: the plain
.hol-btn chip click handler still calls applyHoliday(b.dataset.hol) with
no second argument, so the existing toggle-off-on-repeat-click chip
behavior is unchanged (verified below).

Verified in a browser (both files, exact data-wl-id targeting, not
textContent substring matching):
- Opening London via the watchlist twice in a row now shows Jun 25 – Jul 3
  both times (previously the 2nd open hit the toggle-off branch).
- Opening London, then Peru, then Memphis, then London again — every open
  reflects that trip's own dates, every time.
- Directly clicking the London holiday-quick-pick chip (not through Open)
  still toggles off on the second click exactly as before — regression
  check on the one behavior this fix deliberately leaves untouched.

Both files: normalized (comments stripped) applyHoliday bodies are
byte-identical between desktop and mobile.

Tests: 27 + 217 + 36 checks unchanged and passing (test-core, test-
extraction, test-worker) — this fix touches DOM-driven functions outside
the EXPECT-capturable pure-function set, so it's verified by browser
walkthrough rather than a new fixture.

Rollback: revert. Bare chip-click behavior (the only caller besides Open)
is unaffected by this change.
