feat(meetup): lock booked PIA→LHR trip + per-member London defaults (PIA-009)

Locks the already-booked PIA→LHR family meetup leg so no SerpAPI quota is
spent re-pricing it, and auto-populates per-member London default windows
(JAX = sister Jun 24-30, LAX = Ashwin Jun 24-Jul 4) when the London chip
is tapped, so each member's real target window appears without manual
entry. Global anchor stays Jun 25 → Jul 3 (matches the PIA booking).

Locked facts captured in code:
- PIA→LHR booked, dep 2026-06-25 / ret 2026-07-03, landing 12:30pm LHR.
- JAX→LHR default window: 2026-06-24 → 2026-06-30 (sister).
- LAX→LHR default window: 2026-06-24 → 2026-07-04 (Ashwin).

Acceptance criteria implemented (per backlog.md PIA-009 §AC1-AC6):
- AC1: LOCKED_TRIPS constant declared adjacent to MOCK; PIA-LHR entry
  carries arrivalNote='Landing 12:30pm'. Schema accommodates future
  locked entries without changing the lookup contract.
- AC2: fetchFlights short-circuits on LOCKED_TRIPS hit before any network
  call; returns {live:true, locked:true, arrivalNote} and consumes ZERO
  quota. Cache + in-flight dedupe paths handle the locked branch cleanly.
- AC3: applyHoliday('london') sets S.memberDates.JAX and S.memberDates.LAX
  to the documented per-member windows; PIA stays on the anchor (no
  override); syncURL() reflects the per-member entries.
- AC4: Route cards whose price object has locked=true render
  "Locked · Landing 12:30pm" in place of price + airline row;
  share/copy text uses "(booked)" not a dollar amount.
- AC5: London-chip toggle-off block clears the JAX + LAX overrides this
  ticket added. Per-member overrides set by calendar tap or URL restore
  are NOT touched.
- AC6: Same five changes mirrored in pialax-mobile.html; C3 mobile-parity
  diff clean.

Quota savings: 2 SerpAPI calls suppressed per London-preset refresh
(PIA→LHR direct + via-ORD when applicable). ~24% of remaining monthly
headroom protected per refresh.

Solo ship per HQ §6 single-purpose. Original C1 proposal bundled this
with a comment-polish ticket as joint PIA-009 + PIA-011, but PIA-011 ID
was already consumed by 2026-05-26 bookkeeping commit a89eea7 (close-rows
for PIA-006 + PIA-010 in backlog.md). The comment-polish ticket awaits
renumber (proposed PIA-012) and ships separately in its own commit.

Deployment confirm: D4 grep `findLockedTrip` on the live Pages source
returns a match → deployment verified.

Rollback: single revert per file. Removes LOCKED_TRIPS, the per-member
default block, the locked-badge branch. URL md= state survives revert.

JFK-blocking: no. LHR trip is June 2026; well before the 2026-09-01 JFK
transition anchor.

Closes PIA-009.
