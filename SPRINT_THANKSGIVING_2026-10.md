# PIALAX sprint: Thanksgiving 2026, from plan to booked (PIA-121 to PIA-130)

> **Build decisions (2026-10-14, after checking this doc against the code).** The rest of this file is the original proposal. Where it disagrees with this box, this box wins.
> - **Writes:** the family trip card with ✎ Dates is mobile-only (`syncLinkedTripChrome`). On desktop, the flex strip and leg watches go on the Flight Breakdown route cards. Per-traveler dates are `responses[code].available_from/to`, written by re-POSTing `/idea/respond` the way `tripIdeaSetLegs` already does. No Worker change is needed for writes.
> - **Pricing:** a linked Peoria trip is priced as the one-ways people actually book (in to PIA, home from ORD), not as a round trip. On a linked trip, Get Live Fares prices those legs, up to 4 searches per tap.
> - **Fare age:** the client and Worker caches both keep a fare for 24h and keep its original `X-Fetched-At`. A fare is "stale" only after 24h. For 6–24h, "recheck" means opening Google Flights, which is free.
> - **PIA-123 targets:** stored on the device (`pialax_leg_targets_v1`), not in the RSVP. Today `target_price` and `decision_deadline` exist only as parsed facts.
> - **PIA-124:** "Open on airline.com" is dropped, because `booking_options` needs a second, paid `booking_token` call. The link to upgrade is `tripIdeaFlightUrl` in the shared block; `:9941` is that function.
> - **PIA-125:** nothing auto-fetches (the CLAUDE.md rule stands). When fares are over a day old, a banner offers a one-tap "Refresh (N searches)". There is no Notification API.
> - **Anjo's airport:** her post-move airport is **LGA** (`FAMILY_INFO.JAX.moveAirport`). JFK is the alternate.
> - **New ticket PIA-130:** alert-path hardening (Worker code only).
>   - `/alerts/status` gets the token check.
>   - The cron goes through the KV fare cache and `spendGate`.
>   - Alerts are per-leg watches.
>   - **PIA-128** stays the infra activation (cron slot, Resend, ALERTS KV).
> - **Delivery:** one sprint PR, one commit per ticket. Order: 121 → 123 → 124 → 122 → 126 → 125 → 127 → 129 → 130.

**Goal.** Get Ashwin (LAX) and Anjo (LGA) from "considering" to "booked" for Thanksgiving in Peoria. The seeded trip is: fly in to PIA Fri Nov 20, Thanksgiving Thu Nov 26, fly home from ORD Sun Nov 29, and Mom & Dad host. Changing a date or an airport should take one or two taps. Each fare on the watchlist should show its age, its trend and how it compares to your target, without spending SerpAPI quota you don't need to. When a fare is good enough, one tap should open Google Flights with that exact itinerary and a "book by" date, so you can pay. No new paid surface and no cron is needed to ship the must tier. Price alerts that work with the dashboard closed are an infra decision (below), not a blocker.

