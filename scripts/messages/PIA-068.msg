fix(trip-ideas): close date gaps left by PIA-067

- Destination-only searches default to the next 90 days instead of
  returning dateless results labelled "Exact dates".
- Add resolveTripIdeaSearchDates: one pure path for date mode, rejecting
  reversed dates, return-only and reversed windows; open-ended windows get
  a 30-day end.
- "Latest departure" now bounds departure, not return.
- Score long windows across their whole span (evenly sampled), not only
  their first 8 departures.
- Keep builder notes: normalize was dropping _notes before save/share.
- Re-sync scripts/trip-idea-builder.js (stale since PIA-067) and test that
  it matches both HTML files.
- verify-sri.sh: strip GNU base64 line wrap so preflight passes on Linux.
- CLAUDE.md: tests now exist; note the trip-idea mirror rule.

Closes PIA-068.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
