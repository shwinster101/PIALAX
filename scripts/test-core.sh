#!/usr/bin/env bash
# test-core.sh — PIA-042 T1: pure-function regression harness for pialax.html /
# pialax-mobile.html. No build system, no framework, no npm dependency — this
# script extracts each file's inline app <script> block, strips its wrapping
# IIFE (the functions/consts under test are never exported to `window`), evals
# the body inside a minimal browser shim under plain `node`, and asserts
# against the returned pure functions/constants.
#
# Standalone by design (T1 scope). NOT yet wired into preflight.sh — that is
# a separate task (T3) so this can be developed and run independently first.
#
# Usage:    bash scripts/test-core.sh
# Exit 0 = all checks passing (or node absent — skipped with a notice).
# Exit 1 = any check failed, or a file could not be loaded / a symbol could
#          not be captured (fails loudly rather than silently testing nothing).

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

printf "PIALAX test-core · HERE=%s\n" "$HERE"

step "node availability"
if ! command -v node >/dev/null 2>&1; then
  note "node not found on PATH — skipping test-core (not a gate failure)"
  printf "\nTEST-CORE: SKIPPED (no node)\n"
  exit 0
fi
pass "node $(node --version)"

# The harness itself lives in Node (regex/eval/Proxy shim is far more natural
# there than in bash). Quoted heredoc delimiter → bash does zero expansion on
# the JS body, so $ and backtick-heavy code (regexes, template-free string
# concat) passes through untouched.
node "$HERE/scripts/test-core.js" "$HERE"
exit $?
