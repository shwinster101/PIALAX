#!/usr/bin/env bash
# test-trip-model.sh — PIA-132: preflight wrapper for the v2 trip-model suite.
#
# scripts/trip-model.js turns one /idea record into everything a v2 screen
# shows. The suite pins every PIA-132 acceptance criterion and round-trips the
# write builders through the real worker.js /idea handlers in-process. Offline
# and clock-free: today is pinned to 2026-10-17 and fetch is stubbed to fail.
#
# Usage:    bash scripts/test-trip-model.sh
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

printf "PIALAX test-trip-model · HERE=%s\n" "$HERE"
if ! command -v node >/dev/null 2>&1; then
  printf "  ··  node not found on PATH — skipping\n\nTEST-TRIP-MODEL: SKIPPED (no node)\n"
  exit 0
fi
node "$HERE/scripts/test-trip-model.js" "$HERE"
exit $?
