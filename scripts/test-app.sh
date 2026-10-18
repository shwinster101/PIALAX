#!/usr/bin/env bash
# test-app.sh — PIA-134: preflight wrapper for the v2 shell suite (app.html in Node).
#
# Loads app.html's app IIFE through scripts/harness.js and checks the parts of the
# v2 shell that need no browser: the model region drift test, the router (organizer,
# devices and list links, v1's ?w= / ?wl= payloads, the v1 list read once), the
# v1-format storage keys, the trip store (refresh on open / focus / 60s, pending
# writes) and optimistic writes against the real worker.js /idea handlers in-process.
# Offline and clock-pinned (2026-10-17). The rendered-word and layout checks live in
# test-words.sh and test-viewport.sh.
#
# Usage:    bash scripts/test-app.sh
# Exit 0 = all checks passing (or node absent — skipped with a notice).
# Exit 1 = any check failed.

set -uo pipefail

SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
HERE="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"

printf "PIALAX test-app · HERE=%s\n" "$HERE"
if ! command -v node >/dev/null 2>&1; then
  printf "  ··  node not found on PATH — skipping\n\nTEST-APP: SKIPPED (no node)\n"
  exit 0
fi
node "$HERE/scripts/test-app.js" "$HERE"
exit $?
