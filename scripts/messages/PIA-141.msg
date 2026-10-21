feat(v2): the cheapest week on demand — real searches only, the cost first, Move in one tap

On the organizer's token phone, P-dates' 📉 opens P-cheapest: every week
that keeps the trip (its length or 🌙N, its 📌 day, inside the flex
window, from tomorrow) as a bar priced by the one pricing rule from real
cached fares only. A week nobody searched stays a dashed hollow bar with
its cost on top (🔍≤2); one tap on its 🔍N, PIA-140's own spend control
and path, prices it; ★ marks the cheapest once two weeks are priced; Move
makes a filled week the plan in one write, and every plan-follower's
link follows in the same render. Only plan-followers move with a week:
own ends stay and are priced as they are, a booked traveler keeps the
days they booked and their cached price is in every week alike, so the
plan's own bar always reads P-total's total. A week that would leave
someone's own days outside the plan carries their face and asks before
it moves; so does any Move once someone has booked. P-dates under the
sheet follows each of its writes, so ‹ never offers the old dates back.
app.html is still linked from nowhere. pialax.html, pialax-mobile.html,
index.html, worker.js and scripts/trip-idea-builder.js are unchanged.

- scripts/trip-model.js (region, inlined byte-identical in app.html):
  - cheapCandidates: booked travelers are left out of what a week
    searches and of what fills or greys it (their flight is bought:
    never searched); their cached price, as P-total reads it, is added
    to every priced week alike (bought), so each total is the trip's
    whole cost, the plan's own bar is priceTrip's total, and ★ and the
    bars still compare only what a Move changes. A week that would leave
    their booked days outside the plan carries their face, as one that
    leaves someone's own days out does (warn faces + warnCodes);
    need = what one 🔍 on the week searches (its legs not fresh here,
    never-searched first, by spendKeys; none for a week a search found no
    fares for, or where someone cannot be priced: its ends would cross,
    an own end already past); priced / stale / sum: every leg has a real
    price, some a day old (shown grey, not filled, refresh offered); ★
    only once two weeks are filled and one is cheaper (endPrices' rule).
    missing stays priceRows' own list, so the plan's week is still
    priceTrip exactly (the parity test over 100 fare mixes stands).
  - followsPlan(m): travels, not booked, at least one end blank.
  - cheapWhy(model, today): why 📉 cannot open: org, token, legacy,
    closed, past, locked, nodest, nights, window, nobody (no follower),
    unpriced (someone still to book has no airport to fly from, so no
    week could ever be complete), noweek (none fits, even a week wider).
  - widenWin(model, k, today) / widenDelta(w): ⟦◀ ▶⟧, the window a week
    wider on one side, only where that adds a week (the 📌 day or
    tomorrow often bounds it), saved as searchStart / searchEnd.
  - moveDelta(model, c): Move = planDelta(c.s, c.e, 📌), P-dates' Save.
  - spendable: + every candidate week's need while cheapWhy is '' (none
    once the dates are 🔒), so the one spend path searches them.
