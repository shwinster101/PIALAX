# PIALAX Lessons Learned — 2026-05-25

**Author:** T5 Auditor (operating under prompt A4)
**Scope:** Post-mortem on the PIA-001 → PIA-003 ship cycle that ran 2026-05-24 → 2026-05-25 across threads T1 (Requirements), T2 (Coder Bay), T3 (Test & Eval), T4 (Deployment).
**Trigger for this artifact:** User flagged the prior cycle as "exhausting" and asked whether the T1–T5 model is the most efficient method going forward. This document captures the friction so the next cycle pays less of it.

This file also serves as the **standing template** for future T5 A1 outputs (the "Lessons Learned" coda) and T5 A4 standalone runs.

---

## 1. Process patterns observed (with thread evidence)

### 1.1 Stale-finding risk — closed by PIA-003 mid-cycle
- **What happened:** The 2026-05-24 audit (`AUDIT_PROPOSAL_2026-05-24.md`) ranked CDN SRI as System #1. There was no `MITIGATED.md` at audit time, so the auditor had no machine-readable signal that the work was *already in flight*.
- **Resolution mid-cycle:** T4 shipped PIA-003 (`32a25d2`) which created `MITIGATED.md` + amended HQ §2.5 A1 to instruct future T5 runs to read it first.
- **Standing lesson:** The auditor must always read `MITIGATED.md` BEFORE the two HTML files, not after. Code-first reading anchors on findings before context.

### 1.2 Sandbox egress gaps — both T2 and T3 hit the same wall
- **What happened:** T2 (Coder, PIA-001) could not reach `api.cdnjs.com` to fetch authoritative SRI hashes; fell back to npm-derived `sha384` approximations, then asked the user to paste cdnjs's actual `sha512` values. T3 (Test, PIA-001) could not reach `cdnjs.cloudflare.com` to re-hash deployed bytes; deferred two ACs ("DevTools Integrity: ok" + tamper test) as browser-verifiable only.
- **Standing lesson:** Cdnjs (`cdnjs.cloudflare.com`, `api.cdnjs.com`) and the live Pages site (`shwinster101.github.io`) are not reachable from the Cowork sandbox. Every team prompt that involves verifying bytes-as-served must include an explicit "ask the user to paste X" fallback. Codified in HQ §8.

### 1.3 Sandbox disk-full / fork failure — recovery is undocumented
- **What happened:** T2 PIA-001 hit `useradd: fork: retry: Resource temporarily unavailable` mid-task. Coder had to author the diff blind, paste it into chat, and wait for user to verify locally.
- **Standing lesson:** Treat sandbox crashes as expected, not exceptional. Recovery protocol codified in HQ §8: re-issue once, then persist partial output to `.recovery/` and hand-off explicitly.

### 1.4 AC text vs implementation drift — sha384 → sha512
- **What happened:** Ticket PIA-001 wrote ACs at implementation level ("`integrity="sha384-…"` on both tags"). Coder shipped `sha512` because that is cdnjs's published default and strictly stronger. T3 flagged the divergence as `PASS (with note) — flag to T1, not a fail`. T1 amended the ticket. Wasted ~one round-trip.
- **Standing lesson:** ACs must be intent-level ("modern SRI hash present"), not implementation-level. Codified in HQ §6 constraints. When intent and impl diverge in a non-regressive direction, T3 returns GO and T1 amends. Do not re-implement.

### 1.5 Ship-before-envelope race
- **What happened:** User ran `bash scripts/ship.sh PIA-003` before T4 had written `scripts/messages/PIA-003.{msg,files}`. Preflight died on `missing ship envelope`. T4 self-prescribed the `ENVELOPE READY: bash scripts/ship.sh <id>` stamp convention as the fix.
- **Standing lesson:** Codified in HQ §2.4 D1. T4 emits the exact stamp on its own line once both envelope files are confirmed on disk. User greps for the token. No more guessing.

### 1.6 Live-site verification was implicit, not enforced
- **What happened:** After PIA-001 pushed to `origin/main`, neither T3 nor T4 confirmed that `shwinster101.github.io/PIALAX/` was actually serving the new bytes. Pages auto-deploy lags push by 30s–2min, occasionally longer.
- **Standing lesson:** New prompt D4 added (HQ §2.4). Post-push verification opens the live URL, views source, greps for a known-new string. Code on main is necessary but not sufficient.

### 1.7 Cross-file comment drift on a single-line fix
- **What happened:** T3 caught that `pialax.html:20-22` still reads *"Real fix is SRI integrity= attributes (see TODO above). Until then…"* — now self-contradictory after PIA-001. Mobile equivalent was rewritten cleanly. The two HTML files drifted on a 3-line comment block.
- **Standing lesson:** Every C1 implementation pass should diff comment-only changes between the two HTML files at end-of-ticket. Cheap C3-style sanity check; catches the drift that the System 2 (data-layer duplication) audit finding will eventually solve at the source. Until then, manual parity sweeps stay on the punch-list.

### 1.8 Per-team context bootstrap is expensive
- **What happened:** Every team thread opened with "Read PIALAX_HQ.md first to self-brief" — five threads × ~150-line playbook read = wasted context. T4 proposed a `TEAM_BOOTSTRAP.md` as PIA-004 so a one-line `role T1. Bootstrap from PIALAX/TEAM_BOOTSTRAP.md` primes any team thread.
- **Standing lesson:** Pending. See action items §3.

---

## 2. Standing risks not yet ticketed

These surface from the cross-thread scrub. They are NOT yet in the backlog and should be considered by T1 for the next sprint.

