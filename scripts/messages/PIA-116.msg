fix(worker): serialize shared-trip writes through an IdeaRoom Durable Object

- New export class IdeaRoom, one per trip via idFromName(id):
  - a promise queue runs each request start to finish, including the
    hash and KV awaits;
  - store.read() loads the doc from DO storage, or on first touch from
    KV (migration);
  - store.write() puts to DO storage, then writes through to KV with the
    same 400-day TTL, plus an alarm that clears the room when the trip
    expires.
- handleIdea:
  - GET and respond/booked/update forward to the room (Origin,
    X-Idea-Key and User-Agent only);
  - POST /idea seeds the room with /init so the first answers don't
    depend on KV propagation.
- ideaMutate holds the existing mutation logic unchanged; each op still
  applies only its own delta to the doc it reads inside the queue.
- With no IDEA_ROOM binding the KV path runs as before, and responses
  carry serialized:false so verify-live can tell the two apart.
- wrangler.toml: [[durable_objects.bindings]] IDEA_ROOM/IdeaRoom and
  [[migrations]] v1 new_sqlite_classes.
- test-viewport: the in-process Worker gets an IDEA_ROOM mock running
  the real class, so the RSVP browser flows exercise the room.

Refs PIA-116 (closes after verify-live passes).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
