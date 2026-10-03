feat(rsvp): arrive/leave calendar that opens on the trip's month

- tripIdeaRangeCalendarHtml(month, from, to, counts, today) is a month grid
  with ‹ › navigation and 44px day cells. Past days are disabled, and the
  picked range is marked with its night count.
- tripIdeaCalendarStartMonth opens on your earlier answer's month, else the
  proposal's departure / search start, else today.
- tripIdeaCalendarTap: arrive, then leave. An earlier day restarts the
  range; a third tap starts over.
- tripIdeaDayCounts shows "•" dots for others who are in/maybe that day
  (not you, not hosts, not "out").
- Hidden #trip-idea-rsvp-from/-to keep the /idea/respond payload
  unchanged.
- Tests:
  - test-trip-idea covers the start month, taps, counts and markup;
  - test-viewport checks the calendar opens on November 2026 with nothing
    picked, cells are ≥44px at 375 and 390, two taps give
    "Nov 26–30 · 4 nights", and the saved card shows those dates;
  - each viewport run uses a fresh idea.

Closes PIA-101.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
