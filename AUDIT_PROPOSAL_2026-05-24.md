# PIALAX Audit Proposal — 2026-05-24

**Auditor:** T5 (PIALAX Auditor, prompt A1)
**Files audited:** `pialax.html` (3351 lines), `pialax-mobile.html` (3699 lines)
**Audit window:** 2026-05-24, full read both files
**Leverage formula:** (severity × blast radius × user-visibility) ÷ effort
**Constraints honored:** no code written, no HTML files touched, output limited to this proposal

---

## Executive snapshot for T1 Requirements

5 systems identified, ranked by leverage. Recommended sprint split: **1 patch, 3 minor, 1 major**.

| # | System | Sprint | Leverage rationale |
|---|---|---|---|
| 1 | CDN supply-chain (SRI hashes) | patch | Critical severity, app-wide blast, trivial effort — paste 2 hashes |
| 2 | Desktop/mobile data-layer duplication | major | Touches every feature, drives all future regressions, JFK swap is the canary |
| 3 | JFK transition logic vs per-member flex dates | minor | 99 days from trigger date, sister is the only date-aware member, silent mispricing |
| 4 | `piaRouteOverride` comparing live vs mock | minor | Direct $ misrepresentation on the headline LHR card |
| 5 | Calendar + bar-chart prices labeled as real | minor | Every screen shows mock $ without a `SAMPLE` badge — undermines trust |

Out-of-scope but flagged: `PIA_HUB_BONUS=75` is an opinionated tiebreaker — call out in docs, not a fix.

---

## System 1 — CDN supply-chain hardening (missing SRI)

### (1) What it is
Both files load `d3@7.9.0` and `topojson@3.0.2` from `cdnjs.cloudflare.com` with `crossorigin="anonymous"` and a `referrerpolicy`, but **no `integrity=` SRI hash**. A `TODO(security)` comment at `pialax.html:9-12` and `pialax-mobile.html:9-10` explicitly acknowledges the gap. The CSP allows `script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com`, so a tampered CDN response would execute under the page's origin. The runtime "CDN tamper check" at `pialax.html:15-28` only verifies that `d3.select` and `topojson.feature` exist — a real attacker would keep the public API intact and add a malicious side-effect.

### (2) PHA — Potential Hazard Analysis

| Hazard | Trigger | Likelihood | Severity | Detectability | Mitigation |
|---|---|---|---|---|---|
| Malicious script injection via cdnjs compromise | Upstream CDN breach OR DNS hijack OR pinned version yanked-and-republished | L (rare but happens — Polyfill.io 2024) | H (full account/session compromise, data exfil) | L (current runtime check is fooled by any compromise that keeps the public API) | Add `integrity="sha384-…"` SRI on both `<script>` tags in both files |
| Silent library upgrade drift | Pinned URL still pulls a different bundle | L | M (subtle bugs across map/arcs) | M (visual regression catches some) | SRI also pins the bundle byte-for-byte |
| User loses live prices when SRI mismatches | Hash typo OR future cdnjs metadata change | M | M (app degrades) | H (script fails to load, banner shows) | Verify hash from cdnjs "Copy SRI" button; do NOT paste an unverified hash |

### (3) Fishbone RCCA (6Ms)
- **Method:** TODO comment exists but was never executed; no checklist enforced the hardening before launch.
- **Machine:** cdnjs CDN edge — outside our control; once compromised, anything CSP-permits runs.
- **Material:** Two pinned URLs (`d3.min.js`, `topojson.min.js`) with no integrity tokens.
- **Measurement:** Runtime "tamper check" tests for API surface, not byte integrity — false sense of security.
- **Manpower:** Single-author project; no second pair of eyes on the security TODO.
- **Mother-nature / Env:** Browser correctly enforces SRI when present; without it, browser has no signal.

### (4) Sprint tag
**patch**

### (5) Proposed fix (one paragraph)
For both `pialax.html` and `pialax-mobile.html`, fetch the official SRI hashes from cdnjs for `d3/7.9.0/d3.min.js` and `topojson/3.0.2/topojson.min.js` using the "Copy SRI Hash" affordance on cdnjs.com, then add `integrity="sha384-…"` to each `<script>` tag exactly as published. Keep `crossorigin="anonymous"` (required for SRI). Leave the runtime tamper-check in place as defense-in-depth, but update the comment to note SRI is now the primary guard. Acceptance: View the page with DevTools → Network → confirm both scripts show "Integrity: ok"; tamper one byte locally via a proxy and confirm the script is blocked and the existing CDN-load-check banner fires. Rollback: remove `integrity` attribute — the scripts will resume loading without verification (no functional change).

