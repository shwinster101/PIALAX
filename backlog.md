# PIALAX Backlog — Tickets from AUDIT_PROPOSAL_2026-05-24

_Owner: T1 Requirements · Generated: 2026-05-25 · Last updated: 2026-05-25 · Source: `AUDIT_PROPOSAL_2026-05-24.md`_

## ID collision reconciliation (2026-05-25)
Per `MITIGATED.md` + `LESSONS_LEARNED_2026-05-25.md` §3, three IDs in the original draft are already taken with different scope:
- **PIA-001** ✅ MITIGATED (CDN SRI shipped `560e6ec`) — matches original draft, close as-is.
- **PIA-002** ❌ COLLISION — real PIA-002 was T4 ship workflow standardization (shipped `37a562a`); the major refactor stays in flight but needs a new ID.
- **PIA-003** 🟡 IN FLIGHT (JFK per-member straddle) — matches original draft, keep ID.
- **PIA-004** 🔒 RESERVED for `TEAM_BOOTSTRAP.md` per lessons-learned action item — file separately.

**Renumbering plan for remaining audit findings:**
| Original draft ID | Scope | New ID |
|---|---|---|
| PIA-002 | Shared `pialax-core.js` major refactor | **PIA-008** (defer per lessons-learned §4) |
| PIA-004 | `piaRouteOverride` per-pill LIVE/SAMPLE badges | **PIA-006** |
| PIA-005 | Calendar + bar-chart estimate labels | **PIA-007** |
| PIA-006 | Search-efficiency / broad-search-then-filter | **PIA-005** ← promoted for current sprint |

## Ticket table

