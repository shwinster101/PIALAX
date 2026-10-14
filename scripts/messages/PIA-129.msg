feat(family): Thanksgiving total board — one number for the family

The family needed one number: Ashwin + Anjo combined, the plan vs the
cheapest option seen, and who has booked. The leg model (PIA-121),
flex variants and nearby winners (PIA-122) already hold the pieces.

- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - _tripLegBest: the cheapest live fare for one leg across ±2 days
    (valid dates only) and the nearby winner. It reads the cache only.
  - tripTotalBoard(doc):
    - still-to-book total (per ticket × headcount, from
      tripTravelerCost, the same number as the route cards);
    - live or estimated;
    - cheapest seen and the saving, only when every leg is live
      (LIVE vs LIVE);
    - per traveler, "how" (e.g. "Mon 25 in", "BUR in");
    - booked count.
  - tripTotalBoardHtml: "🧮 <trip> · family total", with ~$ and a
    label when estimates are in.
  - tripLinkedSummaryHtml = board + pickup timeline.
- Both files: board CSS.
- Tests:
  - test-trip-idea:
    - $721 still to book; Anjo a day earlier → $300, cheapest $689,
      saves $32;
    - an estimated leg → ~$, labelled, no saving;
    - booking Ashwin moves him to ✓ Booked, 1 of 2.
  - test-viewport (360/390/430): the board leads the breakdown, labels
    estimates and fits.

Closes PIA-129.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
