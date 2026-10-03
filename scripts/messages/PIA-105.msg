feat(rsvp): "Book for these dates" — one Google Flights search per traveler

- tripIdeaFlightUrl(from, to, dep, ret, adults) builds the Google Flights
  ?q= link: round trip "through", "one way" without a leave date, and
  "for N adults" when N > 1. It returns nothing without dates or when
  the origin is the destination.
- tripIdeaBookRows(doc) lists in/maybe travelers (no hosts), each with
  their origin, the destination airport, their own available_from/to,
  headcount and link.
- RSVP: a collapsed <details class="trip-idea-book"> under the window
  strip, with one row per traveler ("Search ↗") and a one-line footnote.
  The open state survives redraws.
- Answer card: "✈️ Find my flight" for the person's own search. Hidden for
  hosts, "out" answers and anyone without dates.
- Tests:
  - test-trip-idea: URL shapes and rows (hosts and "out" skipped, own
    airport and dates);
  - test-viewport: Find my flight goes to LGA→PIA Nov 26–30, the panel
    lists both travelers on their own dates, no overflow at 375 and 390.

Closes PIA-105.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