## What's there today (checked in code, main @ 775ee43)
- **Trip / RSVP:** PIA-120 (unreleased, merged in #27) made the linked trip's dates come from the RSVP plan. You change them with ✎ Dates. There is a ✈️ Book flights list per traveler (`tripIdeaBookListHtml`, `scripts/trip-idea-builder.js`). The Thanksgiving seed is at `pialax.html:~6361`.
- **Booking handoff:** `_googleFlightsUrl` (`pialax.html:1797`, and the same code at `:9941`) builds a free-text `?q=Flights from X to Y on DATE` link. It carries no flight numbers, carrier, cabin or passenger count, and you can't save it as the exact itinerary.
- **Watchlist:** the lifecycle panel (`#panel-watchlist`) has history (`typicalRangeFor`, `pialax.html:7579`), a "typical" snapshot, and a `target_price` / `decision_deadline` on trip ideas (`:6854`, `:7181`). Age strings ("Nm ago / Nh ago") appear in two places (`:4320`, `:4997`).
- **Worker:** the fare cache is 24h and keeps `X-Fetched-At` (PIA-115). The `/search` allowlist allows a **single** 3-letter `departure_id`/`arrival_id` (`worker.js:414`), so you can't do a nearby-airport search in one call. The SERP cap is 30/day (`worker.js:311`). The alert pieces are written but dormant: `/alert`, `/alerts/sync`, `/alerts/status`, `scheduled()` → `runAlertCron`, ALERT_CRON_MAX=8. `wrangler.toml` has `crons = []` and the ALERTS KV and RESEND are commented out.
- **Missing:** a ±day flex control (no shift-date helper anywhere), a nearby-airport alternate for LAX (BUR/LGB/SNA/ONT) or LGA (JFK/EWR), arrival-time alignment between travelers (no arrival-time field is parsed), and `visibilitychange`/foreground refresh. There are no client notifications.
- **GitHub:** no open issues or PRs. The highest ticket is PIA-120, so this sprint starts at **PIA-121**. v1.3.1 has a CHANGELOG section (merged in PR #26) but no git tag; the last tag on origin is v1.3.0. PIA-120 sits under Unreleased.

---

## MUST

### PIA-121: ±day flex strip on each traveler's leg (M)
- **Why it matters for Thanksgiving:** fares for the Fri Nov 20 outbound and the Sun Nov 29 return are peak-priced. Ashwin needs to see quickly whether Thu Nov 19, Sat Nov 21, or Sat/Mon around Nov 29 saves real money. Today that means re-opening the RSVP calendar.
- **Scope:** `pialax.html` and `pialax-mobile.html` (Family trip card and Flight Breakdown cards), `scripts/trip-idea-builder.js` and `scripts/test-trip-idea.js` (the three must stay identical).
  - Add a "−1 · plan · +1" chip row per leg, with an optional ±2. Prices come from the 24h cache or the cheapest-week grid. Uncached days show as `~$` estimates and cost nothing. One "Price these" button fetches the missing days, capped by `MAX_CALLS_PER_REFRESH`.
  - Tapping a chip writes the change through the RSVP (IdeaRoom `/idea` delta), so PIA-120's "one place for dates" still holds.
- **Acceptance criteria:**
  - Each leg shows the plan date and its neighbors, with a price and a LIVE or estimate label.
  - Tapping a neighbor updates the RSVP plan for that traveler only, and every view agrees.
  - Rendering the strip makes no SerpAPI calls. Only the explicit button spends, and it shows "N searches" before it does.
  - Desktop and mobile behave the same, and preflight passes.

### PIA-122: nearby-airport alternates per traveler (M)
- **Why it matters for Thanksgiving:** BUR/LGB/SNA/ONT for Ashwin, JFK/EWR for Anjo, and ORD vs PIA on the way in are often $100+ apart over the holiday.
- **Scope:**
  - `worker.js`: widen the `/search` allowlist so `departure_id`/`arrival_id` accept up to 4 comma-joined IATA codes (SerpAPI supports this). The cache key stays canonical, and `authGate` + `spendGate` are unchanged.
  - Both HTML files: a `NEARBY` map, plus an "Also try nearby" toggle per traveler. The result row shows which airport won and the price difference.
- **Acceptance criteria:**
  - One search covers the home airport plus its nearby airports (1 SerpAPI call, not 4).
  - The cheapest airport is shown with its saving.
  - Choosing it updates that traveler's RSVP origin.
  - The `FAMILY` date-aware sister airport (JFK/LGA after 2026-09-01) is preserved.
  - The Worker still rejects any param that isn't on the allowlist.

### PIA-123: watchlist card shows target, trend and fare age (M)
- **Why it matters for Thanksgiving:** Ashwin needs to know "Is $412 good, is it moving, how old is it?" at a glance, every time he opens the app.
- **Scope:** `pialax.html` and `pialax-mobile.html` watchlist (`#panel-watchlist`, `typicalRangeFor`, the `target_price` editor). Merge the two age formatters (`:4320`, `:4997`) into one `fareAgeLabel(fetchedAt)`, fed by `X-Fetched-At`.
- **Acceptance criteria:**
  - Each watch shows: current price · target (editable inline) · Δ vs last check · a mini sparkline of stored history · "checked 5h ago".
  - A fare older than 24h is greyed and reads "stale, tap to refresh (1 search)".
  - Cache hits show their original fetch time, not "just now".
  - Setting a target on a trip carries over to its per-traveler watches.

### PIA-124: Book-now handoff with fare-confidence and a book-by date (M)
- **Why it matters for Thanksgiving:** this is the "pull out the credit card" moment. Today the link is a free-text query, so Google Flights may open a different flight or the wrong passenger count.
- **Scope:** `_googleFlightsUrl` in both HTML files and `trip-idea-builder.js`.
  - Build the query from the chosen offer: one-way/RT, carrier and flight numbers when known, passenger count per origin (PIA=0 flyers, LAX 1, LGA 1), and "nonstop" when the offer is nonstop. Add a secondary "Open on <airline>.com" link from SerpAPI `booking_options`/airline when the response includes it. No new paid call.
  - Confidence cue: LIVE ≤6h = "solid", 6–24h = "recheck before paying", estimate = "estimate, search first".
  - "Book by" = `decision_deadline` or a default of Nov 1 (about 3.5 weeks out, which is when holiday fares climb), with a countdown.
- **Acceptance criteria:**
  - Tapping Book opens Google Flights on the same route, dates and airports for that traveler.
  - The confidence label matches the fare's age.
  - After booking, "Mark booked ✓" flips the RSVP row, and the item drops off the watchlist.
  - The countdown turns amber within 7 days of the book-by date and red when it has passed.

## SHOULD

### PIA-125: alerts without a new cron, using client polling plus a SerpAPI budget (M)
- **Why it matters for Thanksgiving:** Ashwin needs to hear about a drop below target without remembering to check, even with cron at the Free limit and Resend not set up.
- **Scope:** both HTML files, plus a small `worker.js` change.
  - On open and on `visibilitychange` → visible (not there today), at most once every 6h, re-price only the watches with stale cache. Hard cap: `ALERT_POLL_MAX` = 4 searches/day, shown against the 30/day SERP cap from `/account` → `spend`.
  - Queue drops through the existing `checkAndQueueAlert`/`pialax_alert_log_v1`. Show them as an in-app banner, a favicon/badge dot, and the browser Notification API when permission is granted. Email drains through `/alert` automatically once RESEND exists.
- **Acceptance criteria:**
  - Opening the app after 6h re-prices at most 4 stale watches, and fresh ones cost 0.
  - A price at or below target produces one banner/notification per watch per day, deduped.
  - The budget line shows "alerts used 2/4 today · Worker 7/30".
  - With no token, it stays quiet and makes no calls.

### PIA-126: family arrival alignment at PIA/ORD (M)
- **Why it matters for Thanksgiving:** Mom & Dad do one airport pickup run if Ashwin and Anjo land close together. A 6-hour gap means two runs (or the ORD drive).
- **Scope:** both HTML files and `trip-idea-builder.js`.
  - Parse `arrival_airport.time` (and departure) from the SerpAPI flight objects already returned. No arrival-time field is used today.
  - Show a pickup timeline on the trip card: each traveler's landing time, the gap, and a "within 2h ✓" badge. Offer "cheapest pair landing within 2h" as a sort on the alternates.
- **Acceptance criteria:**
  - With both travelers priced, the card shows both landing times and the gap.
  - The alignment sort never needs extra searches.
  - The ORD-out return shows the departure gap the same way.

### PIA-127: mobile one-thumb flow from the trip card to Book (S–M)
- **Why it matters for Thanksgiving:** most of the checking happens on the iPhone (the PIA-119 bug was found there).
- **Scope:** `pialax-mobile.html` only.
  - A sticky bottom action bar on the trip card: Flex · Nearby · Refresh (N searches) · Book.
  - Bottom-sheet editors instead of the full RSVP calendar for single-day shifts. 44px tap targets. Add the foreground-refresh hook from PIA-125.
  - Keep the scroll position after a refresh.
- **Acceptance criteria:**
  - Going from opening the app to the Google Flights handoff for Ashwin's leg takes 3 taps or fewer.
  - `scripts/test-viewport.mjs` covers the bar at iPhone width.
  - No horizontal scroll.

## COULD

### PIA-128: turn on server alerts by sharing a cron slot (S, once the infra is decided)
- **Scope:** `wrangler.toml` and `worker.js`.
  - Either restore `crons = ["0 15 * * *"]` after freeing a slot on another Worker, or have an existing cron Worker call a token-gated `POST /alerts/run` once a day.
  - Create the ALERTS KV, keep ALERT_CRON_MAX ≤ 4 so it shares the 30/day cap, and wire `RESEND_API_KEY`.
- **Acceptance criteria:** `/alerts/status` shows a daily run, and a test watch below target emails Ashwin once.

### PIA-129: "Thanksgiving total" board (S)
- **Why:** one number for the family: Ashwin + Anjo combined, cheapest vs chosen, booked vs not, savings from flex and nearby airports. Builds on `computeRanking` meetup math.
- **Acceptance criteria:** the board updates as legs change or get booked, and labels estimates as estimates.

---

## Suggested order
121 → 123 → 124 (the core plan → watch → book loop), then 122 (the one Worker deploy), then 125 / 126 / 127. Ship v1.4.0 after the must tier, which also releases PIA-120. Target: before Nov 1.

## Infra decisions for Ashwin
1. **Cron slot:** free one of the 5 Free-plan crons on another Worker, or piggyback a daily call from an existing cron Worker. If not, PIA-125 client polling is the alert path, and it only fires when the app is opened.
2. **Resend:** sign up and run `wrangler secret put RESEND_API_KEY` plus create the ALERTS KV. Without these, alerts stay in-app/browser notifications only.
3. **Workers Paid ($5/mo):** removes the cron limit, and the DO/KV headroom is irrelevant at this scale. Worth it only if you want closed-app email alerts and don't want to give up a cron slot.
4. **SerpAPI budget:** confirm the monthly plan and how much is left. Proposed sprint spend: about 4/day polling + manual refreshes, all inside the 30/day Worker cap.
5. **Default book-by date:** Nov 1, or your own.

## Risks
- **Holiday fares rise fast.** Each week of building is a week of higher fares, so the must tier should ship within about a week.
- **Google Flights `?q=` links are best-effort.** Google can ignore flight numbers. A `tfs=` protobuf link is more exact but undocumented and brittle. Mitigation: always show the itinerary text next to the link so you can check it.
- **Multi-airport search changes the Worker allowlist and cache key.** Needs a deploy and a `verify-live.sh` run (1 search) before it closes.
- **Desktop and mobile are duplicated** (PIA-008 not done), so every ticket is two edits. The drift test covers only the trip-builder block.
- **Client polling only runs while the app is open,** and browser notifications on iOS need the site installed as a PWA. Expect in-app banners on the iPhone.
- **Stale cache presented as truth.** The 24h cache plus the confidence cue in PIA-124 must stay honest, or the family could book on an old price.
