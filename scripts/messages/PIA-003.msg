chore(audit): add MITIGATED.md for T5 auditor context (PIA-003)

- Add MITIGATED.md at repo root — closed-ticket index so the Auditor (T5)
  does not consume one of its 5 leverage slots re-flagging an issue that
  is already shipped (e.g., PIA-001 CDN integrity). Maintained by T4
  after every ticket closes.
- Update PIALAX_HQ.md §2.5 A1 to instruct T5 to read MITIGATED.md before
  drafting findings; treat any apparent regression of a "closed" item as
  a separate finding that cites the original ticket ID.

Closes PIA-003.
