# Changelog

All notable changes to PIALAX. Versions follow [Semantic Versioning](https://semver.org/)
and are git tags (`vMAJOR.MINOR.PATCH`) on `main`; GitHub Pages serves whatever is on `main`.

- **MAJOR** — breaking change to shared state: share-link/URL params, localStorage keys, Worker API.
- **MINOR** — new user-visible feature (one or more `feat` tickets).
- **PATCH** — fixes only (`fix` tickets, tooling, docs).

Add entries under **Unreleased** in the same commit as the ticket; on release, rename the
heading to the version + date and tag the merge commit (see `CLAUDE.md` → Versioning).

## [Unreleased]

### Added (PIA-070)
- Trip Idea results are priced from fares the dashboard already cached (24h dated cache, then
  planner `S.prices` when dates match), falling back to labelled sample fares. Zero SerpAPI calls.
- Each row = per-ticket fare from the hub's cheapest airport × that hub's travelers
  (PIA/ORD = 2); a real cached fare beats a cheaper estimate.
- Results summary says how many rows use cached fares vs estimates.

### Fixed (PIA-070)
- A route with no fare scored 100 for price (`Number(null)`); now scores 0 and shows "No fare yet".
- Google Flights handoff from the builder uses a real airport (e.g. `ORD`), not the hub key `PIA_ORD`.

## [1.0.0] — 2026-10-01

First tagged release: baseline of everything shipped through PIA-068.

### Fixed (PIA-068)
- Trip Idea Builder: destination-only searches default to the next 90 days instead of
  returning dateless results labelled "Exact dates".
- Trip Idea Builder: reject reversed dates, return-only searches and reversed windows;
  an open-ended window gets a 30-day end.
- Trip Idea Builder: "Latest departure" bounds the departure date, not the return.
- Trip Idea Builder: long windows are scored across their whole span, not their first 8 days.
- Trip Idea Builder: notes are kept through to watchlist saves and share links.
- `scripts/trip-idea-builder.js` re-synced with both HTML files; tests enforce the mirror.
- `verify-sri.sh` works on Linux (GNU base64 line wrap), so preflight no longer false-fails.

### Highlights already on main before tagging
- Trip Idea Builder with share links; direct destination/date search with flexible windows (PIA-067).
- Trip Ideas as the default home; USA-first map.
- Watchlist Google Flights handoffs that use each traveler's airport and flexible dates.
- RDU family event hub and shareable family trip proposals.
- Decision-oriented dashboard revamp; mobile full-screen trip sheet.
- Real fare alerts with email delivery and a daily server-side check (activation deferred).
- Family home-airport transitions (JAX → LGA/JFK), date-aware.
- Trip assistant: Worker `/extract`, decision engine, fare snapshots.
- Quota-safe SerpAPI fetching with a fail-closed lock and labelled estimates.
- Test harness (`scripts/test-*.js`) and preflight gate.
