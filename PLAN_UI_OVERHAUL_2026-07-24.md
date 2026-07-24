# PIALAX UI Overhaul — Manager + Agent-Team Implementation Plan

_Date: 2026-07-24 · Owner: Ashwin · Scope: full user-interface overhaul of `pialax.html` + `pialax-mobile.html` · Hard rule: **zero feature loss**_

---

## 0. Objective & non-negotiables

**Objective:** modernize and unify the PIALAX UI — visual design, layout, information hierarchy, and navigation — so the app reads as what it now is (a **trip watchlist / group-coordination product**, per HQ §10), not an accreted dashboard. Every shipped feature survives, byte-for-behavior.

**Non-negotiables (inherited from `PIALAX_HQ.md` §6 + `CLAUDE.md`):**
1. Single-file vanilla HTML/CSS/JS architecture stays — no framework, no build step.
2. CSP meta tag and SRI-pinned CDN scripts (d3, topojson) stay intact.
3. FAMILY date-aware logic (JAX→JFK after 2026-09-01), 4-person composition (PIA=2, LAX=1, JAX/JFK=1) untouched.
4. Quota-safe fetching: button-gated live fares, caps, locks, Sample/estimate labeling — behavior identical.
5. Desktop/mobile parity: every change lands in both HTML files.
6. One ticket = one commit, shipped via the envelope flow (`scripts/messages/` + `ship.sh`), preflight-gated.

**Definition of "keeping features":** the Feature Freeze Inventory (Phase 0 artifact) is the contract. A PR/diff that removes, hides, or degrades any inventoried feature is a NO-GO regardless of how good the new UI looks.

---

## 1. Team topology

This maps onto the existing HQ thread model (T1–T5) but is run as a Manager agent orchestrating specialist subagents, each with a clean context.

### Manager agent (M) — long-lived orchestrator
- Owns this plan, the ticket queue (PIA-030+), and the Feature Freeze Inventory.
- Spawns every specialist below, hands each a scoped prompt + only the files it needs.
- Reviews every diff against the inventory before it advances to QA.
- Runs `bash scripts/preflight.sh` as the gate before any ship envelope is written.
- Never edits the HTML files directly — delegation only, so its context stays clean for judgment calls.
- Reports to the human at phase boundaries only (plus blockers).

### Specialist agents
| Agent | Type | Lifespan | Mandate |
|---|---|---|---|
| **A1 — Inventory/Explorer** | read-only (Explore) | Phase 0 | Walk both HTML files end-to-end; emit the Feature Freeze Inventory: every view, control, state, badge, edge-case behavior, and its selector/function anchors. No opinions, no edits. |
| **A2 — Design System** | worker | Phase 1 | Produce the token layer: CSS custom properties (color, type scale, spacing, radius, elevation, motion), light/dark, component styles. Output = one `<style>` block spec both implementers consume verbatim. |
| **A3 — Desktop implementer** | worker | Phases 2–3 | Applies the overhaul to `pialax.html`, one ticket at a time. Markup/CSS/render-function changes only; pure logic functions off-limits. |
| **A4 — Mobile implementer** | worker | Phases 2–3 | Same for `pialax-mobile.html`, adapting layout for touch (bottom nav, sheet patterns) while consuming the identical token layer. |
| **A5 — Parity & QA** | read-only + browser | per ticket | Diffs desktop vs mobile for the ticket's surface, runs the regression matrix (family render, JFK straddle dates Aug 31/Sep 1 2026, quota lock states, mock vs live labeling, URL restore), and screenshots both files headless (Playwright + local static serve) for the Manager's visual review. |
| **A6 — Auditor** | read-only (Explore) | Phase 4 | Fresh-context adversarial pass per HQ A1/A3: inventory re-check (anything missing?), XSS/innerHTML review of new templates, CSP/SRI still intact, `console.log` sweep. |

**Isolation rules:** A3 and A4 never run in the same context (file-path bleed-over risk, HQ §1). A5/A6 never see implementer reasoning — they get only the diff + the inventory, so their checks are independent.

---

## 2. Phases & tickets

Ticket IDs start at **PIA-030** (PIA-027/028 range in use by watchlist work).

### Phase 0 — Feature Freeze Inventory (A1) — 1 session
- **PIA-030 (chore):** `FEATURE_INVENTORY_UI_OVERHAUL.md` at repo root. Per feature: name · where (view/section) · anchors (function names, element IDs) · observable behaviors incl. edge cases · desktop/mobile divergences (documented, and consciously kept or reconciled). Sources: both HTML files + `PIALAX-PROJECT-DEFINITION.txt` + `SPRINT_PROPOSAL_2026-07-21.md` ticket list (PIA-020..027 features all shipped and must appear).
- **Gate:** human skims and signs off the inventory — it becomes the acceptance contract for everything after.

