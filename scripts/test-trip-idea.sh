#!/usr/bin/env bash
# test-trip-idea.sh — PIA-117: preflight wrapper for the Trip Idea Builder suite (the shared block
# must stay identical in both HTML files and scripts/trip-idea-builder.js).
#
# Usage:    bash scripts/test-trip-idea.sh
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

printf "PIALAX test-trip-idea · HERE=%s\n" "$HERE"
if ! command -v node >/dev/null 2>&1; then
  printf "  ··  node not found on PATH — skipping\n\nTEST-TRIP_IDEA: SKIPPED (no node)\n"
  exit 0
fi
node "$HERE/scripts/test-trip-idea.js" "$HERE"
exit $?
