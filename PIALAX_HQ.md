# PIALAX HQ — Operating Playbook

_Last updated: 2026-05-25 · Owner: Ashwin · Repo: shwinster101/PIALAX_

This file is the single source of truth for how the PIALAX project is run as a multi-team Cowork operation. It defines thread topology, per-team prompts, Cowork feature usage, and the scheduled autonomous run.

> **Most recent amendments (2026-05-25):** §1 thread merge allowance · §2.4 D1 ENVELOPE READY stamp · §2.4 D4 live-site verification · §2.5 A1 lessons-learned coda · §2.5 A4 standing lessons-learned prompt · §4 patch fast-path · §6 intent-level AC rule · §8 known sandbox limits. Derived from the post-mortem on the PIA-001 → PIA-003 ship cycle (see `LESSONS_LEARNED_2026-05-25.md`).

---

## 1. Thread topology

One team per thread keeps each context window clean. Memory (`MEMORY.md`) is the shared spine.

- **T1 — Requirements HQ** (long-lived): backlog owner, accepts Auditor proposals, emits tickets.
- **T2 — Coder bay** (per-feature, short-lived): opened per ticket, reads `pialax.html` + `pialax-mobile.html`, ships diff, closes.
- **T3 — Test & Eval** (per-release): validates Coder diff against acceptance criteria + regression matrix.
- **T4 — Deployment** (long-lived, narrow): git ops + server checks only. Secrets/tokens stay isolated here.
- **T5 — Auditor** (scheduled, ephemeral): spawned by the daily run, reads code fresh, emits one proposal artifact, exits.

Rule: do not mix teams in one thread. Bleed-over corrupts file-path and recommendation accuracy.

**Allowed merge (solo-run efficiency, 2026-05-25):** T5 → T1 may run in a single thread when the same human is reviewing both outputs back-to-back. Auditor proposes → Requirements team ingests into `backlog.md` in the same context. T1's R1 prompt is run inline after the T5 A1 artifact saves. Do NOT merge any other pair — T2/T3/T4 stay isolated because of the secrets boundary and the diff-review handoff.

---

## 2. The 15 best-leveraged prompts

### 2.1 Requirements team (T1)

**R1 — Intake**
> Take this Auditor proposal artifact at `<path>`. For each of the 5 systems, write a ticket with: user story, acceptance criteria, target sprint tag (patch/minor/major), affected files (pialax.html, pialax-mobile.html), and rollback note. Output as a markdown table I can paste into the Coder bay.

**R2 — Prioritization**
> Given current backlog at `PIALAX/backlog.md` and the JFK transition deadline (2026-09-01), re-rank top 10 tickets by leverage = (user impact × frequency) ÷ effort. Flag any ticket that blocks the JFK transition.

**R3 — Spec sharpening**
> Pretend you're a skeptical third-party user. Read ticket `<id>` and list the 3 ambiguities a coder would have to guess at. Rewrite the acceptance criteria to remove all 3.

### 2.2 Coder team (T2)

**C1 — Implement**
> Implement ticket `<id>`. Constraints: edits only in pialax.html + pialax-mobile.html, preserve the FAMILY date-aware array (JAX→JFK after 2026-09-01), preserve 4-person family composition (PIA=2, LAX=1, JAX/JFK=1). Show me the diff before writing.

**C2 — Refactor for AI-readability**
> Restructure `<function/section>` so a future Claude agent can edit it safely. Add inline contracts (input/output comments), keep public surface identical. No behavior change.

**C3 — Mobile parity check**
> Diff pialax.html against pialax-mobile.html for `<feature>`. List divergences and propose the minimal change to bring mobile to parity without breaking touch UX.

### 2.3 Test & Eval team (T3)

**T1 — Acceptance run**
> Run ticket `<id>` acceptance criteria against the current diff. For each criterion: PASS/FAIL + 1-sentence evidence. End with a go/no-go for deployment.

**T2 — Regression matrix**
> Generate the regression checklist for this change touching `<area>`: family-composition render, JFK date-transition logic, d3 axis edges, mobile breakpoints, push flow. Mark which you can verify by reading code vs which need browser checks.

**T3 — Adversarial input**
> Act as a malicious or distracted user. Propose 7 inputs/states that would break the change in ticket `<id>` — include date edge cases (Aug 31 / Sep 1 2026), empty family array, network failure on tile load.

### 2.4 Deployment team (T4)

