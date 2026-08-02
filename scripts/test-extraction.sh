#!/usr/bin/env bash
# test-extraction.sh — PIA-047: Trip Assistant data-layer suite.
#
# Runs scripts/fixtures/extraction-fixtures.json against the deterministic
# fallbackParse() and the fact-merge / TripState logic captured from BOTH html
# files. Gates, hardest first: nothing invented, every source_text quoted
# verbatim from the input, >= 90% field accuracy, the merge contract (a
# proposed fact never overwrites a confirmed one), and an idempotent,
# non-destructive notes migration.
#
# Shares scripts/harness.js with test-core.sh so the two suites cannot drift
# apart on the IIFE markers they both depend on.
#
# Usage:    bash scripts/test-extraction.sh
# Exit 0 = all checks passing (or node absent — skipped with a notice).
# Exit 1 = any gate failed, or a symbol could not be captured (fails loudly
#          rather than silently testing nothing).

set -uo pipefail

# Same symlink-resolution as preflight.sh (harmless here since this script is
# not installed as a hook, but keeps the two scripts' HERE-detection identical).
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
HERE="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"

step() { printf "\n▶ %s\n" "$1"; }
pass() { printf "  OK  %s\n" "$1"; }
warn() { printf "  XX  %s\n" "$1"; }
note() { printf "  ··  %s\n" "$1"; }

printf "PIALAX test-extraction · HERE=%s\n" "$HERE"

step "node availability"
if ! command -v node >/dev/null 2>&1; then
  note "node not found on PATH — skipping test-extraction (not a gate failure)"
  printf "\nTEST-EXTRACTION: SKIPPED (no node)\n"
  exit 0
fi
pass "node $(node --version)"

# The harness itself lives in Node (regex/eval/Proxy shim is far more natural
# there than in bash). Quoted heredoc delimiter → bash does zero expansion on
# the JS body, so $ and backtick-heavy code (regexes, template-free string
# concat) passes through untouched.
node "$HERE/scripts/test-extraction.js" "$HERE"
exit $?
