fix(alerts): token-gate /alerts/status; cron spends like the dashboard

Four defects in the dormant server-alert path have to close before
PIA-128 binds ALERTS:
- /alerts/status answered anyone (masked email, watch count, last
  run);
- the cron skipped the KV fare cache (caches.default doesn't persist on
  workers.dev) and both daily caps;
- family-trip watches carried a whole-family mock total as their
  baseline, so a single fare looked like a huge drop;
- the "cron trigger already in wrangler.toml" comment was wrong.

- worker.js:
  - handleAlertsStatus: authGate first.
  - cronFetchPrice: canonicalSearch, then fareCacheGet / fareCachePut
    (the /search KV cache). A miss goes through spendGate('serp'); when
    capped the run stops and records summary.capped.
  - cronSend: every cron email goes through spendGate('email').
  - validateWatch keeps an optional `group` (ALERT_ID_RE) and `target`.
    Grouped legs send no per-leg drop or reminder emails. After the
    loop, a group whose legs were all priced this run and whose sum is
    ≤ target sends one email per day (state 'group:<id>').
  - CRON_MAX_FETCHES_DEFAULT is 4; the setup comment is fixed.
- Shared block (both HTML files + scripts/trip-idea-builder.js):
  tripAlertWatches(item, prefs) gives a linked trip's legs as watches:
  thanksgiving_LAX_in / _home, group thanksgiving_LAX, target from
  tripLegTargetFor, baseline = that leg's live fare.
- Both files: alertWatchesPayload uses tripAlertWatches for linked
  trips.
- verify-live.sh A1: /alerts/status without a token → 401 (free).
- Tests:
  - test-trust:
    - A1 /alerts/status without a token → 401, 0 upstream;
    - C1 a cron KV HIT spends 0;
    - C2 SERP_DAILY_CAP=1 → exactly 1 search, capped;
    - C3 $199 + $199 ≤ $400 → one email across legs and runs;
    - C4 status still answers the token.
  - test-trip-idea: the payload is Ashwin's two legs ($189/$200
    baselines, group + $420 target), and the real Worker's
    /alerts/sync accepts it.
- MITIGATED.md gets its entry once this is deployed and verify-live
  passes. PIA-128 (turning server alerts on) stays open.

Closes PIA-130 once deployed and verify-live passes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
