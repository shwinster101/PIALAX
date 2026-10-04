test(trust): A1/A2/A3 adversarial gate in preflight + verify-live for the deploy

- scripts/test-trust.js runs worker.js in process with:
  - a counting fetch stub;
  - a KV/DO-storage mock whose reads wait at a barrier, forcing the
    lost-update interleaving;
  - an in-memory Durable Object namespace running the real IdeaRoom.
- A1: 17 unauthorized or malformed shapes make 0 upstream calls;
  - no secret → fail closed;
  - /account strips the key and email;
  - a miss makes exactly 1 canonical call;
  - SERP and EXTRACT caps → 429 with no spend;
  - with no token, the client never calls the Worker (both files).
- A2:
  - 3 respond + 1 booked + 1 update racing all survive with
    serialized:true;
  - control: the KV-only path loses 4 of 5;
  - lazy KV → room migration writes through.
- A3:
  - MISS then HIT, params reordered, 1 upstream call, same
    X-Fetched-At, server counter = 1;
  - a HIT still needs the token;
  - the fetchFlights/fareStamp/freshnessLabel sandbox from both HTML
    files: the HIT keeps its age ("CACHED 5h ago"), with no
    bumpQuota and the TTL from fetched_at.
- test-trust.sh and test-trip-idea.sh wrappers; both added to the
  preflight suites.
- scripts/verify-live.sh:
  - the same outcomes against the deployed Worker with curl;
  - PIALAX_TOKEN from env only;
  - an untokened /account probe must answer 401 before anything that
    could spend is sent;
  - creates and drops a "PIALAX smoke test" trip;
  - spends 1 SerpAPI search;
  - validated end to end against a local server running the new
    worker.js.
- CLAUDE.md documents the token, caps, KV fare cache, IdeaRoom and
  verify-live.

Refs PIA-117 (closes after verify-live passes on the deployed Worker).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
