feat(v2): prices — one honest total from real fares, never spent without a tap

The organizer's token phone sees one total built only from fares that
were really fetched: the total, each person's amount, every leg price
and the card agree because they all come from the model's one pricing
rule, and a leg never searched is a hollow $—, never an estimate. Each
priced leg says how old it is, Google's price level, its stops and the
airport that won, from the search already paid for, and the sheet's
own ⓘ explains every part. Every search is a tap on a control that
showed its cost first, and the tap never spends more than it showed
(≤4 a tap, ≤8 a visit, a visit's count that fails closed); the
Worker's daily cap locks only until the next UTC day, the month lock
until the 1st (or until SerpAPI has searches again), the visit until
the organizer starts a new one, and each says when and how it lifts.
v1's counters and fare cache are read and written in v1's own formats,
so both apps on one phone agree and never pay twice. Guests and phones
without the token show no $ and make no paid call. app.html is still
linked from nowhere. pialax.html, pialax-mobile.html, index.html,
worker.js and scripts/trip-idea-builder.js are unchanged.

- scripts/trip-model.js (region, inlined byte-identical in app.html):
  - fareKey names its airports as a set, sorted and de-duplicated (the
    Worker's cache order, and v1's tripNearbyGroup order), so the key a
    leg is priced by and the key v1 caches the same search under agree.
  - parseFareKey / searchQuery(key): a fare key is exactly one Worker
    /search, in v1's own parameter set (engine, departure_id,
    arrival_id, outbound_date, return_date for type 1, type, USD, en),
    nearby airports comma-joined and sorted (≤5), adults only above 1;
    '' for anything the strict allowlist would refuse.
  - fareFromSerp(json, at, old): a SerpAPI reply → the pialax_fares_v2
    entry: the cheapest real price (p), when SerpAPI was called (f, the
    Worker's X-Fetched-At, which a HIT keeps), Google's level and
    typical range, the ≤3 cheapest offers (airports as codes or nothing,
    times as 'YYYY-MM-DD HH:MM' or nothing, stops), none for a search
    with no fares, and prev / pf from an older fetch of the identical
    search (a HIT of the same fetch keeps the prev it had).
  - fareFacts / prevDelta / priceDelta: a leg's age, level (1–3),
    stops, the winning airport (one of the set it searched, not their
    own: where an inbound or round trip leaves, where the way home
    lands) and ▼ / ▲, all through legTotal, the rule priceRows adds up
    (the one place to change if party pricing turns out per person);
    the total's ▼ / ▲ only when every priced leg has an earlier price.
  - spendKeys(keys, fares, now, today): what one tap may search, each
    once, the never-searched first and then the day-old (so a tap the
    caps cut short prices a $— before it refreshes a grey fare): never
    a fresh fare, never a no-fares answer younger than 24h, never a day
    already past, never a key the Worker refuses. spendCount(n, spent):
    its cost, ≤4 (v1's TRIP_LEG_CALLS_PER_PRESS), never past the
    visit's 8 (v1's MAX_CALLS_PER_SESSION).
  - tapKeys(model): P-total's legs, every unbooked traveler's missing
    or day-old legs (a booked traveler's flight is bought; v1's Get
    Live Fares skips them too). spendable(model, …): all one trip may
    search (tapKeys and every unbooked traveler's ends ±1 day).
  - spendLock: 'month' (exceeded: an upstream 429 or a plan with nothing
    left; the organizer's month cap; 990 used; the plan's last 10
    searches), 'day' (pialax_daily_cap_v1 is today's UTC day, or today's
    /account at its cap), 'session' (8 spent); month first. monthWhy
    names which month lock it is ('refused', 'plan', 'cap', 'safety').
  - quotaRead / quotaBump / quotaExceeded / quotaFromAccount: v1's
    pialax_serpapi_quota exactly as v1's readQuota (the 100 → 250 →
    1000 migration, a new local month at 0), bumpQuota and
    markQuotaExceeded do; /account (as v1's syncSerpApiAccount) sets
    used from SerpAPI's own this_month_usage (or the plan less what is
    left), locks a plan with nothing left and lifts a refusal's lock
    once the plan has searches left, unless the app still holds it
    (hold: a refusal just now); it never overwrites the organizer's
    month cap.
  - v1FareKey / fareKeyOfV1 / fareFromV1 / v1Fare: v1's one-adult fare
    cache (pialax_prices_v1, 'from|to|dep|ret'): a live v1 fare read
    back by v2's rule (its cheapest offer, its own fetch time; a sample,
    a booked stand-in or no fetch time is never a price), and a reply
    written as v1's own fetchFlights would cache it (tripFareParse,
    HIT marked, the original fetch time).
  - faresPut: never an older fetch over a newer one, no fares for days
    already past, the newest 400 kept. endPrices(model, code, end, …):
    one traveler's end ±1 day by priceRows (a round trip with that day
    moved; open-jaw, that end's one-way), ★ on the cheapest once two
    differ, need = the ±1 legs still to search (none for a booked
    traveler); null for a host, or an end that cannot move.
