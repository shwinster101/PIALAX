test(trip-idea): keep age/confidence boundary checks off the clock edge

Three checks sat exactly on a boundary: "24h ago", confidence at 6h,
and confidence at 24h. If one millisecond passed between building the
timestamp and reading it, the value tipped into the next tier ("1d
ago", "recheck", "stale"). One preflight run failed this way during
the sprint.

- The checks now sit just inside each boundary (23.9h, 5.99/6.01h,
  23.99/24.01h). Same rules, no race.

Refs PIA-123, PIA-124.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Dug5vjZj6GAEUycz3AfeN6
