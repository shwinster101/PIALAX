# MITIGATED — recently closed tickets

Maintained by the Deployment team (T4) after every ticket closes.

**Auditors (T5):** when running A1, do **not** count items in this list against your "5 highest leverage" slots — they are already closed and a fresh user-visible improvement should take the slot instead. If you find evidence that a "closed" item has regressed, flag it as a separate finding and cite the ticket ID it regressed from.

## Closed

- **2026-10-04 · PIA-118, PIA-119** · Exact spend caps; the token settings can't drop the dashboard to mock (v1.3.1).
  - **PIA-118:** the `SpendMeter` Durable Object checks and reserves each paid call one at a time.
    - In-process: 10 parallel searches with cap 3 → exactly 3 upstream calls; the KV control → 10.
    - `/account` reports `spend {used, cap, exact}`.
  - **PIA-119:** the Advanced URL box shows the Worker in use; a blank box keeps it; the button is **Save & connect**; a status line shows the token state.
    - Root cause: tapping Connect with the box blank set `PROXY_URL=''` (seen on the iPhone).
  - **Live proof:** `verify-live.sh` passed 22/22 against Worker version `0acad2c7` (merge `38f814e`). Results:
    - A1 usage stayed at 41 → 41;
    - A2 `serialized:true`, all writes survived;
    - A3 MISS → HIT, usage 41 → 42;
    - B3 meter exact, serp 0 → 1 of 30.
  - **Auditors:** don't re-flag "daily cap is soft / overshoots under concurrency" or "saving the token disconnects the proxy".
  - Shipped: PR #25.

- **2026-10-04 · PIA-114 … PIA-117** · Trust release gate (v1.3.0).
  - **PIA-114:** the Worker's paid routes (`/search`, `/account`, `/extract`, `/alert`, `/alerts/sync`) require `X-Pialax-Token` == the `PROXY_TOKEN` secret, plus per-day caps → 429. Search params are strictly allowlisted, and unknown GET → 404.
  - **PIA-115:** the KV fare cache keeps the original `X-Fetched-At`; a hit spends no SerpAPI search and no client quota.
  - **PIA-116:** the `IdeaRoom` Durable Object serializes trip writes.
  - **PIA-117:** `scripts/test-trust.sh` runs in preflight.
  - **Live proof:** `scripts/verify-live.sh` passed 21/21 against `pialax-proxy` on 2026-10-04 (merge `0248830`). Results:
    - every unauthenticated paid call → 401/400/404, and SerpAPI usage stayed at 40 → 40;
    - 3 parallel answers + a booked flag all survived, `serialized:true`;
    - MISS → HIT with the same `X-Fetched-At`, and usage 40 → 41.
  - **Pre-fix evidence** (dry run, same day): unauthenticated searches got 200, and a 4-way race lost 2 of 4 changes.
  - **Auditors:** don't re-flag "browser-only quota protection", "open SerpAPI proxy" or "last-write-wins RSVP". The soft-cap residual was closed by PIA-118 (below).
  - Shipped: PR #23.

- **2026-07-24 · PIA-030 … PIA-040** · Projects UI overhaul (both dashboards) — see `RELEASE_UI_OVERHAUL.md`.
  Fix: shared design-token layer (`ui-tokens.css.frag`, 187 custom properties, light mode + reduced motion) adopted by `pialax.html` and `pialax-mobile.html`; new app shell (desktop top nav / mobile bottom tabs, watchlist as home); all component surfaces restyled onto tokens. Verified zero feature loss against `FEATURE_INVENTORY_UI_OVERHAUL.md` (69/69 rows, 281/281 anchors, zero functions removed, zero logic diffs in `familyForDate`/quota module/`computeRanking`/`computeBestMeetupWeekends`/`fetchFlights`/`syncURL`/`restoreFromURL`, all 17 data constants byte-identical, CSP + SRI + `index.html` byte-identical to base `246d1d9`).
  Bugs closed en route (all pre-existing): **attribute XSS via `?wl=` share links** — untrusted watchlist items now pass `sanitizeWatchlistItem()` at both the localStorage and URL boundaries (exploit reproduced live pre-fix, proved closed post-fix); mobile quota-warning banner could never render (stylesheet `display:none` vs JS clearing only the inline style — same class as the `#quota-bar` bug fixed one element over); an unknown stage in a shared link threw in the render sort and blanked the watchlist; desktop light mode was structurally broken by a legacy `:root` re-pinning dark surfaces after the light override without re-pinning `--ink`. Zero undefined `var(--…)` usages remain — the original `--ink`/`--line` defect class is closed by construction.
  Standing note for auditors: the deferred cosmetic findings are tracked as **PIA-041** in `backlog.md` — do not re-flag them as new.
  Shipped: branch `claude/projects-ui-overhaul-plan-nh20q9`, head `61c1394` (base `246d1d9`).

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