### Phase 1 — Design system (A2) — 1 session
- **PIA-031 (minor):** token layer + component spec (`UI_DESIGN_SYSTEM.md` + the canonical `<style>` `:root` block). Includes: palette (keep dark-first, add light), type scale, spacing/radius/elevation scale, stage colors for the watchlist lifecycle (👀/📝/✅/🏁), status colors (live/sample/quota amber/red), and named component recipes (card, pill, chip, banner, sheet, table). d3 map + chart colors fold into the same tokens.
- **Gate:** Manager verifies tokens cover every color/size currently hardcoded (A1 inventory lists them); human picks between at most 2 visual directions if A2 proposes variants.

### Phase 2 — App shell & navigation (A3 + A4 in parallel, A5 per ticket)
- **PIA-032 (minor, desktop):** new shell for `pialax.html` — watchlist as home surface, clear top-level nav (Watchlist · Meetup · Map · Calendar), consistent header with data-freshness + quota status, sidebar re-organized. All existing sections remain reachable; no render-logic changes, only structure/CSS + the thin glue that shows/hides views.
- **PIA-033 (minor, mobile):** same shell for `pialax-mobile.html` with bottom tab bar + sheet-style detail views.
- **Gate per ticket:** A5 parity + regression run → Manager review vs inventory → preflight.
- _Phase 2 gate outcome (2026-07-24): GO — 46/46 regression checks passed, CSP/SRI byte-identical, all frozen keys/params intact. Accepted intentional divergences (Manager sign-off): desktop Calendar tab opens the `#cal` popup directly while mobile shows the dates page and opens the sheet on Depart tap (sheet-pattern adaptation); desktop Meetup tab forces `setMode('meetup')` from solo while mobile's plan tab never forces mode (mode switching stays in-page). The mobile `?wl=` landing-precedence divergence was fixed post-gate (wl checked first, param list aligned to desktop's 11). Note: preflight step 5 (live SRI fetch) cannot pass in the sandbox (cdnjs egress blocked) — re-run where cdnjs is reachable before shipping to main; hashes were verified out-of-band against genuine package bytes._

### Phase 3 — Component restyle sweep (A3 + A4, ticket-per-surface)
One ticket per surface keeps commits single-purpose (HQ §6) and rollback trivial:
- **PIA-034:** Watchlist cards + stage grouping + "+ New trip" flow.
- **PIA-035:** Meetup strip, Best-Meetup-Window recommender, routes/cost breakdown, cost-split & host-fairness ledger.
- **PIA-036:** Map view (markers, arcs, tooltips, legend) restyled to tokens; fallback text path preserved.
- **PIA-037:** Sync calendar + bar charts (estimate `~$` labeling and winner-dot suppression rules preserved exactly).
- **PIA-038:** Trip Binder timeline + gap/conflict flags; RSVP board.
- **PIA-039:** Data/API surfaces — quota banner + bar, proxy URL input, freshness pills, share/toast, holiday chips. _Scope additions from the Phase 2 A5 gate:_ (a) mobile `#quota-bar` is populated but never visible (pre-existing bug: CSS `display:none` + JS clears inline style only — fix to actually show it); (b) desktop header quota text collides ("remaining0 used") in the narrow `#shell-status` flex; (c) theme parity — mobile is now light-mode capable (legacy `:root` removed in PIA-033) while desktop stays dark-locked by its retained legacy `:root`; reconcile when desktop flips to the canonical token base in Phase 3.
- Each ticket: A3 ships desktop diff → A4 mirrors mobile in the same ticket → A5 gate → Manager gate.

- _Phase 3 gate outcome (2026-07-24): GO after one fix. A5 ran 73 checks — 69 passed, including XSS probes on the restyled user-text templates, byte-identical CSP/SRI, and both claimed bug fixes verified (watchlist titles 13.31:1 dark / 16.23:1 light; mobile quota bar now renders). The 4 failures shared one root cause: stage-group headers interpolated raw `WATCHLIST_STAGES` hexes into inline `color:` styles, bypassing the light theme's darkened stage tokens (2.14–2.56:1 on white). Fixed post-gate in both files by emitting `var(--stage-<key>)` for text-bearing colors (headers, stage select, blocker chips, emoji-circle glyphs) while keeping raw hex for alpha-suffix backgrounds per design-system §6.3; re-verified headless at 4.10–4.76:1 light / 6.63–7.93:1 dark on both files. Residue accepted: d3 series colors stay dark-palette; desktop `#jfk-banner` remains dark-locked but readable (5.71:1) — auditor may ticket._

