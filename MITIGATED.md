# MITIGATED — recently closed tickets

Maintained by the Deployment team (T4) after every ticket closes.

**Auditors (T5):** when running A1, do **not** count items in this list against your "5 highest leverage" slots — they are already closed and a fresh user-visible improvement should take the slot instead. If you find evidence that a "closed" item has regressed, flag it as a separate finding and cite the ticket ID it regressed from.

## Closed

- **2026-05-25 · PIA-001** · CDN tamper risk on d3 + topojson.
  Fix: sha512 SRI `integrity=` + `crossorigin="anonymous"` on both CDN scripts in `pialax.html` and `pialax-mobile.html`. Standing check: `scripts/verify-sri.sh` re-hashes the cdnjs bytes vs the pinned values; preflight step 5/7 invokes it on every push.
  Shipped: `560e6ec73889eff01dc3464105b4729c5f1916f3`.

- **2026-05-25 · PIA-002** · T4 ship workflow standardization (ops; not user-visible).
  Fix: `scripts/ship.sh` single-entry driver + `scripts/messages/<id>.{msg,files}` envelope contract + 7-step preflight gate (file presence, no `console.log`, secret scan, `<script>` balance, SRI freshness, `bash -n` syntax check, advisory `shellcheck`) + symlink-safe `$0` resolution for the pre-push hook.
  Shipped: `37a562af1b74bdd389a94bae20f764814ac5e706`.
