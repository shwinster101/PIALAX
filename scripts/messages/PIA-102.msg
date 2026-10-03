feat(rsvp): best-coverage window and who's-there day strip

- ideaBestWindow(doc):
  - groups the answered span into runs of days with the same people
    present (in/maybe, hosts excluded because they're home);
  - picks the largest group, then the longest run;
  - returns from/to, there/total, everyone, the missing people with a
    reason ("here Nov 29–30" / "no dates yet"), and the span.
- tripIdeaWindowText: "Everyone’s there …", "Best window … · N of M there
  (…)", "Dates so far …" or "No dates picked yet". It replaces the single
  ideaCommonWindow line; that function is kept for its callers and tests.
- tripIdeaDayStripHtml: a per-person grid of day cells (up to 21 days),
  hosts as a full bar, maybe shown lighter, the window outlined, and the
  window text as its aria-label.
- Organizer: "📅 Hold <window>" calls tripIdeaHoldWindow, then
  tripIdeaHoldDates(itemId, win), which replaces the hold for the
  proposed dates. The header reads "Proposed Nov 25–29".
- Tests:
  - test-trip-idea: full overlap, partial overlap with the missing person
    named, no-dates and nobody cases, strip rows and shading;
  - test-viewport: "Everyone’s there Nov 26–29", 4 strip rows, the strip
    fits at 375 and 390.

Closes PIA-102.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
