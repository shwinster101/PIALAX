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

- **2026-05-25 · PIA-005** · SerpAPI plan-aware quota gates + fan-out caps + price cache.
  Fix: budget baseline 250 → 1000 with chained migration (`pialax.html:470/2303`); absolute banner thresholds 800/950/990 with `isFetchLocked()` hard cutoff (`:2205-2277`); `MAX_CALLS_PER_REFRESH=3` + `MAX_CALLS_PER_SESSION=8` fan-out caps; `FLIGHT_CACHE_TTL_MS` raised 30 min → 24 h with `_flightCache` persisted to `localStorage` (`pialax_prices_v1`) and rehydrated on boot (`:2077-2114`); `setPiaRoute` cache-first quota guard with SAMPLE stamp on cache miss (`:744-779`). Mirrored verbatim into `pialax-mobile.html` (+162/-16). AC3 shipped as the spec-permitted downgrade (worker.js doesn't pass broad-search params through; cover note at `pialax.html:2215-2224`).
  T3 verdict: 6/6 PASS. Post-ship browser smoke required for AC2 visual progression (stub `pialax_serpapi_quota` to 850 → 960 → 991, confirm amber → red → locked).
  Shipped: `283872db53dfcd86e8c4eaca568cb94aa7e2ae4b`.

- **2026-05-25 · PIA-006** · Proxy URL regex accepts multi-label workers.dev hosts.
  Problem: regex `^https://[a-z0-9\-]+\.workers\.dev$` accepted only a single label, silently rejecting the project's own default `pialax-proxy.ashwinyedavalli.workers.dev` (two labels) — and `restoreProxyURL()` purged the saved value on every boot via `localStorage.removeItem(PROXY_URL_STORAGE_KEY)`, creating an invisible re-enter / re-fail loop.
  Fix: regex relaxed to `^https://[a-z0-9\-]+(\.[a-z0-9\-]+)*\.workers\.dev$` on both the saved-URL restore path (`pialax.html:3243-3266`) and the live-input apply path. Mirrored in `pialax-mobile.html:3540-3561`.
  Provenance note: code shipped silently inside the PIA-005 commit — violates HQ §6 single-purpose-tickets. Recorded here for traceability and as a lessons-learned input for the next A4 retro (root cause: `.files` manifest staged whole files instead of validating diff against ticket spec).
  Shipped: `283872db53dfcd86e8c4eaca568cb94aa7e2ae4b` (bundled with PIA-005).
