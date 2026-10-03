fix(mobile): iPhone app shell — meta, toast, landscape column, banner

- Meta: color-scheme, theme-color (dark/light), apple-mobile-web-app-*,
  format-detection telephone=no, data-URI SVG icon (fixes favicon 404).
- body min-height 100vh then 100svh (svh now actually applies).
- New <style id="ios-layer"> loaded last (mobile-only overrides; the
  shared :root tokens and builder CSS stay identical to desktop).
- Toast: bottom = safe + 68px (+136px only with the Family CTA), wraps
  (max-content, max-width min(400px, 100vw-32px)), top-anchored over
  the trip sheet / builder; showShareToast resets its hide timer.
- Landscape: tab bar + sticky CTA padded to the 430px column; Advanced
  Settings centred; phone layouts (hub cards, route picker) also apply
  at (orientation:landscape) and (max-height:500px).
- Quota banner gets data-tier; the advisory "mock" tier shows on Trips
  only, copy points to Advanced Settings below.
- test-viewport: toast placement/wrap + column alignment at 390x844 and
  844x390, meta presence.

Closes PIA-086.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