| Ticket ID | User Story | Acceptance Criteria | Sprint Tag | Affected Files | Rollback Note |
|---|---|---|---|---|---|
| ~~PIA-001~~ ✅ | _MITIGATED 2026-05-25 (sha512 SRI, commit `560e6ec`). See `MITIGATED.md`._ | — | patch | `pialax.html`, `pialax-mobile.html` | n/a |
| ~~PIA-005~~ ✅ | _MITIGATED 2026-05-25 (SerpAPI quota gates + fan-out caps + 24h price cache, commit `283872d`). AC3 shipped as spec-permitted downgrade. T3 6/6 PASS. Post-ship browser smoke for AC2 thresholds still owed. See `MITIGATED.md`._ | — | minor | `pialax.html`, `pialax-mobile.html` | n/a |
| ~~PIA-006~~ ✅ | _MITIGATED 2026-05-25 (proxy URL regex accepts multi-label workers.dev hosts). Code shipped silently in `283872d` (HQ §6 violation, recorded as lessons-learned input); paper trail in `b33253f`. See `MITIGATED.md`._ | — | patch | `pialax.html`, `pialax-mobile.html` | n/a |
| ~~PIA-010~~ ✅ | _MITIGATED 2026-05-25 (operating-docs tracking + `.gitignore` for stray dev files, commit `2a2a167`). Closes the long-standing "untracked operating docs" punch-list — `backlog.md`, `AUDIT_PROPOSAL_*.md`, daily-review `.docx`s, project-definition + setup-guide now in git. `.gitignore` excludes `pialax-dashboard.jsx`, `pialax-mobile-original.html`, `pialax-mobile-v2.html`, `.git/index.lock`, `.DS_Store`, `.recovery/`._ | — | chore(ops) | `.gitignore` + 9 newly-tracked docs | n/a |
| **PIA-001 (original draft, now closed)** | As a PIALAX user loading the dashboard, I want the d3 and topojson CDN scripts to be byte-verified against published SRI hashes so that a cdnjs compromise or DNS hijack cannot silently inject malicious code under my session. | • Both `<script>` tags for `d3@7.9.0` and `topojson@3.0.2` include `integrity="sha384-…"` attributes sourced from cdnjs's official "Copy SRI Hash" affordance.<br>• `crossorigin="anonymous"` is preserved on both tags (SRI requires it).<br>• DevTools → Network shows "Integrity: ok" for both scripts on a clean load.<br>• Locally tampering one byte via proxy causes the script to be blocked AND the existing CDN-load-check banner fires.<br>• `TODO(security)` comment at `pialax.html:9-12` and `pialax-mobile.html:9-10` is updated to note SRI is now the primary guard. | **patch** | `pialax.html`, `pialax-mobile.html` | Remove the `integrity=` attribute from both tags in both files — scripts resume loading without verification, zero functional change. Single revert commit. |
| **PIA-002** | As the PIALAX maintainer, I want all deterministic business logic (constants + pure functions) extracted into a single `pialax-core.js` so that every spec change is a one-file edit and desktop/mobile cannot silently drift on price, family composition, or JFK transition logic. | • A new `pialax-core.js` is created and contains: `AIRPORTS`, `ROUTE_GRAPH`, `INTL_DESTS`, `DC`, `MOCK`, `FAMILY`, `FAMILY_INFO`, `TRIP_PRESETS`, `ORD_DRIVE_TAX`, `WKLY_FACTORS`, `PIA_HUB_BONUS`, `FINDER_NWEEKS`, `PROXY_URL`, plus pure fns (`familyForDate`, `familyInfoFor`, `headcountFor`, `labelFor`, `piaRouteTo`, `computeRanking`, `computeBestMeetupWeekends`, `computeBestWeekends`, `computeWeekendsByDate`, `applyOrdPivot`, `fetchFlights`, quota module, `syncURL`/`restoreFromURL`).<br>• Both HTML files load `pialax-core.js` via the same SRI-protected `<script src=…>` tag before their render code.<br>• A diff of `pialax.html` vs `pialax-mobile.html` shows NO overlapping function bodies after the change.<br>• JFK transition test (HQ §2.3 T2 prompt) passes identically on desktop and mobile in one run.<br>• `PIALAX_HQ.md` §6 constraint is amended to add `pialax-core.js` to the writable surface. | **major** | `pialax.html`, `pialax-mobile.html` (+ new `pialax-core.js` + `PIALAX_HQ.md` constraint update) | Revert the three commits (core file + two HTML refactors). Both HTML files re-inline the core module immediately from git history. |
| **PIA-003** | As Ashwin planning a trip that straddles 2026-09-01, I want the JFK transition logic to honor per-member flex dates so that my sister is priced and routed from the correct airport (JAX vs JFK) based on HER effective date, not the global anchor. | • `familyForDate(d)` callers (8 identified sites — `computeRanking`, `loadPrices` hub list, `rebuildLegend`, `redrawMap`, JFK banner block) accept and use the **effective member date**, not the global `S.depDate`.<br>• `loadPrices` JFK gate is changed from `fmtISO(S.depDate) >= '2026-09-01'` to `effectiveFamilyAcrossAllMembers().includes('JFK')`.<br>• Legend, JFK banner, and arcs all reflect the SAME effective family that `computeRanking` produced (passed down, not recomputed).<br>• **Boundary fixture test:** with anchor `2026-08-29` and `S.memberDates.JAX = { dep: '2026-09-05' }`, sister's route card shows `JFK→<hub>`, her arc terminates at JFK, JFK banner is visible, and `loadPrices` includes `JFK-<hub>` in its fetch list.<br>• Same behavior verified in `pialax-mobile.html`. | **minor** | `pialax.html`, `pialax-mobile.html` | Safe revert — original behavior matches today's behavior; the fix only adds correctness for the per-member straddle case. Single revert commit per file. **JFK-BLOCKING: must ship before 2026-09-01.** |
| **PIA-004** | As a user choosing between Direct vs via-ORD on the headline LHR card, I want each price option to carry its own LIVE/SAMPLE badge and the toggle to refetch when I switch so that I never commit a real-money decision based on a comparison of one live price to one mock price. | • `piaRouteTo` return shape includes `directIsLive` and `viaOrdIsLive` booleans, sourced from `S.prices[…].live`/`cached` flags (NOT from `getMock`).<br>• `renderMeetupRoutes` `pill()` helper renders a per-pill badge: green `●` for live, amber `●` for sample.<br>• When the user clicks the alternate option via `setPiaRoute` and the new active leg is `SAMPLE`, `fetchFlights` fires for that leg before re-rendering (gated by `isQuotaExceeded`).<br>• Mixed-source state annotates the savings line with `(comparison includes sample data)`.<br>• Same behavior mirrored in `pialax-mobile.html`. | **minor** | `pialax.html`, `pialax-mobile.html` | Cosmetic revert — remove per-pill badges and the on-click fetch. Today's behavior resumes. Single revert commit per file. |
| **PIA-005** | As a user opening the calendar or solo bar chart before any live fetch, I want mock-derived prices to be clearly labeled as estimates so that I don't anchor a date pick or share a "best value" recommendation on data the system invented. | • In `renderCal`, cells without a matching entry in `S.prices` for the home-airport pair on that date render as `~$NNN` instead of `$NNN`.<br>• `#cal-foot` shows a one-line footer: "Estimates from day-of-week tiers · pick dates to fetch live".<br>• In `renderBarChart`, when `hasLive === false`, the green winner dot AND the "Best Value" badge are suppressed in the solo card row, replaced by a subdued "12-week estimate range" label.<br>• Connecting a proxy and fetching real data restores `$NNN` formatting and the winner dot on live data only.<br>• Same UI behavior mirrored in `pialax-mobile.html`. | **minor** | `pialax.html`, `pialax-mobile.html` | Trivial — old templates remain in git history. Single-PR revert restores prior labels. |
| **PIA-006** | As a user on the SerpAPI paid tier (1000/mo, **currently ~950 used → ~50 calls left until reset**), I want the refresh button to skim a broad result set once and filter client-side rather than firing a separate search per leg, so that a full dashboard refresh costs ≤ 3 SerpAPI calls instead of 13+. | • **Broad-search-then-filter pattern:** `loadPrices` issues a single SerpAPI call per hub airport (not per route), requesting a wide departure-date window and multiple destinations where the API supports it; results are parsed client-side into the per-route `S.prices` map.<br>• `MAX_CALLS_PER_REFRESH` (default **3**) and `MAX_CALLS_PER_SESSION` (default **8**) hard-cap fan-out; refresh button is disabled and tooltipped when either is hit.<br>• Per-leg cache TTL raised to **24h**; `S.prices` persisted to `localStorage` keyed by `route+depDate` so a reload spends 0 calls.<br>• `setPiaRoute` on a `SAMPLE`-only leg uses cache first; only fires `fetchFlights` if cache missing OR > 24h stale AND remaining quota > 20.<br>• Quota banner shows `<used>/1000 this month · <session> this session · <remaining> until reset`; turns **amber at 800, red at 950, locks fetch button at 990**.<br>• Same behavior in `pialax-mobile.html`. | **minor** | `pialax.html`, `pialax-mobile.html` | Revert restores current fan-out; `localStorage` entries are read-tolerant (missing keys fall back to mock as today). Single-PR revert per file. |

