#!/usr/bin/env bash
# preflight.sh — PIALAX D2 pre-push gate (bundles all of HQ §2.4 D2 + PIA-001 SRI check)
#
# Runs every check that must pass before a git push. Exit 0 = safe to push, exit 1 = block.
#
# Usage:    ./scripts/preflight.sh
# Pre-push: ln -sf ../../scripts/preflight.sh .git/hooks/pre-push   (one-time)
# CI:       same invocation; non-zero exit will fail the job.

set -uo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
FILES=("$HERE/pialax.html" "$HERE/pialax-mobile.html")
fail=0

step() { printf "\n▶ %s\n" "$1"; }
pass() { printf "  OK  %s\n" "$1"; }
warn() { printf "  XX  %s\n" "$1"; fail=1; }

# 1 — files present
step "1/6  file presence"
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then pass "$(basename "$f") found"
  else warn "$(basename "$f") MISSING"
  fi
done

# 2 — no console.log in shipping files
step "2/6  no console.log"
hits=$(grep -nE 'console\.log' "${FILES[@]}" 2>/dev/null | wc -l | tr -d ' ')
if [ "$hits" = "0" ]; then pass "0 console.log calls"
else warn "$hits console.log call(s) — listing:"; grep -nE 'console\.log' "${FILES[@]}"
fi

# 3 — hardcoded-secret scan (common prefixes + generic key/secret/token tokens)
step "3/6  hardcoded secret scan"
pat='(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_\-]{35}|(api[_-]?key|secret|bearer|password)["'\''=: ]+[A-Za-z0-9_\-]{20,})'
hits=$(grep -inE "$pat" "${FILES[@]}" 2>/dev/null \
  | grep -viE 'placeholder|example|TODO|comment|<!--|//' \
  | wc -l | tr -d ' ')
if [ "$hits" = "0" ]; then pass "no obvious secrets"
else warn "$hits possible secret(s) — REVIEW MANUALLY:"; grep -inE "$pat" "${FILES[@]}"
fi

# 4 — HTML structural smoke (balanced <script>...</script>)
step "4/6  HTML <script> tag balance"
for f in "${FILES[@]}"; do
  opens=$(grep -cE '<script[ >]' "$f")
  closes=$(grep -cE '</script>' "$f")
  if [ "$opens" = "$closes" ]; then pass "$(basename "$f"): $opens <script> balanced"
  else warn "$(basename "$f"): $opens open / $closes close — UNBALANCED"
  fi
done

# 5 — live SRI hash check (delegates to verify-sri.sh)
# Invoked via `bash` so a stripped exec bit doesn't break the gate (PIA-002 fix).
step "5/6  SRI hash freshness (live cdnjs)"
if [ -f "$HERE/scripts/verify-sri.sh" ]; then
  if bash "$HERE/scripts/verify-sri.sh" > /tmp/pialax-sri.log 2>&1; then
    pass "SRI hashes match cdnjs"
  else
    warn "SRI mismatch — log follows:"
    sed 's/^/      /' /tmp/pialax-sri.log
  fi
else
  warn "scripts/verify-sri.sh MISSING — restore from origin/main"
fi

# 6 — bash -n syntax check on every shipping shell script (PIA-002).
# Catches a broken helper that no one ran by hand before it lands on main.
# Pre-push hook + scheduled runs both rely on these scripts parsing.
step "6/6  shell-script syntax check"
shopt -s nullglob
shfiles=("$HERE"/scripts/*.sh)
shopt -u nullglob
if [ "${#shfiles[@]}" -eq 0 ]; then
  warn "no scripts/*.sh found — unexpected"
else
  for f in "${shfiles[@]}"; do
    if bash -n "$f" 2>/tmp/pialax-shn.log; then
      pass "$(basename "$f"): syntax OK"
    else
      warn "$(basename "$f"): SYNTAX ERROR"
      sed 's/^/      /' /tmp/pialax-shn.log
    fi
  done
fi

# verdict
printf "\n"
if [ "$fail" = "0" ]; then
  printf "PREFLIGHT: GO — safe to push.\n"
  exit 0
else
  printf "PREFLIGHT: NO-GO — fix issues above before pushing.\n"
  exit 1
fi
