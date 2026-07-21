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

- Code edits live in `pialax.html` + `pialax-mobile.html` only. (Tooling-only files like `scripts/*.sh`, `MITIGATED.md`, `LESSONS_LEARNED_*.md`, and `PIALAX_HQ.md` itself are infra/docs and editable when their owning prompt authorizes — they are NOT code.)
- "git push" / "push to github" → commit + push to `shwinster101/PIALAX`.
- FAMILY array is date-aware: JFK after 2026-09-01.
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
- **Google Flights** — expanded flight options, live pricing, booking, and **price alerts**. Every watched trip deep-links to a GF search prefilled with its route + dates. We do NOT try to out-search or out-track GF on a single itinerary.
- **Flighty** — passport wallet, day-of tracking, and **past/booked flight stats**. Once a trip is booked/flown, we point to Flighty rather than duplicating tracking.

**Test for every new ticket:** it must either (a) deepen the watchlist/consideration phase (group economics, cheapest-week, notes/reminders, coordination), or (b) improve a hand-off to GF/Flighty. If it merely re-implements single-trip search (GF) or post-booking tracking (Flighty), it is out of scope — link out instead.

_Codified from the 2026-07-21 sprint. Source: `SPRINT_PROPOSAL_2026-07-21.md` §4a (Watchlist reframe) + Ashwin's positioning steer._
