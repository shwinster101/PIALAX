fix(mobile): instant Trips paint, tab taps survive boot, map download timeout

- boot(): assign window globals first; compute the landing tab before
  any await; seed S.geoData with the offline outline; paint Trips,
  setMode and setActiveTab(landing) synchronously; then fetch borders
  in the background and redraw.
- setActiveTab(tab, {auto}) — any non-boot call marks _userPickedTab,
  and boot never overrides it (fixes the 360px viewport-test failure).
- fetchJsonWithTimeout (4s, AbortController) for us-atlas and
  world-atlas; desktop gets the same timeout (boot order unchanged).
- test-viewport: hung-CDN boot checks (globals at DOMContentLoaded,
  Trips visible <= 1.5s, deep-link tab tap sticks). All three fail on
  the previous code.

Closes PIA-084.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
