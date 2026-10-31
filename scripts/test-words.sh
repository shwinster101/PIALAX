#!/usr/bin/env bash
# test-words.sh — PIA-134: the strict word gate over app.html (headless Chromium).
#
# Renders every screen and popup of the v2 shell against fixtures (an 8-member trip
# with long names, unknown airports, a revealed token, long typed values, a failed
# refresh …) and fails any screen over 14 (PIA-159; 10 before it) or popup over 20
# strict words. It also
# checks the shell's browser-only criteria: tabs, segment, sheets, ⓘ, long-press
# labels, ⚙ reachability and link handling. See scripts/test-words.js.
#
# Deliberately NOT a hard dependency, like test-viewport.sh: without node or
# Playwright (or its Chromium) it SKIPS with exit 0.
#
# Usage:  bash scripts/test-words.sh
# Exit 0 = all checks passing, or skipped.  Exit 1 = a word budget or check failed.

set -uo pipefail

SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
HERE="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  printf "PIALAX test-words · HERE=%s\n  ··  node not found on PATH — skipping\n\nTEST-WORDS: SKIPPED (no node)\n" "$HERE"
  exit 0
fi
node "$HERE/scripts/test-words.js" "$HERE"
exit $?