---

## System 2 — Desktop/mobile data-layer duplication

### (1) What it is
`pialax.html` and `pialax-mobile.html` are not two views of one system — they are two full re-implementations of the same business logic. Every one of the following lives twice, byte-for-byte or near-identical: `AIRPORTS`, `ROUTE_GRAPH`, `INTL_DESTS`, `DC` color map, the entire `MOCK` fare table (32 entries), `FAMILY`, `FAMILY_INFO` (including the JFK move date), `TRIP_PRESETS`, `ORD_DRIVE_TAX`, `WKLY_FACTORS`, `PIA_HUB_BONUS`, `FINDER_NWEEKS`, `familyForDate`, `familyInfoFor`, `headcountFor`, `labelFor`, `computeRanking`, `computeBestMeetupWeekends`, `piaRouteTo`, `fetchFlights`, `loadPrices`, the SerpAPI quota module, `syncURL`/`restoreFromURL`, `PROXY_URL`. Per the HQ constraint that "edits live in `pialax.html` + `pialax-mobile.html` only," there is no shared module — every spec change is two edits, and the JFK transition (System 3) is the canary that proves drift will happen.

### (2) PHA

| Hazard | Trigger | Likelihood | Severity | Detectability | Mitigation |
|---|---|---|---|---|---|
| Mobile and desktop disagree on price after a fix lands on only one | Any C2/C1 implementation that only touches one file | H (every multi-file ticket) | M ($ mismatch between devices for same trip = trust loss) | L (no diff alarm; only manual cross-device test catches it) | Shared `<script>` block via a third file `pialax-core.js` OR Test team T2 regression matrix that mandates a desktop↔mobile diff |
| JFK move-date drift between files | One file gets a corrected `moveDate` and the other doesn't | M | H (sister's fares wrong on one device for months) | L | Single source of truth |
| Backlog velocity halves silently | Every ticket = two edits, two reviews | H | M (project slows, motivation tax) | M (T1 sees throughput drop) | Same shared-core fix |
| Mock-fare table goes stale on one side | Airline announces a new direct, only desktop MOCK updated | M | L–M (one device prices honestly, the other doesn't) | L | Same shared-core fix |

### (3) Fishbone RCCA (6Ms)
- **Method:** HQ constraint #1 (`edits live in two HTML files`) was set for sandbox simplicity; the cost of duplication wasn't priced in.
- **Machine:** Browser file loading is per-file — there's no enforcement preventing a shared `<script src>` block.
- **Material:** ~1800 lines of overlapping JS per file, including a 32-row mock-fare table that is the dataset most likely to drift.
- **Measurement:** No automated diff between the two files; the only check is human eyeball during Test (T3).
- **Manpower:** Single-author project, multiple Cowork agent threads — each thread sees one file at a time and may not realize a paired edit is needed.
- **Mother-nature / Env:** Github tracks two separate files; PR reviews don't surface "you changed pialax.html but not pialax-mobile.html."

### (4) Sprint tag
**major**

### (5) Proposed fix (one paragraph)
Extract the deterministic business layer — constants (`AIRPORTS`, `ROUTE_GRAPH`, `DC`, `MOCK`, `INTL_DESTS`, `FAMILY`, `FAMILY_INFO`, `TRIP_PRESETS`, `ORD_DRIVE_TAX`, `WKLY_FACTORS`, `PIA_HUB_BONUS`, `FINDER_NWEEKS`, `PROXY_URL`) and pure functions (`familyForDate`, `familyInfoFor`, `headcountFor`, `labelFor`, `piaRouteTo`, `computeRanking`, `computeBestMeetupWeekends`, `computeBestWeekends`, `computeWeekendsByDate`, `applyOrdPivot`, `fetchFlights`, the quota module, `syncURL`/`restoreFromURL`) into a single `pialax-core.js` that both HTML files load with the same SRI-protected `<script src=...>` before their device-specific render code. Device-specific code stays in each HTML file: the layout, the calendar popup positioning, the sticky CTA, the FAB. This is a one-time major: ~1800 lines collapse to ~900 + two render layers. Acceptance: a diff of the two HTML files after the change should show NO overlapping function bodies; the JFK transition test (T2 prompt) passes identically on desktop and mobile in one run. Rollback: revert the three commits — both HTML files can re-inline the core module immediately. Note: HQ constraint #1 ("edits live in pialax.html + pialax-mobile.html only") must be amended in `PIALAX_HQ.md` to add `pialax-core.js` to the writable surface.

---

## System 3 — JFK transition logic ignores per-member flex dates

### (1) What it is
The sister's JAX→JFK move on `2026-09-01` is implemented via `familyForDate(d)` which compares an ISO date string to `FAMILY_INFO.JAX.moveDate`. The system has TWO date concepts: the global anchor `S.depDate` AND per-member overrides in `S.memberDates[code].dep`. The JFK swap is consistently keyed off the global `S.depDate` everywhere it matters: `computeRanking` (`pialax.html:917`), `loadPrices`'s hub list (`pialax.html:2541-2542`), `rebuildLegend` (`pialax.html:2792`), `redrawMap` arcs (`pialax.html:2860`), the JFK banner (`pialax.html:2520-2522`). The meetup finder (`computeBestMeetupWeekends`) does pass the per-weekend Thursday into `familyForDate(thu)` — good — but it uses `getMock` not `S.prices`, so the finder shows mock numbers when the user expects live. Worst case for the user: sister sets a custom `Sep 3` return date while the anchor stays at `Aug 29`. The desktop will price her from JAX and render her arc to JAX, while the JFK banner is hidden — silent mispricing of the only date-aware member, ~14 weeks before the move trigger.

### (2) PHA

| Hazard | Trigger | Likelihood | Severity | Detectability | Mitigation |
|---|---|---|---|---|---|
| Sister priced from wrong airport when her per-member dates straddle 2026-09-01 | User sets `memberDates.JAX.dep` after Sep 1 with global before Sep 1 | M (this is exactly what flex-dates was added for) | H (wrong $, wrong arc, wrong share card, all silently) | L (no visual alarm; banner is global) | `familyForDate` takes an effective date per call site; pass the member's effective dep, not `S.depDate` |
| Finder shows mock $ when user expects live | User in meetup mode with no dates picked yet | H (default state) | M (cheapest-weekend recommendation is a mock-weighted result) | L (small "PIA-default" label is the only hint) | Tag finder output with `SAMPLE` badge; or fetch live for top-3 weekend candidates |
| `loadPrices` hub list misses JFK when global is Aug 31 but sister's override is Sep 5 | Same per-member straddle | M | H (no JFK fetch attempted → fallback to mock for sister's leg) | L | Compute the union of effective dates across all members and include JFK if ANY effective date is ≥ 2026-09-01 |
| Banner contradicts arcs | Global Sep 2 but UI rendered with stale cached `S.prices` from Aug 30 anchor | L | M (visual mismatch erodes trust) | M (user notices arc to JAX while banner says JFK) | Invalidate `S.prices['*-JAX']` when crossing the move date |

