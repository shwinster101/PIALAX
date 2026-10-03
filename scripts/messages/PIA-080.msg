feat(trip-ideas): record the actual total when a linked card is booked

- setWatchlistStage (both files): moving a linked card to booked calls
  tripIdeaPromptActual: one prompt for the whole-trip total; if the idea
  isn't chosen yet it is chosen first, then booked with actual_total.
- tripIdeaUpdateDecision: shared /idea/update helper that refreshes the
  card cache and the local decision log.
- Organizer device only (edit key); blank input skips.
- Tests: auto-choose then book, decision log entry, blank skip, history
  stats across two booked ideas.

Closes PIA-080.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
