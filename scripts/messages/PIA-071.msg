feat(worker): shared trip-idea storage with RSVP and organizer endpoints

- New IDEAS KV binding (commented setup steps in wrangler.toml).
- POST /idea creates a record: 128-bit id + 256-bit edit key; only the
  key's SHA-256 is stored, never returned.
- GET /idea, POST /idea/respond (one RSVP per listed member; closed once
  booked or dropped), POST /idea/update (edit key required; proposal edits
  and decision transitions proposed -> chosen -> booked/dropped with
  estimate vs actual delta).
- Strict allowlist validation, 50-entry event log, 400-day TTL,
  501 no_kv when unbound so the client falls back to read-only links.
- Tests: 21 new worker checks.

Closes PIA-071.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
