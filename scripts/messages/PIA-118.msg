fix(worker): exact daily spend caps via a SpendMeter Durable Object

- spendGate: with env.SPEND_METER, one queued check-and-reserve per
  paid call in a global SpendMeter (idFromName('spend')).
  - Storage: spend:<kind> = {day, used}; it resets when the UTC day
    changes.
  - Without the binding, the KV counter (soft) path is unchanged.
- spendStatus feeds /account `spend: {serp, extract, email: {used,
  cap}, exact}`. It's free and token-gated.
- wrangler.toml: SPEND_METER binding, [[migrations]] v2
  new_sqlite_classes = ["SpendMeter"].
- test-trust:
  - B1: 10 parallel searches with cap 3 → exactly 3 upstream calls
    and 7 × 429; 5 parallel extracts with cap 1 → 1 call.
  - B2 control: the KV path overshoots (10 calls).
  - B3: /account spend is exact:true or exact:false.
- verify-live: B3 asserts that the meter is exact and moves +1 for the
  run's single search. Still 1 SerpAPI search per run; passes 22/22
  against a local server running this worker.js.

Refs PIA-118 (closes after verify-live passes on the deployed Worker).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