### Phase 4 — Audit & hardening (A6) — 1 session
- _Phase 4 gate outcome (2026-07-24): audit ran adversarially on Opus; **zero-feature-loss claim HOLDS** — 69/69 inventory rows present, 0 SUSPECT, 281/281 anchors, zero functions removed, zero logic-line diffs in the frozen functions (familyForDate, quota module, computeRanking, computeBestMeetupWeekends, fetchFlights, syncURL/restoreFromURL), all 17 data constants byte-identical, CSP/SRI/index.html byte-identical to the pre-overhaul baseline `246d1d9`, and zero undefined `var(--…)` usages (the `--ink` bug class is fully closed). Fixed in this pass: **BLOCKER-1** — attribute-level XSS via `?wl=` share links (pre-existing since PIA-024, missed by the Phase 2/3 gates because their probes only covered `esc()`-guarded text nodes). Untrusted watchlist items now pass through `sanitizeWatchlistItem()` at both boundaries (localStorage + URL), validating id/dest/origin/hub/key/gf against a strict charset, normalizing stage/mode/dates, and dropping unusable items; the "+ New trip" input strips non-code characters. Exploit proved live pre-fix (`window.__pwned` set, 2 injected handlers on both files) and proved closed post-fix (0 handlers, benign items still render). Also fixed: **MAJOR-2** mobile quota-warning banner could never display (same CSS-vs-inline `display` bug PIA-039 fixed for `#quota-bar` one element over), **MINOR-4** mobile share-card fallback now surfaces its tab, **MINOR-5** landing-tab param test aligned to desktop's `!= null`, and **NOTE-14** an unknown stage in a shared link no longer throws (verified: pre-fix it crashed the whole watchlist render). **MINOR-3 deliberately not fixed** — moving `#tip` out of `#map-wrap` would break `posTip()`'s containing block, and mobile has no true hover; left in place by design._
- _Deferred to a follow-up cleanup ticket (non-blocking): MINOR-6 ORD badge and MINOR-7 FAMILY/SOLO mode chip use raw dark-palette hexes for text in light mode (2.2–4.0:1; darkened `--tb-transfer`/`--mode-*` tokens already exist); MINOR-8 desktop `#api-banner` reachable only from the Meetup tab; MINOR-9 desktop calendar mispositions when opened from the Map tab; NOTE-10 26 of 28 shipped `u-*` utility recipes unused; NOTE-11 `TB_COL` hexes don't follow the light theme; NOTE-12 binder "days free" rows now read as warnings._

- **PIA-040 (patch):** A6 full pass — inventory reconciliation (100% of Phase-0 rows demonstrably present), security spot-check on all new/edited `innerHTML` sinks (`esc()` usage), CSP/SRI untouched, dead-CSS sweep, `index.html` redirect shim still consistent with any renamed anchors. Findings ticketed, fixed by A3/A4, re-audited.

### Phase 5 — Ship (human + Manager)
- Envelope per ticket already written at each phase gate; ship in order PIA-030 → 040 via `bash scripts/ship.sh <id>` (human runs push per HQ §2.4 — sandbox cannot push `.git/`... in Cowork; from Claude Code remote, Manager pushes to the designated branch instead).
- D4 live-site verification per ticket (view-source grep for a new token name) before closing.

---

## 3. Working agreements

- **Refactor discipline:** implementers may restructure markup and `render*` functions but must not touch pure logic (`computeRanking`, `familyForDate`, quota module, `fetchFlights`, `syncURL`). If a render function is entangled with logic, the extraction is its own ticket (this is effectively incremental PIA-008 groundwork — a welcome side effect, not a goal).
- **State compatibility:** localStorage keys and URL param names are frozen — existing users' watchlists, caches, and share links must survive the overhaul.
- **Escape hatch:** any ticket that balloons past its surface is abandoned and re-scoped (HQ §6 single-purpose rule) rather than silently expanded.
- **Budget:** Manager time-boxes each specialist run; A5 regression matrix is the fixed 5-item list above plus the ticket's own ACs — no open-ended exploration.

## 4. Sequencing summary

```
Phase 0  A1 inventory ──► human sign-off (contract)
Phase 1  A2 tokens ─────► human picks direction
Phase 2  A3 ∥ A4 shell ─► A5 gate per ticket
Phase 3  A3+A4 per surface (6 tickets) ─► A5 gate each
Phase 4  A6 audit ──────► fix loop
Phase 5  ship PIA-030..040 in order, D4-verify each
```

Estimated: ~10 tickets, 3–4 working sessions with parallel implementers. The single highest-risk item is Phase 2 (shell/nav) — it touches everything; that's why it lands before any restyle and gets the strictest A5 pass.