### (3) Fishbone RCCA (6Ms)
- **Method:** `familyForDate` was designed before per-member dates were added; the contract was never updated to take a per-member effective date.
- **Machine:** Browser — irrelevant.
- **Material:** `S.memberDates` is a sparse map; the type system (JS) doesn't enforce that "effective dep" be threaded through `familyForDate`.
- **Measurement:** No test fixture exercises an Aug-31/Sep-1 boundary with per-member overrides; T3 prompt T3 ("Adversarial input") explicitly mentions this gap.
- **Manpower:** JFK transition and flex-dates features were built in different sprints; the integration was never re-spec'd.
- **Mother-nature / Env:** The trigger date (2026-09-01) is 99 days away — clock is real, not theoretical.

### (4) Sprint tag
**minor**

### (5) Proposed fix (one paragraph)
Change `familyForDate(d)` callers in the eight identified sites to pass the **effective member date**, not the global `S.depDate`. Concretely: in `computeRanking`, loop per `from` member, compute `effectiveDatesFor(from).dep`, and use that to decide JAX-vs-JFK for THAT member only — the candidate set should be the UNION of all per-member effective destinations. In `loadPrices`, change the JFK gate from `fmtISO(S.depDate) >= '2026-09-01'` to `effectiveFamilyAcrossAllMembers().includes('JFK')`. The legend, the JFK banner, and the arcs should reflect the SAME effective family that `computeRanking` produced — pass it down instead of recomputing from the global. Mirror the same change in `pialax-mobile.html`. Acceptance criteria (matches T3-prompt-T3): with anchor `2026-08-29` and `S.memberDates.JAX = { dep: '2026-09-05' }`, sister's route card must show `JFK→<hub>`, her arc must terminate at JFK, the JFK banner must be visible, and `loadPrices` must include `JFK-<hub>` in its fetch list. Rollback: revert is safe because the original behavior matches today's behavior — the fix only adds correctness for the per-member straddle case.

