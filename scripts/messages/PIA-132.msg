feat(v2): trip model — one /idea record, one view

v2 needs a single source of truth before any screen exists: one pure
function that turns one /idea record (plus this phone's identity, keys
and fare cache) into everything a screen shows. Then the 6 totals, 4
date sets and 3 hubs of v1 can't come back, and nobody's own dates
are silently changed. Nothing in the app uses it yet; v1 is untouched.

- scripts/trip-model.js (new). The region between the begin/end
  markers is what app.html will inline byte-identical (PIA-134); the
  Node export guard sits outside it.
  - tripModel(doc, ctx): dest is recommendation.airport ||
    destination.airport (the Worker's rule). One plan: a legacy
    recommendation's dates win per end. Hub pair, metro group, hosts,
    heads by headcount, travel dates (own end, else the plan's),
    off-plan / missed-📌 / impossible-range / double-booking flags,
    legs that ignore stale picks, origin sets with the PIA→ORD pivot,
    Google Flights links, stage, book-by, best window.
  - Pure: no DOM, network, storage or clock; today and now are
    required parameters.
  - Legacy docs: a legacy 🔒 reads as proposed, and recommendation
    prices are never read. A "Me" member's label is its face alone,
    with no name and no name identity. Faceless v1 labels get hashed
    faces that never repeat within a trip.
  - Double-bookings skip dropped trips and check every row with the
    same name.
  - One pricing rule (priceRows), used by priceTrip and by every
    cheapest-week candidate, so the current bar always equals the
    trip total:
    - real cached fares only (fresh / stale / missing / none);
    - open-jaw as two one-ways;
    - adults = headcount;
    - hosts free;
    - incomplete totals marked. A traveler with nothing to search
      (no destination, local origin, no dates, impossible range, past
      days) is listed in `blocked`, so the total stays incomplete.
  - Presence: hosts are present on every drawn day (plan, flex window
    and board range). A host who answers maybe gets maybe dots.
  - bestWindow uses explicit windows only. Also cheapCandidates,
    pickups and holidays.
  - Family preset: familyForDate parity with v1; undated ideas resolve
    against today.
  - v1 storage is read only (shared ids, 📌 event day).
  - Write builders return {method, path, body}, with the id in the
    query. Each one builds nothing rather than send a request the
    Worker would refuse.
    - respond: always complete. A member with no answer needs a
      status (no silent "in"). 📞 is idempotent, and a legacy
      "(entered by X)" becomes 📞. Typed text can't carry either mark.
      Picks are sent only when they change. noteRoom gives the space
      left for text after the prefixes.
    - booked: answers "in" first when needed; unbooking someone with
      no answer builds nothing.
    - create: at Create, a preset member is re-resolved only while
      their airport is still a preset one or blank. Member codes are
      unique.
    - Labels: every label carries a face. A blank or "Me" name builds
      nothing, so no write ever reads as legacy.
    - update: built from a fresh record; codes and notes kept. The
      decision is built from the record: 🔒 chooses the resulting
      plan with no prices, and 💵 sends actual_total only.
    - organizerEdit:
      - a plan move pins booked travelers' days first;
      - airport-sync answers follow member-airport or destination
        edits;
      - a closing decision goes last;
      - on a paid or dropped trip, an edit that needs answers builds
        nothing (reopen first).
    - A legacy doc refuses every edit except P-migrate.
    - migrateOptions / migrateRequests (P-migrate, used by PIA-146).
  - gf-tfs encoder and decoder, ported from the live-verified scratch
    copy.
  - Inline table of 348 airports from OurAirports (source and hash in
    a comment); any [A-Z]{3} code is accepted without coordinates.
- scripts/fixtures: the legacy Thanksgiving doc in the real v1 shape
  (recommendation 11/25–11/29, chosen, familyTotal 704, "Me", no 📌),
  plus Diwali, Tahoe, 8 members, undated, LAX-local and v1 watchlist
  storage.
- scripts/test-trip-model.js + .sh (new, 179 checks, in preflight).
  - Named groups AC1–AC11, one per acceptance criterion, plus pinned
    date checks: holidays, book-by, days already past, pickup runs and
    predicted times.
  - The builders round-trip through the real worker.js /idea handlers
    in-process over an in-memory KV, including 🔒 alone, a drop
    combined with a destination change, and edits to a paid trip.
  - The cheapest-week bar is compared with priceTrip over 100 fare
    mixes (stale, missing and no-fares legs). Hosts-only, local-origin
    and no-destination trips never get a filled bar or a ★.
  - A fuzz check confirms that no create, update or edit writes a
    legacy label.
  - Drift checks: IDEA_HUBS against worker.js; TRIP_NEARBY_GROUPS and
    familyForDate against both pialax.html and pialax-mobile.html;
    code rule and text limits against worker.js.
  - Lint of the inlined region (no console.log, closing script tag,
    clock, network, DOM or stored price field).
  - Golden links E1–E3, E6, E7 and the v2 trip samples.
  - Offline (fetch stubbed to fail), with today = 2026-10-17.
- scripts/preflight.sh: test-trip-model.sh added to the suites.

No manual check is owed for this ticket. Opening the non-golden
encoder outputs live (3–5 airport sets, multi-city with sets, the
2-adult PIA+ORD set) belongs to PIA-133, and confirming party vs
per-person SerpAPI pricing for adults > 1 to PIA-140; legTotal is the
one place to change if it is per person.

Refs PIA-132.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
