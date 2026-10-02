feat(trip-ideas): RSVP links so each traveler answers for themselves

- Share proposal POSTs the idea to the Worker (/idea) and copies a
  ?idea=<id> link; the organizer edit key stays in this device's
  localStorage (pialax_idea_keys_v1).
- ?idea= opens a shared view: proposal + fare, per-member status
  (in / maybe / out / waiting), travelers confirmed, and the common
  date window across in/maybe answers; RSVP form posts /idea/respond.
- Members come from familyForDate (PIA=2, LAX, JAX->LGA after move).
- Falls back to the read-only ?tripIdea= link on 501/404/no proxy.
- syncURL keeps ?idea / ?tripIdea so a reload reopens the view.
- Styles for the shared view (and the PIA-073 decision panel).
- Tests: end-to-end through the real worker.js on an in-memory KV.

Closes PIA-072.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
