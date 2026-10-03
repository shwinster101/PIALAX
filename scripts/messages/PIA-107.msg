feat(trips): linked family trips lead with Family RSVP + one Share button

- tripIdeaCardActionsHtml (block) returns two buttons for a linked card:
  - "👥 Family RSVP" (wl-idea-open, full-width accent);
  - "📤 …" (wl-idea-share). Its label comes from the trip's state:
    "Nudge N waiting", else "Nudge N to book" (once can_book), else
    "Share invite".
  tripIdeaShareCard picks the matching nudge/invite text.
- New tripIdeaCardMoreHtml holds Hold the dates and Organizer link.
- Trip sheet (both files): for linked, unfinished trips, Open, calendar,
  per-person Google Flights links, hold, organizer link and Remove move
  into <details class="wl-more-actions">. The Google Flights help copy
  is dropped; an added trip keeps its airport/dates editor.
- test-trip-idea: two main buttons, the share label, hold and organizer
  link under More.

Closes PIA-107.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
