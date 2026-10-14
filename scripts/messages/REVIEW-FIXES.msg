fix(sprint): address the pre-merge review of PIA-121 to PIA-130

An independent review of the whole branch diff found 11 defects. Each
is fixed here and pinned by a test that fails on the old code.

- Security:
  - tripFareParse normalises google_flights_url (URL: https,
    www.google.com, /travel/flights) and rejects quotes, backticks,
    backslashes, whitespace and < >.
  - tripFarePick re-checks what it reads from the cache, so
    _googleFlightsUrl can't put a tampered link into an unescaped href.
- worker.js, alert cron:
  - groups are built from all legs, and a group with a departed leg
    is skipped;
  - ALERT_CRON_MAX limits real searches only (maySpend); cached
    prices and reminders still run for every watch;
  - st.last_priced (set only on a price) gates the group sum;
  - each group sits in its own try/catch, so alerts:state is always
    written;
  - groups get one departure reminder each and re-alert only after a
    further $10 drop.
- Shared block (both HTML files + scripts/trip-idea-builder.js):
  - tripTargetAlerts:
    - queues email only when alertPrefsFor(trip).enabled;
    - the banner's once-a-day dedupe persists
      (pialax_leg_alerts_seen_v1);
    - drains the outbox only when something was queued.
  - tripAlertWatches: a traveler with a departed leg sends plain
    watches (no group/target).
  - _tripIdeaRewriteAnswer:
    - a busy tap gets a "Saving…" toast;
    - it reads the RSVP fresh via _tripIdeaApi and writes nothing if
      that fails;
    - it repaints (sheet included) after success or failure.
  - tripLegsFetch: one run at a time (_tripLegsBusy) across card,
    banner and sheet.
  - Pickup: a round-trip traveler reads "flies a round trip — not
    compared", and fewer than 2 rows is never "different airports".
- Both files: alertWatchesPayload skips a linked trip until its RSVP
  has loaded (never the whole-family watch).
- Tests:
  - test-trip-idea:
    - a quote-carrying link can't escape the href;
    - watches: none before load, the departed traveler loses
      group/target;
    - round-trip pickup;
    - the busy guard;
    - no fresh read → no write;
    - alerts off → banner but no email.
  - test-trust:
    - C5 a departed leg → no group email;
    - C6 ALERT_CRON_MAX=1 → 3 cached + 1 search, 5 checked;
    - C7 a stale price never completes a group.

Refs PIA-121, PIA-122, PIA-124, PIA-125, PIA-126, PIA-130.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
