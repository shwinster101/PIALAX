#!/usr/bin/env bash
# test-worker.sh — PIA-048: POST /extract contract suite for worker.js.
#
# Runs worker.js against a mocked Anthropic API and a mocked env — no network,
# no API key, nothing deployed. It asserts the paths that are otherwise painful
# to reproduce by hand: an unconfigured Worker, a bad key, a hanging upstream,
# and a model reply that is malformed, off-schema, or simply not the forced
# tool call. All of those must FAIL CLOSED, because unvalidated model output
# crossing into stored trip state is the failure this route exists to prevent.
#
# Also pins the existing SerpAPI GET path, which must be unaffected.
#
# Usage:    bash scripts/test-worker.sh
# Exit 0 = all checks passing (or node absent — skipped with a notice).
# Exit 1 = any check failed.

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

printf "PIALAX test-worker · HERE=%s\n" "$HERE"

step "node availability"
if ! command -v node >/dev/null 2>&1; then
  note "node not found on PATH — skipping test-worker (not a gate failure)"
  printf "\nTEST-WORKER: SKIPPED (no node)\n"
  exit 0
fi
pass "node $(node --version)"

# The harness itself lives in Node (regex/eval/Proxy shim is far more natural
# there than in bash). Quoted heredoc delimiter → bash does zero expansion on
# the JS body, so $ and backtick-heavy code (regexes, template-free string
# concat) passes through untouched.
node "$HERE/scripts/test-worker.js" "$HERE"
exit $?
