feat(worker): RSVP link previews; prices only for the organizer's key

Worker:
- GET /i/<id>:
  - link-preview fetchers (facebookexternalhit/Twitterbot — iMessage — and
    others) get a small HTML page with escaped og:title (trip title) and
    og:description ("Late Nov · Tap to say in / maybe / out and pick your
    dates"): no price, no exact date, noindex, plus a script redirect for
    people misread as fetchers;
  - everyone else gets a 302 to DASH_URL?idea=<id>;
  - malformed id → 400 page, unknown id → 404 page.
- GET /idea and POST /idea/respond return ideaGuestView (recommendation
  and decision fares nulled) unless X-Idea-Key hashes to edit_hash.
  Responses carry `organizer` and `preview:true`; create and update
  (organizer by definition) return the full doc.
- CORS allows the X-Idea-Key header.
- IDEA_STATUSES / IDEA_STAGES / ALERT_TYPES lookups use hasOwnProperty.

Client (builder block, all three copies):
- _tripIdeaApi records the Worker's `preview:true` in
  pialax_idea_preview_v1. Only then does it send X-Idea-Key, which an
  older Worker's CORS rules would refuse.
- _tripIdeaOpenRemote re-asks with the key on first contact, and drops a
  key the Worker rejects (family view + toast).
- tripIdeaInviteUrl(id) gives <PROXY_URL>/i/<id> once previews are known,
  else the app's ?idea= link. Used by invites, nudges and calendar holds.

Tests:
- test-worker (+7): guest vs organizer vs wrong-key views; respond view;
  CORS header; iMessage-UA preview page (escaping, no price/date, link);
  302 for a phone UA; 404/400 pages; prototype-name statuses rejected.
- test-trip-idea: share link is /i/<id> with a preview Worker; the
  ?idea= link before one is known.

Deploy: `wrangler deploy` once. Until then the app behaves as before.

Closes PIA-104.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
