#!/usr/bin/env bash
# test-trust.sh — PIA-117: trust release gate — A1 unauthorized requests spend nothing, A2
# simultaneous trip answers all survive (IdeaRoom), A3 cache hits keep their
# age and cost no quota. In-process worker.js + both dashboards; no network.
#
# Usage:    bash scripts/test-trust.sh
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

printf "PIALAX test-trust · HERE=%s\n" "$HERE"
if ! command -v node >/dev/null 2>&1; then
  printf "  ··  node not found on PATH — skipping\n\nTEST-TRUST: SKIPPED (no node)\n"
  exit 0
fi
node "$HERE/scripts/test-trust.js" "$HERE"
exit $?