---

## System 4 — `piaRouteOverride` compares live $ to mock $ without flagging it

### (1) What it is
`piaRouteTo(dest, fareKey)` (`pialax.html:878-911`) builds a direct-vs-via-ORD decision from `S.prices['PIA-'+dest] || getMock('PIA',dest)` and `S.prices['ORD-'+dest] || getMock('ORD',dest)`. When one leg has live data and the other doesn't (very common — the `loadPrices` hub fan-out fetches both PIA→LHR and ORD→LHR for LHR, but one may fail or be rate-limited), the toggle UI in `renderMeetupRoutes` (`pialax.html:1142-1216`) shows both prices in the same pill style, with one source badge (`LIVE` or `SAMPLE`) attached to the *active* option only. The user sees `Direct $390 vs ORD $320 — ORD saves $70 × 2 = $140` and treats both numbers as comparable. They are not. Additionally, `setPiaRoute(dest, mode)` (`pialax.html:740-748`) does NOT trigger a fetch — it only re-renders, which means the user can lock in a mock-only number as their decision.

### (2) PHA

| Hazard | Trigger | Likelihood | Severity | Detectability | Mitigation |
|---|---|---|---|---|---|
| User commits to mock $ thinking it's live | Quota near limit OR one leg fails | M | H (real-money decision on fake $) | L (one source badge for two numbers) | Tag EACH option with its own LIVE/SAMPLE badge; refuse to render the toggle unless both options are same-source |
| Override locks in a stale price | User toggled hours ago; fares moved | M | M (savings figure is wrong) | M (timestamp absent from card) | Render last-fetched age per leg |
| `setPiaRoute` doesn't refetch the chosen leg | User clicks "ORD" while only "Direct" had live | M | M (silent mock-fallback) | L | Inside `setPiaRoute`, if the chosen leg has no `live`/`cached` flag, call `fetchFlights` for it |

### (3) Fishbone RCCA (6Ms)
- **Method:** The `piaRouteTo` function returns both option totals (`directFare`, `viaOrdTotal`) without their per-option live flags.
- **Machine:** SerpAPI rate limits and 5xx retries cause uneven freshness across the two legs.
- **Material:** `S.prices` entries carry a `live`/`cached` flag, but the renderer reads only one when picking the source badge.
- **Measurement:** No per-leg source indicator on the toggle pills.
- **Manpower:** Toggle UI shipped before live-quota awareness was added.
- **Mother-nature / Env:** Free-tier SerpAPI quota (250/mo) makes partial-live fetches the common case mid-month.

### (4) Sprint tag
**minor**

### (5) Proposed fix (one paragraph)
Extend `piaRouteTo`'s return shape to include `directIsLive` and `viaOrdIsLive` booleans by reading the `live`/`cached` flags from the source `S.prices` entries (not from `getMock`). In `renderMeetupRoutes`, the `pill(mode, label, total)` helper should render a small per-pill badge — green `●` for live, amber `●` for sample. When the user clicks the alternate option via `setPiaRoute`, if the new active option's leg is `SAMPLE`, fire a single `fetchFlights` for that leg before re-rendering (one extra SerpAPI credit, gated by `isQuotaExceeded`). Mirror in mobile. Acceptance: when `S.prices['PIA-LHR'].live === true` and `S.prices['ORD-LHR']` is mock, the card shows `Direct $X 🟢` and `ORD $Y 🟡` with the savings line annotated `(comparison includes sample data)`. Clicking ORD triggers a fetch and the badge flips to green on success. Rollback: cosmetic; reverting just removes the per-pill badges and the on-click fetch, leaving today's behavior.

---

## System 5 — Calendar + bar-chart prices presented as real

