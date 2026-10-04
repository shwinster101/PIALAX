fix(settings): saving the organizer token can't disconnect the Worker

- Bug: the Proxy URL input was filled only from a saved override, so it
  was blank on most devices. Tapping "Connect Proxy" to save a pasted
  token set PROXY_URL to '', which meant mock data (seen on the iPhone).
- Fix, in both files:
  - PROXY_URL_DEFAULT; showProxyInUse() pre-fills the box with the
    Worker in use;
  - apply: a blank box keeps PROXY_URL (or the default); ✕ Disconnect
    is the only way to turn live fares off;
  - setTokenStatus(): a #api-token-status line ("No token yet",
    "✗ Token rejected", "✓ Token accepted · Worker searches today
    N/cap" from /account spend). syncSerpApiAccount sets it, and a
    401 reads as rejected;
  - the button now reads "Save & connect".
- test-viewport: both files boot with the Worker URL shown; a wrong
  token → rejected, the right one → accepted 1/30, and the saved
  proxy URL stays the Worker. These checks fail on the old code.

Closes PIA-119.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017VnXPsUC7NVKLPVMyUYmS8
