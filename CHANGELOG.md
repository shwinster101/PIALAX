# Changelog

All notable changes to PIALAX. Versions follow [Semantic Versioning](https://semver.org/)
and are git tags (`vMAJOR.MINOR.PATCH`) on `main`; GitHub Pages serves whatever is on `main`.

- **MAJOR** — breaking change to shared state: share-link/URL params, localStorage keys, Worker API.
- **MINOR** — new user-visible feature (one or more `feat` tickets).
- **PATCH** — fixes only (`fix` tickets, tooling, docs).

Add entries under **Unreleased** in the same commit as the ticket; on release, rename the
heading to the version + date and tag the merge commit (see `CLAUDE.md` → Versioning).

## [Unreleased]

### Fixed (PIA-116)
- Family answers no longer overwrite each other. Every write to a shared trip (an RSVP, "I booked
  ✓", an organizer edit or decision) now goes through that trip's own Durable Object (`IdeaRoom`),
  one change at a time, and is applied to the latest version. Before, two people answering at the
  same moment could erase one answer.
- Existing trips move into their room the first time they're touched. The room writes through to
  KV, so link previews keep working. Responses report `serialized: true`.
- `wrangler.toml` adds the `IDEA_ROOM` binding and a SQLite-class migration (Workers Free plan).

### Fixed (PIA-115)
- Fares now show their real age. A fare served from the Worker cache keeps its original fetch
  time (`X-Fetched-At`), so it reads "🟡 CACHED 5h ago" instead of "🟢 LIVE 1m ago". LIVE now means
  fetched within the last hour.
- Cache hits no longer count against the monthly SerpAPI quota, the per-session cap or the "live
  calls" counter. Only a real upstream search spends.
- The 24h client cache now runs from when the fare was fetched, not from when it arrived.

### Security (PIA-114) — breaking Worker API
- Paid Worker routes now require the organizer token (`X-Pialax-Token`, checked against the
  `PROXY_TOKEN` secret) and stop at server-side daily caps (`SERP_DAILY_CAP` 30,
  `EXTRACT_DAILY_CAP` 20, `EMAIL_DAILY_CAP` 10 → 429). The gated routes are fare search, the account
  check, `/extract`, `/alert` and `/alerts/sync`. Without the token they return 401 and spend nothing.
- Fare search moves to `GET /search` and accepts only allowlisted, validated params. `no_cache`
  and unknown params get 400, and an unknown path gets 404 instead of a SerpAPI call. The
  account check moves to `GET /account` and returns only quota fields.
- Fares are cached in KV for 24h, keyed by the canonical params, and stored with their original
  fetch time (`X-Proxy-Cache`, `X-Fetched-At`).
- Client: there's a new **Organizer token** field under Advanced. The organizer link (`#k=…&t=…`)
  carries the token to your other devices and strips it from the address bar. Without a token,
  fares stay as samples and show a one-time hint. Family links never carry the token.

### Changed (PIA-113)
- iPhone Family tab, opened from a trip with a family RSVP: it now leads with the trip, e.g.
  "🦃 Thanksgiving · Fri Nov 20 – Sun Nov 29 · All 3 in", with **👥 Open RSVP** and **Planner ▸**.
  Step 1 (mode, holiday quick-picks, home airport) stays folded until you tap Planner. Cheapest
  week and the fairness ledger become one-line drawers, and the "Last trip" chip and helper text
  hide. Fares, the cost split and Get Live Fares stay up front.

### Changed (PIA-112)
- The RSVP screen is calmer:
  - **Header:** one title line, then one plan line ("Plan Fri Nov 20 – Sun Nov 29 · ≈ $704" for
    the organizer, "Late Nov · pick your own dates" for family).
  - **Notes:** clipped to two lines; tap to expand. "Fare not priced yet" and the duplicate title
    card are gone.
  - **Status:** one line ("All 3 in · 1 of 2 booked").
  - **Folded:** the answers list ("Answers & notes") and the organizer tools (Nudge, Hold,
    Organizer link, Choose / Drop) start collapsed.
- Organizer: **✎** next to the plan dates opens the calendar to fix the proposal's dates (e.g. from
  the old Nov 25 to Fri Nov 20 – Sun Nov 29) and saves them to the shared trip.

### Added (PIA-111) — needs `wrangler deploy`
- Each traveler picks their own airports on their RSVP card: **In [PIA][ORD]** and
  **Home [PIA][ORD]**. One tap saves it. The same airport both ways gives one "Round trip · ORD ↗"
  search; different airports give "✈️ In PIA ↗" and "🏠 Home ORD ↗". The Book panel and the Trips
  card's per-person links follow each person's picks. The default stays in PIA, home ORD.
- The Worker stores the picks (`arrive_at` / `leave_from`), limited to the destination's hub
  airports (PIA/ORD, LGA/JFK), and keeps them when someone changes their answer or marks booked.
  The toggles appear once the Worker supports them.

### Changed (PIA-110)
- Dates show the weekday: "Fri Nov 20 – Sun Nov 29". This applies on the RSVP (window, answers,
  calendar range, Book panel), the Trips card's per-person links and the Family tab's date pills.
  The day strip has a weekday row, with weekends highlighted.

### Changed (PIA-109)
- Thanksgiving plan (Dad wants the Peoria parade): fly in direct to **PIA Fri Nov 20**, fly home
  from **ORD Sun Nov 29**, booked as two one-ways. The Trips card's flight links are now per
  traveler: "Outbound · LAX → PIA" (Nov 20) and "Return · ORD → LAX" (Nov 29), and the same for
  Anjo.
- RSVP for Peoria trips: the primary search is now **In PIA ↗ + Home ORD ↗** (one-ways on each
  person's own dates), on the Book panel and on "✈️ Fly in · PIA / 🏠 Fly home · ORD".
  Round trips into PIA or ORD remain as a one-line fallback.
- A device that saved the old Nov 25 start picks up Nov 20.

### Changed (PIA-108)
- Flight searches cover the whole hub. Peoria trips give every traveler two buttons, **PIA ↗**
  and **ORD ↗**, for flying into O'Hare and driving. Both use that person's own dates. New York
  works the same way (LGA ↔ JFK). "Find my flight · PIA" also offers "or ORD ↗".

### Changed (PIA-107)
- A trip linked to a family RSVP now leads with two buttons instead of eight:
  - **👥 Family RSVP** opens answers, the overlap, "Book for these dates" and organizer tools;
  - **📤 Share** says what it will send: "Share invite", "Nudge 1 waiting" or "Nudge 2 to book".
- Open, each person's Google Flights search, Add to calendar, Hold the dates and Organizer link
  move under **More actions**. The Google Flights help text is gone for these trips, since the
  searches live in the RSVP's Book panel.

### Added (PIA-106) — needs `wrangler deploy`
- Who's booked: after searching, each person taps **I booked ✓**. Everyone then sees "✈️ booked"
  on their row, their days turn green on the strip, and the page says "✈️ 1 of 2 booked". The
  Trips card chip adds "· ✈️ N booked".
- The organizer can **Mark booked** for anyone in the Book list (e.g. after booking for Mom &
  Dad). Once everyone has answered, **Nudge** asks the people who haven't booked yet
  ("Anjo, have you booked?").
- Changing an answer keeps "booked"; answering "out" clears it. Nothing booking-related appears
  until the Worker supports it.

### Added (PIA-105)
- RSVP → booking: under the family window, **✈️ Book for these dates** opens one Google Flights
  search per traveler, from their airport, on their own dates, for their own seats. Hosts are
  skipped. Searching one traveler at a time usually shows the lowest fare.
- Each family member's answer card has **✈️ Find my flight** for their own search.

## [1.2.0] — 2026-10-03

iPhone UI and family RSVP.
- **iPhone UI:** instant Trips, app shell, Trip Idea Builder above the tab bar, smooth map and clear labels.
- **Family RSVP:**
  - a page of its own for family members, and each phone remembers who is answering;
  - a calendar that opens on the trip's month, plus the best-overlap window;
  - organizer tools ("answer for", portable organizer link);
  - iMessage link previews, and prices withheld from family members by the Worker (deployed as version `2999c587`).

### Added (PIA-104) — needs `wrangler deploy`
- RSVP links get a real iMessage preview. The Worker serves `/i/<id>`:
  - chat-app link fetchers get "🦃 Thanksgiving at home — Peoria · Late Nov · Tap to say in /
    maybe / out and pick your dates", with no price and no exact dates, instead of
    "PIALAX — Family Flight Dashboard";
  - people tapping it go straight to the RSVP page.
- Prices are now withheld by the Worker, not just hidden on screen. Family members' requests get
  no fares; only requests carrying the organizer's key (`X-Idea-Key`) do. A device whose
  organizer key doesn't match is shown the family view.
- Safe before deploy: the app keeps sharing its own `?idea=` link and never sends the key header
  until the Worker announces the new features.

### Fixed (PIA-104)
- Worker: RSVP status and decision stage checks no longer accept `Object.prototype` names such
  as "toString".

### Added (PIA-103)
- Organizer: every family row on the RSVP has "✎ Answer for". When someone just texts "In",
  record it for them, e.g. "Save for Mom & Dad". It's tagged "(entered by Ashwin)" and doesn't
  change who your own phone answers as. Hosts who confirmed read "🏠 Hosting — confirmed".
- "🔑 Copy organizer link" (RSVP page and Trips card) lets you manage the trip from another
  phone or computer. The key travels in the link's `#k=` part, which never reaches a server or a
  link preview. It's removed from the address bar once saved, and it's only for you, not the
  family.

### Added (PIA-102)
- The RSVP shows when the family is actually together. With full overlap it says "Everyone's
  there Nov 26–29". Otherwise it shows the days most people are there and who's missing why:
  "Best window Nov 24–28 · 2 of 3 there (Kiran: here Nov 29–30)".
- A day strip under it has one row per person across the answered days, with hosts as a full
  🏠 bar and the best window outlined. Everyone sees it.
- Organizer: "📅 Hold Nov 26–29" puts the family window on the calendar, replacing the hold for
  the proposed dates. The organizer's header now reads "Proposed Nov 25–29" instead of raw dates.

### Added (PIA-101)
- RSVP dates are picked on a month calendar that opens on the trip's month (November for
  Thanksgiving) with nothing preselected. Tap the day you'd arrive, then the day you'd leave
  ("Nov 26–30 · 4 nights"). Past days are greyed out, and dots under a day show how many others
  already said they're there. It replaces the two date boxes, whose iPhone picker opened on
  today's month.

### Added (PIA-099, PIA-100)
- Family members who open an RSVP link get the RSVP as their whole page: no dashboard, settings,
  trips or close button behind it. "Open full PIALAX" at the bottom is the way out. The organizer's
  device (it holds the edit key) still opens it over the dashboard, with exact dates and the cost.
- "Who are you?" is a row of names to tap, and the phone remembers it. Next time the link opens
  straight to "Your answer · Anjo — ✅ In · here Nov 26–30 · from LGA" with **Change my answer**.
  Changing prefills the earlier answer. "Not Anjo?" forgets the name on that phone.
- Hosts (Mom & Dad for Peoria) get "🏠 hosting at home — no flights or dates needed" and a
  **Confirm we're hosting** button. Family members see the organizer as "Ashwin", not "Me".
- **Send my answer** sits in the sticky footer, so it's always on screen.
- An RSVP-only link no longer counts as a shared trip link, so the organizer's saved home and
  dates aren't skipped when they open their own link.

### Changed (PIA-098)
- RSVP invites and nudges no longer include a price or exact dates. They give a rough time
  ("🦃 Thanksgiving at home — Peoria · late Nov. Come and go on your own dates — tap to say
  in / maybe / out and when you’d be there:"), since each person can arrive and leave on their own days.
- The RSVP page now shows guests "Late Nov · pick your own dates" with empty arrive/leave fields.
  The organizer (the device holding the edit key) still sees the exact proposal dates, the family
  cost and prefilled dates.

### Changed (PIA-091)
- iPhone map labels no longer overlap. Airport codes, city names, fare tags and the PIA → ORD
  drive badge are placed together, clear of each other, of every labelled airport and of the
  focus chip. A label moved away from its spot gets a thin leader line back. When two-line fare
  tags can't sit by their routes (every phone width on the Thanksgiving map), all tags switch to
  one line ("≈ $342 RT") in the traveler's colour, and the badge shortens to "🚗 drive".
  Map text is now at least 11px (some was 8px).
- A tap goes to the nearest airport within 30px. Tapping the PIA dot no longer picks ORD (their
  tap circles overlapped), and LGA vs JFK follow the side tapped. Each airport is still a keyboard
  target, with a focus ring.
- Solo map: the in-map price box (8px text) is gone. Its best-weekend price now shows in the
  route list under the map.
- Light mode: the meetup hub and the picked destination were white on the light map; they now
  use the hub colour, so they show in both themes.

### Fixed (PIA-091)
- Opening the map from a New York (LGA/JFK) trip idea focused PIA/ORD instead of New York.
  Desktop has the same fix.

### Changed (PIA-090)
- iPhone map renders smoothly: it opens at its final size (no jump), re-fits correctly after
  rotating (it used to end up mis-sized and shrink ~7% after landscape → portrait), and price
  updates or the browser toolbar collapsing no longer rebuild the whole map. Redraws are
  coalesced to one per frame and skipped while the Map tab is hidden.

### Fixed (PIA-087)
- iPhone: the Trip Idea Builder now opens above the tab bar. Before, the tab bar covered its
  footer — on an iPhone SE "Find recommendations" couldn't be tapped at all. The footer puts
  the main action first at full width with the rest two-up (three-up in landscape) at 44px,
  respects the home-indicator and notch insets, the page behind no longer scrolls, the ✕ is a
  44px target, and it also goes full-screen in landscape.

### Fixed (PIA-086)
- iPhone shell: status bar / browser chrome follow the app colours (theme-color, color-scheme),
  booking numbers no longer turn into phone links, Home Screen launch is full-screen, and the
  missing tab icon is added. Toasts sit just above the tab bar (not mid-screen), wrap long
  messages, move to the top while a full-screen sheet is open, and no longer get cut short by
  an older timer. In landscape the tab bar and fare button line up with the content column, and
  the phone layouts (hub cards, route picker) apply to landscape phones too. The "sample fares"
  notice shows on Trips only (real quota warnings stay on every tab).

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
