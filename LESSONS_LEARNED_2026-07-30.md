# LESSONS LEARNED — 2026-07-30

_Scope: the 2026-07-21 → 07-30 cycle (JAX/Peru/Memphis trip planning, watchlist + solo-mode moat build, PIA-020..041 including the parallel UI overhaul). Template per `PIALAX_HQ.md` §9._

## 1. Process patterns observed

| ID | Pattern | Evidence | Generalization | Where codified |
|---|---|---|---|---|
| P1 | **Fast feature work shipped an attribute-context XSS.** PIA-024's share-link code interpolated untrusted strings (localStorage / `?wl=` items) into HTML *attributes*, where the text-node `esc()` guard doesn't apply. Found and fixed by the PIA-040 audit (exploit reproduced live pre-fix). | commit `61c1394` | Any untrusted string entering an attribute needs **boundary validation**, not just output escaping. New untrusted-input surfaces get a security pass before ship. | `sanitizeWatchlistItem()` + `WL_CODE_RE` at both merge boundaries (PIA-040) |
| P2 | **Parallel work streams desynced refs twice.** (a) A `checkout -B main` deploy dance left the feature branch on a stale base mid-build; (b) an independent 22-commit UI overhaul landed on `main` and a blind push was rejected (non-FF). Both were caught, neither force-pushed over. | session log; rejected push at `b4316b3` vs `7e246a2` | **Fetch before push; rebase, never force, on shared refs.** `--force-with-lease` is acceptable only on one's own topic branch after a rebase. Verify all refs aligned after every deploy. | Session deploy flow (`push -u origin <branch>` + `push origin HEAD:main`, fetch-first) |
| P3 | **Real-world date drift collides trips silently.** Memphis slipped from the week of Aug 16 to Aug 31–Sep 4, landing back-to-back with the Peru Sep 5 departure — and the Sep 5 red-eye lands Cusco Sep 6, *after* the Sep 5 17:00 trek briefing and the Sep 6 trek start. Nothing in the app flagged either collision; a human happened to notice. | this update | Trips in a watchlist are not independent — the app must check them **against each other** (overlap / back-to-back) and against **intra-trip fixed anchors** (briefings, tour starts). | **Implemented this commit:** `watchlistClashFor()` cross-trip chip on watchlist rows; briefing seeded as a binder segment so the binder's overlap detection fires; trek-card fits-line downgraded from green to ⚠ warn |
| P4 | **Seeded trips vs user-added trips can duplicate.** Memphis was first added via the "＋ New trip" flow (localStorage) and is now a seed — without a guard, users who did both see two Memphis rows. | this update | When a user-added trip is promoted to a seed, ship a targeted dedupe migration alongside it. | `_isSeedDupMemphis()` at both added-item merge sites |

## 2. Standing risks not yet ticketed

- **R1 — Sep 5 departure is operationally unresolved.** The data now *warns* (watchlist nextAction, trek card, binder timeline), but only a human can resolve it: either the Fri Sep 4 late red-eye straight after Memphis (lands Sat Sep 5, makes the 17:00 briefing) or an Eduardo-approved late join. Zero acclimatization before a 15,200 ft pass is also a health consideration the app cannot judge.
- **R2 — dedupe-on-promotion is ad-hoc.** `_isSeedDupMemphis` is a one-off; a general "seed absorbs matching user-added item (same mode+dest)" mechanism would prevent the next occurrence.
- **R3 — clash detection is date-granularity only.** `watchlistClashFor` compares whole days; it cannot see that a Fri-night red-eye makes back-to-back *feasible* while a Sat departure breaks the briefing. Time-of-day anchors live only in binder segments/notes.
- **R4 — post-overhaul solo/quota surfaces not re-audited.** The PIA-030..041 overhaul restructured both files; the earlier solo-mode audit's conclusions (quota gating, hand-off placement) should be spot-checked against the new DOM.

## 3. Action items

| Owner team | Sprint tag | Description | Acceptance signal |
|---|---|---|---|
| T2 | patch | ~~Cross-trip clash chip on watchlist rows~~ **shipped this commit** | ⛓/⚠ chip visible on Memphis + Peru rows |
| T2 | patch | ~~Memphis seed + Peru Sep 5 shift + briefing-conflict warnings~~ **shipped this commit** | Peru dep = 2026-09-05 everywhere; trek card shows ⚠ fits-line; binder shows briefing overlap |
| T1 | minor | Generalize seed-vs-added dedupe (R2) into `loadWatchlist` | Promoting any trip to seed cannot duplicate |
| T5 | minor | Post-overhaul re-audit of solo/quota surfaces (R4) | Findings doc; no silent quota spend paths |
| Ashwin | — | Resolve R1 with Eduardo (late-join?) or commit to the Sep 4 red-eye | Peru `dates` blocker cleared; nextAction updated |
