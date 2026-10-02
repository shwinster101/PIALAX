feat(trip-ideas): decision log with whole-family estimate vs actual

- Organizer panel on shared ideas (edit key required): choose this
  option -> mark booked with the actual total -> reopen / drop.
- Worker estimate_total uses the idea's whole-family estimate
  (tripIdeaFamilyEstimate: every hub x travelers, home base $0) instead
  of one hub's fare, so delta_pct compares like with like.
- Local history (pialax_decision_log_v1) + "Past family decisions" list
  in the builder with the average actual-vs-estimate gap; tap to reopen.
- Fix: pialax-mobile.html had no builder dialog/button, so ?idea= and
  ?tripIdea= links rendered nothing on phones; markup now matches desktop.
- Fix: RSVP radio buttons inherited full-width input styles.
- Tests: organizer flow end to end through worker.js, family estimate,
  edit-key gate, history stats; worker check for family estimate.

Closes PIA-073.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
