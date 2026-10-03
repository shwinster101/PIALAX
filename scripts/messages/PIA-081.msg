fix(trip-ideas): organizer is "in" on their own idea, never nudged

Found in the browser run of PIA-076..080: Family Plan showed "Me ·
waiting" and "Nudge 1 waiting" would text the family "still need an
answer from Me".

- On create (builder share and Ask the family) POST the organizer's
  ("Me") RSVP as "in"; mark it seen so it doesn't raise "new".
- ideaDecisionStage ignores the organizer's answer for "answered".
- Nudge text and nudge counts exclude the organizer.
- Tests: organizer auto-in, nudge wording.

Closes PIA-081.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
