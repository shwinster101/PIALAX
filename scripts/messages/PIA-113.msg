feat(mobile): Family tab opens a linked trip summary-first, planner folded

- New #linked-trip-summary card (title, weekday dates, tripIdeaCountsLine)
  with "👥 Open RSVP" (_tripIdeaOpenRemote) and "Planner ▸" (toggles
  #plan-block1.open).
- syncLinkedTripChrome() runs at the top of renderGroupCost and toggles
  body.linked-trip.
- When linked:
  - Step 1 (#plan-block1) is hidden until Planner;
  - the cheapest-week section and the fairness ledger render inside
    <details class="fold-lite">;
  - the last-trip chip and the "Keeps the hub…" note are hidden.
- Mobile only; desktop's Family layout is unchanged.
- test-viewport: open Thanksgiving from Trips → More actions → Open; the
  summary shows "Fri Nov 20 – Sun Nov 29" and Open RSVP; Step 1 is hidden
  until Planner; no overflow.

Closes PIA-113.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
