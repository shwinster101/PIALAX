feat(family): demote JAX to a grayed "past home" (nostalgia, not active)

Ashwin: "No need for JAX to be there. It can be a light grayed out to
signal nostalgia and vibes, but we're not gonna be flying there anytime
soon." Both files:

- Home Airport dropdown: JAX stays visible but disabled (native gray) and
  labeled "JAX — Jacksonville, FL · past home".
- ROUTE_GRAPH: JAX removed from the active destination lists (PIA/ORD/LAX)
  — no JAX solo card, and the map dot auto-demotes to the muted "other"
  style since isDest is derived from dests(). JAX keeps its origin routes
  so a legacy saved home / historical trips still render.
- New LEGACY_HOMES = ['JAX'] marker; the quick-add From selector filters
  legacy homes out (offers PIA/ORD/LAX/JFK/LGA).
- The "🏖 JAX Aug 7–9" Holiday Quick-Pick chip removed — that weekend has
  passed and the JAX era is over. HOLIDAYS.jaxaug + the applyHoliday
  branch stay as inert history (nothing references the chip).

Untouched by design: familyForDate() still returns JAX for pre-Sep-1 trip
dates (historical accuracy), so the map legend's "JAX (family)" entry
self-resolves to LGA on Sep 1 when today crosses the move date.

Verified headless-Chromium (both files): JAX option disabled + relabeled;
solo boards show LAX/LGA/JFK (no JAX card); nt-from offers
PIA/ORD/LAX/JFK/LGA; chip gone; no page errors. Watchlist button audit
re-run 126/126.

Tests: 27 + 217 + 36 checks passing; node --check clean. Preflight:
known sandbox cdnjs-403 SRI NO-GO only.

Rollback: revert.
