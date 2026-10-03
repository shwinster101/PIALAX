feat(trip-ideas): send RSVP links to the family group text

- tripIdeaDistribute: navigator.share({title,text,url}) when available
  (text and url separate so Messages shows one preview); AbortError is
  silent; other failures and desktop fall back to copy text + link.
- tripIdeaShareText: invite ("Nov 6–9 — whole family ≈ $1,116. Are you
  in?") and nudge ("still need an answer from Anjo") wording.
- Card actions on linked trips: See answers, Nudge N waiting, Hold the
  dates (.ics via addWatchlistTripToCalendar with the RSVP link inside).
- Organizer's shared view gets "Nudge N waiting".
- Tests: wording, date ranges, share sheet / cancel / fallback, calendar.

Closes PIA-078.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
