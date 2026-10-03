# Changelog

All notable changes to PIALAX. Versions follow [Semantic Versioning](https://semver.org/)
and are git tags (`vMAJOR.MINOR.PATCH`) on `main`; GitHub Pages serves whatever is on `main`.

- **MAJOR** — breaking change to shared state: share-link/URL params, localStorage keys, Worker API.
- **MINOR** — new user-visible feature (one or more `feat` tickets).
- **PATCH** — fixes only (`fix` tickets, tooling, docs).

Add entries under **Unreleased** in the same commit as the ticket; on release, rename the
heading to the version + date and tag the merge commit (see `CLAUDE.md` → Versioning).

## [Unreleased]

### Fixed (PIA-084)
- iPhone: Trips paints immediately instead of showing "Loading…" for 4–6s while map borders
  download; a tab tapped during startup is no longer overridden; inline-button globals exist
  as soon as the page loads. Map-border downloads give up after 4s and use the offline outline
  (desktop gets the same timeout).

### Added (PIA-083)
- One family trip, staggered arrivals: each person's RSVP has **I'd arrive / I'd leave** (prefilled
  with the trip dates). Their Google Flights link on the card uses their own dates
  ("Me (Nov 21–29) · LAX ⇄ PIA", "Anjo (Nov 24–29) · LGA ⇄ PIA"), Family Plan prices them on their
  own dates, and the estimate at "choose" re-prices each traveler on their dates.
- Hosts (members whose home airport is the destination — Mom & Dad for PIA) show "🏠 Hosting",
  skip the travel fields, and are never counted as waiting or nudged.
- The RSVP summary says when everyone overlaps ("everyone's there Nov 24–29").

### Changed (PIA-082)
- Trip Ideas: new **🦃 Thanksgiving at home — Peoria** card (PIA, Nov 25–29, Mom & Dad host) as the
  family RSVP test, with a flight search each for Ashwin (LAX) and Anjo (LGA). The Cary baby shower
  is postponed and archived to history; old saved "planning" state can't reopen it.

### Fixed (PIA-081)
- The organizer no longer shows as "waiting" on their own idea: creating a shared idea answers
  "in" for "Me" automatically (not counted as news, doesn't make the idea "answered"), and nudges
  never name the organizer.

### Added (PIA-080)
- Marking a linked Trip Ideas card "booked" (on the organizer's device) asks once for the whole-trip
  total and records it on the shared idea — choosing the proposal first if needed — so the decision
  log fills without reopening the builder. Blank skips; other devices just get a reminder.

### Added (PIA-079)
- The trip assistant reads RSVP answers: on linked cards, family members become companions
  (in → confirmed, maybe / no answer → tentative, out → out; the organizer is excluded), so its
  decision says "Confirm Anjo before booking" from real answers. Cards show "● new" when answers
  arrived since the organizer last opened them.

### Added (PIA-078)
- RSVP links go where the family talks: on phones "Share proposal" / "Ask the family" open the native
  share sheet (iMessage etc.) with "Cary shower trip Nov 6–9 — whole family ≈ $1,116. Are you in?";
  elsewhere the same text + link is copied. "📣 Nudge N waiting" names who hasn't answered.
  "📅 Hold the dates" downloads a calendar event for the proposed dates with the RSVP link inside.

### Added (PIA-077)
- Family Plan uses the family's own answers: opening a linked Trip Ideas card applies in / maybe / out
  from the RSVP link (maybe = tentative), so "out" members drop out of the total. Per-person selectors
  become read-only "answered" / "waiting" labels, with a "switch to what-if" escape. Answers follow a
  person across a home move (JAX → LGA) and are never written into the `ms=` URL.

### Added (PIA-076)
- Trip Ideas cards link to shared ideas (`sharedIdeaId`): sharing from the builder saves the card
  (no duplicates) and links it; the card shows live RSVP counts ("2 in · 1 maybe · 1 waiting") and
  "See answers". Family cards without a link get "Ask the family", built from the card's dates/airport
  with a whole-family estimate.

## [1.1.0] — 2026-10-02

Group decisions: trip ideas are priced from real cached fares, shared as RSVP links each
traveler answers for themselves, and closed out with estimate vs actual cost. Live on the
Worker since `0a9a42b` (IDEAS KV namespace bound and deployed).

### Changed (PIA-074)
- `wrangler.toml`: cron triggers set to `[]`. The account is at the free plan's 5-cron limit, so the
  daily alert schedule could not attach; alerts stay off until a slot is freed and `ALERTS` is set up.

### Added (PIA-073)
- Decision log: shared ideas move proposed → answered → chosen → booked (or dropped). The organizer
  (edit key on their device) chooses the option, then records the actual total paid; the Worker
  stores estimate vs actual and the % difference. "Past family decisions" in the builder lists
  this device's ideas with the average actual-vs-estimate gap.
- Shared ideas carry a whole-family estimate (every hub's fare × its travelers, home base = $0);
  that — not one hub's fare — is what the actual total is compared with.

### Fixed (PIA-073)
- Mobile had no Trip Idea Builder dialog or button, so shared links (and RSVP links) opened
  nothing on phones. Markup now matches desktop.

### Added (PIA-072)
- "Share proposal" creates an RSVP link (`?idea=<id>`) when the Worker has `IDEAS`; each family
  member answers in / maybe / out with their airport, the dates that work and a note. The idea
  shows who's in, travelers confirmed, and the date window that works for everyone.
  Falls back to the read-only `?tripIdea=` link when shared storage isn't set up.

### Added (PIA-071)
- Worker: shared trip ideas in KV (`IDEAS` binding). `POST /idea` returns an unguessable id
  and a one-time organizer edit key (stored only as a SHA-256 hash); `GET /idea`,
  `POST /idea/respond` (RSVP per listed member), `POST /idea/update` (organizer only).
  Strict field allowlists, 1-year expiry, 501 `no_kv` when not configured.

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