### (1) What it is
The calendar popup (`pialax.html:2305-2341`) renders a price in every cell via `dayPrice(baseOW(), tier(dt))`. `baseOW()` returns `MOCK[home + '-' + dests()[0]].ow` — a static mock for one destination, applied to every day across both months and every airport. The "cheap/mid/pricey" classification is purely day-of-week. The user sees `$278` under `Wed Jun 17` and naturally interprets it as a fetched estimate for their actual trip. Same problem in the solo bar chart (`renderBarChart`, `pialax.html:1645-1695`) when `S.soloBarPrices[route]` is empty — it falls back to `MOCK[from-to].ow × WKLY_FACTORS[i]` and stamps a green "Best Value" dot on the lowest mock bar. The "load live prices (13 calls)" button is opt-in and the dashboard never tells the user the chart is mock by default.

### (2) PHA

| Hazard | Trigger | Likelihood | Severity | Detectability | Mitigation |
|---|---|---|---|---|---|
| User picks a date based on mock cheap-day labeling | Default state (calendar opens before any fetch) | H (every first-use) | M (date selection drives the actual fetch later, but the mock-tier color shaped the choice) | L (no source badge in calendar) | Replace cell `$NNN` with `~$NNN est.` and a one-line "Estimated · click date to fetch real prices" footer note |
| Solo bar "best value" highlight is mock-derived | User hasn't clicked "Load live prices" | H | M (best-value recommendation is fake) | L (`est. best` text is tiny and gray) | Either auto-load on solo mode OR hide the green winner-dot until live data exists |
| User shares a plan whose headline number is from a mock-driven date pick | Combines #1 with the share flow | M | M (sender confidently shares wrong-anchored plan) | L | Source badge in calendar reduces upstream error |

### (3) Fishbone RCCA (6Ms)
- **Method:** `dayPrice` is a deterministic function of base OW × tier multiplier — never escalated to live.
- **Machine:** Browser — irrelevant.
- **Material:** `MOCK` is a 2026-as-of-build snapshot; `WKLY_FACTORS` is a 13-element cycled multiplier.
- **Measurement:** The calendar header text says "Fares: sample · Google Flights" in the no-proxy state — present but tiny and easy to miss.
- **Manpower:** Mock pricing was a v0 affordance; the UI didn't get re-labeled when live mode shipped.
- **Mother-nature / Env:** Cell labels look authoritative on iOS retina; users do not assume `$278` is a heuristic.

### (4) Sprint tag
**minor**

### (5) Proposed fix (one paragraph)
Two changes, both UI-only: (a) In `renderCal`, change the cell template from `$NNN` to `~$NNN` whenever there is no entry in `S.prices` for the home-airport pair on that specific date, and add a one-line footer in `#cal-foot` reading "Estimates from day-of-week tiers · pick dates to fetch live"; (b) in `renderBarChart`, suppress the green winner dot and the "Best Value" badge in the solo card row when `hasLive === false` (the variable already exists at `pialax.html:1798`), replacing them with a subdued "12-week estimate range" label. Mirror in mobile. Acceptance: with `PROXY_URL = ''`, every price label in the calendar reads `~$NNN`, and no green winner highlight appears anywhere in the solo cards. Connecting a proxy and fetching restores `$NNN` and the winner dot on real data only. Rollback: trivial — the old templates remain in git history; revert is one PR.

---

## Sprint tag tally

- **patch:** 1 (System 1 — SRI hashes)
- **minor:** 3 (System 3, System 4, System 5)
- **major:** 1 (System 2 — shared core module)

Per the scheduled autonomous run guardrails (`PIALAX_HQ.md` §4), only System 1 (patch) is eligible for the Coder bay's 5-minute time-boxed draft. Systems 2–5 queue for human triage by T1.

## Handoff notes for T1 Requirements

- **Suggested ticket order:** System 1 (immediate, patch) → System 3 (unblocks JFK transition before Sep 1) → System 5 (cheap trust win) → System 4 (depends on #2's clean-up benefits) → System 2 (the foundational refactor; schedule after the others land so it consolidates fewer moving pieces).
- **JFK-blocking flag:** System 3 should be marked as JFK-transition-blocking per the R2 prioritization prompt — it must ship before 2026-09-01.
- **Cross-file impact:** Systems 1, 3, 4, 5 all require parallel edits to `pialax.html` AND `pialax-mobile.html` until System 2 ships. T1 R3 ("spec sharpening") should explicitly flag this in each ticket's "affected files" line.

---

_End of audit. Auditor exits. No code changes were made._
