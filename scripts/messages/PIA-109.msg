feat(trips): Thanksgiving = in to PIA Fri Nov 20, home from ORD Sun Nov 29

- Thanksgiving seed (both files): dep 2026-11-20 (Peoria parade) and
  gf.returnFrom 'ORD'; route and notes say so.
  _scrubPrebookingOverrides drops a saved dep of the old 2026-11-25 so
  existing devices pick up Nov 20.
- handoffIntentsForWatchlistItem (family): openjaw/returnFrom from
  gf.returnFrom, so each traveler gets two one-way Google Flights links
  (Outbound X → PIA, Return ORD → X) through the existing multi-leg
  adapter.
- RSVP block: TRIP_IDEA_HOME_FROM {PIA:'ORD'} plus tripIdeaOpenJaw make
  "In PIA ↗ / Home ORD ↗" the primary per-traveler search (own dates,
  one-ways).
  - The answer card shows "✈️ Fly in · PIA / 🏠 Fly home · ORD".
  - Round trips into PIA or ORD move to a footnote fallback.
  - Destinations without a home-from preference are unchanged.
- Tests: the Thanksgiving card dates and the four open-jaw links; RSVP
  rows' open-jaw URLs; viewport Book panel / Fly-in link.

Closes PIA-109.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
