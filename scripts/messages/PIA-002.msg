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
- Add preflight step 6/6 — `bash -n` syntax check on every scripts/*.sh.
  A broken helper can no longer reach main even if it's not the one
  being shipped this round (e.g., the pre-push hook or scheduled run
  would have caught it later, but we catch it at the D2 gate now).
- Update PIALAX_HQ.md §2.4 D2 to enumerate the now-6-step gate.

Closes PIA-002.
