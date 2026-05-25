docs(hq): lessons-learned amendments from PIA-001..003 cycle (PIA-004)

- Add LESSONS_LEARNED_2026-05-25.md at repo root — inaugural per-cycle
  retro produced by T5 under prompt A4. Three-block structure (process
  patterns observed with thread-citation evidence; standing risks not
  yet ticketed; action items table with owner / sprint tag / acceptance
  signal). Establishes the template that subsequent A4 runs will
  follow.
- Amend PIALAX_HQ.md §2.4 D1 to codify the
  `ENVELOPE READY: bash scripts/ship.sh <id>` stamp convention. T4
  emits the exact grep-able phrase once per envelope, only after both
  message and manifest files are confirmed on disk. Closes the
  ship-before-envelope race observed on PIA-003.
- Amend PIALAX_HQ.md §2.4 D4 — new prompt for post-push live-site
  verification (open Pages URL, view source, grep for known-new
  string, retry/diagnose if Pages lag). Code on origin/main is
  necessary but not sufficient; only "served bytes match committed
  bytes" closes the loop.
- Amend PIALAX_HQ.md §2.5 A1 — appended "Lessons Learned" coda
  requirement so every audit ends with a what-shipped / what-was-
  re-flagged / one-process-note block, cross-referenced against
  MITIGATED.md and prior LESSONS_LEARNED files.
- Amend PIALAX_HQ.md §2.5 A4 — new standalone prompt for
  lessons-learned generation. Reads MITIGATED.md, recent
  AUDIT_PROPOSAL_*.md artifacts, and team-thread transcripts via
  mcp__session_info__read_transcript to synthesize friction
  patterns. Outputs LESSONS_LEARNED_<date>.md.
- Amend PIALAX_HQ.md §6 — add two new locked constraints: ACs
  written at intent-level (not implementation-level, to avoid the
  sha384→sha512 amendment ping-pong from PIA-001), and single-purpose
  tickets (one commit per envelope; abandon + re-open rather than
  scope-creep mid-ship — lesson from PIA-002's 4-commit history).
- Amend PIALAX_HQ.md §7 cheat-sheet — D4 and A4 added; D2→D1→D4
  is the new ship triplet.
- Add PIALAX_HQ.md §8 "Known sandbox limits + recovery protocols" —
  documents egress allowlist gaps (cdnjs unreachable, Pages
  paste-first provenance), sandbox fork-failure recovery path
  (.recovery/ persistence), working-tree-vs-.git mount perms, sandbox
  vs user-visible path mapping, and live-site/origin lag.
- Add PIALAX_HQ.md §9 "Lessons-learned log" — fixed 3-block format
  that subsequent A4 outputs follow. T1 R2 ingests action items at
  next prioritization. Indexes the 2026-05-25 file as the inaugural
  entry.

Authoring credits: lessons-learned content and HQ amendments produced
by T5 under prompt A4 in a parallel thread. T4 (this thread) authored
only the ship envelope per HQ §2.4 D1.

Closes PIA-004.
