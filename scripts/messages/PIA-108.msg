feat(rsvp): book searches cover the hub's other airport (PIA ↔ ORD, LGA ↔ JFK)

- tripIdeaAltAirports(dest) returns the other airports of the
  TRIP_IDEA_HUBS hub that contains dest: PIA→ORD, ORD→PIA, LGA→JFK;
  single-airport cities get none.
- tripIdeaBookRows adds `alts` (one Google Flights search per alternate
  airport, the traveler's own dates and headcount, skipped when the
  alternate is their origin).
- Book panel rows show "PIA ↗" (primary) and "ORD ↗" (outline); the
  footnote says "into either PIA or ORD".
- Answer card: "✈️ Find my flight · PIA" plus "or ORD ↗".
- Tests: test-trip-idea checks the alt airports and the LAX→ORD link on
  own dates; test-viewport checks the ORD button is in the book panel.

Closes PIA-108.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
