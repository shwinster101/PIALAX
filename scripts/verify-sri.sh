#!/usr/bin/env bash
# verify-sri.sh — PIA-001 standing check.
# Re-hashes the CDN files referenced by pialax.html / pialax-mobile.html and
# compares against the SRI integrity= values pinned in those files. PIA-134: it
# also greps app.html's integrity= attributes against the same pinned list.
# Exit 0 = match. Exit 1 = mismatch (cdnjs republished, or tampered).
#
# Usage:  ./scripts/verify-sri.sh
# Hook:   wire into pre-push or CI to detect cdnjs republishing the assets.

set -euo pipefail

# Expected (URL  expected-sha512-base64)
EXPECTED=(
  "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js|vc58qvvBdrDR4etbxMdlTt4GBQk1qjvyORR2nrsPsFPyrs+/u5c3+1Ct6upOgdZoIl7eq6k3a1UPDSNAQi/32A=="
  "https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js|4UKI/XKm3xrvJ6pZS5oTRvIQGIzZFoXR71rRBb1y2N+PbwAsKa5tPl2J6WvbEvwN3TxQCm8hMzsl/pO+82iRlg=="
)

fail=0

# PIA-134: app.html (the v2 shell) may load a CDN script only with an integrity=
# value pinned above. It has none yet (PIA-143 adds the map basemap); every
# <script src> it ever gains must match one EXPECTED entry exactly. Offline-safe:
# this part needs no network, so it runs before the cdnjs fetches below.
# Every <script> tag is read (any case, split over lines or not), and its src= and
# integrity= values are read whether they are written "x", 'x' or bare, so a
# script with a src the pinned list does not cover fails whatever its quoting.
APP_HTML="${SRI_APP_HTML:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/app.html}"
# the value of attribute $2 (a case-insensitive bracket pattern) in tag $1, however it is quoted
attr() { printf '%s' "$1" | sed -nE "s/.*[[:space:]]$2[[:space:]]*=[[:space:]]*(\"([^\"]*)\"|'([^']*)'|([^[:space:]\"'>]+)).*/\\2\\3\\4/p"; }
SRC_ATTR='[sS][rR][cC]'
INT_ATTR='[iI][nN][tT][eE][gG][rR][iI][tT][yY]'
if [ -f "$APP_HTML" ]; then
  n=0
  flat="$(tr '\r\n\t' '   ' < "$APP_HTML")"
  while IFS= read -r tag; do
    [ -n "$tag" ] || continue
    printf '%s' "$tag" | grep -qE "[[:space:]]${SRC_ATTR}[[:space:]]*=" || continue   # an inline <script> has nothing to pin
    n=$((n + 1))
    src="$(attr "$tag" "$SRC_ATTR")"
    integ="$(attr "$tag" "$INT_ATTR")"
    match=0
    if [[ "$integ" == sha512-* ]]; then
      for entry in "${EXPECTED[@]}"; do
        if [[ "$src|${integ#sha512-}" == "$entry" ]]; then match=1; fi
      done
    fi
    if [ "$match" = "1" ]; then
      printf "OK    app.html %s (integrity= pinned)\n" "$src"
    else
      printf "FAIL  app.html <script src=\"%s\"> has no integrity= value pinned in verify-sri.sh\n" "$src"
      fail=1
    fi
  done < <(printf '%s' "$flat" | grep -oiE '<script([[:space:]][^>]*)?>' || true)
  stray="$( { printf '%s' "$flat" | grep -oE "[[:space:]]${INT_ATTR}[[:space:]]*=" || true; } | wc -l | tr -d ' ')"
  if [ "${stray:-0}" != "$n" ]; then
    printf "FAIL  app.html has %s integrity= attribute(s) but %s <script src> tag(s)\n" "${stray:-0}" "$n"
    fail=1
  fi
  if [ "$n" = "0" ]; then printf "OK    app.html: no CDN scripts, so no integrity= attributes to check\n"; fi
fi
if [ "${SRI_APP_ONLY:-0}" = "1" ]; then exit "$fail"; fi   # the app.html part alone (offline; used by test-app)

for entry in "${EXPECTED[@]}"; do
  url="${entry%%|*}"
  want="${entry##*|}"
  # GNU base64 wraps at 76 cols (BSD/macOS doesn't); strip newlines so the
  # 88-char sha512 compares equal on Linux too (PIA-068).
  got="$(curl -fsSL "$url" | openssl dgst -sha512 -binary | base64 | tr -d '\n')"
  if [[ "$got" == "$want" ]]; then
    printf "OK    %s\n" "$url"
  else
    printf "FAIL  %s\n  expected sha512-%s\n  got      sha512-%s\n" "$url" "$want" "$got"
    fail=1
  fi
done

exit "$fail"
