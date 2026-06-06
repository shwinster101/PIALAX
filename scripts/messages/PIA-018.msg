fix(freshness): dynamic booked-pill date + JFK lookup + LAX outbound (PIA-018)

Tightens the PIA-013 family-booked pill in three small ways surfaced by a
third-party audit of the shipped freshnessLabel() helper:

1. Pill date now follows the traveler's itinerary instead of staying static
   on the outbound dep date.
   - Before 2026-06-24: shows 2026-06-24 (outbound departure)
   - 2026-06-24 → 2026-06-25: shows 2026-06-25 (outbound arrival at LHR)
   - 2026-06-25 → return dep: shows return dep date (Jul 1 JAX / Jul 3 PIA)
   - In return transit: shows return arrival
   - Post-trip: shows the latest known date as completed marker
2. FAMILY_INFO lookup now uses familyInfoFor() instead of FAMILY_INFO[code]
   directly, so JFK routes post-2026-09-01 resolve to the JAX entry rather
   than silently dropping the booked branch. Forward-compat for the JFK
   transition without requiring a duplicate FAMILY_INFO.JFK entry.
3. LAX outbound is now correctly badged. Adds bookedOutbound: true to
   LAX (booked stays false to preserve return-shopping affordance per
   PIA-013 discovery option a). freshnessLabel honors either flag so the
   LAX-LHR route card pill renders 🔒 BOOKED Jun 24 (then Jun 25 after).
   LHR-LAX (return) is not in S.prices today, so this change does not
   block PIA-016's planned return-only fetch path.

Why now: the PIA-013 commit shipped FAMILY_INFO.PIA.bookedDep='2026-06-24'
and LOCKED_TRIPS PIA-LHR.bookedDep='2026-06-25'. Both are real dates for
the same booking — Jun 24 = PIA airport departure, Jun 25 = LHR arrival
12:30pm. PIA-009 chose arrival because the global anchor is keyed to LHR
arrival; PIA-013 chose departure because "when do I leave?" is the more
useful question pre-trip. PIA-018 unifies both by making the displayed
date dynamic, so it answers the right question at each phase of the
trip without forcing one convention.

Acceptance criteria (intent-level per HQ §6):
- AC1 — FAMILY_INFO schema. Every member carries the full 4-date set:
  bookedOutDep, bookedOutArr, bookedRetDep, bookedRetArr. Legacy
  bookedDep / bookedRet fields are preserved as aliases so PIA-013
  callsites that read them keep working. LAX gains bookedOutbound:true.
- AC2 — bookedDateForToday(famInfo) helper. Walks forward through trip
  phases by comparing today's ISO against each booking date. Returns
  null if no booking data exists. Falls back to the most recent known
  date once all phases are past, so the pill remains informative post-
  trip ("BOOKED Jul 3 — return arrived" style read).
- AC3 — freshnessLabel uses familyInfoFor(). Picks up JFK → JAX
  backmapping for free; no separate FAMILY_INFO.JFK entry needed when
  the JAX → JFK transition activates.
- AC4 — freshnessLabel honors bookedOutbound. LAX-LHR route card now
  reads 🔒 BOOKED Jun 24. LHR-LAX return shopping is unaffected (route
  not yet in S.prices; PIA-016 will add it).
- AC5 — Mobile parity. All four changes mirrored verbatim in
  pialax-mobile.html.

Verification: in DevTools console after page load,
  freshnessLabel(null, 'PIA').label  →  '🔒 BOOKED 2026-06-24' (today)
  freshnessLabel(null, 'JAX').label  →  '🔒 BOOKED 2026-06-24'
  freshnessLabel(null, 'LAX').label  →  '🔒 BOOKED 2026-06-24'  (was SAMPLE)
  freshnessLabel(null, 'JFK').label  →  '🔒 BOOKED 2026-06-24'  (was SAMPLE)
After Jun 24 passes, all four switch to 2026-06-25. After Jun 25, PIA →
Jul 3, JAX → Jul 1, LAX → 2026-06-25 (last known, no return booked yet).

Constraints honored:
- Edits only in pialax.html + pialax-mobile.html.
- FAMILY date-aware array untouched — moveDate / moveAirport for JAX
  preserved verbatim.
- 4-person family composition preserved (headcount unchanged).
- PIA-001 SRI block untouched.
- PIA-005 quota module + cache persistence untouched.
- PIA-009 LOCKED_TRIPS short-circuit untouched.
- PIA-013 entry-level booked/locked branches in freshnessLabel
  unchanged — only the family-level branch was updated.

Rollback: single revert per file. FAMILY_INFO falls back to PIA-013
shape (legacy aliases survive); freshnessLabel falls back to static
bookedDep + direct FAMILY_INFO lookup.

Closes PIA-018.
