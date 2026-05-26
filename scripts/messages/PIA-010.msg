chore(ops): track operating docs + add .gitignore for stray dev files (PIA-010)

Closes the long-standing "operating docs untracked" punch-list. Brings
the on-disk working tree into the repo so any T5 audit or future
recovery can reconstruct project state from git alone.

What's newly tracked
--------------------
- `backlog.md` — T1 Requirements ticket ledger. Authoritative source
  for what's in flight, ID renumbering plan, sprint priorities.
  Previously untracked since project inception; T5 A1 prompt cites it
  but had no version to read.
- `AUDIT_PROPOSAL_2026-05-24.md` — T5 inaugural 5-system audit
  artifact. Source for tickets PIA-001..005.
- `PIALAX-Daily-Review-2026-04-09.docx` through `2026-05-10.docx /
  -05-09.md` — daily-review .docx + .md artifacts. Operating record
  of cadence; T5 A4 retros cite these.
- `PIALAX-PROJECT-DEFINITION.txt` + `PIALAX-SETUP-GUIDE.txt` — onboarding
  context for new threads / agents.

What's now .gitignored
----------------------
New `.gitignore` excludes:
- `pialax-dashboard.jsx` — abandoned React port, kept locally for ref.
- `pialax-mobile-original.html`, `pialax-mobile-v2.html` — pre-v3
  mobile iterations. The shipping mobile surface is `pialax-mobile.html`
  per HQ §6 (writable surface).
- `.git/index.lock` — sandbox / GUI artifact, never belongs in the
  repo (caused a NO-GO on the PIA-005 ship attempt).
- `.DS_Store` — macOS metadata.
- `.recovery/` — sandbox fork-failure dump dir per HQ §8.

Why this happened now
---------------------
PIA-005 ship surfaced 11 untracked files at the repo root. A T5
running A1 with no `backlog.md` in git can re-propose closed work
(the exact regression MITIGATED.md exists to prevent — and itself
relied on docs that weren't tracked). Closing the loop in one commit.

Why this isn't bundled with PIA-006
-----------------------------------
HQ §6 single-purpose. PIA-006 is a `chore(trace)` for code already
on main. This is `chore(ops)` for tracking new files + a .gitignore.
Different scope, different file set, different rollback semantics.

Rollback
--------
Revert this single commit:
- Tracked operating docs return to "untracked" working-tree files
  (the bytes stay in place).
- `.gitignore` removal means stray dev files reappear in
  `git status` as `??`.
- Zero impact on the shipping surface (pialax.html, pialax-mobile.html).

Closes PIA-010.
