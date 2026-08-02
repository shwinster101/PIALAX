#!/usr/bin/env bash
# test-viewport.sh — PIA-046: mobile layout regression gate.
#
# The audit found two layout defects that no amount of code review reliably
# catches: the "＋ New trip" form's Add/Cancel row sliding under the fixed
# "Get Live Fares" CTA at the end of a long list, and horizontal page overflow.
# Both are geometry, so they need a real browser with a real viewport. This
# drives headless Chromium over file:// URLs at the three spec viewports and
# asserts on measured bounding boxes.
#
# Deliberately NOT a hard dependency: the repo has no package.json and never
# will, so if Playwright is unavailable (the common case on a fresh machine)
# this SKIPS with exit 0 rather than blocking a ship — same contract as
# test-core.sh's node-absent path. It is a gate where it can run, and silent
# where it cannot.
#
# Usage:  bash scripts/test-viewport.sh
# Exit 0 = all viewport checks passed, or skipped (no Playwright / no node).
# Exit 1 = a measured layout assertion failed.

set -uo pipefail

SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
HERE="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"

note() { printf "  ··  %s\n" "$1"; }
pass() { printf "  OK  %s\n" "$1"; }

printf "PIALAX test-viewport · HERE=%s\n" "$HERE"

printf "\n▶ prerequisites\n"
if ! command -v node >/dev/null 2>&1; then
  note "node not found on PATH — skipping viewport tests (not a gate failure)"
  printf "\nTEST-VIEWPORT: SKIPPED (no node)\n"
  exit 0
fi
pass "node $(node --version)"

# Resolve Playwright without requiring a local install: honour an explicit
# NODE_PATH, then the usual global locations. If none resolve, skip.
if ! node -e "require.resolve('playwright')" >/dev/null 2>&1 \
   && ! node -e "require.resolve('playwright-core')" >/dev/null 2>&1; then
  for cand in \
    "$(npm root -g 2>/dev/null || true)" \
    /usr/lib/node_modules \
    /usr/local/lib/node_modules; do
    [ -n "$cand" ] || continue
    if [ -d "$cand/playwright" ] || [ -d "$cand/playwright-core" ]; then
      export NODE_PATH="$cand${NODE_PATH:+:$NODE_PATH}"
      break
    fi
  done
fi
if ! node -e "require.resolve('playwright')" >/dev/null 2>&1 \
   && ! node -e "require.resolve('playwright-core')" >/dev/null 2>&1; then
  note "playwright not resolvable — skipping viewport tests (not a gate failure)"
  note "to enable:  npm i -g playwright   (Chromium is already at \$PLAYWRIGHT_BROWSERS_PATH)"
  printf "\nTEST-VIEWPORT: SKIPPED (no playwright)\n"
  exit 0
fi
pass "playwright resolvable"

node "$HERE/scripts/test-viewport.mjs" "$HERE"
exit $?
