#!/usr/bin/env bash
# scripts/ship.sh — standardized T4 ship driver.
#
# Usage:  bash scripts/ship.sh <ticket-id>      e.g., bash scripts/ship.sh PIA-002
#
# Reads the ticket's ship envelope written by the T4 thread:
#   scripts/messages/<ticket>.msg     full commit message
#                                     (subject line, blank line, body — `git commit -F` format)
#   scripts/messages/<ticket>.files   one path per line (lines starting with # ignored)
#                                     should include BOTH envelope files for audit trail
#
# Effect (atomic):
#   1. preflight gate (./scripts/preflight.sh) — blocks on failure
#   2. clear any stale .git/index.lock + reset stage (so we ship only the manifest)
#   3. stage exactly the paths in .files
#   4. commit using .msg
#   5. push to origin main
#   6. ensure pre-push hook is the preflight symlink
#   7. print SHA for confirmation back to T4 thread
#
# Why this exists: the Cowork sandbox can write the working tree but not `.git/`,
# so T4 stages + writes the envelope in the sandbox and the user runs this one
# script on their Mac. See PIALAX_HQ.md §2.4 D1.

set -euo pipefail

TICKET="${1:?usage: bash scripts/ship.sh <ticket-id> (e.g., PIA-002)}"
cd "$(dirname "$0")/.."

MSG="scripts/messages/${TICKET}.msg"
FILES="scripts/messages/${TICKET}.files"

[ -f "$MSG" ]   || { printf "\xE2\x9C\x97 missing ship envelope: %s\n" "$MSG";   exit 2; }
[ -f "$FILES" ] || { printf "\xE2\x9C\x97 missing ship envelope: %s\n" "$FILES"; exit 2; }

step() { printf "\n▶ %s\n" "$1"; }

step "1/6  preflight gate"
./scripts/preflight.sh

step "2/6  clear stale lock + reset index for atomic ship"
rm -f .git/index.lock || true
git reset >/dev/null

step "3/6  stage exact manifest from $FILES"
# strip comments (#) and blank lines
manifest=$(grep -vE '^\s*(#|$)' "$FILES" || true)
if [ -z "$manifest" ]; then
  echo "  ✗ empty manifest — nothing to ship"
  exit 3
fi
printf '%s\n' "$manifest" | while IFS= read -r p; do
  [ -n "$p" ] && git add -- "$p"
done
echo "  staged:"
git diff --cached --stat | sed 's/^/    /'

step "4/6  commit using $MSG"
git commit -F "$MSG"

step "5/6  push to origin main"
git push origin main

step "6/6  ensure pre-push hook installed"
ln -sf ../../scripts/preflight.sh .git/hooks/pre-push
ls -la .git/hooks/pre-push | sed 's/^/  /'

SHA=$(git rev-parse HEAD)
printf "\n==================== RESULT ====================\n"
printf "TICKET:  %s\n" "$TICKET"
printf "SHA:     %s\n" "$SHA"
printf "ONELINE: %s\n" "$(git log -1 --oneline)"
printf "REMOTE:  %s\n" "$(git rev-parse origin/main)"
printf "================================================\n"
printf "\nPaste the SHA line back into the T4 thread.\n"
