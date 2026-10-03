feat(rsvp): share text without price or exact dates; guests pick their own days

- tripIdeaShareText: invite and nudge drop the family cost and the exact
  date range. They use tripIdeaLooseWhen() ("early/mid-/late Nov") and
  ask each person for their own dates. Titles that start with their own
  emoji no longer get a second ✈️.
- RSVP page: guests (no edit key) see "Late Nov · pick your own dates",
  no cost line and empty arrive/leave fields. The organizer's view is
  unchanged.
- The Trip Idea Builder block is changed identically in all three copies.
  test-trip-idea asserts: no $, no digits, rough time, the ask.

Closes PIA-098.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
