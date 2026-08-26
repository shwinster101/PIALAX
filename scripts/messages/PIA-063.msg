feat(alerts): real fare alerts — email delivery + daily server-side check

Realizes PIA-052 on top of the PIA-051 contract. The dashboard can finally
tap Ashwin on the shoulder — the "missed a family opportunity" fix.

worker.js + wrangler.toml:
- POST /alert — sends ONE client-built AlertEvent by email via Resend.
  Validation mirrors the client's sanitizeAlertEvent and fails closed;
  upstream error bodies are never forwarded (same rule as /extract);
  501 no_key when RESEND_API_KEY is absent so the client degrades to
  preview-only quietly.
- POST /alerts/sync — stores the device's active fare watches (≤10,
  strict allowlist validation, whole-payload fail-closed) in KV.
  GET /alerts/status reports config + last cron run with a masked email.
- scheduled() daily Cron Trigger (0 15 * * * ≈ 10am CT) — re-prices each
  future-dated watch via SerpAPI THROUGH THE SAME 24h EDGE CACHE the
  browser uses (a day the family browsed costs zero extra quota; hard
  cap 8 fetches/run ≈ 240/month worst case vs the 1000 plan). Emails on
  a drop ≥ threshold below baseline (re-alerts only on a further ≥$10
  drop — never a daily repeat) and a once-only departure-window
  reminder. Per-watch state + run summary live in KV; one bad watch
  never kills the run.
- wrangler.toml carries the cron trigger + the full one-time setup
  (Resend key, KV namespace). Everything degrades gracefully until then.

pialax.html + pialax-mobile.html (mirrored):
- Outbox drain: unsent pialax_alert_log_v1 events POST to /alert and are
  marked `sent` (flag now survives the sanitize round-trip); ✉ sent
  markers in the per-trip log. 501 → preview-only for the session, no
  retry spam; network failure → retried on a later render.
- Watch sync: alert-enabled, still-shoppable, future-dated trips with a
  3-letter route sync to /alerts/sync (debounced, skipped when the
  payload is unchanged). Baseline = the card's current estimate.
- Per-trip Alerts panel: live delivery-status line (armed / preview-only
  + why) and a "Send test email" button proving the pipe end to end.
- Admin email field label updated; maintenance is debounced off
  renderWatchlist and the email field, assistant-flag surface only.

Tests: worker suite grown 36 → 60 checks (delivery validation + happy
path, sync/status, cron drop + no-repeat + reminder-once + skip-reasons,
key-leak guard). New client E2E (headless Chromium, Worker mocked at the
CSP-pinned proxy origin): 22/22 — drain, sent-marking, sync payload,
test button, tab stability, and the 501 fallback on both files.
Watchlist button audit re-run 126/126. 27 + 217 core/extraction checks
unchanged. node --check clean. Preflight: known sandbox cdnjs-403 SRI
NO-GO only.

Activation (one-time, on the Mac): resend.com signup → API key;
wrangler kv namespace create ALERTS (paste id into wrangler.toml);
wrangler secret put RESEND_API_KEY; wrangler deploy. Until then the
panel stays in preview-only mode by design.

Rollback: revert.
