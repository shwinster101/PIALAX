feat(worker)!: organizer token + daily caps on paid endpoints

- Worker:
  - tokenOk/authGate: constant-time X-Pialax-Token vs PROXY_TOKEN
    (≥16 chars); a missing secret or token → 401 before any upstream
    fetch.
  - spendGate: KV quota:<kind>:<UTC date> vs SERP/EXTRACT/EMAIL
    _DAILY_CAP → 429. It counts only real upstream calls.
  - Routes: GET /search (and legacy /) for fares, GET /account (and
    ?action=account) returning quota fields only; any other GET → 404.
  - canonicalSearch: allowlisted, validated params, sorted; unknown,
    duplicate or no_cache → 400.
  - The fare cache moves from caches.default (not persisted on
    workers.dev) to KV fare:<sha256>, stored as {fetched_at, body}.
    A HIT answers with X-Proxy-Cache: HIT and the original
    X-Fetched-At, and makes no upstream call.
  - /extract, /alert and /alerts/sync are token-gated; /idea* and /i/
    stay free.
- Client (both files):
  - proxyToken/setProxyToken/paidHeaders; Advanced → Organizer token.
  - Fares go to /search with the header. With no token, or on a 401,
    they stay on sample data with a one-time hint and no request.
  - Account, extract and alert calls send the header; alert
    maintenance skips without a token.
  - The organizer link carries &t=; _tripIdeaTakeHashKey stores it
    and strips it.
- test-worker: default test token; full search params.

BREAKING CHANGE: the Worker needs the PROXY_TOKEN secret; paid routes
reject untokened calls.

Refs PIA-114 (closes after verify-live passes).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
