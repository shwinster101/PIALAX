fix(mobile): Trip Idea Builder above the tab bar on iPhone (CSS only)

- #trip-idea-builder-bd z-index 1300 (was 500, under the 600 tab bar;
  also clears the 1200 trip sheet that opens it via "See answers").
- Scroll lock: html:has(body.trip-idea-open), body.trip-idea-open
  overflow hidden; builder body overscroll-behavior: contain.
- Phone layout (<=640px or short landscape): full-screen, safe-area
  insets on header/body/footer, footer wraps — primary first and full
  width, others two-up (three-up in landscape) at min-height 44px.
- Close button 44x44; "Build a trip idea" button 48px.
- Shared builder JS block and shared builder CSS untouched (overrides
  live in #ios-layer).
- test-viewport: inputs + results stages at 375x667 and 844x390 —
  every footer button >= 44px, on screen, elementFromPoint hits it;
  body locked; close >= 44. On the old code the primary button could
  not be clicked at all (tab bar intercepted the tap).

Closes PIA-087.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
