feat(mobile): one-thumb flow — Book in 2 taps, trip bar, sheets

Most of the checking happens on the iPhone. A bare open lands on the
Trips tab, and the linked trip isn't restored on reload, so reaching
Google Flights took a row tap, "More actions", "Open", then the right
button further down the page.

- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - tripCardBookChipHtml: "✈️ Book flights" on a linked
    planning/watching Trips card. It's hidden once everyone with dates
    is booked.
  - tripLegsSheetHtml: every traveler's ±2-day strip (the new `wide`
    parameter on tripIdeaFlexStripHtml) and nearby toggle.
  - Mark booked follows the sheet's data-idea-scope, so it works from
    the Trips tab.
  - tripLegsRepaint and tripIdeaMarkBooked re-render an open sheet and
    keep the scroll position.
- pialax-mobile.html:
  - ltSheetOpen / syncLtSheet: one bottom sheet (backdrop,
    role=dialog, ✕ / Esc, scroll lock).
  - syncTripBar (from syncLinkedTripChrome): the trip bar in the
    .sticky-cta slot, body.lt-bar-on hiding #search-btn. Refresh
    clicks the same search button; its label is "Refresh (N)" or
    "Fresh ✓".
  - The Trips card renders the Book chip outside the row's
    role=button.
  - loadPrices(true) restores scrollY afterwards.
  - CSS.
- pialax.html: only the shared block (the chip and sheet helpers are
  unused on desktop).
- Tests (test-viewport, at 360 / 390 / 430):
  - open → ✈️ Book flights → Ashwin's "✈️ In PIA ↗" = 2 taps, with a
    LAX→PIA Sat Nov 21 one-way search, 44px, on screen;
  - the trip bar reads Flex · Refresh (2) · Book (≥44px, unclipped,
    above the tab bar), and #search-btn is hidden;
  - Flex opens ±2 days (5/5 chips);
  - no horizontal scroll anywhere.

Closes PIA-127.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
