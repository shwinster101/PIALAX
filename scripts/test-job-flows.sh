#!/usr/bin/env bash
# PIA-145: required browser gate; unavailable Node, Playwright or Chromium is a failure, never a skip.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if ! command -v node >/dev/null 2>&1; then
  printf 'FAIL: PIA-145 job flows require Node and a real Chromium browser.\n' >&2
  exit 1
fi
node "$HERE/scripts/test-job-flows.js" "$HERE"
