feat(security): pin d3 + topojson via SRI integrity (PIA-001)

- Add sha512 SRI integrity= + crossorigin=anonymous to both CDN scripts
  in pialax.html and pialax-mobile.html.
- Add scripts/verify-sri.sh standing check (re-hashes cdnjs bytes vs
  pinned values; exit 1 on mismatch).
- Add scripts/preflight.sh D2 gate bundling file presence, no-console.log,
  secret scan, <script> tag balance, and live SRI freshness.

Closes PIA-001.
