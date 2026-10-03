feat(assistant): RSVP answers become trip-assistant companions

- tripStateFor (both files) calls tripIdeaAugmentTripState for cards with
  sharedIdeaId: members -> companions (in confirmed, maybe/pending
  tentative, out out), organizer ("Me") excluded, replacing note-derived
  companions with the same label. Reads the cached doc only (pure).
- computeRecommendation's existing COORDINATE step now blocks on real
  answers ("Confirm Anjo before booking").
- "● new" on the card chip when an rsvp log entry is newer than the
  organizer's last view (pialax_idea_seen_v1); cleared on opening.
- Not done: the common date window as a constraint — the assistant's
  constraint engine has no date-window type yet.
- Tests: companions mapping, COORDINATE headline, seen/new flag.

Closes PIA-079.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
