#!/usr/bin/env bash
# PIA-147: required v2 layout checks. Missing Node/Playwright is a failure.
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
  note "node not found on PATH — viewport tests require this dependency"
  printf "\nTEST-VIEWPORT: FAILED (no node)\n"
  exit 1
fi
pass "node $(node --version)"

# Resolve Playwright without requiring a local install: honour an explicit
# NODE_PATH, then the usual global locations. If none resolve, fail.
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
  note "playwright not resolvable — viewport tests require this dependency"
  note "to enable:  npm i -g playwright   (Chromium is already at \$PLAYWRIGHT_BROWSERS_PATH)"
  printf "\nTEST-VIEWPORT: FAILED (no playwright)\n"
  exit 1
fi
pass "playwright resolvable"

node "$HERE/scripts/test-viewport.mjs" "$HERE"
exit $?
