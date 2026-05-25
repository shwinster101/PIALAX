#!/usr/bin/env bash
# preflight.sh — PIALAX D2 pre-push gate (bundles all of HQ §2.4 D2 + PIA-001 SRI check)
#
# Runs every check that must pass before a git push. Exit 0 = safe to push, exit 1 = block.
#
# Usage:    ./scripts/preflight.sh
# Pre-push: ln -sf ../../scripts/preflight.sh .git/hooks/pre-push   (one-time)
# CI:       same invocation; non-zero exit will fail the job.

set -uo pipefail

# Resolve $0 through any symlinks — critical when invoked as .git/hooks/pre-push,
# which is a symlink to this script. Without this, $HERE resolves to .git/ and the
# gate looks for the working tree under .git/scripts (PIA-002 fix).
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$DIR/$SOURCE"
done
HERE="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"
FILES=("$HERE/pialax.html" "$HERE/pialax-mobile.html")
fail=0

step() { printf "\n▶ %s\n" "$1"; }
pass() { printf "  OK  %s\n" "$1"; }
warn() { printf "  XX  %s\n" "$1"; fail=1; }
note() { printf "  ··  %s\n" "$1"; }

# environment banner — shows up at the top so a misrooted run is obvious.
printf "PIALAX preflight · HERE=%s · scripts/=" "$HERE"
if [ -d "$HERE/scripts" ]; then
  printf "%s files\n" "$(ls -1 "$HERE/scripts" 2>/dev/null | wc -l | tr -d ' ')"
else
  printf "MISSING DIR\n"
fi

# 1 — files present
step "1/7  file presence"
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then pass "$(basename "$f") found"
  else warn "$(basename "$f") MISSING"
  fi
done

# 2 — no console.log in shipping files
step "2/7  no console.log"
hits=$(grep -nE 'console\.log' "${FILES[@]}" 2>/dev/null | wc -l | tr -d ' ')
if [ "$hits" = "0" ]; then pass "0 console.log calls"
else warn "$hits console.log call(s) — listing:"; grep -nE 'console\.log' "${FILES[@]}"
fi

# 3 — hardcoded-secret scan (common prefixes + generic key/secret/token tokens)
step "3/7  hardcoded secret scan"
pat='(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_\-]{35}|(api[_-]?key|secret|bearer|password)["'\''=: ]+[A-Za-z0-9_\-]{20,})'
hits=$(grep -inE "$pat" "${FILES[@]}" 2>/dev/null \
  | grep -viE 'placeholder|example|TODO|comment|<!--|//' \
  | wc -l | tr -d ' ')
if [ "$hits" = "0" ]; then pass "no obvious secrets"
else warn "$hits possible secret(s) — REVIEW MANUALLY:"; grep -inE "$pat" "${FILES[@]}"
fi

# 4 — HTML structural smoke (balanced <script>...</script>)
step "4/7  HTML <script> tag balance"
for f in "${FILES[@]}"; do
  opens=$(grep -cE '<script[ >]' "$f")
  closes=$(grep -cE '</script>' "$f")
  if [ "$opens" = "$closes" ]; then pass "$(basename "$f"): $opens <script> balanced"
  else warn "$(basename "$f"): $opens open / $closes close — UNBALANCED"
  fi
done

# 5 — live SRI hash check (delegates to verify-sri.sh)
# Invoked via `bash` so a stripped exec bit doesn't break the gate (PIA-002 fix).
step "5/7  SRI hash freshness (live cdnjs)"
if [ -f "$HERE/scripts/verify-sri.sh" ]; then
  if bash "$HERE/scripts/verify-sri.sh" > /tmp/pialax-sri.log 2>&1; then
    pass "SRI hashes match cdnjs"
  else
    warn "SRI mismatch — log follows:"
    sed 's/^/      /' /tmp/pialax-sri.log
  fi
else
  warn "scripts/verify-sri.sh MISSING at $HERE/scripts/verify-sri.sh — restore from origin/main"
fi

# 6 — bash -n syntax check on every shipping shell script (PIA-002).
# Catches a broken helper that no one ran by hand before it lands on main.
# Pre-push hook + scheduled runs both rely on these scripts parsing.
step "6/7  shell-script syntax check"
shopt -s nullglob
shfiles=("$HERE"/scripts/*.sh)
shopt -u nullglob
if [ "${#shfiles[@]}" -eq 0 ]; then
  warn "no *.sh found at $HERE/scripts/ — wrong cwd? missing dir? check the environment banner above"
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

# 7 — optional shellcheck pass (advisory: skips if not installed, surfaces
# findings as notes without blocking the gate). Install: `brew install shellcheck`.
# Set STRICT=1 in the env to escalate shellcheck warnings to gate failures.
step "7/7  shellcheck (advisory)"
if ! command -v shellcheck >/dev/null 2>&1; then
  note "shellcheck not installed — skipping (brew install shellcheck for full linting)"
elif [ "${#shfiles[@]}" -eq 0 ]; then
  note "no *.sh to lint — see step 6 warning"
else
  strict="${STRICT:-0}"
  for f in "${shfiles[@]}"; do
    if shellcheck -S warning "$f" > /tmp/pialax-sc.log 2>&1; then
      pass "$(basename "$f"): shellcheck clean"
    else
      msg="$(basename "$f"): shellcheck findings:"
      if [ "$strict" = "1" ]; then
        warn "$msg"
      else
        note "$msg"
      fi
      sed 's/^/      /' /tmp/pialax-sc.log
    fi
  done
  [ "$strict" = "1" ] || note "advisory mode — set STRICT=1 to block ship on shellcheck warnings"
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
