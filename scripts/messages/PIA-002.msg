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

Closes PIA-002.
