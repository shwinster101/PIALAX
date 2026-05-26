chore(ops): close PIA-006 + PIA-010 in backlog.md (PIA-011)

Bookkeeping-only commit. Adds strikethrough close-rows for the two
SHAs that landed earlier today (b33253f PIA-006 trace + 2a2a167
PIA-010 wide bookkeeping), bringing backlog.md in line with
MITIGATED.md. Mirrors the existing PIA-001 / PIA-005 close-row
pattern at the top of the ticket table.

Standalone per HQ §6 (single-purpose). The silent-bundle lesson
from PIA-005/006 warns against riding bookkeeping inside feature
commits. PIA-003 ship envelope stays clean — T2 won't see stray
`M backlog.md` rows in its diff and wonder if they're in-scope.

Rollback: revert this single commit. Zero code impact.

Closes PIA-011.
