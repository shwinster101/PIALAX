#!/usr/bin/env bash
# test-gflinks.sh — PIA-133: preflight wrapper for the one-link-builder suite.
#
# scripts/trip-model.js builds every hand-off from the /idea record: Google
# Flights (tfs; q= only if the encoder fails), Explore, Flighty and the calendar
# event. The suite pins the live-verified E1/E2/E3/E6/E7 links and the v2
# sample links as golden strings, decodes every link it produces, and checks
# that no calendar or share link carries an edit key or token. Offline and
# clock-free: today is pinned to 2026-10-17 and fetch/http/https/net are stubbed
# to fail, so nothing calls Google.
#
# Usage:    bash scripts/test-gflinks.sh
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

printf "PIALAX test-gflinks · HERE=%s\n" "$HERE"
if ! command -v node >/dev/null 2>&1; then
  printf "  ··  node not found on PATH — skipping\n\nTEST-GFLINKS: SKIPPED (no node)\n"
  exit 0
fi
node "$HERE/scripts/test-gflinks.js" "$HERE"
exit $?