- app.html:
  - P-dates: 📉 (dcheap, "Cheaper week") among the organizer's tools on
    his token phone (dates and ⟦window⟧ modes), and beside 🔓 on a locked
    plan; greyed with why on a tap (Dates locked, Nobody follows plan, No
    destination, Pick nights, Pick window, No home airport, No week fits);
    none at all without the token, on a v1 doc, a closed or past trip.
  - P-cheapest (data-popup P-cheapest, "Cheaper week"), ‹ back to P-dates:
    📉 and the trip's picture, ⓘ (the sheet's own key); 🔍 26/30 and the
    visit's dots; ≤7 bars a page (7 × 44px + 6 × 2px fits 360, wider bars
    at 390/430; 6 a page below 340px, still ≥44px), one scale across pages
    from zero: hollow dashed with 🔍≤N on top, filled to the total ($890)
    with ★, grey a day old ("Old fares"), $∅, ✈⚠ (cannot be priced), the
    plan's week outlined, ⚠ and up to two faces (then +n) under the date;
    ◀ ▶ (paging) and the dashed ⟦◀ ▶⟧ (widening, "Widen window earlier /
    later") in two groups on their own row below. The selected week: its
    days and total, each traveler's chip (face, $ or $— or $∅, 🎫 and its
    muted price for a bought flight; own days underlined, ⚠ when left
    out), then one 56px button stuck to the sheet's bottom (in view on a
    640px-high phone with 8 long names): spendBtn (🔍N, ⛔ 17:00, ⛔ 11/1,
    ⛔ ↻, ◷: data-v="week" data-day, the same data-n binding), or Move (◷
    while out, ⚠ ↻ after a failure; a confirm asked is drawn first),
    nothing on the plan's own week. A long press names each bar in two
    words; screen readers hear the whole week ("11/22–12/1, $890,
    cheapest", "…, leaves Anjo days out"); a short tap on a chip, its ⚠,
    the readout, 🔍 26/30 or the dots names it too (picTap → explain),
    so nothing there looks like a control that does nothing. Keyboard
    focus that was on a button the redraw replaced (🔍N → Move, Move →
    🔒) lands on the sheet's button, else the selected bar, never <body>.
  - search (ACTS): data-v="week" reads that week's need again at the tap
    (and nothing while cheapWhy says no), through runSearch as before.
  - cmove: arm() first when the week leaves someone's days out (every
    time, a retry too: the ⚠ ↻ gives way to the confirm at once) or anyone
    has booked (once a visit, PIA-138's acked; ⚠🎫×n), holdTaps against a
    double tap; then organizerWrite(moveDelta) with bookedGuard, drawn at
    once; on success ‹ P-dates on the new plan, toast 📉 11/22–12/1 with ↩
    (datesUndo); held 'booked' asks there (P-error if the sheet was left),
    a held 🔒 toasts 🔒 and P-cheapest shows 🔒, a closed trip 🏁 and
    📉⚠ ("Trip closed").
  - cwiden: one organizer edit of the window (closedGuard), drawn at
    once, the new week nearest the old ones selected on its page; the
    toast shows the window saved (⟦11/13–12/13⟧).
  - cheapSnap / cheapResync: P-dates under P-cheapest is re-read from
    the record (mode, range, 📌, 🌙) when a Move or ⟦◀ ▶⟧ is drawn and
    again when it lands or is refused, as datesUndo does: ‹, even while
    the write is out, shows the trip as it stands (an undated idea a Move
    dated is in dates mode, 🔒 there), its Save has nothing stale to send
    and closing it raises no 🗑 for a pick nobody made. A pick made there
    meanwhile is kept.
  - cbar / cpage: select a week; page (the selection follows the page).
  - LEGEND: 📉 Cheaper week, ▮ Priced week, ▮ grey Old fares, ┆ Not
    searched, ▭ Current dates, 🔍≤2 Searches needed, ⚠ Leaves days out,
    ◀ ▶ Page, ⟦◀ ▶⟧ Widen window, own days underlined; 🔍 26/30 is now
    "Searches left" (P-total and ⚙ too: it counts what is left). CSS
    replaces the unused .strip / .cbar / .fchips rules the shell carried
    from the prototype; P-dates' opaque sticky-bar rules cover P-cheapest.
- Tests:
  - test-trip-model (+20): the Thanksgiving S1 sample pinned on the
    legacy fixture migrated through the real Worker and 🔓 (the migrated
    doc is 🔒: cheapWhy 'locked' until then): 10 weeks 11/17–11/26, each 9
    nights with 11/26 inside and in the future; 5 marked 🗽; every other
    week costs ≤2 (Ashwin's two one-ways), Anjo's legs never; no ★ with
    one priced week; with 11/22's two legs $890 ★, $955 not; never a week
    after the dinner in an 11/1–12/31 window, ⟦◀ ▶⟧ adding nothing, and
    without the 📌 15 weeks widening to 22; the unmigrated doc 'legacy';
    an undated idea's 🌙4 weeks; tomorrow at the earliest; a booked
    follower; S1 with Anjo booked (one fare a day old): $450 in every
    week, the plan's bar $955 = P-total's total, 11/22 still $890 ★,
    nothing of hers searched or greying a week; every cheapWhy; equal
    totals no ★; $∅; a day-old week; a week that cannot be priced;
    spendable with and without 🔒; Move as one /idea/update through the
    real Worker (Ashwin's link 11/22 → 12/01, Anjo's unchanged, the
    trip's total $890), with a booked follower (her days pinned first),
    on a 🔒 record (nothing built); ▶⟧ through the real Worker. PIA-140's
    spendable count is now 24 / 16.
  - test-app (+24, against the real Worker, SerpAPI stubbed by search):
    S1 with its fares 3h old: 📉 → P-cheapest (‹ P-dates, one /account,
    no search); 10 weeks on 2 pages; ⚠🗽 on 5; 🔍≤2 on each hollow week;
    $955 outlined, no ★; 11/22's 🔍2 drawn before any spend; its tap = the
    model's 2 queries (the token in its header only); $890 ★ and Move;
    Move drawn at once (Ashwin's link 11/22 → 12/01 in the same render,
    ◷), then ONE /idea/update, ‹ P-dates on the new plan, the toast and
    ↩; no price in any write; ⚠🗽 asking first; ⚠🎫×1 asking first, her
    booked legs never searched, her $450 on her chip; 📉 greyed "Dates
    locked" and "Nobody follows plan"; a 🔒 another phone made meanwhile
    holds Move back; no 📉 without the token; ⛔ 17:00, ⛔ ↻ and 🔍1/2 on
    a week's button; ▶⟧ saving ⟦11/13–12/13⟧ (15 → 22 weeks, the first
    new one selected, the two groups); paging 7/7/7/1; an undated idea
    moved (its 🌙 gone, its window kept), then ‹ P-dates in dates mode
    (🔒 there, Save "No change"); fix pass: ▶⟧ on an undated idea (a
    second tap while it is out sends nothing, the toast shows the
    window), then ‹: Save "No change", nothing sent, no 🗑; ‹ while Move
    is out (srv.hold) with a 60s poll and a double tap meanwhile: P-dates
    on 11/22–12/1 at once and after it lands, one /idea/update, Save
    sends nothing, no 🗑; a Move that failed (the network): ⚠ ↻, P-dates
    back on the plan, ↻ asks ⚠🗽 Confirm at once (nothing sent), one
    update after; a ▶⟧ that failed: ⚠↻, nothing saved, its ↻ saves once;
    a booking made on another phone between the tap and the write: held,
    nothing sent, ⚠🎫×1 Confirm here, then one update with her booked
    days kept. The four P-dates / ↻ cases were checked to fail against a
    copy with the fix taken out.
  - test-trust (+1): the cheapest week spends only through the PIA-140
    path: no token, or a guest holding one, draws no week and sends
    nothing; the drawn 🔍3 on one week sends its 3 legs; once 🔒, 0. The
    A1 run's own legs are now 24 (P-total's, ±1 days and the other weeks').
  - test-words (+14): 📉 → P-cheapest on every organizer token phone at
    every width (≤7 bars a page, ≥44px, the pager below, ‹ back), at 360 its
    long presses and ⓘ; 📉 greyed with its counted label ("Dates locked",
    "Nobody follows plan"); a worst case (8 long names, four faces left
    out of every week, 8 chips); S1 with real clicks through the real
    Worker at 360/390/430 (the two pages, 🔍2 → 2 searches → $890 ★, by
    keyboard with the focus landing on Move, Move ◷, ‹ P-dates and its
    toast, ⚠🗽 Confirm, ⛔ 17:00 and "Daily limit", ⛔ ↻, ⟦◀ ▶⟧ and ▶⟧
    saved, an undated idea moved with ⚠🌴🗽 Confirm and ‹ P-dates in
    dates mode with nothing to save); at 360 short taps naming a chip
    ("Ashwin"), 🔍 26/30 ("Searches left") and a left-out face's ⚠
    ("Leaves days out", the confirm still asked); every state counted.
  - test-viewport (+10 states per size and scheme, one only when the
    8-member trip has a week besides the plan's): P-dates with 📉 and
    P-cheapest's states (15 weeks on 3 pages with ⟦◀ ▶⟧, a hollow week's
    🔍3, searched, Move asking, the next page, its ⓘ, the 8-member trip's
    chips, the same on a 640px-high phone with its button whole and in
    view) at 360/390/430, light and dark; and at 320px, 6 bars of ≥44px
    with no sideways scroll.

Decisions:
- Every week's total is the trip's whole cost: a booked flight's cached
  price (never searched, never refreshed here: it is bought) is added to
  every week alike, so the plan's bar is P-total's total (D2) and the
  weeks still compare only what a Move changes. Their booked days stay
  theirs on a Move (organizerEdit's PIA-138 rule), so a week that leaves
  them out asks.
- A week priced with a day-old fare shows its real total grey ("Old
  fares" in ⓘ and on a tap) and offers its refresh, cost first; Move and
  ★ wait for fresh fares (filled). The Worker's cache lives as long as a
  fare stays fresh, so that refresh is a real search: see Owed.
- The bar's cost is the spec's 🔍≤N (legs not fresh here; a Worker cache
  hit is free); the button is PIA-140's 🔍N, the binding cost of the tap.
- ⟦◀ ▶⟧ save the wider window (one free edit), as the spec says, and
  show only where they add a week; Thanksgiving's 📌 bounds its weeks.
  They sit apart from ◀ ▶, dashed like the window, and the toast shows
  the window saved, so the edit never passes for a view control.
- After Move the sheet goes back to P-dates on the new plan (P-dates'
  own "the sheet stays open after Save": 🔒 one tap away), with ↩.
- The 🎫 confirm on Move is asked once a visit (PIA-138's acked, as
  every other plan move); a week's ⚠ faces ask every time, a retry
  after a failure too.
- Words: P-cheapest shows only Move or Confirm as words in any state;
  names live in chips' labels, not on the sheet.

Owed (needs a person, a device, a Worker change or a later ticket):
- The spec's P-candidate (another destination, '+📍' on the Map) is the
  Map ticket's (PIA-143: "the organizer can price a different
  destination on demand"); it will reuse cheapWhy-style gating and the
  same spend path. Not built here.
- Party pricing for adults=2 (PIA-140's owed manual search) applies to
  every week's total too: legTotal is still the one place to change.
- The spec's "about 4 new windows per session" honest limit: the caps
  are PIA-140's (≤4 a tap, 8 a visit, 30 a day); a 2-person check that
  🔍≤2, ⚠ + a face, the grey "Old fares" week (Move waits for a fresh
  fare) and 📉 two taps deep read as meant before cutover, and whether
  Move on a day-old total should be offered behind a confirm instead.
- Guests learn of a Move from their new dates and the Trips badge only;
  a "dates changed" mark for a guest whose last visit predates the plan
  edit (PIA-135's seen marker) is a later ticket's.
- The full scripts/preflight.sh no longer fits one 600s foreground run
  here: test-words alone takes over 10 minutes (its AC3 walk 6.5). This
  pass ran preflight's steps 1-7 and every other suite in one run (GO),
  and the word gate in four parts that each keep the AC3 walk and AC5
  (+ PIA-141: 39 checks; + PIA-140: 38; + AC2, AC4, PIA-135, PIA-136:
  80; + PIA-137, PIA-138, PIA-139: 57), all passing, so every section
  ran; test-viewport passed (123). The ship step needs a longer ceiling
  (or a split word gate) to see one GO.
- VoiceOver / TalkBack reading of the bars and chips on a real device.
- The 2-person comprehension and icon checks listed in CLAUDE.md before
  cutover.

Refs PIA-141.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
