# Changelog

All notable changes to PIALAX. Versions follow [Semantic Versioning](https://semver.org/)
and are git tags (`vMAJOR.MINOR.PATCH`) on `main`; GitHub Pages serves whatever is on `main`.

- **MAJOR** — breaking change to shared state: share-link/URL params, localStorage keys, Worker API.
- **MINOR** — new user-visible feature (one or more `feat` tickets).
- **PATCH** — fixes only (`fix` tickets, tooling, docs).

Add entries under **Unreleased** in the same commit as the ticket; on release, rename the
heading to the version + date and tag the merge commit (see `CLAUDE.md` → Versioning).

## [Unreleased]

### Added (PIA-129)
- **Family total board** at the top of a linked trip's Flight Breakdown. It shows one number for everyone still to book, e.g. "$721 still to book · 2 of 2 travelers".
  - Each traveler's in + home fare.
  - The **cheapest live fares already seen** within ±2 days or at a nearby airport, with what it takes ("→ $300 with Mon 25 in") and the saving.
  - Booked vs not; booking someone moves them to ✓ Booked and out of the total.
- A saving is only claimed between live fares. With any estimate, the total reads "~$…" and is labelled "~ = includes estimates".

### Added (PIA-127) — phone
- **From open app to Google Flights in 2 taps.** A linked Thanksgiving card on the Trips tab has a **✈️ Book flights** button. It opens a bottom sheet with each traveler's ✈️ In / 🏠 Home links, the book-by countdown, fare confidence and Mark booked ✓.
- **Trip bar.** On a linked trip's Family tab, the Get Live Fares slot becomes **📅 Flex · 📍 Nearby · ⟳ Refresh (N) · ✈️ Book**.
  - There is no third bottom bar.
  - Refresh is the same spend-gated Get Live Fares, and it reads "Fresh ✓" when every leg has a live fare.
  - 📍 Nearby shows once the Worker supports it.
  - **Flex** opens a "Dates & airports" sheet with every traveler's ±2-day strip and nearby toggle, instead of the full RSVP calendar.
- Repaints and live refreshes keep your scroll position. Every target is ≥44px and nothing scrolls sideways at 360, 390 or 430px.

### Added (PIA-125)
- **One-tap nudge for day-old fares.** When you open the app or come back to it, with the organizer token set, it counts the watched legs whose fare is over a day old. It offers "N fares are a day old · Worker searches today 7/30 · **Refresh (N searches)**", at most 4 per tap.
  - Nothing is searched until you tap; searches are still never automatic.
  - ✕ hides the banner for this visit.
  - Without a token it stays silent.
- **Target alerts in the app.** After any pricing, a traveler at or under their target gets one alert per day: a banner ("🎯 At your target: Ashwin $389 ≤ $420"), a dot on the tab icon and "(1)" in the tab title.
  - The alert is queued in the existing outbox, so it is emailed once Resend is set up.
  - Desktop now has a tab icon too.
  - There is no browser notification, because nothing runs in the background.

### Fixed (PIA-125)
- Hitting the Worker's own daily search cap (a 429 `daily_cap`) used to lock live fares on the device for the **rest of the month**. It now locks only until tomorrow (UTC), with a toast that says so. A SerpAPI 429 still locks the month.

### Added (PIA-126)
- **Pickup timeline** at the top of a linked trip's Flight Breakdown. It shows when each traveler lands (in-leg) and leaves (home-leg), using the times already cached with each live fare.
  - It shows the gap and reads "✓ within 2h · one trip" when everyone uses the same airport within two hours, "different airports — two trips", or "6h 20m apart". Gaps across midnight count correctly.
  - When they aren't aligned, it shows the **cheapest pair within 2h** from the cached offers (e.g. "AA 4 7:10a + UA 6 8:00a = $290 (+$20)"). This never needs another search.
  - A traveler without a live fare reads "waiting on Anjo’s live fare".

### Added (PIA-122) — needs `wrangler deploy`
- **Nearby airports in one search.** "📍 Also try BUR · LGB · ONT · SNA" on a traveler's route card searches their whole metro in the same one search per leg: LA for Ashwin, NYC (JFK/EWR) for Anjo.
  - The traveler's own airport keeps its own fare.
  - The winning airport shows with its saving ("BUR $190 · saves $30 vs LAX"); both prices come from that one search.
  - **Use BUR** changes that traveler's RSVP origin, and their book links follow.
  - The metro follows Anjo's date-aware airport (LGA from Sep 1).
- **Worker:**
  - `/search` takes up to 5 comma-joined codes in `departure_id`/`arrival_id`, as a set: sorted and de-duplicated in the cache key, so a single code is unchanged and old cache entries survive.
  - Anything else is still a 400 with no spend.
  - `/account` reports `features.multi_airport`. The dashboard sends a comma only once it sees that, so an older Worker never gets one.
- `verify-live.sh` A3 now makes its one search a nearby search (`LAX,BUR`, re-ordered for the HIT) and checks the new `/account` feature flag.

### Added (PIA-124)
- **Book-now handoff:**
  - Once a leg has a live fare, its ✈️ In / 🏠 Home button opens Google Flights' own link for that exact search (1 adult). Otherwise the search is narrowed to that fare: "nonstop", "on American".
  - The flight behind the price is spelled out next to it, so you can find it: "American AA 1 + AA 2 · 6:00a→3:40p · 1 stop".
  - The planner's own Google Flights links follow the same rule.
- **Fare confidence** above each traveler's Book buttons, by fare age: "solid" (≤6h), "recheck on Google Flights before paying" (6–24h), "estimate — search first", or "stale — refresh first".
- **Book-by countdown:** Thanksgiving defaults to **Sun Nov 1**. A confirmed "decision deadline" note wins; otherwise it's three weeks before leaving. It turns amber within 7 days and red once passed.
- **Mark booked ✓** on the trip card and route card (organizer device) flips that traveler's RSVP row; they then drop off the fare watch and Get Live Fares.
- Not built: "Open on airline.com". It needs a second, paid SerpAPI call (`booking_token`).

### Added (PIA-123)
- **Fare watch per traveler.** On a linked trip, each traveler's route card and the trip's Trips card show:
  - their in + home price;
  - a **🎯 target** you can type in place;
  - the change since the last check, plus the fare's age ("checked 5h ago").
- **Each leg** also shows a sparkline and Google's own verdict (for example "high price · typical $180–$260") when Google provides one.
- **Targets live on this device.** A trip-wide "target per traveler" carries over to everyone, a traveler's own target wins, and a confirmed "target price" note on the Trips card seeds it.
- **Fare age is honest.** A Worker cache hit keeps its original fetch time. After 24 hours the leg greys out and reads "Last $212 · 1d ago · stale", with "Tap to refresh (1 search)" when a token is set. A stale price is never shown as current.
- **One "N ago" format everywhere** (fare pills, the last-error chip, the /account sync line): just now, Nm, Nh, Nd.

### Added (PIA-121)
- **One-way pricing for linked trips:** a trip linked to a family RSVP is now priced the way each traveler books it. For Peoria that's in to PIA plus home from ORD, as two one-ways. Before, it was priced as a round trip that nobody books.
  - Each Flight Breakdown card shows that traveler's in + home total, with `~$` on estimates.
  - The cost panel and the "At a glance" total use the same number.
- **±day flex strip** under each leg, showing the day before and after the plan date (tap "±2 days" for more).
  - Each chip shows a live fare from the 24h cache or a `~$` day-of-week estimate. Showing the strip never spends a search.
  - Tapping a day moves only that traveler's RSVP arrive or leave date and keeps the rest of their answer. A day that would put leaving before arriving can't be tapped.
  - "Price these (N searches)" prices the visible days, at most 4 per tap.
- **Get Live Fares on a linked trip** prices those legs (at most 4 searches per tap), and its label shows how many searches the next tap will spend.
- Live fares now also keep the cheapest few offers (with times and airports), Google's price insights and Google's own results link. The parser is shared by both dashboards.

### Changed (PIA-120)
- A trip linked to a family RSVP now has one place for its dates and one place to book from:
  - **Dates:** the Family tab's trip card shows the RSVP plan dates. The organizer changes them with
    **✎ Dates**, which opens the RSVP's plan calendar. The Family math follows the plan, "Step 2 ·
    Choose Dates" is hidden, and the date strip reads "Plan: … · from RSVP" instead of offering
    📅 pickers.
  - **Booking:** a **✈️ Book flights** list on the trip card gives each traveler their own dates and
    the same In/Home searches as the RSVP sheet (Peoria: in PIA, home ORD). Booked travelers show ✓.
  - **Flight Breakdown cards:** each card opens those same searches and shows "📋 RSVP" instead of
    "✱ custom".
- Copy: the booking nudge now matches the real buttons, and the empty state says "Calendar" tab.

## [1.3.1] — 2026-10-04

Fixes: exact daily spend caps (`SpendMeter` Durable Object, PIA-118). Saving the organizer token no
longer drops the dashboard to mock data, and Advanced shows whether the token works (PIA-119).
`verify-live.sh` passed 22/22 against Worker `0acad2c7` (merge `38f814e`).

### Fixed (PIA-119)
- Advanced → Admin: the Proxy URL box now shows the Worker in use instead of a blank placeholder.
  Tapping the button to save a token no longer drops the dashboard to Mock Data. A blank box now
  means "keep the built-in Worker"; only ✕ Disconnect turns live fares off.
- The button is now **Save & connect**, with a status line under the token: "No token yet",
  "✗ Token rejected" or "✓ Token accepted · Worker searches today 1/30".

### Fixed (PIA-118)
- The daily spend caps are now exact. A new `SpendMeter` Durable Object checks and reserves each
  paid call one at a time. Before, a burst of parallel calls all read the same KV counter, so 10
  calls against a cap of 3 could all spend.
- `/account` (organizer token required) now reports today's Worker-side spend per kind:
  `spend: { serp: {used, cap}, extract, email, exact }`.
- `wrangler.toml` adds the `SPEND_METER` binding and migration `v2`. Without the binding, the old
  KV counter still works and reports `exact: false`.

## [1.3.0] — 2026-10-04

Book from the RSVP, and the trust gate.
- **RSVP → booking:**
  - Book for these dates / Find my flight;
  - who's booked;
  - per-leg airports (PIA or ORD, LGA or JFK);
  - weekdays on every date;
  - a calmer RSVP screen and buttons;
  - the Family tab leads with the linked trip.
- **Trust (PIA-114…117):**
  - Paid Worker routes need the organizer token and stop at daily caps.
  - Cached fares keep their real age and don't spend quota.
  - Shared-trip writes are serialized by the `IdeaRoom` Durable Object.
  - Gate: `test-trust.sh` runs in preflight, and `verify-live.sh` passed 21/21 against the deployed
    Worker on 2026-10-04 (merge `0248830`).
- **Versioning note:** PIA-114 changes the Worker API, which `CHANGELOG` rules would call MAJOR.
  It ships as a minor because the API's only client, the dashboards on Pages, changed in the same
  merge, and no shared link, URL param or localStorage key breaks.

### Added (PIA-117) — trust release gate
- `scripts/test-trust.sh` (48 checks, in preflight) proves the three trust outcomes:
  - **A1:** every paid route, called without the token (or with a wrong one, a spoofed Origin, a
    cache-buster, `no_cache`, an unknown path or past the daily cap), makes zero upstream calls.
  - **A2:** three racing answers, a "booked" and an organizer edit all survive through
    `IdeaRoom`. A control run shows the old KV path losing 4 of 5.
  - **A3:** a repeated search is a HIT with the original `X-Fetched-At` and 1 upstream call, and
    both dashboards keep that age and don't count quota.
- `scripts/test-trip-idea.sh`: the Trip Idea Builder suite now actually runs in preflight.
- `scripts/verify-live.sh`: A1, A2 and A3 against the deployed Worker, with the token taken from
  `PIALAX_TOKEN` only. It aborts before spending anything if the Worker isn't gated.

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