- **CSP `'unsafe-inline'` on `script-src`** — PIA-001 closed CDN tamper risk, but every inline `<script>` block in both HTML files still runs without nonce or hash. T2 flagged this as the natural successor to PIA-001. Severity: medium (the page is single-author, lower XSS surface than a CMS) — but the CSP is misleading as written because `'unsafe-inline'` weakens the whole policy.
- **Pages config not enforced** — D4 closes the verification gap, but there is no monitor that catches "Pages source branch was changed by a settings tweak six months ago and we didn't notice." Could be a once-a-week curl into the live URL with hash compare.
- **Pre-push hook is symlink-fragile** — `ship.sh` re-installs `ln -sf ../../scripts/preflight.sh .git/hooks/pre-push` on every run. A `git clone` on a fresh machine won't carry the hook; only the script can re-install. Acceptable for solo dev; document the re-install command in a fresh-checkout README.
- **`AUDIT_PROPOSAL_2026-05-24.md` is untracked on disk** — T4 noted this. The artifact is the input to T1 backlog ingestion and should be committed as part of the audit's own ship envelope, or deliberately gitignored. Pick one.
- **`pialax-mobile-original.html`, `pialax-mobile-v2.html`, `pialax-dashboard.jsx`** still on disk untracked. Stale backups confuse future audit agents that read broadly. Move to `.archive/` or delete.

---

## 3. Action items

| Owner | Sprint tag | Description | Acceptance signal |
|---|---|---|---|
| T1 | patch | File PIA-004 = `TEAM_BOOTSTRAP.md` per T4's proposal. One-line bootstrap per team; references locked constraints + recent MITIGATED entries. | A new T2 thread primed with `role T2. Bootstrap from PIALAX/TEAM_BOOTSTRAP.md` produces a correct C1 diff without re-reading `PIALAX_HQ.md` in full. |
| T1 | minor | Re-rank backlog with the JFK transition deadline (2026-09-01) as the only true schedule constraint. PIA-003 (JFK per-member straddle) was originally minor and is the only ticket that genuinely expires. | `backlog.md` shows PIA-003 ranked before PIA-002 (major refactor). |
| T2 | patch | Comment polish — rewrite `pialax.html:20-22` to match `pialax-mobile.html:18` (single line, no "Until then…"). Confirms cross-file parity. | `diff` of the comment blocks between the two files is empty. |
| T2 | minor | Implement PIA-003 (JFK per-member straddle). Pass effective member date into `familyForDate` callers; expand `loadPrices` JFK gate to union-of-members. | Browser test: anchor 2026-08-29, `memberDates.JAX = { dep: '2026-09-05' }`, sister's arc terminates at JFK; JFK banner visible; `loadPrices` includes `JFK-<hub>` in fetch list. |
| T3 | patch | Extend `scripts/preflight.sh` step 8 = live-site curl + hash compare for the two HTML files (warn, not block, to avoid push-during-Pages-deploy false negatives). | Preflight emits `LIVE: ahead by 1 commit, Pages catching up` or equivalent informative line; never blocks. |
| T4 | patch | Add the `ENVELOPE READY: bash scripts/ship.sh <id>` stamp convention to every deployment turn going forward (HQ §2.4 D1 codified — this AI is the enforcement). | Next T4 turn that authors an envelope emits the exact token on its own line. |
| T4 | minor | Decide on `AUDIT_PROPOSAL_*.md` retention policy — commit each as part of the audit's own ship envelope (named `AUD-<date>` ticket) or `.gitignore` them. Currently untracked and accumulating. | Either `git log -- 'AUDIT_PROPOSAL_*.md'` returns commits, or `.gitignore` covers them. Not both ambiguous. |
| T5 | n/a | Run A4 weekly as part of the scheduled autonomous run starting 2026-06-07. Output the standing `LESSONS_LEARNED_<date>.md` alongside the audit proposal. | New file lands on Mondays; previous lessons-learned is referenced as a "prior" anchor for delta. |

---

## 4. Recommended sequence for the next ship cycle

Based on the action items above:

1. **PIA-004** (TEAM_BOOTSTRAP.md, patch) — biggest tax-cut for every future team thread.
2. **Comment polish + AUDIT_PROPOSAL retention decision** (patches, T2 + T4) — clear the punch-list before the next audit.
3. **PIA-003 JFK per-member straddle** (minor, T2) — only ticket on the calendar with a real deadline.
4. **CSP `'unsafe-inline'` removal** (minor, T2) — successor to PIA-001 security thread; codify before audit cycle 3.
5. **PIA-002 shared `pialax-core.js` extraction** (major, T2) — defer to after JFK transition lands; it touches every line and would absorb the JFK change as a sub-task otherwise.

---

## 5. Template structure (for future T5 A1 codas and A4 standalone runs)

Future Lessons Learned artifacts should mirror this structure exactly:

1. **Process patterns observed** — bullet list, each with thread evidence (`Tn ticket-id` cite) and a "Standing lesson" closing line.
2. **Standing risks not yet ticketed** — flat bullet list, no PHA depth (that's A1's job, not A4's).
3. **Action items table** — `Owner team | Sprint tag | Description | Acceptance signal` columns. Acceptance must be observable, not aspirational.
4. **Recommended sequence** — numbered list, justifies the ordering in one sentence each.
5. **Template structure** (this section) — only included in the inaugural artifact; subsequent runs replace with the date-anchored prior-run reference.

---

_End of Lessons Learned. Inaugural template — future runs will reference this file as the structural anchor and the 2026-05-25 patterns as the historical baseline._
