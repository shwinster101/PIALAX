feat(dates): weekdays on trip dates — "Fri Nov 20 – Sun Nov 29"

- tripIdeaDay(iso) gives "Fri Nov 20". tripIdeaDateRange shows
  "Fri Nov 20 – Sun Nov 29", and a single day when there's no return or
  it's the same date. Used by the RSVP window and answer text, the
  calendar range, the Book panel and the watchlist traveler labels.
- Day strip: a weekday-letter row, with weekends in the accent colour and
  the window days bold.
- Family tab "Searching" pills prefix the weekday (both files).
- Tests: date-format expectations updated; the strip row count includes
  the weekday row.

Closes PIA-110.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
