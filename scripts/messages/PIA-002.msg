chore(ops): standardize T4 ship workflow (PIA-002)

- Add scripts/ship.sh — single-entry ship driver. Reads per-ticket
  envelopes at scripts/messages/<id>.msg + .files, runs preflight,
  resets index for an atomic stage of the exact manifest, commits,
  pushes to origin main, installs the pre-push hook.
- Add ship envelope contract: every shipped ticket carries its own
  scripts/messages/<id>.msg (full commit message) and .files (one
  path per line, includes both envelope files for audit trail).
- Update PIALAX_HQ.md §2.4 D1 to reference the standardized flow and
  document why ops live outside the sandbox (sandbox cannot write
  inside .git, so the user runs one script post-T4).
- Track PIALAX_HQ.md as the canonical operating playbook in the repo.
- Harden scripts/preflight.sh + scripts/ship.sh to invoke nested scripts
  via `bash` rather than requiring the executable bit. Caught during
  first PIA-002 dry-run when verify-sri.sh lost its exec bit on disk
  and the gate failed despite the file being present and correct.
- Add preflight step 6/7 — `bash -n` syntax check on every scripts/*.sh.
  A broken helper can no longer reach main even if it's not the one
  being shipped this round (e.g., the pre-push hook or scheduled run
  would have caught it later, but we catch it at the D2 gate now).
- Add preflight step 7/7 — optional `shellcheck` pass. Advisory by
  default (skips cleanly if not installed, surfaces findings as `··`
  notes without blocking the gate). Set STRICT=1 to escalate
  shellcheck warnings to gate failures.
- Add preflight environment banner — prints HERE=<repo-root> and
  scripts/=<n files> at the top so a misrooted invocation is obvious
  before any check runs (caught a Mac vs sandbox cwd discrepancy
  during PIA-002 dry-run).
- Resolve $0 through symlinks in both preflight.sh and ship.sh. Without
  this, the pre-push hook (which is a symlink at .git/hooks/pre-push)
  resolved HERE to .git/, so the gate ran against an empty .git/scripts/
  and failed every push. Now uses BASH_SOURCE + readlink loop to land
  at the real script directory regardless of invocation path.
- Update PIALAX_HQ.md §2.4 D2 to enumerate the now-7-step gate
  including the banner and STRICT mode escape hatch.

Closes PIA-002.
