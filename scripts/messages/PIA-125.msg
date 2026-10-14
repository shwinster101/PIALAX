feat(alerts): one-tap nudge for day-old fares, in-app target alerts

Ashwin needs to hear when a fare drops to target, but cron is at the
Free-plan limit, Resend isn't set up, and CLAUDE.md forbids automatic
searches. So the app counts and offers a tap; it never fetches on its
own.

- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - tripStaleLegs: watched legs (planning/watching linked Trips cards)
    that had a live fare whose 24h cache lapsed.
  - tripStaleNudge, on boot (+2.5s) and on visibilitychange → visible:
    - fetches the RSVP docs (a free GET), counts the stale legs, and
      offers "Refresh (N searches)" (≤4) with the Worker's spend for
      today;
    - spends only on the tap;
    - with no token, or when locked, it stays quiet.
  - tripTargetAlerts: a traveler at or under target →
    - one fare_drop event per traveler per day (dedupe key
      leg_target|id|code|day) in pialax_alert_log_v1, which
      drainAlertOutbox emails once Resend exists;
    - a banner, a favicon dot and "(1)" in the tab title;
    - runs after every tripLegsFetch and on target change.
  - tripBannerShow / tripBannerHide / tripAttention: one in-app banner
    where alerts win over the nudge; ✕ clears it.
  - tripDailyCapMark / tripDailyCapHit (pialax_daily_cap_v1): a lock
    until the next UTC day.
- Both files:
  - fetchFlights: a 429 with code daily_cap → tripDailyCapMark, not
    markQuotaExceeded (which locked the month);
  - isFetchLocked honours the daily lock, and the locked toast says
    "resume tomorrow";
  - banner CSS;
  - desktop gets the same data-URI tab icon as mobile (CSP img-src
    allows data:).
- No Notification API: nothing runs in the background, so you're
  looking at the app when an alert fires.
- CLAUDE.md: the quota rule notes the nudge and the daily-cap lock.
- Tests:
  - test-trust: a daily_cap 429 locks today only; a SerpAPI 429 still
    locks the month.
  - test-trip-idea:
    - a 30h-old leg counts as stale, a never-priced one doesn't;
    - no token → quiet, 0 calls;
    - $389 ≤ $420 alerts once a day (fare_drop, queued); above target
      it doesn't;
    - the daily lock leaves the month alone.
  - test-viewport: "1 fare is a day old · Refresh (1 search)" on open,
    44px targets, 0 searches until tapped, ✕ dismisses it.

Closes PIA-125.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
