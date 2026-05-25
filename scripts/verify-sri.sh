#!/usr/bin/env bash
# verify-sri.sh — PIA-001 standing check.
# Re-hashes the CDN files referenced by pialax.html / pialax-mobile.html and
# compares against the SRI integrity= values pinned in those files.
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
for entry in "${EXPECTED[@]}"; do
  url="${entry%%|*}"
  want="${entry##*|}"
  got="$(curl -fsSL "$url" | openssl dgst -sha512 -binary | base64)"
  if [[ "$got" == "$want" ]]; then
    printf "OK    %s\n" "$url"
  else
    printf "FAIL  %s\n  expected sha512-%s\n  got      sha512-%s\n" "$url" "$want" "$got"
    fail=1
  fi
done

exit "$fail"