---

## What materially changed
- 5 audit findings converted into structured tickets PIA-001 through PIA-005 with user stories, 4–5 acceptance criteria each, sprint tags, file scope, and rollback notes.
- **2026-05-25 addendum: PIA-006 added** — search-efficiency ticket. Quota corrected to **1000/mo, ~950 used**. Approach pivoted from "prioritized fan-out" to **broad-search-then-filter** (one SerpAPI call per hub → parse multiple routes client-side). Thresholds reset: amber 800 / red 950 / locked 990. Per-refresh cap = 3 calls.
- **Minor-queue priority updated:** PIA-006 → PIA-003 (JFK-blocking) → PIA-005 → PIA-004. PIA-004 now sits behind PIA-006 because its LIVE/SAMPLE badges only become honest once the quota-aware skimming policy is in place.
- JFK-blocking flag attached to PIA-003 (must ship before 2026-09-01 per HQ §2.1 R2).
- Sprint tally: 1 patch / 4 minor / 1 major.

---

## Sprint candidate — PIA-005 (minor) — promoted for current cycle

**Title:** Search-efficiency — broad-search-then-filter + quota baseline correction

**User story:** As Ashwin on the SerpAPI paid tier (1000/mo, **~950 used, ~50 left until reset**), I want the refresh button to skim a broad result set once and filter client-side rather than firing a separate search per leg, so that a full dashboard refresh costs ≤ 3 SerpAPI calls instead of 13+, and the in-code quota budget reflects reality.