- app.html:
  - paid(path, query): the one place that sends the organizer token
    (its X-Pialax-Token header only, never a URL or body), for GET
    /search and GET /account only, with no cache, no credentials, no
    referrer and a 15s abort; it reads X-Proxy-Cache and X-Fetched-At.
    api() (the free /idea routes) never carries it.
  - runSearch(keys, {id, n}): one tap's searches, one at a time, only
    for a trip this phone prices (its edit key and the token:
    model.prices) and only that trip's own legs (spendable), re-checked
    at the tap (spendKeys, spendCount, every lock, again before each
    search) and never more than n, the cost the control drew. This
    visit's count fails closed: every reply but a readable HIT, the
    Worker's own 401 / 400 bad_params / 429 daily_cap, or no answer at
    all counts, so a reply whose X-Proxy-Cache cannot be read still
    stops the visit at 8. v1's month counter moves on a 200 that is not
    a HIT; a HIT moves nothing and keeps its first fetch time. The stop
    is read from the Worker's own code (searchStop): a 429 daily_cap
    sets pialax_daily_cap_v1 (v1's tripDailyCapMark), any other 429 is
    SerpAPI's and locks the month (v1's markQuotaExceeded), only the
    Worker's no_token is 🔑⚠, no answer is 📶⚠, anything else (SerpAPI's
    status passed through, a 5xx) is ⚠. Nothing is retried. A step that
    throws ends the run like a stop (◷ never stays). Every fare is kept
    in pialax_fares_v2 and, for a one-adult search, mirrored into v1's
    pialax_prices_v1. The run ends with a toast and an /account read.
  - accountSync: GET /account on the organizer's phone only (the token
    and an edit key), when P-total, a priced person's sheet or ⚙ opens
    (at most every 5 minutes, a failed read too) and after every run or
    token save: today's Worker searches (🔍 26/30), the plan's month,
    and pialax_multi_airport_v1 set or cleared from
    features.multi_airport, as v1's tripNoteWorkerFeatures does. The
    Worker's own 401 sets S.acctBad: 🔑⚠ in ⚙ (the token field marked)
    and P-total until a read goes through. A SerpAPI refusal is held 5
    minutes before an /account that shows searches left lifts it; a tap
    on ⛔ then reads /account (free).
  - The 🔍 tap (ACTS.search) carries data-n, the cost drawn on it. A tap
    while /account is out waits for it (◷); if the cost by the same
    rule has grown since it was drawn (nearby airports switched on,
    so single-airport fares no longer price the legs), the sheet is
    drawn again with its new cost (toast 🔍3?) and nothing is spent.
  - absorbV1Fares on open and on focus (no network): v1's live fares
    for the same searches count here.
  - P-total (data-popup P-total), from the card's total (now a button
    above the card's overlay) and the trip page's total block (shown
    as $— 🔍N before any fare, the way in; ⛔ 17:00 / ⛔ 11/1 / ⛔ while a
    lock is on, never a 🔍0), headed by the trip's own picture and ⓘ:
    one row per traveler (the face opens their sheet; ‹ comes back), ✈
    or 🛬 🛫 legs (legPrice: the winning code on its side, BUR→ or
    →JFK; $; the age wedge, "Fetched 2h ago"; the level gauge, three
    bars low → high with the level's own filled, "Price low"; a stops
    line, "1 stop"; ▼ / ▲; grey once a day old; $— dashed never
    searched; $∅ no fares), hosts no row, ✈⚠ (or why) for someone with
    nothing to search; the sum with ▼ / ▲; 🔍 left today and this
    visit's 8 dots; one 🔍N (🔍4/5 when the caps cut it short; aria
    "Search 4 of 5 fares, 4 searches"), ⛔ 17:00 (Daily limit), ⛔ 11/1
    (SerpAPI refused / Month cap / Plan used up / Month limit), ⛔ ↻ at
    the visit's 8 ("New visit": ↻8? on the first tap, a new visit on
    the second, nothing spent), ◷ while a run is out or waits. A closed
    trip shows its rows and no spend, and its card no 🔍.
  - P-person (fareRows) on the organizer's token phone, under the legs,
    with ⓘ: each leg's price with the airport that won (as P-total),
    this visit's dots while a ±1 day can be searched, then per end the
    day before, their day and the day after with their $ (★ on the
    cheapest; a round trip's own day ✈, the fare above) and 🔍2 for the
    two still to search (⛔ alone in the square while locked, its time
    in its label). The day before or after is a raised button whose
    move is to the day it names (data-day: a quick second tap moves
    nothing further); the organizer moving someone else's day gets 📞
    11/7 with ↩. One that cannot move someone sits flat and says why
    on a tap (Not answered yet).
  - ⚙ on the organizer's phone: 🔍 left today with the day's ⛔ beside
    it, this visit's dots with its ↻, the month's searches used against
    a month cap the organizer types (digits only, saved as v1's budget;
    a cap under what is used locks the month) with the month's ⛔ and
    why; 🔑⚠ while the Worker refuses the token.
  - On the organizer's own phone without the token, the trip page shows
    one muted 🔑🔍 (Add token) opening ⚙ at the token field; no $.
  - The board's price column is 64px and sizes a long amount down
    ($1,387+, $10,987+), so it never pushes the page sideways.
  - P-total's legs keep their own rules (.trow .legsx > span): $— is
    dashed and the gauge bottom-aligned there as in P-person.
  - P-person's name (nameWords, fitHead) breaks only at its spaces:
    each word is a nowrap span (not split at a hyphen either). Beside
    the face it gets what ‹, ⇄, ⓘ and ⌄ leave; when a word overflows
    there (measured as the sheet is drawn, and again on a resize) the
    header wraps (.stk) and the name takes its own line under the face
    (past ‹ when there is one), the buttons staying on the face's row.
    Only a word wider than the whole sheet is then drawn smaller (to
    14px) and, past that, broken (.brk), never scrolled sideways. The
    sheet opened from P-total on the organizer's token phone (‹ ⇄ ⓘ ⌄)
    no longer breaks "Ashwin" into As/hw/in at 360 or Ashwi/n at 390.
  - saveTimes (PIA-139's times, found while making its test
    deterministic): the write is guarded on the fresh record, so a time
    typed for someone whose 🎫 was taken back on another phone, on a
    phone that has not read that yet, sends nothing and says 🎫⚠ (as it
    does when the phone already knows) instead of opening P-error
    (bad_body). A trip closed meanwhile still says so in P-error.
  - The key gains ▼ Cheaper, ▲ Pricier, ⛔ Limit reached, 📆 This
    month, ★ Cheapest, Fare age, Price level, Stops, $— Not searched,
    $∅ No fares, ✈ Round trip fare, → Cheapest airport, the visit's
    dots, ↻ New visit, 🔍 26/30 Searches today, ◷ Searching, 🔑⚠ Token
    refused, 🔑🔍 Add token, 🛫 Flies from; ⓘ in a sheet (skey) reads
    that sheet's own glyphs.
  - arm / the 🎫 invitation lapse by nowMs (armLapse, inviteFade): a
    timer that fires early by the app's clock waits out the rest, so a
    loaded test machine never decides what the test clock decides.
- Tests:
  - test-trip-model (+25): endPrices for an open-jaw arrival and way
    home, a round trip's end (Mom & Dad still 2 adults), no past day,
    no host, none to search for a booked traveler; fareFromSerp on the
    fixture and on a hostile reply; a leg shows the price the total
    adds; none; ▼ / ▲ between two fetches only; searchQuery = v1's
    parameter set, sorted sets, adults=2, and every malformed key
    refused; every search the model builds over 5 fixture trips (nearby
    on and off) taken by the REAL worker.js (200 MISS each); spendKeys
    (missing first) / spendCount; tapKeys and spendable without a
    booked traveler; every lock and monthWhy; v1's own readQuota /
    bumpQuota / markQuotaExceeded run in-process from
    pialax-mobile.html against quotaRead / quotaBump / quotaExceeded;
    quotaFromAccount (lifts, holds, keeps, the cap untouched); v1's
    fare cache both ways; faresPut; and, read as source, no write
    builder that takes or reads a fare or the pricing rule.
  - test-gflinks: Anjo's nearby keys and /search query name the set
    sorted; her link keeps her home code first.
  - test-trust (+8), the A1 / A3 trust gate over app.html's spend path,
    the app run in-process against the REAL worker.js (its token gate,
    fare cache, SpendMeter and 429s; SerpAPI the counting stub), one
    clock for both, every wait a setImmediate tick (no real timer); it
    replaces PIA-134's "no /search at all" check: no token, and a guest
    holding the token, make zero paid calls and draw no 🔍 and no $
    whatever is tapped; nothing searches by itself (open, poll, focus,
    render); one tap on the drawn 🔍 = one GET /search per leg, the
    model's own queries, the token in its header only; three MISSes
    move pialax_serpapi_quota and the visit by 3; a HIT on another
    phone 2h later moves nothing and keeps the first fetch time; a run
    sends only the trip's own legs, never more than its control showed,
    ≤4 a tap and ≤8 a visit, also with X-Proxy-Cache unreadable (8
    SerpAPI calls, never a 9th); SERP_DAILY_CAP=1 → 429 daily_cap →
    locked (⛔ 17:00) until 00:00 UTC only, the month untouched;
    SerpAPI's own 429 → the month lock (⛔ 11/1, "SerpAPI refused"),
    held through the read right after it and the next day while
    /account says nothing, lifted by one that shows searches left,
    locked again by one with none; and v1's own fetchFlights caches a
    HIT exactly as v1Fare writes it.
  - test-app (+29, against the real Worker, SerpAPI stubbed from the
    fixture; taps hand on the data-* of the control as drawn): nothing
    fetched by itself with day-old fares; 🔍3 with single airports
    before /account, nearby sets after it; P-total's cost before the
    tap; one number on P-total, the trip page, the card, the board and
    Mom & Dad's sheet; ages, levels (the gauge), stops, BUR→ / ORD→ /
    EWR→ winning, named on a long press, in P-person too, ⓘ in both; a
    day later grey with 🔍3 (🔍2/3 on a visit that spent 6); the refresh
    ▼$20 a leg, ▼$60 the total; a HIT from another phone; a tap waiting
    for /account; a tap whose cost grew while it waited (🔍1 drawn, 3
    now: nothing spent, 🔍3 drawn, the next tap spends 3); a booked
    traveler never searched; the total block's ⛔ (never 🔍0); ⛔ ↻ and
    a new visit; SerpAPI's 429 held, then lifted by /account; a refused
    token (🔑⚠, no re-read within 5 minutes, at once after a save);
    SerpAPI's 401 is ⚠ not 🔑⚠ and counts, no answer is 📶⚠ and does
    not; a run whose redraw throws ends cleanly; ±1 day with ★, a
    double tap moving one day, the organizer's move with ↩, a chip
    that cannot move someone; ⛔ 17:00 on P-total and ⛔ in a square,
    ⛔ 11/1 and why; $∅ not offered for a day; v1's fares both ways;
    no price in an answer, an edit or a share; a guest and a
    token-less phone (its 🔑🔍); ⚙'s budget, cap and lock rows; a
    dropped trip's card; the board's 5-digit sums.
    Made deterministic in this pass (preflight saw each fail once): the
    PIA-139 case of a time typed for someone unbooked meanwhile now runs
    both ways, the phone having read the change (two refreshes: the
    first joins the read the trip's open sent before the change) and not
    yet (the fresh read holds the write back), waiting on the 🎫⚠ toast
    and the write queue rather than a fixed number of ticks (it used to
    race that phone's fresh read; against the old saveTimes the new
    case fails every time, on P-error); and until() keeps polling
    (every 5ms, up to 20s of performance.now) once its turn budget is
    spent, since the
    in-process Worker hashes the edit key on Node's thread pool, which a
    loaded machine can hold up past any number of turns (PIA-138's four
    quick taps read the record before their write had landed; with every
    POST held 40ms the old until fails 25 checks, the new one none). The
    PIA-137 booked-Out case waits for its write the same way. What the
    app decides still comes from its own clock.
  - test-words (+12): a worst-case trip (8 long-named open-jaw
    travelers, each leg won by another airport of their set: 16 codes)
    on its organizer's phone, and the Done 8-member trip's fares in
    every state, walked at every width; P-total from every card and
    trip page (≤20 words); real clicks through the real Worker: 🔍4/5
    then 🔍1; P-total's and P-person's ⓘ (every glyph in the sheet
    keyed and explained, every page counted) and every part's long
    press; a person's 🔍2 and ★; ⛔ ↻, ↻8? and a new visit; ⛔ 11/1 and
    "SerpAPI refused" (and the trip page's ⛔); ⛔ 17:00 and "Daily
    limit"; ⚙'s budget and every lock in its row; ◷ while /account is
    out; 🔑⚠; and the wait and every lock again at 360, 390 and 430
    with their labels. The 🔑🔍 is walked with the 8-member organizer's
    phone at every width.
  - test-viewport: +22 states per size and scheme (P-total from a card,
    the 8-member trip's $— block, P-total all $— with 🔍4/5 and its ⓘ,
    after 🔍4 and after 🔍1 and its ⓘ, a person's fare row, ±1 days
    and its ⓘ, P-total and P-person locked, ⚙ with the budget, the
    visit's ⛔ ↻ and ↻8? in P-total and a square, the month's ⛔ 11/1 on
    the block, P-total and a square, ⚙ with every lock, the board with
    $10,987, $10,987+ and $1,387+ unclipped) at 360/390/430, light and
    dark; P-total's $— dashed and its gauge bottom-aligned as in
    P-person; the paid routes answer only the token. And at 360/390/430,
    light and dark, every person's sheet on the Diwali trip and the
    8-member long-name trip (this phone being Bartholomew
    Montgomery-Fitzgerald there), opened from P-total on the token phone
    (‹ ⓘ, and ⇄ for the phone's own traveler) and from the board: the
    name's Range.getClientRects lines are no more than its words, no
    word is on two lines, it overflows nothing and covers no button,
    the buttons stay on the face's row, nothing scrolls sideways, every
    target is ≥44px, and no sheet searches (6 checks, 19 sheets each;
    this ticket's previous app.html fails all 6: Ashwin in 3 lines at
    360, Konstantinopoulou broken at 430).
  - scripts/fixtures/serp-flights.json: one SerpAPI google_flights reply
    (LAX→PIA, a nearby BUR offer cheapest, price insights).

Checked against deliberate mutations in a scratch copy, each failing
test-trust or test-app: a HIT moving the month counter; the daily cap
read as the month lock; SerpAPI's 429 not locking the month; runSearch
without its token check; the visit counted on a readable MISS only
(the header-less run sends a 9th search); a tap spending what is there
now rather than what it showed; the refusal not held; runSearch
searching keys that are not the trip's own.

Decisions:
- One spend path: paid() is the only fetch that carries the token, for
  /search and /account only; test-app pins fetch to two call sites.
- A search is v1's exact parameter set (no gl=us, though the spec's
  P-cheapest listed it; adults only above 1), so a one-adult search is
  one Worker cache entry for both apps.
- A control's cost is binding: the tap spends at most what it drew
  (data-n), and a cost that grew is drawn again before anything goes.
- The month counter is v1's pialax_serpapi_quota, moved by every 200
  that is not a HIT; /account replaces its used with SerpAPI's own
  count. Unlike v1's sync it never overwrites the budget (the
  organizer's month cap, set in ⚙). Like v1's sync, an /account with
  searches left lifts exceeded (a SerpAPI 429 can be a passing hourly
  limit), but not within 5 minutes of the refusal, so a burst of taps
  cannot retry a refusal at once.
- The plan's last 10 searches lock the month, as 990 of 1000 does.
- A visit is this tab (sessionStorage pialax_spent_v2, kept across a
  reload or a discarded page; v1's in-memory count resets on one, and a
  home-screen app has no reload). It ends when the organizer says so:
  ⛔ ↻ and a confirming second tap start a new visit, which spends
  nothing itself; the Worker's 30 a day and the month lock still hold.
  The visit counts every reply the Worker may have spent on (it fails
  closed), not only a readable MISS.
- v1's MAX_CALLS_PER_REFRESH is retired in v2: a tap is the refresh (4)
  and a visit 8. A day-old fare's nudge is its grey 🔍 on the card and
  the trip's 🔍N chip; the spend itself is P-total's one tap.
- A booked traveler's legs are shown but never offered to a tap.
- A search with no fares is kept (none) and not offered for 24h.
- ▼ / ▲ compare two real fetches of the identical key; the total's only
  when every priced leg has one.
- P-person names the airport that won, as P-total does (this reverses
  the first draft's word-budget call: the worst case measures within
  20 words).
- Google's level is drawn as three bars low → high with only the
  level's own bar filled (green low, red high), so full bars never read
  as "good" the way a signal meter would.
- The ±1 day prices sit in their own rows under the legs (not inside
  each leg row as the spec drew it), with the same caps and button; a
  round trip's own day shows ✈ (the one fare above) instead of its $.
- Fares stay on this phone (pialax_fares_v2); app.html never writes one
  to the record, a link, a share, a calendar event or another phone.
- A name with no room beside the face goes under it, measured, rather
  than a smaller face, buttons moved off the face's row or an ellipsis:
  the face stays 72px and ⌄ / ⓘ stay where the thumb expects them, and
  the name is never cut. A name that fits beside the face (most names,
  e.g. Ashwin with ‹ ⇄ ⓘ at 430) looks as before.

Owed (needs a person, a device, a Worker change or a later ticket):
- Party pricing for adults=2 (the spec's risk, AC8; legTotal in
  scripts/trip-model.js is the one place to change). One real search,
  on the organizer's machine (0 if the Worker cached it within 24h):
    export PIALAX_TOKEN=…   # this shell only, never in a file
    curl -sS -D /dev/stderr -o /tmp/a2.json \
      -H 'Origin: https://shwinster101.github.io' \
      -H "X-Pialax-Token: $PIALAX_TOKEN" \
      'https://pialax-proxy.ashwinyedavalli.workers.dev/search?engine=google_flights&departure_id=PIA&arrival_id=RDU&outbound_date=2026-11-06&return_date=2026-11-09&type=1&currency=USD&hl=en&adults=2'
    node -e 'const j=require("/tmp/a2.json");console.log(j.best_flights&&j.best_flights[0]&&j.best_flights[0].price,j.search_metadata&&j.search_metadata.google_flights_url)'
  Open the printed google_flights_url (2 passengers) in a browser, note
  its first price, then switch Google Flights to 1 passenger (free). If
  SerpAPI's price matches the 2-passenger total, legTotal stays as it
  is; if it matches the 1-passenger price, legTotal must multiply by
  the key's adults (re-inline the region, re-run test-trip-model and
  test-app). Record the two numbers in this ticket. Once confirmed, a
  party fare can carry ×2 beside it in P-person.
- One tap on the real phone against the deployed Worker (≤4 searches):
  the CORS preflight for X-Pialax-Token from github.io, X-Proxy-Cache
  and X-Fetched-At readable, ⛔ times in the phone's own zone.
- v1's syncSerpApiAccount overwrites pialax_serpapi_quota.budget with
  the plan's searches_per_month: on a phone that runs both apps, v1's
  next sync replaces the month cap set in v2's ⚙. Goes away at the
  cutover (PIA-147).
- v1's persistFlightCache rewrites pialax_prices_v1 from its own memory,
  so a fare app.html mirrored there lasts until v1's next fetch in an
  open v1 tab (v2's own copy is kept either way). A fare mirrored there
  can also reach v1's own opt-in fare-target alert (tripTargetAlerts →
  POST /alert, the organizer's own email) on a phone that runs v1 too;
  this goes away at the cutover (PIA-147).
- The Map's pills (PIA-143) and the cheapest-week bars (PIA-141) must
  price through priceTrip / priceRows and the same spend path
  (runSearch with the drawn cost, spendable widened to their legs), and
  P-cheapest's 📉 opens from P-dates there.
- VoiceOver / TalkBack reading of P-total's legs, the ±1 day chips, ⛔
  and ⛔ ↻ on a real device; a 2-person check that "New visit" and the
  level gauge read as meant.
- Not done here (pre-existing layouts, raised by the walkthrough): a
  host who decides to fly in still changes her airport through ✎ › 👥
  (P-person's 🏠 is not a control; PIA-137's sheet); at 360x740 the
  trip page's sticky [Book | 🎫] bar can sit over the last board row,
  so a tap there opens Google Flights (PIA-139's layout).
- The 2-person comprehension and icon checks listed in CLAUDE.md before
  cutover.

Refs PIA-140.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