**D1 — Ship (standardized flow, PIA-002 onward)**
> User said 'push to github' or 'ship it'. (1) Run D2 preflight — block on failure. (2) Write the ticket's ship envelope to the working tree: `scripts/messages/<id>.msg` (conventional-commit subject, blank line, body — `git commit -F` format) and `scripts/messages/<id>.files` (one path per line; **must include both envelope files themselves** so the audit trail commits with the change). (3) **Emit the exact stamp `ENVELOPE READY: bash scripts/ship.sh <id>` on its own line** — user greps/scans for this token to know the working tree is staged and it is safe to run the ship command. Do not emit the stamp until both envelope files are confirmed on disk. (4) Confirm "ship it" from user. (5) User runs `bash scripts/ship.sh <id>` on their Mac. The script re-runs preflight, resets the index, stages exactly the manifest, commits with the `.msg`, pushes to `shwinster101/PIALAX` main, and re-installs the pre-push hook. (6) User pastes back the SHA — T4 verifies against `origin/main` and closes the ticket. (7) Run D4 to verify GitHub Pages is serving the new SHA before declaring the ticket fully closed.
>
> **Why the stamp matters:** prevents the ship-before-envelope race that hit PIA-003 (user ran `ship.sh` before T4 finished writing envelope; preflight died on `missing ship envelope`). Stamp is a single grep-able token; do not paraphrase it.
>
> **Why the user runs it, not T4:** the Cowork sandbox can write the working tree but not `.git/` (mount-level perms), so commits and pushes must originate from the user's Mac. T4 never executes the push directly.

**D2 — Pre-flight**
> Before any push: run `bash scripts/preflight.sh`. Banner line prints `HERE=<repo-root>` and `scripts/=<n> files` so a misrooted invocation is obvious before any check runs. Steps: (1) file presence, (2) no `console.log` in shipping HTML, (3) hardcoded-secret scan, (4) `<script>` tag balance, (5) live SRI freshness via `scripts/verify-sri.sh` (re-hashes pinned cdnjs URLs vs the integrity= attribute), (6) `bash -n` syntax check on every `scripts/*.sh` so a broken helper can never reach main — even if it's not the one being shipped this round, (7) optional `shellcheck` pass — advisory by default (skips if not installed, surfaces findings as `··` notes without blocking); set `STRICT=1` to escalate shellcheck warnings into gate failures. Exit 0 = GO. Any failure = NO-GO, do not push. The same script is wired as `.git/hooks/pre-push` so regressions are blocked locally; `scripts/ship.sh` re-installs the symlink on every run. Nested scripts are invoked via `bash` (not `./`) so a stripped executable bit doesn't break the chain.

**D3 — Rollback drill**
> Identify the last 3 green SHAs on main. Write the one-line revert command for each. Save to PIALAX/rollback.md.

**D4 — Live-site verification (post-push, 2026-05-25)**
> After every push, before closing the ticket, verify GitHub Pages is actually serving the new code. User opens `https://shwinster101.github.io/PIALAX/`, `Cmd+Option+U` to view source, `Cmd+F` for a string from the diff (e.g., `integrity="sha512-vc58qv` for PIA-001, or the new function name for a feature). If found → Pages is current, close ticket. If not → wait 2 minutes, hard-refresh (`Cmd+Shift+R`), retry. After 5 minutes without success → Pages is misconfigured or building; check repo Settings → Pages source branch. Code on `origin/main` is necessary but not sufficient — only "served bytes match committed bytes" closes the loop.

**Ship envelope contract**
> Every shipped ticket carries its own envelope under `scripts/messages/`:
> - `<id>.msg` — full conventional-commit message. First line = subject (≤72 chars, `type(scope): ...`). Blank line. Body = bullet list of changes. Footer = `Closes <id>.`
> - `<id>.files` — one path per line, blank lines + `#` comments ignored. Manifest is atomic: `ship.sh` does `git reset` before staging so unrelated dirty paths don't leak in.
> - Both envelope files belong **in the manifest itself** — every commit ships its own provenance.

### 2.5 Auditor team (T5)

**A1 — Headline 5-system audit (primary)**
> You are the PIALAX Auditor. **First, read `MITIGATED.md` at the repo root** — items listed there are already closed and must NOT count against your 5 leverage slots; if you see evidence of regression on a closed item, flag it as a separate finding citing the ticket ID. Then read pialax.html and pialax-mobile.html in full. Identify exactly 5 systems with the highest leverage to fix, where leverage = (severity × blast radius × user-visibility) ÷ effort. For each system, output: (1) what it is, (2) potential hazard (PHA: what could go wrong, likelihood, severity), (3) Fishbone RCCA across 6Ms — Method, Machine, Material, Measurement, Manpower, Mother-nature/Env, (4) sprint tag — exactly one of patch / minor / major, (5) proposed fix in one paragraph. **After the 5 systems, append a "Lessons Learned" section** following the template in `LESSONS_LEARNED_2026-05-25.md` — three sub-blocks: (a) what shipped since last audit (cross-ref MITIGATED.md latest entries + `git log` delta), (b) what got re-flagged this run that shouldn't have been (regression signal), (c) one process note about the audit itself. End with a single proposal artifact in markdown titled `AUDIT_PROPOSAL_<YYYY-MM-DD>.md` saved to the PIALAX folder, formatted for the Requirements team to ingest directly. Do NOT write code. Do NOT touch the two HTML files. Output only the proposal.

