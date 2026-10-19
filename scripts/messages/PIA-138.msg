feat(v2): dates — the one picker

One date picker for everyone: the organizer moves, locks or clears the
plan, and a plan change carries every end that follows it (links, bars,
pills and card dates are rebuilt from the record in the same render),
while nobody's own days are changed behind their back. A date change is
checked again on the record it is sent against, so a phone that has not
seen a lock (or a booking) never moves the plan under it. app.html is
still linked from nowhere. pialax.html, pialax-mobile.html, index.html,
worker.js and scripts/trip-idea-builder.js are unchanged.

- scripts/trip-model.js (region, inlined byte-identical in app.html):
  - moveRange(s, e, k, pin, today) and planShift(model, k, today): one
    rule for every shift (the trip view's ±1, the picker's −7 −1 +1 +7):
    the whole range, keeping its length; why 'past' (before today), 'pin'
    (📌 would fall outside), and for the plan 'org', 'legacy', 'closed',
    'locked', 'none'.
  - datesHeld(fresh, delta): a delta that changes the dates (plan,
    ⟦window⟧, 📌 or 🌙) of a record that is chosen ('locked') or paid /
    dropped ('closed') is held back unless the same update unlocks it;
    organizerEdit builds nothing for it.
  - holidayPick(day, today): a holiday's whole long weekend (🦃 Wed–Sun,
    🎗 🌭 Fri–Mon, 🎆 🎄 🎉 ±2), never before today, 📌 on the holiday.
  - planCheck(s, e, {today, pin, window, nights}): what stops a pick
    ('empty', 'partial', 'order', 'past', 'pin', 'nights').
  - planDelta / windowDelta / clearDelta: the organizer edits that change
    dates (organizerEdit deltas). A plan carries 📌 and no 🌙; a ⟦window⟧
    carries 🌙 nights; 🗓⊘ keeps the flex window (explicit, or plan ± 7)
    as the idea's ⟦window⟧, the plan's length as 🌙N, and 📌.
  - ownDays(model, code, s, e, end, today) and legShift(...): one person's
    own ends (both, the arrive end or the leave end; blank = follow the
    plan again), the patch for respondRequest, their days after it, why
    ('host', 'out', 'answer', 'partial', 'order', 'past'), off (an end
    off the plan: allowed) and same (the patch changes nothing they have:
    "No change"). An end picked on the plan's own day for that side keeps
    following the plan unless it is already their own.
  - dayPeople(model, day): P-day's there / maybe / away, whose heads are
    presentOn (so P-day, the grid's numeral and the heads ring agree).
  - datesRole(model): what the date pill opens ('plan', 'mine', 'answer',
    'look').
- app.html:
  - Trip view: −1 [plan pill] +1 for the organizer (hidden while 🔒,
    a closed trip, a v1 doc or an undated idea). One tap moves the whole
    plan and every plan-following link, bar, pill and card date is drawn
    again in that render; the write is queued at the first tap (drawn,
    holding its place, refreshes ignored) and goes 600ms after the last
    tap (SOON_MS), or at once when the page is hidden: a run of taps is
    one /idea/update. A page left (pagehide) before its run settles sends
    nothing built from what it read earlier; the run is kept on the phone
    and the next open sends it from a fresh read (see "Runs kept" below).
    A shift that cannot go is shown ⏳⚠ / 📌⚠ and explains itself on a
    tap or a long press; once anyone booked, the first shift of a visit
    arms (⚠🎫, "Confirm move"). Focus stays on the control after the
    redraw.
  - Every date write takes a guard to the fresh record (organizerWrite /
    freshWrite opts.guard, plus datesHeld): locked or closed meanwhile,
    nothing is sent and the trip is drawn from that record (P-error 🔒
    "Dates locked", no ↻; in P-dates a 🔒 toast and the plan to read);
    booked meanwhile and not asked about, nothing is sent and the control
    asks for its confirming tap (the ±1, Save, 🔒, 🔓, 🗓⊘, ⬚, a leg). A
    confirm given on any tap of a run holds for the run.
  - Runs kept for the next open (pialax_soon_v2, v2 only: {token: {kind
    plan | own, at, id, the last tap, ack and who had booked when it was
    given; plan: the plan it moves from and to; own: code, by, end, the
    patch, their own ends and the plan before it}}, never a key, a token
    or a doc). Hidden (visibilitychange), every unsettled run is kept and
    a run still taking taps goes as usual; left (pagehide, which comes
    first on a reload or a navigation) it is kept and parked: nothing is
    sent, a page shown again (pageshow / visible) sends it the usual way.
    An entry leaves once its write settles, unless it settles after the
    page was left (a request the browser aborted as it went): then the
    next open decides. The next open (boot, once the trip has been read)
    sends each kept run through organizerWrite / freshWrite, so the
    fresh GET, datesHeld, the booked guard and the
    rebuild from that record (respondRequest keeps a newer status and
    note) all apply, and only while the record still holds what the run
    started from: the plan (±1), or that person's own ends and the plan
    (a leg). A record changed by anyone since keeps that change, a record
    that already has it is left alone (both quiet); a lock or a close
    since is P-error; a booking the confirm did not cover arms the +1 (or
    the leg) where it is on screen, else P-error ⚠🎫 "Someone booked". An
    open that cannot read the trip keeps the entry for the next one; one
    older than a day, or past, is dropped unsent. api() takes no
    keepalive any more.
  - The plan pill (trip view and every card) and my own bar on the board
    open P-dates: the plan for the organizer, my own days once I have
    answered, the plan to read otherwise; before I answer they pulse the
    answer row and toast "👋 In / Maybe / Out". Their accessible names say
    what they show ("Dates 11/6–11/9, 3 nights, event day 11/8, locked");
    data-lbl keeps the long press at "Dates" / "My dates".
  - P-dates (data-popup P-dates): [trip | me] for an organizer who
    travels; the organizer's tools first (📌 👥 🔒 🗓⊘ ⬚; an undated idea's
    [🗓 | ⟦⟧] 🌙− 🌙+ 👥), then the next 4 holidays from the month on show
    (named by their holiday); ◀ month ▶ (◀ on this month aria-disabled
    "Past"); a grid with all seven weekdays; the readout with "follow the
    plan" beside it; −7 −1 +1 +7 (whole ranges); Save. ⓘ opens P-key over
    the sheet (dots, numeral, hatching, the window, the plan outline, my
    days). The sheet may use the whole height with tighter rows, so at
    360x740 it fits; Save is sticky and opaque (disabled greys its label),
    with a fade above it when the picker scrolls. Save stays open (✓
    "Saved" until the next pick); 🔒 keeps the sheet open too (now the
    plan to read with 🔓 in a different spot, and taps in the sheet are
    swallowed for 400ms after a 🔒 / 🔓 / 🗓⊘ / ⬚ lands). Confirms say
    "Confirm" (⚠ 🎫×n Confirm). While a write is out its control is ◷,
    aria-disabled + aria-busy (never disabled, so it keeps the focus),
    and the other controls say "Saving" instead of taking a pick. Closing
    with an unsaved pick toasts 🗑 with ↩ (the pick back). Members: [🛬 |
    ↔ | 🛫] either end or both, the end that follows the plan dimmed, off
    the plan amber (⚠🗓 "Outside plan"); Save is "No change" unless the
    patch changes something. An undated idea's 🌙 reads 🌙? until picked,
    so an untouched Save writes nothing. The grid: heat, dots filled
    first (so the filled dots equal the numeral, at most 8), a numeral
    (presentOn), the plan outline (dashed while proposed), the best window
    dashed, ⟦ ⟧ ends, 📌 as the trip's picture, my own days underlined;
    a day's long press is "12/11 · 👥6".
  - P-day (data-popup P-day): the day, its holiday, 👥 n; faces there
    (full), maybe (dashed), away (dimmed), one word each (fitNames); a
    face opens P-person (‹ back to P-day, then to P-dates).
  - P-person legs: each day is a button (P-dates on that end; named "Arrive
    date 11/6") with −1 / +1 beside it: that end alone becomes their own
    (back on the plan's day it follows again); a run of taps is one
    answer; after their 🎫 the first move arms; reversed days (⚠) show
    their legs to an editor so they can be fixed.
  - Disabled controls are aria-disabled + data-why: a tap shows their
    label (explain), as a long press does (Before today, Event day
    outside, Ends cross, No destination, Pick dates, No change, Past,
    Fewest nights, Window full, Saving, Saved).
  - The screen control that had the focus keeps it through a redraw (a
    store refresh used to drop it); the card fly-in no longer scales, so
    the now-tappable card pill stays ≥44px while it flies in.
  - organizerWrite (opts.gate, opts.guard) and freshWrite ({gate, guard})
    hold a queued write until its taps stop and refuse it on the fresh
    record. errInfo gains locked and booked.
    LEGEND gains shift, past, pinout, unlock, clear, best, present, both,
    follow, cross, the six holidays and the grid's marks (dotin, dotmaybe,
    dotwait, daycount, planprop, planset, mydays, outw, offplan).
- Tests:
  - test-trip-model (+36): shifts (±1, ±7, 📌, today, locked, guest, v1,
    undated) and one through the real Worker (followers move, Anjo's own
    days and link stay with ⚠, a booked follower's days kept as his own);
    datesHeld on a record another phone locked (a move, a lock with new
    dates, 🗓⊘, 📌 and 🌙 build nothing; the same dates, a caption and an
    unlock-and-move go, the last one through the Worker) and on dropped /
    open / v1 records; holiday ranges; planCheck; 🗓⊘ and ⬚ through the
    Worker; an undated idea's window and nights; 🔒 with a new plan and 🔓;
    own ends (both, one, follow; refused for someone unanswered, out or
    hosting, crossing or past; one leg through the Worker keeping the
    other end, note, airport and 🎫); same / the plan's own day following
    the plan; dayPeople = presentOn = filled dots ≤ heads on every day of
    every fixture; datesRole.
  - test-gflinks (+7): the golden "after one +1" link from the model's
    own shift; +1 then −1 back to the golden strings byte for byte; own
    days keep their golden link; a booked follower keeps his; +7; one leg.
  - test-app (+61, against the real Worker): one +1 redraws the pill, my
    ✈↗, the card, the Map pill, Mom & Dad's days and link, Anjo's ⚠ bar
    (her link unchanged) before anything is sent; the pill and card pill
    named by what they show; a read during the taps is dropped; +1 +1 +1
    −1 is ONE update; the write goes by itself after SOON_MS; a page left
    mid-run (pagehide, then hidden) sends nothing, then or later, and
    keeps the run (no key, token or doc in it), and the reload sends a
    fresh GET then ONE update; B locks, then A's +1 and pagehide: no
    update then or on A's next open (plan and 🔒 snapshot 11/6, P-error
    locked); a booking lands, then A's +1 and pagehide: no move then or
    on the next open (her days and Book link kept), which arms the +1 on
    the trip view (the confirm then moves it keeping her days) or says
    "Someone booked"; Mom & Dad's newer Maybe and note, then the
    organizer's leg −1 and pagehide: the next open sends one answer with
    their status and note kept; a newer plan from B, or Anjo's newer own
    arrival, is kept (nothing sent); a write that landed before the page
    died is not sent again; a read the browser aborts as the page goes
    leaves the run kept, and the next open sends it; the back-forward
    cache (pageshow) sends the
    parked run once; an open that cannot read the trip keeps the run, a
    run older than a day is dropped; two
    organizer phones (B locks, A's stale +1 and A's stale P-dates Save are
    held back: nothing sent, plan and 🔒 snapshot agree, P-error locked,
    the sheet redrawn locked); a booking that landed after the last read
    holds the +1 back and arms it, and the confirm moves it keeping her
    days; booked: arm, confirm, no second ask this visit, asked again next
    visit; locked: no ±1, P-dates read-only with 🔓 only, a day opens
    P-day, 🔓 asks once (⚠🎫×1 Confirm) and unlocks in one write with the
    sheet open; 🦃, paging, +7 refused, −1, tap start / end, 📌⚠ blocking
    Save and 🔒; while Save is out it is ◷ (aria-busy, not disabled) and
    a day, a holiday and a shift take nothing; a double Save is one write,
    then ✓ Saved; 🔒 tapped twice locks once and the sheet stays open as
    the plan to read; own days both / one end / the plan's own day
    following again / follow; one own end opens on "No change", an
    untouched Save writes nothing, Follow on and off is still "No change",
    and "arrive a day later" with ↔ sets the arrival only; an unanswered
    guest's pill (the control itself, tapped) pulses her answer row in
    the render that follows and toasts; leg shifts −1 −1 +1 as one 📞
    answer; an undated idea's window and nights, 🌙? and "No change" with
    no 🌙, ⬚ in one write, 🗓⊘ and ↩; every grid numeral = presentOn =
    filled dots ≤ heads, and on the 8-member trip at most 8 dots, filled
    first, a day's label "12/11 · 👥6"; no best window until someone sets
    days.
  - test-words (+10): P-dates on every trip view of every phone at every
    width (the walk) with its ⓘ key, P-day on its busiest day (8
    long-named faces), and at 360 the picker's other states and
    long-press in P-dates and P-day; real clicks: +1 (pill and ✈↗ in that
    render, focus kept, nothing sent), the 📌⚠ +1 explaining itself, +1
    +1 −1 as one write, 🦃 and a double Save as one write with the sheet
    open (✓ Saved), P-day from 👥, a leg −1 by the organizer (one 📞
    answer, focus kept), an unanswered guest's pill pulsing the answer
    row with its toast counted, then her own days after Maybe (⚠🗓 in
    amber); on the 8-member trip with a 🎫: all seven weekdays, ⓘ (P-key
    over P-dates, every page counted, ‹ back), Save and 🔒 asking "⚠🎫×1
    Confirm", 🗑 and ↩ for an unsaved pick, ◷ Saving with the write held
    (focus on Save, no native disabled), ✓ Saved, and 🔒 / Save
    hit-tested at 360x740 and 375x667; a +1 then a Chromium reload
    (pagehide, then hidden): after another phone locked, no write as the
    page goes or from the reloaded page, which shows P-error 🔒 "Dates
    locked" (counted); on an open plan the reloaded page reads the trip
    and sends ONE update, drawn on its pill.
  - test-viewport: P-dates (the plan, a holiday, a start, my own days on
    one end), P-day, an undated idea with ⬚, a locked plan, P-person with
    the leg ±1, at 360/390/430, light and dark; P-dates now also at
    360x740 and 375x667 (9 states each, light and dark) with an occlusion
    gate: every control whose centre is in view takes the tap there
    (elementFromPoint), Save is opaque, 🔒 / 🔓 is in view.

Checked against deliberate mutations (scratch copies), each failing a
suite: every tap sent at once; no confirm on the trip view after a
booking; Save closing the sheet; 🔒 not guarded while its write is out (a
double tap unlocking again); a locked plan shiftable; a shift dropping
📌; the best window counting plan followers; P-day counting maybe as
there; own days for someone unanswered; the pill opening P-dates before
an answer; a holiday chip leaving 📌 alone; 🗓⊘ forgetting the window;
leg shifts not merged into one write; 🔓 asking nothing after a booking;
no datesHeld check on the fresh record (the stale +1 and the stale
P-dates Save go out, and the model cases fail); a pagehide that sends
the run from the doc read earlier (the stale-lock, booking, newer-answer
and kept-run cases fail); nothing kept on pagehide (the +1 is lost); a
next open that does not check the plan the run started from (B's newer
plan is overwritten); a next open with no booked guard (her days move
unasked); a run settled by a request aborted as the page went dropping
what was kept (the +1 is lost).

Decisions:
- A run of ±1 taps is one write: queued (and drawn) at the first tap so a
  refresh cannot bring the old plan back, sent SOON_MS (600ms) after the
  last tap, and at once when the page is hidden. P-dates' controls ignore
  taps (and say "Saving") while their write is out.
- A page being left never sends a write built from what it read earlier
  (no keepalive beacon): its run is kept on the phone and sent by the next
  open of the app from a fresh read, or by the page itself if it comes
  back from the back-forward cache. The cost: a ±1 left within 600ms
  lands on the next open, not at once, and a phone that never opens the
  app again never sends it. The next open sends it only while the record
  still holds what the run started from, so it never overwrites a newer
  plan or answer, and a run older than a day is dropped (it would land
  long after the tap that made it).
- Locked dates are protected on the record, not the screen: datesHeld in
  the model refuses a date delta on a chosen or closed record unless it
  unlocks in the same update; a booking that landed after the tap is
  re-checked by the app's guard, which asks for the confirm instead of
  sending.
- "One confirming tap per session" = per visit: per trip for the plan
  (and 🔓, 🗓⊘, ⬚), per person for their own days; leaving the trip view
  (or closing a P-dates opened from a card) asks again next time. A
  confirm already given counts for the write it was given for, even if
  the visit ends before that write goes.
- 🔒 keeps P-dates open (as Save, 🔓, 🗓⊘ and ⬚ do; the spec's lock flow
  does not need it closed): it then reads as the plan to read with 🔓 on
  the left, and taps in the sheet are swallowed for 400ms after it lands,
  so a quick second tap never lands on what replaced it.
- A picked end equal to the plan's own day on that side follows the plan
  (blank) unless it already was their own; days someone pinned to equal
  the plan stay theirs. So "arrive a day later" with ↔ moves the arrival
  only, and re-picking the plan after it moved follows it again.
- The organizer's tools sit above the grid (🔒 always in view); Save stays
  sticky and opaque with a fade above it; on a 375x667 phone the −7…+7 row
  of the 8-member trip is reached by scrolling, never shown through Save.
- Holiday chips are the next 4 holidays (the spec) from the month on show,
  not today: a March trip offers 🎗 🎆 🌭 🦃, and paging moves them along.
  P-new keeps its own chips (PIA-136's).
- Off-plan own days are allowed, so the P-dates readout marks them amber
  (⚠🗓 "Outside plan"); the board's face badge and bar end keep PIA-137's
  ⚠ (see Owed).
- An undated idea's window without 🌙 reads 🌙? and writes none until 🌙−
  / 🌙+ picks one (counting from 3).
- ⬚ takes the best window in one tap (one write, ↩ in the toast) rather
  than a preview and Save.
- The organizer setting someone else's days marks the answer 📞 (days are
  part of the answer), unlike PIA-137's airport and origin edits.
- P-day opens from P-dates (👥 then a day; any day of a plan to read); the
  Calendar's and the Map's ways in are PIA-143 / PIA-144.
- One end at a time ([🛬 | ↔ | 🛫]) only with a plan to follow for the
  other end; an undated idea's member sets both.
- In-members not there yet show a hollow dot on every flex-window day
  (the spec's dot rule), not only inside the plan; a cell draws at most 8
  dots, filled first.

Owed (needs a person, a device or a later ticket, not done here):
- The ±1 focus, the busy ◷ focus and the confirming taps with VoiceOver /
  TalkBack, and the pulses with reduced motion, on a real phone.
- A ±1 left within 600ms on real iOS Safari and Android Chrome (a tab
  closed, the app swiped away, a back-forward cache restore): kept and
  sent by the next open in Node (test-app) and on a desktop Chromium
  reload (test-words: a stale lock holds, an open plan moves); the
  swipe-away and the back-forward cache on a phone are not checked.
- A confirm given on a live run still holds for the whole run, as
  before; only a run sent by a later open checks the bookings against
  who had booked when it was given.
- When a plan move leaves someone's own days with no overlap at all, the
  move does not ask first and the heads ring still counts them in; the
  board's off-plan face badge and bar end are still red ⚠ (PIA-137's
  look): a design decision for the trip view.
- The board's last bar can sit under the sticky Share / ✈↗ bar until
  scrolled, and the Trips card title button measures 43px tall (its
  overlay makes the whole card the target): PIA-137's trip view and
  PIA-135's card.
- Widening a dated trip's flex window (⟦◀ ▶⟧) is P-cheapest's (PIA-141).
- The 2-person comprehension and icon checks listed in CLAUDE.md before
  cutover.

Refs PIA-138.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RQkvQeGePUWYEDnh9h7U5g