**Acceptance criteria (refined against actual code paths):**
- **AC1 — Budget baseline correction.** `pialax.html:2194-2220` quota module: change default budget `250 → 1000` and extend the auto-migrate block (currently `100 → 250` at lines 2205-2211) to also migrate `250 → 1000` with the comment "SerpAPI plan upgrade 2026-05-25". Mirror in `pialax-mobile.html`. `localStorage` key (`pialax_serpapi_quota`) is preserved so existing `used` counters carry over.
- **AC2 — Banner thresholds rescaled.** The quota warning banner (`#quota-warning-banner`, ref `pialax.html:365`) and `#quota-bar` (line 372) turn amber at 800/1000, red at 950/1000, and fully lock the fetch button at 990/1000. Strings: `"<used>/1000 this month · <session> this session · <remaining> until reset"`.
- **AC3 — Broad-search-then-filter in `loadPrices`.** `loadPrices` (entry around `pialax.html:1605`) is refactored: per origin hub, issue **one** SerpAPI request with the widest supported parameter set (multi-day window OR multi-destination — whichever is confirmed supported in the discovery step below). Parse the response client-side into the per-route `S.prices` map. Each parsed leg carries the same `{live: true, ts: Date.now()}` shape currently set at the success path (~line 2175).
- **AC4 — Hard caps + cache.** New constants `MAX_CALLS_PER_REFRESH = 3` and `MAX_CALLS_PER_SESSION = 8` are exposed at the top of the quota module. Refresh button is disabled with tooltip when either is hit. Per-leg cache TTL raised to **24h** (was: in-flight dedupe only via `_flightInflight`); `S.prices` is persisted to `localStorage` keyed by `route+depDate+retDate` on every successful write and rehydrated on `boot()`. A reload before TTL expiry spends **0** SerpAPI calls.
- **AC5 — `setPiaRoute` cache-first.** When the user clicks the alternate hub on the LHR card (`pialax.html:740-748`), check `S.prices` first; only fire `fetchFlights` if cache is missing OR > 24h stale AND `readQuota().budget - readQuota().used > 20`. Otherwise stamp the active option as `SAMPLE` and show the badge.
- **AC6 — Mobile parity.** Same six changes mirrored in `pialax-mobile.html` (per HQ §1.7 C3 mobile parity check).

**Discovery step (Coder must do before AC3):** verify which broad-search axis the configured SerpAPI Worker proxy actually supports — multi-day departure-date window OR multi-destination per call — by inspecting `worker.js` and one live response. If neither is supported, AC3 collapses to "fan-out gated by per-refresh cap + cache reuse only"; note the downgrade in the diff and continue.

**Sprint tag:** **minor**

**Affected files:** `pialax.html`, `pialax-mobile.html` (no new files; no HQ constraint changes)

**Rollback note:** Revert restores current per-route fan-out. `localStorage`-persisted `S.prices` entries are read-tolerant; missing keys fall back to mock as today. Auto-migrate from `1000 → 250` is NOT added on rollback — the budget stays at 1000 because that matches the real plan.