**A4 — Standing lessons-learned & action items (2026-05-25)**
> Read `MITIGATED.md`, the four most recent `AUDIT_PROPOSAL_*.md` artifacts (if present), and the four most recent team-thread transcripts (T1, T2, T3, T4) via `mcp__session_info__read_transcript`. Synthesize the friction patterns that slowed the previous T1→T5 loop (ship-before-envelope, sandbox egress gaps, AC drift, live-site delay, comment punch-lists, etc.). Output `LESSONS_LEARNED_<YYYY-MM-DD>.md` with: (1) Process patterns observed (with thread + line evidence), (2) Standing risks not yet ticketed, (3) Action items as a table — each row has `owner team | sprint tag | description | acceptance signal`. Do NOT modify `pialax.html` or `pialax-mobile.html`. May edit `PIALAX_HQ.md` only to integrate confirmed action items into the playbook (with the user's explicit go-ahead).

**A2 — Targeted PHA on JFK transition**
> Run Potential Hazard Analysis on just the JFK transition logic (FAMILY array swap on 2026-09-01). Table: hazard | trigger | likelihood (L/M/H) | severity (L/M/H) | detectability | mitigation.

**A3 — Security pass**
> Audit pialax.html + pialax-mobile.html for: XSS via tile data, unsafe innerHTML, third-party d3 CDN integrity, exposed API keys, mixed-content. Report only confirmed findings with line numbers.

---

## 3. Cowork features to lean on

- **Subagents (`Agent` tool)** — spawn each team as a fresh agent so its context is clean. Use `Explore` for read-only audit passes.
- **Skills** — `xlsx` for backlog tracking, `docx` for stakeholder requirements docs, `pdf` for stamped proposal artifacts.
- **Memory** — extend with `feedback_<team>.md` files as each team's quirks emerge.
- **Artifacts (`create_artifact`)** — live HTML page that re-reads `AUDIT_PROPOSAL_*.md` each open = standing audit dashboard.
- **Scheduled tasks** — powers the daily autonomous run (section 4).
- **`present_files`** — review Coder diffs without leaving Cowork.
- **Conversational triggers** — add `audit:`, `req:`, `test:`, `deploy:` keywords to feedback memory for automatic team routing.

---

## 4. Two-week scheduled autonomous run

Starts ~2026-06-07 (2 weeks from playbook date). Daily, 09:00, 10 minutes total budget.

Sequence:
1. **Auditor (T5)** → produces `AUDIT_PROPOSAL_<date>.md` in PIALAX folder.
2. **Requirements (T1)** → ingests proposal into `backlog.md`.
3. **Coder (T2)** → if any patch-tagged item exists, drafts the fix as a diff. Time-boxed to 5 min. **Not pushed.**
4. **Diff saved** to `PIALAX/pending_diffs/<date>.diff` for human review.

Guardrails:
- Deployment (T4) **never** runs autonomously. Human-in-the-loop for every push.
- Test (T3) runs only on patch-tagged items.
- Major/minor items stay queued for human triage.

**Patch fast-path (2026-05-25):**
- For tickets explicitly tagged `patch` (severity × blast small, effort trivial), the manual flow may compress to `T1 R1 → T2 C1 → T4 D2 → T4 D1 → T4 D4`. T3 acceptance step is skipped because patch-tag ACs are usually one-step and code-verifiable in the C1 diff itself. Anything tagged `minor` or `major` runs the full T3 pass.
- Patch tickets touching the security surface (SRI hashes, CSP, secrets) are an exception: T3 stays required even at patch tag, because browser-verifiable ACs (DevTools "Integrity: ok", tamper test) cannot be code-only.
- Scheduled autonomous run already follows this — extending it to manual runs eliminates a context-switch tax.

---

## 5. PHA + Fishbone RCCA templates

### PHA table
| Hazard | Trigger | Likelihood (L/M/H) | Severity (L/M/H) | Detectability | Mitigation |
|---|---|---|---|---|---|
|   |   |   |   |   |   |

### Fishbone 6M
- **Method**: process / algorithm / logic flow issue
- **Machine**: browser, CDN, server, device
- **Material**: data inputs, FAMILY array, flight data
- **Measurement**: how we'd detect the issue (logs, tests, user reports)
- **Manpower**: human/agent error in spec or implementation
- **Mother-nature / Environment**: network, time-of-day, locale, date edge

---

## 6. Constraints (locked, do not violate)

- Code edits live in `pialax.html` + `pialax-mobile.html` only. (Tooling-only files like `scripts/*.sh`, `MITIGATED.md`, `LESSONS_LEARNED_*.md`, and `PIALAX_HQ.md` itself are infra/docs and editable when their owning prompt authorizes — they are NOT code.) **Amended 2026-10-18 (PIA-134):** v2 tickets (PIA-134 … PIA-147) edit `app.html` + `scripts/trip-model.js` instead and must not touch the v1 files, `index.html` or `scripts/trip-idea-builder.js` before the cutover — see §12.
- "git push" / "push to github" → commit + push to `shwinster101/PIALAX`.
- FAMILY array is date-aware: JFK after 2026-09-01. (v2: the trip model's `familyForDate` keeps this rule — Anjo at JAX before 2026-09-01, LGA from then on, JFK through the NY set — and the ORD drive pivot for Peoria stays; see §12.)
- Family composition: 4 people total — PIA=2 (Mom & Dad), LAX=1 (Ashwin), JAX/JFK=1 (Sister). Not 1 per airport.
- Auditor outputs 5 systems segmented patch / minor / major, ending in a proposal artifact.
- **Acceptance criteria are written at intent-level, not implementation-level (2026-05-25).** Example: "modern SRI integrity hash present on each CDN script" — NOT "sha384-…". This avoids the sha384→sha512 amendment ping-pong observed on PIA-001 (T2 shipped sha512 because it was cdnjs's default and strictly stronger; T3 flagged the ticket text as the bug, not the impl). When intent and implementation diverge in a non-regressive direction, T3 returns GO and T1 amends the ticket; do NOT re-implement.
- **Single-purpose tickets (2026-05-25, PIA-004).** Each ticket envelope should land as **one commit**. If mid-ship a bug surfaces that requires changes beyond the manifest, prefer (a) abandoning the in-flight ship + opening a new ticket over (b) silent scope expansion. Lesson source: PIA-002 landed as 4 successive commits (`c79ff1d → 652210d → a4ad386 → 37a562a`) because exec-bit, cwd-diagnostic, step-7 add-on, and `$0`-symlink-resolution were bundled — each fix only surfaced the next-deeper entry-point bug. Narrow scope is faster to debug; bundled scope compounds failure surfaces.

---

## 7. Daily ops cheat-sheet

| Want to... | Open thread | Use prompt |
|---|---|---|
| File a new ask | T1 Requirements | R1 or R3 |
| Build a feature | T2 Coder bay | C1 |
| Validate a diff | T3 Test & Eval | T1 then T2 |
| Ship to prod | T4 Deployment | D2 → D1 → D4 |
| Verify live site | T4 Deployment | D4 |
| Hunt for issues | T5 Auditor | A1 |
| Run process post-mortem | T5 Auditor | A4 |
| Stress JFK swap | T5 Auditor | A2 |
| Security spot-check | T5 Auditor | A3 |

---

## 8. Known sandbox limits + recovery protocols (2026-05-25)

These are the friction patterns that hit the PIA-001 → PIA-003 ship cycle. Every team thread should expect them and handle them up-front rather than crashing into them mid-task.

**Egress allowlist gaps**
- `cdnjs.cloudflare.com` and `api.cdnjs.com` are NOT reachable from the Cowork sandbox (T2 and T3 both confirmed 403 / network failure).
- `github.com` page-source fetch is allowed via `mcp__workspace__web_fetch` for known public URLs, but not for the live Pages site without paste-first provenance.
- **Fallback protocol:** when a verification step requires a blocked domain, the agent emits *"Sandbox cannot reach `<domain>`. Please paste `<exact thing needed>` and I'll continue."* Do not silently guess or fall back to npm-derived approximations of CDN bytes — wrong-hash failure = dark dashboard.

**Sandbox disk-full / fork failure**
- Observed on T2 PIA-001 (useradd: fork: retry: Resource temporarily unavailable). Recovery: re-issue the same tool call after a 30-second wait; if it fails twice, save partial output to disk under `/Users/ashwinyedavalli/Documents/Claude/Projects/PIALAX/.recovery/<id>-<timestamp>.md` and hand the rest to the user with explicit instructions.

**Working tree vs `.git/` mount**
- The sandbox can write the working tree but not `.git/` (mount-level perms). All commits and pushes originate from the user's Mac via `bash scripts/ship.sh <id>`. T4 never executes the push directly.

**Sandbox cwd vs user-visible paths**
- `mcp__workspace__bash` cwd uses `/sessions/<name>/mnt/PIALAX/`. User-visible paths are `/Users/ashwinyedavalli/Documents/Claude/Projects/PIALAX/`. When telling the user to run a command, use the user-visible `~/Documents/Claude/Projects/PIALAX` form, never the sandbox mount path.

**Live-site vs origin/main lag**
- GitHub Pages auto-deploy lags origin push by 30s – 2min. D4 (live-site verification) closes the gap. Audits running on `pialax.html` from local disk reflect the next-deployed bytes, not the currently-served bytes — relevant only if a recent push hasn't been D4-verified yet.

---

## 9. Lessons-learned log (2026-05-25, PIA-004)

After each substantial ship cycle (≥3 tickets or any cross-team friction worth recording), T5 produces a `LESSONS_LEARNED_<YYYY-MM-DD>.md` at the repo root via the A4 prompt (HQ §2.5). The file follows a fixed 3-block structure so it is mechanically parseable by the next R2 prioritization pass:

1. **Process patterns observed** — pattern ID, evidence (thread/commit/line), generalization, where codified (or "not yet codified" with proposed home).
2. **Standing risks not yet ticketed** — risk ID, plain description; promoted into tickets at the next T1 R2.
3. **Action items table** — `owner team | sprint tag | description | acceptance signal`. Mechanically convertible into backlog rows.

**Ingestion path:** T1 ingests open action items into `backlog.md` at the next R2 prioritization pass. T4 references the latest file when amending this playbook (HQ amendments themselves close action items, recursively).

**Existing files:**
- [`LESSONS_LEARNED_2026-05-25.md`](LESSONS_LEARNED_2026-05-25.md) — PIA-001..003 cycle retrospective. 7 patterns, 5 standing risks, 6 action items distributed across T1/T4/T5.

---

## 10. Positioning & integration principle — "own the phase, hand off the rest" (PIA-026, 2026-07-21)

**PIALAX owns exactly one phase of the trip lifecycle and integrates with incumbents for the rest. Do not reinvent what Google Flights or Flighty already do well.**

**The phase we own — the pre-purchase / consideration phase:**
> _"I'm down to add this trip to my watchlist and start searching and setting alerts — but I'm not quite ready to buy the ticket yet."_

That phase has no home today. Google Flights tracks **one trip's price at a time**; Flighty covers trips **already booked or completed**. The gap between "idea" and "purchased" — a **watchlist of trips under consideration**, across solo + family, with notes, reminders, group cost, and the cheapest-week-to-gather signal — is PIALAX's high-leverage territory. Everything we build must make PIALAX the best possible home for that phase.

**Hand off, don't rebuild:**
- **Google Flights** — expanded flight options, live pricing, booking, and **price alerts**. A watched trip opens a traveler-specific GF search after its flight airport or city code is confirmed; dates are included when known, while flexible ideas open a route search. The user chooses “Any dates” and enables price tracking in Google Flights. A saved PIALAX idea is not a synced Google trip or tracked-price subscription. We do NOT try to out-search or out-track GF on a single itinerary.
- **Flighty** — passport wallet, day-of tracking, and **past/booked flight stats**. Once a trip is booked/flown, we point to Flighty rather than duplicating tracking.

**Test for every new ticket:** it must either (a) deepen the watchlist/consideration phase (group economics, cheapest-week, notes/reminders, coordination), or (b) improve a hand-off to GF/Flighty. If it merely re-implements single-trip search (GF) or post-booking tracking (Flighty), it is out of scope — link out instead.

_Codified from the 2026-07-21 sprint. Source: `SPRINT_PROPOSAL_2026-07-21.md` §4a (Watchlist reframe) + Ashwin's positioning steer._

---

## 11. "Context to Decision" sprint retrospective (PIA-046..051, 2026-08-02)

**What shipped, flag-gated (`?flags=assistant`, default OFF, persists once set):**
a Context Log (append-only notes → structured facts, never silently
overwritten), a deterministic fallback parser + optional Anthropic extraction
(Worker `POST /extract`, fails closed, degrades to the local parser with zero
config), a four-state decision engine (CHANGE DATES / COORDINATE / BUY /
WAIT) with fare snapshots and a reviewed Google Flights handoff, and a
preview-only alerts layer (PIA-051 — no email provider yet, see backlog
PIA-052). Plus an audited defect pack, an a11y pass, and the repo's first
feature-flag primitive (PIA-046).

**Parser accuracy — read this before trusting the number.** `test-extraction.sh`
reports field accuracy against `scripts/fixtures/extraction-fixtures.json`
(89/89 → 100% at last count). That number was written by the same person who
wrote the parser, so it mostly proves internal consistency, not real-world
recall. Every phase that touched the parser was cross-checked by hand-probing
it with inputs that had NO fixture — that process caught 4 real bugs across
the sprint (a reversed "to B from A" phrasing that would have inverted an
itinerary; a constraint that bound to the nearest clock time instead of the
one actually stated; a round-trip date range with nowhere to store the return
leg; a note that *updates* an existing trip producing nothing, because the
parser only looked for a complete route inside one note). Each was fixed and
turned into a new fixture, but the technique — write fixtures, then
adversarially probe past them — is the actual quality signal here, not the
pass rate. Anyone extending the parser should keep doing this, not just
adding fixtures that already match its current behavior.

**Two defects only became visible once the engine was wired to real UI**
(Phase 5), and are worth internalizing as a pattern: (1) the decision engine
was blind to a real, already-known conflict (the Peru trek briefing) because
it only read confirmed `ParsedFacts`, and a seeded trip has none — it has to
also read the trip binder, where the app's OTHER features already keep this
kind of fact. (2) fare history was never actually recorded from a real
render for the first two phases it existed, because the function that wrote
it lived in an orchestrator (`recomputeTripDecision`) that nothing called —
correct in isolation, dead in the app. Both are the same lesson: a
fixture-green pure function proves the function is right, not that it's
wired to anything. Phase 5's browser walkthroughs (not the unit fixtures)
found both.

**Architecture note for future work:** `TripState` is DERIVED every render
from the watchlist item + confirmed facts (`tripStateFor`), never persisted
as the source of truth — the item stays authoritative for what it already
owns (route, dates), confirmed facts supply what it can't express
(constraints, companions, targets, deadlines). `pialax_trip_state_v1` still
exists but now holds only a tiny "last seen recommendation" cache used
solely to detect a material change for alerting — it is never read back for
rendering. If you're tempted to read it for anything else, don't; that was
the exact bug in (2) above.

**Manual configuration remaining:** `wrangler secret put ANTHROPIC_API_KEY` +
`wrangler deploy` to enable live extraction (works without it, at reduced
recall); the flag itself (`?flags=assistant` once, or the Admin checkbox);
email delivery is preview-only until PIA-052.

_Source: sprint spec `SPRINT_PROPOSAL_2026-08-02` (verbal), tickets
PIA-046 through PIA-051, this file's §10 positioning principle unchanged._

---

## 12. v2 — `app.html`, its decisions, the word rule and the cutover (PIA-134, 2026-10-18)

**Why.** v1 grew two trip models (the watchlist card and the shared `/idea` doc), estimated prices that disagreed with each other, and screens with hundreds of words. v2 is a new single file, `app.html`, built beside v1 on `main` and linked from nowhere until the cutover, so the family keeps using v1 until v2 is proven.

**The decisions every v2 ticket inherits**

| | Decision | What it means for a ticket |
|---|---|---|
| **D1** | Purposes, not features | Each v1 feature's purpose is served by a v2 element or deliberately dropped (the redesign spec's feature-disposition table). A ticket may retire a v1 control if its purpose is covered. |
| **D2** | One record | The shared `/idea` doc is the only store of trip facts; `tripModel` (scripts/trip-model.js) derives every screen from it on every render. No screen keeps its own dates, hub, people, stage or total. |
| **D3** | The shared watchlist is a list of ids | Each phone keeps the trips it opened (`pialax_watchlist_v2`); trips travel by link (`?idea=`, the list link `?l=<id>.<id>…&f=<face>`, the organizer's own-devices links). No backend list. Acceptable only if people understand it: a 2-person comprehension check ("Where did Tahoe come from? Will new ideas appear?") is owed before cutover. |
| **D4** | Cheapest week on demand | Organizer-initiated, real searches only, the cost shown before spending, never a synthetic price. |
| **D5** | Desktop = the phone app in a centred column | One `@media (min-width:700px)` block; at cutover the v1 pages become redirect shims. |

**The strict word rule.** A word is a visible whitespace-separated token containing a Unicode letter — tab and segment labels, codes, month names, names, buttons, placeholders and typed values all count. Free: trip names (`[data-free]`), numerals, prices, dates, emoji, glyphs and shapes. Every screen ≤10 words, every popup (sheet, long-press label, toast) ≤20, in every state. `scripts/test-words.sh` counts the rendered DOM in Chromium on fixture phones (8 members with long names, unknown airports, a revealed token, long typed values, a failed refresh) and fails the gate; it is in preflight and skips itself without Playwright. Test & Eval (T3) treats a word-budget failure like a failing assertion, never as a style note.

**Amended domain rules.** The mock / estimate engine is retired for v2 (no `getMock`, sample fares, meetup estimators or seeded personal trips in `app.html`; an unsearched fare is shown as unsearched). The ORD drive pivot and `familyForDate` are kept, inside the trip model. Keys shared with v1 are read and written in v1's exact formats; v2 never deletes or replaces an edit key and reads `pialax_watchlist_v1` once without writing it. v2's list link uses `?l=` because v1 owns `?w=` (PIA-131) and `?wl=`.

**Build and cutover plan**

1. **PIA-134** — the shell: tabs, sheets, ⓘ / long-press labels, ⚙, the trip store and router, the word gate, the drift test, preflight coverage.
2. **PIA-135 … PIA-145** — the screens on that shell: Ideas, create, trip view and RSVP, dates, booking, prices, cheapest week, Family, Map, Calendar, then the job-flow / viewport / comprehension suite. Each ticket keeps `test-app`, `test-words` and `test-viewport` green and edits only `app.html`, `scripts/trip-model.js` and their tests.
3. **PIA-146** — the family's history and the live v1 trips are brought across (P-migrate for legacy docs, a one-time import).
4. **PIA-147 — cutover and v2.0.0.** `index.html`, `pialax.html` and `pialax-mobile.html` become redirect shims to `app.html` (query and hash kept, no standalone web-app mode); v1's code, its parity rule and the 3-way builder drift test are retired; CHANGELOG `[2.0.0]` lists the breaking changes. Preconditions: PIA-146 done the same day; no v2 link shared before; the prototype's Mom & Dad icon check and the 2-person shared-list comprehension check recorded.

Until PIA-147: nothing links to `app.html`, v1 stays untouched, and the Deployment team (T4) ships v2 tickets like any other envelope (preflight GO), knowing they change nothing the family sees.


### PIA-147 implementation amendment (2026-10-23)

The cutover candidate replaces all three public entry pages with fixed redirects
to the one app. On this branch, v1 parity and builder drift rules are retired;
current commands and architecture are in [CLAUDE.md](CLAUDE.md). Historical rules
above describe prior releases. The browser gate is mandatory: missing or skipped
coverage is NO-GO. Explicit PIA-146 import may reread the read-only v1 watchlist
for later shared IDs; it never silently creates history on boot.

[PLAN_PIA_147_CUTOVER.md](PLAN_PIA_147_CUTOVER.md) defines the cutover contract;
[RELEASE_V2.md](RELEASE_V2.md) records retained/retired tests, pending same-day
actual migration, human/device checks and rollback. Fixture tests do not complete
these launch checks. Public cutover and family-link sharing wait for recorded
release readiness and verified deployed bytes.

### PIA-154 amendment: one glyph, one meaning; three label words (2026-10-27)

**The word rule, amended.** A screen keeps at most 10 ordinary words, and may add
at most 3 *marked* label words, each inside `[data-lbl3]` and each from one list:
Coming?, Hosting?, Lock dates, I booked, Landing time, Track, Lands, Leaves, and
Tue / Wed / Thu in Calendar's weekday header. A popup (sheet, long-press label,
toast) keeps 20 and marks nothing. The app's own `screenWords()` counts ordinary
words only, so a label never pushes a name off the screen. `test-words` counts
the two apart and fails on an 11th ordinary word, a 4th marked one, a marked word
off the list, or any mark inside a popup.

**One next step.** `primaryAction` (the marked model region) picks the trip page's
one filled button and the card's slot by the same rule: share while someone
waits, then 🔒 Lock dates (one tap, ↩ in its toast) on the organizer's phone;
✈ Book ↗ with 🎫 I booked once the dates are locked (☐ I booked since PIA-156); 🛬 Landing time once booked;
✈ Track ↗ in the travel window; otherwise nothing. Rare actions (Pin, Hide on my
phone, Share, Calendar, Note, Edit, Remove for everyone; PIA-155) live in ⋯ More.

**One glyph, one meaning.** One share symbol (an inline SVG) replaces 📣
everywhere; 🎫 only means booked (superseded by the PIA-156 amendment: ✈ alone
means booked, 🎫 is gone); 🔒 only belongs to the date pill, P-dates and
Lock dates; ☀ / 🌃 only appear while a time is typed; 📌 only where the event
day is set (P-dates, and the create and edit steps), never on a pill or card.
No placeholders stand in for missing data (no $— chips, 0 days or ––:––): where
something can be priced, the action that fills it is shown instead. A saved plan
that cannot be locked yet (no destination, already begun) shows 🔒 Lock dates
greyed in P-dates, saying why on a tap. 🧭↗ Explore stays on the organizer's card
for an idea with no place; guests and the trip page no longer show it (a guest
cannot change the destination).

No storage, link-format or Worker change; every write uses the existing paths.

### PIA-155 amendment: remove an old trip as it is; More says what it does; whose fare (2026-10-28)

**A v1 trip takes two edits before ⤒ Update trip.** The Worker's `/idea/update`
takes a decision alone on any record, so the organizer can remove a v1 trip for
everyone (`{decision: dropped}`) and ↩ it (`restoreDelta`: 💵 paid again with its
amount, 🔒 chosen again with the record's own stored choice, its place, days and
estimate, else proposed), each sent with no idea: the v1 idea stays byte-identical
and the trip still reads as v1. On a v1 record, a removal or ↩ another phone already
made settles with nothing sent (an updated trip simply sends the idempotent repeat). Every other edit of a v1 record still waits for ⤒ (`legacyDecision`, the
model's one gate). 🗑 waits only while a ⤒ update of that trip is half done on
this phone (its journal resumes it), or on a record with no decision object.

**⋯ More says what each row does and whom it touches.** The stage is one quiet
line (five dots, the stage it is at by name: a picture, never a list of choices);
"🗄 Hide on my phone" / "Show on my phone" (this phone's list only; not on a trip
the shelf holds anyway) and "🗑 Remove
for everyone" (P-drop's "🗑 Remove" beside Keep, its ↩). The list's shelf row stays
"🗄 Archive n" (past, removed and hidden trips).

**The price row says whose fare, where a price helps decide.** "🔍 Price 🗽" (the
faces of the travelers not searched yet), "$1,234 🔍🗽" once some are; how many
searches and their cost stay on P-total's 🔍N before anything is spent (D4). It
shows before 🔒, once a fare is cached, or once paid; after 🔒 with nothing cached
there is no row (each traveler's own sheet keeps its 🔍, and ✈ Book ↗ shows
Google's live price), nor a 🔍N on the card.

### PIA-156 amendment: who's set; ✈ means booked; five label words (2026-10-29)

**The word rule, amended again (the owner's "a word or 2").** A screen keeps at
most 10 ordinary words and may add at most **5** marked label words
(`[data-lbl3]`), each from the list: Coming?, Hosting?, Lock dates, I booked,
Landing time, Track, Lands, Leaves, Tue / Wed / Thu (Calendar's header only) and
Booked, Waiting, Hosting (the trip page's key rows only). A popup keeps 20 and marks
nothing. `test-words` fails a 6th marked word and passes 5; where "Hosting?", a
two-word primary and three key rows would make 6, the key's third row keeps its
glyph and faces and drops its word.

**Who's set.** Under the trip page's board, after the rows already there (the price
row, 💵 Paid) and above the primary, a quiet key of at most three 44px rows answers
"who is still to book, who has booked, who is hosting" (the model's `whoSet`, read
from the record): before 🔒 and while nobody has booked, ⏳ Waiting (no answer yet;
never a host) and 🏠 Hosting; once 🔒 or anyone booked, ⏳ Waiting (every traveler
not booked yet, me too), ✈ Booked and 🏠 Hosting. ⏳ Waiting comes first, and the
key only takes the space under the rows that were there before it: on a short phone
(678px tall) with a sticky primary those rows keep their first-screen place, and on a
family trip's three-row board with nothing else under it the ⏳ Waiting row and its
Remind are in view without a scroll (with the organizer's price row there, the key is
a short scroll down). Someone Out is in no
row; a paid, removed or past trip has no key. Its faces open their sheets; the
organizer's Remind ends the Waiting row (one person besides him → their own guest
link, the nudge, named "Remind <name>"; several → the trip's guest share, unless the
primary already is that Share). No link ever carries a key.

**✈ means booked.** The booked face badge and every booking mark in the app is ✈
(🎫 read as a concert ticket on iPhone); ✈ otherwise only leads the arrowed hand-offs
(✈ Book ↗, ✈ Track ↗, ✈↗, ✈⏱↗). A round-trip fare is ↔, a flight with no link ↗⚠
and one whose dates cannot be flown 🗓⚠. The booking toggles read as checkboxes with
the same words both ways ("☐ I booked" / "☑ I booked", the organizer's "☐ Booked" /
"☑ Booked"; ☑ in text presentation, U+FE0E). The same writes as before; no Worker,
storage or link-format change.

### PIA-157 amendment: rides (2026-10-30)

**The word rule's allowlist adds Rides**, for the trip page's key row and its
primary only ("🚗 Rides"); `test-words` fails it marked anywhere else. Popups keep
20 and mark nothing.

**Which trips have rides.** A trip to a home the family drives from: a host who is
not Out lives at a drive-pivot airport (Peoria, PIA) and the destination is PIA or
ORD. Its runs follow the pickups' ⏱ rule on booked times only (never a ≈ cached
time; on the organizer's token phone a ≈ chip can still join a Map bracket that
no run holds): legs of one kind at one airport on one day, chained at most 2
hours apart (`runChain`, the one rule for the Map's brackets and the runs;
arrivals and departures chain apart, and a traveler's own 🚌 / 🚙 leg is in no
run). ⏰ leave
home: a pickup its drive before the first landing, a drop-off its drive plus 2
hours before the earliest flight (0:20 to PIA, 2:30 to ORD). Who can drive: the
hosts not Out, then the travelers there all that day. Nothing about a run is
stored; it is read from the record on each render (D2).

**A claim lives in the driver's own answer** ("🚗ashwin-p8.aORD1120": the
traveler, the end, the airport and the day, never the time), written as one
complete answer from a fresh read through the one write path. A time change that
day keeps it; a day or airport change leaves it "moved" (⚠, open) until the driver
or the organizer says ✓. A claim counts only from someone who can drive that run
as it is now (a host not Out, or a traveler there all that day); any other is
ignored and its claimer's next ride write drops it. One toggle rule
(`rideToggle`) says what a tap does and whether it reads ☑: claim what nobody
covers, else let go of the driver's share. Every leg someone else's holds the tap
("Already covered"); a record already as asked (Mom's phone and Dad's are one
member) says ✓; nothing is sent either way. No flight number or confirmation
code is stored anywhere, and nothing tracks a flight (Flighty does, D1).

**The answer note's markers, a forward-compatible grammar.** After 📞 / 🛬 / 🛫,
in a fixed order: 🚗 claims, 🚌 legs, 🚙 legs, 🐈 legs, 🧺 dishes, then the typed
text. A later ticket appends any new kind last. Each of the new kinds is read
once; the first unknown or malformed token starts the text, so an older build
keeps the markers as text byte for byte. A marker or time write that would pass
280 characters is refused, never clipped.

**Where rides show.** The trip page's key gains a 🚗 Rides row after ⏳ Waiting
(open runs as dashed chips, a booked leg with no time, the organizer's Ask; once
covered, the drivers' faces); the primary is "🚗 Rides" for the organizer and a
host who can drive an open run, and "🚗 11/20 ⏰12:05" for a driver, after every
earlier primary keeps its precedence; the card's slot says the same. P-rides holds
every run (claims, the organizer's toggles, ✓, Remind, 🚌 / 🚙) and a driver's 📅
Phone: one calendar file of their runs, in floating local time with two alarms,
whose description is the guest link alone. The phone keeps what it added; read
less the runs already behind us, any difference with the rides ahead dots 📅
Phone, the card and the Trips numeral, also once that phone drives nothing (its
calendar still holds the old events): opening the trip then says "📅 Rides
changed" once and forgets it. Ask, Remind and the time toast's Tell put the ride
in words beside a guest link, never a key or token.

**Known limits (recorded, not built).** Times are wall-clock times on the leg's
own day: a landing after midnight on the day after the traveler's first day, or
a ride across the night the clocks change (2026-11-01), puts ⏰ and the calendar
event off by that day or that hour. Every host not Out is offered Drive, with ⏰
from the Peoria home (a host living at ORD would read Peoria's times). A run's key
follows its first traveler in the trip's order, so an earlier traveler joining a
run changes the calendar event's UID (adding it again may make a second event).
Marking 🚌 / 🚙 on a leg someone drives gives no Tell in its toast (↩ instead);
the driver sees it in the app and by the card's dot only once they added the
calendar. A traveler cannot ask for a ride yet (the organizer's Ask is the one
share).
