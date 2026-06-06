feat(freshness): fare provenance pills + stale-preset guard (PIA-013)

Adds a per-fare freshness signal so a months-old MOCK price can never be
mistaken for live data. Surfaces a "Fares as of …" header note for global
trust state, exempts booked legs (PIA + JAX round-trips) with a 🔒 BOOKED
badge, and greys out preset chips whose travel window has passed.

Trigger: 2026-06-06 daily review flagged that the jax-jun5 preset was
going in-window today (dep 2026-06-05 / ret 2026-06-08) while still
labeling MOCK data as if it were live. Ship deadline 2026-06-07 catches
the trust window before it closes.

Acceptance criteria implemented (per backlog.md "Sprint candidate —
PIA-013"):
- AC1 — Data shape. Every entry in S.prices now carries
  lastVerified: ISO|null. fetchFlights stamps the live success path
  (data.lastVerified = new Date().toISOString()) before _flightCache
  write — so PIA-005 AC4 persistence (pialax_prices_v1) inherits it for
  free across reloads. getMock() returns include explicit lastVerified:
  null (renderer branches on === null for SAMPLE). LOCKED_TRIPS branch
  carries lastVerified = bookedDep so the BOOKED badge can show the
  booking date.
- AC2 — Renderer pill. New helper freshnessLabel(entry, familyCode)
  returns {tier, label, short, pillHtml} for one of:
    🟢 LIVE   — lastVerified within 24h
    🟡 CACHED — lastVerified within 24h-7d
    ⚪ SAMPLE — lastVerified null OR older than 7d
    🔒 BOOKED — entry.locked OR FAMILY_INFO[code].booked === true
  Boundaries DECOUPLED from FLIGHT_CACHE_TTL_MS — cache TTL is a refetch
  cost policy; the pill is a trust/provenance signal. Wired into the
  solo card title liveTag and the preset banner price (the two surfaces
  where the jax-jun5 trust regression actually shows). Calendar per-cell
  pill, bar chart per-bar pill, and share-card copy text deferred to a
  follow-up patch (calendar cells are MOCK-only; bar chart uses opacity;
  no dedicated share-card flow exists yet).
- AC3 — "Fares as of …" header. New #freshness-header element placed
  below #quota-bar; updateFreshnessHeader() reads S.prices, computes the
  max lastVerified timestamp across non-booked entries, and renders
  "Fares as of <local-TZ time> · <n> live · <n> sample". Hidden when
  zero S.prices entries exist. Excludes booked routes from the count.
- AC4 — Booked-leg exemption. FAMILY_INFO.PIA and FAMILY_INFO.JAX gain
  booked: true + bookedDep/bookedRet (PIA = 2026-06-24/07-03, JAX =
  2026-06-24/07-01 per project_pialax_lhr_trip.md). LAX stays
  booked: false because LAX return is the one open shopping target for
  the LHR trip (option (a) discovery resolution — see chat). The
  freshnessLabel familyCode arg honors FAMILY_INFO[code].booked and
  returns 🔒 BOOKED instead of the time-based tier.
- AC5 — Stale-preset guard. TRIP_PRESETS entries gain a validUntil
  field (defaults to ret date for round-trips, dep date for one-way).
  jax-jun5 → 2026-06-08; mia-jun18 → 2026-06-21; mia-via-jax →
  2026-06-12. New helper isPresetStale(preset) checks today's ISO
  against validUntil. The solo card preset chip renderer branches:
  stale chips render dashed border, muted color, cursor:not-allowed,
  disabled+aria-disabled attrs, with "· trip passed" suffix and a
  tooltip showing the validUntil date.
- AC6 — Mobile parity. Same five changes mirrored verbatim in
  pialax-mobile.html (helpers duplicated until PIA-008 core extraction
  lands; matches HQ §1.7 C3 convention).

Discovery resolutions (T2 → T3 handoff record):
- LAX `booked` semantics: option (a) — LAX stays booked: false because
  LAX return is asymmetric (outbound BOOKED via PIA-009 LOCKED_TRIPS,
  return OPEN for shopping). Setting LAX.booked=true would kill the only
  legitimate shopping target on the LHR trip.
- validUntil semantics: defaults to ret date for round-trips (chip greys
  on the day AFTER ret). For one-way presets, validUntil = dep date.
- LIVE/CACHED/SAMPLE boundaries decoupled from FLIGHT_CACHE_TTL_MS per
  first-principles reasoning — cache TTL governs cost (when to refetch),
  the pill governs trust (provenance). Two functions, two thresholds.

Constraints honored:
- Edits only in pialax.html + pialax-mobile.html.
- FAMILY date-aware array (JFK after 2026-09-01) untouched —
  FAMILY_INFO additions are additive; familyForDate / familyInfoFor
  unchanged.
- 4-person family composition preserved (headcount fields untouched).
- PIA-001 SRI block at lines 9-14 / 9-12 untouched.
- PIA-005 pialax_serpapi_quota localStorage migration preserved.
- PIA-005 _flightCache → pialax_prices_v1 persistence inherits the new
  lastVerified field automatically (no schema bump needed; rehydrated
  entries gain it from their original fetch).
- PIA-009 LOCKED_TRIPS short-circuit preserved (now also stamps
  lastVerified for the booked badge timestamp).

Rollback: renderer falls back to current behavior (no pill, no header
note, presets always clickable). S.prices data shape is additive — the
lastVerified field is ignorable. Single-PR revert per file.

Closes PIA-013.
