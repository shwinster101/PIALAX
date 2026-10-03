feat(watchlist): Thanksgiving in Peoria card; archive postponed Cary trip

- New seed `thanksgiving`: family, hub PIA (Mom & Dad host), Nov 25-29,
  event Nov 26, planning, "Ask the family" next action, dinner calendar
  event. Card links one Google Flights search per traveler (LAX, LGA).
- `tgiving` (Cary shower) postponed: stage completed, eventDate cleared,
  title/next action say postponed. _scrubPrebookingOverrides drops stale
  tgiving stage/dates/next action/blockers (keeps notes + RSVP link).
- Tests moved from the Cary seed to Thanksgiving (PIA payload, family
  estimate $704 on sample fares, per-traveler links, host has none);
  stale-override scrub test.

Closes PIA-082.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
