# PIALAX HQ — Operating Playbook

_Last updated: 2026-05-24 · Owner: Ashwin · Repo: shwinster101/PIALAX_

This file is the single source of truth for how the PIALAX project is run as a multi-team Cowork operation. It defines thread topology, per-team prompts, Cowork feature usage, and the scheduled autonomous run.

---

## 1. Thread topology

One team per thread keeps each context window clean. Memory (`MEMORY.md`) is the shared spine.

- **T1 — Requirements HQ** (long-lived): backlog owner, accepts Auditor proposals, emits tickets.
- **T2 — Coder bay** (per-feature, short-lived): opened per ticket, reads `pialax.html` + `pialax-mobile.html`, ships diff, closes.
- **T3 — Test & Eval** (per-release): validates Coder diff against acceptance criteria + regression matrix.
- **T4 — Deployment** (long-lived, narrow): git ops + server checks only. Secrets/tokens stay isolated here.
- **T5 — Auditor** (scheduled, ephemeral): spawned by the daily run, reads code fresh, emits one proposal artifact, exits.

Rule: do not mix teams in one thread. Bleed-over corrupts file-path and recommendation accuracy.

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
> User said 'push to github' or 'ship it'. (1) Run D2 preflight — block on failure. (2) Write the ticket's ship envelope to the working tree: `scripts/messages/<id>.msg` (conventional-commit subject, blank line, body — `git commit -F` format) and `scripts/messages/<id>.files` (one path per line; **must include both envelope files themselves** so the audit trail commits with the change). (3) Confirm "ship it" from user. (4) User runs `bash scripts/ship.sh <id>` on their Mac. The script re-runs preflight, resets the index, stages exactly the manifest, commits with the `.msg`, pushes to `shwinster101/PIALAX` main, and re-installs the pre-push hook. (5) User pastes back the SHA — T4 verifies against `origin/main` and closes the ticket.
>
> **Why the user runs it, not T4:** the Cowork sandbox can write the working tree but not `.git/` (mount-level perms), so commits and pushes must originate from the user's Mac. T4 never executes the push directly.

**D2 — Pre-flight**
> Before any push: run `./scripts/preflight.sh`. It bundles (1) file presence, (2) no `console.log` in shipping HTML, (3) hardcoded-secret scan, (4) `<script>` tag balance, (5) live SRI freshness via `scripts/verify-sri.sh` (re-hashes pinned cdnjs URLs vs the integrity= attribute). Exit 0 = GO. Any failure = NO-GO, do not push. The same script is wired as `.git/hooks/pre-push` so regressions are blocked locally; `scripts/ship.sh` re-installs the symlink on every run.

**D3 — Rollback drill**
> Identify the last 3 green SHAs on main. Write the one-line revert command for each. Save to PIALAX/rollback.md.

**Ship envelope contract**
> Every shipped ticket carries its own envelope under `scripts/messages/`:
> - `<id>.msg` — full conventional-commit message. First line = subject (≤72 chars, `type(scope): ...`). Blank line. Body = bullet list of changes. Footer = `Closes <id>.`
> - `<id>.files` — one path per line, blank lines + `#` comments ignored. Manifest is atomic: `ship.sh` does `git reset` before staging so unrelated dirty paths don't leak in.
> - Both envelope files belong **in the manifest itself** — every commit ships its own provenance.

### 2.5 Auditor team (T5)

**A1 — Headline 5-system audit (primary)**
> You are the PIALAX Auditor. Read pialax.html and pialax-mobile.html in full. Identify exactly 5 systems with the highest leverage to fix, where leverage = (severity × blast radius × user-visibility) ÷ effort. For each system, output: (1) what it is, (2) potential hazard (PHA: what could go wrong, likelihood, severity), (3) Fishbone RCCA across 6Ms — Method, Machine, Material, Measurement, Manpower, Mother-nature/Env, (4) sprint tag — exactly one of patch / minor / major, (5) proposed fix in one paragraph. End with a single proposal artifact in markdown titled `AUDIT_PROPOSAL_<YYYY-MM-DD>.md` saved to the PIALAX folder, formatted for the Requirements team to ingest directly. Do NOT write code. Do NOT touch the two HTML files. Output only the proposal.

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

- Edits live in `pialax.html` + `pialax-mobile.html` only.
- "git push" / "push to github" → commit + push to `shwinster101/PIALAX`.
- FAMILY array is date-aware: JFK after 2026-09-01.
- Family composition: 4 people total — PIA=2 (Mom & Dad), LAX=1 (Ashwin), JAX/JFK=1 (Sister). Not 1 per airport.
- Auditor outputs 5 systems segmented patch / minor / major, ending in a proposal artifact.

---

## 7. Daily ops cheat-sheet

| Want to... | Open thread | Use prompt |
|---|---|---|
| File a new ask | T1 Requirements | R1 or R3 |
| Build a feature | T2 Coder bay | C1 |
| Validate a diff | T3 Test & Eval | T1 then T2 |
| Ship to prod | T4 Deployment | D2 then D1 |
| Hunt for issues | T5 Auditor | A1 |
| Stress JFK swap | T5 Auditor | A2 |
| Security spot-check | T5 Auditor | A3 |
