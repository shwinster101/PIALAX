feat(trip-ideas): link shared ideas to Trip Ideas cards with live RSVP chip

- Watchlist items carry sharedIdeaId (validated on load; persisted for
  added items and seed overrides, including ?wl= share links).
- Builder share saves the card first (deduped per recommendation) and
  links it; builder ideas become family trips with hub = destination.
- Card row chip: live counts from a cached GET /idea (<= 1 fetch per
  idea per 5 min); expanded card: "See answers" or "Ask the family".
- tripIdeaPayloadFromItem builds a shared idea from any family card
  (dates, airport, whole-family estimate).
- Tests: link, dedupe, sanitize, chip counts, ask-the-family on the
  Thanksgiving seed card, end to end through worker.js.

Closes PIA-076.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