**Sequencing rationale:** Highest user-pain ticket right now (50 calls left, 6 days of May). Sized before PIA-003 (JFK transition, 99 days out) and PIA-006 (per-pill badges, depends on this ticket's policy being explicit).

---

## Copy-paste prompt for T2 Coder bay (C1)

```
role T2. Bootstrap from PIALAX/PIALAX_HQ.md §2.2 C1.

Ticket: PIA-005 (minor). Read PIALAX/backlog.md "Sprint candidate — PIA-005" for the
full spec. Read MITIGATED.md first so you don't accidentally undo PIA-001 SRI work.

Constraints:
- Edits ONLY in pialax.html + pialax-mobile.html.
- Preserve FAMILY date-aware array (JFK after 2026-09-01).
- Preserve 4-person family composition (PIA=2, LAX=1, JAX/JFK=1).
- localStorage key `pialax_serpapi_quota` must stay backwards-compatible —
  add a new migration step `250 → 1000`, do NOT reset existing `used` counters.

Pre-implementation discovery (required before AC3):
1. Read worker.js (in shwinster101/PIALAX-proxy or referenced from PROXY_URL)
   to confirm whether the SerpAPI proxy passes multi-day windows or
   multi-destination queries through. Report which axis is supported.
2. If neither axis is supported, downgrade AC3 to "fan-out gated by
   MAX_CALLS_PER_REFRESH + cache reuse only" and note it in the diff cover note.

Then implement AC1 → AC6 in order. After each AC, paste a 5-10 line diff snippet
in chat before proceeding. Do not push. Do not run scripts/ship.sh — that's T4.

End your turn with:
- A unified diff of both HTML files.
- A "discovery findings" 2-bullet summary (which axis SerpAPI supports; any AC
  downgrades).
- The exact line numbers you touched (anchor for T3 acceptance run).

If sandbox egress fails (cdnjs / SerpAPI / Pages unreachable — see HQ §8),
persist partial diff to .recovery/PIA-005.diff and stop. Do NOT guess
SerpAPI response shape — ask the user to paste one live response.
```

---

## Highest leverage 2 actions to take now
- **Open T2 with the prompt block above** — 50 SerpAPI calls of headroom means this ticket pays for itself within one planning session. The discovery step (multi-day window vs multi-destination) is the only thing that decides whether AC3 ships full or downgraded.
- **File PIA-004 (TEAM_BOOTSTRAP.md, patch) in parallel** — per lessons-learned §3 it's the cheapest tax-cut for every future thread, and it's a 10-minute T1 turn separate from PIA-005. Do not let it sit unfiled while PIA-005 takes a multi-day cycle.

## Question
Should PIA-005's broad-search fan-out be **gated client-side** (one Worker call per hub, client parses the response into per-route map) or **gated at the Worker** (a new `/batch` endpoint on `pialax-proxy.ashwinyedavalli.workers.dev` that fans out internally and returns a pre-shaped grid) — given that the second option keeps PIALAX's HTML edit-surface untouched but adds a Worker deploy step T4 currently doesn't have a playbook for?

---

## PIA-041 — UI overhaul cosmetic follow-ups (2026-07-24)

_Source: A6 audit of the PIA-030…040 UI overhaul (`RELEASE_UI_OVERHAUL.md`). All non-blocking; the overhaul shipped without them. Auditors: these are known and ticketed — do not re-flag as new findings._

| # | Finding | Files | Tag |
|---|---|---|---|
| 1 | Light-mode contrast: ORD route badge uses raw `#06b6d4` for text (2.24–2.43:1 on light surfaces). A darkened variant already exists as `--tb-transfer:#0e7490`; needs a `--co-ord` light override. | both HTML | patch |
| 2 | Light-mode contrast: watchlist FAMILY/SOLO mode chip uses raw `#a855f7`/`#2e7cf6` for text/border (3.63–3.96:1) while `--mode-family`/`--mode-solo` light values exist at 5.3:1. Same defect class as the stage-color fix in `770cacc`. | both HTML | patch |
| 3 | Desktop `#api-banner` (proxy connect — global app config) sits in `#panel-planner`, so it's unreachable from the Watchlist and Map tabs. | `pialax.html` | patch |
| 4 | Desktop calendar popup mispositions to the viewport corner when opened from the Map tab (`openCal` measures `#sb`/`#date-row`, both zero-width while the sidebar is hidden). | `pialax.html` | patch |
| 5 | 26 of 28 shipped `u-*` utility recipes are unused in both files — decide: adopt in a future restyle or strip. | both HTML | chore |
| 6 | `TB_COL` binder hexes are raw dark-palette values, so binder tints don't follow the light theme (cosmetic only — border + 6% background, never text). | both HTML | chore |
| 7 | Binder "▫ N days free in X" rows now render in `--warn` (amber) alongside genuine red conflict rows; free days are a good outcome and read as a warning. | both HTML | patch |
| 8 | Mobile `#tip` lives inside `#map-wrap` (its positioning context), so it can't show while another tab is active. **Deliberately not fixed** — relocating breaks `posTip()`; revisit only if a real hover/tap-tooltip need appears on the calendar. | `pialax-mobile.html` | note |
